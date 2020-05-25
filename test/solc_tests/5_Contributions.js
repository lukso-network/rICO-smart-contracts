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

const RicoSaleSupply = setup.settings.token.sale.toString(); //div(10)
const blocksPerDay = 6450;


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

        // reset account nonces..
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

        // starts in one day
        commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        commitPhaseBlockCount = blocksPerDay * 22;
        commitPhasePrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;
        StagePriceIncrease = helpers.solidity.ether * 0.0001;
        commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;

        BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );


        await ReversibleICOInstance.methods.init(
            TokenContractAddress,        // address _tokenAddress
            whitelistingAddress, // address _whitelistingAddress
            projectAddress,        // address _freezerAddress
            projectAddress,        // address _rescuerAddress
            projectAddress,          // address _projectAddress
            commitPhaseStartBlock,                 // uint256 _StartBlock
            commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
            commitPhasePrice,            // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _stageCount
            StageBlockCount,            // uint256 _stageBlockCount
            StagePriceIncrease          // uint256 _stagePriceIncrease in wei
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

describe("Contribution Testing", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("transaction commit()", async function () {

        describe("contract in commit phase", async function () {

            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);
            });

            it("commit sending only money, no commit() function call before any contribution should revert", async function () {

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 3);

                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                await helpers.assertInvalidOpcode(async () => {
                    const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        // data: '0x3c7a3aff', // commit()
                        gasPrice: helpers.networkConfig.gasPrice
                    });
                }, "revert To contribute call commit() [0x3c7a3aff] and send ETH along.");

            });

            it("higher than available tokens should result in partial refund", async function () {

                const InitialBalance = await helpers.utils.getBalance(helpers, participant_1);
                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });

                let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                    [participant_1],
                    true
                ).send({
                    from: whitelistingAddress
                });

                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                const balanceNow =  await helpers.utils.getBalance(helpers, participant_1);
                // should get the overflow back
                expect(
                    balanceNow.toString()
                ).to.equal(
                    "998999998499060000000000"
                );

            });

            it("after, everything on top should result in a full refund", async function () {

                const totalSupply = await ReversibleICOInstance.methods.tokenSupply().call();

                expect(totalSupply).to.equal('0');

                const InitialBalance = await helpers.utils.getBalance(helpers, participant_1);
                const ContributionAmount = new helpers.BN("4000").mul( helpers.solidity.etherBN );

                const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                const balanceNow =  await helpers.utils.getBalance(helpers, participant_1);
                // should get everything back
                expect(
                    balanceNow.toString()
                ).to.equal(
                    InitialBalance.sub(ContributionTxCost).toString()
                );

            });

            it("even after the project withdrew, everything on top should result in a full refund", async function () {

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);

                const InitialBalance = await helpers.utils.getBalance(helpers, participant_1);
                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                // project withdraw
                await ReversibleICOInstance.methods.projectWithdraw('4000').send({
                    from: projectAddress,
                    gas: 2000000
                });

                const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                const balanceNow =  await helpers.utils.getBalance(helpers, participant_1);
                // should get everything back
                expect(
                    balanceNow.toString()
                ).to.equal(
                    InitialBalance.sub(ContributionTxCost).toString()
                );

            });

            it("a second participant should also result in a full refund", async function () {

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);

                const InitialBalance = await helpers.utils.getBalance(helpers, participant_2);
                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_2,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                    [participant_2],
                    true
                ).send({
                    from: whitelistingAddress
                });

                const balanceNow =  await helpers.utils.getBalance(helpers, participant_2);
                // should get everything back
                expect(
                    balanceNow.toString()
                ).to.equal(
                    InitialBalance.sub(ContributionTxCost).toString()
                );

            });

            it("and a third participant should also result in a full refund", async function () {

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);

                const InitialBalance = await helpers.utils.getBalance(helpers, participant_3);
                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                    from: participant_3,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                const ContributionTxCost = new helpers.BN(ContributionTx.gasUsed).mul(
                    new helpers.BN(helpers.networkConfig.gasPrice)
                );

                const balanceBeforeWhitelist =  await helpers.utils.getBalance(helpers, participant_3);
                // should get everything back
                expect(
                    balanceBeforeWhitelist.toString()
                ).to.equal(
                    InitialBalance.sub(ContributionTxCost).sub(ContributionAmount).toString()
                );

                let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                    [participant_3],
                    true
                ).send({
                    from: whitelistingAddress
                });

                const balanceNow =  await helpers.utils.getBalance(helpers, participant_3);
                // should get everything back
                expect(
                    balanceNow.toString()
                ).to.equal(
                    InitialBalance.sub(ContributionTxCost).toString()
                );

            });
        });


        describe("contract in commit phase", async function () {

            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);
            });

            it("transactions to commit() result in contributions", async function () {

                let contributionCount = 0;
                let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const initialContributions = ParticipantByAddress.contributions;

                const ContributionAmount = new helpers.BN("3000").mul( helpers.solidity.etherBN );

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                    [participant_1],
                    true
                ).send({
                    from: whitelistingAddress
                });

                // console.log('DEBUG 1', await ReversibleICOInstance.methods.DEBUG1().call());
                // console.log('DEBUG 2', await ReversibleICOInstance.methods.DEBUG2().call());
                // console.log('DEBUG 3', await ReversibleICOInstance.methods.DEBUG3().call());
                // console.log('DEBUG 4', await ReversibleICOInstance.methods.DEBUG4().call());

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const afterContributions = ParticipantByAddress.contributions;

                expect(
                    afterContributions.toString()
                ).to.be.equal(
                    (parseInt(initialContributions) + contributionCount).toString()
                );

            });
        });

        describe("contract in buy phase", async function () {

            before(async () => {
                await revertToFreshDeployment();
                helpers.utils.resetAccountNonceCache(helpers);

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 5);
            });

            it("transactions to commit() result in contributions", async function () {

                let contributionCount = 0;
                let ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const initialContributions = ParticipantByAddress.contributions;

                const ContributionAmount = new helpers.BN("3000").mul( helpers.solidity.etherBN );

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                    [participant_1],
                    true
                ).send({
                    from: whitelistingAddress
                });

                await helpers.web3Instance.eth.sendTransaction({
                    from: participant_1,
                    to: ReversibleICOInstance.receipt.contractAddress,
                    value: ContributionAmount.toString(),
                    data: '0x3c7a3aff', // commit()
                    gasPrice: helpers.networkConfig.gasPrice
                });
                contributionCount++;

                ParticipantByAddress = await ReversibleICOInstance.methods.participants(participant_1).call();
                const afterContributions = ParticipantByAddress.contributions;

                expect(
                    afterContributions.toString()
                ).to.be.equal(
                    (parseInt(initialContributions) + contributionCount).toString()
                );

            });
        });
    });
});
