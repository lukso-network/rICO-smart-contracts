const {
    validatorHelper
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

        let tokenToEth = function(token, price) {
            return new BN(token).mul(new BN(price));
        };

        it("Buy 1 token before whitelisting", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
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

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
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

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
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
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(3, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
        });

        it("Blacklist buyer", async function () {
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
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(3, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
        });

        it("Buy 1 token while being blacklisted", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(4, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
        });

        it("Participant cancels", async function () {
            await this.ReversibleICO.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Check aggregated state", async function () {
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(4, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
        });

        it("Buy 1 token while being blacklisted", async function () {
            const ParticipantByAddress = await this.ReversibleICO.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: this.ReversibleICO.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(5, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("2000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
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
            const aggregated = await this.ReversibleICO.methods.participantAggregatedStats(participant_1).call();
            expect(new BN(aggregated["totalReceivedETH"]))
                .to.be.bignumber.equal(tokenToEth(5, commitPhasePrice), "aggregated.totalReceivedETH mismatch");
            expect(new BN(aggregated["returnedETH"]))
                .to.be.bignumber.equal(tokenToEth(2, commitPhasePrice), "aggregated.returnedETH mismatch");
            expect(new BN(aggregated["committedETH"]))
                .to.be.bignumber.equal(tokenToEth(3, commitPhasePrice), "aggregated.committedETH mismatch");
            expect(new BN(aggregated["withdrawnETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.withdrawnETH mismatch");
            expect(new BN(aggregated["allocatedETH"]))
                .to.be.bignumber.equal(tokenToEth(1, commitPhasePrice), "aggregated.allocatedETH mismatch");
            expect(new BN(aggregated["reservedTokens"]))
                .to.be.bignumber.equal(new BN("0"), "aggregated.reservedTokens mismatch");
            expect(new BN(aggregated["boughtTokens"]))
                .to.be.bignumber.equal(new BN("3000000000000000000"), "aggregated.boughtTokens mismatch");
            expect(new BN(aggregated["returnedTokens"]))
                .to.be.bignumber.equal(new BN("1000000000000000000"), "aggregated.returnedTokens mismatch");
        });
    });
});