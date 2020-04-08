const {
    validatorHelper,
    clone
} = require('../../includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot
} = require('../../includes/deployment');

const testKey = "TokenCommitTests";

describe("ReversibleICO - Methods - Tokens", function () {

    const deployerAddress = accounts[0];
    const whitelisterAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;

    // custom settings for this test only
    const customTestSettings = clone(setup.settings);
    customTestSettings.rico.stageCount = 10;

    priceInStage = (_stageId) => {
        // commitPhasePrice + stage * stagePriceIncrease
        return new BN(customTestSettings.rico.commitPhasePrice).add(
            new BN(_stageId).mul(
                new BN(customTestSettings.rico.stagePriceIncrease)
            )
        );
    }

    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        const currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));
    });

    describe("Contract Methods", async function () {

        const TestParticipant = participant_1;
        const testSnapshotKey = testKey+"_whitelisted";

        before(async function () {
            // whitelist the participant
            whitelistTx = await this.ReversibleICO.methods.whitelist(
                [TestParticipant], true
            ).send({
                from: whitelisterAddress
            });

            await saveSnapshot(testSnapshotKey);
        });

        describe("fallback() commit()", async function () {

            describe("single buy", async function () {

                beforeEach(async function () {
                    restoreFromSnapshot(testSnapshotKey);
                });

                it("Buy 1 token in stage 0", async function () {
                    const tokensToBuy = 1;
                    const stageId = 0;

                    // jump to stage
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(balance).to.be.equal("1000000000000000000");
                });

                it("Buy 1 token in stage 1", async function () {
                    const tokensToBuy = 1;
                    const stageId = 1;

                    // jump to stage
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(balance).to.be.equal("1000000000000000000");
                });

                it("Buy 1 token in stage 2", async function () {
                    const stageId = 2;
                    const tokensToBuy = 1;

                    // jump to stage
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(balance).to.be.equal("1000000000000000000");
                });

                it("Buy 1 token in last stage", async function () {
                    const stageId = customTestSettings.rico.stageCount;
                    const tokensToBuy = 1;

                    // jump to stage
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(balance).to.be.equal("1000000000000000000");
                });

            });

            describe("multiple buys from one participant in different stages", async function () {

                const oneToken = new BN("1000000000000000000");

                before(async function () {
                    restoreFromSnapshot(testSnapshotKey);
                });

                it("1 - Buy 1 token in stage 0 - should have 1 token", async function () {
                    const tokensToBuy = 1;
                    const stageId = customTestSettings.rico.stageCount;

                    // jump to stage 
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(new BN(balance)).to.be.bignumber.equal(oneToken);
                });

                it("2 - Buy 1 token in stage 1 - should have 2 tokens", async function () {
                    const tokensToBuy = 1;
                    const stageId = 1;

                    // jump to stage 1
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(new BN(balance)).to.be.bignumber.equal(oneToken.mul(new BN(2)));
                });

                it("3 - Buy 1 token in last stage - should have 3 tokens", async function () {
                    const tokensToBuy = 1;
                    const stageId = 1;

                    // jump to stage 1
                    currentBlock = await helpers.utils.jumpToContractStage(this.ReversibleICO, deployerAddress, stageId);

                    const ContributionAmount = priceInStage(stageId).mul(new BN(tokensToBuy));
                    await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipant,
                        to: this.ReversibleICO.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                    
                    let balance = await TokenContractInstance.methods.balanceOf(TestParticipant).call();
                    expect(new BN(balance)).to.be.bignumber.equal(oneToken.mul(new BN(3)));
                });

            });

        });

    });

});