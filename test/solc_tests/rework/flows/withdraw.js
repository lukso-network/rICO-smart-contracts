const {
    validatorHelper,
    clone
} = require('../includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot,
} = require('../includes/deployment');

const testKey = "WithdrawTests";

describe("ReversibleICO - Withdraw Testing", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.blocksPerDay = 1000;
    customTestSettings.rico.stageDays = 10;
    customTestSettings.rico.stageCount = 10;

    const commitPhasePrice = helpers.solidity.ether * 0.002;
    const TestParticipant = participant_1;

    priceInStage = (_stageId) => {
        // commitPhasePrice + stage * stagePriceIncrease
        return new BN(customTestSettings.rico.commitPhasePrice).add(
            new BN(_stageId).mul(
                new BN(customTestSettings.rico.stagePriceIncrease)
            )
        );
    }

    async function revertToFreshDeployment() {

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        // jump to phase 0
        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));
    }

    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        // jump to phase 0
        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));
    });

    // describe("Precision Testing", async function () {
 
    //     before(async () => {
    //         await revertToFreshDeployment();
    //     });

    //     it("Whitelist buyer", async function () {
    //         whitelistTx = await this.ReversibleICO.methods.whitelist(
    //             [TestParticipant],
    //             true
    //         ).send({
    //             from: whitelistControllerAddress
    //         });
    //     });

    //     it("Buy 1 tokens in phase 0", async function () {
    //         // jump to phase 0
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

    //         let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
    //         expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

    //         const ContributionAmount = 1 * commitPhasePrice;
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount,
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("1000000000000000000");

    //         ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
    //         expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
    //     });
        
    //     it("Expect locked tokens to be 1 tokens", async function () {
    //         const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         expect(locked).to.be.equal("1000000000000000000");
    //     });

    //     it("Withdraw almost all tokens", async function () {
    //         await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "999999999999999999")
    //             .send({ from: TestParticipant, gas: 1000000 });
    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("1");
    //     });

    //     it("Withdraw last token", async function () {
    //         await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
    //             .send({ from: TestParticipant, gas: 1000000 });
    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("0");
    //     });

    //     it("boughtTokens equals returnedTokens ( since we returned everything )", async function () {
    //         const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
    //         const boughtTokens = result.stageBoughtTokens;
    //         const returnedTokens = result.stageReturnedTokens;
    //         expect(boughtTokens).to.be.equal(returnedTokens, "boughtTokens does not match returnedTokens");
    //     });

    //     it.skip("committedETH equals withdrawnETH ( since we returned everything )", async function () {
    //         const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
    //         const committedETH = result.stageCommittedETH;
    //         const withdrawnETH = result.stageWithdrawnETH;
    //         expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
    //     });

    //     // it("Check participant details", async function () {
    //     //     const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
    //     //     const totalReceivedETH = result["stageTotalReceivedETH"];
    //     //     const returnedETH = result["stageReturnedETH"];
    //     //     const committedETH = result["stageCommittedETH"];
    //     //     const withdrawnETH = result["stageWithdrawnETH"];
    //     //     const allocatedETH = result["stageAllocatedETH"];
    //     //     const reservedTokens = result["stageReservedTokens"];

    //     //     expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
    //     // });
    // });

    // describe("Check getParticipantPendingETH before and after whitelisting", async function () {

    //     before(async () => {
    //         await revertToFreshDeployment();
    //     });

    //     it("Buy 2 tokens in phase 0", async function () {
    //         // jump to phase 0
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

    //         const ContributionAmount = 2 * commitPhasePrice;
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount,
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("0");
    //     });

    //     it("Check participant available ETH", async function () {
    //         const result = await this.ReversibleICO.methods.getParticipantPendingETH(TestParticipant).call();
    //         expect(new BN(result)).to.be.bignumber.equal(new BN(2).mul(new BN(commitPhasePrice)));
    //     });

    //     it("Whitelist buyer", async function () {
    //         await this.ReversibleICO.methods.whitelist(
    //             [TestParticipant],
    //             true
    //         ).send({
    //             from: whitelistControllerAddress
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("2000000000000000000");
    //     });

    //     it("Check participant available ETH", async function () {
    //         const result = await this.ReversibleICO.methods.getParticipantPendingETH(TestParticipant).call();
    //         expect(new BN(result)).to.be.bignumber.equal(new BN(0));
    //     });
    // });

    describe("Withdraw token tests", async function () {

        let aggregatedStats;
        let contributionTotals = new BN("0");

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
        });

        after(async () => {
            await saveSnapshot("WithdrawTests_Phase_2_withdraw_end");
        });


        it("Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("1 - Buy 1 tokens in stage 0", async function () {
            const stageId = 0;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

            // enough for 1 token
            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("2 - Buy 1 tokens in stage 1", async function () {
            const stageId = 1;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("2");

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            // should have 2 tokens * 10 ** decimals
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("3 - Jump to stage 1 end block (10 % unlocked)", async function () {
            const stageId = 1;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            const unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("10000000000000000000");

        });

        it("Expect full token balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 1.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1800000000000000000");
        });

        it("Expect unlocked tokens to be 0.2 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("200000000000000000");
        });

        it("4 - Return all tokens", async function () {
            await TokenContractInstance.methods.transfer(RICOContractAddress, "2000000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0.2 tokens (10 %)", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("200000000000000000");

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Load Participant's aggregatedStats", async function () {
            // set results globally
            aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the 2 token contributions", async function () {

            expect(aggregatedStats.allocatedETH).to.be.equal(
                // committedETH - withdrawnETH
                new BN(aggregatedStats.committedETH).sub(
                    new BN(aggregatedStats.withdrawnETH)
                ).toString()
            );

            expect(aggregatedStats.allocatedETH).to.be.equal(
                contributionTotals.div( new BN("100") ).mul( new BN("10")).toString()
            )
        });

        it("Expect Participant's aggregatedStats.allocatedTokens to be 0.2 tokens (10 %)", async function () {
            expect(aggregatedStats.allocatedTokens).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 0.2 tokens", async function () {

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6, TokenContractInstance );

            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("200000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("0");
        });

        it("Return one more token should not be possible", async function () {
            helpers.utils.resetAccountNonceCache(helpers);
            await helpers.assertInvalidOpcode(async () => {
                await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
                    .send({ from: TestParticipant, gas: 1000000 });
            }, "revert Withdraw not possible. Participant has no locked tokens.");
        });

        it("Expect balance to remain 0.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("200000000000000000");
        });


        it("5 - Buy 1 tokens in stage 2 end (20%)", async function () {
            const stageId = 2;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("2");

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("3");

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            // should have 0.2 tokens + 1 token
            expect(balance).to.be.equal("1200000000000000000");
        });

        it("Expect full token balance to be 1.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1200000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 0.40 tokens (0.2 + 20% of last token)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        it("6 - Buy 1 tokens in stage 4 end (40%)", async function () {
            const stageId = 4;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("3");

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("4");

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            // should have 0.2 tokens + 1 token
            expect(balance).to.be.equal("2200000000000000000");
        });

        it("Expect full token balance to be 2.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2200000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 1 tokens (0.2 + 20% of last token + 0.60)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1000000000000000000");
        });

        it("7 - Buy 1 tokens in stage 5 end (50%)", async function () {
            const stageId = 5;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("4");

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("5");

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });
        
        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 1.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1500000000000000000");
        });

        it("Expect unlocked tokens to be 1.7 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1700000000000000000");
        });

    });

    describe("Withdraw token tests - branch 1 - return all tokens", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            const cAStage5 = priceInStage(5).mul(new BN(1));

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 50% of stage 2,4,5
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage5));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(2) )

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );

        });

        it("Expect Participant's aggregatedStats.allocatedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.allocatedTokens).to.be.equal("200000000000000000");
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions", async function () {
            expect(aggregatedStatsBefore.allocatedETH).to.be.equal(
                // committedETH - withdrawnETH
                new BN(aggregatedStatsBefore.committedETH).sub(
                    new BN(aggregatedStatsBefore.withdrawnETH)
                )
                // subtract phase two committedETH
                .sub(ethAllocationPartTwoFull)
                .toString()
            );
            expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ethAllocationPartOne.toString());
        });

        it("8 - A - Return half of the 3 tokens bought at stage 5 end (50%)", async function () {
            const stageId = 5;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // you could send full balance of 3.2 here and the same thing should be valid.
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "1500000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                 });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 50% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 1.7 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1700000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to to remain the same ( 1.7 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1700000000000000000");
        });

        // it("Expect Participant's aggregatedStats.allocatedTokens to be 1.7 tokens", async function () {
        //     expect(aggregatedStatsAfter.allocatedTokens).to.be.equal("1700000000000000000");
        // }); 

        it("Expect Participant ETH balance to increase by 0.00355 ETH ( 0.00125 + 0.0012 + 0.0011 ) ", async function () {

            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(ethAllocationPartTwo)

            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());


            // const returnedValue = ParticipantBalanceBefore.sub(returnTxGasUsed).sub(ParticipantBalanceAfter);
            // console.log("returnedValue            ", helpers.utils.toEth(helpers, returnedValue), "eth");
            // console.log("returnTxGasUsed          ", helpers.utils.toEth(helpers, returnTxGasUsed), "eth");
            // console.log("ParticipantBalanceBefore ", helpers.utils.toEth(helpers, ParticipantBalanceBefore), "eth");
            // console.log("ParticipantBalanceAfter  ", helpers.utils.toEth(helpers, ParticipantBalanceAfter), "eth");
            // console.log("ParticipantBalanceAV     ", helpers.utils.toEth(helpers, ParticipantBalanceAfterValidation), "eth");
           

        });


        it("9 - Buy 1 tokens in stage 8 end (80%)", async function () {
            const stageId = 8;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("5");

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("6");

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2700000000000000000");
            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();


        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 50% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 2.7 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2700000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 2.5 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2500000000000000000");
        });

    });


    describe("Withdraw token tests - branch 2 - return partial tokens", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            const cAStage5 = priceInStage(5).mul(new BN(1));

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 50% of stage 2,4,5
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage5));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(2) )

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );

        });

        it("Expect Participant's aggregatedStats.allocatedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.allocatedTokens).to.be.equal("200000000000000000");
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions", async function () {
            expect(aggregatedStatsBefore.allocatedETH).to.be.equal(
                // committedETH - withdrawnETH
                new BN(aggregatedStatsBefore.committedETH).sub(
                    new BN(aggregatedStatsBefore.withdrawnETH)
                )
                // subtract phase two committedETH
                .sub(ethAllocationPartTwoFull)
                .toString()
            );
            expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ethAllocationPartOne.toString());
        });

        it("8 - A - Return 0.25 tokens bought at stage 5 end (50%)", async function () {
            const stageId = 5;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );
            // console.log("after");

            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "250000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );

        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 50% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 2.95 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2950000000000000000");
        });

        it("Expect locked tokens to be 1.25 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1250000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 1.7 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1700000000000000000");
        });

        it("Expect Participant ETH balance to increase by 0.000625 ETH", async function () {

            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            // half of a token in eth at stage 5
            const cAStage5 = priceInStage(5).mul(
                new BN(1)
            ).div( new BN(4) );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(cAStage5);

            const returnedValue = ParticipantBalanceBefore.sub(returnTxGasUsed).sub(ParticipantBalanceAfter);


            console.log("returnedValue            ", helpers.utils.toEth(helpers, returnedValue), "eth");
            console.log("returnTxGasUsed          ", helpers.utils.toEth(helpers, returnTxGasUsed), "eth");
            console.log("cAStage5                 ", helpers.utils.toEth(helpers, cAStage5), "eth");

            console.log("ParticipantBalanceBefore ", helpers.utils.toEth(helpers, ParticipantBalanceBefore), "eth");
            console.log("ParticipantBalanceAfter  ", helpers.utils.toEth(helpers, ParticipantBalanceAfter), "eth");
            console.log("ParticipantBalanceAV     ", helpers.utils.toEth(helpers, ParticipantBalanceAfterValidation), "eth");
            

            await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );

            // const diff = 

        //    expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());

            expect(ParticipantBalanceAfter.sub(ParticipantBalanceAfterValidation).toString()).to.be.equal("0");


        });

        // it("Expect Participant's aggregatedStats.allocatedTokens to be 1.7 tokens", async function () {
        //     expect(aggregatedStatsAfter.allocatedTokens).to.be.equal("1700000000000000000");
        // }); 

    });


    
    // describe("Withdraw token tests - branch 2 - return half tokens", async function () {
       
    //     let aggregatedStats;

    //     before(async () => {
    //         await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
    //         helpers.utils.resetAccountNonceCache(helpers);
    //     });

    //     it("8 - B - Return half tokens at stage 5 end (50%)", async function () {
    //         const stageId = 5;
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

    //         let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         let locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         let unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();

    //         console.log("balance: ", balance.toString());
    //         console.log("locked:  ", locked.toString());
    //         console.log("unlocked:", unlocked.toString());

    //         await TokenContractInstance.methods.transfer(RICOContractAddress, "1600000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000 });

    //         balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            
    //         console.log("balance: ", balance.toString());
    //         console.log("locked:  ", locked.toString());
    //         console.log("unlocked:", unlocked.toString());

    //         // set results globally
    //         aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
    
    //     });

    //     it("Expect full token balance to be 1.7 tokens ( 0.2 + 1.5 )", async function () {
    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("1700000000000000000");
    //     });

    //     it("Expect locked tokens to be 0 tokens", async function () {
    //         const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         expect(locked).to.be.equal("0");
    //     });

    //     it("Expect unlocked tokens to to remain the same ( 1.7 tokens )", async function () {
    //         const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
    //         expect(unlocked).to.be.equal("1700000000000000000");
    //     });

    // });


    
    // describe("Withdraw token tests - branch 3 - return half locked tokens", async function () {
       
    //     let aggregatedStats;

    //     before(async () => {
    //         await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
    //         helpers.utils.resetAccountNonceCache(helpers);
    //     });

    //     it("8 - C - Return half locked tokens at stage 5 end (50%)", async function () {
    //         const stageId = 5;
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

    //         let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         let locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         let unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();

    //         console.log("balance: ", balance.toString());
    //         console.log("locked:  ", locked.toString());
    //         console.log("unlocked:", unlocked.toString());

    //         await TokenContractInstance.methods.transfer(RICOContractAddress, "750000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000 });

    //         balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            
    //         console.log("balance: ", balance.toString());
    //         console.log("locked:  ", locked.toString());
    //         console.log("unlocked:", unlocked.toString());

    //         // set results globally
    //         aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
    //     });

    //     it("Expect full token balance to be 2.45 tokens ( 0.20 + 2.25 )", async function () {
    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("2450000000000000000");
    //     });

    //     it("Expect locked tokens to be 0 tokens", async function () {
    //         const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
    //         expect(locked).to.be.equal("0");
    //     });

    //     it("Expect unlocked tokens to to remain the same ( 1.7 tokens )", async function () {
    //         const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
    //         expect(unlocked).to.be.equal("1700000000000000000");
    //     });

    // });

    // describe("Withdrawing should not deliver too many tokens with next buy", async function () {

    //     before(async () => {
    //         await revertToFreshDeployment();
    //     });

    //     it("Whitelist buyer", async function () {
    //         whitelistTx = await this.ReversibleICO.methods.whitelist(
    //             [TestParticipant],
    //             true
    //         ).send({
    //             from: whitelistControllerAddress
    //         });
    //     });

    //     it("Buy 900 tokens in stage 0", async function () {
    //         const stageId = 0;
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

    //         const ContributionAmount = priceInStage(stageId).mul(new BN(900));
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount.toString(),
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("900000000000000000000");
    //     });

    //     it("Withdraw all tokens", async function () {
    //         await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "900000000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000 });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("0");
    //     });

    //     it("Buy 1 tokens in stage 0", async function () {
    //         const stageId = 0;
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

    //         const ContributionAmount = priceInStage(stageId).mul(new BN(1));
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount.toString(),
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("1000000000000000000");
    //     });
    // });

    // describe("Multiple withdrawals", async function () {

    //     before(async () => {
    //         await revertToFreshDeployment();
    //     });

    //     it("Whitelist buyer", async function () {
    //         whitelistTx = await this.ReversibleICO.methods.whitelist(
    //             [TestParticipant],
    //             true
    //         ).send({
    //             from: whitelistControllerAddress
    //         });
    //     });

    //     it("Buy 2000 tokens in stage 0", async function () {
    //         const stageId = 0;

    //         // jump to stage
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

    //         const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount.toString(),
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("2000000000000000000000");
    //     });

    //     it("Withdraw 500 token in stage 0", async function () {
    //         const stageId = 0;

    //         const expectedReturnEth = new BN((500 * (stageId + 1) * commitPhasePrice).toString());

    //         const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

    //         const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("1500000000000000000000");

    //         const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
    //         const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

    //         expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
    //     });

    //     it("Buy 2000 tokens in stage 1", async function () {
    //         const stageId = 1;

    //         // jump to stage
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

    //         const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();

    //         const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount.toString(),
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("3500000000000000000000");
    //     });

    //     it("Withdraw 500 token in stage 1", async function () {
    //         const stageId = 1;

    //         // since we already bought 2000 tokens in this stage,
    //         // and the locked amount is higher than what we want
    //         // to return we'll get full price for them
    //         const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

    //         const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

    //         const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("3000000000000000000000");

    //         const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
    //         const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

    //         expect(ethAfter).to.be.bignumber.equal(
    //             ethBefore.sub(txCost).add(expectedReturnEth)
    //         );
    //     });

    //     it("Buy 2000 tokens in stage 5", async function () {
    //         const stageId = 5;

    //         // jump to stage
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

    //         const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
    //         await helpers.web3Instance.eth.sendTransaction({
    //             from: TestParticipant,
    //             to: this.ReversibleICO.receipt.contractAddress,
    //             value: ContributionAmount.toString(),
    //             gasPrice: helpers.networkConfig.gasPrice
    //         });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("5000000000000000000000");
    //     });

    //     it("Withdraw 500 token in stage 5", async function () {
    //         const stageId = 5;

    //         // since we already bought 2000 tokens in this stage,
    //         // and the locked amount is higher than what we want
    //         // to return we'll get full price for them
    //         const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

    //         const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

    //         const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("4500000000000000000000");

    //         const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
    //         const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

    //         expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
    //     });

    //     it("Jump to end of phase 5 (50 % unlocked)", async function () {
    //         // jump to last block of phase 1
    //         currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 5, true);

    //         let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
    //         expect(unlockPercentage).to.be.equal("50000000000000000000");
    //     });

    //     it("Withdraw all tokens", async function () {
    //         this.ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

    //         // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );
    //         this.withdrawTx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "4500000000000000000000")
    //             .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });
    //         // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );
    //     });

    //     it("ETH Balance is correct", async function () {
    //         const returnEth0 = priceInStage(0).mul(new BN(1500));
    //         const returnEth1 = priceInStage(1).mul(new BN(1500));
    //         const returnEth5 = priceInStage(5).mul(new BN(1500));
            
    //         // add them up and divide by 2 ( or multiply by 0.5 (unlockPercentage) )
    //         const expectedReturnEth = new BN(returnEth0.add(returnEth1).add(returnEth5)).div(new BN("2"));
    //         const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
    //         const txCost = new BN(this.withdrawTx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

    //         console.log("returnEth0:        ", returnEth0.toString());
    //         console.log("returnEth1:        ", returnEth1.toString());
    //         console.log("returnEth5:        ", returnEth5.toString());
    //         console.log("expectedReturnEth: ", expectedReturnEth.toString());

    //         console.log("this.ethBefore:    ", this.ethBefore.toString());
    //         console.log("ethAfter:          ", ethAfter.toString());
    //         console.log("eth diff:          ", ethAfter.sub(this.ethBefore).toString());


    //         expect(ethAfter).to.be.bignumber.equal(this.ethBefore.sub(txCost).add(expectedReturnEth));
    //     });

    //     it("Token Balance is correct", async function () {
    //         const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
    //         expect(balance).to.be.equal("3000000000000000000000");
    //     });
    // });
    
});