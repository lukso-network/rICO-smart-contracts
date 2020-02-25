const {
    validatorHelper
} = require('../includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment
} = require('../includes/deployment');

const snapshots = [];
const testKey = "TokensTests";

describe("ReversibleICO - Methods - Tokens", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress, currentBlock;
    let TokenContractInstance;

    before(async function () {
        requiresERC1820Instance();

        const contracts = await doFreshDeployment(snapshots, testKey, 2, setup.settings);
        this.ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = this.ReversibleICO.receipt.contractAddress;

        currentBlock = parseInt( await this.ReversibleICO.methods.getCurrentBlockNumber().call(), 10);
        this.jsValidator = new validatorHelper(setup.settings, currentBlock);
    });

    describe("Contract Methods", async function () {

        describe("view getLockedTokenAmount(address)", async function () {

            const ContributionAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
            let BuyPhaseStartBlock, BuyPhaseBlockCount, BuyPhaseEndBlock;

            before(async function () {
        
                BuyPhaseStartBlock = await this.ReversibleICO.methods.buyPhaseStartBlock().call();
                BuyPhaseBlockCount = await this.ReversibleICO.methods.buyPhaseBlockCount().call();
                BuyPhaseEndBlock = await this.ReversibleICO.methods.buyPhaseEndBlock().call();

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
});