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

    const deployingAddress = accounts[0];
    const whitelistingAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.startBlockDelay = 11;
    customTestSettings.rico.blocksPerDay = 10;
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
        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);
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
        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));
    });


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
                from: whitelistingAddress
            });
        });

        it("1 - Buy 1 tokens in stage 0", async function () {
            const stageId = 0;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            // enough for 1 token
            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("2 - Buy 1 tokens in stage 1", async function () {
            const stageId = 1;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("3 - Jump to stage 2 end block (20 % unlocked)", async function () {
            const stageId = 2;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            console.log('currentBlock ', await this.ReversibleICO.methods.getCurrentBlockNumber().call());
            console.log('buyPhaseStartBlock ', await this.ReversibleICO.methods.buyPhaseStartBlock().call());
            console.log('buyPhaseEndBlock ', await this.ReversibleICO.methods.buyPhaseEndBlock().call());
            console.log('buyPhaseBlockCount ', await this.ReversibleICO.methods.buyPhaseBlockCount().call());
        });

        it("Expect full token balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 1.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1600000000000000000");
        });

        it("Expect unlocked tokens to be 0.4 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        it("4 - Return all tokens", async function () {
            await TokenContractInstance.methods.transfer(RICOContractAddress, "2000000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0.4 tokens (20 %)", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("400000000000000000");
        });

        it("Load Participant's aggregatedStats", async function () {
            // set results globally
            aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the 2 token contributions", async function () {

        //     expect(aggregatedStats.allocatedETH).to.be.equal(
        //         // committedETH - withdrawnETH
        //         new BN(aggregatedStats.committedETH).sub(
        //             new BN(aggregatedStats.withdrawnETH)
        //         ).toString()
        //     );

        //     expect(aggregatedStats.allocatedETH).to.be.equal(
        //         contributionTotals.div( new BN("100") ).mul( new BN("20")).toString()
        //     )
        // });

        // it("Expect Participant's aggregatedStats.allocatedTokens to be 0.4 tokens (20 %)", async function () {
        //     expect(aggregatedStats.allocatedTokens).to.be.equal("400000000000000000");
        // });

        it("Expect unlocked tokens to be 0.4 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("- THROW - Return one more token should not be possible", async function () {
            helpers.utils.resetAccountNonceCache(helpers);
            await helpers.assertInvalidOpcode(async () => {
                await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
                    .send({ from: TestParticipant, gas: 1000000 });
            }, "revert Withdraw not possible. Participant has no locked tokens.");
        });

        it("Expect balance to remain 0.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("400000000000000000");
        });


        it("5 - Buy 1 tokens in stage 2 end (20%)", async function () {
            const stageId = 2;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 1.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1400000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 0.6 tokens (0.4 + 20% of purchases since withdraw)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("600000000000000000");
        });

        it("- Jump to stage 4", async function () {
            const stageId = 4;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 1.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1400000000000000000");
        });

        it("Expect locked tokens to be 0.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("600000000000000000");
        });

        it("Expect unlocked tokens to be 0.8 tokens (0.4 + 0.4 ( 40% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("800000000000000000");
        });

        it("6 - Buy 1 tokens in stage 4 end (40%)", async function () {
            const stageId = 4;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 2.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 1.2 tokens (0.4 + 40% of purchases since withdraw)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1200000000000000000");
        });

        it("- Jump to stage 6", async function () {
            const stageId = 6;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 2.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2400000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 1.6 tokens (0.4 + 1.2 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1600000000000000000");
        });

        it("7 - Buy 1 tokens in stage 6 end (60%)", async function () {
            const stageId = 6;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("- Jump to stage 8", async function () {
            const stageId = 8;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 0.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("600000000000000000");
        });

        it("Expect unlocked tokens to be 2.8 tokens (0.4 + 2.4 ( 80% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2800000000000000000");
        });

        it("- Jump to stage 6", async function () {
            const stageId = 6;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

    });


    return;

    describe("token lock and unlock amount tests - branch 1", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 1 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Jump to stage 1 end (10%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 1, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.9 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to be 0.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000");
        });
        
        it("4 - Jump to stage 3 end (30%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 3, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.7 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("700000000000000000");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("4 - Jump to stage 8 end (80%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 8, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 0.8 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("800000000000000000");
        });

    });

    describe("token lock and unlock amount tests - branch 2 - return half in stage 0", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 2 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 2 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });

        it("Expect locked tokens to be 2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2000000000000000000");
        });

        it("Expect balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Return 1 token", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("4 - Jump to stage 1 end (10%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 1, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.9 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to be 0.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000");
        });
        
        it("5 - Jump to stage 3 end (30%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 3, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.7 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("700000000000000000");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 8, true);
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 0.8 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("800000000000000000");
        });

    });

    describe("token lock and unlock amount tests - branch 3 - return 1 of 3 in stage 1", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 5 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 5 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

        });

        it("Expect balance to be 5 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("5000000000000000000");
        });

        it("Expect locked tokens to be 5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("5000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Jump to stage 1 end (10%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 1, true);
        });

        it("Expect balance to be 5 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("5000000000000000000");
        });

        it("Expect locked tokens to be 4.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("4500000000000000000");
        });

        it("Expect unlocked tokens to be 0.5 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("500000000000000000");
        });
        
        it("4 - Return 0.75 token", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "750000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 4.25 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("4250000000000000000");
        });

        it("Expect locked tokens to be 3.75 tokens (90%)", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("3750000000000000000");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 0.5 tokens (10%)", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("500000000000000000");
        });

        it("5 - Jump to stage 4 end (40%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 4, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect balance to be 4.25 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("4250000000000000000");
        });

        it("Expect locked tokens to be 2.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2500000000000000000");
        });

        it("Expect unlocked tokens to be 1.75 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("1750000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 8, true);
        });

        it("Expect balance to be 4.25 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("4250000000000000000");
        });

        it("Expect locked tokens to be 0.833333333333333333 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("833333333333333333");
        });

        it("Expect unlocked tokens to be 3.416666666666666667 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("3416666666666666667");
        });

    });


    describe("Precision Testing - 1", async function () {
 
        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 1 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

        });
        
        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Return all tokens ", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, balance )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("committedETH equals withdrawnETH ( since we returned everything )", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const committedETH = result.stageCommittedETH;
            const withdrawnETH = result.stageWithdrawnETH;
            expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
        });

    });


    describe("Precision Testing - 2", async function () {
 
        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 1 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });
        
        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Return half tokens ", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, new BN(balance).div( new BN(2) ).toString() )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect locked tokens to be 0.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("500000000000000000");
        });

        it("Expect balance to be 0.5 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("500000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        // it("committedETH equals withdrawnETH times 2", async function () {
        //     const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
        //     const committedETH = result.committedEth;
        //     const withdrawnETH = new BN(result.stageWithdrawnETH).mul( new BN(2) );
        //     expect(committedETH).to.be.equal(withdrawnETH.toString(), "committedETH does not match withdrawnETH");
        // });
    });


    describe("Precision Testing - 3", async function () {
 
        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 1 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
        });
        
        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("3 - Return all tokens - 1 ", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, new BN(balance).sub( new BN(1) ).toString() )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect locked tokens to be 0.000000000000000001 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1");
        });

        it("Expect balance to be 0.000000000000000001 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Return last token", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
                .send({ from: TestParticipant, gas: 1000000 });
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("TotalReservedTokens equals returnedTokens ( since we returned everything )", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const reservedTokens = result.stageTotalReservedTokens;
            const returnedTokens = result.stageReturnedTokens;
            expect(reservedTokens).to.be.equal(returnedTokens, "TotalReservedTokens does not match returnedTokens");
        });

        it.skip("committedETH equals withdrawnETH ( since we returned everything )", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const committedETH = result.stageCommittedETH;
            const withdrawnETH = result.stageWithdrawnETH;
            expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
        });
    });


    describe("Check getParticipantPendingETH before and after whitelisting", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("Buy 2 tokens in phase 0", async function () {
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, 0);

            const ContributionAmount = 2 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Check participant available ETH", async function () {
            const result = await this.ReversibleICO.methods.getParticipantPendingETH(TestParticipant).call();
            expect(new BN(result)).to.be.bignumber.equal(new BN(2).mul(new BN(commitPhasePrice)));
        });

        it("Whitelist buyer", async function () {
            await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Check participant available ETH", async function () {
            const result = await this.ReversibleICO.methods.getParticipantPendingETH(TestParticipant).call();
            expect(new BN(result)).to.be.bignumber.equal(new BN(0));
        });
    });

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
                from: whitelistingAddress
            });
        });

        it("1 - Buy 1 tokens in stage 0", async function () {
            const stageId = 0;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            // enough for 1 token
            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("2 - Buy 1 tokens in stage 1", async function () {
            const stageId = 1;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("3 - Jump to stage 2 end block (20 % unlocked)", async function () {
            const stageId = 2;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            console.log('currentBlock ', await this.ReversibleICO.methods.getCurrentBlockNumber().call());
            console.log('buyPhaseStartBlock ', await this.ReversibleICO.methods.buyPhaseStartBlock().call());
            console.log('buyPhaseEndBlock ', await this.ReversibleICO.methods.buyPhaseEndBlock().call());
            console.log('buyPhaseBlockCount ', await this.ReversibleICO.methods.buyPhaseBlockCount().call());
        });

        it("Expect full token balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 1.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1600000000000000000");
        });

        it("Expect unlocked tokens to be 0.4 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        it("4 - Return all tokens", async function () {
            await TokenContractInstance.methods.transfer(RICOContractAddress, "2000000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0.4 tokens (20 %)", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("400000000000000000");
        });

        it("Load Participant's aggregatedStats", async function () {
            // set results globally
            aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the 2 token contributions", async function () {

        //     expect(aggregatedStats.allocatedETH).to.be.equal(
        //         // committedETH - withdrawnETH
        //         new BN(aggregatedStats.committedETH).sub(
        //             new BN(aggregatedStats.withdrawnETH)
        //         ).toString()
        //     );

        //     expect(aggregatedStats.allocatedETH).to.be.equal(
        //         contributionTotals.div( new BN("100") ).mul( new BN("20")).toString()
        //     )
        // });

        // it("Expect Participant's aggregatedStats.allocatedTokens to be 0.4 tokens (20 %)", async function () {
        //     expect(aggregatedStats.allocatedTokens).to.be.equal("400000000000000000");
        // });

        it("Expect unlocked tokens to be 0.4 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("- THROW - Return one more token should not be possible", async function () {
            helpers.utils.resetAccountNonceCache(helpers);
            await helpers.assertInvalidOpcode(async () => {
                await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
                    .send({ from: TestParticipant, gas: 1000000 });
            }, "revert Withdraw not possible. Participant has no locked tokens.");
        });

        it("Expect balance to remain 0.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("400000000000000000");
        });


        it("5 - Buy 1 tokens in stage 2 end (20%)", async function () {
            const stageId = 2;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 1.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1400000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 0.6 tokens (0.4 + 20% of purchases since withdraw)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("600000000000000000");
        });

        it("- Jump to stage 4", async function () {
            const stageId = 4;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 1.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1400000000000000000");
        });

        it("Expect locked tokens to be 0.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("600000000000000000");
        });

        it("Expect unlocked tokens to be 0.8 tokens (0.4 + 0.4 ( 40% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("800000000000000000");
        });

        it("6 - Buy 1 tokens in stage 4 end (40%)", async function () {
            const stageId = 4;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 2.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 1.2 tokens (0.4 + 40% of purchases since withdraw)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1200000000000000000");
        });

        it("- Jump to stage 6", async function () {
            const stageId = 6;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 2.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2400000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 1.6 tokens (0.4 + 1.2 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1600000000000000000");
        });

        it("7 - Buy 1 tokens in stage 6 end (60%)", async function () {
            const stageId = 6;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            contributionTotals = contributionTotals.add(ContributionAmount);
        });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("- Jump to stage 8", async function () {
            const stageId = 8;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 0.6 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("600000000000000000");
        });

        it("Expect unlocked tokens to be 2.8 tokens (0.4 + 2.4 ( 80% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2800000000000000000");
        });

        it("- Jump to stage 6", async function () {
            const stageId = 6;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
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
            const cAStage6 = priceInStage(6).mul(new BN(1));

            // 20% of stage 0 and 1, since we returned the rest at stage 2
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(20));

            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));

            // 20% of stage 2,4,6 since last withdraw happened at 20% 
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(20));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );
        });


        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 20% of the second wave", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        // });

        it("8 - A - Return full locked balance of 1.2", async function () {

            const stageId = 6;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // you could send full balance of 3.2 here and the same thing should be valid.
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "1200000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                 });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 60% of the second wave", async function () {
        //     const cAA = ethAllocationPartOne.add( 
        //         // 20% of first + 60% of second round
        //         ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(60)) 
        //     );
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(cAA.toString());
        // });

        it("Expect full token balance to be 2.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2200000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to to remain the same ( 2.2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        // it("Expect Participant's aggregatedStats.allocatedTokens to be 2.2 tokens", async function () {
        //     expect(aggregatedStatsAfter.allocatedTokens).to.be.equal("2200000000000000000");
        // }); 

        it("Expect Participant ETH balance to increase by 0.00288 ETH ( 0.00088 + 0.00096 + 0.00104 ) ( sub tx cost ) ", async function () {

            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(
                    ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(40))
                )

            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });


        it("9 - Buy 1 tokens in stage 8 end (80%)", async function () {
            
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();

            const stageId = 8;
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH should increase by 60% of 1 token price ( 60% is when we last returned )", async function () {
        //     const cAStage8 = priceInStage(8).mul(new BN(1));
        //     const increase = cAStage8.div(new BN(100)).mul(new BN(60));
        //     const afterValidation = new BN(aggregatedStatsBefore.allocatedETH).add(increase);
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(afterValidation.toString());
        // });

        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 3 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("3000000000000000000");
        });

    });

    describe("Withdraw token tests - branch 2 - return all tokens of last stage", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx,
            cAStage6;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            cAStage6 = priceInStage(6).mul(new BN(1));

            // 20% of stage 0 and 1, since we returned the rest at stage 2
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(20));

            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));

            // 20% of stage 2,4,6 since last withdraw happened at 20% 
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(20));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );

        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 20% of the second wave", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        // });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });


        it("8 - B - Return full locked balance of last stage - 0.4", async function () {
            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // send 0.4.. stage 6 full locked amount
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "400000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                 });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 60% of the second wave", async function () {
        //     const cAA = ethAllocationPartOne.add( 
        //         // 20% of first + 60% of second round
        //         ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(60)) 
        //     );
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(cAA.toString());
        // });

        it("Expect full token balance to be 3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2.2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("Expect Participant ETH balance to increase by 0.00104 ETH", async function () {
            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            // 40% of 1 token price in stage 6
            const priceDiff = cAStage6.div( new BN(100) ).mul( new BN(40) );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(priceDiff);

            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });

    });

    describe("Withdraw token tests - branch 3 - return partial tokens", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx,
            cAStage6;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            cAStage6 = priceInStage(6).mul(new BN(1));

            // 20% of stage 0 and 1, since we returned the rest at stage 2
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(20));

            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));

            // 20% of stage 2,4,6 since last withdraw happened at 20% 
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(20));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 20% of the second wave", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        // });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });


        it("8 - C - At stage 6 end (60%) - Return 0.1 tokens", async function () {

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "100000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 60% of the second wave", async function () {
        //     const cAA = ethAllocationPartOne.add( 
        //         // 20% of first + 60% of second round
        //         ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(60)) 
        //     );
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(cAA.toString());
        // });

        it("Expect full token balance to be 3.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3300000000000000000");
        });

        it("Expect locked tokens to be 1.1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1100000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2.2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("Expect Participant ETH balance to increase by 0.00026 ETH", async function () {
            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            // 0.2 token price in stage 6
            const priceDiff = cAStage6.div( new BN(10) );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(priceDiff);
            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });

    });

    describe("Withdraw token tests - branch 4 - return partial tokens", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx,
            cAStage6;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            cAStage6 = priceInStage(6).mul(new BN(1));

            // 20% of stage 0 and 1, since we returned the rest at stage 2
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(20));

            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));

            // 20% of stage 2,4,6 since last withdraw happened at 20% 
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(20));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 20% of the second wave", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        // });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("8 - D - At stage 6 end (60%) - Return 0.2 tokens", async function () {

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);
            
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "200000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 60% of the second wave", async function () {
        //     const cAA = ethAllocationPartOne.add( 
        //         // 20% of first + 60% of second round
        //         ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(60)) 
        //     );
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(cAA.toString());
        // });

        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2.2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("Expect Participant ETH balance to increase by 0.00054 ETH", async function () {
            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            // 0.2 token price in stage 6
            const priceDiff = cAStage6.div( new BN(5) );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(priceDiff);
            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });

    });

    describe("Withdraw token tests - branch 5 - return partial tokens", async function () {
        
        let aggregatedStatsBefore,
            aggregatedStatsAfter,
            ContributionAllocationAmounts,
            ethAllocationPartOne,
            ethAllocationPartTwo,
            ethAllocationPartTwoFull,
            ParticipantBalanceBefore,
            returnTx,
            cAStage6;

        before(async () => {
            await restoreFromSnapshot("WithdrawTests_Phase_2_withdraw_end");
            helpers.utils.resetAccountNonceCache(helpers);

            const cAStage0 = priceInStage(0).mul(new BN(1));
            const cAStage1 = priceInStage(1).mul(new BN(1));
            const cAStage2 = priceInStage(2).mul(new BN(1));
            const cAStage4 = priceInStage(4).mul(new BN(1));
            cAStage6 = priceInStage(6).mul(new BN(1));


            // 20% of stage 0 and 1, since we returned the rest at stage 2
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(20));

            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));

            // 20% of stage 2,4,6 since last withdraw happened at 20% 
            ethAllocationPartTwo = ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(20));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwo );

        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 20% of the second wave", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        // });

        it("Expect full token balance to be 3.4 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3400000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2.2 tokens (0.4 + 1.8 ( 60% of purchases since withdraw) )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });


        it("8 - E - At stage 6 end (60%) - Return 0.30 tokens", async function () {

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "300000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the first 2 contributions + 60% of the second wave", async function () {
        //     const cAA = ethAllocationPartOne.add( 
        //         // 20% of first + 60% of second round
        //         ethAllocationPartTwoFull.div(new BN(100)).mul(new BN(60)) 
        //     );
        //     expect(aggregatedStatsAfter.allocatedETH).to.be.equal(cAA.toString());
        // });

        it("Expect full token balance to be 3.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3100000000000000000");
        });

        it("Expect locked tokens to be 1.1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2.2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2200000000000000000");
        });

        it("Expect Participant ETH balance to increase by 0.00104 ETH", async function () {
            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            // 0.35 token price in stage 6
            const priceDiff = cAStage6.div( new BN(100) ).mul( new BN(30) );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(priceDiff);

            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });

    });

    describe("Withdrawing should not deliver too many tokens with next buy", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Buy 900 tokens in stage 0", async function () {
            const stageId = 0;            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(900));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("900000000000000000000");
        });

        it("Withdraw all tokens", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "900000000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Buy 1 tokens in stage 0", async function () {
            const stageId = 0;            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });
    });

    describe("Multiple withdrawals", async function () {

        let ParticipantBalanceBefore;

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("2 - Buy 2000 tokens in stage 0", async function () {
            const stageId = 0;

            // jump to stage            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 0", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal("0");
        // });

        it("getAvailableProjectETH returns 0 (since project cannot withdraw at this point)", async function () {
            const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
            expect(ProjectAvailableEth.toString()).to.equal("0");
        });

        it("Expect full token balance to be 2000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000000");
        });

        it("Expect locked tokens to be 2000 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2000000000000000000000");
        });

        it("Expect unlocked tokens to be 0", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("0");
        });

        it("3 - Return 500 tokens in stage 0", async function () {
            const stageId = 0;

            const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 0", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal("0");
        // });

        it("getAvailableProjectETH returns 0 (since project cannot withdraw at this point)", async function () {
            const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
            expect(ProjectAvailableEth.toString()).to.equal("0");
        });

        it("Expect full token balance to be 1500 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1500000000000000000000");
        });

        it("Expect locked tokens to be 1500 tokens", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1500000000000000000000");
        });

        it("Expect unlocked tokens to be 0", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("0");
        });

        it("4 - Buy 2000 tokens in stage 2", async function () {
            const stageId = 2;

            // jump to stage
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);

            const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3500000000000000000000");
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 0", async function () {
        //     aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStatsBefore.allocatedETH).to.be.equal("0");
        // });

        it("getAvailableProjectETH returns 20% of contributions", async function () {
            const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
            const ContributionAmount = priceInStage(0).mul(new BN(1500))
                .add( priceInStage(2).mul(new BN(2000)) );
            const projectAmount = ContributionAmount.div(new BN(100)).mul(new BN(20));
            expect(ProjectAvailableEth.toString()).to.equal(projectAmount.toString());
        });

        it("Expect full token balance to be 3500 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3500000000000000000000");
        });

        it("Expect locked tokens to be 3500 tokens - 20% => 2800", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2800000000000000000000");
        });

        it("Expect unlocked tokens to be 700 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("700000000000000000000");
        });

        it("5 - Return 500 tokens in stage 2", async function () {
            const stageId = 2;

            // since we already bought 2000 tokens in this stage,
            // and the locked amount is higher than what we want
            // to return we'll get full price for them
            const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(
                ethBefore.sub(txCost).add(expectedReturnEth)
            );
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 20% of the stage 0 + stage 2 contribution before first return", async function () {
        //     const ContributionAmountInStage0 = priceInStage(0).mul(new BN(1500));
        //     const ContributionAmountInStage2 = priceInStage(2).mul(new BN(2000));
        //     const AllocationAmount = new BN( ContributionAmountInStage0.add(ContributionAmountInStage2) )
        //         .div(new BN(100)).mul(new BN(20));
        //     const aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();

        //     // console.log("aggregatedStats.allocatedETH:", aggregatedStats.allocatedETH.toString());
        //     expect(aggregatedStats.allocatedETH).to.be.equal(AllocationAmount.toString());
        // });

        it("getAvailableProjectETH returns 20% of the stage 0 + stage 2 contribution before first return", async function () {

            const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
            const _projectUnlockedETH = new BN( await ReversibleICOInstance.methods._projectUnlockedETH().call() );

            // console.log("ProjectAvailableEth:         ", ProjectAvailableEth.toString());
            // console.log("_projectUnlockedETH:         ", _projectUnlockedETH.toString());


            const ContributionAmountInStage0 = priceInStage(0).mul(new BN(1500));
            const ContributionAmountInStage2 = priceInStage(2).mul(new BN(2000));
            const AllocationAmount = new BN( ContributionAmountInStage0.add(ContributionAmountInStage2) )
                .div(new BN(100)).mul(new BN(20));


            // const ContributionAmount = priceInStage(0).mul(new BN(1500))
            //     .add( priceInStage(2).mul(new BN(2000)) );
            // const projectAmount = ContributionAmount.div(new BN(100)).mul(new BN(20));
            expect(ProjectAvailableEth.toString()).to.equal(AllocationAmount.toString());
        });

        it("Expect full token balance to be 3000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");
        });

        it("Expect locked tokens to reduce by 500 ( 2800 - 500 => 2300 )", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2300000000000000000000");
        });

        it("Expect unlocked tokens to remain the same at 700 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("700000000000000000000");
        });

        it("6 - Jump to stage 6", async function () {
            const stageId = 6;
            // jump to stage
            await helpers.utils.jumpToContractStage(this.ReversibleICO, deployingAddress, stageId, true);
        });

        it("Expect full token balance to remain the same at 3000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");
        });

        it("Expect locked tokens be 1150", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1150000000000000000000");
        });

        it("Expect unlocked tokens to be 1850 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1850000000000000000000");
        });

        it("7 - Buy 2000 tokens in stage 6", async function () {
            const stageId = 6;

            const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("5000000000000000000000");
        });

        it("Expect full token balance to be 5000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("5000000000000000000000");
        });

        it("Expect locked tokens be 1950", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1950000000000000000000");
        });

        it("Expect unlocked tokens to be 3050 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("3050000000000000000000");
        });

        it("8 - Return 500 tokens in stage 6", async function () {
            const stageId = 6;

            // since we already bought 2000 tokens in this stage,
            // and the locked amount is higher than what we want
            // to return we'll get full price for them
            const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        // it("Expect Participant's aggregatedStats.allocatedETH to be 60% of the stage 1 + stage 2 contribution before return", async function () {

        //     await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7, TokenContractInstance );

        //     const ContributionAmountInStage0 = priceInStage(0).mul(new BN(1500));
        //     const ContributionAmountInStage2 = priceInStage(2).mul(new BN(1500));
        //     const ContributionAmountInStage6 = priceInStage(6).mul(new BN(2000));

        //     const AllocationAmount = new BN( 
        //         ContributionAmountInStage0.add(ContributionAmountInStage2).add(ContributionAmountInStage6)
        //     )
        //     .div(new BN(100)).mul(new BN(60));
            
        //     console.log("returnEth0: ", helpers.utils.toEth(helpers, returnEth0), "eth");


        //     const aggregatedStats = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        //     expect(aggregatedStats.allocatedETH).to.be.equal(AllocationAmount.toString());
        // });
        
        it("Expect full token balance to be 4500 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("4500000000000000000000");
        });

        it("Expect locked tokens be 1450", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1450000000000000000000");
        });

        it("Expect unlocked tokens to be 3050 tokens ( remain the same )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("3050000000000000000000");
        });

        it("9 - Return all tokens", async function () {
            this.ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            this.withdrawTx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, balance)
                .send({ 
                    from: TestParticipant,
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice 
                });

            });

        it("Expect full token balance to be 3050 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3050000000000000000000");
        });

        it("Expect locked tokens be 0", async function () {
            const locked = await this.ReversibleICO.methods.currentReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to remain the same at 3050 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("3050000000000000000000");
        });

        // it("ETH Balance is correct", async function () {
            
        //     // we buy 2000 in stage 0 and return 500, result 1500
        //     const returnEth0 = priceInStage(0).mul(new BN(1500));

        //     // we buy 2000 in stage 2 and return 500, result 1500
        //     const returnEth2 = priceInStage(2).mul(new BN(1500));
            
        //     // we buy 2000 in stage 6 and return 500, result 1500
        //     const returnEth6 = priceInStage(6).mul(new BN(1500));

        //     const expectedReturnEth = new BN(
        //         returnEth0
        //         .add(returnEth2)
        //         .add(returnEth6)
        //     // get 40% of the sum
        //     ).div(new BN("100")).mul( new BN("40"));

        //     const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
        //     const txCost = new BN(this.withdrawTx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));
            
        //     console.log("returnEth0: ", helpers.utils.toEth(helpers, returnEth0), "eth");
        //     console.log("returnEth2: ", helpers.utils.toEth(helpers, returnEth2), "eth");
        //     console.log("returnEth6: ", helpers.utils.toEth(helpers, returnEth6), "eth");
        //     console.log("txCost:     ", helpers.utils.toEth(helpers, txCost), "eth");

        //     const difference = ethAfter.sub(this.ethBefore);
        //     console.log("difference: ", helpers.utils.toEth(helpers, difference), "eth");
        //     const difference2 = ethAfter.sub(this.ethBefore).sub(txCost);
        //     console.log("difference2:", helpers.utils.toEth(helpers, difference2), "eth");
            
        //     console.log("expected:   ", helpers.utils.toEth(helpers, expectedReturnEth), "eth");

        //     expect(ethAfter).to.be.bignumber.equal(this.ethBefore.sub(txCost).add(expectedReturnEth));
        // });

    });
    
});