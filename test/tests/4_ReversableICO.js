const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 6450;

describe("ReversableICO", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenTrackerAddress, stageValidation = [], currentBlock, StartBlock,
        AllocationBlockCount, AllocationPrice, AllocationEndBlock, StageCount,
        StageBlockCount, StagePriceIncrease, EndBlock;
    let TokenTrackerInstance;

    before(async function () {
        // test requires ERC1820.instance
        if (helpers.ERC1820.instance == false) {
            console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
            process.exit();
        }

        TokenTrackerAddress = helpers.addresses.Token;

        // deploy mock contract so we can set block times. ( ReversableICOMock )
        this.ReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICOMock");

        console.log("      Gas used for deployment:", this.ReversableICO.receipt.gasUsed);
        console.log("      Contract Address:", this.ReversableICO.receipt.contractAddress);
        console.log("");

        helpers.addresses.Rico = this.ReversableICO.receipt.contractAddress;

    });

    describe("Stage 1 - Deployment", function () {

        before(async function () {

        });

        it("Gas usage should be lower than network configuration gas.", function () {
            expect(this.ReversableICO.receipt.gasUsed).to.be.below(helpers.networkConfig.gas);
        });

        it("Property deployerAddress should be " + deployerAddress, async function () {
            expect(await this.ReversableICO.methods.deployerAddress().call()).to.be.equal(deployerAddress);
        });

        it("Property initialized should be false", async function () {
            expect(await this.ReversableICO.methods.initialized().call()).to.be.equal(false);
        });

        it("Property running should be false", async function () {
            expect(await this.ReversableICO.methods.running().call()).to.be.equal(false);
        });

        it("Property frozen should be false", async function () {
            expect(await this.ReversableICO.methods.frozen().call()).to.be.equal(false);
        });

        it("Property ended should be false", async function () {
            expect(await this.ReversableICO.methods.ended().call()).to.be.equal(false);
        });

        it("Property TokenTrackerAddress should be address(0)", async function () {
            expect(await this.ReversableICO.methods.TokenTrackerAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

        it("Property whitelistControllerAddress should be address(0)", async function () {
            expect(await this.ReversableICO.methods.whitelistControllerAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

    });

    describe("Stage 2 - Transfer tokens to RICO contract address", function () {
        
        const ERC777data = web3.utils.sha3('777TestData');

        before(async function () {
            TokenTrackerInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenTrackerAddress);
            await TokenTrackerInstance.methods.send(
                helpers.addresses.Rico,
                RicoSaleSupply,
                ERC777data
            ).send({
                from: holder,  // initial token supply holder
                gas: 100000
            });
        });

        it("RICO Contract should have the correct token balance ("+RicoSaleSupply+")", async function () {
            expect(
                await TokenTrackerInstance.methods.balanceOf(helpers.addresses.Rico).call()
            ).to.be.equal(RicoSaleSupply.toString());
        });

    });

    describe("Stage 3 - Initialisation - addSettings()", function () {

        before(async function () {

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
            
            // override for easy dev.. remove later
            /*
            StartBlock = 100;
            AllocationBlockCount = 100; 
            StageBlockCount = 100;
            */

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

        });

        describe("Contract settings", function () {
        
            it("Property initialized should be true", async function () {
                expect(await this.ReversableICO.methods.initialized().call()).to.be.equal(true);
            });
    
            it("Property running should be false", async function () {
                expect(await this.ReversableICO.methods.running().call()).to.be.equal(false);
            });
    
            it("Property frozen should be false", async function () {
                expect(await this.ReversableICO.methods.frozen().call()).to.be.equal(false);
            });
    
            it("Property ended should be false", async function () {
                expect(await this.ReversableICO.methods.ended().call()).to.be.equal(false);
            });
    
            it("Property TokenTrackerAddress should be deployed ERC777 Token Contract address", async function () {
                expect(await this.ReversableICO.methods.TokenTrackerAddress().call()).to.be.equal(TokenTrackerAddress);
            });
    
            it("Property whitelistControllerAddress should be " + whitelistControllerAddress, async function () {
                expect(await this.ReversableICO.methods.whitelistControllerAddress().call()).to.be.equal(whitelistControllerAddress);
            });
    
            it("EndBlock matches settings", async function () {
                expect(await this.ReversableICO.methods.EndBlock().call()).to.be.equal(EndBlock.toString());
            });
    
        });

        describe("Contract Stages", function () {
        
            let allocationStageData;
            before(async function () {
                allocationStageData = await this.ReversableICO.methods.StageByNumber(0).call();
            });

            it("Stage Count is correct", async function () {
                // account for the allocation stage and add 1
                const stages = (StageCount + 1);
                expect(await this.ReversableICO.methods.ContractStageCount().call()).to.be.equal(stages.toString());
            });

            it("Allocation StartBlock matches settings", async function () {
                expect(allocationStageData.start_block).to.be.equal(StartBlock.toString());
            });

            it("Allocation duration is AllocationBlockCount", async function () {
                const count = allocationStageData.end_block - allocationStageData.start_block;
                expect(count.toString()).to.be.equal(AllocationBlockCount.toString());
            });

            it("Allocation EndBlock matches settings", async function () {
                expect(allocationStageData.end_block).to.be.equal(AllocationEndBlock.toString());
            });            
    
            it("AllocationPrice matches settings", async function () {
                expect(allocationStageData.token_price).to.be.equal(AllocationPrice.toString());
            });

            it("First Distribution Stage settings are correct", async function () {
                const stageRefId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber((stageRefId + 1)).call();
                const stage_block_start = stageData.start_block;
                const stage_end_block = stageData.end_block;
                const stage_token_price = stageData.token_price;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Distribution Stage settings are correct", async function () {
                const stageRefId = StageCount - 1;
                const stageData = await this.ReversableICO.methods.StageByNumber((stageRefId + 1)).call();
                const stage_block_start = stageData.start_block;
                const stage_end_block = stageData.end_block;
                const stage_token_price = stageData.token_price;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Distribution Stage end_block matches contract EndBlock", async function () {
                const stageRefId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageRefId).call();
                const stage_end_block = stageData.end_block;
                expect(stage_end_block).to.be.equal(EndBlock.toString());
            });
    
        });

        describe("Contract Assets", function () {
        
            before(async function () {
            });

            it("RICO Contract should have 0 eth", async function () {
                const ContractBalance = await helpers.utils.getBalance(helpers, helpers.addresses.Rico);
                expect( ContractBalance ).to.be.bignumber.equal( new helpers.BN(0) );
            });

            it("RICO Contract should have the correct token balance ("+RicoSaleSupply+")", async function () {
                expect(
                    await TokenTrackerInstance.methods.balanceOf(helpers.addresses.Rico).call()
                ).to.be.equal(RicoSaleSupply.toString());
            });

            it("InitialTokenSupply property should match Contract token balance ("+RicoSaleSupply+")", async function () {
                expect(
                    await this.ReversableICO.methods.InitialTokenSupply().call()
                ).to.be.equal(
                    await TokenTrackerInstance.methods.balanceOf(helpers.addresses.Rico).call()
                );
            });

        });

    });

    describe("Contract Methods", function () {

        describe("getCurrentStage()", async function () { 

            it("Returns stage 0 if at Allocation start_block", async function () {
                const stageId = 0;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 0 if at Allocation end_block", async function () {
                const stageId = 0;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if at stage 1 start_block", async function () {
                const stageId = 1;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if at stage 1 end_block", async function () {
                const stageId = 1;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if at stage 5 start_block", async function () {
                const stageId = 5;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if at stage 5 end_block", async function () {
                const stageId = 5;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns last stage if at last stage start_block", async function () {
                const stageId = StageCount;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns last stage if at last stage end_block", async function () {
                const stageId = StageCount;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns 255 after last stage end_block", async function () {
                const stageData = await this.ReversableICO.methods.StageByNumber(StageCount).call();
                await this.ReversableICO.methods.jumpToBlockNumber(
                    stageData.end_block + 1
                ).send({
                    from: deployerAddress, gas: 100000
                });
                expect( await this.ReversableICO.methods.getCurrentStage().call() ).to.be.equal( "255" );
            });
        });

        describe("getStageAtBlock(uint256)", async function () { 

            it("Returns stage 0 if getStageAtBlock( Allocation.start_block )", async function () {
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.start_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 0 if getStageAtBlock( Allocation.end_block )", async function () {
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.end_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.start_block )", async function () {
                const stageId = 1;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.start_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.end_block )", async function () {
                const stageId = 1;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.end_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.start_block )", async function () {
                const stageId = 5;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.start_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.end_block )", async function () {
                const stageId = 5;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.end_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.start_block )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.start_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.end_block )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.end_block).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns 255 if getStageAtBlock( last_stage.end_block + 1 )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getStageAtBlock(stageData.end_block + 1).call()
                ).to.be.equal( "255" );
            });
        });


        describe("getCurrentPrice()", async function () { 

            it("Returns correct value for Allocation phase", async function () {
                const stageId = 0;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId );
                expect( await this.ReversableICO.methods.getCurrentPrice().call() ).to.be.equal( AllocationPrice.toString() );
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversableICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversableICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for last stage", async function () {
                const stageId = StageCount;
                await jumpToContractStage ( this.ReversableICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversableICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns 0 after last stage ended", async function () {
                const stageData = await this.ReversableICO.methods.StageByNumber(StageCount).call();
                await this.ReversableICO.methods.jumpToBlockNumber(
                    stageData.end_block + 1
                ).send({
                    from: deployerAddress, gas: 100000
                });

                expect( await this.ReversableICO.methods.getCurrentPrice().call() ).to.be.equal("0");
            });
        });

        describe("getPriceAtBlock(uint256)", async function () { 

            it("Returns correct value for Allocation phase", async function () {
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getPriceAtBlock(stageData.start_block).call()
                ).to.be.equal( AllocationPrice.toString() );
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getPriceAtBlock(stageData.start_block).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getPriceAtBlock(stageData.start_block).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for last stage", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getPriceAtBlock(stageData.start_block).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns 0 after last stage ended", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                expect(
                    await this.ReversableICO.methods.getPriceAtBlock(stageData.end_block + 1).call()
                ).to.be.equal( "0" );
            });
        });


        describe("getTokenAmountForEthAtStage(uint256, uint8)", async function () { 

            it("Returns correct value for 1 eth & Allocation stage", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();
                
                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.token_price)
                );
                const tokenAmount = await this.ReversableICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
            });


            it("Returns correct value for 1 eth & stage 1", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 1;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.token_price)
                );

                const tokenAmount = await this.ReversableICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
            });

            it("Returns correct value for 0.002 eth & Allocation stage ( results in 1 full token )", async function () {
                const ethValue = helpers.solidity.ether * 0.002;
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.token_price)
                );

                const tokenAmount = await this.ReversableICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( helpers.utils.toFullToken(helpers, tokenAmount) ).to.be.equal("1");
                // console.log("tokenAmount", helpers.utils.toFullToken(helpers, tokenAmount) );

            });

            it("Returns correct value for 1 wei & Allocation stage ( results in 500 token grains )", async function () {
                const ethValue = 1;
                const stageId = 0;
                const stageData = await this.ReversableICO.methods.StageByNumber(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.token_price)
                );

                const tokenAmount = await this.ReversableICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( tokenAmount.toString() ).to.be.equal("500");
                // console.log("tokenAmount", helpers.utils.toFullToken(helpers, tokenAmount) );
            });
        });

    });

    describe("Stage 4 - Funding Start", function () {
        
        before(async function () {
            // jump to allocation start
            // await jumpToContractStage ( this.ReversableICO, deployerAddress, 0 );
            await jumpToContractStage ( this.ReversableICO, deployerAddress, 1 );
        });

        it("account[0] can commit funds ( 30.000 eth )", async function () {
            
            const participant = accounts[0];
            const funds = new helpers.BN("50000").mul( helpers.solidity.etherBN );
            const max_accepted_funds = new helpers.BN(
                (await this.ReversableICO.methods.maxEth().call()).toString()
            );

            await helpers.web3Instance.eth.sendTransaction({
                from: participant,
                to: helpers.addresses.Rico,
                value: funds.toString(),
            });

            // contract balance matches funds sent
            const ContractBalance = await helpers.utils.getBalance(helpers, helpers.addresses.Rico);
            expect( ContractBalance ).to.be.bignumber.equal( max_accepted_funds );

            
            console.log("participant", participant);
            console.log("funds", helpers.utils.toFullToken(helpers, funds) + " eth");
            
            console.log("receivedEth", helpers.utils.toFullToken(
                helpers,
                await this.ReversableICO.methods.receivedEth().call()
            ) + " eth");
            console.log("max_accepted_funds", helpers.utils.toFullToken(
                helpers,
                max_accepted_funds
            ) + " eth");

            const ParticipantCount = await this.ReversableICO.methods.ParticipantCount().call(); 
            console.log("ParticipantCount", ParticipantCount);

            // let's check contributions
            let ParticipantByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant).call();
            console.log("ParticipantByAddress", ParticipantByAddress);

            let ParticipantContributionDetails = await this.ReversableICO.methods.ParticipantContributionDetails(participant, "0").call();
            console.log("ParticipantContributionDetails", ParticipantContributionDetails);

            // 15000000000000000000000000;
            
            let contractBalance = await TokenTrackerInstance.methods.balanceOf(helpers.addresses.Rico).call();
            console.log("contractTokenBalance", contractBalance);

            let tx = await this.ReversableICO.methods.whitelistOrReject(
                participant,
                2,
                0,
                10
            ).send({from: deployerAddress});

            console.log("whitelistOrReject gas:", tx.gasUsed.toString());

            ParticipantByAddress = await this.ReversableICO.methods.ParticipantsByAddress(participant).call();
            console.log("ParticipantByAddress", ParticipantByAddress);

            ParticipantContributionDetails = await this.ReversableICO.methods.ParticipantContributionDetails(participant, "0").call();
            console.log("ParticipantContributionDetails", ParticipantContributionDetails);

            contractBalance = await TokenTrackerInstance.methods.balanceOf(helpers.addresses.Rico).call();
            console.log("contractTokenBalance", contractBalance);

            let ParticipantTokenBalance = await TokenTrackerInstance.methods.balanceOf(participant).call();
            console.log("ParticipantTokenBalance", ParticipantTokenBalance);

        });

    });


    /*
    describe("Dev", function () {

        before(async function () {

            let val = helpers.solidity.ether;
            test = await this.ReversableICO.methods.getTokenAmountForEthAtStageAndMore(
                val.toString(),
                0
            ).call();
            console.log("amount", test);

            val = helpers.solidity.ether * 0.002
            test = await this.ReversableICO.methods.getTokenAmountForEthAtStageAndMore(
                val.toString(),
                0
            ).call();
            console.log("amount", val, test);

            val = helpers.solidity.ether * 0.00002
            test = await this.ReversableICO.methods.getTokenAmountForEthAtStageAndMore(
                val.toString(),
                0
            ).call();
            console.log("amount", val, test );

            console.log(helpers.utils.toFullToken(helpers, test[0]))
        });

        it("works", function () {
            // expect( this.ReversableICO.receipt.gasUsed ).to.be.lower( 6700000 );
        });

    });
    */
});

async function jumpToContractStage ( ReversableICO, deployerAddress, stageId, end = false ) {
    const stageData = await ReversableICO.methods.StageByNumber(stageId).call();
    let block = stageData.start_block;
    if(end) {
        block = stageData.end_block;
    }
    await ReversableICO.methods.jumpToBlockNumber(
        block
    ).send({
        from: deployerAddress, gas: 100000
    });
}
