const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect
const fs = require('fs');

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

    /*
    *   Deploy RICO Contract
    */
    ReversableICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
    ReversableICOReceipt = ReversableICOInstance.receipt;
    ReversableICOAddress = ReversableICOInstance.receipt.contractAddress;
    // helpers.addresses.Rico = ReversableICOAddress;

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

    deployments[name] = {
        "name": name,
        "rico_address": ReversableICOInstance.receipt.contractAddress,
        "token_address": TokenTrackerInstance.receipt.contractAddress,
    };

    // save deployments to file.
    saveDeploymentsToFile(deployments);
    
    return {
        TokenTrackerInstance,
        ReversableICOInstance,
    }
};

describe("Website States", function () {

    describe("contract in stage 0 - 1 day before Allocation Start", async function () { 
        
        const name = "stage_0_before_allocation";
        let Instances;
        before(async () => {
            Instances = await doFreshDeployment(name);
        });

        it("validated", async function () {

            expect(
                await Instances.ReversableICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversableICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start", async function () { 
        
        const name = "stage_0_at_allocation";
        let Instances;
        before(async () => {
            Instances = await doFreshDeployment(name);
            currentBlock = await jumpToContractStage (Instances.ReversableICOInstance, deployerAddress, 0);
        });

        it("validated", async function () {

            expect(
                await Instances.ReversableICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversableICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start - 1 contrib - whitelist no", async function () { 
        
        const name = "stage_0_at_allocation_one_contribution_whitelist_no";
        let Instances;
        before(async () => {
            Instances = await doFreshDeployment(name);
            currentBlock = await jumpToContractStage (Instances.ReversableICOInstance, deployerAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
            
            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversableICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("validated", async function () {

            expect(
                await Instances.ReversableICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversableICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            expect(
                await Instances.ReversableICOInstance.methods.ParticipantCount().call()
            ).to.be.equal( "1" );  

            let participant_address = await Instances.ReversableICOInstance.methods.ParticipantsById(1).call();
            let Participant = await Instances.ReversableICOInstance.methods.ParticipantsByAddress(participant_address).call();
            
            expect(
                Participant.whitelisted
            ).to.be.equal( false );
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start - 1 contrib - whitelist yes", async function () { 
        
        const name = "stage_0_at_allocation_one_contribution_whitelist_yes";
        let Instances;
        before(async () => {
            Instances = await doFreshDeployment(name);
            currentBlock = await jumpToContractStage (Instances.ReversableICOInstance, deployerAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
            
            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversableICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            await Instances.ReversableICOInstance.methods.whitelistOrReject(
                participant_1,
                ContributionStates.ACCEPTED,
                0,          // start id
                10          // contribution count to process
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("validated", async function () {

            expect(
                await Instances.ReversableICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            expect(
                await Instances.ReversableICOInstance.methods.getCurrentStage().call()
            ).to.be.equal( "0" );
            expect(
                await Instances.ReversableICOInstance.methods.ParticipantCount().call()
            ).to.be.equal( "1" );  

            let participant_address = await Instances.ReversableICOInstance.methods.ParticipantsById(1).call();
            let Participant = await Instances.ReversableICOInstance.methods.ParticipantsByAddress(participant_address).call();
            
            expect(
                Participant.whitelisted
            ).to.be.equal( true );
        });
    });
    
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