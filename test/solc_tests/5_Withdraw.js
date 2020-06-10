const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const holder = accounts[10];
const projectAddress = holder;
const participant_1 = accounts[4];
const participant_2 = accounts[5];
const participant_3 = accounts[6];
const participant_4 = accounts[7];
const participant_5 = accounts[8];
const participant_6 = accounts[9];

const RicoSaleSupply = setup.settings.token.sale.toString();
const blocksPerDay = 1000;


const TransferTypes = {
    NOT_SET: 0,
    WHITELIST_REJECTED: 1,
    CONTRIBUTION_CANCELED: 2,
    CONTRIBUTION_ACCEPTED_OVERFLOW: 3,
    PARTICIPANT_WITHDRAW: 4,
    PARTICIPANT_WITHDRAW_OVERFLOW: 5,
    PROJECT_WITHDRAWN: 6
};


const ERC777data = web3.utils.sha3('777TestData');
const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';

let errorMessage;

let SnapShotKey = "ContributionsTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployingAddress = accounts[0];
const whitelistingAddress = accounts[1];

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
            helpers, "ReversibleICOToken", {
                from: holder,
                arguments: [
                    setup.settings.token.name,
                    setup.settings.token.symbol,
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

        await TokenContractInstance.methods.init(
            ReversibleICOAddress,
            holder, holder, holder,
            setup.settings.token.supply.toString()
        ).send({
            from: holder,  // initial token supply holder
        });

        /*
         *   Add RICO Settings
         */
        currentBlock = await ReversibleICOInstance.methods.getCurrentEffectiveBlockNumber().call();

        await ReversibleICOInstance.methods.init(
            helpers.addresses.Token,                 // address _tokenAddress
            whitelistingAddress,                     // address _whitelistingAddress
            projectAddress,                          // address _freezerAddress
            projectAddress,                          // address _rescuerAddress
            projectAddress,                          // address _projectAddress
            setup.settings.startBlockDelay,                // uint256 _commitPhaseStartBlock
            setup.settings.buyPhaseStartBlock,             // uint256 _buyPhaseStartBlock,
            setup.settings.buyPhaseEndBlock,               // uint256 _buyPhaseEndBlock,
            setup.settings.commitPhasePrice,                        // uint256 _initialPrice in wei
            setup.settings.StageCount,                     // uint8   _stageCount
            setup.settings.stageTokenLimitIncrease,       // uint256 _stageTokenLimitIncrease
            setup.settings.StagePriceIncrease                       // uint256 _stagePriceIncrease in wei
        ).send({
            from: deployingAddress,  // deployer
            gas: 3000000
        });

        // transfer tokens to rico
        await TokenContractInstance.methods.send(
            ReversibleICOInstance.receipt.contractAddress,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: holder,  // initial token supply holder
            gas: 200000
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
    TokenContractInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOToken", TokenContractAddress);
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

describe("Withdrawal Testing", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("Precision Testing", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Buy 1 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

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

        it("Expect locked tokens to be 1 tokens", async function () {
            let locked = await ReversibleICOInstance.methods.getParticipantReservedTokens(participant_1).call();
            expect(locked).to.be.equal("1000000000000000000");
        });

        it("Withdraw almost all tokens", async function () {
            await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "999999999999999999")
                .send({ from: participant_1, gas: 2000000 });
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1");
        });

        it("Withdraw last token", async function () {
            await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "1")
                .send({ from: participant_1, gas: 2000000 });
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Check participant details", async function () {
            let result = await ReversibleICOInstance.methods.getParticipantDetailsByStage(participant_1, 0).call();
            let totalSentETH = result["stagetotalSentETH"];
            let returnedETH = result["stageReturnedETH"];
            let committedETH = result["stageCommittedETH"];
            let withdrawnETH = result["stageWithdrawnETH"];
            let allocatedETH = result["stageAllocatedETH"];
            let pendingTokens = result["stagePendingTokens"];
            let boughtTokens = result["stageBoughtTokens"];
            let returnedTokens = result["stageReturnedTokens"];

            expect(committedETH).to.be.equal(withdrawnETH);
            expect(boughtTokens).to.be.equal(returnedTokens);
        });
    });

    describe("Check getParticipantPendingEth before and after whitelisting", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Buy 2 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 2 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Check participant available ETH", async function () {
            let partici = await ReversibleICOInstance.methods.participants(participant_1).call();
            expect(new BN(partici.pendingETH)).to.be.bignumber.equal(new BN(2).mul(new BN(commitPhasePrice)));
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Check participant available ETH", async function () {
            let partici = await ReversibleICOInstance.methods.participants(participant_1).call();
            expect(new BN(partici.pendingETH)).to.be.bignumber.equal(new BN(0));
        });
    });

    describe("Withdraw all tokens when 10 % unlocked", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Buy 1 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 2 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");

            console.log("balance before:    ", balance.toString());
            console.log("ContributionAmount:", ContributionAmount.toString());

        });

        it("Buy 1 tokens in phase 1", async function () {

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            console.log("balance before:    ", balance.toString());

            // jump to phase 1
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 1);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 1 * (2 * commitPhasePrice);
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });
            
            console.log("ContributionAmount:", ContributionAmount.toString());

            balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            console.log("balance after:     ", balance.toString());

            balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000");
        });

        it("Jump to phase 2 (10 % unlocked)", async function () {
            // jump to last block of phase 1
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 1, true);

            let unlockPercentage = await ReversibleICOInstance.methods.getCurrentGlobalUnlockRatio().call();
            expect(unlockPercentage).to.be.equal("10000000000000000000");
        });

        it("Expect locked tokens to be 1.8 tokens", async function () {
            let locked = await ReversibleICOInstance.methods.getParticipantReservedTokens(participant_1).call();
            expect(locked).to.be.equal("1800000000000000000");
        });

        it("Withdraw all tokens", async function () {
            await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "2000000000000000000")
                .send({ from: participant_1, gas: 2000000 });
        });

        it("Expect balance to be 0.2 tokens (10 %)", async function () {
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("200000000000000000");
        });

        it("Expect locked tokens to be 0 tokens", async function () {
            let locked = await ReversibleICOInstance.methods.getParticipantReservedTokens(participant_1).call();
            expect(locked).to.be.equal("0");
        });

        it("Withdraw one more token should not be possible", async function () {
            await helpers.assertInvalidOpcode(async () => {
                await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "1")
                    .send({ from: participant_1, gas: 2000000 });
            }, "revert Withdraw not possible. Participant has no locked tokens.");
        });

        it("Expect balance to remain 0.2 tokens", async function () {
            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("200000000000000000");
        });
    });

    describe("Withdrawing should not deliver too many tokens with next buy", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Buy 900 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 900 * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("900000000000000000000");
        });

        it("Withdraw all tokens", async function () {
            await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "900000000000000000000")
                .send({ from: participant_1, gas: 2000000 });

            let balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("0");
        });

        it("Buy 1 tokens in phase 0", async function () {
            // jump to phase 0
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);

            let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

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
    });

    describe("Multiple withdrawals", async function () {

        before(async () => {
            await revertToFreshDeployment();
            helpers.utils.resetAccountNonceCache(helpers);
            // jump to contract start
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 0);
        });

        it("Whitelist buyer", async function () {
            let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                [participant_1],
                true
            ).send({
                from: whitelistingAddress
            });
        });

        it("Buy 2000 tokens in phase 0", async function () {
            const stage = 0;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, stage);

            const ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 2000 * (stage + 1) * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("2000000000000000000000");
        });

        it("Withdraw 500 token in phase 0", async function () {
            const stage = 0;

            const expectedReturnEth = new BN((500 * (stage + 1) * commitPhasePrice).toString());

            const ethBefore = await helpers.utils.getBalance(helpers, participant_1);

            const tx = await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "500000000000000000000")
                .send({ from: participant_1, gas: 2000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("1500000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, participant_1);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        it("Buy 2000 tokens in phase 1", async function () {
            const stage = 1;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, stage);

            const ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 2000 * (stage + 1) * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("3500000000000000000000");
        });

        it("Withdraw 500 token in phase 1", async function () {
            const stage = 1;

            const expectedReturnEth = new BN((500 * (stage + 1) * commitPhasePrice).toString());

            const ethBefore = await helpers.utils.getBalance(helpers, participant_1);

            const tx = await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "500000000000000000000")
                .send({ from: participant_1, gas: 2000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("3000000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, participant_1);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        it("Buy 2000 tokens in phase 5", async function () {
            const stage = 5;

            // jump to stage
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, stage);

            const ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();

            const ContributionAmount = 2000 * (stage + 1) * commitPhasePrice;
            await helpers.web3Instance.eth.sendTransaction({
                from: participant_1,
                to: ReversibleICOInstance.receipt.contractAddress,
                value: ContributionAmount,
                gasPrice: helpers.networkConfig.gasPrice
            });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("5000000000000000000000");
        });

        it("Withdraw 500 token in phase 5", async function () {
            const stage = 5;

            const expectedReturnEth = new BN((500 * (stage + 1) * commitPhasePrice).toString());

            const ethBefore = await helpers.utils.getBalance(helpers, participant_1);

            const tx = await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "500000000000000000000")
                .send({ from: participant_1, gas: 2000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("4500000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, participant_1);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });

        it("Jump to end of phase 5 (50 % unlocked)", async function () {
            // jump to last block of phase 1
            currentBlock = await helpers.utils.jumpToContractStage(ReversibleICOInstance, deployingAddress, 5, true);

            let unlockPercentage = await ReversibleICOInstance.methods.getCurrentGlobalUnlockRatio().call();
            expect(unlockPercentage).to.be.equal("50000000000000000000");
        });

        it("Withdraw all tokens", async function () {
            const returnEth0 = 500 * 1 * commitPhasePrice;
            const returnEth1 = 500 * 2 * commitPhasePrice;
            const returnEth5 = 500 * 6 * commitPhasePrice;
            const expectedReturnEth = new BN((returnEth0 + returnEth1 + returnEth5).toString());

            const ethBefore = await helpers.utils.getBalance(helpers, participant_1);

            const tx = await TokenContractInstance.methods.transfer(ReversibleICOInstance.receipt.contractAddress, "4500000000000000000000")
                .send({ from: participant_1, gas: 2000000, gasPrice: helpers.networkConfig.gasPrice });

            const balance = await TokenContractInstance.methods.balanceOf(participant_1).call();
            expect(balance).to.be.equal("3000000000000000000000");

            const ethAfter = await helpers.utils.getBalance(helpers, participant_1);
            const txCost = new BN(tx.gasUsed).mul(new BN(helpers.networkConfig.gasPrice.toString()));

            expect(ethAfter).to.be.bignumber.equal(ethBefore.sub(txCost).add(expectedReturnEth));
        });
    });
});
