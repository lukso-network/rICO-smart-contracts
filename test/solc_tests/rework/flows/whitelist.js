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

const testKey = "WhitelistTests";

describe("ReversibleICO - Whitelist Testing", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;

    const customTestSettings = clone(setup.settings);

    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, setup.settings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        // jump to phase 0
        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(setup.settings, parseInt( currentBlock, 10));
    });

    describe("Blacklist participant after whitelisting and whitelist again", async function () {

        const tokenToEth = function(token, _stageId) {
            return new BN(token).mul( priceInStage(_stageId) );
        };

        const priceInStage = (_stageId) => {
            // commitPhasePrice + stage * stagePriceIncrease
            return new BN(customTestSettings.rico.commitPhasePrice).add(
                new BN(_stageId).mul(
                    new BN(customTestSettings.rico.stagePriceIncrease)
                )
            );
        }

        it("Buy 1 token before whitelisting", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();
            const stageId = 0;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Participant cancels", async function () {
            await this.ReversibleICO.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Buy 1 token before whitelisting", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();
            const stageId = 0;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Whitelist buyer", async function () {
            const whitelistTx = await this.ReversibleICO.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Buy 1 token after getting whitelisted", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();
            const stageId = 0;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Withdraw 1 tokens", async function () {
            await TokenContractInstance.methods.transfer(this.ReversibleICO.receipt.contractAddress, "1000000000000000000")
                .send({ from: participant_1, gas: 1000000 });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {

            // await helpers.utils.displayContributions(helpers, this.ReversibleICO, participant_1, 2 );

            const stageId = 0;
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(3, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");

            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");

        });

        it("Un-whitelist buyer", async function () {
            const whitelistTx = await this.ReversibleICO.methods.whitelist(
                [participant_1],
                false
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Balance should still be 1 token", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state (should not change)", async function () {
            const stageId = 0;
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(3, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");

            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");
        });

        it("Buy 1 token while being un-whitelisted", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();
            const stageId = 0;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
            const stageId = 0;

            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(4, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");

            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");
        });

        it("Participant cancels", async function () {
            await this.ReversibleICO.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Check aggregated state", async function () {
            const stageId = 0;

            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(4, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");

            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");
        });

        it("Buy 1 token while being un-whitelisted", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();
            const stageId = 0;

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
            const stageId = 0;

            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(5, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");
        });

        it("Whitelist buyer (again)", async function () {
            const whitelistTx = await this.ReversibleICO.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Balance should be 2 token", async function () {
            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Check aggregated state", async function () {
            const stageId = 0;

            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalSentETH"]))
                .to.be.bignumber.equal(tokenToEth(5, stageId), "aggregated.totalSentETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, stageId), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(3, stageId), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, stageId), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["pendingTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.pendingTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("3000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
            // allocated needs to be 0 since we're in stage 0.. where we don't allocate.
            expect(new BN(aggregated["allocatedETH"]))
            .to.be.bignumber.equal(new BN("0"), "aggregated.allocatedETH mismatch");
        });


        it("Jump to stage 1 and buy 1 token", async function () {
            const stageId = 1;

            const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 1);

            const ContributionAmount = priceInStage(stageId).mul(new BN(1));
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount.toString(),
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("3000000000000000000");
        });


        it("Check aggregated state", async function () {
            const stageId = 1;

            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();

            // 5 in stage 0, 1 in stage 1
            const receivedEth = tokenToEth(5, 0).add(tokenToEth(1, 1));
            // 2 in stage 0
            const returnedETH = tokenToEth(2, 0);
            // 3 in stage 0, 1 in stage 1
            const committedETH = tokenToEth(3, 0).add(tokenToEth(1, stageId));
            // 1 in stage 0
            const withdrawnETH = tokenToEth(1, 0)
            const pendingTokens = new BN("0");
            const boughtTokens = new BN("4000000000000000000");
            const returnedTokens = new BN("1000000000000000000");

            const allocatedETH = new BN("0");

            expect(new BN(aggregated.totalSentETH)).to.be.bignumber.equal(receivedEth);
            expect(new BN(aggregated.returnedETH)).to.be.bignumber.equal(returnedETH);
            expect(new BN(aggregated.committedETH)).to.be.bignumber.equal(committedETH);
            expect(new BN(aggregated.withdrawnETH)).to.be.bignumber.equal(withdrawnETH);
            expect(new BN(aggregated.pendingTokens)).to.be.bignumber.equal(pendingTokens);
            expect(new BN(aggregated.boughtTokens)).to.be.bignumber.equal(boughtTokens);
            expect(new BN(aggregated.returnedTokens)).to.be.bignumber.equal(returnedTokens);

            // allocated needs to be 0 since we haven't used withdrawn in this stage yet
            expect(new BN(aggregated.allocatedETH)).to.be.bignumber.equal(allocatedETH);

        });

    });
});