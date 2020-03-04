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

    describe("Precision Testing", async function () {
 
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

        it("Buy 1 tokens in phase 0", async function () {
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
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Withdraw almost all tokens", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "999999999999999999")
                .send({ from: TestParticipant, gas: 1000000 });
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("1");
        });

        it("Withdraw last token", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1")
                .send({ from: TestParticipant, gas: 1000000 });
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("0");
        });

        it("boughtTokens equals returnedTokens ( since we returned everything )", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const boughtTokens = result.stageBoughtTokens;
            const returnedTokens = result.stageReturnedTokens;
            expect(boughtTokens).to.be.equal(returnedTokens, "boughtTokens does not match returnedTokens");
        });

        it.skip("committedETH equals withdrawnETH ( since we returned everything )", async function () {
            const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
            const committedETH = result.stageCommittedETH;
            const withdrawnETH = result.stageWithdrawnETH;
            expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
        });

        // it("Check participant details", async function () {
        //     const result = await this.ReversibleICO.methods.getParticipantDetailsByStage(TestParticipant, 0).call();
        //     const totalReceivedETH = result["stageTotalReceivedETH"];
        //     const returnedETH = result["stageReturnedETH"];
        //     const committedETH = result["stageCommittedETH"];
        //     const withdrawnETH = result["stageWithdrawnETH"];
        //     const allocatedETH = result["stageAllocatedETH"];
        //     const reservedTokens = result["stageReservedTokens"];

        //     expect(committedETH).to.be.equal(withdrawnETH, "committedETH does not match withdrawnETH");
        // });
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

    
    describe("Withdraw all tokens when 10 % unlocked", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
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

        it("Expect locked tokens to be 1.8 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("1800000000000000000");
        });

        it("Withdraw all tokens", async function () {
            await TokenContractInstance.methods.transfer(RICOContractAddress, "2000000000000000000")
                .send({ from: TestParticipant, gas: 1000000 });
        });

        it("Expect balance to be 0.2 tokens (10 %)", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("200000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            const locked = await this.ReversibleICO.methods.getLockedTokenAmount(TestParticipant, false).call();
            expect(locked).to.be.equal("0");
        });

        it("Withdraw one more token should not be possible", async function () {
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

        it("Buy 2000 tokens in stage 0", async function () {
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

        it("Withdraw 500 token in stage 0", async function () {
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

        it("Buy 2000 tokens in stage 1", async function () {
            const stageId = 1;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

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

        it("Withdraw 500 token in stage 1", async function () {
            const stageId = 1;

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

        it("Buy 2000 tokens in stage 5", async function () {
            const stageId = 5;

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
            expect(balance).to.be.equal("5000000000000000000000");
        });

        it("Withdraw 500 token in stage 5", async function () {
            const stageId = 5;

            // since we already bought 2000 tokens in this stage,
            // and the locked amount is higher than what we want
            // to return we'll get full price for them
            const expectedReturnEth = priceInStage(stageId).mul(new BN(500));

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("4500000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        it("Jump to end of phase 5 (50 % unlocked)", async function () {
            // jump to last block of phase 1
            currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 5, true);

            let unlockPercentage = await this.ReversibleICO.methods.getCurrentUnlockPercentage().call();
            expect(unlockPercentage).to.be.equal("50000000000000000000");
        });

        it("Withdraw all tokens", async function () {
            const returnEth0 = priceInStage(0).mul(new BN(500));
            const returnEth1 = priceInStage(1).mul(new BN(500));
            const returnEth5 = priceInStage(5).mul(new BN(500));

            const expectedReturnEth = returnEth0.add(returnEth1).add(returnEth5);

            const ethBefore = await helpers.utils.getBalance(helpers, TestParticipant);

            const tx = await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "4500000000000000000000")
                .send({ from: TestParticipant, gas: 1000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
            expect(balance).to.be.equal("3000000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, TestParticipant);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });
    });
    
});