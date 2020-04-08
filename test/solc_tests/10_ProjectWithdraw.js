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
const blocksPerDay = 5;      // 6450;
const commitPhaseDays = 4;   // 22;
const StageDays = 2;         // 30;


const ApplicationEventTypes = {
    NOT_SET:0,        // will match default value of a mapping result
    CONTRIBUTION_ADDED:1,
    CONTRIBUTION_CANCELED:2,
    CONTRIBUTION_ACCEPTED:3,
    WHITELIST_APPROVED:4,
    WHITELIST_REJECTED:5,
    PROJECT_WITHDRAWN:6
}

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

let SnapShotKey = "FlowTestInit";
let snapshotsEnabled = true;
let snapshots = [];

const deployingAddress = accounts[0];
const whitelistingAddress = accounts[1];

let TokenContractAddress, ReversibleICOAddress, stageValidation = [], currentBlock,
    commitPhaseStartBlock, commitPhaseBlockCount, commitPhasePrice, StageCount,
    StageBlockCount, StagePriceIncrease, BuyPhaseEndBlock, TokenContractInstance,
    TokenContractReceipt, ReversibleICOInstance, ReversibleICOReceipt;

// clean these up
let buyPhaseStartBlock, buyPhaseEndBlock;

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

        // starts in one day + 1, so the stages are even and end on nice numbers
        commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay + 1;

        // 22 days allocation
        commitPhaseBlockCount = blocksPerDay * commitPhaseDays; // 22
        commitPhasePrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * StageDays; // 30
        StagePriceIncrease = helpers.solidity.ether * 0.0001;

        await ReversibleICOInstance.methods.init(
            TokenContractAddress,       // address _TokenContractAddress
            whitelistingAddress, // address _whitelistingAddress
            projectAddress,       // address _projectAddress
            commitPhaseStartBlock,      // uint256 _StartBlock
            commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
            commitPhasePrice,           // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
        ).send({
            from: deployingAddress,  // deployer
            gas: 3000000
        });


        buyPhaseStartBlock = parseInt(await ReversibleICOInstance.methods.buyPhaseStartBlock().call(), 10);
        buyPhaseEndBlock = parseInt(await ReversibleICOInstance.methods.buyPhaseEndBlock().call(), 10);

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
    ).to.be.bignumber.equal( new BN(0) );

    expect(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    ).to.be.equal(RicoSaleSupply.toString());

    expect(
        await ReversibleICOInstance.methods.tokenSupply().call()
    ).to.be.equal(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    );
};

async function commitFundsFromAddress(address, amount) {

    return await helpers.web3Instance.eth.sendTransaction({
        from: address,
        to: ReversibleICOInstance.receipt.contractAddress,
        value: amount.toString(),
        gasPrice: helpers.networkConfig.gasPrice
    });
}

async function whitelist(address) {

    return await ReversibleICOInstance.methods.whitelist(
        [address],
        true,
    ).send({
        from: whitelistingAddress
    });
}

describe("ProjectWithdraw Testing", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("getAvailableProjectETH()", function () {

        const ContributionAmount = new BN("100").mul( helpers.solidity.etherBN );

        describe("Scenario: One 100 ETH NOT whitelisted contribution in contract (Participant1)", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                await commitFundsFromAddress(participant_1, ContributionAmount);
                // await whitelist(participant_1);

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 1, false, 1);
                helpers.utils.resetAccountNonceCache(helpers);

            });

            describe("- contract in commit phase ( stage 0 - last block )", async function () {

                before(async () => {
                    const stage = 0;
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, stage, true, 0);
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 0 (since project cannot withdraw at this point)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(ProjectAvailableEth.toString()).to.equal("0");
                });

            });

            describe("- contract at 50% of the buy phase", async function () {

                before(async () => {
                    const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                    await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                        from: deployingAddress, gas: 100000
                    });

                    currentBlock = middleBlock;
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 0 (since contribution is not whitelisted)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        "0"
                    );
                });
            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 0 (since contribution is not whitelisted)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        "0"
                    );
                });

            });

        });

        describe("Scenario: One 100 ETH whitelisted contribution in contract (Participant1)", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 1, false, 1);
                helpers.utils.resetAccountNonceCache(helpers);

            });

            describe("- contract in commit phase ( stage 0 - last block )", async function () {

                before(async () => {
                    const stage = 0;
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, stage, true, 0);
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 0 (since project cannot withdraw at this point)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(ProjectAvailableEth.toString()).to.equal("0");
                });

            });

            describe("- contract at 50% of the buy phase", async function () {

                before(async () => {
                    const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                    await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                        from: deployingAddress, gas: 100000
                    });

                    currentBlock = middleBlock;
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 50 eth (project gets 50%)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("50").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });


            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 100 eth (project gets 100%)", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        ContributionAmount.toString()
                    );
                });

            });

        });


        describe("Scenario: One 100 ETH whitelisted contribution in contract (Participant1), Second 100 ETH contribution at middle block (Participant2)", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                // contribution 2
                await commitFundsFromAddress(participant_2, ContributionAmount);
                await whitelist(participant_2);

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });

            describe("- contract at 50% of the buy phase", async function () {

                 it("returns 100 eth ( half of both contributions )", async function () {

                     const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("100").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 200 eth", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("200").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

        });

        describe("Scenario: One contribution at stage 0, project withdraw at middle", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                // project withdraw
                const AvailableForWithdraw = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                await ReversibleICOInstance.methods.projectWithdraw(
                    AvailableForWithdraw.toString()
                ).send({
                    from: projectAddress
                });

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });

            describe("- contract at 50% of the buy phase", async function () {

                it("returns 0 (project withdrew the 50 that were available)", async function () {

                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal("0");
                });

            });

            describe("- contract at 75% of the buy phase", async function () {

                before(async () => {
                    const ThreeFourthsTheWayThere = buyPhaseStartBlock + Math.floor(((buyPhaseEndBlock - buyPhaseStartBlock) / 4) * 3);
                    await ReversibleICOInstance.methods.jumpToBlockNumber(ThreeFourthsTheWayThere).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 25 (project already withdrew the 50 that were available at middle)", async function () {

                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("25").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 50 eth ( that was remaining in contract )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("50").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

        });



        describe("Scenario: One contribution at stage 0 (Participant1), contract at buy phase 50%, full token balance returned ( token withdraw )", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount); // 100 ETH
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                const ReturnTokenAmount = new BN(
                    await TokenContractInstance.methods.balanceOf(participant_1).call()
                );

                // send full token balance back to rico
                await TokenContractInstance.methods.send(
                    ReversibleICOInstance.receipt.contractAddress,
                    ReturnTokenAmount.toString(),
                    ERC777data
                ).send({
                    from: participant_1,
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });


            describe("- contract at 50% of the buy phase", async function () {

                it("returns 50 eth ( allocated by withdraw )", async function () {

                    console.log('CurrentBlockNumber ', await ReversibleICOInstance.methods.getCurrentBlockNumber().call());
                    console.log('buyPhaseStartBlock ', await ReversibleICOInstance.methods.buyPhaseStartBlock().call());
                    console.log('buyPhaseEndBlock ', await ReversibleICOInstance.methods.buyPhaseEndBlock().call());
                    console.log('committedETH ', await ReversibleICOInstance.methods.committedETH().call());
                    console.log('DEBUG1 ', await ReversibleICOInstance.methods.DEBUG1().call());
                    console.log('DEBUG2 ', await ReversibleICOInstance.methods.DEBUG2().call());
                    console.log('DEBUG3 ', await ReversibleICOInstance.methods.DEBUG3().call());


                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("50").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 50 eth", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("50").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

        });



        describe("Scenario: One contribution at stage 0 (Participant1), contract at buy phase 50%, full token balance returned ( token withdraw ), project withdraw", async function () {

            let projectWalletBalanceBefore, projectWalletBalanceAfter, projectWithdrawTx;

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                const ReturnTokenAmount = new BN(
                    await TokenContractInstance.methods.balanceOf(participant_1).call()
                );

                // send full token balance back to rico
                await TokenContractInstance.methods.send(
                    ReversibleICOInstance.receipt.contractAddress,
                    ReturnTokenAmount.toString(),
                    ERC777data
                ).send({
                    from: participant_1,
                    gas: 1000000,
                    gasPrice: helpers.networkConfig.gasPrice
                });

                projectWalletBalanceBefore = await helpers.utils.getBalance(helpers, projectAddress);

                // project withdraw
                const AvailableForWithdraw = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                projectWithdrawTx = await ReversibleICOInstance.methods.projectWithdraw(
                    AvailableForWithdraw.toString()
                ).send({
                    from: projectAddress,
                    gasPrice: helpers.networkConfig.gasPrice.toString()
                });

                projectWalletBalanceAfter = await helpers.utils.getBalance(helpers, projectAddress);

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });


            describe("- contract at 50% of the buy phase", async function () {

                it("returns 0 eth ( since balance was already withdrawn )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        "0"
                    );
                });

                it("projectWallet balance increased by 50 ETH", async function () {

                    let projectWithdrawTxGasCost = new BN(projectWithdrawTx.gasUsed).mul(
                        new BN( helpers.networkConfig.gasPrice.toString() )
                    );

                    const projectWalletBalanceValidation = projectWalletBalanceBefore
                        // subtract project withdraw tx cost
                        .sub(projectWithdrawTxGasCost)
                        // add how much eth we're expecting to withdraw
                        .add(new BN("50").mul( helpers.solidity.etherBN ))

                    expect(
                        projectWalletBalanceAfter.toString()
                    ).to.equal(
                        projectWalletBalanceValidation.toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 0 eth ( since balance was already withdrawn )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        "0"
                    );
                });
            });
        });


        describe("Scenario: One 100 ETH contribution at stage 0 (Participant1), project withdraw at middle, then new 100 ETH contribution (Participant2)", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                // project withdraw
                const AvailableForWithdraw = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                await ReversibleICOInstance.methods.projectWithdraw(
                    AvailableForWithdraw.toString()
                ).send({
                    from: projectAddress
                });

                // contribution 2
                await commitFundsFromAddress(participant_2, ContributionAmount);
                await whitelist(participant_2);

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });


            describe("- contract at 50% of the buy phase", async function () {

                it("returns 50 eth ( 0 from first, half of the second contribution )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("50").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });


            describe("- contract at 75% of the buy phase", async function () {

                before(async () => {
                    const ThreeFourthsTheWayThere = buyPhaseStartBlock + Math.floor(((buyPhaseEndBlock - buyPhaseStartBlock) / 4) * 3);
                    await ReversibleICOInstance.methods.jumpToBlockNumber(ThreeFourthsTheWayThere).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 100 eth ( 25 from first, 75 from second )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("100").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 150 eth ( 50 from first, 100 from second )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("150").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

        });

        describe("Scenario: One 100 ETH contribution at stage 0 (Participant1), project withdraw HALF available at middle, then new 100 ETH contribution (Participant2)", async function () {

            before(async () => {

                await revertToFreshDeployment();

                currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployingAddress, 0);

                // contribution 1
                await commitFundsFromAddress(participant_1, ContributionAmount);
                await whitelist(participant_1);

                // jump to middle block
                const middleBlock = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2);
                await ReversibleICOInstance.methods.jumpToBlockNumber(middleBlock).send({
                    from: deployingAddress, gas: 100000
                });

                // project withdraw
                const AvailableForWithdraw = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                await ReversibleICOInstance.methods.projectWithdraw(
                    AvailableForWithdraw.div(new BN("2")).toString()
                ).send({
                    from: projectAddress
                });

                // contribution 2
                await commitFundsFromAddress(participant_2, ContributionAmount);
                await whitelist(participant_2);

                currentBlock = middleBlock;
                helpers.utils.resetAccountNonceCache(helpers);

            });


            describe("- contract at 50% of the buy phase", async function () {

                it("returns 75 eth ( 25 from first, half of the second contribution )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("75").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });


            describe("- contract at 75% of the buy phase", async function () {

                before(async () => {
                    const ThreeFourthsTheWayThere = buyPhaseStartBlock + Math.floor(((buyPhaseEndBlock - buyPhaseStartBlock) / 4) * 3);
                    await ReversibleICOInstance.methods.jumpToBlockNumber(ThreeFourthsTheWayThere).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 125 eth ( 50 from first, 75 from second )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("125").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

            describe("- contract after end of rICO", async function () {

                before(async () => {
                    await ReversibleICOInstance.methods.jumpToBlockNumber(buyPhaseEndBlock).send({
                        from: deployingAddress, gas: 100000
                    });
                    helpers.utils.resetAccountNonceCache(helpers);
                });

                it("returns 175 eth ( 75 from first, 100 from second )", async function () {
                    const ProjectAvailableEth = new BN( await ReversibleICOInstance.methods.getAvailableProjectETH().call() );
                    expect(
                        ProjectAvailableEth.toString()
                    ).to.equal(
                        new BN("175").mul( helpers.solidity.etherBN ).toString()
                    );
                });

            });

        });

    });


});

async function displayTokensForParticipantAtStage(start, blocks, contract, deployingAddress, participant, stage, end = false, after = false) {
    let currentBlock = await helpers.utils.jumpToContractStage ( contract, deployingAddress, stage, end, after );

    let ParticipantsByAddress = await contract.methods.ParticipantsByAddress(participant).call();
    let totalTokens = ParticipantsByAddress.token_amount;

    let diffBlock = (currentBlock - start);

    let tx1 = await contract.methods.currentReservedTokenAmount(participant).send({from: deployingAddress });
    let amount1 = await contract.methods.currentReservedTokenAmount(participant).call();

    console.log("stage ["+stage+"] ( "+ diffBlock + " )");

    console.log("participant: ", participant);
    console.log("gas V:   ", tx1.gasUsed);
    console.log("amount:  ", helpers.utils.toFullToken(helpers, new BN(amount1) ));
    console.log("tokensV3:", helpers.utils.toFullToken(
        helpers, helpers.utils.calculatereservedTokensAtBlockForBoughtAmount(helpers, diffBlock, blocks, totalTokens)
        )
    );

    const ratioA = await contract.methods.getCurrentGlobalUnlockRatio(20).call();
    const ratioC = helpers.utils.getCurrentGlobalUnlockRatio(helpers, diffBlock, blocks, 20);
    console.log("ratioA:   ", helpers.utils.toFullToken(helpers, ratioA));
    console.log("ratioC:   ", helpers.utils.toFullToken(helpers, ratioC));
}


async function displayContractStats(contract, TokenContractInstance) {

    let maxEth = await contract.methods.availableEthAtStage().call();
    let totalSentETH = await contract.methods.totalSentETH().call();
    let returnedETH = await contract.methods.returnedETH().call();
    let committedETH = await contract.methods.committedETH().call();
    let contributorsETH = await contract.methods.contributorsETH().call();
    let projectETH = await contract.methods.projectETH().call();
    let projectWithdrawnETH = await contract.methods.projectWithdrawnETH().call();
    let ricoTokenBalance = await TokenContractInstance.methods.balanceOf(contract.receipt.contractAddress).call();

    console.log("ricoTokenBalance:   ", helpers.utils.toEth(helpers, ricoTokenBalance) + " tokens");
    console.log("maxEth:             ", helpers.utils.toEth(helpers, maxEth) + " eth");
    console.log("totalSentETH:        ", helpers.utils.toEth(helpers,totalSentETH) + " eth");
    console.log("returnedETH:        ", helpers.utils.toEth(helpers,returnedETH) + " eth");
    console.log("committedETH:        ", helpers.utils.toEth(helpers,committedETH) + " eth");
    console.log("contributorsETH:    ", helpers.utils.toEth(helpers,contributorsETH) + " eth");
    console.log("projectETH:         ", helpers.utils.toEth(helpers,projectETH) + " eth");
    console.log("projectWithdrawnETH:", helpers.utils.toEth(helpers,projectWithdrawnETH) + " eth");
    console.log("\n");
}