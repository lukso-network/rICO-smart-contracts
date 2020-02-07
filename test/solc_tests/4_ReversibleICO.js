const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

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
    COMMITMENT_ACCEPTED:4,
    WHITELIST_APPROVE:5,
    WHITELIST_REJECT:6,
    PROJECT_WITHDRAW:7
}

const TransferTypes = {
    NOT_SET:0,
    AUTOMATIC_REFUND:1,
    WHITELIST_REJECT:2,
    PARTICIPANT_CANCEL:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAW:5
}


let errorMessage;

describe("ReversibleICO", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, stageValidation = [], currentBlock, commitPhaseStartBlock,
        commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
        StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock;
    let TokenContractInstance;

    before(async function () {
        // test requires ERC1820.instance
        if (helpers.ERC1820.instance == false) {
            console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
            process.exit();
        }

        // deploy mock contract so we can set block times. ( ReversibleICOMock )
        this.ReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

        console.log("      Gas used for deployment:", this.ReversibleICO.receipt.gasUsed);
        console.log("      Contract Address:", this.ReversibleICO.receipt.contractAddress);
        console.log("");

        helpers.addresses.Rico = this.ReversibleICO.receipt.contractAddress;

        TokenContractInstance = await helpers.utils.deployNewContractInstance(
            helpers,
            "RicoToken",
            {
                from: holder,
                arguments: [setup.settings.token.supply.toString(), []],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );

        TokenContractAddress = TokenContractInstance.receipt.contractAddress;

        await TokenContractInstance.methods.setup(
            helpers.addresses.Rico
        ).send({
            from: holder,  // initial token supply holder
        });

    });

    describe("Stage 1 - Deployment", function () {

        before(async function () {

        });

        it("Gas usage should be lower than network configuration gas.", function () {
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

    describe("Stage 3 - Transfer tokens to RICO contract address", function () {

        const ERC777data = web3.utils.sha3('777TestData');

        before(async function () {
            TokenContractInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenContractAddress);
            await TokenContractInstance.methods.send(
                helpers.addresses.Rico,
                RicoSaleSupply,
                ERC777data
            ).send({
                from: holder,  // initial token supply holder
                gas: 100000
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
                    await TokenContractInstance.methods.balanceOf(helpers.addresses.Rico).call()
                ).to.be.equal(RicoSaleSupply.toString());
            });

            it("TokenSupply property should match Contract token balance ("+RicoSaleSupply+")", async function () {
                expect(
                    await this.ReversibleICO.methods.tokenSupply().call()
                ).to.be.equal(
                    await TokenContractInstance.methods.balanceOf(helpers.addresses.Rico).call()
                );
            });

        });

    });

    describe("Contract Methods", function () {

        describe("view getCurrentStage()", async function () {

            it("Returns stage 0 if at Allocation start_block", async function () {
                const stageId = 0;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 0 if at Allocation end_block", async function () {
                const stageId = 0;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if at stage 1 start_block", async function () {
                const stageId = 1;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if at stage 1 end_block", async function () {
                const stageId = 1;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if at stage 5 start_block", async function () {
                const stageId = 5;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if at stage 5 end_block", async function () {
                const stageId = 5;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns last stage if at last stage start_block", async function () {
                const stageId = StageCount;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Returns last stage if at last stage end_block", async function () {
                const stageId = StageCount;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect( await this.ReversibleICO.methods.getCurrentStage().call() ).to.be.equal( stageId.toString() );
            });

            it("Revert before commit phase start_block", async function () {
                const stageData = await this.ReversibleICO.methods.stages(0).call();
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.jumpToBlockNumber(
                        stageData.startBlock - 1
                    ).send({
                        from: deployerAddress, gas: 100000
                    });
                    await this.ReversibleICO.methods.getCurrentStage().call();
                }, "Block outside of rICO period.");
            });

            it("Revert after last stage end_block", async function () {
                const stageData = await this.ReversibleICO.methods.stages(StageCount).call();
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.jumpToBlockNumber(
                        stageData.endBlock + 1
                    ).send({
                        from: deployerAddress, gas: 100000
                    });
                    await this.ReversibleICO.methods.getCurrentStage().call();
                }, "Block outside of rICO period.");
            });
        });

        describe("view getStageAtBlock(uint256)", async function () {

            it("Returns stage 0 if getStageAtBlock( Allocation.startBlock )", async function () {
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 0 if getStageAtBlock( Allocation.endBlock )", async function () {
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.startBlock )", async function () {
                const stageId = 1;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 1 if getStageAtBlock( stage_1.endBlock )", async function () {
                const stageId = 1;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.startBlock )", async function () {
                const stageId = 5;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage 5 if getStageAtBlock( stage_5.endBlock )", async function () {
                const stageId = 5;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.startBlock )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.startBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Returns stage last stage if getStageAtBlock( last_stage.endBlock )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock).call()
                ).to.be.equal( stageId.toString() );
            });

            it("Reverts if getStageAtBlock( last_stage.endBlock + 1 )", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getStageAtBlock(stageData.endBlock + 1).call();
                }, "Block outside of rICO period.");
            });

        });


        describe("view getCurrentPrice()", async function () {

            it("Returns correct value for commit phase", async function () {
                const stageId = 0;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                expect( await this.ReversibleICO.methods.getCurrentPrice().call() ).to.be.equal( commitPhasePrice.toString() );
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversibleICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversibleICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for last stage", async function () {
                const stageId = StageCount;
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                expect(
                    await this.ReversibleICO.methods.getCurrentPrice().call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Reverts after last stage end block", async function () {
                const stageData = await this.ReversibleICO.methods.stages(StageCount).call();
                await this.ReversibleICO.methods.jumpToBlockNumber(
                    stageData.endBlock + 1
                ).send({
                    from: deployerAddress, gas: 100000
                });
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getCurrentPrice().call();
                }, "Block outside of rICO period.");
            });
        });

        describe("view getPriceAtBlock(uint256)", async function () {

            it("Returns correct value for commit phase", async function () {
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call()
                ).to.be.equal( commitPhasePrice.toString() );
            });

            it("Returns correct value for stage 1", async function () {
                const stageId = 1;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for stage 5", async function () {
                const stageId = 5;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Returns correct value for last stage", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                expect(
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.startBlock).call()
                ).to.be.equal(
                    stageValidation[stageId - 1].token_price.toString()
                );
            });

            it("Reverts after last stage end block", async function () {
                const stageId = StageCount;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();
                await helpers.assertInvalidOpcode( async () => {
                    await this.ReversibleICO.methods.getPriceAtBlock(stageData.endBlock + 1).call();
                }, "Block outside of rICO period.");
            });
        });


        describe("view getTokenAmountForEthAtStage(uint256, uint8)", async function () {

            it("Returns correct value for 1 eth & Allocation stage", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );
                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
            });


            it("Returns correct value for 1 eth & stage 1", async function () {
                const ethValue = helpers.solidity.ether * 1;
                const stageId = 1;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
            });

            it("Returns correct value for 0.002 eth & Allocation stage ( results in 1 full token )", async function () {
                const ethValue = helpers.solidity.ether * 0.002;
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( helpers.utils.toFullToken(helpers, tokenAmount) ).to.be.equal("1");
                // console.log("tokenAmount", helpers.utils.toFullToken(helpers, tokenAmount) );

            });

            it("Returns correct value for 1 wei & Allocation stage ( results in 500 token grains )", async function () {
                const ethValue = 1;
                const stageId = 0;
                const stageData = await this.ReversibleICO.methods.stages(stageId).call();

                const calculatedTokenAmount = new helpers.BN(ethValue.toString()).mul(
                    new helpers.BN("10").pow( new BN("18") )
                ).div(
                    new helpers.BN(stageData.tokenPrice)
                );

                const tokenAmount = await this.ReversibleICO.methods.getTokenAmountForEthAtStage( ethValue.toString() , stageId).call();
                expect( tokenAmount.toString() ).to.be.equal( calculatedTokenAmount.toString() );
                expect( tokenAmount.toString() ).to.be.equal("500");
                // console.log("tokenAmount", helpers.utils.toFullToken(helpers, tokenAmount) );
            });
        });


        describe("transaction whitelist(address,approve)", async function () {

            before(async function () {
                // jump to commit start
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, 0 );
                helpers.utils.resetAccountNonceCache(helpers);
            });

            describe("if msg.sender is not whitelistControllerAddress", async function () {

                it("transaction reverts \"Only the whitelist controller can call this method.\"", async function () {

                    await helpers.assertInvalidOpcode( async () => {

                        const TransactionSender = accounts[0];

                        expect(
                            TransactionSender
                        ).to.not.be.equal(
                            await this.ReversibleICO.methods.whitelistControllerAddress.call()
                        );

                        expect(
                            await this.ReversibleICO.methods.initialized().call()
                        ).to.be.equal( true );

                        await this.ReversibleICO.methods.whitelist(
                            [accounts[1]],
                            true
                        ).send({
                            from: TransactionSender
                        });
                    }, "Only the whitelist controller can call this method.");
                });

            });

            describe("msg.sender is whitelistControllerAddress", async function () {

                describe("contract in stage 1 or 2 ( not initialized with settings )", async function () {

                    let TestReversibleICO;

                    before(async function () {
                        helpers.utils.resetAccountNonceCache(helpers);

                        // deploy mock contract so we can set block times. ( ReversibleICOMock )
                        TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
                    });

                    it("initialized is false", async function () {
                        const test = await TestReversibleICO.methods.initialized().call();
                        expect( test ).to.be.equal( false );
                    });

                    it("transaction reverts with \"Contract must be initialized.\"", async function () {
                        await helpers.assertInvalidOpcode( async () => {

                            const initialized = await TestReversibleICO.methods.initialized().call();
                            expect( initialized ).to.be.equal( false );

                            await TestReversibleICO.methods.whitelist(
                                [accounts[1]],
                                true
                            ).send({
                                from: whitelistControllerAddress
                            });
                        }, "Contract must be initialized.");
                    });
                });


                describe("contract in stage 4 - Ready for contributions", async function () {

                    describe("supplied address has no contributions", async function () {

                        it("transaction is accepted and participant address is whitelisted", async function () {

                            await this.ReversibleICO.methods.whitelist(
                                [accounts[3]],
                                true
                            ).send({
                                from: whitelistControllerAddress
                            });

                            let Participant = await this.ReversibleICO.methods.participantsByAddress(accounts[3]).call();
                            expect(
                                Participant.whitelisted
                            ).to.be.equal( true );

                        });


                    });

                    describe("supplied address has 15 contributions", async function () {

                        const TestAcceptParticipant = participant_1;
                        const TestRejectParticipant = participant_2;

                        const AcceptContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                        const RejectContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                        let TotalAcceptContributionsAmount = new helpers.BN();
                        let TotalRejectContributionsAmount = new helpers.BN();
                        let TotalAcceptGasCostAmount = new helpers.BN();
                        let TotalRejectGasCostAmount = new helpers.BN();

                        before(async function () {

                            // save contract and sender balances so we can check later
                            const InitialAcceptParticipantBalance = await helpers.utils.getBalance(helpers, TestAcceptParticipant);
                            const InitialRejectParticipantBalance = await helpers.utils.getBalance(helpers, TestRejectParticipant);

                            const InitialContractBalance = await helpers.utils.getBalance(helpers, helpers.addresses.Rico);

                            // Send 15 x 1 eth contributions from the same account.
                            for(i = 0; i < 15; i++) {

                                // send a 1 eth contribution from TestAcceptParticipant
                                fundingTx = await helpers.web3Instance.eth.sendTransaction({
                                    from: TestAcceptParticipant,
                                    to: helpers.addresses.Rico,
                                    value: AcceptContributionAmount.toString(),
                                    gasPrice: helpers.networkConfig.gasPrice
                                });

                                TotalAcceptContributionsAmount = TotalAcceptContributionsAmount.add( AcceptContributionAmount );
                                TotalAcceptGasCostAmount = TotalAcceptGasCostAmount.add(
                                    new helpers.BN(fundingTx.gasUsed).mul(
                                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                                    )
                                );

                                // send a 1 eth contribution from TestRejectParticipant
                                fundingTx = await helpers.web3Instance.eth.sendTransaction({
                                    from: TestRejectParticipant,
                                    to: helpers.addresses.Rico,
                                    value: RejectContributionAmount.toString(),
                                    gasPrice: helpers.networkConfig.gasPrice
                                });

                                TotalRejectContributionsAmount = TotalRejectContributionsAmount.add( RejectContributionAmount );
                                TotalRejectGasCostAmount = TotalRejectGasCostAmount.add(
                                    new helpers.BN(fundingTx.gasUsed).mul(
                                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                                    )
                                );
                            }

                            // make sure our ending participant's balance is correct
                            const AcceptParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestAcceptParticipant);
                            const RejectParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestRejectParticipant);

                            const newAcceptParticipantCalculatedBalance = InitialAcceptParticipantBalance
                                .sub(TotalAcceptContributionsAmount)
                                .sub(TotalAcceptGasCostAmount);

                            const newRejectParticipantCalculatedBalance = InitialRejectParticipantBalance
                                .sub(TotalRejectContributionsAmount)
                                .sub(TotalRejectGasCostAmount);

                            expect( AcceptParticipantBalanceAfter ).to.be.bignumber.equal( newAcceptParticipantCalculatedBalance );

                            expect( RejectParticipantBalanceAfter ).to.be.bignumber.equal( newRejectParticipantCalculatedBalance );

                            // make sure our ending contract balance is correct
                            const ContractBalanceAfter = await helpers.utils.getBalance(helpers, helpers.addresses.Rico);
                            const newCalculatedBalance = InitialContractBalance
                                .add(TotalAcceptContributionsAmount)
                                .add(TotalRejectContributionsAmount);

                            expect( ContractBalanceAfter ).to.be.bignumber.equal( newCalculatedBalance );

                        });

                        describe("supplied mode TRUE", async function () {

                            const ContributionCountToProcess = 15;
                            let whitelistTx;

                            before(async function () {
                                whitelistTx = await this.ReversibleICO.methods.whitelist(
                                    [TestAcceptParticipant],
                                    true,
                                ).send({
                                    from: whitelistControllerAddress
                                });
                            });

                            it("transaction is accepted", async function () {
                                expect( whitelistTx.status ).to.be.equal( true );
                            });

                            it("ApplicationEvent emitted", async function () {
                                expect(
                                    whitelistTx.events.hasOwnProperty('ApplicationEvent')
                                ).to.be.equal(
                                    true
                                );
                            });

                            it("Participant Contribution count is correct", async function () {
                                const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestAcceptParticipant).call();
                                expect(
                                    ParticipantByAddress.contributionsCount.toString()
                                ).to.be.equal(
                                    ContributionCountToProcess.toString()
                                );
                            });

                            it("Participant Token Balance is correct", async function () {
                                const ParticipantTokenBalance = await TokenContractInstance.methods.balanceOf(TestAcceptParticipant).call();

                                let TokenAmount = new helpers.BN();

                                for(let i = 0; i < StageCount; i++) {
                                    const ParticipantStageDetails = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestAcceptParticipant, i).call();
                                    TokenAmount = TokenAmount.add(new helpers.BN(
                                        ParticipantStageDetails.stageBoughtTokens
                                    ));
                                }

                                expect(
                                    ParticipantTokenBalance.toString()
                                ).to.be.equal(
                                    TokenAmount.toString()
                                );
                            });

                            describe("new contribution from the TestAcceptParticipant that is now whitelisted, is acceepted automatically.", async function () {

                                let newContributionTx, initialContributionsCount, afterContributionsCount;

                                before(async function () {
                                    let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestAcceptParticipant).call();
                                    initialContributionsCount = ParticipantByAddress.contributionsCount;

                                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                                        from: TestAcceptParticipant,
                                        to: helpers.addresses.Rico,
                                        value: AcceptContributionAmount.toString(),
                                        gasPrice: helpers.networkConfig.gasPrice
                                    });
                                });

                                it("transaction is accepted", async function () {
                                    expect( newContributionTx.status ).to.be.equal( true );
                                });

                                it("Participant Contribution Count increases by 1", async function () {
                                    let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestAcceptParticipant).call();
                                    afterContributionsCount = ParticipantByAddress.contributionsCount;
                                    expect(
                                        afterContributionsCount
                                    ).to.be.equal(
                                        ( ( parseInt(initialContributionsCount, 10) + 1 ) ).toString()
                                    );
                                });

                                it("Last Contribution is processed and has valid parameters", async function () {

                                    let currentStage = await this.ReversibleICO.methods.getCurrentStage().call();
                                    const StageDetails = await this.ReversibleICO.methods.getParticipantDetailsByStage(
                                        TestAcceptParticipant,
                                        // indexed from 0, thus inital count will match last id
                                        currentStage
                                    ).call();

                                    const commited = (parseInt(StageDetails.stageCommittedETH, 10) );
                                    const returned = (parseInt(StageDetails.stageReturnedETH, 10) );
                                    const accepted = (parseInt(StageDetails.stageAcceptedETH, 10) );
                                    const withdrawn = (parseInt(StageDetails.stageWithdrawnETH, 10) );

                                    const processedTotals = accepted + returned + withdrawn;
                                    expect( processedTotals ).to.be.equal(commited);

                                });

                            });

                        });


                        describe("supplied mode is FALSE", async function () {

                            const ContributionCountToProcess = 15;
                            let whitelistTx;
                            let initialParticipantTokenBalance;

                            before(async function () {

                                initialParticipantTokenBalance = await TokenContractInstance.methods.balanceOf(TestRejectParticipant).call();

                                let Participant = await this.ReversibleICO.methods.participantsByAddress(TestRejectParticipant).call();
                                expect(
                                    Participant.whitelisted
                                ).to.be.equal( false );

                                whitelistTx = await this.ReversibleICO.methods.whitelist(
                                    [TestRejectParticipant],
                                    false,
                                ).send({
                                    from: whitelistControllerAddress
                                });

                            });

                            it("transaction is accepted", async function () {
                                expect( whitelistTx.status ).to.be.equal( true );
                            });

                            it("ContributionEvent emitted event count matches", async function () {
                                expect(
                                    whitelistTx.events.hasOwnProperty('ApplicationEvent')
                                ).to.be.equal(
                                    true
                                );
                            });

                            it("Participant Contribution count is correct", async function () {
                                const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestRejectParticipant).call();
                                expect(
                                    ParticipantByAddress.contributionsCount.toString()
                                ).to.be.equal(
                                    ContributionCountToProcess.toString()
                                );
                            });

                            it("Participant Token Balance is the same as initial", async function () {

                                // since we're rejecting their contribution.. new balance should be the same as initial.
                                const ParticipantTokenBalance = await TokenContractInstance.methods.balanceOf(TestRejectParticipant).call();
                                expect(
                                    ParticipantTokenBalance.toString()
                                ).to.be.equal(
                                    initialParticipantTokenBalance.toString()
                                );

                            });

                            describe("new contribution from the RejectParticipant is now waiting processing.", async function () {

                                let newContributionTx, initialContributionsCount, afterContributionsCount;

                                before(async function () {
                                    let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestRejectParticipant).call();
                                    initialContributionsCount = ParticipantByAddress.contributionsCount;

                                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                                        from: TestRejectParticipant,
                                        to: helpers.addresses.Rico,
                                        value: RejectContributionAmount.toString(),
                                        gasPrice: helpers.networkConfig.gasPrice
                                    });
                                });

                                it("transaction is accepted", async function () {
                                    expect( newContributionTx.status ).to.be.equal( true );
                                });

                                it("Participant Contribution Count increases by 1", async function () {
                                    let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestRejectParticipant).call();
                                    afterContributionsCount = ParticipantByAddress.contributionsCount;
                                    expect(
                                        afterContributionsCount
                                    ).to.be.equal(
                                        ( ( parseInt(initialContributionsCount, 10) + 1 ) ).toString()
                                    );
                                });

                                it("Participant Record has valid parameters", async function () {

                                    let ParticipantTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(TestRejectParticipant).call();

                                    const received = (parseInt(ParticipantTotalStats.totalReceivedETH, 10) );
                                    const returned = (parseInt(ParticipantTotalStats.returnedETH, 10) );
                                    const accepted = (parseInt(ParticipantTotalStats.committedETH, 10) );
                                    const withdrawn = (parseInt(ParticipantTotalStats.withdrawnETH, 10) );

                                    const processedTotals = accepted + returned + withdrawn;

                                    expect( (parseInt(ParticipantTotalStats.reservedTokens, 10) ) ).to.be.above(0);
                                    expect( processedTotals ).to.be.below(received);

                                });

                            });


                        });


                    });

                });

            });

        });

        describe("view getCurrentUnlockPercentage()", async function () {

            const precision = 20;
            let BuyPhaseStartBlock, BuyPhaseBlockCount;

            before(async function () {
                BuyPhaseStartBlock = await this.ReversibleICO.methods.buyPhaseStartBlock().call();
                BuyPhaseBlockCount = await this.ReversibleICO.methods.buyPhaseBlockCount().call();
            });

            it("Returns 0 before stage 1 start_block + 1", async function () {

                let stageId = 0;
                // jump to stage commit start block - 1
                let currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId);
                let contractRatio = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
                let calculatedRatio = helpers.utils.getCurrentUnlockPercentage(helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);

                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( contractRatio.toString() ).to.be.equal( "0" );

                stageId = 1;
                // jump to stage start_block - 1
                currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId );
                contractRatio = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
                calculatedRatio = helpers.utils.getCurrentUnlockPercentage(helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);

                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( contractRatio.toString() ).to.be.equal( "0" );

            });


            it("Returns higher than 0 if at stage 1 start_block + 1", async function () {
                const stageId = 1;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, false, 1 );
                const contractRatio = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
                const calculatedRatio = helpers.utils.getCurrentUnlockPercentage(helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( calculatedRatio.toNumber() ).to.be.above( 0 );
            });

            it("Returns 0 at BuyPhaseEndBlock", async function () {
                const stageId = 12;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true );
                const contractRatio = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
                const calculatedRatio = helpers.utils.getCurrentUnlockPercentage(helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( calculatedRatio.toString() ).to.be.equal("0");
            });

            it("Returns 0 at BuyPhaseEndBlock + 1", async function () {
                const stageId = 12;
                // jump to stage 1 start_block exactly
                const currentBlock = await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, stageId, true, 1 );
                const contractRatio = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
                const calculatedRatio = helpers.utils.getCurrentUnlockPercentage(helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);
                expect( contractRatio.toString() ).to.be.equal( calculatedRatio.toString() );
                expect( calculatedRatio.toString() ).to.be.equal("0");
            });
        });

        describe("view getLockedTokenAmount(address)", async function () {

            const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
            let BuyPhaseStartBlock, BuyPhaseBlockCount;

            before(async function () {
                BuyPhaseStartBlock = await this.ReversibleICO.methods.buyPhaseStartBlock().call();
                BuyPhaseBlockCount = await this.ReversibleICO.methods.buyPhaseBlockCount().call();

                // move to start of the commit phase
                await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, 0 );

                // send 1 eth contribution
                newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: helpers.addresses.Rico,
                    value: ContributionAmount.toString(),
                    gasPrice: helpers.networkConfig.gasPrice
                });

                let whitelistTx = await this.ReversibleICO.methods.whitelist(
                    [participant_1],
                    true,
                ).send({
                    from: whitelistControllerAddress
                });

            });

            it("Returns 0 at any stage if participant has no contributions", async function () {

                // jump to stage commit start block - 1
                const stageId = 0;
                let currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, false, -1);
                const ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_6).call();
                const ContractContributionTokens = ParticipantsTotalStats.boughtTokens;

                let getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_6).call();
                // make sure we return full purchased amount.
                expect(getLockedTokenAmount).to.be.equal(ContractContributionTokens);

                // now let's validate the js calculations
                let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
                expect(getLockedTokenAmount.toString()).to.be.equal("0");


                currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, 1);
                getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_6).call();
                expect(getLockedTokenAmount.toString()).to.be.equal("0");

                currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, 12);
                getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_6).call();
                expect(getLockedTokenAmount.toString()).to.be.equal("0");

                currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, 12, false, 1);
                getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_6).call();
                expect(getLockedTokenAmount.toString()).to.be.equal("0");
            });

            it("Returns participant's purchased token amount before stage 1 start_block", async function () {

                // jump to stage commit start block - 1
                const stageId = 1;
                const currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, false, -1);

                const ParticipantTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                const ContractContributionTokens = ParticipantTotalStats.boughtTokens;

                const getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                expect(getLockedTokenAmount).to.be.equal(ContractContributionTokens);

                let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            });


            it("Returns proper amount at stage 1 start_block", async function () {

                // jump to stage commit start block
                const stageId = 1;
                const currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId);

                const ParticipantTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                const ContractContributionTokens = ParticipantTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                const getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                const calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );
                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            });

            it("Returns proper amount at stage 6 end_block - 1", async function () {

                // jump to stage commit start block
                const stageId = 6;
                const currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, true, 0);

                const ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                const ContractContributionTokens = ParticipantsTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                const getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                const calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            });

            it("Returns proper amount at stage 12 end_block - 1", async function () {

                // jump to stage commit start block
                const stageId = 12;
                const currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, true, 0);

                const ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                const ContractContributionTokens = ParticipantsTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                const getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                const calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
            });

            it("Returns 0 locked tokens at stage 12 end_block ( also known as BuyPhaseEndBlock )", async function () {

                // jump to stage commit start block
                let stageId = 12;
                let currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, true);

                let ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                let ContractContributionTokens = ParticipantsTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                let getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
                expect(getLockedTokenAmount.toString()).to.be.equal("0");
            });

            it("Returns 0 locked tokens after BuyPhaseEndBlock", async function () {

                // jump to stage commit start block
                let stageId = 12;
                let currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, true, 1);

                let ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                let ContractContributionTokens = ParticipantsTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                let getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                let calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
                expect(getLockedTokenAmount.toString()).to.be.equal("0");

                currentBlock = await helpers.utils.jumpToContractStage (this.ReversibleICO, deployerAddress, stageId, true, 1000);

                ParticipantsTotalStats = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
                ContractContributionTokens = ParticipantsTotalStats.boughtTokens;
                expect(parseInt(ContractContributionTokens)).to.be.above(0);

                getLockedTokenAmount = await this.ReversibleICO.methods.getLockedTokenAmount(participant_1).call();
                calculatedTokenAmount = helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(
                    helpers, currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, ContractContributionTokens
                );

                expect(getLockedTokenAmount).to.be.equal(calculatedTokenAmount.toString());
                expect(getLockedTokenAmount.toString()).to.be.equal("0");
            });

        });

    });

    describe("Stage 4 - Funding Start", function () {

        /*
        before(async function () {
            // jump to commit start
            // await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, 0 );
            await helpers.utils.jumpToContractStage ( this.ReversibleICO, deployerAddress, 1 );
        });
        */
    });
});
