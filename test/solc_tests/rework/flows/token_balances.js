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

const testKey = "WithdrawTokenTests";

describe("ReversibleICO - Withdraw Token Balance", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.startBlockDelay = 10;
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

    describe("token lock and unlock amount tests - branch 1 - no returns", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("Expect getCurrentUnlockPercentageFor to be 0%", async function () {

            const buyPhaseEndBlock = await this.ReversibleICO.methods.buyPhaseEndBlock().call();
            const buyPhaseStartBlock = await this.ReversibleICO.methods.buyPhaseStartBlock().call();
            const getCurrentBlockNumber = await this.ReversibleICO.methods.getCurrentBlockNumber().call();

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentageFor(
                getCurrentBlockNumber,
                buyPhaseStartBlock,
                buyPhaseEndBlock
            ).call();

            expect(unlockPercentage).to.be.equal("0");
        });

        it("2 - Buy 1 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("Expect getCurrentUnlockPercentageFor to be 0%", async function () {

            const buyPhaseEndBlock = await this.ReversibleICO.methods.buyPhaseEndBlock().call();
            const buyPhaseStartBlock = await this.ReversibleICO.methods.buyPhaseStartBlock().call();
            const getCurrentBlockNumber = await this.ReversibleICO.methods.getCurrentBlockNumber().call();

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentageFor(
                getCurrentBlockNumber,
                buyPhaseStartBlock,
                buyPhaseEndBlock
            ).call();

            expect(unlockPercentage).to.be.equal("0");
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("3 - Jump to stage 1 end (10%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 1, true);
        });

        it("Expect Unlock percentage to be 10%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("10000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.9 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to be 0.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000");
        });
        

        it("4 - Jump to stage 3 end (30%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 3, true);
        });

        it("Expect Unlock percentage to be 30%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("30000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.7 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("700000000000000000");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("4 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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
                from: whitelistControllerAddress
            });
        });

        it("2 - Buy 2 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

            const ContributionAmount = 2 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
        });

        it("Expect locked tokens to be 2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("3 - Return 1 token", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("4 - Jump to stage 1 end (10%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 1, true);
        });

        it("Expect Unlock percentage to be 10%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("10000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.9 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to be 0.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000");
        });
        
        it("5 - Jump to stage 3 end (30%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 3, true);
        });

        it("Expect Unlock percentage to be 30%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("30000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.7 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("700000000000000000");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 0.8 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("800000000000000000");
        });

    });

    describe("token lock and unlock amount tests - branch 3 - return all tokens in stage 1", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("2 - Buy 3 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

            const ContributionAmount = 3 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
        });

        it("Expect balance to be 3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");
        });

        it("Expect locked tokens to be 3 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("3000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("3 - Jump to stage 1 end (10%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 1, true);
        });

        it("Expect Unlock percentage to be 10%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("10000000000000000000");
        });

        it("Expect balance to be 3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");
        });

        it("Expect locked tokens to be 2.7 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2700000000000000000");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });
        
        it("4 - Return 3 tokens", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "3000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("5 - Jump to stage 3 end (30%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 3, true);
        });

        it("Expect Unlock percentage to be 30%", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("30000000000000000000");
        });

        it("Expect balance to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("6 - Jump to stage 10 end (100%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 10, true);
        });

        it("Expect Unlock percentage to be 100%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("100000000000000000000");
        });

        it("Expect balance to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 0.3 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });
    });
    

    describe("token lock and unlock amount tests - branch 4 - return 60 of 100 in stage 1", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("2 - Buy 100 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

            const ContributionAmount = 100 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000000");

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
        });

        it("Expect balance to be 100 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000000");
        });

        it("Expect locked tokens to be 100 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("100000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("3 - Jump to stage 2 end", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 2, true);
        });

        it("Expect Unlock percentage to be 20%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("20000000000000000000");
        });

        it("Expect balance to be 100 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("100000000000000000000");
        });

        it("Expect locked tokens to be 80 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("80000000000000000000");
        });

        it("Expect unlocked tokens to be 20 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("20000000000000000000");
        });
        
        it("4 - Return 60 token", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "60000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 20 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("20000000000000000000");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 20 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("20000000000000000000");
        });

        it("5 - Jump to stage 3 end (30%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 3, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect Unlock percentage to be 30%", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("30000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 17.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("17500000000000000000");
        });

        it("Expect unlocked tokens to be 22.5 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("22500000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("5000000000000000000");
        });

        it("Expect unlocked tokens to be 35 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("35000000000000000000");
        });

        it("6 - Jump to stage 10 end (100%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 10, true);
        });

        it("Expect Unlock percentage to be 100%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("100000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });
    });
    
    describe("token lock and unlock amount tests - branch 5 - return 10 of 50 in stage 1", async function () {

        before(async () => {
            await revertToFreshDeployment();
        });

        it("1 - Whitelist buyer", async function () {
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("2 - Buy 50 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

            let ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("0");

            const ContributionAmount = 50 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("50000000000000000000");

            ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();
            expect(ParticipantByAddress.contributionsCount).to.be.equal("1");
        });

        it("Expect balance to be 50 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("50000000000000000000");
        });

        it("Expect locked tokens to be 50 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("50000000000000000000");
        });

        it("Expect unlocked tokens to be 0 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("Expect Unlock percentage to be 0%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("0");
        });

        it("3 - Jump to stage 2 end", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 2, true);
        });

        it("Expect Unlock percentage to be 20%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("20000000000000000000");
        });

        it("Expect balance to be 50 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("50000000000000000000");
        });

        it("Expect locked tokens to be 40 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("40000000000000000000");
        });

        it("Expect unlocked tokens to be 10 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("10000000000000000000");
        });
        
        it("4 - Return 10 token", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "10000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 30 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("30000000000000000000");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 10 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("10000000000000000000");
        });

        it("5 - Jump to stage 3 end (30%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 3, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect Unlock percentage to be 30%", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("30000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 26.25 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("26250000000000000000");
        });

        it("Expect unlocked tokens to be 13.75 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("13750000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 7.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("7500000000000000000");
        });

        it("Expect unlocked tokens to be 32.5 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("32500000000000000000");
        });

        it("6 - Jump to stage 10 end (100%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 10, true);
        });

        it("Expect Unlock percentage to be 100%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("100000000000000000000");
        });

        it("Expect balance to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to be 40 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("40000000000000000000");
        });
    });

});