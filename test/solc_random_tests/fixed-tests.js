/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const deployer = require("./deployer.js");
const whitelister = require("./whitelister.js");
const project = require("./project.js");

module.exports = {
    async run (init) {
        
        const helpers = init.helpers;
        const numberOfParticipants = 4;
        // allocate 1 extra eth to each participant
        const participantTxBalance = init.helpers.solidity.etherBN; 
        const rICOSettings = { 

            ContractsDeployer: init.accounts[2],
            whitelistingAddress: init.accounts[3],
            projectAddress: init.accounts[4],

            blocksPerDay:    5,     // 6450;
            commitPhaseDays: 1,     // 22;
            StageDays:       2,     // 30;
            StageCount:     10,     // 12;
            commitPhasePrice:   helpers.solidity.ether * 0.002,
            StagePriceIncrease: helpers.solidity.ether * 0.0001,
        };

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 2 - Initialize Participants \n" +
            "  ----------------------------------------------------------------"
        );

        init.deployment = {
            addresses: {
                ContractsDeployer: null,
                whitelistingAddress: null,
                projectAddress: null,
            },
            contracts: {
                rICOToken: null,
                rICO: null,
            },
            whitelister: null,
            project: null,
        };

        const participants = await deployer.createParticipants(init, numberOfParticipants, participantTxBalance);

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 3 - Run Deployment \n" +
            "  ----------------------------------------------------------------"
        );
        const deployment = await deployer.run(init, rICOSettings);
        init.deployment = deployment;

        // contract instances
        const rICOToken = deployment.contracts.rICOToken;
        const rICO = deployment.contracts.rICO;

        // contract addresses
        const addresses = deployment.addresses;

        const commitPhaseStartBlock = parseInt(await rICO.methods.commitPhaseStartBlock().call(), 10);
        const commitPhaseEndBlock = parseInt(await rICO.methods.commitPhaseEndBlock().call(), 10);
        const buyPhaseStartBlock = parseInt(await rICO.methods.buyPhaseStartBlock().call(), 10);
        const buyPhaseEndBlock = parseInt(await rICO.methods.buyPhaseEndBlock().call(), 10);
        const rICOBlockLength = buyPhaseEndBlock - commitPhaseStartBlock;

        console.log("    rICO Settings");
        console.log("      commitPhaseStartBlock:", commitPhaseStartBlock);
        console.log("      commitPhaseEndBlock:  ", commitPhaseEndBlock);
        console.log("      buyPhaseStartBlock:   ", buyPhaseStartBlock);
        console.log("      buyPhaseDuration:     ", (buyPhaseEndBlock - buyPhaseStartBlock + 1));
        console.log("      buyPhaseEndBlock:     ", buyPhaseEndBlock);
        console.log("");
        console.log("      rICO block length:", rICOBlockLength);

        const Whitelister = new whitelister(init, rICO, rICOSettings.whitelistingAddress);
        init.deployment.whitelister = Whitelister;
        console.log("      Whitelister:", Whitelister.address);

        const Project = new project(init, rICO, rICOSettings.projectAddress);
        init.deployment.project = Project;
        console.log("      ProjectWallet:", Project.address);
        

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 4 - Run Tests \n" +
            "  ----------------------------------------------------------------"
        );

        // jump to allocation block 
        await helpers.utils.jumpToContractStage ( rICO, deployment.addresses.ContractsDeployer, 0 );

        try {

            const displayValues = async () => {

                await participants[0].displayBalances();
                
                // const stages = await rICO.methods.getParticipantDetailsByStage(participants[0].address, 0).call();
                // console.log(stages);

                const boughtToken = new helpers.BN( await rICOToken.methods.getUnlockedBalance(participants[0].address).call() );
                const reservedToken = new helpers.BN( await rICOToken.methods.getLockedBalance(participants[0].address).call() );
                const balanceOf = new helpers.BN( await rICOToken.methods.balanceOf(participants[0].address).call() );
                
                console.log("boughtTokens:        ", participants[0].toEth(boughtToken));
                console.log("reservedTokens:          ", participants[0].toEth(reservedToken));
                console.log("balanceOf:             ", participants[0].toEth(balanceOf));

                const getParticipantReservedTokens = new helpers.BN( await rICO.methods.getParticipantReservedTokens(participants[0].address).call() );
                console.log("getParticipantReservedTokens:  ", participants[0].toEth(getParticipantReservedTokens));

                const getParticipantReservedTokens2 = new helpers.BN( await rICO.methods.getParticipantReservedTokens(participants[0].address).call() );
                console.log("getParticipantReservedTokens2: ", participants[0].toEth(getParticipantReservedTokens2));

                const getCurrentGlobalUnlockRatio = new helpers.BN( await rICO.methods.getCurrentGlobalUnlockRatio().call() );
                console.log("getCurrentUnlockPerc:  ", participants[0].toEth(getCurrentGlobalUnlockRatio));
                
            }


            // ----------------------------------------------------------------------------------------
            // replay code start
            //
            let block;

            block = 15;
            await setBlock(block, rICO, deployment, helpers);
            participants[1].setBlock(block);
            await participants[1].executeAction('commitEntireBalance');

            // participants[2].setBlock(block);
            // await participants[2].executeAction('commitEntireBalance');

            block = 16;
            await setBlock(block, rICO, deployment, helpers);
            participants[1].setBlock(block);
            await participants[1].executeAction('whitelistApprove');
            // participants[2].setBlock(block);
            // await participants[2].executeAction('whitelistApprove');

            block = 19;
            await setBlock(block, rICO, deployment, helpers);
            participants[1].setBlock(block);
            await participants[1].displayBalances();

            await participants[1].executeAction('sendAllTokensBack');
            await participants[1].displayBalances();
            await Project.displayBalances();
            await displayRicoBalances(helpers, rICO, rICOToken);


            // block = 69;
            // await setBlock(block, rICO, deployment, helpers);
            // participants[2].setBlock(block);
            // await participants[2].displayBalances();
            // await participants[2].executeAction('sendAllTokensBack');
            // await participants[2].displayBalances();
            // await Project.displayBalances();
            // await displayRicoBalances(helpers, rICO, rICOToken);


        } catch(e) {
            console.log(e)
            process.exit(1);
        }
    }
} 

async function displayRicoBalances(helpers, rICO, rICOToken) {
    
    const realContractBalance = await helpers.utils.getBalance(helpers, helpers.addresses.Rico);
    const realtokenSupply               = new helpers.BN(await rICOToken.methods.balanceOf(helpers.addresses.Rico).call());

    const tokenSupply                   = new helpers.BN(await rICO.methods.tokenSupply().call());
    const committedETH                  = new helpers.BN(await rICO.methods.committedETH().call());
    const pendingETH                    = new helpers.BN(await rICO.methods.pendingETH().call());
    const withdrawnETH                  = new helpers.BN(await rICO.methods.withdrawnETH().call());
    const projectWithdrawCount          = new helpers.BN(await rICO.methods.projectWithdrawCount().call());
    const projectWithdrawnETH           = new helpers.BN(await rICO.methods.projectWithdrawnETH().call());
    const getUnlockedProjectETH       = new helpers.BN(await rICO.methods.getUnlockedProjectETH().call());

    console.log("");
    console.log("    RICO Balances:                     ", helpers.addresses.Rico);
    console.log("      Real ETH:                        ", helpers.utils.toEth(helpers, realContractBalance.toString()) + " eth");
    console.log("      committedETH:                    ", helpers.utils.toEth(helpers, committedETH.toString()) + " eth");
    console.log("      pendingETH:                      ", helpers.utils.toEth(helpers, pendingETH.toString()) + " eth");
    console.log("      withdrawnETH:                    ", helpers.utils.toEth(helpers, withdrawnETH.toString()) + " eth");
    console.log("      tokenSupply:                     ", helpers.utils.toEth(helpers, tokenSupply.toString()) + " tokens");
    console.log("      REAL tokenSupply:                ", helpers.utils.toEth(helpers, realtokenSupply.toString()) + " tokens");
    console.log("      Project Withdraw details");
    console.log("      projectWithdrawCount:            ", helpers.utils.toEth(helpers, projectWithdrawCount.toString()));
    console.log("      projectWithdrawnETH:             ", helpers.utils.toEth(helpers, projectWithdrawnETH.toString()) + " eth");
    console.log("      getUnlockedProjectETH:         ", helpers.utils.toEth(helpers, getUnlockedProjectETH.toString()) + " eth");



}

async function setBlock(block, rICO, deployment, helpers) {
    await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 200000});
    const currentStage = await rICO.methods.getCurrentStage().call();
    const currentAvailableEthForPurchase = await rICO.methods.committableEthAtStage(currentStage).call();

    console.log(
        "####   ",
        "block:", block,
        "stage:", currentStage,
        "eth:", helpers.utils.toEth(helpers, currentAvailableEthForPurchase) + " eth",
    );
}

async function display(rICO, helpers, Project) {

    committedETH = new helpers.BN( await rICO.methods.committedETH().call() );
    withdrawnETH = new helpers.BN( await rICO.methods.withdrawnETH().call() );
    _projectUnlockedETH = new helpers.BN( await rICO.methods._projectUnlockedETH().call() );
    projectWithdrawnETH = new helpers.BN( await rICO.methods.projectWithdrawnETH().call() );
    buyPhaseStartBlock = await rICO.methods.buyPhaseStartBlock().call();
    buyPhaseEndBlock = await rICO.methods.buyPhaseEndBlock().call();
    _currentBlock = await rICO.methods.getCurrentEffectiveBlockNumber().call();


    const globalAvailable = committedETH
        .sub(withdrawnETH)
        .sub(_projectUnlockedETH);

    const unlocked = globalAvailable.mul(
        helpers.utils.getCurrentGlobalUnlockRatio(
            helpers,
            _currentBlock,
            buyPhaseStartBlock,
            buyPhaseEndBlock,
            20
        )
    ).div(
        new helpers.BN("10").pow( new helpers.BN("20"))
    );

    const result = unlocked.add(_projectUnlockedETH).sub(projectWithdrawnETH);
    const getAvailableProjectETH =  await rICO.methods.getAvailableProjectETH().call()

    console.log(" > getAvailableProjectETH: calc     ", Project.toEth(result) + " eth");
    console.log(" > getAvailableProjectETH: unlocked ", Project.toEth(new helpers.BN( getAvailableProjectETH )) + " eth");

}