const {
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
            const contracts = await doFreshDeployment(1, setup.settings);
            this.ReversibleICO = contracts.ReversibleICOInstance;
            TokenContractInstance = contracts.TokenContractInstance;
            TokenContractAddress = TokenContractInstance.receipt.contractAddress;

            currentBlock = parseInt( await this.ReversibleICO.methods.getCurrentBlockNumber().call(), 10);
            this.jsValidator = new validatorHelper(setup.settings, currentBlock);
        });

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

            it("Property commitPhaseStartBlock matches settings", async function () {
                expect(await this.ReversibleICO.methods.commitPhaseStartBlock().call()).to.be.equal(this.jsValidator.commitPhaseStartBlock.toString());
            });

            it("Property commitPhaseEndBlock matches settings", async function () {
                expect(await this.ReversibleICO.methods.commitPhaseEndBlock().call()).to.be.equal(this.jsValidator.commitPhaseEndBlock.toString());
            });

            it("Property buyPhaseStartBlock matches settings", async function () {
                expect(await this.ReversibleICO.methods.buyPhaseStartBlock().call()).to.be.equal(this.jsValidator.buyPhaseStartBlock.toString());
            });

            it("Property buyPhaseEndBlock matches settings", async function () {
                expect(await this.ReversibleICO.methods.buyPhaseEndBlock().call()).to.be.equal(this.jsValidator.buyPhaseEndBlock.toString());
            });

        });

        describe("Contract Stages", function () {

            let allocationStageData;
            let validatorAllocationStageData;

            before(async function () {
                allocationStageData = await this.ReversibleICO.methods.stages(0).call();
                validatorAllocationStageData = this.jsValidator.stages[0];
            });

            it("Stage Count is correct", async function () {
                const stages = this.jsValidator.stageCount;
                expect(stages).to.be.equal(this.jsValidator.stages.length - 1);
                expect(await this.ReversibleICO.methods.stageCount().call()).to.be.equal(stages.toString());
            });

            it("Stage[0].startBlock is commitPhaseStartBlock and matches settings", async function () {
                expect(allocationStageData.startBlock.toString()).to.be.equal(this.jsValidator.commitPhaseStartBlock.toString());
            });

            it("Stage[0] duration is commitPhaseBlockCount", async function () {
                const count = allocationStageData.endBlock - allocationStageData.startBlock + 1;
                expect(count.toString()).to.be.equal(this.jsValidator.commitPhaseBlockCount.toString());
            });

            it("Stage[0].endBlock is commitPhaseEndBlock and matches settings", async function () {
                expect(allocationStageData.endBlock).to.be.equal(this.jsValidator.commitPhaseEndBlock.toString());
            });

            it("Stage[0].tokenPrice is commitPhasePrice and matches settings", async function () {
                expect(allocationStageData.tokenPrice.toString()).to.be.equal(this.jsValidator.commitPhasePrice.toString());
            });

            it("First Distribution Stage settings are correct", async function () {
                const stageRefId = 1;
                const stageData = await this.ReversibleICO.methods.stages((stageRefId)).call();
                const validatorStageData = this.jsValidator.stages[stageRefId];

                expect(stageData.startBlock).to.be.equal(validatorStageData.startBlock);
                expect(stageData.endBlock).to.be.equal(validatorStageData.endBlock);
                expect(stageData.tokenPrice).to.be.equal(validatorStageData.tokenPrice);
            });

            it("Last Distribution Stage settings are correct", async function () {
                const stageRefId = this.jsValidator.stageCount;
                const stageData = await this.ReversibleICO.methods.stages((stageRefId)).call();
                const validatorStageData = this.jsValidator.stages[stageRefId];

                expect(stageData.startBlock).to.be.equal(validatorStageData.startBlock);
                expect(stageData.endBlock).to.be.equal(validatorStageData.endBlock);
                expect(stageData.tokenPrice).to.be.equal(validatorStageData.tokenPrice);
            });

            it("Last Distribution Stage end_block matches contract BuyPhaseEndBlock", async function () {
                const stageRefId = this.jsValidator.stageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageRefId).call();
                const validatorStageData = this.jsValidator.stages[stageRefId];

                expect(stageData.endBlock).to.be.equal(validatorStageData.endBlock);
                expect(stageData.endBlock).to.be.equal(this.jsValidator.buyPhaseEndBlock);
            });

        });

    });


});