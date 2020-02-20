const {
    RICOSettings,
    validatorHelper
} = require('./includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment
} = require('./includes/deployment');

global.snapshots = [];
global.testKey = "StageTests";

describe("ReversibleICO", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, stageValidation = [], currentBlock, commitPhaseStartBlock,
        commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
        StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock;
    let TokenContractInstance;

    before(async function () {
        requiresERC1820Instance();
    });

    describe("Stage 1 - Deployment", async function () {

        before(async function () {
            const contracts = await doFreshDeployment(0);
            this.ReversibleICO = contracts.ReversibleICOInstance;
            TokenContractInstance = contracts.TokenContractInstance;
            TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        });

        it("Gas usage should be lower than network configuration gas.", async function () {
            expect(this.ReversibleICO.receipt.gasUsed).to.be.below(helpers.networkConfig.gas);
        });

        it("Property deployerAddress should be " + deployerAddress, async function () {
            expect(await this.ReversibleICO.methods.deployerAddress().call()).to.be.equal(deployerAddress);
        });

        it("Property initialized should be false", async function () {
            expect(await this.ReversibleICO.methods.initialized().call()).to.be.equal(false);
        });

        it("Property frozen should be false", async function () {
            expect(await this.ReversibleICO.methods.frozen().call()).to.be.equal(false);
        });

        it("Property TokenContractAddress should be address(0x0)", async function () {
            expect(await this.ReversibleICO.methods.tokenContractAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

        it("Property whitelistControllerAddress should be address(0x0)", async function () {
            expect(await this.ReversibleICO.methods.whitelistControllerAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

    });


    describe("Stage 2 - Initialisation - init()", function () {

        before(async function () {
            const contracts = await doFreshDeployment(1, RICOSettings);
            this.ReversibleICO = contracts.ReversibleICOInstance;
            TokenContractInstance = contracts.TokenContractInstance;
            TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        });

        /*

        before(async function () {

            currentBlock = await this.ReversibleICO.methods.getCurrentBlockNumber().call();

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
            BuyPhaseEndBlock = commitPhaseEndBlock + StageBlockCount * StageCount;

            let lastStageBlockEnd = commitPhaseEndBlock;

            for(let i = 0; i < StageCount; i++) {

                const start_block = lastStageBlockEnd + 1;
                const end_block = lastStageBlockEnd + StageBlockCount;
                const token_price = commitPhasePrice + ( StagePriceIncrease * ( i + 1) );

                stageValidation.push( {
                    start_block: start_block,
                    end_block: end_block,
                    token_price: token_price
                });

                    lastStageBlockEnd = end_block;
            }

            await this.ReversibleICO.methods.init(
                TokenContractAddress,        // address _tokenContractAddress
                whitelistControllerAddress, // address _whitelistControllerAddress
                projectWalletAddress,       // address _projectWalletAddress
                commitPhaseStartBlock,                 // uint256 _commitPhaseStartBlock
                commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
                commitPhasePrice,            // uint256 _commitPhasePrice in wei
                StageCount,                 // uint8   _stageCount
                StageBlockCount,            // uint256 _stageBlockCount
                StagePriceIncrease          // uint256 _stagePriceIncrease in wei
            ).send({
                from: deployerAddress,  // deployer
                gas: 3000000
            });

        });
        */

        describe("Contract settings", function () {

            it("Property initialized should be true", async function () {
                expect(await this.ReversibleICO.methods.initialized().call()).to.be.equal(true);
            });

            it("Property frozen should be false", async function () {
                expect(await this.ReversibleICO.methods.frozen().call()).to.be.equal(false);
            });

            it("Property TokenContractAddress should be deployed ERC777 Token Contract address", async function () {
                expect(await this.ReversibleICO.methods.tokenContractAddress().call()).to.be.equal(TokenContractAddress);
            });

            it("Property whitelistControllerAddress should be " + whitelistControllerAddress, async function () {
                expect(await this.ReversibleICO.methods.whitelistControllerAddress().call()).to.be.equal(whitelistControllerAddress);
            });

            it("Property projectWalletAddress should be " + projectWalletAddress, async function () {
                expect(await this.ReversibleICO.methods.projectWalletAddress().call()).to.be.equal(projectWalletAddress);
            });

            it("BuyPhaseEndBlock matches settings", async function () {
                expect(await this.ReversibleICO.methods.buyPhaseEndBlock().call()).to.be.equal(BuyPhaseEndBlock.toString());
            });

        });

        describe("Contract Stages", function () {

            let allocationStageData;
            before(async function () {
                allocationStageData = await this.ReversibleICO.methods.stages(0).call();
            });

            it("Stage Count is correct", async function () {
                // account for the commit stage and add 1
                const stages = StageCount;
                expect(await this.ReversibleICO.methods.stageCount().call()).to.be.equal(stages.toString());
            });

            it("Allocation commitPhaseStartBlock matches settings", async function () {
                expect(allocationStageData.startBlock.toString()).to.be.equal(commitPhaseStartBlock.toString());
            });

            it("Allocation duration is commitPhaseBlockCount", async function () {
                const count = allocationStageData.endBlock - allocationStageData.startBlock + 1;
                expect(count.toString()).to.be.equal(commitPhaseBlockCount.toString());
            });

            it("Allocation BuyPhaseEndBlock matches settings", async function () {
                expect(allocationStageData.endBlock).to.be.equal(commitPhaseEndBlock.toString());
            });

            it("commitPhasePrice matches settings", async function () {
                expect(allocationStageData.tokenPrice.toString()).to.be.equal(commitPhasePrice.toString());
            });

            it("First Distribution Stage settings are correct", async function () {
                const stageRefId = 0;
                const stageData = await this.ReversibleICO.methods.stages((stageRefId + 1)).call();
                const stage_block_start = stageData.startBlock;
                const stage_end_block = stageData.endBlock;
                const stage_token_price = stageData.tokenPrice;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Distribution Stage settings are correct", async function () {
                const stageRefId = StageCount - 1;
                const stageData = await this.ReversibleICO.methods.stages((stageRefId + 1)).call();
                const stage_block_start = stageData.startBlock;
                const stage_end_block = stageData.endBlock;
                const stage_token_price = stageData.tokenPrice;

                expect(stage_block_start).to.be.equal(stageValidation[stageRefId].start_block.toString());
                expect(stage_end_block).to.be.equal(stageValidation[stageRefId].end_block.toString());
                expect(stage_token_price).to.be.equal(stageValidation[stageRefId].token_price.toString());
            });

            it("Last Distribution Stage end_block matches contract BuyPhaseEndBlock", async function () {
                const stageRefId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageRefId).call();
                const stage_end_block = stageData.endBlock;
                expect(stage_end_block).to.be.equal(BuyPhaseEndBlock.toString());
            });

        });

    });


});