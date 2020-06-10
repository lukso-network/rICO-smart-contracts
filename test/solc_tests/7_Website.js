const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect
const fs = require('fs');

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
    NOT_SET:0,
    AUTOMATIC_REFUND:1,
    WHITELIST_REJECTED:2,
    CONTRIBUTION_CANCELED:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAWN:5
}

const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let snapshotsEnabled = true;
let snapshots = [];

const deployingAddress = accounts[0];
const whitelistingAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    commitPhaseStartBlock, commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock, TokenContractInstance,
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

    /*
    *   Deploy RICO Contract
    */
    ReversibleICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
    ReversibleICOReceipt = ReversibleICOInstance.receipt;
    ReversibleICOAddress = ReversibleICOInstance.receipt.contractAddress;
    // helpers.addresses.Rico = ReversibleICOAddress;

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
    let currentBlock = await ReversibleICOInstance.methods.getCurrentEffectiveBlockNumber().call();

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

    const StageStartBlock = commitPhaseEndBlock;
    let lastStageBlockEnd = StageStartBlock;

    for(let i = 0; i < StageCount; i++) {

        const start_block = lastStageBlockEnd + 1;
        const end_block = lastStageBlockEnd + StageBlockCount + 1;
        const token_price = commitPhasePrice + ( StagePriceIncrease * ( i +  1) );

        stageValidation.push( {
            start_block: start_block,
            end_block: end_block,
            token_price: token_price
        });

        lastStageBlockEnd = end_block;
    }


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

    expect(
        await ReversibleICOInstance.methods.tokenSupply().call()
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

    describe("1 day before Allocation Start", async function () {

        const name = "before_allocation";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
        });

        it("validated", async function () {

            expect(
                await Instances.ReversibleICOInstance.methods.initialized().call()
            ).to.be.equal( true );
            await helpers.assertInvalidOpcode( async () => {
                await Instances.ReversibleICOInstance.methods.getCurrentStage().call();
            }, "Block outside of rICO period.");
        });
    });

    describe("contract in stage 0 - at first block in Allocation Start", async function () {

        const name = "stage_0_at_allocation";
        let Instances;
        before(async () => {
            helpers.utils.resetAccountNonceCache(helpers);
            Instances = await doFreshDeployment(name);
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployingAddress, 0);
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
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployingAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                data: '0x3c7a3aff', // commit()
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
                await Instances.ReversibleICOInstance.methods.participantCount().call()
            ).to.be.equal( "1" );

            let participant_address = await Instances.ReversibleICOInstance.methods.participantsById(0).call();
            let Participant = await Instances.ReversibleICOInstance.methods.participants(participant_address).call();

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
            currentBlock = await helpers.utils.jumpToContractStage (Instances.ReversibleICOInstance, deployingAddress, 0);
            const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

            let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount.toString(),
                data: '0x3c7a3aff', // commit()
                gasPrice: helpers.networkConfig.gasPrice
            });

            await Instances.ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true,
            ).send({
                from: whitelistingAddress
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
                await Instances.ReversibleICOInstance.methods.participantCount().call()
            ).to.be.equal( "1" );

            let participant_address = await Instances.ReversibleICOInstance.methods.participantsById(0).call();
            let Participant = await Instances.ReversibleICOInstance.methods.participants(participant_address).call();

            expect(
                Participant.whitelisted
            ).to.be.equal( true );
        });
    });

});
