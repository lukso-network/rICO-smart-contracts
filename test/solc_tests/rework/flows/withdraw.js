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

    describe("token lock and unlock amount tests - branch 1", async function () {

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

    describe("token lock and unlock amount tests - branch 3 - return 1 of 3 in stage 1", async function () {

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
        
        it("4 - Return 1 token", async function () {
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );

            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1000000000000000000" )
                .send({ from: TestParticipant, gas: 1000000 });

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 3 );

        });

        it("Expect balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 1.7 tokens (90%)", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1700000000000000000");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 0.3 tokens (10%) @call token", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("300000000000000000");
        });

        it("Expect unlocked tokens TO REMAIN THE SAME - 0.3 tokens (10%) @call rico", async function () {
            const balance = await this.ReversibleICO.methods.getUnlockedTokenAmount(TestParticipant).call();
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

        it("Expect balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 1.4 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1400000000000000000");
        });

        it("Expect unlocked tokens to be 0.6 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("600000000000000000");
        });

        it("6 - Jump to stage 8 end (80%)", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 8, true);
        });

        it("Expect Unlock percentage to be 80%", async function () {
            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");
        });

        it("Expect balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 0.4 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("400000000000000000");
        });

        it("Expect unlocked tokens to be 1.6 tokens", async function () {
            const balance = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(balance).to.be.equal("1600000000000000000");
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
                from: whitelistControllerAddress
            });
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
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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
                from: whitelistControllerAddress
            });
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

        it("3 - Return half tokens ", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, new BN(balance).div( new BN(2) ).toString() )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect locked tokens to be 0.5 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

        it("committedETH equals withdrawnETH times 2", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const committedETH = result.stageCommittedETH;
            const withdrawnETH = new BN(result.stageWithdrawnETH).mul( new BN(2) );
            expect(committedETH).to.be.equal(withdrawnETH.toString(), "committedETH does not match withdrawnETH");
        });
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
                from: whitelistControllerAddress
            });
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

        it("3 - Return all tokens - 1 ", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, new BN(balance).sub( new BN(1) ).toString() )
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect locked tokens to be 0.000000000000000001 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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
            const totalReservedTokens = result.stageTotalReservedTokens;
            const returnedTokens = result.stageReturnedTokens;
            expect(totalReservedTokens).to.be.equal(returnedTokens, "TotalReservedTokens does not match returnedTokens");
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
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);

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
                from: whitelistControllerAddress
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
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens (10 %)", async function () {
            expect(aggregatedStats.processedTokens).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 0.2 tokens", async function () {

            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("200000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("20000000000000000000");

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
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to be 0.40 tokens (0.2 + 20% of last token)", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("400000000000000000");
        });

        
        it("6 - Buy 1 tokens in stage 4 end (40%)", async function () {
            const stageId = 4;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("40000000000000000000");

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
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 1 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1000000000000000000");
        });

        it("7 - Buy 1 tokens in stage 6 end (60%)", async function () {
            const stageId = 6;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("60000000000000000000");

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

        it("Expect locked tokens to be 1.2 tokens ( 40% of bought since last return )", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 0.2 + 1.8 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
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

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 40% of stage 2,4,6 since we're at 60% unlocked for project.
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div( new BN(100) ).mul( new BN(40));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwoFull.sub(ethAllocationPartTwo) );

        });

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.processedTokens).to.be.equal("200000000000000000");
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

        it("8 - A - Return full locked balance of 1.5", async function () {
            const stageId = 6;
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

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("0");
        });

        it("Expect unlocked tokens to to remain the same ( 2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
        });

        it("Expect Participant's aggregatedStats.processedTokens to be 2 tokens", async function () {
            expect(aggregatedStatsAfter.processedTokens).to.be.equal("2000000000000000000");
        }); 

        it("Expect Participant ETH balance to increase by 0.00288 ETH ( 0.00088 + 0.00096 + 0.00104 ) ( sub tx cost ) ", async function () {

            const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const returnTxGasUsed = new BN(returnTx.gasUsed).mul(
                new BN(helpers.networkConfig.gasPrice)
            );

            const ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                .sub(returnTxGasUsed)
                .add(ethAllocationPartTwo)

            expect(ParticipantBalanceAfter.toString()).to.be.equal(ParticipantBalanceAfterValidation.toString());
        });


        it("9 - Buy 1 tokens in stage 8 end (80%)", async function () {
            const stageId = 8;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("80000000000000000000");

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

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");
        });

        it("Expect locked tokens to be 0.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("200000000000000000");
        });

        it("Expect unlocked tokens to be 2.8 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2800000000000000000");
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

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 40% of stage 2,4,6 since we're at 60% unlocked for project.
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div( new BN(100) ).mul( new BN(40));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwoFull.sub(ethAllocationPartTwo) );

        });

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.processedTokens).to.be.equal("200000000000000000");
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

        it("8 - B - Return full locked balance of last stage - 0.4", async function () {
            const stageId = 6;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );

            // send 0.4.. stage 6 full locked amount
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "400000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                 });

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 6 );

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 2.8 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2800000000000000000");
        });

        it("Expect locked tokens to be 0.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("800000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
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

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 40% of stage 2,4,6 since we're at 60% unlocked for project.
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div( new BN(100) ).mul( new BN(40));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwoFull.sub(ethAllocationPartTwo) );
        });

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.processedTokens).to.be.equal("200000000000000000");
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

        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
        });

        it("8 - C - At stage 6 end (60%) - Return 0.1 tokens", async function () {
            // const stageId = 6;
            // currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "100000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 3.1 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3100000000000000000");
        });

        it("Expect locked tokens to be 1.1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1100000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
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

            // console.log("price :                     ", helpers.utils.toEth(helpers, priceDiff), "eth");
            // console.log("price exact :               ", " 0.00052 eth");
            // const returnVal = ParticipantBalanceAfterValidation.sub(ParticipantBalanceAfter);
            // console.log("reuturned value difference: ", helpers.utils.toEth(helpers, returnVal), "eth");
            
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

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 40% of stage 2,4,6 since we're at 60% unlocked for project.
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div( new BN(100) ).mul( new BN(40));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwoFull.sub(ethAllocationPartTwo) );
        });

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.processedTokens).to.be.equal("200000000000000000");
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

        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
        });

        it("8 - D - At stage 6 end (60%) - Return 0.2 tokens", async function () {
            // const stageId = 6;
            // currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );
            
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "200000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 3 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000");
        });

        it("Expect locked tokens to be 1 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
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

            // console.log("price :                     ", helpers.utils.toEth(helpers, priceDiff), "eth");
            // console.log("price exact :               ", " 0.00052 eth");
            // const returnVal = ParticipantBalanceAfterValidation.sub(ParticipantBalanceAfter);
            // console.log("reuturned value difference: ", helpers.utils.toEth(helpers, returnVal), "eth");
            
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

            // 10% of stage 0 and 1, since we returned the rest
            ethAllocationPartOne = new BN(cAStage0.add(cAStage1)).div(new BN(100)).mul(new BN(10));

            // 40% of stage 2,4,6 since we're at 60% unlocked for project.
            ethAllocationPartTwoFull = new BN(cAStage2.add(cAStage4).add(cAStage6));
            ethAllocationPartTwo = ethAllocationPartTwoFull.div( new BN(100) ).mul( new BN(40));

            ContributionAllocationAmounts = ethAllocationPartOne.add( ethAllocationPartTwoFull.sub(ethAllocationPartTwo) );
        });

        it("Expect Participant's aggregatedStats.processedTokens to be 0.2 tokens ( 10% of first return )", async function () {
            aggregatedStatsBefore = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
            expect(aggregatedStatsBefore.processedTokens).to.be.equal("200000000000000000");
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

        it("Expect full token balance to be 3.2 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3200000000000000000");
        });

        it("Expect locked tokens to be 1.2 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000");
        });

        it("Expect unlocked tokens to be 2 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
        });

        it("8 - E - At stage 6 end (60%) - Return 0.30 tokens", async function () {
            // const stageId = 6;
            // currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );
            returnTx = await TokenContractInstance.methods.transfer(RICOContractAddress, "300000000000000000")
                .send({ 
                    from: TestParticipant, 
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );

            aggregatedStatsAfter = await this.ReversibleICO.methods.participantAggregatedStats(TestParticipant).call();
        });

        it("Expect Participant's aggregatedStats.allocatedETH to be 10% of the first 2 contributions + 60% of the second wave", async function () {
            expect(aggregatedStatsAfter.allocatedETH).to.be.equal(ContributionAllocationAmounts.toString());
        });

        it("Expect full token balance to be 2.9 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2900000000000000000");
        });

        it("Expect locked tokens to be 0.9 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("900000000000000000");
        });

        it("Expect unlocked tokens to to remain the same ( 2 tokens )", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("2000000000000000000");
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
                from: whitelistControllerAddress
            });
        });

        it("Buy 900 tokens in stage 0", async function () {
            const stageId = 0;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

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
            const stageId = 0;
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

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
                from: whitelistControllerAddress
            });
        });

        it("2 - Buy 2000 tokens in stage 0", async function () {
            const stageId = 0;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

            const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
            await helpers.web3Instance.eth.sendTransaction({
                from: TestParticipant,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000000");
        });

        it("Expect full token balance to be 2000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("2000000000000000000000");
        });

        it("Expect locked tokens to be 2000 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2000000000000000000000");
        });

        it("Expect unlocked tokens to be 0", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("0");
        });

        it("3 - Return 500 tokens in stage 0", async function () {
            const stageId = 0;

            const expectedReturnEth = new BN((500 * (stageId + 1) * commitPhasePrice).toString());

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1500000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        it("Expect full token balance to be 1500 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1500000000000000000000");
        });

        it("Expect locked tokens to be 1500 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1500000000000000000000");
        });

        it("Expect unlocked tokens to be 0", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("0");
        });

        it("4 - Buy 2000 tokens in stage 2", async function () {
            const stageId = 2;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);

            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(TestParticipant).call();

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

        it("Expect full token balance to be 3500 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3500000000000000000000");
        });

        it("Expect locked tokens to be 3500 tokens - 20% => 2800", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
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

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(
                ethBefore.sub(txCost).add(expectedReturnEth)
            );
        });

        it("Expect full token balance to be 3000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");
        });

        it("Expect locked tokens to reduce by 500 ( 2800 - 500 => 2300 )", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("2300000000000000000000");
        });

        it("Expect unlocked tokens to remain the same at 700 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("700000000000000000000");
        });

        it("6 - Jump to stage 6", async function () {
            const stageId = 6;

            // jump to stage
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7, TokenContractInstance);
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId, true);
            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7, TokenContractInstance );

        });

        it("Expect full token balance to remain the same at 3000 tokens", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");
        });

        it("Expect locked tokens be 1200", async function () {
            const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
            expect(locked).to.be.equal("1200000000000000000000");
        });

        it("Expect unlocked tokens to be 1800 tokens", async function () {
            const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
            expect(unlocked).to.be.equal("1800000000000000000000");
        });

        // it("7 - Buy 2000 tokens in stage 6", async function () {
        //     const stageId = 6;

        //     const ContributionAmount = priceInStage(stageId).mul(new BN(2000));
        //     await helpers.web3Instance.eth.sendTransaction({
        //         from: TestParticipant,
        //         to: this.ReversibleICO.receipt.contractAddress,
        //         value: ContributionAmount.toString(),
        //         gasPrice: helpers.networkConfig.gasPrice
        //     });

        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     expect(balance).to.be.equal("5000000000000000000000");
        // });

        // it("Expect full token balance to be 5000 tokens", async function () {
        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     expect(balance).to.be.equal("5000000000000000000000");
        // });

        // it("Expect locked tokens be 2000", async function () {
        //     const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
        //     expect(locked).to.be.equal("2000000000000000000000");
        // });

        // it("Expect unlocked tokens to be 3000 tokens", async function () {
        //     const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
        //     expect(unlocked).to.be.equal("3000000000000000000000");
        // });

        // it("- Return 500 tokens in stage 6", async function () {
        //     const stageId = 6;

        //     // since we already bought 2000 tokens in this stage,
        //     // and the locked amount is higher than what we want
        //     // to return we'll get full price for them
        //     const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

        //     const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

        //     const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
        //         .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     expect(balance).to.be.equal("4500000000000000000000");

        //     const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
        //     const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

        //     expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        // });

        
        // it("Expect Unlock percentage to be 60%", async function () {
        //     let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
        //     expect(unlockPercentage).to.be.equal("60000000000000000000");
        // });

        // it("8 - Return all tokens", async function () {
        //     this.ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

        //     ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipant);

        //     // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );

        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     this.withdrawTx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, balance)
        //         .send({ 
        //             from: TestParticipant,
        //             gas: 1000000,
        //             gasPrice: helpers.networkConfig.gasPrice 
        //         });

        //     // await helpers.utils.displayContributions(helpers, this.ReversibleICO, TestParticipant, 7 );

        // });

        // it("Expect full token balance to be 3000 tokens", async function () {
        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     expect(balance).to.be.equal("3000000000000000000000");
        // });

        // it("Expect locked tokens be 0", async function () {
        //     const locked = await this.ReversibleICO.methods.getReservedTokenAmount(TestParticipant).call();
        //     expect(locked).to.be.equal("0");
        // });

        // it("Expect unlocked tokens to remain the same at 700 tokens", async function () {
        //     const unlocked = await TokenContractInstance.methods.getUnlockedBalance(TestParticipant).call();
        //     expect(unlocked).to.be.equal("700000000000000000000");
        // });

        // it("ETH Balance is correct", async function () {
            
        //     const returnEth0 = priceInStage(0).mul(new BN(1500));
        //     const returnEth2 = priceInStage(2).mul(new BN(1500));
        //     const returnEth6 = priceInStage(6).mul(new BN(1500));

        //     // add them up and divide by 2
        //     const expectedReturnEth = new BN(
        //         returnEth0
        //         .add(returnEth2)
        //         .add(returnEth6)
        //     // get 40% of the sum
        //     ).div(new BN("100")).mul( new BN("40"));

        //     const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
        //     const txCost = new BN(this.withdrawTx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

        //     expect(ethAfter).to.be.bignumber.equal(this.ethBefore.sub(txCost).add(expectedReturnEth));
        // });

        // it("Token Balance is correct", async function () {
        //     const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
        //     expect(balance).to.be.equal("3000000000000000000000");
        // });
    });
    
});