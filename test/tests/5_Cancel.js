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

let SnapShotKey = "CancelTestInit";
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
            ReversibleICOAddress
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

describe("Cancel Testing", function () {

    before(async function () { 
        await revertToFreshDeployment();
    });
    
    describe("view getCancelModeStates(address participantAddress)", async function () { 

        before(async function () { 
            await revertToFreshDeployment();
        });
        
        describe("contract in stage 1 or 2 ( not initialized with settings )", async function () { 
            
            it("should return (false, false) as no participant actually exists", async function () {
                let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
                expect(CancelStates[0]).to.be.equal(false);
                expect(CancelStates[1]).to.be.equal(false);
            });

        });


        describe("contract in Allocation phase", async function () { 
            
            describe("participant has no contributions", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
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
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
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
                    let whitelistOrRejectTx = await ReversibleICOInstance.methods.whitelistOrReject(
                        participant_1,
                        ApplicationEventTypes.WHITELIST_ACCEPT
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });
            });
        });

        describe("contract in Distribution phase", async function () { 
            
            describe("participant has no contributions", async function () { 

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 5);
                });

                it("should return (false, false)", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
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
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
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
                    let whitelistOrRejectTx = await ReversibleICOInstance.methods.whitelistOrReject(
                        participant_1,
                        ApplicationEventTypes.WHITELIST_ACCEPT
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                it("should return (false, true) => cancel by sending tokens back to contract", async function () {
                    let CancelStates = await ReversibleICOInstance.methods.getCancelModeStates(participant_1).call();
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

            it("0 value transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: TestReversibleICO.receipt.contractAddress,
                        value: 0,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "requireInitialized: Contract must be initialized");

            });

            it("value > 0 transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

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

                }, "requireInitialized: Contract must be initialized");

            });

        });

        describe("contract in Allocation phase", async function () { 
            
            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
            });

            it("value >= rico.minContribution results in a new contribution", async function () {

                let ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
                const initialContributionsCount = ParticipantByAddress.contributionsCount;

                const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });
                
                ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
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
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                let ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
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
                ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
                let ContributionTotals = new helpers.BN("0");

                for(let i = 0; i < StageCount; i++) {
                    const ParticipantStageDetails = await ReversibleICOInstance.methods.ParticipantTotalsDetails(participant_1, i).call();
                    ContributionTotals = ContributionTotals.add(new helpers.BN(
                        ParticipantStageDetails.received
                    ));
                }

                expect( 
                    ParticipantByAddress.received.toString()
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
                    cancelTx, 'ApplicationEvent(uint8,uint16,address,uint256)'
                );
                assert.equal(eventFilter.length, 1, 'ApplicationEvent event not received.');
                
                ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
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

            it("0 value transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversibleICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                }, "requireInitialized: Contract must be initialized");

            });

            it("value > 0 transaction reverts \"requireInitialized: Contract must be initialized\"", async function () {

                const initialized = await TestReversibleICO.methods.initialized().call();
                expect( initialized ).to.be.equal( false );

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode( async () => {

                    await TestReversibleICO.methods.cancel().send({
                        from: participant_1,  // initial token supply holder
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice,
                        value: ContributionAmount.toString(),
                    });

                }, "requireInitialized: Contract must be initialized");

            });

        });

    });

    

});


async function jumpToContractStage ( ReversibleICO, deployerAddress, stageId, end = false, addToBlockNumber = false ) {
    const stageData = await ReversibleICO.methods.StageByNumber(stageId).call();
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

