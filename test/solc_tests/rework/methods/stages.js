const {
    validatorHelper
} = require('../includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot,
} = require('../includes/deployment');

const testKey = "StageTests";

describe("ReversibleICO - Methods - Stages", function () {

    const deployingAddress = accounts[0];
    const whitelistingAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress, currentBlock;
    let TokenContractInstance;

    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, setup.settings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        currentBlock = parseInt( await this.ReversibleICO.methods.getCurrentBlockNumber().call(), 10);
        this.jsValidator = new validatorHelper(setup.settings, currentBlock);
    });

    describe("Contract Methods", async function () {

        describe("view getCurrentStage()", async function () {

            it("Returns stage 0 if at commitPhase start_block", async function () {
                const stageId = 0;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns stage 0 if at commitPhase end_block", async function () {
                const stageId = 0;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns stage 1 if at stage 1 start_block", async function () {
                const stageId = 1;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns stage 1 if at stage 1 end_block", async function () {
                const stageId = 1;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns stage 5 if at stage 5 start_block", async function () {
                const stageId = 5;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns stage 5 if at stage 5 end_block", async function () {
                const stageId = 5;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns last stage if at last stage start_block", async function () {
                const stageId = this.jsValidator.stageCount;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Returns last stage if at last stage end_block", async function () {
                const stageId = this.jsValidator.stageCount;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentStage().call();
                expect( result ).to.be.equal( stageId.toString() );
                expect( result ).to.be.equal( this.jsValidator.getCurrentStage().toString() );
            });

            it("Revert before commit phase start_block", async function () {
                const stageData = this.jsValidator.stages[0];
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.jumpToBlockNumber(
                        stageData.startBlock - 1
                    ).send({
                        from: deployingAddress, gas: 100000
                    });
                    await this.ReversibleICO.methods.getCurrentStage().call();
                }, "Block outside of rICO period.");
            });

            it("Revert after last stage end_block", async function () {
                const stageData = this.jsValidator.stages[this.jsValidator.stageCount];
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.jumpToBlockNumber(
                        stageData.endBlock + 1
                    ).send({
                        from: deployingAddress, gas: 100000
                    });
                    await this.ReversibleICO.methods.getCurrentStage().call();
                }, "Block outside of rICO period.");
            });
        });

        describe("view getStageAtBlock(uint256)", async function () {

            it("Returns stage 0 if getStageAtBlock( commitPhase.startBlock )", async function () {
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.startBlock).toString());
            });

            it("Returns stage 0 if getStageAtBlock( commitPhase.endBlock )", async function () {
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.endBlock).toString());
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.startBlock )", async function () {
                const stageId = 1;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.startBlock).toString());
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.endBlock )", async function () {
                const stageId = 1;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.endBlock).toString());
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.startBlock )", async function () {
                const stageId = 5;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.startBlock).toString());
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.endBlock )", async function () {
                const stageId = 5;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.endBlock).toString());
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.startBlock )", async function () {
                const stageId = this.jsValidator.stageCount;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.startBlock).toString());
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.endBlock )", async function () {
                const stageId = this.jsValidator.stageCount;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                expect(result).to.be.equal( stageId.toString() );
                expect(result).to.be.equal( this.jsValidator.getStageAtBlock(stageData.endBlock).toString());
            });

            it("Reverts if getStageAtBlock( last_stage.endBlock + 1 )", async function () {
                const stageId = this.jsValidator.stageCount;
                const stageData = this.jsValidator.stages[stageId];
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock + 1).call();
                }, "Block outside of rICO period.");
            });

        });


        describe("view getCurrentPrice()", async function () {

            it("Returns correct value for commit phase", async function () {
                const stageId = 0;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentPrice().call();
                expect(result).to.be.equal( commitPhasePrice.toString() );
                expect(result).to.be.equal( this.jsValidator.getCurrentPrice().toString());
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentPrice().call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getCurrentPrice().toString());
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentPrice().call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getCurrentPrice().toString());
            });

            it("Returns correct value for last stage", async function () {
                const stageId = this.jsValidator.stageCount;
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true );
                this.jsValidator.setBlockNumber(currentBlock);
                const result = await this.ReversibleICO.methods.getCurrentPrice().call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getCurrentPrice().toString());
            });

            it("Reverts after last stage end block", async function () {
                const stageData = this.jsValidator.stages[this.jsValidator.stageCount];
                await this.ReversibleICO.methods.jumpToBlockNumber(
                    stageData.endBlock + 1
                ).send({
                    from: deployingAddress, gas: 100000
                });
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getCurrentPrice().call();
                }, "Block outside of rICO period.");
            });
        });

        describe("view getPriceAtBlock(uint256)", async function () {

            it("Returns correct value for commit phase", async function () {
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call();
                expect(result).to.be.equal( commitPhasePrice.toString());
                expect(result).to.be.equal( this.jsValidator.getPriceAtBlock(stageData.startBlock).toString());
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getPriceAtBlock(stageData.startBlock).toString());
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getPriceAtBlock(stageData.startBlock).toString());
            });

            it("Returns correct value for last stage", async function () {
                const stageId = this.jsValidator.stageCount;
                const stageData = this.jsValidator.stages[stageId];
                const result = await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call();
                expect(result).to.be.equal( this.jsValidator.stages[stageId].tokenPrice.toString());
                expect(result).to.be.equal( this.jsValidator.getPriceAtBlock(stageData.startBlock).toString());

            });

            it("Reverts after last stage end block", async function () {
                const stageId = this.jsValidator.stageCount;
                const stageData = this.jsValidator.stages[stageId];
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.endBlock + 1).call();
                }, "Block outside of rICO period.");
            });
        });


        describe("view getTokenAmountForEthAtStage(uint256, uint8)", async function () {

            it("Returns correct value for 1 eth & commitPhase stage", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );
                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );

                const jsTokenAmount = this.jsValidator.getTokenAmountForEthAtStage(ethValue.toString() , stageId);
                expect( tokenAmount.toString() ).to.be.equal( jsTokenAmount.toString() );
            });


            it("Returns correct value for 1 eth & stage 1", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 1;
                const stageData = this.jsValidator.stages[stageId];

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );

                const jsTokenAmount = this.jsValidator.getTokenAmountForEthAtStage(ethValue.toString() , stageId);
                expect( tokenAmount.toString() ).to.be.equal( jsTokenAmount.toString() );
            });

            it("Returns correct value for 0.002 eth & commitPhase stage ( results in 1 full token )", async function () {
                const ethValue = helpers.solidity.ether * 0.002;
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( helpers.utils.toFullToken(helpers, tokenAmount) ).to.be.equal("1");

                const jsTokenAmount = this.jsValidator.getTokenAmountForEthAtStage(ethValue.toString() , stageId);
                expect( tokenAmount.toString() ).to.be.equal( jsTokenAmount.toString() );
            });

            it("Returns correct value for 1 wei & commitPhase stage ( results in 500 token grains )", async function () {
                const ethValue = 1;
                const stageId = 0;
                const stageData = this.jsValidator.stages[stageId];

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( tokenAmount.toString() ).to.be.equal("500");

                const jsTokenAmount = this.jsValidator.getTokenAmountForEthAtStage(ethValue.toString() , stageId);
                expect( tokenAmount.toString() ).to.be.equal( jsTokenAmount.toString() );
            });
        });

        describe("view getCurrentGlobalUnlockRatio()", async function () {

            const precision = 20;

            it("Returns 0 before stage 1 start_block", async function () {

                let stageId = 0;
                // jump to stage commit start block - 1
                let currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployingAddress, stageId);
                let contractRatio = await this.ReversibleICO.methods.calcUnlockedAmount('100000000000000000000',0).call();

                this.jsValidator.setBlockNumber(currentBlock);
                let calculatedRatio = this.jsValidator.getCurrentGlobalUnlockRatio();

                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( contractRatio.toString() ).to.be.equal( "0" );

                stageId = 1;
                currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployingAddress, stageId, false, -1);
                contractRatio = await this.ReversibleICO.methods.calcUnlockedAmount('100000000000000000000',0).call();
                
                this.jsValidator.setBlockNumber(currentBlock);
                calculatedRatio = this.jsValidator.getCurrentGlobalUnlockRatio();

                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( contractRatio.toString() ).to.be.equal( "0" );

            });

            it("Returns higher than 0 if at stage 1 start_block + 1", async function () {
                const stageId = 1;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, false, 1 );
                const contractRatio = await this.ReversibleICO.methods.calcUnlockedAmount('100000000000000000000',0).call();
                this.jsValidator.setBlockNumber(currentBlock);
                const calculatedRatio = this.jsValidator.getCurrentGlobalUnlockRatio();

                expect( calculatedRatio.toNumber() ).to.be.above( 0 );
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
            });

            it("Returns lower than max (99%) at BuyPhaseEndBlock - 1", async function () {
                const stageId = 12;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true, - 1 );
                const contractRatio = await this.ReversibleICO.methods.calcUnlockedAmount('100000000000000000000',0).call();

                this.jsValidator.setBlockNumber(currentBlock);
                const calculatedRatio = this.jsValidator.getCurrentGlobalUnlockRatio();
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                
                const maxRatio = new helpers.BN("10").pow( new helpers.BN(precision));
                // ratio should be lower than 10 ** precision
                expect(
                    calculatedRatio.lt(maxRatio)
                ).to.be.equal( true );

            });

            it("Returns max ( 10 ** precision ) at BuyPhaseEndBlock", async function () {
                const stageId = 12;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployingAddress, stageId, true, 1 );
                const contractRatio = await this.ReversibleICO.methods.calcUnlockedAmount('100000000000000000000',0).call();
                this.jsValidator.setBlockNumber(currentBlock);
                const calculatedRatio = this.jsValidator.getCurrentGlobalUnlockRatio();
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( calculatedRatio.toString() ).to.be.equal( new helpers.BN("10").pow( new helpers.BN(precision) ).toString() );
            });

        });

    });

});