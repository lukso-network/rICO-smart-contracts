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

        // record actions so we can reply the full scenario
        const action_log = [];

        // randomise actions of actors and call `test()` on each actor after each action
        
        let lastAction;

        try {
            for(let i = 0; i < rICOBlockLength + 1; i++) {

                // block relative to rICO start.
                let block = commitPhaseStartBlock + i;
                action_log.push({ "type": "block", "block": block } );
                await setBlock(block, rICO, deployment, helpers);
                
                // Loop participants and execute a random action.
                for( let j = 0; j < participants.length; j++) {
                    participants[j].setBlock(block);
                    lastAction = function(){
                        action_log.push({ "type": "participant", "id": j, "address": participants[j].address, "action": participants[j].getLastAction()} );
                    }
                    await participants[j].executeRandomActionOrNone(lastAction);
                }
                lastAction = function(){
                    action_log.push({ "type": "project", "action": Project.getLastAction()} );    
                }
                await Project.executeRandomActionOrNone(lastAction);
            }
        } catch(e) {

            // lastAction();
            console.log("Error:", e);
            console.log(`
    // ----------------------------------------------------------------------------------------
    // replay code start
    //
    let block;
`);

            for(let i  = 0; i < action_log.length; i++) {
                const currentLog = action_log[i];

                // console.log("action_log.type", currentLog.type);
                if(currentLog.type === "block") {
                    console.log(`    block = `+currentLog.block+`; 
    await setBlock(block, rICO, deployment, helpers);
`);

                } else if(currentLog.type === "participant") {
                    // participants[j].setBlock(block);
                    console.log(`    participants[` + currentLog.id + `].setBlock(block);
    await participants[` + currentLog.id + `].executeAction('` + currentLog.action + `');
                    `);

                } else if(currentLog.type === "project") {
                    console.log(`    await Project.executeAction('`+currentLog.action+`');
`);

                }
                
            }
        
            console.log(`    /*
    ` + e + `
    */
            `);

            console.log(`
    // replay code end    
    // ----------------------------------------------------------------------------------------
`);

            process.exit(1);
        }

        // console.log("");
        // console.log("Project Wallet statistics:");

        // Project.displayBalances();
        // await Project.withdrawFullAmount();
        // Project.displayBalances();

        // console.log("");
        // console.log("Run summary:");
        // console.log("Participants:", participants.length);

    }
} 

async function setBlock(block, rICO, deployment, helpers) {
    await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 100000});
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
    _currentBlock = await rICO.methods.getCurrentBlockNumber().call();


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