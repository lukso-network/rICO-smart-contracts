const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const TeamWalletAddress = holder;
const participant_1 = accounts[4];
const participant_2 = accounts[5];
const participant_3 = accounts[6];
const participant_4 = accounts[7];
const participant_5 = accounts[8];
const participant_6 = accounts[9];

const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 6450;

const ContributionStates = {
    NOT_SET:0,        // will match default value of a mapping result
    NOT_PROCESSED:1,
    ACCEPTED:2,
    REJECTED:3,
    CANCELLED:4,
}

const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

let TokenTrackerAddress, ReversableICOAddress, stageValidation = [], currentBlock, 
    StartBlock, AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, EndBlock, TokenTrackerInstance, 
    TokenTrackerReceipt, ReversableICOInstance, ReversableICOReceipt;

async function revertToFreshDeployment() {

    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }

    let SnapShotKey = "FlowTestInit";

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
        ReversableICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
        ReversableICOReceipt = ReversableICOInstance.receipt;
        ReversableICOAddress = ReversableICOInstance.receipt.contractAddress;
        // helpers.addresses.Rico = ReversableICOAddress;

        console.log("      RICO Gas used for deployment: ", ReversableICOInstance.receipt.gasUsed);
        console.log("      Contract Address:", ReversableICOAddress);
        console.log("");

        await TokenTrackerInstance.methods.setup(
            ReversableICOAddress,
            holder
        ).send({
            from: holder,  // initial token supply holder
        });

        // transfer tokens to rico
        await TokenTrackerInstance.methods.send(
            ReversableICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });


        expect(
            await TokenTrackerInstance.methods.balanceOf(ReversableICOAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());

        /*
        *   Add RICO Settings
        */
        currentBlock = await ReversableICOInstance.methods.getCurrentBlockNumber().call();
            
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

        const StageStartBlock = AllocationEndBlock;
        let lastStageBlockEnd = StageStartBlock;

        for(let i = 0; i < StageCount; i++) {

            const start_block = lastStageBlockEnd + 1;
            const end_block = lastStageBlockEnd + StageBlockCount + 1;
            const token_price = AllocationPrice + ( StagePriceIncrease * ( i +  1) );

            stageValidation.push( {
                start_block: start_block,
                end_block: end_block,
                token_price: token_price
            });

            lastStageBlockEnd = end_block;
        }

        await ReversableICOInstance.methods.addSettings(
            TokenTrackerAddress,        // address _TokenTrackerAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            TeamWalletAddress,          // address _TeamWalletAddress
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

        // create snapshot
        if (snapshotsEnabled) {
            snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenTrackerInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenTrackerAddress);
    TokenTrackerInstance.receipt = TokenTrackerReceipt;
    ReversableICOInstance = await helpers.utils.getContractInstance(helpers, "ReversableICOMock", ReversableICOAddress);
    ReversableICOInstance.receipt = ReversableICOReceipt;

    // do some validation
    expect( 
        await helpers.utils.getBalance(helpers, ReversableICOAddress)
    ).to.be.bignumber.equal( new helpers.BN(0) );

    expect(
        await TokenTrackerInstance.methods.balanceOf(ReversableICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversableICOInstance.methods.InitialTokenSupply().call()
    ).to.be.equal(
        await TokenTrackerInstance.methods.balanceOf(ReversableICOAddress).call()
    );
};

describe("Flow Testing", function () {

    describe("view getCancelModeStates(address participantAddress)", async function () { 

        before(async () => {
            await revertToFreshDeployment();
        });
        
        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () { 
            
            it("should return (false, false) as no participant actually exists", async function () {
                let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                expect(CancelStates[0]).to.be.equal(false);
                expect(CancelStates[1]).to.be.equal(false);
            });

        });
        
        describe("contract in Allocation phase", async function () { 
            
            describe("participant has no contributions", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 0);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversableICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });                
                });

                it("should return (true, false) => cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(true);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () { 
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversableICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistOrRejectTx = await ReversableICOInstance.methods.whitelistOrReject(
                        participant_1,
                        ContributionStates.ACCEPTED,
                        0,          // start id
                        15
                    ).send({
                        from: whitelistControllerAddress
                    });
                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });
            });
        });

 
        describe("contract in Distribution phase", async function () { 
            
            describe("participant has no contributions", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 5);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is not whitelisted and has 1 contribution", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversableICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });                
                });

                it("should return (true, false) => cancel by sending eth value smaller than 0.001 eth to contract", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(true);
                    expect(CancelStates[1]).to.be.equal(false);
                });
            });

            describe("participant is whitelisted and has 1 contribution", async function () { 
                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 5);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversableICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistOrRejectTx = await ReversableICOInstance.methods.whitelistOrReject(
                        participant_1,
                        ContributionStates.ACCEPTED,
                        0,          // start id
                        15
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversableICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });

                /*
                it("GasUsage", async function () {
                    let tx = await ReversableICOInstance.methods.getCancelModeStates(participant_1).send({
                        from: whitelistControllerAddress
                    });
                    console.log("tx GasUsed: ", tx.gasUsed);
                });
                */
            });
        });

    });

    describe("transaction () => fallback method", async function () { 

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () { 
            
            let TestReversableICO;

            before(async () => {
                helpers.utils.resetAccountNonceCache(helpers);
    
                // deploy mock contract so we can set block times. ( ReversableICOMock )
                TestReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
    
                // jump to contract start
                currentBlock = await jumpToContractStage (TestReversableICO, deployerAddress, 0);
            });

            it("0 value transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversableICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: TestReversableICO.receipt.contractAddress,
                        value: 0,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "requireInitialized: Contract must be initialized");

            });

            it("value > 0 transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversableICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode( async () => {

                    await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: TestReversableICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "requireInitialized: Contract must be initialized");

            });

        });

        describe("contract in Allocation phase", async function () { 
            
            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 0);
            });

            it("value >= rico.minContribution results in a new contribution", async function () {

                let ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversableICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                
                ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                expect( 
                    afterContributionsCount.toString()
                ).to.be.equal(
                    (parseInt(initialContributionsCount) + 1).toString()
                );

            });

            it("value < rico.minContribution results in cancel(), account has 2 contributions", async function () {

                const ParticipantAccountBalanceInitial = await helpers.utils.getBalance(helpers, participant_1);

                // contribute
                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                let ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversableICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

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
                let ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                let ContributionTotals = new helpers.BN("0");
                for(let i = 0; i < ParticipantByAddress.contributionsCount; i++) {
                    const ParticipantContributionDetails = await ReversableICOInstance.methods.ParticipantContributionDetails(participant_1, i).call();
                    ContributionTotals = ContributionTotals.add(
                        new helpers.BN(ParticipantContributionDetails._value.toString())
                    );

                    expect( 
                        ParticipantContributionDetails._state.toString()
                    ).to.be.equal(
                        ContributionStates.NOT_PROCESSED.toString()
                    );
                }

                expect( 
                    ParticipantByAddress.contributed_amount.toString()
                ).to.be.equal(
                    ContributionTotals.toString(),
                );


                // load minContribution from contract
                const minContribution = await ReversableICOInstance.methods.minContribution().call();
                const CancelAmount = new helpers.BN(minContribution).sub(
                    new helpers.BN("1")
                );

                let cancelTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversableICOInstance.receipt.contractAddress,
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
                // cancel amount is returned
                // .sub(CancelAmount)
                // contribution amount is returned
                .add(ContributionTotals);

                expect( 
                    ParticipantAccountBalanceAfterCancel.toString()
                ).to.be.equal(
                    ParticipantAccountBalanceAfterCancelValidation.toString()
                );
                
                // validate fired events
                let eventFilter = helpers.utils.hasEvent(
                    cancelTx, 'ExitEvent(address,uint256,uint256,uint8,bool)'
                );
                assert.equal(eventFilter.length, 1, 'ExitEvent event not received.');

                eventFilter = helpers.utils.hasEvent(
                    cancelTx, 'ContributionEvent(uint8,uint16,address,uint256)'
                );
                assert.equal(eventFilter.length, parseInt(ParticipantByAddress.contributionsCount), 'ExitEvent event not received.');
 
                ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                // no additional contributions logged.
                expect( 
                    afterContributionsCount.toString()
                ).to.be.equal(
                initialContributionsCount.toString()
                );

                // validate contributions
                for(let i = 0; i < ParticipantByAddress.contributionsCount; i++) {
                    const ParticipantContributionDetails = await ReversableICOInstance.methods.ParticipantContributionDetails(participant_1, i).call();
                    expect( 
                        ParticipantContributionDetails._state.toString()
                    ).to.be.equal(
                        ContributionStates.CANCELLED.toString()
                    );
                }
                
            });

        });


    });


    describe("transaction cancel()", async function () { 

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () { 
            
            let TestReversableICO;

            before(async () => {
                helpers.utils.resetAccountNonceCache(helpers);
    
                // deploy mock contract so we can set block times. ( ReversableICOMock )
                TestReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
    
                // jump to contract start
                currentBlock = await jumpToContractStage (TestReversableICO, deployerAddress, 0);
            });

            it("0 value transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversableICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversableICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "requireInitialized: Contract must be initialized");

            });

            it("value > 0 transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversableICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversableICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice,
                        value: ContributionAmount.toString(),
                    });

                }, "requireInitialized: Contract must be initialized");

            });

        });

        describe("contract in Allocation phase", async function () { 
            
            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 0);
            });

            it("value < rico.minContribution results in cancel(), account has 1 contribution", async function () {

                const ParticipantAccountBalanceInitial = await helpers.utils.getBalance(helpers, participant_1);

                // contribute
                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                let ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversableICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

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
                let ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                expect( 
                    ParticipantByAddress.contributed_amount.toString()
                ).to.be.equal(
                    ContributionAmount.toString(),
                );

                // validate contributions
                for(let i = 0; i < ParticipantByAddress.contributionsCount; i++) {
                    const ParticipantContributionDetails = await ReversableICOInstance.methods.ParticipantContributionDetails(participant_1, i).call();
                    expect( 
                        ParticipantContributionDetails._state.toString()
                    ).to.be.equal(
                        ContributionStates.NOT_PROCESSED.toString()
                    );
                }

                // load minContribution from contract
                const minContribution = await ReversableICOInstance.methods.minContribution().call();
                const CancelAmount = new helpers.BN(minContribution).sub(
                    new helpers.BN("1")
                );

                // await displayContributions(ReversableICOInstance, participant_1);

                let cancelTx = await ReversableICOInstance.methods.cancel().send({
                    from: participant_1,  // initial token supply holder
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice,
                    value: CancelAmount.toString(),
                });

                const CancelTxCost = new helpers.BN( cancelTx.gasUsed ).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );
                const ParticipantAccountBalanceAfterCancel = await helpers.utils.getBalance(helpers, participant_1);
                const ParticipantAccountBalanceAfterCancelValidation = new helpers.BN( 
                    ParticipantAccountBalanceAfterContributionValidation
                ).sub(CancelTxCost)
                // cancel amount is returned
                // .sub(CancelAmount)
                // contribution amount is returned
                .add(ContributionAmount);

                expect( 
                    ParticipantAccountBalanceAfterCancel.toString()
                ).to.be.equal(
                    ParticipantAccountBalanceAfterCancelValidation.toString()
                );

                // validate fired events
                expect(cancelTx.events.hasOwnProperty('ExitEvent')).to.be.equal( true );
                expect(cancelTx.events.hasOwnProperty('ContributionEvent')).to.be.equal( true );
                
                ParticipantByAddress = await ReversableICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const afterContributionsCount = ParticipantByAddress.contributionsCount;

                // no additional contributions logged.
                expect( 
                    afterContributionsCount.toString()
                ).to.be.equal(
                   initialContributionsCount.toString()
                );

                // validate contributions
                for(let i = 0; i < ParticipantByAddress.contributionsCount; i++) {
                    const ParticipantContributionDetails = await ReversableICOInstance.methods.ParticipantContributionDetails(participant_1, i).call();
                    expect( 
                        ParticipantContributionDetails._state.toString()
                    ).to.be.equal(
                        ContributionStates.CANCELLED.toString()
                    );
                }
                
            });

        });


    });

    
    /*
    describe("transaction projectWithdraw(uint256 ethAmount)", async function () { 

        const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
        let DistributionStartBlock, DistributionBlockLength, currentBlock;

        before(async function () {

            await revertToFreshDeployment();

            DistributionStartBlock = await ReversableICOInstance.methods.DistributionStartBlock().call();
            DistributionBlockLength = await ReversableICOInstance.methods.DistributionBlockLength().call();

            // move to start of the allocation phase
            currentBlock = await jumpToContractStage ( ReversableICOInstance, deployerAddress, 0 );
            EndBlock = await ReversableICOInstance.methods.EndBlock().call();
            
            // send eth contribution
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversableICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            // console.log("contribution 2 / account 1");
            const ContributionAmount2 = new helpers.BN("14000").mul( helpers.solidity.etherBN );
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversableICOInstance.receipt.contractAddress,
                value: ContributionAmount2.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            // console.log("contribution 3 / account 2");
            const ContributionAmount3 = new helpers.BN("16000").mul( helpers.solidity.etherBN );
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_2,
                to: ReversableICOInstance.receipt.contractAddress,
                value: ContributionAmount3.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });
            

            await displayContractStats(ReversableICOInstance, TokenTrackerInstance);
            await displayContributions(ReversableICOInstance, participant_1);
            await displayContributions(ReversableICOInstance, participant_2);

            console.log("whitelist!");
            // whitelist and accept contribution
            let whitelistOrRejectTx = await ReversableICOInstance.methods.whitelistOrReject(
                participant_1,
                ContributionStates.ACCEPTED,
                0,          // start id
                15
            ).send({
                from: whitelistControllerAddress
            });

            whitelistOrRejectTx = await ReversableICOInstance.methods.whitelistOrReject(
                participant_2,
                ContributionStates.ACCEPTED,
                0,          // start id
                15
            ).send({
                from: whitelistControllerAddress
            });

            await displayContributions(ReversableICOInstance, participant_1);
            await displayContributions(ReversableICOInstance, participant_2);

            // console.log("Jump to stage 5");
            // jump to stage 5
            currentBlock = await jumpToContractStage (ReversableICOInstance, deployerAddress, 5);
        });

        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () { 
            
            let TestReversableICO;

            before(async function () {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversableICOMock )
                TestReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
            });

            it("transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversableICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                let ethAmount = await TestReversableICO.methods.projectETH().call();

                await helpers.assertInvalidOpcode( async () => {
                    let tx = await TestReversableICO.methods.projectWithdraw(ethAmount).send({
                        from: TeamWalletAddress
                    });
                }, "requireInitialized: Contract must be initialized");

            });
        });

        describe("contract in Distribution phase", async function () { 

            it("transaction reverts \"only TeamWalletAddress\" if called by other address", async function () {

                let ethAmount = await ReversableICOInstance.methods.projectETH().call();

                await helpers.assertInvalidOpcode( async () => {
                    let tx = await ReversableICOInstance.methods.projectWithdraw(ethAmount).send({
                        from: participant_1
                    });
                }, "only TeamWalletAddress");
            });

            it("succeeds if called by TeamWalletAddress", async function () {

                let ethAmount = await ReversableICOInstance.methods.projectETH().call();

                let tx = await ReversableICOInstance.methods.projectWithdraw(ethAmount).send({
                    from: TeamWalletAddress
                });

            });

        });
        
    });
    */
});

async function displayTokensForParticipantAtStage(start, blocks, contract, deployerAddress, participant, stage, end = false, after = false) {
    let currentBlock = await jumpToContractStage ( contract, deployerAddress, stage, end, after );

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


async function jumpToContractStage ( ReversableICO, deployerAddress, stageId, end = false, addToBlockNumber = false ) {
    const stageData = await ReversableICO.methods.StageByNumber(stageId).call();
    let block = stageData.start_block;
    if(end) {
        block = stageData.end_block;
    }

    if(addToBlockNumber !== false) {
        block = parseInt(block) + parseInt(addToBlockNumber);
    }

    await ReversableICO.methods.jumpToBlockNumber(
        block
    ).send({
        from: deployerAddress, gas: 100000
    });

    return block;
}



async function displayContributions(contract, participant_address) {

    let ParticipantByAddress = await contract.methods.ParticipantsByAddress(participant_address).call();

    const contributionsCount = ParticipantByAddress.contributionsCount;
    console.log("Contributions for address:", participant_address, "Count:", contributionsCount.toString());

    console.log("Total Contributed amount:", helpers.utils.toEth(helpers, ParticipantByAddress.contributed_amount.toString()) +" eth" );
    console.log("Total Accepted amount:   ", helpers.utils.toEth(helpers, ParticipantByAddress.accepted_amount.toString()) +" eth" );
    console.log("Total Withdrawn amount:  ", helpers.utils.toEth(helpers, ParticipantByAddress.withdrawn_amount.toString()) +" eth" );
    console.log("Total Available amount:  ", helpers.utils.toEth(helpers, ParticipantByAddress.available_amount.toString()) +" eth" );
    console.log("Total Token amount:      ", helpers.utils.toEth(helpers, ParticipantByAddress.token_amount.toString()) +" tokens" );

    
    
    for(let i = 0; i < contributionsCount; i++) {
        const ParticipantContributionDetails = await contract.methods.ParticipantContributionDetails(participant_address, i).call();
        console.log("contribution:", i);

        console.log("_value:    ", helpers.utils.toEth(helpers,ParticipantContributionDetails._value.toString() ) +" eth" );
        console.log("_received: ", helpers.utils.toEth(helpers,ParticipantContributionDetails._received.toString() ) +" eth" );
        console.log("_returned: ", helpers.utils.toEth(helpers,ParticipantContributionDetails._returned.toString() ) +" eth" );
        console.log("_tokens:   ", helpers.utils.toEth(helpers,ParticipantContributionDetails._tokens.toString() ) +" tokens" );
        console.log("_block:    ", ParticipantContributionDetails._block.toString());
        console.log("_stageId:  ", ParticipantContributionDetails._stageId.toString());
        console.log("_state:    ", ParticipantContributionDetails._state.toString());

    }
    console.log("\n");
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