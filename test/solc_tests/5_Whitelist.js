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
const blocksPerDay = 1000;

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
    AUTOMATIC_RETURN:1,
    WHITELIST_REJECT:2,
    PARTICIPANT_CANCEL:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAW:5
}


const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let SnapShotKey = "ContributionsTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployerAddress = accounts[0];
const whitelistControllerAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    commitPhaseStartBlock, commitPhaseBlockCount, commitPhasePrice, commitPhaseEndBlock, StageCount,
    StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock, TokenContractInstance,
    TokenContractReceipt, ReversibleICOInstance, ReversibleICOReceipt;

async function revertToFreshDeployment() {

    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }

    if (typeof snapshots[SnapShotKey] !== "undefined" && snapshotsEnabled) {
        // restore snapshot
        await helpers.web3.evm.revert(snapshots[SnapShotKey]);

        // save again because whomever wrote test rpc had the impression no one would ever restore twice.. dafuq
        snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();

        // reset account nonces.
        helpers.utils.resetAccountNonceCache(helpers);
    } else {

        /*
         *   Deploy Token Contract
         */

        TokenContractInstance = await helpers.utils.deployNewContractInstance(
            helpers, "RicoToken", {
                from: holder,
                arguments: [
                    setup.settings.token.supply.toString(),
                    defaultOperators
                ],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );
        TokenContractReceipt = TokenContractInstance.receipt;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        console.log("      TOKEN Gas used for deployment:", TokenContractInstance.receipt.gasUsed);
        console.log("      Contract Address:", TokenContractAddress);

        /*
         *   Deploy RICO Contract
         */
        ReversibleICOInstance = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");
        ReversibleICOReceipt = ReversibleICOInstance.receipt;
        ReversibleICOAddress = ReversibleICOInstance.receipt.contractAddress;
        // helpers.addresses.Rico = ReversibleICOAddress;

        console.log("      RICO Gas used for deployment: ", ReversibleICOInstance.receipt.gasUsed);
        console.log("      Contract Address:", ReversibleICOAddress);
        console.log("");

        await TokenContractInstance.methods.setup(
            ReversibleICOAddress
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
         *   Add RICO Settings
         */
        currentBlock = await ReversibleICOInstance.methods.getCurrentBlockNumber().call();

        // starts in one day
        commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 1 days allocation
        commitPhaseBlockCount = blocksPerDay * 1;
        commitPhasePrice = helpers.solidity.ether * 0.002;

        // 10 x 10 day periods for distribution
        StageCount = 10;
        StageBlockCount = blocksPerDay * 10;
        StagePriceIncrease = commitPhasePrice;
        commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;

        BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );


        await ReversibleICOInstance.methods.init(
            TokenContractAddress,       // address _tokenContractAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            projectWalletAddress,       // address _projectWalletAddress
            commitPhaseStartBlock,      // uint256 _StartBlock
            commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
            commitPhasePrice,           // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _stageCount
            StageBlockCount,            // uint256 _stageBlockCount
            StagePriceIncrease          // uint256 _stagePriceIncrease in wei
        ).send({
            from: deployerAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenContractInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 100000
        });

        expect(
            await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
        ).to.be.equal(RicoSaleSupply.toString());


        // create snapshot
        if (snapshotsEnabled) {
            snapshots[SnapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenContractInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenContractAddress);
    TokenContractInstance.receipt = TokenContractReceipt;
    ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
    ReversibleICOInstance.receipt = ReversibleICOReceipt;

    // do some validation
    expect(
        await helpers.utils.getBalance(helpers, ReversibleICOAddress)
    ).to.be.bignumber.equal( new helpers.BN(0) );

    expect(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversibleICOInstance.methods.tokenSupply().call()
    ).to.be.equal(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    );
};

describe("Whitelist Testing", function () {

    let tokenToEth = function(token, price) {
        return new BN(token).mul(new BN(price));
    };

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("Blacklist participant after whitelisting and whitelist again", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);
        });

        it("Buy 1 token before whitelisting", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Participant cancels", async function () {
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Buy 1 token before whitelisting", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Buy 1 token after getting whitelisted", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Withdraw 1 tokens", async function () {
            await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "1000000000000000000")
                .send({ from: participant_1, gas: 1000000 });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                false
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Balance should still be 1 token", async function () {
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state (should not change)", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
            await ReversibleICOInstance.methods.cancel()
                .send({ from: participant_1, gas: 1000000 });
        });

        it("Check aggregated state", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployerAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participantsByAddress(participant_1).call();

            const ContributionAmount = 1 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1000000000000000000");
        });

        it("Check aggregated state", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistControllerAddress
            });
        });

        it("Balance should be 2 token", async function () {
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Check aggregated state", async function () {
                let aggregated = await ReversibleICOInstance.methods.participantAggregatedStats(participant_1).call();
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
