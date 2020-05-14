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


const deployingAddress = accounts[0];
const whitelistingAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    commitPhaseStartBlock, commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock, TokenContractInstance,
    TokenContractReceipt, ReversibleICOInstance, ReversibleICOReceipt;


const {
    validatorHelper,
    clone
} = require('./includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot,
} = require('./includes/deployment');

const testKey = "FlowTestInit";
const SnapShotKey = testKey;


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
            whitelistingAddress, // address _whitelistingAddress
            projectAddress,        // address _freezerAddress
            projectAddress,        // address _rescuerAddress
            projectAddress,          // address _projectAddress
            commitPhaseStartBlock,                 // uint256 _StartBlock
            commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
            commitPhasePrice,            // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
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

describe("Flow Testing", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("tokensReceived() - sending ERC777 tokens to rico contract", async function () {

        describe("0 - contract not initialized with settings", async function () {

            let TestReversibleICO;

            before(async function () {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployingAddress, 0);
            });

            describe("token sender is projectAddress", async function () {

                it("transaction reverts \"Contract must be initialized.\"", async function () {

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    await helpers.assertInvalidOpcode( async function () {

                        await TokenContractInstance.methods.send(
                            TestReversibleICO.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: projectAddress,
                            gas: 200000
                        });

                    }, "Contract must be initialized.");

                });
            });

            describe("token sender is deployingAddress", async function () {

                it("transaction reverts \"Contract must be initialized.\"", async function () {

                    helpers.utils.resetAccountNonceCache(helpers);

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to deployingAddress
                    await TokenContractInstance.methods.send(
                        deployingAddress,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 200000
                    });

                    await helpers.assertInvalidOpcode( async () => {

                        // deployingAddress transfers 100 tokens to rico before it is initialised.
                        await TokenContractInstance.methods.send(
                            TestReversibleICO.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: deployingAddress,
                            gas: 200000
                        });

                    }, "Contract must be initialized.");

                });
            });
        });

        describe("1 - contract initialized with settings", async function () {

            let TestReversibleICO, TestReversibleICOAddress, TestTokenContract, TestTokenContractAddress;

            before(async function () {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy everything except sending tokens to rico

                TestTokenContract = await helpers.utils.deployNewContractInstance(
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
                TestTokenContractAddress = TestTokenContract.receipt.contractAddress;

                /*
                *   Deploy RICO Contract
                */
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
                TestReversibleICOReceipt = TestReversibleICO.receipt;
                TestReversibleICOAddress = TestReversibleICO.receipt.contractAddress;

                await TestTokenContract.methods.init(
                    TestReversibleICOAddress,
                    holder, holder, holder,
            setup.settings.token.supply.toString()
                ).send({
                    from: holder,  // initial token supply holder
                });

                /*
                *   Add RICO Settings
                */
                currentBlock = await TestReversibleICO.methods.getCurrentEffectiveBlockNumber().call();

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

                // for validation
                BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );

                await TestReversibleICO.methods.init(
                    TestTokenContractAddress,    // address _TokenContractAddress
                    whitelistingAddress, // address _whitelistingAddress
                    projectAddress,        // address _freezerAddress
                    projectAddress,        // address _rescuerAddress
                    projectAddress,       // address _projectAddress
                    commitPhaseStartBlock,                 // uint256 _StartBlock
                    commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
                    commitPhasePrice,            // uint256 _commitPhasePrice in wei
                    StageCount,                 // uint8   _StageCount
                    StageBlockCount,            // uint256 _StageBlockCount
                    StagePriceIncrease          // uint256 _StagePriceIncrease in wei
                ).send({
                    from: deployingAddress,  // deployer
                    gas: 3000000
                });

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployingAddress, 0);
            });

            describe("using configured token", async function () {

                describe("token sender is projectAddress", async function () {

                    it("token amount is accepted and TokenSupply is correct", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        await TestTokenContract.methods.send(
                            TestReversibleICOAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: projectAddress,
                            gas: 200000
                        });

                        expect(
                            await TestReversibleICO.methods.tokenSupply().call()
                        ).to.be.equal(
                            testAmount
                        );

                    });
                });

                describe("token sender is deployingAddress ", async function () {

                    it("transaction reverts \"You can not withdraw, you have no locked tokens.\"", async function () {

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        // transfer 100 tokens to deployingAddress
                        await TestTokenContract.methods.send(
                            deployingAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: holder,
                            gas: 200000
                        });

                        await helpers.assertInvalidOpcode( async () => {

                            // deployingAddress transfers 100 tokens to rico after it is initialised.
                            await TestTokenContract.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: deployingAddress,
                                gas: 200000
                            });

                        }, "You can not withdraw, you have no locked tokens.");

                    });

                });

            });

            describe("using different token", async function () {

                describe("token sender is projectAddress", async function () {

                    it("transaction reverts \"Invalid token contract sent tokens.\"", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        await helpers.assertInvalidOpcode( async () => {

                            await TokenContractInstance.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: projectAddress,
                                gas: 200000
                            });

                        }, "Invalid token contract sent tokens.");

                    });
                });

                describe("token sender is deployingAddress ", async function () {

                    it("transaction reverts \"Invalid token contract sent tokens.\"", async function () {

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        // transfer 100 tokens to deployingAddress
                        await TokenContractInstance.methods.send(
                            deployingAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: holder,
                            gas: 200000
                        });

                        await helpers.assertInvalidOpcode( async () => {

                            // deployingAddress transfers 100 tokens to rico after it is initialised.
                            await TokenContractInstance.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: deployingAddress,
                                gas: 200000
                            });

                        }, "Invalid token contract sent tokens.");

                    });

                });

            });

        });

        describe("2 - contract in commit phase", async function () {

            describe("participant is not whitelisted and has no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);
                });

                it("Participant should have pendingEth = 0 and contributions = 0", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

                    expect(participant.contributions).to.equal('0');
                    expect(participant.pendingETH).to.equal('0');
                });

                it("sending tokens to Rico reverts \"You can not withdraw, you have no locked tokens.\"", async function () {

                    // our participant somehow got some tokens that they then attempt to send for withdraw

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to participant_1
                    await TokenContractInstance.methods.send(
                        participant_1,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 200000
                    });

                    const ParticipantTokenBalance = new BN(
                        await TokenContractInstance.methods.balanceOf(participant_1).call()
                    );

                    expect(
                        ParticipantTokenBalance
                    ).to.be.bignumber.equal(
                        testAmount
                    );

                    await helpers.assertInvalidOpcode( async () => {

                        // transfer tokens to Rico for withdraw
                        await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: participant_1,
                            gas: 500000
                        });

                    }, "You can not withdraw, you have no locked tokens.");

                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    const newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                });

                it("Participant should have pendingEth = n and contributions = 1", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

                    expect(participant.pendingETH).to.equal('1000000000000000000000');
                    expect(participant.contributions).to.equal('1');
                });

                it("sending tokens to Rico reverts \"You can not withdraw, you have no locked tokens.\"", async function () {

                    // our participant somehow got some tokens that they then attempt to send for withdraw

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to participant_1
                    await TokenContractInstance.methods.send(
                        participant_1,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 200000
                    });

                    const ParticipantTokenBalance = new BN(
                        await TokenContractInstance.methods.balanceOf(participant_1).call()
                    );

                    expect(
                        ParticipantTokenBalance
                    ).to.be.bignumber.equal(
                        testAmount
                    );

                    await helpers.assertInvalidOpcode( async () => {

                        // transfer tokens to Rico for withdraw
                        await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: participant_1,
                            gas: 500000
                        });

                    }, "You can not withdraw, you have no locked tokens.");

                });
            });


            describe("participant is whitelisted and has 2 contributions", async function () {

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
                        true,
                    ).send({
                        from: whitelistingAddress
                    });

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                });

                it("Participant should have pendingEth = 0 and contributions = 2", async function () {
                    let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

                    expect(participant.pendingETH).to.equal('0');
                    expect(participant.contributions).to.equal('2');
                });


                it("participant can withdraw by sending tokens back to contract", async function () {

                    const TestParticipantAddress = participant_1;
                    const ShouldHaveLockedAmount = new BN("0");
                    const ReturnTokenAmount = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    const ParticipantboughtTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    // if in commit stage (0) then unlocked need to be 0
                    expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.equal( new BN("0") );

                    const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );

                    const ParticipantTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    // Must have a token balance
                    expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    const ParticipantreservedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // locked + unlocked = balance
                    expect(
                        ParticipantreservedTokenBalanceBefore.add(
                            ParticipantboughtTokenBalanceBefore
                        )
                    ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                    // calculate how much eth we should be receiving for the tokens we're sending
                    const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                        helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                    );

                    // send full token balance back to rico
                    let withdrawTx = await TokenContractInstance.methods.send(
                        ReversibleICOInstance.receipt.contractAddress,
                        ReturnTokenAmount.toString(),
                        ERC777data
                    ).send({
                        from: TestParticipantAddress,
                        gas: 2000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    const ParticipantreservedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantboughtTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                    );

                    /*
                    * Validation
                    */

                    // ETH: validate participant eth balances
                    let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                        // subtract transaction cost
                        .sub(txGasCost)
                        // add withdrawn eth amount
                        .add(withdrawCalculatedBefore.eth);
                    expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                    // ETH: validate contract eth balances
                    let ContractBalanceAfterValidation = ContractBalanceBefore
                        // subtract withdrawn eth amount
                        .sub(withdrawCalculatedBefore.eth);
                    expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                    // Tokens: validate participant token balances
                    let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                        // subtract tokens that were accepted for return
                        .sub( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                    // Tokens: validate contract token balances
                    let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                        // add tokens that were accepted for return
                        .add( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                    // Tokens: locked validation
                    let ParticipantreservedTokenBalanceAfterValidation = ParticipantreservedTokenBalanceBefore
                        .sub(withdrawCalculatedBefore.withdrawn_tokens)
                    expect( ParticipantreservedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfterValidation );

                    // Tokens: unlocked validation - the same
                    expect( ParticipantboughtTokenBalanceAfter ).to.be.bignumber.equal( ParticipantboughtTokenBalanceBefore );

                    expect( ShouldHaveLockedAmount ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfter );
                });
            });
        });

        describe("3 - contract in buy phase ( stage 6 - last block )", async function () {

            describe("participant is whitelisted and has 3 contributions ( 1 in stage 0 / 1 in stage 1 / 1 in stage 6 )", async function () {

                const TestParticipantAddress = participant_1;

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipantAddress,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [TestParticipantAddress],
                        true,
                    ).send({
                        from: whitelistingAddress
                    });

                    // beginning of stage 1 + 1 block
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipantAddress,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // end of stage 6
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 6, true, 0);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipantAddress,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        // data: '0x3c7a3aff', // commit() // dont use the commit function the second time
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                });

                describe("participant can withdraw a small amount of eth by sending tokens back to contract - test breakdown", async function () {

                    const stageId = 6;
                    let OneEthAmount,
                        ReturnTokenAmount,
                        ParticipantboughtTokenBalanceBefore,
                        ContractBalanceBefore,
                        ParticipantBalanceBefore,
                        ContractTokenBalanceBefore,
                        ParticipantTokenBalanceBefore,
                        ParticipantreservedTokenBalanceBefore,
                        withdrawCalculatedBefore,
                        withdrawTx,
                        txGasCost
                    ;

                    before(async () => {
                        OneEthAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );

                        // return 1 eth worth of tokens in current stage ( 6 )
                        ReturnTokenAmount = new BN(
                            await helpers.utils.getTokenAmountForEthAtStage(
                                helpers,
                                ReversibleICOInstance,
                                OneEthAmount,
                                stageId
                            )
                        );
                    });

                    it("Participant should have pendingEth = 0 and contributions = 3", async function () {
                        let participant = await ReversibleICOInstance.methods.participants(participant_1).call();

                        expect(participant.pendingETH).to.equal('0');
                        expect(participant.contributions).to.equal('3');
                    });


                    it("Saving participant and contract values before transaction.. ", async function () {

                        ParticipantboughtTokenBalanceBefore = new BN(
                            await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                        );

                        // since we're in a later stage, unlocked need to be above 0
                        expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                        ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                        ContractTokenBalanceBefore = new BN(
                            await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                        );

                        ParticipantTokenBalanceBefore = new BN(
                            await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                        );
                        // Must have a token balance
                        expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                        ParticipantreservedTokenBalanceBefore = new BN(
                            await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                        );

                        // locked + unlocked = balance
                        expect(
                            ParticipantreservedTokenBalanceBefore.add(
                                ParticipantboughtTokenBalanceBefore
                            )
                        ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                    });


                    it("withdraw calculation - ETH is 0.847913862718707930 ETH", async function () {

                        // calculate how much eth we should be receiving for the tokens we're sending
                        withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                            helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                        );

                        // console.log(await ReversibleICOInstance.methods.getCurrentStage().call());

                        expect(withdrawCalculatedBefore.eth).to.be.bignumber.equal('847913862718707930');
                    });

                    it("withdraw calculation - withdrawn_tokens equals one ETH worth of tokens ", async function () {

                        const tokenAmountForOneEthAtStage = await helpers.utils.getTokenAmountForEthAtStage(
                            helpers, 
                            ReversibleICOInstance,
                            OneEthAmount,
                            stageId
                        );

                        expect(withdrawCalculatedBefore.withdrawn_tokens).to.be.bignumber.equal(tokenAmountForOneEthAtStage);
                    });

                    it("Transaction: Participant sends one eth worth of tokens back to contract", async function () {

                        withdrawTx = await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            ReturnTokenAmount.toString(),
                            ERC777data
                        ).send({
                            from: TestParticipantAddress,
                            gas: 2000000,
                            gasPrice: helpers.networkConfig.gasPrice
                        });

                        txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                            new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                        );
                    });

                    it("Validating Contract - ETH balance", async function () {
                        const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        // ETH: validate contract eth balances
                        let ContractBalanceAfterValidation = ContractBalanceBefore
                            // subtract withdrawn eth amount
                            .sub(withdrawCalculatedBefore.eth);
                        expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );
                    });

                    it("Validating Participant - ETH balance", async function () {
                        const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);
                        // ETH: validate participant eth balances
                        let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                            // subtract transaction cost
                            .sub(txGasCost)
                            // add withdrawn eth amount
                            .add(withdrawCalculatedBefore.eth);

                        // TODO: in case of rounding errors
                        // if( ParticipantBalanceAfter.lt(ParticipantBalanceAfterValidation) ) {
                        //     expect(ParticipantBalanceAfter).to.be.bignumber.equal( ParticipantBalanceAfterValidation.sub( new helpers.BN("1") ));
                        // } else {
                        //     expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );
                        // }

                        expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );
                    });

                    it("Validating Contract - Token balance", async function () {
                        const ContractTokenBalanceAfter = new BN(
                            await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                        );

                        // Tokens: validate contract token balances
                        let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                            // add tokens that were accepted for return
                            .add( withdrawCalculatedBefore.withdrawn_tokens );

                        expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );
                    });

                    it("Validating Participant - Token balance", async function () {
                        const ParticipantTokenBalanceAfter = new BN(
                            await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                        );
                        let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                            // subtract tokens that were accepted for return
                            .sub( withdrawCalculatedBefore.withdrawn_tokens );
                        expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );
                    });

                    it("Validating Participant - Locked Token balance", async function () {

                        const ParticipantTokenBalanceAfter = new BN(
                            await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                        );

                        const ParticipantreservedTokenBalanceAfter = new BN(
                            await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                        );

                        

                        // Tokens: locked validation
                        let ParticipantreservedTokenBalanceAfterValidation = ParticipantreservedTokenBalanceBefore
                            .sub(withdrawCalculatedBefore.withdrawn_tokens);


                        // console.log("ParticipantTokenBalanceBefore:               ", ParticipantTokenBalanceBefore.toString());
                        // console.log("ParticipantTokenBalanceAfter:                ", ParticipantTokenBalanceAfter.toString());
                        //
                        // console.log("ParticipantreservedTokenBalanceBefore:          ", ParticipantreservedTokenBalanceBefore.toString());
                        // console.log("withdrawCalculatedBefore.withdrawn_tokens:       ", withdrawCalculatedBefore.withdrawn_tokens.toString());
                        // console.log("ParticipantreservedTokenBalanceAfterValidation: ", ParticipantreservedTokenBalanceAfterValidation.toString());
                        // console.log("ParticipantreservedTokenBalanceAfter:           ", ParticipantreservedTokenBalanceAfter.toString());
                        //

                        // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 7 );

                        expect( ParticipantreservedTokenBalanceAfter.toString() )
                            .to.be.equal( 
                                ParticipantreservedTokenBalanceAfterValidation.toString(),
                                "Validation: Participant Locked TokenBalance After" 
                            );
                    });

                    it("Validating Participant - Unlocked Token balance", async function () {
                        const ParticipantboughtTokenBalanceAfter = new BN(
                            await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                        );

                        expect( ParticipantboughtTokenBalanceAfter ).to.be.bignumber.equal( ParticipantboughtTokenBalanceBefore );

                    });

                });

                // describe("participant can withdraw by sending tokens back to contract", async function () {

                //     it("participant can withdraw by sending tokens back to contract", async function () {

                //         const ShouldHaveLockedAmount = new BN("0");
                //         const ReturnTokenAmount = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );

                //         const ParticipantboughtTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                //         );

                //         // since we're in a later stage, unlocked need to be above 0
                //         expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );


                //         const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );

                //         const ParticipantTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );
                //         // Must have a token balance
                //         expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                //         const ParticipantreservedTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                //         );

                //         // locked + unlocked = balance
                //         expect(
                //             ParticipantreservedTokenBalanceBefore.add(
                //                 ParticipantboughtTokenBalanceBefore
                //             )
                //         ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                //         // calculate how much eth we should be receiving for the tokens we're sending
                //         const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                //             helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                //         );

                //         // console.log("withdrawCalculatedBefore:           ", withdrawCalculatedBefore);
                //         // console.log("returnValues.eth:                   ", helpers.utils.toEth(helpers, withdrawCalculatedBefore.eth));
                //         // console.log("returnValues.project_allocated_eth: ", helpers.utils.toEth(helpers, withdrawCalculatedBefore.project_allocated_eth));
                //         // console.log("returnValues.withdrawn_tokens:      ", helpers.utils.toEth(helpers, withdrawCalculatedBefore.withdrawn_tokens));
                //         // console.log("returnValues.returned_tokens:       ", helpers.utils.toEth(helpers, withdrawCalculatedBefore.returned_tokens));
                //         // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 6 );

                //         // send full token balance back to rico
                //         let withdrawTx = await TokenContractInstance.methods.send(
                //             ReversibleICOInstance.receipt.contractAddress,
                //             ReturnTokenAmount.toString(),
                //             ERC777data
                //         ).send({
                //             from: TestParticipantAddress,
                //             gas: 2000000,
                //             gasPrice: helpers.networkConfig.gasPrice
                //         });

                //         const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );
                //         const ParticipantTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );
                //         const ParticipantreservedTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                //         );
                //         const ParticipantboughtTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                //         );

                //         let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                //             new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                //         );

                //         /*
                //         * Validation
                //         */
                //         // ETH: validate participant eth balances
                //         let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                //             // subtract transaction cost
                //             .sub(txGasCost)
                //             // add withdrawn eth amount
                //             .add(withdrawCalculatedBefore.eth);

                //         expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                //         // ETH: validate contract eth balances
                //         let ContractBalanceAfterValidation = ContractBalanceBefore
                //             // subtract withdrawn eth amount
                //             .sub(withdrawCalculatedBefore.eth);
                //         expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                //         // Tokens: validate participant token balances
                //         let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                //             // subtract tokens that were accepted for return
                //             .sub( withdrawCalculatedBefore.withdrawn_tokens );
                //         expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                //         // Tokens: validate contract token balances
                //         let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                //             // add tokens that were accepted for return
                //             .add( withdrawCalculatedBefore.withdrawn_tokens );
                //         expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                //         // Tokens: locked validation
                //         let ParticipantreservedTokenBalanceAfterValidation = ParticipantreservedTokenBalanceBefore
                //             .sub(withdrawCalculatedBefore.withdrawn_tokens)
                //         expect( ParticipantreservedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfterValidation );

                //         // Tokens: unlocked validation - the same
                //         expect( ParticipantboughtTokenBalanceAfter ).to.be.bignumber.equal( ParticipantboughtTokenBalanceBefore );

                //         expect( ShouldHaveLockedAmount ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfter );

                //         // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 7 );
                //     });
                // });

                // describe("participant can contribute again", async function () {

                //     it("participant can contribute again", async function () {

                //         const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                //         let ParticipantByAddress = await ReversibleICOInstance.methods.participants(TestParticipantAddress).call();
                //         const initialContributions = ParticipantByAddress.contributions;

                //         const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );
                //         const ParticipantTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );

                //         let currentStage = await ReversibleICOInstance.methods.getCurrentStage().call();
                //         const expectedTokenAmount = await helpers.utils.getTokenAmountForEthAtStage(
                //             helpers, ReversibleICOInstance, ContributionAmount, parseInt(currentStage)
                //         );

                //         let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                //             from: TestParticipantAddress,
                //             to: ReversibleICOInstance.receipt.contractAddress,
                //             value: ContributionAmount.toString(),
                //             data: '0x3c7a3aff', // commit()
                //             gasPrice: helpers.networkConfig.gasPrice
                //         });

                //         ParticipantByAddress = await ReversibleICOInstance.methods.participants(TestParticipantAddress).call();
                //         const afterContributions = ParticipantByAddress.contributions;

                //         expect(
                //             afterContributions.toString()
                //         ).to.be.equal(
                //             (parseInt(initialContributions) + 1).toString()
                //         );

                //         const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );
                //         const ParticipantTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );

                //         let txGasCost = new helpers.BN(newContributionTx.gasUsed).mul(
                //             new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                //         );

                //         /*
                //         * Validation
                //         */
                //         // ETH: validate participant eth balances
                //         let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                //             // subtract transaction cost
                //             .sub(txGasCost)
                //             // subtract contribution eth amount
                //             .sub(ContributionAmount);
                //         expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                //         // ETH: validate contract eth balances
                //         let ContractBalanceAfterValidation = ContractBalanceBefore
                //             // add contribution eth amount
                //             .add(ContributionAmount);
                //         expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                //         // Tokens: validate participant token balances
                //         let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                //             // add tokens that we expect to receive
                //             .add( expectedTokenAmount );
                //         expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                //         // Tokens: validate contract token balances
                //         let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                //             // add tokens that were allocated
                //             .sub( expectedTokenAmount );
                //         expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );


                //     });
                // });

                // describe("participant can withdraw again", async function () {


                //     it("participant can withdraw again", async function () {

                //         const ShouldHaveLockedAmount = new BN("0");
                //         const ReturnTokenAmount = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );

                //         const ParticipantboughtTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                //         );

                //         // since we're in a later stage, unlocked need to be above 0
                //         expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );


                //         const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );

                //         const ParticipantTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );
                //         // Must have a token balance
                //         expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                //         const ParticipantreservedTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                //         );

                //         // locked + unlocked = balance
                //         expect(
                //             ParticipantreservedTokenBalanceBefore.add(
                //                 ParticipantboughtTokenBalanceBefore
                //             )
                //         ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                //         // calculate how much eth we should be receiving for the tokens we're sending
                //         const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                //             helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                //         );

                //         // send full token balance back to rico
                //         let withdrawTx = await TokenContractInstance.methods.send(
                //             ReversibleICOInstance.receipt.contractAddress,
                //             ReturnTokenAmount.toString(),
                //             ERC777data
                //         ).send({
                //             from: TestParticipantAddress,
                //             gas: 2000000,
                //             gasPrice: helpers.networkConfig.gasPrice
                //         });

                //         const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                //         const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                //         const ContractTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                //         );
                //         const ParticipantTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );
                //         const ParticipantreservedTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                //         );
                //         const ParticipantboughtTokenBalanceAfter = new BN(
                //             await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                //         );

                //         let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                //             new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                //         );

                //         /*
                //         * Validation
                //         */
                //         // ETH: validate participant eth balances
                //         let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                //             // subtract transaction cost
                //             .sub(txGasCost)
                //             // add withdrawn eth amount
                //             .add(withdrawCalculatedBefore.eth);
                //         expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                //         // ETH: validate contract eth balances
                //         let ContractBalanceAfterValidation = ContractBalanceBefore
                //             // subtract withdrawn eth amount
                //             .sub(withdrawCalculatedBefore.eth);
                //         expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                //         // Tokens: validate participant token balances
                //         let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                //             // subtract tokens that were accepted for return
                //             .sub( withdrawCalculatedBefore.withdrawn_tokens );
                //         expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                //         // Tokens: validate contract token balances
                //         let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                //             // add tokens that were accepted for return
                //             .add( withdrawCalculatedBefore.withdrawn_tokens );
                //         expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                //         // Tokens: locked validation
                //         let ParticipantreservedTokenBalanceAfterValidation = ParticipantreservedTokenBalanceBefore
                //             .sub(withdrawCalculatedBefore.withdrawn_tokens)
                //         expect( ParticipantreservedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfterValidation );

                //         // Tokens: unlocked validation - the same
                //         expect( ParticipantboughtTokenBalanceAfter ).to.be.bignumber.equal( ParticipantboughtTokenBalanceBefore );

                //         expect( ShouldHaveLockedAmount ).to.be.bignumber.equal( ParticipantreservedTokenBalanceAfter );

                //         // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 7 );
                //     });
                // });

                // describe("sending unlocked tokens to Rico reverts \"You can not withdraw, you have no locked tokens.\"", async function () {

                //     it("sending unlocked tokens to Rico reverts \"You can not withdraw, you have no locked tokens.\"", async function () {

                //         const ReturnTokenAmount = new BN(
                //             await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                //         );

                //         const ParticipantboughtTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                //         );
                //         const ParticipantreservedTokenBalanceBefore = new BN(
                //             await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                //         );

                //         // since we're in a later stage, unlocked need to be above 0
                //         expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                //         // since we already sent back all our tokens.. we should have 0 locked remaining
                //         expect( ParticipantreservedTokenBalanceBefore ).to.be.bignumber.equal( new BN("0") );

                //         await helpers.assertInvalidOpcode( async () => {
                //             // attempt to send full token balance back to rico
                //             let withdrawTx = await TokenContractInstance.methods.send(
                //                 ReversibleICOInstance.receipt.contractAddress,
                //                 ReturnTokenAmount.toString(),
                //                 ERC777data
                //             ).send({
                //                 from: TestParticipantAddress,
                //                 gas: 2000000,
                //                 gasPrice: helpers.networkConfig.gasPrice
                //             });
                //         }, "You can not withdraw, you have no locked tokens.");

                //     });
                // });
            });
        });

        // describe("4 - contract after buy phase", async function () {

        //     describe("participant is whitelisted and has 3 contributions ( 1 in stage 0 / 1 in stage 1 / 1 in stage 6 )", async function () {
        //         const TestParticipantAddress = participant_1;
        //         before(async () => {
        //             await revertToFreshDeployment();
        //             currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

        //             const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

        //             let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
        //                 from: TestParticipantAddress,
        //                 to: ReversibleICOInstance.receipt.contractAddress,
        //                 value: ContributionAmount.toString(),
        //                 data: '0x3c7a3aff', // commit()
        //                 gasPrice: helpers.networkConfig.gasPrice
        //             });

        //             // whitelist and accept contribution
        //             let whitelistTx = await ReversibleICOInstance.methods.whitelist(
        //                 [TestParticipantAddress],
        //                 true,
        //             ).send({
        //                 from: whitelistingAddress
        //             });

        //             currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 1, false, 1);

        //             newContributionTx = await helpers.web3Instance.eth.sendTransaction({
        //                 from: TestParticipantAddress,
        //                 to: ReversibleICOInstance.receipt.contractAddress,
        //                 value: ContributionAmount.toString(),
        //                 data: '0x3c7a3aff', // commit()
        //                 gasPrice: helpers.networkConfig.gasPrice
        //             });

        //             currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 6, true, 0);

        //             newContributionTx = await helpers.web3Instance.eth.sendTransaction({
        //                 from: TestParticipantAddress,
        //                 to: ReversibleICOInstance.receipt.contractAddress,
        //                 value: ContributionAmount.toString(),
        //                 data: '0x3c7a3aff', // commit()
        //                 gasPrice: helpers.networkConfig.gasPrice
        //             });

        //             helpers.utils.resetAccountNonceCache(helpers);

        //             currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 12, true, 1);
        //         });

        //         it("getCancelModes() returns (false, false)", async function () {
        //                                let participant = await ReversibleICOInstance.methods.participants(participant_1).call();
        //
        //                     expect(participant.pendingETH).to.equal('0');
        //                     expect(participant.contributions).to.equal('0');
        //         });

        //         it("sending unlocked tokens to Rico reverts \"Withdraw not possible. Buy phase ended.\"", async function () {

        //             const TestParticipantAddress = TestParticipantAddress;
        //             const ReturnTokenAmount = new BN(
        //                 await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
        //             );

        //             const ParticipantboughtTokenBalanceBefore = new BN(
        //                 await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
        //             );
        //             const ParticipantreservedTokenBalanceBefore = new BN(
        //                 await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
        //             );

        //             // since we're in a later stage, unlocked need to be above 0
        //             expect( ParticipantboughtTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

        //             // since we already sent back all our tokens.. we should have 0 locked remaining
        //             expect( ParticipantreservedTokenBalanceBefore ).to.be.bignumber.equal( new BN("0") );

        //             await helpers.assertInvalidOpcode( async () => {
        //                 // attempt to send full token balance back to rico
        //                 let withdrawTx = await TokenContractInstance.methods.send(
        //                     ReversibleICOInstance.receipt.contractAddress,
        //                     ReturnTokenAmount.toString(),
        //                     ERC777data
        //                 ).send({
        //                     from: TestParticipantAddress,
        //                     gas: 2000000,
        //                     gasPrice: helpers.networkConfig.gasPrice
        //                 });
        //             }, "Withdraw not possible. Buy phase ended.");

        //         });
        //     });
        // });
    });


});

async function displayTokensForParticipantAtStage(start, blocks, contract, deployingAddress, participant, stage, end = false, after = false) {
    let currentBlock = await helpers.utils.jumpToContractStage ( contract, deployingAddress, stage, end, after );

    let ParticipantsByAddress = await contract.methods.ParticipantsByAddress(participant).call();
    let totalTokens = ParticipantsByAddress.token_amount;

    let diffBlock = (currentBlock - start);

    let tx1 = await contract.methods.getParticipantReservedTokens(participant).send({from: deployingAddress });
    let amount1 = await contract.methods.getParticipantReservedTokens(participant).call();

    console.log("stage ["+stage+"] ( "+ diffBlock + " )");

    console.log("participant: ", participant);
    console.log("gas V:   ", tx1.gasUsed);
    console.log("amount:  ", helpers.utils.toFullToken(helpers, new helpers.BN(amount1) ));
    console.log("tokensV3:", helpers.utils.toFullToken(
            helpers, helpers.utils.calculatereservedTokensAtBlockForBoughtAmount(helpers, diffBlock, blocks, totalTokens)
        )
    );

    const ratioA = await contract.methods.getCurrentGlobalUnlockRatio(20).call();
    const ratioC = helpers.utils.getCurrentGlobalUnlockRatio(helpers, diffBlock, blocks, 20);
    console.log("ratioA:   ", helpers.utils.toFullToken(helpers, ratioA));
    console.log("ratioC:   ", helpers.utils.toFullToken(helpers, ratioC));
}


async function displayContractStats(contract, TokenContractInstance) {

    let maxEth = await contract.methods.committableEthAtStage().call();
    let totalSentETH = await contract.methods.totalSentETH().call();
    let returnedETH = await contract.methods.returnedETH().call();
    let committedETH = await contract.methods.committedETH().call();
    let contributorsETH = await contract.methods.contributorsETH().call();
    let projectETH = await contract.methods.projectETH().call();
    let projectWithdrawnETH = await contract.methods.projectWithdrawnETH().call();
    let ricoTokenBalance = await TokenContractInstance.methods.balanceOf(contract.receipt.contractAddress).call();

    console.log("ricoTokenBalance:   ", helpers.utils.toEth(helpers, ricoTokenBalance) + " tokens");
    console.log("maxEth:             ", helpers.utils.toEth(helpers, maxEth) + " eth");
    console.log("totalSentETH:        ", helpers.utils.toEth(helpers,totalSentETH) + " eth");
    console.log("returnedETH:        ", helpers.utils.toEth(helpers,returnedETH) + " eth");
    console.log("committedETH:        ", helpers.utils.toEth(helpers,committedETH) + " eth");
    console.log("contributorsETH:    ", helpers.utils.toEth(helpers,contributorsETH) + " eth");
    console.log("projectETH:         ", helpers.utils.toEth(helpers,projectETH) + " eth");
    console.log("projectWithdrawnETH:", helpers.utils.toEth(helpers,projectWithdrawnETH) + " eth");
    console.log("\n");
}
