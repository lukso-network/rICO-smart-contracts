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
            whitelistControllerAddress: init.accounts[3],
            projectWalletAddress: init.accounts[4],

            blocksPerDay:    5,     // 6450;
            commitPhaseDays: 4,     // 22;
            StageDays:       2,     // 30;
        };

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 2 - Initialize Participants \n" +
            "  ----------------------------------------------------------------"
        );

        init.deployment = {
            addresses: {
                ContractsDeployer: null,
                whitelistControllerAddress: null,
                projectWalletAddress: null,
            },
            contracts: {
                rICOToken: null,
                rICO: null,
            },
            whitelister: null,
            project: null,
        };

        const participants = await deployer.createParticipants(init, numberOfParticipants, participantTxBalance);
        
        // console.log(participants);

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

        const Whitelister = new whitelister(init, rICO, rICOSettings.whitelistControllerAddress);
        init.deployment.whitelister = Whitelister;
        console.log("      Whitelister:", Whitelister.address);

        const Project = new project(init, rICO, rICOSettings.projectWalletAddress);
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

                await participants[0].displayAllBalances();
                
                // const byStage = await rICO.methods.getParticipantDetailsByStage(participants[0].address, 0).call();
                // console.log(byStage);

                const unlockedToken = new helpers.BN( await rICOToken.methods.getUnlockedBalance(participants[0].address).call() );
                const lockedToken = new helpers.BN( await rICOToken.methods.getLockedBalance(participants[0].address).call() );
                const balanceOf = new helpers.BN( await rICOToken.methods.balanceOf(participants[0].address).call() );
                
                console.log("unlockedTokens:        ", participants[0].toEth(unlockedToken));
                console.log("lockedTokens:          ", participants[0].toEth(lockedToken));
                console.log("balanceOf:             ", participants[0].toEth(balanceOf));

                const getLockedTokenAmount = new helpers.BN( await rICO.methods.getLockedTokenAmount(participants[0].address, false).call() );
                console.log("getLockedTokenAmount:  ", participants[0].toEth(getLockedTokenAmount));

                const getLockedTokenAmount2 = new helpers.BN( await rICO.methods.getLockedTokenAmount(participants[0].address, true).call() );
                console.log("getLockedTokenAmount2: ", participants[0].toEth(getLockedTokenAmount2));

                const getCurrentUnlockPercentage = new helpers.BN( await rICO.methods.getCurrentUnlockPercentage().call() );
                console.log("getCurrentUnlockPerc:  ", participants[0].toEth(getCurrentUnlockPercentage));
                
            }


            // ----------------------------------------------------------------------------------------
            // replay code start
            //
            let block;

            /*
            block = 15;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitHalfBalance');

            block = 16;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitEntireBalance');

            await Project.executeAction('withdrawHalf');

            block = 19;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('withdrawByETH');

            await Project.executeAction('withdrawHalf');

            block = 20;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitHalfBalance');

            block = 21;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitEntireBalance');

            await Project.executeAction('withdrawHalf');

            block = 22;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('whitelistApprove');


            block = 23;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('whitelistDeny');

            */ 

            block = 20;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitHalfBalance');
            
            block = 24;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('whitelistApprove');

            block = 26;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await displayValues();
            await participants[0].executeAction('sendHalfTokensBack');
            await displayValues();

            /*
            block = 27;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitEntireBalance');


            block = 29;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('sendAllTokensBack');

            
            block = 30;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('commitHalfBalance');
            */

            block = 31;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);
            await participants[0].executeAction('whitelistDeny');

            block = 32;
            await setBlock(block, rICO, deployment, helpers);

            participants[0].setBlock(block);

            console.log("before");
            await displayValues();
            await participants[0].executeAction('commitHalfBalance', async () => {
                console.log("after");
                await displayValues();
            });

            

            // replay code end
            // ----------------------------------------------------------------------------------------

            // for(let block = commitPhaseStartBlock; block <= buyPhaseEndBlock; block++) {
            //     await setBlock(block, rICO, deployment, helpers);
            // }

        } catch(e) {
            console.log(e)
            process.exit(1);
        }
    }
} 

async function setBlock(block, rICO, deployment, helpers) {
    await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 100000});
    const currentStage = await rICO.methods.getCurrentStage().call();
    const currentAvailableEthForPurchase = await rICO.methods.availableEthAtStage(currentStage).call();

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
    projectAllocatedETH = new helpers.BN( await rICO.methods.projectAllocatedETH().call() );
    projectWithdrawnETH = new helpers.BN( await rICO.methods.projectWithdrawnETH().call() );
    buyPhaseStartBlock = await rICO.methods.buyPhaseStartBlock().call();
    buyPhaseEndBlock = await rICO.methods.buyPhaseEndBlock().call();
    _currentBlock = await rICO.methods.getCurrentBlockNumber().call();


    const globalAvailable = committedETH
        .sub(withdrawnETH)
        .sub(projectAllocatedETH);

    const unlocked = globalAvailable.mul(
        helpers.utils.getCurrentUnlockPercentage(
            helpers,
            _currentBlock,
            buyPhaseStartBlock,
            buyPhaseEndBlock,
            20
        )
    ).div(
        new helpers.BN("10").pow( new helpers.BN("20"))
    );

    const result = unlocked.add(projectAllocatedETH).sub(projectWithdrawnETH);
    const getProjectAvailableEth =  await rICO.methods.getProjectAvailableEth().call() 

    console.log(" > getProjectAvailableEth: calc     ", Project.toEth(result) + " eth");
    console.log(" > getProjectAvailableEth: unlocked ", Project.toEth(new helpers.BN( getProjectAvailableEth )) + " eth");

}