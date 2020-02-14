const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const projectWalletAddress = holder;
const participant_1 = accounts[4];
const participant_2 = accounts[5];
const participant_3 = accounts[6];
const participant_4 = accounts[7];
const participant_5 = accounts[8];
const participant_6 = accounts[9];

const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 6450;

const ApplicationEventTypes = {
    NOT_SET:0,        // will match default value of a mapping result
    CONTRIBUTION_NEW:1,
    CONTRIBUTION_CANCEL:2,
    PARTICIPANT_CANCEL:3,
    COMMITMENT_ACCEPTED:4,
    WHITELIST_APPROVE:5,
    WHITELIST_REJECT:6,
    PROJECT_WITHDRAW:7
}

const TransferTypes = {
    NOT_SET:0,
    AUTOMATIC_RETURN:1,
    WHITELIST_REJECT:2,
    PARTICIPANT_CANCEL:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAW:5
}





const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let SnapShotKey = "CancelTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

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
            helpers, "RicoToken", {
                from: holder,
                arguments: [
                    setup.settings.token.supply.toString(),
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

        await TokenContractInstance.methods.setup(
            ReversibleICOAddress
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
        *   Add RICO Settings
        */
        currentBlock = await ReversibleICOInstance.methods.getCurrentBlockNumber().call();

        // starts in one day
        commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        commitPhaseBlockCount = blocksPerDay * 22;
        commitPhasePrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;
        StagePriceIncrease = helpers.solidity.ether * 0.0001;
        commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;

        BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );


        await ReversibleICOInstance.methods.init(
            TokenContractAddress,        // address _TokenContractAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            projectWalletAddress,          // address _projectWalletAddress
            commitPhaseStartBlock,                 // uint256 _StartBlock
            commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
            commitPhasePrice,            // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
        ).send({
            from: deployerAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenContractInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
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
    TokenContractInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenContractAddress);
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

            it("should return (false, false) as no participant actually exists", async function () {
                let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                expect(CancelStates[0]).to.be.equal(false);
                expect(CancelStates[1]).to.be.equal(false);
            });

        });


        describe("contract in commit phase", async function () {

            describe("participant has no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                });

                it("should return (true, false) => cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(true);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () {
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });
            });
        });

        describe("contract in buy phase", async function () {

            describe("participant has no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 5);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                });

                it("should return (true, false) => cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(true);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () {
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });

            });
        });

    });

    describe("transaction () => fallback method", async function () {

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () {

            let TestReversibleICO;

            before(async () => {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployerAddress, 0);
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
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
            });

            it("value >= rico.minContribution results in a new contribution", async function () {

                let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                expect(
                    afterContributionsCount.toString()
                ).to.be.equal(
                    (parseInt(initialContributionsCount) + 1).toString()
                );

            });

            it("value < rico.minContribution results in cancel(value), account has 2 contributions", async function () {

                const ParticipantAccountBalanceInitial = await helpers.utils.getBalance(helpers, participant_1);

                // contribute
                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                let ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                const ContributionTxCost = new helpers.BN( ContributionTx.gasUsed ).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );
                const ParticipantAccountBalanceAfterContribution = await helpers.utils.getBalance(helpers, participant_1);
                const ParticipantAccountBalanceAfterContributionValidation = new helpers.BN(
                    ParticipantAccountBalanceInitial
                ).sub(ContributionTxCost).sub(ContributionAmount);

                expect(
                    ParticipantAccountBalanceAfterContribution.toString()
                ).to.be.equal(
                    ParticipantAccountBalanceAfterContributionValidation.toString()
                );


                // validate contributions
                let ParticipantTotalStats = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();

                let ContributionTotals = new helpers.BN("0");

                for(let i = 0; i < StageCount; i++) {
                    const ParticipantStageDetails = await ReversibleICOInstance.methods.getParticipantDetailsByStage(participant_1, i).call();
                    ContributionTotals = ContributionTotals.add(new helpers.BN(
                        ParticipantStageDetails.stageCommittedETH
                    ));
                }

                expect(
                    ParticipantTotalStats.totalReceivedETH.toString()
                ).to.be.equal(
                    ContributionTotals.toString(),
                );


                // load minContribution from contract
                const minContribution = await ReversibleICOInstance.methods.minContribution().call();
                const CancelAmount = new helpers.BN(minContribution).sub(
                    new helpers.BN("1")
                );

                let cancelTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: CancelAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                const CancelTxCost = new helpers.BN( cancelTx.gasUsed ).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );
                const ParticipantAccountBalanceAfterCancel = await helpers.utils.getBalance(helpers, participant_1);
                const ParticipantAccountBalanceAfterCancelValidation = new helpers.BN(
                    ParticipantAccountBalanceAfterContributionValidation
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
                    cancelTx, 'ApplicationEvent(uint8,uint32,address,uint256)'
                );
                assert.equal(eventFilter.length, 1, 'ApplicationEvent event not received.');

                ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                // no additional contributions logged.
                expect(
                    afterContributionsCount.toString()
                ).to.be.equal(
                    initialContributionsCount.toString()
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
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployerAddress, 0);
            });

            it("0 value transaction reverts \"Contract must be initialized.\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversibleICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 1000000,
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
                        gas: 1000000,
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
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {
            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Whitelisting buyer should be successful", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });
    });

    describe("Check aggregated state after cancelled contribution", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {
            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Participant aggregated state should match sum over all stages", async function () {
            let participantCount = await ReversibleICOInstance.methods.participantCount().call();
            for (let p = 0; p < participantCount; p++) {
                let participant = await ReversibleICOInstance.methods.participantsById(p).call();

                let participantTotalReceivedETH = new helpers.BN("0");
                let participantReturnedETH = new helpers.BN("0");
                let participantCommittedETH = new helpers.BN("0");
                let participantWithdrawnETH = new helpers.BN("0");
                let participantAllocatedETH = new helpers.BN("0");
                let participantReservedTokens = new helpers.BN("0");
                let participantBoughtTokens = new helpers.BN("0");
                let participantReturnedTokens = new helpers.BN("0");

                // Calculate sum over all stages for participant
                for (let s = 0; s < StageCount; s++) {
                    const state = await ReversibleICOInstance.methods.getParticipantDetailsByStage(participant, s).call();

                    participantTotalReceivedETH = participantTotalReceivedETH.add(new helpers.BN(state.stageTotalReceivedETH));
                    participantReturnedETH = participantReturnedETH.add(new helpers.BN(state.stageReturnedETH));
                    participantCommittedETH = participantCommittedETH.add(new helpers.BN(state.stageCommittedETH));
                    participantWithdrawnETH = participantWithdrawnETH.add(new helpers.BN(state.stageWithdrawnETH));
                    participantAllocatedETH = participantAllocatedETH.add(new helpers.BN(state.stageAllocatedETH));
                    participantReservedTokens = participantReservedTokens.add(new helpers.BN(state.stageReservedTokens));
                    participantBoughtTokens = participantBoughtTokens.add(new helpers.BN(state.stageBoughtTokens));
                    participantReturnedTokens = participantReturnedTokens.add(new helpers.BN(state.stageReturnedTokens));
                }

                // Compare calculated sums against participantAggregatedStats
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant).call();
                expect(new helpers.BN(aggregated[0]))
                    .to.be.bignumber.equal(participantTotalReceivedETH, "aggregated.totalReceivedETH mismatch for participant " + p);
                expect(new helpers.BN(aggregated[1]))
                    .to.be.bignumber.equal(participantReturnedETH, "aggregated.returnedETH mismatch for participant " + p);
                expect(new helpers.BN(aggregated[2]))
                    .to.be.bignumber.equal(participantCommittedETH, "aggregated.committedETH mismatch for participant " + p);
                expect(new helpers.BN(aggregated[3]))
                    .to.be.bignumber.equal(participantWithdrawnETH, "aggregated.withdrawnETH mismatch for participant " + p);
                expect(new helpers.BN(aggregated[4]))
                    .to.be.bignumber.equal(participantAllocatedETH, "aggregated.allocatedETH mismatch for participant " + p);
                expect(new helpers.BN(aggregated[5]))
                    .to.be.bignumber.equal(participantReservedTokens, "aggregated.reservedTokens mismatch for participant " + p);
                expect(new helpers.BN(aggregated[6]))
                    .to.be.bignumber.equal(participantBoughtTokens, "aggregated.boughtTokens mismatch for participant " + p);
                expect(new helpers.BN(aggregated[7]))
                    .to.be.bignumber.equal(participantReturnedTokens, "aggregated.returnedTokens mismatch for participant " + p);
            }
        });
    });

    describe("Check global state after cancelled contribution", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);
        });

        it("Participant buys 1 tokens in phase 0", async function () {
            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Contract global state should match sum over all participants and stages", async function () {
            let globalTotalReceivedETH = new helpers.BN("0");
            let globalReturnedETH = new helpers.BN("0");
            let globalCommittedETH = new helpers.BN("0");
            let globalWithdrawnETH = new helpers.BN("0");
            let globalAllocatedETH = new helpers.BN("0");

            let participantCount = await ReversibleICOInstance.methods.participantCount().call();
            for (let p = 0; p < participantCount; p++) {
                let participant = await ReversibleICOInstance.methods.participantsById(p).call();

                for (let s = 0; s < StageCount; s++) {
                    const state = await ReversibleICOInstance.methods.getParticipantDetailsByStage(participant, s).call();

                    globalTotalReceivedETH = globalTotalReceivedETH.add(new helpers.BN(state.stageTotalReceivedETH));
                    globalReturnedETH = globalReturnedETH.add(new helpers.BN(state.stageReturnedETH));
                    globalCommittedETH = globalCommittedETH.add(new helpers.BN(state.stageCommittedETH));
                    globalWithdrawnETH = globalWithdrawnETH.add(new helpers.BN(state.stageWithdrawnETH));
                    globalAllocatedETH = globalAllocatedETH.add(new helpers.BN(state.stageAllocatedETH));
                }
            }

            // Compare calculated sums against global contract values
            expect(new helpers.BN(await ReversibleICOInstance.methods.totalReceivedETH().call()))
                .to.be.bignumber.equal(globalTotalReceivedETH, "ReversibleICO.totalReceivedETH mismatch");
            expect(new helpers.BN(await ReversibleICOInstance.methods.returnedETH().call()))
                .to.be.bignumber.equal(globalReturnedETH, "ReversibleICO.returnedETH mismatch");
            expect(new helpers.BN(await ReversibleICOInstance.methods.committedETH().call()))
                .to.be.bignumber.equal(globalCommittedETH, "ReversibleICO.committedETH mismatch");
            expect(new helpers.BN(await ReversibleICOInstance.methods.withdrawnETH().call()))
                .to.be.bignumber.equal(globalWithdrawnETH, "ReversibleICO.withdrawnETH mismatch");
            expect(new helpers.BN(await ReversibleICOInstance.methods.projectAllocatedETH().call()))
                .to.be.bignumber.equal(globalAllocatedETH, "ReversibleICO.projectAllocatedETH mismatch");
        });
    });

    describe("Cancelling before white-listing should not deliver too many tokens later", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);
        });

        it("Participant buys 900 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 900 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Participant gets whitelisted", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Participant buying 1 token should not get cancelled tokens", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });
    });
});


async function jumpToContractStage ( ReversibleICO, deployerAddress, stageId, end = false, addToBlockNumber = false ) {
    const stageData = await ReversibleICO.methods.Stages(stageId).call();
    let block = stageData.start_block;
    if(end) {
        block = stageData.end_block;
    }

    if(addToBlockNumber !== false) {
        block = parseInt(block) + parseInt(addToBlockNumber);
    }

    await ReversibleICO.methods.jumpToBlockNumber(
        block
    ).send({
        from: deployerAddress, gas: 100000
    });

    return block;
}
