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
const blocksPerDay = 6450;

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

let SnapShotKey = "FlowTestInit";
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

        // starts in one day
        commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        commitPhaseBlockCount = blocksPerDay * 22;
        commitPhasePrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        StageCount = 12;
        StageBlockCount = blocksPerDay * 30;
        StagePriceIncrease = helpers.solidity.ether * 0.0001;
        commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount;

        BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );

        await ReversibleICOInstance.methods.init(
            TokenContractAddress,       // address _TokenContractAddress
            whitelistControllerAddress, // address _whitelistControllerAddress
            projectWalletAddress,       // address _projectWalletAddress
            commitPhaseStartBlock,      // uint256 _StartBlock
            commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
            commitPhasePrice,           // uint256 _commitPhasePrice in wei
            StageCount,                 // uint8   _StageCount
            StageBlockCount,            // uint256 _StageBlockCount
            StagePriceIncrease          // uint256 _StagePriceIncrease in wei
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

describe("ProjectWithdraw Testing", function () {

    before(async function () {
        await revertToFreshDeployment();
    });

    describe("ProjectWithdraw()", function () {

        /*
        describe("0 - contract not initialized with settings", async function () {

            let TestReversibleICO;

            before(async function () {
                helpers.utils.resetAccountNonceCache(helpers);

                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                TestReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                // jump to contract start
                currentBlock = await helpers.utils.jumpToContractStage (TestReversibleICO, deployerAddress, 0);
            });

            describe("caller is projectWalletAddress", async function () {

                it("transaction reverts \"Contract must be initialized.\"", async function () {

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    await helpers.assertInvalidOpcode( async function () {
                        await TestReversibleICO.methods.projectWithdraw( 1 ).send({
                            from: projectWalletAddress,
                            gas: 100000
                        });
                    }, "Contract must be initialized.");

                });
            });

            describe("caller is deployerAddress", async function () {

                it("transaction reverts \"Contract must be initialized.\"", async function () {

                    helpers.utils.resetAccountNonceCache(helpers);

                    const initialized = await TestReversibleICO.methods.initialized().call();
                    expect( initialized ).to.be.equal( false );

                    await helpers.assertInvalidOpcode( async function () {
                        await TestReversibleICO.methods.projectWithdraw( 1 ).send({
                            from: deployerAddress,
                            gas: 100000
                        });
                    }, "Contract must be initialized.");

                });
            });
        });

        describe("1 - contract in commit phase", async function () {

            describe("no contributions", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);
                });

                describe("caller is projectWalletAddress", async function () {

                    it("reverts \"Requested amount to large, not enough unlocked ETH available.\"", async function () {

                        await helpers.assertInvalidOpcode( async function () {
                            await ReversibleICOInstance.methods.projectWithdraw( 1 ).send({
                                from: projectWalletAddress,
                                gas: 100000
                            });
                        }, "Requested amount to large, not enough unlocked ETH available.");

                    });
                });

                describe("caller not projectWalletAddress", async function () {

                    it("reverts \"Only project wallet address.\"", async function () {

                        await helpers.assertInvalidOpcode( async function () {
                            await ReversibleICOInstance.methods.projectWithdraw( 1 ).send({
                                from: deployerAddress,
                                gas: 100000
                            });
                        }, "Only project wallet address.");

                    });
                });
            });

            describe("One non whitelisted contribution in contract", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    const newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                });

                describe("caller is projectWalletAddress", async function () {

                    it("reverts \"Requested amount to large, not enough unlocked ETH available.\"", async function () {

                        await helpers.assertInvalidOpcode( async function () {
                            await ReversibleICOInstance.methods.projectWithdraw( 1 ).send({
                                from: projectWalletAddress,
                                gas: 100000
                            });
                        }, "Requested amount to large, not enough unlocked ETH available.");

                    });
                });

            });

            describe("One whitelisted contribution in contract", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );
                    const newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true,
                    ).send({
                        from: whitelistControllerAddress
                    });

                });

                describe("caller is projectWalletAddress", async function () {

                    it("reverts \"Requested amount to large, not enough unlocked ETH available.\"", async function () {

                        await helpers.assertInvalidOpcode( async function () {
                            await ReversibleICOInstance.methods.projectWithdraw( 1 ).send({
                                from: projectWalletAddress,
                                gas: 100000
                            });
                        }, "Requested amount to large, not enough unlocked ETH available.");

                    });
                });
            });
        });
        */

        describe("2 - contract in buy phase ( stage 1 - last block )", async function () {

            describe("One whitelisted contribution in contract", async function () {
                const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);


                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true,
                    ).send({
                        from: whitelistControllerAddress
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 2, true, 0);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_2,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_3,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    helpers.utils.resetAccountNonceCache(helpers);

                    // currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 12, true, 1);
                    // currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, true);
                });

                describe("caller is projectWalletAddress", async function () {

                    it("reverts \"Requested amount to large, not enough unlocked ETH available.\"", async function () {

                        let Available = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH: ", helpers.utils.toEth(helpers, Available.toString() ) +" eth" );

                        // expect( Available ).to.be.bignumber.above( new BN("0") );



                        let AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        let AfterWithdrawcommittedETH = new BN( await ReversibleICOInstance.methods.committedETH().call() );
                        let AfterWithdrawwithdrawnETH = new BN( await ReversibleICOInstance.methods.withdrawnETH().call() );
                        let AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        let AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );

                        console.log("");
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );
                        console.log("committedETH:         ", helpers.utils.toEth(helpers, AfterWithdrawcommittedETH.toString() ) +" eth" );
                        console.log("withdrawnETH ETH:    ", helpers.utils.toEth(helpers, AfterWithdrawwithdrawnETH.toString() ) +" eth" );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );
                        console.log("");
                        // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 2 );

                        const ReturnTokenAmount = new BN(
                            await TokenContractInstance.methods.balanceOf(participant_1).call()
                        );

                        // projectWithdraw
                        const projSum = AvailableAfterWithdraw.div( new BN(2) ).toString();
                        let projectWithdrawTx = await ReversibleICOInstance.methods.projectWithdraw(
                            // AvailableAfterWithdraw.toString()
                            projSum
                            // helpers.solidity.etherBN.mul( new BN(83) ).toString()
                        ).send({
                            from: projectWalletAddress
                        });

                        console.log("after projectWithdrawTx", helpers.utils.toEth(helpers, projSum) +" eth", "\n");

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        AfterWithdrawcommittedETH = new BN( await ReversibleICOInstance.methods.committedETH().call() );
                        AfterWithdrawwithdrawnETH = new BN( await ReversibleICOInstance.methods.withdrawnETH().call() );
                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        AfterWithdrawETHWithdrawn = new BN( await ReversibleICOInstance.methods.returnedETH().call() );
                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );

                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );
                        console.log("committedETH:         ", helpers.utils.toEth(helpers, AfterWithdrawcommittedETH.toString() ) +" eth" );
                        console.log("withdrawnETH ETH:    ", helpers.utils.toEth(helpers, AfterWithdrawwithdrawnETH.toString() ) +" eth" );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );
                        console.log("returnedETH:         ", helpers.utils.toEth(helpers, AfterWithdrawETHWithdrawn.toString() ) +" eth" );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        let ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        console.log("");


                        // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 4 );

                        // send full token balance back to rico
                        let withdrawTx = await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            // ReturnTokenAmount.div( new BN(5) ).toString(),
                            ReturnTokenAmount.toString(),
                            ERC777data
                        ).send({
                            from: participant_1,
                            gas: 1000000,
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                        console.log("after withdrawTx" );

                        // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 4 );

                        AfterWithdrawcommittedETH = new BN( await ReversibleICOInstance.methods.committedETH().call() );
                        console.log("committedETH:         ", helpers.utils.toEth(helpers, AfterWithdrawcommittedETH.toString() ) +" eth" );

                        AfterWithdrawwithdrawnETH = new BN( await ReversibleICOInstance.methods.withdrawnETH().call() );
                        console.log("withdrawnETH ETH:    ", helpers.utils.toEth(helpers, AfterWithdrawwithdrawnETH.toString() ) +" eth" );

                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );

                        AfterWithdrawETHWithdrawn = new BN( await ReversibleICOInstance.methods.returnedETH().call() );
                        console.log("returnedETH:         ", helpers.utils.toEth(helpers, AfterWithdrawETHWithdrawn.toString() ) +" eth" );

                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );


                        // expect( Available ).to.be.bignumber.equal( AvailableAfterWithdraw );
                        // expect( Available ).to.be.bignumber.equal( ContractBalance );

                        // let BalanceValidation = ContractBalance.add(withdrawnETH);
                        // console.log("BalanceValidation:  ", helpers.utils.toEth(helpers, BalanceValidation.toString() ) +" eth" );

                        // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, participant_1, 2 );


                        console.log("");

                        console.log("whitelistTx:" );

                        whitelistTx = await ReversibleICOInstance.methods.whitelist(
                            [participant_2],
                            true,
                        ).send({
                            from: whitelistControllerAddress
                        });

                        ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );

                        console.log("");
                        console.log("before projectWithdrawTx", helpers.utils.toEth(helpers, AvailableAfterWithdraw) +" eth", "\n");

                        projectWithdrawTx = await ReversibleICOInstance.methods.projectWithdraw(
                            AvailableAfterWithdraw.toString()
                        ).send({
                            from: projectWalletAddress
                        });
                        console.log("after projectWithdrawTx" );


                        ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );


                        const ReturnTokenAmount2 = new BN(
                            await TokenContractInstance.methods.balanceOf(participant_2).call()
                        );

                        withdrawTx = await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            ReturnTokenAmount2.toString(),
                            ERC777data
                        ).send({
                            from: participant_2,
                            gas: 1000000,
                            gasPrice: helpers.networkConfig.gasPrice
                        });

                        console.log("");
                        console.log("after withdrawTx" );

                        ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );


                        console.log("");
                        console.log("whitelistTx participant_3:" );

                        whitelistTx = await ReversibleICOInstance.methods.whitelist(
                            [participant_3],
                            false,
                        ).send({
                            from: whitelistControllerAddress
                        });
                        ContractBalance = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                        console.log("ContractBalance:     ", helpers.utils.toEth(helpers, ContractBalance.toString() ) +" eth" );

                        AfterWithdrawAllocatedETH = new BN( await ReversibleICOInstance.methods.projectAllocatedETH().call() );
                        console.log("projectAllocatedETH: ", helpers.utils.toEth(helpers, AfterWithdrawAllocatedETH.toString() ) +" eth" );

                        AfterWithdrawProjectETHWithdrawn = new BN( await ReversibleICOInstance.methods.projectWithdrawnETH().call() );
                        console.log("projectWithdrawnETH: ", helpers.utils.toEth(helpers, AfterWithdrawProjectETHWithdrawn.toString() ) +" eth" );

                        AvailableAfterWithdraw = new BN( await ReversibleICOInstance.methods.getProjectAvailableEth().call() );
                        console.log("Available ETH:       ", helpers.utils.toEth(helpers, AvailableAfterWithdraw.toString() ) +" eth" );

                    });
                });
            });


            describe("getProjectAvailableEth", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true,
                    ).send({
                        from: whitelistControllerAddress
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 6, true, 0);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                });

                it("getProjectAvailableEth()", async function () {
                    // getProjectAvailableEth

                    const CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });

            });

            /*
            describe("participant is whitelisted and has 3 contributions ( 1 in stage 0 / 1 in stage 1 / 1 in stage 6 )", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true,
                    ).send({
                        from: whitelistControllerAddress
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 6, true, 0);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                });

                it("getCancelModes() returns (false, true)", async function () {
                    const CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(true);
                });


                it("participant can withdraw a small amount of eth by sending tokens back to contract", async function () {

                    const TestParticipantAddress = participant_1;

                    // return 1 eth worth of tokens in current stage
                    const ethAmount = new helpers.BN("1").mul( helpers.solidity.etherBN );
                    const ReturnTokenAmount = new BN(
                        await helpers.utils.getTokenAmountForEthAtStage(
                            helpers,
                            ReversibleICOInstance,
                            ethAmount,
                            6
                        )
                    );

                    const ParticipantUnlockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    // since we're in a later stage, unlocked need to be above 0
                    expect( ParticipantUnlockedTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );


                    const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );

                    const ParticipantTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    // Must have a token balance
                    expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    const ParticipantLockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // locked + unlocked = balance
                    expect(
                        ParticipantLockedTokenBalanceBefore.add(
                            ParticipantUnlockedTokenBalanceBefore
                        )
                    ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                    // calculate how much eth we should be receiving for the tokens we're sending
                    const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                        helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                    );

                    // send full token balance back to rico
                    let withdrawTx = await TokenContractInstance.methods.send(
                        ReversibleICOInstance.receipt.contractAddress,
                        ReturnTokenAmount.toString(),
                        ERC777data
                    ).send({
                        from: TestParticipantAddress,
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    const ParticipantLockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantUnlockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                    );


                    // Validation

                    // ETH: validate participant eth balances
                    let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                        // subtract transaction cost
                        .sub(txGasCost)
                        // add withdrawn eth amount
                        .add(withdrawCalculatedBefore.eth);
                    expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                    // ETH: validate contract eth balances
                    let ContractBalanceAfterValidation = ContractBalanceBefore
                        // subtract withdrawn eth amount
                        .sub(withdrawCalculatedBefore.eth);
                    expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                    // Tokens: validate participant token balances
                    let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                        // subtract tokens that were accepted for return
                        .sub( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                    // Tokens: validate contract token balances
                    let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                        // add tokens that were accepted for return
                        .add( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                    // Tokens: locked validation
                    let ParticipantLockedTokenBalanceAfterValidation = ParticipantLockedTokenBalanceBefore
                        .sub(withdrawCalculatedBefore.withdrawn_tokens)
                    expect( ParticipantLockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantLockedTokenBalanceAfterValidation );

                    // Tokens: unlocked validation - the same
                    expect( ParticipantUnlockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantUnlockedTokenBalanceBefore );

                    // accounting for price rounding errors
                    if( withdrawCalculatedBefore.eth.lt(ethAmount) ) {
                        expect(withdrawCalculatedBefore.eth).to.be.bignumber.equal(ethAmount.sub( new helpers.BN("1") ));
                    } else {
                        expect(withdrawCalculatedBefore.eth).to.be.bignumber.equal(ethAmount).or(ethAmount);
                    }
                });


                it("participant can withdraw by sending tokens back to contract", async function () {

                    const TestParticipantAddress = participant_1;
                    const ShouldHaveLockedAmount = new BN("0");
                    const ReturnTokenAmount = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    const ParticipantUnlockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    // since we're in a later stage, unlocked need to be above 0
                    expect( ParticipantUnlockedTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );


                    const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );

                    const ParticipantTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    // Must have a token balance
                    expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    const ParticipantLockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // locked + unlocked = balance
                    expect(
                        ParticipantLockedTokenBalanceBefore.add(
                            ParticipantUnlockedTokenBalanceBefore
                        )
                    ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                    // calculate how much eth we should be receiving for the tokens we're sending
                    const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                        helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                    );

                    // send full token balance back to rico
                    let withdrawTx = await TokenContractInstance.methods.send(
                        ReversibleICOInstance.receipt.contractAddress,
                        ReturnTokenAmount.toString(),
                        ERC777data
                    ).send({
                        from: TestParticipantAddress,
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    const ParticipantLockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantUnlockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                    );

                    // Validation
                    // ETH: validate participant eth balances
                    let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                        // subtract transaction cost
                        .sub(txGasCost)
                        // add withdrawn eth amount
                        .add(withdrawCalculatedBefore.eth);
                    expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                    // ETH: validate contract eth balances
                    let ContractBalanceAfterValidation = ContractBalanceBefore
                        // subtract withdrawn eth amount
                        .sub(withdrawCalculatedBefore.eth);
                    expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                    // Tokens: validate participant token balances
                    let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                        // subtract tokens that were accepted for return
                        .sub( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                    // Tokens: validate contract token balances
                    let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                        // add tokens that were accepted for return
                        .add( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                    // Tokens: locked validation
                    let ParticipantLockedTokenBalanceAfterValidation = ParticipantLockedTokenBalanceBefore
                        .sub(withdrawCalculatedBefore.withdrawn_tokens)
                    expect( ParticipantLockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantLockedTokenBalanceAfterValidation );

                    // Tokens: unlocked validation - the same
                    expect( ParticipantUnlockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantUnlockedTokenBalanceBefore );

                    expect( ShouldHaveLockedAmount ).to.be.bignumber.equal( ParticipantLockedTokenBalanceAfter );

                    // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 7 );
                });


                it("participant can contribute again", async function () {

                    const TestParticipantAddress = participant_1;
                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(participant_1).call();
                    const initialContributionsCount = ParticipantByAddress.contributionsCount;

                    const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    let currentStage = await ReversibleICOInstance.methods.getCurrentStage().call();
                    const expectedTokenAmount = await helpers.utils.getTokenAmountForEthAtStage(
                        helpers, ReversibleICOInstance, ContributionAmount, parseInt(currentStage)
                    );

                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: TestParticipantAddress,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    ParticipantByAddress = await ReversibleICOInstance.methods.ParticipantsByAddress(TestParticipantAddress).call();
                    const afterContributionsCount = ParticipantByAddress.contributionsCount;

                    expect(
                        afterContributionsCount.toString()
                    ).to.be.equal(
                        (parseInt(initialContributionsCount) + 1).toString()
                    );

                    const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    let txGasCost = new helpers.BN(newContributionTx.gasUsed).mul(
                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                    );

                    // Validation
                    // ETH: validate participant eth balances
                    let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                        // subtract transaction cost
                        .sub(txGasCost)
                        // subtract contribution eth amount
                        .sub(ContributionAmount);
                    expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                    // ETH: validate contract eth balances
                    let ContractBalanceAfterValidation = ContractBalanceBefore
                        // add contribution eth amount
                        .add(ContributionAmount);
                    expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                    // Tokens: validate participant token balances
                    let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                        // add tokens that we expect to receive
                        .add( expectedTokenAmount );
                    expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                    // Tokens: validate contract token balances
                    let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                        // add tokens that were allocated
                        .sub( expectedTokenAmount );
                    expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );


                });


                it("participant can withdraw again", async function () {

                    const TestParticipantAddress = participant_1;
                    const ShouldHaveLockedAmount = new BN("0");
                    const ReturnTokenAmount = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    const ParticipantUnlockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    // since we're in a later stage, unlocked need to be above 0
                    expect( ParticipantUnlockedTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );


                    const ContractBalanceBefore = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceBefore = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );

                    const ParticipantTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    // Must have a token balance
                    expect( ParticipantTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    const ParticipantLockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // locked + unlocked = balance
                    expect(
                        ParticipantLockedTokenBalanceBefore.add(
                            ParticipantUnlockedTokenBalanceBefore
                        )
                    ).to.be.bignumber.equal( ParticipantTokenBalanceBefore );

                    // calculate how much eth we should be receiving for the tokens we're sending
                    const withdrawCalculatedBefore = await helpers.utils.getAvailableEthAndTokensForWithdraw(
                        helpers, ReversibleICOInstance, TestParticipantAddress, ReturnTokenAmount
                    );

                    // send full token balance back to rico
                    let withdrawTx = await TokenContractInstance.methods.send(
                        ReversibleICOInstance.receipt.contractAddress,
                        ReturnTokenAmount.toString(),
                        ERC777data
                    ).send({
                        from: TestParticipantAddress,
                        gas: 1000000,
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    const ContractBalanceAfter = await helpers.utils.getBalance(helpers, ReversibleICOAddress);
                    const ParticipantBalanceAfter = await helpers.utils.getBalance(helpers, TestParticipantAddress);

                    const ContractTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
                    );
                    const ParticipantTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );
                    const ParticipantLockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantUnlockedTokenBalanceAfter = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );

                    let txGasCost = new helpers.BN(withdrawTx.gasUsed).mul(
                        new helpers.BN( helpers.networkConfig.gasPrice.toString() )
                    );

                    // Validation
                    // ETH: validate participant eth balances
                    let ParticipantBalanceAfterValidation = ParticipantBalanceBefore
                        // subtract transaction cost
                        .sub(txGasCost)
                        // add withdrawn eth amount
                        .add(withdrawCalculatedBefore.eth);
                    expect( ParticipantBalanceAfter ).to.be.bignumber.equal( ParticipantBalanceAfterValidation );

                    // ETH: validate contract eth balances
                    let ContractBalanceAfterValidation = ContractBalanceBefore
                        // subtract withdrawn eth amount
                        .sub(withdrawCalculatedBefore.eth);
                    expect( ContractBalanceAfter ).to.be.bignumber.equal( ContractBalanceAfterValidation );

                    // Tokens: validate participant token balances
                    let ParticipantTokenBalanceAfterValidation = ParticipantTokenBalanceBefore
                        // subtract tokens that were accepted for return
                        .sub( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ParticipantTokenBalanceAfter ).to.be.bignumber.equal( ParticipantTokenBalanceAfterValidation );

                    // Tokens: validate contract token balances
                    let ContractTokenBalanceAfterValidation = ContractTokenBalanceBefore
                        // add tokens that were accepted for return
                        .add( withdrawCalculatedBefore.withdrawn_tokens );
                    expect( ContractTokenBalanceAfter ).to.be.bignumber.equal( ContractTokenBalanceAfterValidation );

                    // Tokens: locked validation
                    let ParticipantLockedTokenBalanceAfterValidation = ParticipantLockedTokenBalanceBefore
                        .sub(withdrawCalculatedBefore.withdrawn_tokens)
                    expect( ParticipantLockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantLockedTokenBalanceAfterValidation );

                    // Tokens: unlocked validation - the same
                    expect( ParticipantUnlockedTokenBalanceAfter ).to.be.bignumber.equal( ParticipantUnlockedTokenBalanceBefore );

                    expect( ShouldHaveLockedAmount ).to.be.bignumber.equal( ParticipantLockedTokenBalanceAfter );

                    // await helpers.utils.displayContributions(helpers, ReversibleICOInstance, TestParticipantAddress, 7 );
                });

                it("sending unlocked tokens to Rico reverts \"Withdraw not possible. Participant has no locked tokens.\"", async function () {

                    const TestParticipantAddress = participant_1;
                    const ReturnTokenAmount = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    const ParticipantUnlockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantLockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // since we're in a later stage, unlocked need to be above 0
                    expect( ParticipantUnlockedTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    // since we already sent back all our tokens.. we should have 0 locked remaining
                    expect( ParticipantLockedTokenBalanceBefore ).to.be.bignumber.equal( new BN("0") );

                    await helpers.assertInvalidOpcode( async () => {
                        // attempt to send full token balance back to rico
                        let withdrawTx = await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            ReturnTokenAmount.toString(),
                            ERC777data
                        ).send({
                            from: TestParticipantAddress,
                            gas: 1000000,
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                    }, "Withdraw not possible. Participant has no locked tokens.");

                });
            });
            */
        });

        /*
        describe("3 - contract after buy phase", async function () {

            describe("participant is whitelisted and has 3 contributions ( 1 in stage 0 / 1 in stage 1 / 1 in stage 6 )", async function () {

                before(async () => {
                    await revertToFreshDeployment();
                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 0);

                    const ContributionAmount = new helpers.BN("1000").mul( helpers.solidity.etherBN );

                    let newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    // whitelist and accept contribution
                    let whitelistTx = await ReversibleICOInstance.methods.whitelist(
                        [participant_1],
                        true,
                    ).send({
                        from: whitelistControllerAddress
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 1, false, 1);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 6, true, 0);

                    newContributionTx = await helpers.web3Instance.eth.sendTransaction({
                        from: participant_1,
                        to: ReversibleICOInstance.receipt.contractAddress,
                        value: ContributionAmount.toString(),
                        gasPrice: helpers.networkConfig.gasPrice
                    });

                    helpers.utils.resetAccountNonceCache(helpers);

                    currentBlock = await helpers.utils.jumpToContractStage (ReversibleICOInstance, deployerAddress, 12, true, 1);
                });

                it("getCancelModes() returns (false, false)", async function () {
                    const CancelStates = await ReversibleICOInstance.methods.getCancelModes(participant_1).call();
                    expect(CancelStates[0]).to.be.equal(false);
                    expect(CancelStates[1]).to.be.equal(false);
                });

                it("sending unlocked tokens to Rico reverts \"Withdraw not possible. Participant has no locked tokens.\"", async function () {

                    const TestParticipantAddress = participant_1;
                    const ReturnTokenAmount = new BN(
                        await TokenContractInstance.methods.balanceOf(TestParticipantAddress).call()
                    );

                    const ParticipantUnlockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getUnlockedBalance(TestParticipantAddress).call()
                    );
                    const ParticipantLockedTokenBalanceBefore = new BN(
                        await TokenContractInstance.methods.getLockedBalance(TestParticipantAddress).call()
                    );

                    // since we're in a later stage, unlocked need to be above 0
                    expect( ParticipantUnlockedTokenBalanceBefore ).to.be.bignumber.above( new BN("0") );

                    // since we already sent back all our tokens.. we should have 0 locked remaining
                    expect( ParticipantLockedTokenBalanceBefore ).to.be.bignumber.equal( new BN("0") );

                    await helpers.assertInvalidOpcode( async () => {
                        // attempt to send full token balance back to rico
                        let withdrawTx = await TokenContractInstance.methods.send(
                            ReversibleICOInstance.receipt.contractAddress,
                            ReturnTokenAmount.toString(),
                            ERC777data
                        ).send({
                            from: TestParticipantAddress,
                            gas: 1000000,
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                    }, "Withdraw not possible. Participant has no locked tokens.");

                });
            });
        });
        */
    });


});

async function displayTokensForParticipantAtStage(start, blocks, contract, deployerAddress, participant, stage, end = false, after = false) {
    let currentBlock = await helpers.utils.jumpToContractStage ( contract, deployerAddress, stage, end, after );

    let ParticipantTotalStats = await contract.methods.participantAggregatedStats(participant).call();
    let totalTokens = ParticipantTotalStats.token_amount;

    let diffBlock = (currentBlock - start);

    let tx1 = await contract.methods.getLockedTokenAmount(participant).send({from: deployerAddress });
    let amount1 = await contract.methods.getLockedTokenAmount(participant).call();

    console.log("stage ["+stage+"] ( "+ diffBlock + " )");

    console.log("participant: ", participant);
    console.log("gas V:   ", tx1.gasUsed);
    console.log("amount:  ", helpers.utils.toFullToken(helpers, new helpers.BN(amount1) ));
    console.log("tokensV3:", helpers.utils.toFullToken(
            helpers, helpers.utils.calculateLockedTokensAtBlockForBoughtAmount(helpers, diffBlock, blocks, totalTokens)
        )
    );

    const ratioA = await contract.methods.getCurrentUnlockPercentage(20).call();
    const ratioC = helpers.utils.getCurrentUnlockPercentage(helpers, diffBlock, blocks, 20);
    console.log("ratioA:   ", helpers.utils.toFullToken(helpers, ratioA));
    console.log("ratioC:   ", helpers.utils.toFullToken(helpers, ratioC));
}


async function displayContractStats(contract, TokenContractInstance) {

    let maxEth = await contract.methods.availableEthAtStage().call();
    let totalReceivedETH = await contract.methods.totalReceivedETH().call();
    let returnedETH = await contract.methods.returnedETH().call();
    let committedETH = await contract.methods.committedETH().call();
    let contributorsETH = await contract.methods.contributorsETH().call();
    let projectETH = await contract.methods.projectETH().call();
    let projectWithdrawnETH = await contract.methods.projectWithdrawnETH().call();
    let ricoTokenBalance = await TokenContractInstance.methods.balanceOf(contract.receipt.contractAddress).call();

    console.log("ricoTokenBalance:   ", helpers.utils.toEth(helpers, ricoTokenBalance) + " tokens");
    console.log("maxEth:             ", helpers.utils.toEth(helpers, maxEth) + " eth");
    console.log("totalReceivedETH:        ", helpers.utils.toEth(helpers,totalReceivedETH) + " eth");
    console.log("returnedETH:        ", helpers.utils.toEth(helpers,returnedETH) + " eth");
    console.log("committedETH:        ", helpers.utils.toEth(helpers,committedETH) + " eth");
    console.log("contributorsETH:    ", helpers.utils.toEth(helpers,contributorsETH) + " eth");
    console.log("projectETH:         ", helpers.utils.toEth(helpers,projectETH) + " eth");
    console.log("projectWithdrawnETH:", helpers.utils.toEth(helpers,projectWithdrawnETH) + " eth");
    console.log("\n");
}
