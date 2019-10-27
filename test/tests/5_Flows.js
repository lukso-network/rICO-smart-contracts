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
    WHITELIST_CANCEL:4,
    WHITELIST_ACCEPT:5,
    COMMIT_ACCEPT:6,
    ACCEPT:7,
    REJECT:8,
    CANCEL:9
}

const TransferTypes = {
    NOT_SET:0,
    AUTOMATIC_RETURN:1,
    WHITELIST_CANCEL:2,
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

let SnapShotKey = "FlowTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

let TokenTrackerAddress, ReversibleICOAddress, stageValidation = [], currentBlock, 
    StartBlock, AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, EndBlock, TokenTrackerInstance, 
    TokenTrackerReceipt, ReversibleICOInstance, ReversibleICOReceipt;

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
       
        TokenTrackerInstance = await helpers.utils.deployNewContractInstance(
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
        TokenTrackerReceipt = TokenTrackerInstance.receipt;
        TokenTrackerAddress = TokenTrackerInstance.receipt.contractAddress;
        console.log("      TOKEN Gas used for deployment:", TokenTrackerInstance.receipt.gasUsed);
        console.log("      Contract Address:", TokenTrackerAddress);

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

        await TokenTrackerInstance.methods.setup(
            ReversibleICOAddress,
            holder
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
        *   Add RICO Settings
        */
        currentBlock = await ReversibleICOInstance.methods.getCurrentBlockNumber().call();
            
        // starts in one day
        StartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1; 
        
        // 22 days allocation
        AllocationBlockCount = blocksPerDay * 22;                   
        AllocationPrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;      
        StagePriceIncrease = helpers.solidity.ether * 0.0001;
        AllocationEndBlock = StartBlock + AllocationBlockCount;

        EndBlock = AllocationEndBlock + ( (StageBlockCount + 1) * StageCount );


        await ReversibleICOInstance.methods.addSettings(
            TokenTrackerAddress,        // address _TokenTrackerAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            projectWalletAddress,          // address _projectWalletAddress
            StartBlock,                 // uint256 _StartBlock
            AllocationBlockCount,       // uint256 _AllocationBlockCount,
            AllocationPrice,            // uint256 _AllocationPrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
        ).send({
            from: deployerAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenTrackerInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });

        expect(
            await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());
        

        // create snapshot
        if (snapshotsEnabled) {
            snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenTrackerInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenTrackerAddress);
    TokenTrackerInstance.receipt = TokenTrackerReceipt;
    ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
    ReversibleICOInstance.receipt = ReversibleICOReceipt;

    // do some validation
    expect( 
        await helpers.utils.getBalance(helpers, ReversibleICOAddress)
    ).to.be.bignumber.equal( new helpers.BN(0) );

    expect(
        await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversibleICOInstance.methods.TokenSupply().call()
    ).to.be.equal(
        await TokenTrackerInstance.methods.balanceOf(ReversibleICOAddress).call()
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
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployerAddress, 0);
            });
            
            describe("token sender is projectWalletAddress", async function () { 

                it("transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    await helpers.assertInvalidOpcode( async function () { 

                        await TokenTrackerInstance.methods.send(
                            TestReversibleICO.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: projectWalletAddress,
                            gas: 100000
                        });

                    }, "requireInitialized: Contract must be initialized");

                });
            });
            
            describe("token sender is deployerAddress", async function () { 

                it("transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                    helpers.utils.resetAccountNonceCache(helpers);

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to deployerAddress
                    await TokenTrackerInstance.methods.send(
                        deployerAddress,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 100000
                    });

                    await helpers.assertInvalidOpcode( async () => {

                        // deployerAddress transfers 100 tokens to rico before it is initialised.
                        await TokenTrackerInstance.methods.send(
                            TestReversibleICO.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: deployerAddress,
                            gas: 100000
                        });

                    }, "requireInitialized: Contract must be initialized");

                });
            });
        });

        describe("1 - contract initialized with settings", async function () { 

            let TestReversibleICO, TestReversibleICOAddress, TestTokenTracker, TestTokenTrackerAddress;

            before(async function () { 
                helpers.utils.resetAccountNonceCache(helpers);
    
                // deploy everything except sending tokens to rico

                TestTokenTracker = await helpers.utils.deployNewContractInstance(
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
                TestTokenTrackerAddress = TestTokenTracker.receipt.contractAddress;

                /*
                *   Deploy RICO Contract
                */
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
                TestReversibleICOReceipt = TestReversibleICO.receipt;
                TestReversibleICOAddress = TestReversibleICO.receipt.contractAddress;

                await TestTokenTracker.methods.setup(
                    TestReversibleICOAddress,
                    holder
                ).send({
                    from: holder,  // initial token supply holder
                });

                /*
                *   Add RICO Settings
                */
                currentBlock = await TestReversibleICO.methods.getCurrentBlockNumber().call();
                        
                // starts in one day
                StartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1; 
                
                // 22 days allocation
                AllocationBlockCount = blocksPerDay * 22;                   
                AllocationPrice = helpers.solidity.ether * 0.002;

                // 12 x 30 day periods for distribution
                StageCount = 12;
                StageBlockCount = blocksPerDay * 30;      
                StagePriceIncrease = helpers.solidity.ether * 0.0001;
                AllocationEndBlock = StartBlock + AllocationBlockCount;

                // for validation
                EndBlock = AllocationEndBlock + ( (StageBlockCount + 1) * StageCount );

                await TestReversibleICO.methods.addSettings(
                    TestTokenTrackerAddress,    // address _TokenTrackerAddress
                    whitelistControllerAddress, // address _whitelistControllerAddress
                    projectWalletAddress,       // address _projectWalletAddress
                    StartBlock,                 // uint256 _StartBlock
                    AllocationBlockCount,       // uint256 _AllocationBlockCount,
                    AllocationPrice,            // uint256 _AllocationPrice in wei
                    StageCount,                 // uint8   _StageCount
                    StageBlockCount,            // uint256 _StageBlockCount
                    StagePriceIncrease          // uint256 _StagePriceIncrease in wei
                ).send({
                    from: deployerAddress,  // deployer
                    gas: 3000000
                });

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployerAddress, 0);
            });
            
            describe("using configured token", async function () { 

                describe("token sender is projectWalletAddress", async function () { 

                    it("token amount is accepted and TokenSupply is correct", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        await TestTokenTracker.methods.send(
                            TestReversibleICOAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: projectWalletAddress,
                            gas: 100000
                        });

                        expect(
                            await TestReversibleICO.methods.TokenSupply().call()
                        ).to.be.equal(
                            testAmount
                        );

                    });
                });

                describe("token sender is deployerAddress ", async function () { 

                    it("transaction reverts \"withdraw: Withdraw not possible. Participant has no locked tokens.\"", async function () {

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        // transfer 100 tokens to deployerAddress
                        await TestTokenTracker.methods.send(
                            deployerAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: holder,
                            gas: 100000
                        });

                        await helpers.assertInvalidOpcode( async () => {

                            // deployerAddress transfers 100 tokens to rico after it is initialised.
                            await TestTokenTracker.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: deployerAddress,
                                gas: 100000
                            });

                        }, "withdraw: Withdraw not possible. Participant has no locked tokens.");

                    });

                });

            });
            
            describe("using different token", async function () { 

                describe("token sender is projectWalletAddress", async function () { 

                    it("transaction reverts \"ERC777TokensRecipient: Invalid token\"", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        await helpers.assertInvalidOpcode( async () => {

                            await TokenTrackerInstance.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: projectWalletAddress,
                                gas: 100000
                            });

                        }, "ERC777TokensRecipient: Invalid token");

                    });
                });

                describe("token sender is deployerAddress ", async function () { 

                    it("transaction reverts \"ERC777TokensRecipient: Invalid token\"", async function () {

                        const initialized = await TestReversibleICO.methods.initialized().call();
                        expect( initialized ).to.be.equal( true );

                        const testAmount = new BN(100).mul(
                            // 10^18 to account for decimals
                            new BN("10").pow(new BN("18"))
                        ).toString();

                        // transfer 100 tokens to deployerAddress
                        await TokenTrackerInstance.methods.send(
                            deployerAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: holder,
                            gas: 100000
                        });

                        await helpers.assertInvalidOpcode( async () => {

                            // deployerAddress transfers 100 tokens to rico after it is initialised.
                            await TokenTrackerInstance.methods.send(
                                TestReversibleICOAddress,
                                testAmount,
                                ERC777data
                            ).send({
                                from: deployerAddress,
                                gas: 100000
                            });

                        }, "ERC777TokensRecipient: Invalid token");

                    });

                });

            });
            
        });

        describe("2 - contract in Allocation phase", async function () { 

            describe("participant is not whitelisted and has no contributions", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
                });

                it("getCancelModeStates() returns (false, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });

                it("sending tokens to Rico reverts \"withdraw: Withdraw not possible. Participant has no locked tokens.\"", async function () {

                    // our participant somehow got some tokens that they then attempt to send for withdraw

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to participant_1
                    await TokenTrackerInstance.methods.send(
                        participant_1,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 100000
                    });
                    
                    const ParticipantTokenBalance = new BN(
                        await TokenTrackerInstance.methods.balanceOf(participant_1).call()
                    );

                    expect(
                        ParticipantTokenBalance
                    ).to.be.bignumber.equal(
                        testAmount
                    );

                    await helpers.assertInvalidOpcode( async () => {

                        // transfer tokens to Rico for withdraw
                        await TokenTrackerInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: participant_1,
                            gas: 500000
                        });

                    }, "withdraw: Withdraw not possible. Participant has no locked tokens.");

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

                it("getCancelModeStates() returns (true, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(true);
                    expect(CancelStates[1]).to.be.equal(false);
                });

                it("sending tokens to Rico reverts \"withdraw: Withdraw not possible. Participant has no locked tokens.\"", async function () {

                    // our participant somehow got some tokens that they then attempt to send for withdraw

                    const testAmount = new BN(100).mul(
                        // 10^18 to account for decimals
                        new BN("10").pow(new BN("18"))
                    ).toString();

                    // transfer 100 tokens to participant_1
                    await TokenTrackerInstance.methods.send(
                        participant_1,
                        testAmount,
                        ERC777data
                    ).send({
                        from: holder,
                        gas: 100000
                    });
                    
                    const ParticipantTokenBalance = new BN(
                        await TokenTrackerInstance.methods.balanceOf(participant_1).call()
                    );

                    expect(
                        ParticipantTokenBalance
                    ).to.be.bignumber.equal(
                        testAmount
                    );

                    await helpers.assertInvalidOpcode( async () => {

                        // transfer tokens to Rico for withdraw
                        await TokenTrackerInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            testAmount,
                            ERC777data
                        ).send({
                            from: participant_1,
                            gas: 500000
                        });

                    }, "withdraw: Withdraw not possible. Participant has no locked tokens.");

                });
            });


            describe("participant is whitelisted and has 2 contributions", async function () { 

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
                    let whitelistOrRejectTx = await ReversibleICOInstance.methods.whitelistOrReject(
                        participant_1,
                        ApplicationEventTypes.WHITELIST_ACCEPT,
                    ).send({
                        from: whitelistControllerAddress
                    });


                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 2, false, 1);


                });

                it("getCancelModeStates() returns (false, true)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });


                it("participant can withdraw by sending tokens back to contract", async function () {

                    // @TODO!
                    // - Our participant must have a token balance
                    // - the unlocked balance can be 0 or higher
                    // - must be able to transfer partial / whole balance back to rico
                    // in order to get eth back.



                    const ParticipantTokenBalance = new BN(
                        await TokenTrackerInstance.methods.balanceOf(participant_1).call()
                    );

                    const RicoUnlockedTokenBalanceBefore = new BN(
                        await TokenTrackerInstance.methods.getUnlockedBalance(participant_1).call()
                    );

                    /*
                    console.log(
                        "RicoUnlockedTokenBalanceBefore:   ",
                        helpers.utils.toEth(helpers, RicoUnlockedTokenBalanceBefore.toString()),
                        "tokens" 
                    );
                    */

                    expect(
                        ParticipantTokenBalance
                    ).to.be.bignumber.above(
                        new BN("0")
                    );

                    // const testAmount = ParticipantTokenBalance.div( new BN("2") );
                    // const testAmount = ParticipantTokenBalance.div( new BN("4") )(); //
                    const testAmount = new helpers.BN("5000000").mul( helpers.solidity.etherBN );

                    await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 3);

                    await TokenTrackerInstance.methods.send(
                        ReversibleICOInstance.receipt.contractAddress,
                        testAmount.toString(),
                        ERC777data
                    ).send({
                        from: participant_1,
                        gas: 1000000
                    });

                    await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 3);

                    console.log("ParticipantTokenBalance: ", helpers.utils.toEth(helpers, ParticipantTokenBalance.toString()) +" tokens" );
                    console.log("ParticipanttestAmount:   ", helpers.utils.toEth(helpers, testAmount.toString()) +" tokens" );

                    let ethAmt = await ReversibleICOInstance.methods.getEthAmountForTokensAtStage( testAmount.toString(), 1 ).call();
                    console.log("CalcEthAmount:           ", helpers.utils.toEth(helpers, ethAmt.toString()) +" tokens" );

                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenTrackerInstance.methods.balanceOf(participant_1).call()
                    );

                    const ParticipantUnlockedTokenBalance = new BN(
                        await TokenTrackerInstance.methods.getUnlockedBalance(participant_1).call()
                    );

                    /*

                    expect(
                        ParticipantTokenBalanceAfter
                    ).to.be.bignumber.equal(
                        ParticipantTokenBalance.sub( testAmount )
                    );

                    expect(
                        ParticipantUnlockedTokenBalance
                    ).to.be.bignumber.equal(
                        RicoUnlockedTokenBalanceBefore
                    );
                    

                    let initialEth = helpers.solidity.etherBN;
                    let tokenAmt = await ReversibleICOInstance.methods.getTokenAmountForEthAtStage( initialEth.toString(), 0 ).call();
                    let ethAmt = await ReversibleICOInstance.methods.getEthAmountForTokensAtStage( tokenAmt.toString(), 0 ).call();


                    
                    console.log(
                        "initialEth: ",
                        helpers.utils.toEth(helpers, initialEth.toString()),
                        "eth" 
                    );

                    console.log(
                        "tokenAmt:   ",
                        helpers.utils.toEth(helpers, tokenAmt.toString()),
                        "tokens" 
                    );

                    console.log(
                        "ethAmt:     ",
                        helpers.utils.toEth(helpers, ethAmt.toString()),
                        "eth" 
                    );
                    */
                });
            });
        });
    });

    
});

async function displayTokensForParticipantAtStage(start, blocks, contract, deployerAddress, participant, stage, end = false, after = false) {
    let currentBlock = await helpers.utils.jumpToContractStage ( contract, deployerAddress, stage, end, after );

    let ParticipantsByAddress = await contract.methods.ParticipantsByAddress(participant).call();
    let totalTokens = ParticipantsByAddress.token_amount;

    let diffBlock = (currentBlock - start);

    let tx1 = await contract.methods.getLockedTokenAmount(participant).send({from: deployerAddress });
    let amount1 = await contract.methods.getLockedTokenAmount(participant).call();

    console.log("stage ["+stage+"] ( "+ diffBlock + " )");
    
    console.log("participant: ", participant);
    console.log("gas V:   ", tx1.gasUsed);
    console.log("amount:  ", helpers.utils.toFullToken(helpers, new helpers.BN(amount1) ));
    console.log("tokensV3:", helpers.utils.toFullToken(
            helpers, helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(helpers, diffBlock, blocks, totalTokens) 
        )
    );

    const ratioA = await contract.methods.getCurrentUnlockRatio(20).call();
    const ratioC = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, blocks, 20);
    console.log("ratioA:   ", helpers.utils.toFullToken(helpers, ratioA));
    console.log("ratioC:   ", helpers.utils.toFullToken(helpers, ratioC));
}


async function displayContractStats(contract, TokenTrackerInstance) {

    let maxEth = await contract.methods.availableEth().call();
    let receivedETH = await contract.methods.receivedETH().call();
    let returnedETH = await contract.methods.returnedETH().call();
    let acceptedETH = await contract.methods.acceptedETH().call();
    let contributorsETH = await contract.methods.contributorsETH().call();
    let projectETH = await contract.methods.projectETH().call();
    let projectETHWithdrawn = await contract.methods.projectETHWithdrawn().call();
    let ricoTokenBalance = await TokenTrackerInstance.methods.balanceOf(contract.receipt.contractAddress).call();

    console.log("ricoTokenBalance:   ", helpers.utils.toEth(helpers, ricoTokenBalance) + " tokens");
    console.log("maxEth:             ", helpers.utils.toEth(helpers, maxEth) + " eth");
    console.log("receivedETH:        ", helpers.utils.toEth(helpers,receivedETH) + " eth");
    console.log("returnedETH:        ", helpers.utils.toEth(helpers,returnedETH) + " eth");
    console.log("acceptedETH:        ", helpers.utils.toEth(helpers,acceptedETH) + " eth");
    console.log("contributorsETH:    ", helpers.utils.toEth(helpers,contributorsETH) + " eth");
    console.log("projectETH:         ", helpers.utils.toEth(helpers,projectETH) + " eth");
    console.log("projectETHWithdrawn:", helpers.utils.toEth(helpers,projectETHWithdrawn) + " eth");
    console.log("\n");
}