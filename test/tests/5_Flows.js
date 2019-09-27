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

    });

    
    describe("transaction projectWithdraw()", async function () { 

        const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
        let DistributionStartBlock, DistributionBlockLength, currentBlock;

        before(async function () {
            DistributionStartBlock = await this.ReversableICO.methods.DistributionStartBlock().call();
            DistributionBlockLength = await this.ReversableICO.methods.DistributionBlockLength().call();

            // move to start of the allocation phase
            currentBlock = await jumpToContractStage ( this.ReversableICO, deployerAddress, 0 );
            EndBlock = await this.ReversableICO.methods.EndBlock().call();
            
            // send eth contribution
            newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: helpers.addresses.Rico,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            let amount = await this.ReversableICO.methods.getLockedTokenAmount(participant_1).call();

            // whitelist and accept contribution
            let whitelistOrRejectTx = await this.ReversableICO.methods.whitelistOrReject(
                participant_1,
                ContributionStates.ACCEPTED,
                0,          // start id
                15
            ).send({
                from: whitelistControllerAddress
            });

            // jump to stage 5
            currentBlock = await jumpToContractStage (this.ReversableICO, deployerAddress, 5);
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

                await helpers.assertInvalidOpcode( async () => {
                    let tx = await TestReversableICO.methods.projectWithdraw().send({
                        from: TeamWalletAddress
                    });
                }, "requireInitialized: Contract must be initialized");

            });
        });

        describe("contract in Distribution phase", async function () { 

            it("transaction reverts \"only TeamWalletAddress\" if called by other address", async function () {
                await helpers.assertInvalidOpcode( async () => {
                    let tx = await this.ReversableICO.methods.projectWithdraw().send({
                        from: participant_1
                    });
                }, "only TeamWalletAddress");
            });

            it("succeeds if called by TeamWalletAddress", async function () {
                let tx = await this.ReversableICO.methods.projectWithdraw().send({
                    from: TeamWalletAddress
                });
                console.log(tx.status);
            });
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