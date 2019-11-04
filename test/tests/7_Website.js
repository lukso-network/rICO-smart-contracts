const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect
const fs = require('fs');

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
    AUTOMATIC_REFUND:1,
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

let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    StartBlock, AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, EndBlock, TokenContractInstance,
    TokenContractReceipt, ReversibleICOInstance, ReversibleICOReceipt;

let deployments = {};

function saveDeploymentsToFile(data) {
    fs.writeFile("build/deployments.json", JSON.stringify(data), function(err) {
        if(err) {
            return console.log(err);
        }
    }); 
}

async function doFreshDeployment(name) {

    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }

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

    /*
    *   Deploy RICO Contract
    */
    ReversibleICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
    ReversibleICOReceipt = ReversibleICOInstance.receipt;
    ReversibleICOAddress = ReversibleICOInstance.receipt.contractAddress;
    // helpers.addresses.Rico = ReversibleICOAddress;

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

    await ReversibleICOInstance.methods.addSettings(
        TokenContractAddress,        // address _TokenContractAddress
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

    expect(
        await ReversibleICOInstance.methods.TokenSupply().call()
    ).to.be.equal(RicoSaleSupply.toString());

    deployments[name] = {
        "name": name,
        "rico_address": ReversibleICOInstance.receipt.contractAddress,
        "token_address": TokenContractInstance.receipt.contractAddress,
    };

    // save deployments to file.
    saveDeploymentsToFile(deployments);
    
    return {
        TokenContractInstance,
        ReversibleICOInstance,
    }
};

describe("Website States", function () {

    describe("contract in stage 0 - 1 day before Allocation Start", async function () { 
        
        const name = "stage_0_before_allocation";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
        });

        it("validated", async function () {

            expect(
                await Instances.ReversibleICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversibleICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start", async function () { 
        
        const name = "stage_0_at_allocation";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployerAddress, 0);
        });

        it("validated", async function () {

            expect(
                await Instances.ReversibleICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversibleICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start - 1 contrib - whitelist no", async function () { 
        
        const name = "stage_0_at_allocation_one_contribution_whitelist_no";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployerAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
            
            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("validated", async function () {

            expect(
                await Instances.ReversibleICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversibleICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            expect(
                await Instances.ReversibleICOInstance.methods.ParticipantCount().call()
            ).to.be.equal( "1" );  

            let participant_address = await Instances.ReversibleICOInstance.methods.ParticipantsById(1).call();
            let Participant = await Instances.ReversibleICOInstance.methods.ParticipantsByAddress(participant_address).call();
            
            expect(
                Participant.whitelisted
            ).to.be.equal( false );
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start - 1 contrib - whitelist yes", async function () { 
        
        const name = "stage_0_at_allocation_one_contribution_whitelist_yes";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployerAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
            
            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            await Instances.ReversibleICOInstance.methods.whitelistOrReject(
                participant_1,
                ApplicationEventTypes.WHITELIST_ACCEPT
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("validated", async function () {

            expect(
                await Instances.ReversibleICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversibleICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            expect(
                await Instances.ReversibleICOInstance.methods.ParticipantCount().call()
            ).to.be.equal( "1" );  

            let participant_address = await Instances.ReversibleICOInstance.methods.ParticipantsById(1).call();
            let Participant = await Instances.ReversibleICOInstance.methods.ParticipantsByAddress(participant_address).call();
            
            expect(
                Participant.whitelisted
            ).to.be.equal( true );
        });
    });
    
});
