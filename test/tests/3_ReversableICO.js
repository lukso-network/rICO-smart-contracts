const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const blocksPerDay = 6450;

describe("ReversableICO", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenTrackerAddress;

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

    });

    describe("Stage 1 - Deployment", function () {

        before(async function () {

        });

        it("Gas usage should be lower than 6.7m.", function () {
            expect(this.ReversableICO.receipt.gasUsed).to.be.below(6700000);
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

    describe("Stage 2 - Initialisation", function () {

        let currentBlock, StartBlock,
            AllocationBlockCount, AllocationPrice, AllocationEndBlock,
            StageCount, StageBlockCount, StagePriceIncrease, EndBlock,
            stageValidation = [];
        
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
    
            it("Allocation StartBlock matches settings", async function () {
                expect(await this.ReversableICO.methods.StartBlock().call()).to.be.equal(StartBlock.toString());
            });

            it("AllocationBlockCount matches settings", async function () {
                expect(await this.ReversableICO.methods.AllocationBlockCount().call()).to.be.equal(AllocationBlockCount.toString());
            });

            it("Allocation EndBlock matches settings", async function () {
                expect(await this.ReversableICO.methods.AllocationEndBlock().call()).to.be.equal(AllocationEndBlock.toString());
            });            
    
            it("AllocationPrice matches settings", async function () {
                expect(await this.ReversableICO.methods.AllocationPrice().call()).to.be.equal(AllocationPrice.toString());
            });

            it("EndBlock matches settings", async function () {
                expect(await this.ReversableICO.methods.EndBlock().call()).to.be.equal(EndBlock.toString());
            });
    
        });

        describe("Distribution Stages", function () {
        
            it("Distribution Stage Count is correct", async function () {
                expect(await this.ReversableICO.methods.DistributionStageCount().call()).to.be.equal(StageCount.toString());
            });

            it("First Stage settings are correct", async function () {
                const stageRefId = 0;
                const stageData = await this.ReversableICO.methods.DistributionStageByNumber(stageRefId).call();
                const stage_block_start = stageData.start_block;
                const stage_end_block = stageData.end_block;
                const stage_token_price = stageData.token_price;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Stage settings are correct", async function () {
                const stageRefId = StageCount - 1;
                const stageData = await this.ReversableICO.methods.DistributionStageByNumber(stageRefId).call();
                const stage_block_start = stageData.start_block;
                const stage_end_block = stageData.end_block;
                const stage_token_price = stageData.token_price;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Stage end_block matches contract EndBlock", async function () {
                const stageRefId = StageCount - 1;
                const stageData = await this.ReversableICO.methods.DistributionStageByNumber(stageRefId).call();
                const stage_end_block = stageData.end_block;
                expect(stage_end_block).to.be.equal(EndBlock.toString());
            });
            
            /*
            it("Property initialized should be true", async function () {

                console.log("StageCount:           ", StageCount);
                console.log("StageBlockCount:      ", StageBlockCount);
                console.log("StagePriceIncrease:   ", StagePriceIncrease);
    
                const StageStartBlock = AllocationEndBlock;
                let lastStageBlockEnd = StageStartBlock;
    
                for(let i = 0; i < StageCount; i++) {
    
                    const start_block = lastStageBlockEnd + 1;
                    const end_block = lastStageBlockEnd + StageBlockCount + 1;
                    const token_price = AllocationPrice + ( StagePriceIncrease * ( i +  1) );
    
                    console.log("Stage["+i+"]");
                    console.log("start_block:          ", start_block);
                    console.log("end_block:            ", end_block);
                    console.log("token_price:          ", token_price);
    
                    lastStageBlockEnd = end_block;
                }
                console.log("lastBlock:            ", lastStageBlockEnd);

                expect(await this.ReversableICO.methods.initialized().call()).to.be.equal(true);
            });
    
            it("Property running should be false", async function () {
                expect(await this.ReversableICO.methods.running().call()).to.be.equal(false);
            });
            */
    
    
        });

        /*
        it("DistributionStageCount matches settings", async function () {
            expect(await this.ReversableICO.methods.DistributionStageCount().call()).to.be.equal(StageCount.toString());
        });
        */

    });

    /*
    describe("Stage 3 - Funding Start", function () {
        
        before(async function () {
            
        });

        it("Gas usage should be lower than 6.7m", function () {
            // expect( this.ReversableICO.receipt.gasUsed ).to.be.lower( 6700000 );
        });

    });
    */
});