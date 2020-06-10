const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const projectAddress = holder;
const participant_1 = accounts[4];
const participant_2 = accounts[5];
const participant_3 = accounts[6];
const participant_4 = accounts[7];
const participant_5 = accounts[8];
const participant_6 = accounts[9];

const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 6450;


const TransferTypes = {
    NOT_SET: 0,
    WHITELIST_REJECTED: 1,
    CONTRIBUTION_CANCELED: 2,
    CONTRIBUTION_ACCEPTED_OVERFLOW: 3,
    PARTICIPANT_WITHDRAW: 4,
    PARTICIPANT_WITHDRAW_OVERFLOW: 5,
    PROJECT_WITHDRAWN: 6
};





const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let SnapShotKey = "CancelTestInit";
let snapshotsEnabled = true;

const deployingAddress = accounts[0];
const whitelistingAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    commitPhaseStartBlock, commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock, TokenContractInstance,
    TokenContractReceipt, ReversibleICOInstance, ReversibleICOReceipt;

async function revertToFreshDeployment() {

    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }

    if (typeof snapshots[SnapShotKey] !== "undefined" && snapshotsEnabled) {
        // restore snapshot
        await helpers.web3.evm.revert(snapshots[SnapShotKey]);

        // save again because whomever wrote test rpc had the impression no one would ever restore twice.. dafuq
        snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();

        // reset account nonces..
        helpers.utils.resetAccountNonceCache(helpers);
    } else {

        /*
        *   Deploy Token Contract
        */

        TokenContractInstance = await helpers.utils.deployNewContractInstance(
            helpers, "ReversibleICOToken", {
                from: holder,
                arguments: [
                    setup.settings.token.name,
                    setup.settings.token.symbol,
                    defaultOperators
                ],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );
        TokenContractReceipt = TokenContractInstance.receipt;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        console.log("      TOKEN Gas used for deployment:", TokenContractInstance.receipt.gasUsed);
        console.log("      Contract Address:", TokenContractAddress);

        /*
        *   Deploy RICO Contract
        */
        ReversibleICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
        ReversibleICOReceipt = ReversibleICOInstance.receipt;
        ReversibleICOAddress = ReversibleICOInstance.receipt.contractAddress;
        // helpers.addresses.Rico = ReversibleICOAddress;

        console.log("      RICO Gas used for deployment: ", ReversibleICOInstance.receipt.gasUsed);
        console.log("      Contract Address:", ReversibleICOAddress);
        console.log("");

        await TokenContractInstance.methods.init(
            ReversibleICOAddress,
            holder, holder, holder,
            setup.settings.token.supply.toString()
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
        *   Add RICO Settings
        */
        currentBlock = await ReversibleICOInstance.methods.getCurrentEffectiveBlockNumber().call();

        await ReversibleICOInstance.methods.init(
            helpers.addresses.Token,                 // address _tokenAddress
            whitelistingAddress,                     // address _whitelistingAddress
            projectAddress,                          // address _freezerAddress
            projectAddress,                          // address _rescuerAddress
            projectAddress,                          // address _projectAddress
            setup.settings.startBlockDelay,                // uint256 _commitPhaseStartBlock
            setup.settings.buyPhaseStartBlock,             // uint256 _buyPhaseStartBlock,
            setup.settings.buyPhaseEndBlock,               // uint256 _buyPhaseEndBlock,
            setup.settings.commitPhasePrice,                        // uint256 _initialPrice in wei
            setup.settings.StageCount,                     // uint8   _stageCount
            setup.settings.stageTokenLimitIncrease,       // uint256 _stageTokenLimitIncrease
            setup.settings.StagePriceIncrease                       // uint256 _stagePriceIncrease in wei
        ).send({
            from: deployingAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenContractInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 200000
        });

        expect(
            await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());


        // create snapshot
        if (snapshotsEnabled) {
            snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenContractInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOToken", TokenContractAddress);
    TokenContractInstance.receipt = TokenContractReceipt;
    ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
    ReversibleICOInstance.receipt = ReversibleICOReceipt;

    // do some validation
    expect(
        await helpers.utils.getBalance(helpers, ReversibleICOAddress)
    ).to.be.bignumber.equal( new helpers.BN(0) );

    expect(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversibleICOInstance.methods.tokenSupply().call()
    ).to.be.equal(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    );
};

describe("Testing canceling", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("view getCancelModes(address participantAddress)", async function () {

        before(async function () {
            await revertToFreshDeployment();
        });

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () {

            it("should return (pendingEth = 0, contributions = 0) as no participant actually exists", async function () {
                let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                expect(participant.pendingETH).to.be.equal('0');
                expect(participant.contributions).to.be.equal('0');
            });

        });


        describe("contract in commit phase", async function () {

            describe("participant has no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);
                });

                it("should return 0", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.contributions).to.be.equal('0');
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                });

                it("should return (pendingEth = n, contributions = 1) => could cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.pendingETH).to.be.equal(ContributionAmount.toString());
                    expect(participant.contributions).to.be.equal('1');
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () {
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true
                    ).send({
                        from: whitelistingAddress
                    });

                });

                it("should return (pendingEth = 0, contributions = 1) => cancel by sending tokens back to contract", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.pendingETH).to.be.equal('0');
                    expect(participant.contributions).to.be.equal('1');
                });
            });
        });

        describe("contract in buy phase", async function () {

            describe("participant has no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);
                });

                it("should return (pendingEth = 0, contributions = 0)", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.pendingETH).to.be.equal('0');
                    expect(participant.contributions).to.be.equal('0');
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                });

                it("should return (pendingEth = n, contributions = 1) => could cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.pendingETH).to.be.equal(ContributionAmount.toString());
                    expect(participant.contributions).to.be.equal('1');
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () {
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true
                    ).send({
                        from: whitelistingAddress
                    });

                });

                it("should return (pendingEth = 0, contributions = 1) => cancel by sending tokens back to contract", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
                    expect(participant.pendingETH).to.be.equal('0');
                    expect(participant.contributions).to.be.equal('1');
                });

            });
        });

    });

    describe("transaction commit()", async function () {

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () {

            let TestReversibleICO;

            before(async () => {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployingAddress, 0);
            });

            it("0 value transaction reverts \"Contract must be initialized.\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: TestReversibleICO.receipt.contractAddress,
                        value: 0,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "Contract must be initialized.");

            });

            it("value > 0 transaction reverts \"Contract must be initialized.\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode( async () => {

                    await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: TestReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "Contract must be initialized.");

            });

        });

        describe("contract in commit phase", async function () {

            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);
            });

            it("calling commit() with ETH results in contribution", async function () {

                let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const initialContributions = ParticipantByAddress.contributions;

                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });

                ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const afterContributions = ParticipantByAddress.contributions;

                expect(
                    afterContributions.toString()
                ).to.be.equal(
                    (parseInt(initialContributions) + 1).toString()
                );

            });

            it("second contribution, account has 2 contributions", async function () {

                const ParticipantAccountBalanceInitial = await helpers.utils.getBalance(helpers, participant_1);
                const minContribution = await ReversibleICOInstance.methods.minContribution().call();

                // contribute
                const ContributionAmount = new helpers.BN(minContribution).add(
                    new helpers.BN("1")
                ); // larger than 0.001 eth
                let ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });

                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );
                const ParticipantAccountBalanceAfterContribution = await helpers.utils.getBalance(helpers, participant_1);
                const ParticipantAccountBalanceAfterContributionValidation = ParticipantAccountBalanceInitial
                    .sub(ContributionTxCost).sub(ContributionAmount);

                expect(
                    ParticipantAccountBalanceAfterContribution.toString()
                ).to.be.equal(
                    ParticipantAccountBalanceAfterContributionValidation.toString()
                );

                // validate contributions
                let ParticipantTotalStats = await ReversibleICOInstance.methods.participants(participant_1).call();

                expect(
                    ParticipantTotalStats.pendingETH.toString()
                ).to.be.equal(
                    ContributionAmount.add(new helpers.BN("1").mul( helpers.solidity.etherBN )).toString() // add both contributions
                );

            });

            it("value < rico.minContribution results in cancel of both contributions", async function () {

                const ParticipantAccountBalanceInitial = await helpers.utils.getBalance(helpers, participant_1);
                // load minContribution from contract
                const minContribution = await ReversibleICOInstance.methods.minContribution().call();
                const CancelAmount = new helpers.BN(minContribution).sub(
                    new helpers.BN("1")
                );

                // cancel, by calling fallback function with lower than minContribution
                let cancelTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: CancelAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                const CancelTxCost = new helpers.BN( cancelTx.gasUsed ).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                const ContributionTotals = new helpers.BN(minContribution).add(
                    new helpers.BN("1")
                ).add(new helpers.BN("1").mul( helpers.solidity.etherBN ))

                const ParticipantAccountBalanceAfterCancel = await helpers.utils.getBalance(helpers, participant_1);
                const ParticipantAccountBalanceAfterCancelValidation = new helpers.BN(
                    ParticipantAccountBalanceInitial
                ).sub(CancelTxCost)
                // cancel amount is returned already
                // contribution amount is returned
                .add(ContributionTotals);

                expect(
                    ParticipantAccountBalanceAfterCancel.toString()
                ).to.be.equal(
                    ParticipantAccountBalanceAfterCancelValidation.toString()
                );

                // validate fired events
                let eventFilter = helpers.utils.hasEvent(
                    cancelTx, 'TransferEvent(uint8,address,uint256)'
                );
                assert.equal(eventFilter.length, 1, 'TransferEvent event not received.');

                eventFilter = helpers.utils.hasEvent(
                    cancelTx, 'PendingContributionsCanceled(address,uint256,uint32)'
                );
                assert.equal(eventFilter.length, 1, 'ApplicationEvent event not received.');

                ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const afterContributions = ParticipantByAddress.contributions;

                // no additional contributions logged.
                expect(
                    afterContributions.toString()
                ).to.be.equal(
                    '2'
                );

            });
        });
    });

    describe("transaction cancel()", async function () {

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () {

            let TestReversibleICO;

            before(async () => {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployingAddress, 0);
            });

            it("0 value transaction reverts \"Contract must be initialized.\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversibleICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 2000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "Contract must be initialized.");

            });

            it("value > 0 transaction reverts \"Contract must be initialized.\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversibleICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 2000000,
                        gasPrice: helpers.networkConfig.gasPrice,
                        value: ContributionAmount.toString(), // amount will be refunded
                    });

                }, "Contract must be initialized.");

            });

        });

    });

    describe("Test whitelisting after cancelled contribution", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {
            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 2000000 });
        });

        it("Whitelisting buyer should be successful", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });
    });

    describe("Check aggregated state after cancelled contribution", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 2000000 });
        });

        it("Participant aggregated state should match", async function () {
            let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

            expect(participant.contributions).to.equal('1');
            expect(participant.pendingETH).to.equal('0');
            expect(participant.committedETH).to.equal('0');
            expect(participant.reservedTokens).to.equal('0');
        });
    });

    describe("Check global state after cancelled contribution", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant buys 1 tokens in phase 4", async function () {

            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 4);

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels in stage 5", async function () {
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 5);

            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 2000000 });
        });

        it("Participant aggregated state should match", async function () {
            let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

            expect(participant.contributions).to.equal('2');
            expect(participant.pendingETH).to.equal('0');
            expect(participant.committedETH).to.equal('0');
            expect(participant.reservedTokens).to.equal('0');
        });
    });

    describe("Cancelling before white-listing should not deliver too many tokens later", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Participant buys 900 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 900 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 2000000 });
        });

        it("Participant gets whitelisted", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Participant buying 1 token should not get cancelled tokens", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });
    });
});
