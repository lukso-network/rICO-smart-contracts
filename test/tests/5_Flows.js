const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
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
    REJECTED:3
}

const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

describe("Flow Testing", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenTrackerAddress, stageValidation = [], currentBlock, StartBlock,
        AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
        StageBlockCount, StagePriceIncrease, EndBlock;
    let TokenTrackerInstance;

    before(async function () {

        // this is where we should be using the store / restore blockchain 
        // functionality to speed things up when when we move to the "beforeEach" method

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
                gas: 3500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );
        TokenTrackerAddress = TokenTrackerInstance.receipt.contractAddress;

        /*
        *   Deploy RICO Contract
        */
        this.ReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");
        helpers.addresses.Rico = this.ReversableICO.receipt.contractAddress;

        // transfer tokens to rico
        await TokenTrackerInstance.methods.send(
            helpers.addresses.Rico,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });

        expect(
            await TokenTrackerInstance.methods.balanceOf(this.ReversableICO.receipt.contractAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());

        /*
        *   Add RICO Settings
        */
        currentBlock = await this.ReversableICO.methods.getCurrentBlockNumber().call();
            
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

        await this.ReversableICO.methods.addSettings(
            TokenTrackerAddress,        // address _TokenTrackerAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
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

        // do some validation
        expect( 
            await helpers.utils.getBalance(helpers, this.ReversableICO.receipt.contractAddress)
        ).to.be.bignumber.equal( new helpers.BN(0) );

        expect(
            await TokenTrackerInstance.methods.balanceOf(this.ReversableICO.receipt.contractAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());

        expect(
            await this.ReversableICO.methods.InitialTokenSupply().call()
        ).to.be.equal(
            await TokenTrackerInstance.methods.balanceOf(this.ReversableICO.receipt.contractAddress).call()
        );

        // save state, else get contract instances at address

    });

    
    describe("Dev", function () {

        const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
        let newContributionTx;

        before(async function () {
            
            /*
            // move to start of the allocation phase
            let currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, 0 );
            let EndBlock = await this.ReversableICO.methods.EndBlock().call();
            
            // send 1 eth contribution
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: helpers.addresses.Rico,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            let amount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            console.log("stage 0 start", amount);

            let whitelistOrRejectTx = await this.ReversableICO.methods.whitelistOrReject(
                participant_1,
                ContributionStates.ACCEPTED,
                0,          // start id
                15
            ).send({
                from: whitelistControllerAddress
            });


            let totalTokens = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            amount = totalTokens;
            console.log("stage 0 accepted ", 0,  amount);
            console.log("in full tokens:  ", helpers.utils.toFullToken(helpers, amount))

            // move to first distribution stage and whitelist participant

            
            currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, 1 );
            const startBlock = currentBlock;
            diffBlock = (currentBlock - startBlock);
            const blockTotals = EndBlock - startBlock;

            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 0 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 1 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 1, false, 1 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 1, false, 2 );

            
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 3 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 4 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 5 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 6, true );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 7 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 12 );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, participant_1, 12, true );

            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, accounts[0], 1, false );
            await displayTokensForParticipantAtStage(startBlock, blockTotals, this.ReversableICO, deployerAddress, accounts[0], 12, true, 100 );


            console.log("start block:      ", startBlock);
            console.log("end block:        ", EndBlock);
            console.log("length:           ", (EndBlock - startBlock) );

            */
        });

    });

    /*
    describe("view getCurrentUnlockRatio(uint8 precision)", async function () { 

        const precision = 20;
        let DistributionStartBlock, DistributionBlockLength;

        before(async function () {
            DistributionStartBlock = await this.ReversableICO.methods.DistributionStartBlock().call();
            DistributionBlockLength = await this.ReversableICO.methods.DistributionBlockLength().call();
        });

        it("Returns 0 before stage 1 start_block + 1", async function () {

            let stageId = 0;
            // jump to stage allocation start block - 1
            let currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId);

            let diffBlock = (currentBlock - DistributionStartBlock);
            let contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            let calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, DistributionBlockLength, precision);

            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( contractRatio.toString() ).to.be.equal( "0" );

            stageId = 1;
            // jump to stage start_block - 1
            currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );

            diffBlock = (currentBlock - DistributionStartBlock);
            contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, DistributionBlockLength, precision);

            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( contractRatio.toString() ).to.be.equal( "0" );

        });

        it("Returns higher than 0 if at stage 1 start_block + 1", async function () {
            const stageId = 1;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, false, 1 );
            const diffBlock = (currentBlock - DistributionStartBlock);
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, DistributionBlockLength, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio.toNumber() ).to.be.above( 0 );
        });

        it("Returns 10 ** precision at EndBlock", async function () {
            const stageId = 12;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
            const diffBlock = (currentBlock - DistributionStartBlock);
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, DistributionBlockLength, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio ).to.be.bignumber.equal( 
                new helpers.BN("10").pow(new helpers.BN(precision))
            );
        });

        it("Returns 10 ** precision at EndBlock + 1", async function () {
            const stageId = 12;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true, 1 );
            const diffBlock = (currentBlock - DistributionStartBlock);
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, diffBlock, DistributionBlockLength, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio ).to.be.bignumber.equal( 
                new helpers.BN("10").pow(new helpers.BN(precision))
            );
        });

    });
    */

    describe("view 2 getCurrentUnlockRatio(uint8 precision)", async function () { 

        const precision = 20;
        let DistributionStartBlock, DistributionBlockLength;

        before(async function () {
            DistributionStartBlock = await this.ReversableICO.methods.DistributionStartBlock().call();
            DistributionBlockLength = await this.ReversableICO.methods.DistributionBlockLength().call();
        });

        it("Returns 0 before stage 1 start_block + 1", async function () {

            let stageId = 0;
            // jump to stage allocation start block - 1
            let currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId);
            let contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            let calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, currentBlock, DistributionStartBlock, EndBlock, precision);

            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( contractRatio.toString() ).to.be.equal( "0" );

            stageId = 1;
            // jump to stage start_block - 1
            currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
            contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, currentBlock, DistributionStartBlock, EndBlock, precision);

            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( contractRatio.toString() ).to.be.equal( "0" );

        });


        it("Returns higher than 0 if at stage 1 start_block + 1", async function () {
            const stageId = 1;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, false, 1 );
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, currentBlock, DistributionStartBlock, EndBlock, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio.toNumber() ).to.be.above( 0 );
        });

        it("Returns 10 ** precision at EndBlock", async function () {
            const stageId = 12;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, currentBlock, DistributionStartBlock, EndBlock, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio ).to.be.bignumber.equal( 
                new helpers.BN("10").pow(new helpers.BN(precision))
            );
        });

        it("Returns 10 ** precision at EndBlock + 1", async function () {
            const stageId = 12;
            // jump to stage 1 start_block exactly
            const currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true, 1 );
            const contractRatio = await this.ReversableICO.methods.getCurrentUnlockRatio(precision).call();
            const calculatedRatio = helpers.utils.getCurrentUnlockRatio(helpers, currentBlock, DistributionStartBlock, EndBlock, precision);
            expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            expect( calculatedRatio ).to.be.bignumber.equal( 
                new helpers.BN("10").pow(new helpers.BN(precision))
            );
        });


    });

    describe("view getLockedTokenAmount(address)", async function () { 

        const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
        let DistributionStartBlock, DistributionBlockLength;

        before(async function () {
            DistributionStartBlock = await this.ReversableICO.methods.DistributionStartBlock().call();
            DistributionBlockLength = await this.ReversableICO.methods.DistributionBlockLength().call();

            // move to start of the allocation phase
            await jumpToContractStage ( this.ReversableICO, deployerAddress, 0 );
            await this.ReversableICO.methods.EndBlock().call();
            
            // send 1 eth contribution
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: helpers.addresses.Rico,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            let amount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            console.log("stage 0 start", amount);

            let whitelistOrRejectTx = await this.ReversableICO.methods.whitelistOrReject(
                participant_1,
                ContributionStates.ACCEPTED,
                0,          // start id
                15
            ).send({
                from: whitelistControllerAddress
            });

        });

        it("Returns 0 at any stage if participant has no contributions", async function () {

            // jump to stage allocation start block - 1
            const stageId = 0;
            let currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId, false, -1);
            const ParticipantsByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant_6).call();
            const ContractContributionTokens = ParticipantsByAddress.token_amount;

            let getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_6).call();
            // make sure we return full purchased amount.
            expect(getLockedTokenAmount).to.be.equal(ContractContributionTokens);

            // now let's validate the js calculations
            let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                helpers, currentBlock, DistributionStartBlock, EndBlock, ContractContributionTokens
            );

            expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            expect(getLockedTokenAmount.toString()).to.be.equal("0");


            currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, 1);
            getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_6).call();
            expect(getLockedTokenAmount.toString()).to.be.equal("0");

            currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, 12);
            getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_6).call();
            expect(getLockedTokenAmount.toString()).to.be.equal("0");

            currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, 12, false, 1);
            getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_6).call();
            expect(getLockedTokenAmount.toString()).to.be.equal("0");
        });

        it("Returns participant's purchased token amount before stage 1 start_block", async function () {

            // jump to stage allocation start block - 1
            const stageId = 1;
            const currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId, false, -1);

            const ParticipantsByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant_1).call();
            const ContractContributionTokens = ParticipantsByAddress.token_amount;

            const getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            expect(parseInt(ContractContributionTokens)).to.be.above(0);

            expect(getLockedTokenAmount).to.be.equal(ContractContributionTokens);

            let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                helpers, currentBlock, DistributionStartBlock, EndBlock, ContractContributionTokens
            );

            expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
        });


        it("Returns proper amount at stage 1 start_block", async function () {

            // jump to stage allocation start block
            const stageId = 1;
            const currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId);

            const ParticipantsByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant_1).call();
            const ContractContributionTokens = ParticipantsByAddress.token_amount;
            expect(parseInt(ContractContributionTokens)).to.be.above(0);

            const getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            const calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                helpers, currentBlock, DistributionStartBlock, EndBlock, ContractContributionTokens
            );
            expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
        });

        it("Returns proper amount at stage 12 end_block - 1", async function () {

            // jump to stage allocation start block
            const stageId = 12;
            const currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId, true, 0);

            const ParticipantsByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant_1).call();
            const ContractContributionTokens = ParticipantsByAddress.token_amount;
            expect(parseInt(ContractContributionTokens)).to.be.above(0);

            const getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            const calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                helpers, currentBlock, DistributionStartBlock, EndBlock, ContractContributionTokens
            );

            expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
        });

        it("Returns 0 locked tokens at stage 12 end_block ( also known as EndBlock )", async function () {

            // jump to stage allocation start block
            let stageId = 12;
            let currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, stageId, true);

            let ParticipantsByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant_1).call();
            let ContractContributionTokens = ParticipantsByAddress.token_amount;
            expect(parseInt(ContractContributionTokens)).to.be.above(0);

            let getLockedTokenAmount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();
            let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                helpers, currentBlock, DistributionStartBlock, EndBlock, ContractContributionTokens
            );

            expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            expect(getLockedTokenAmount.toString()).to.be.equal("0");
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
