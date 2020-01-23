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
        const numberOfParticipants = 16;
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

        // randomise actions of actors and call `test()` on each actor after each action

        for(let i = 78; i < rICOBlockLength + 1; i++) {
            
            // block relative to rICO start.
            let block = commitPhaseStartBlock + i;
            // middle block
            await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 100000});
            const currentStage = await rICO.methods.getCurrentStage().call();
            const currentAvailableEthForPurchase = await rICO.methods.availableEthAtStage(currentStage).call();

            console.log(
                "   ",
                "block:", block,
                "stage:", currentStage,
                "eth:", helpers.utils.toEth(helpers, currentAvailableEthForPurchase) + " eth",
            );
            
            
            if(block == buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 2) ) {
            // if(block == buyPhaseStartBlock ) {
            // if(block == buyPhaseEndBlock ) {
                
                const participant = participants[0];
                participant.setBlock(block);
                let actions = await participant.getAvailableActions(block);
                console.log("# p1 getAvailableActions", actions);

                // await participant.executeRandomAction(actions);

                console.log("# p1 whitelist true");
                await participant.setWhitelist(true);
                await participant.test();

                console.log("# p1 commitEntireBalance");
                await participant.commitEntireBalance();
                await participant.test();
                // participant.displayBalances();

                actions = await participant.getAvailableActions(block);
                console.log("# p1 getAvailableActions", actions);

                /*
                console.log("sendHalfTokensBack");
                await participant.sendHalfTokensBack();
                await participant.test();

                console.log("sendAllTokensBack");
                await participant.sendAllTokensBack();
                await participant.test();
                */
                console.log("# p1 actionLog", participant.actionLog);

                await display(rICO, helpers, Project);

                // await Project.readBalances();
                // Project.displayBalances();
                console.log("");

                console.log("project withdrawFullAmount");
                await Project.withdrawFullAmount(async function() { await display(rICO, helpers, Project) }  );
                console.log("test");
                await Project.test();
                Project.displayBalances();

                console.log("Project should have withdrawn 50 eth and have globalAvailable 0");

                // globalAvailable

                console.log("########################################################################");


                let bat75 = buyPhaseStartBlock + Math.floor((buyPhaseEndBlock - buyPhaseStartBlock) / 4) * 3 + 2;
                console.log("jump to block number", bat75);
                block = bat75;
                await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 100000});
                
                /*
                console.log("project withdrawFullAmount");
                await Project.withdrawFullAmount(async function() { await display(rICO, helpers, Project) }  );
                console.log("test");
                await Project.test();
                Project.displayBalances();

                return;
                */
                console.log("project withdrawHalf");
                await Project.withdrawHalf( async function() { await display(rICO, helpers, Project) }  );
                console.log("test");
                await Project.test();
                Project.displayBalances();

                // await Project.readBalances();
                console.log("project withdrawFullAmount");
                await Project.withdrawFullAmount(async function() { await display(rICO, helpers, Project) }  );
                console.log("test");
                await Project.test();
                Project.displayBalances();

                
                const p2 = participants[1];
                p2.setBlock(block);
                console.log("########################################################################");
                console.log("p2 commitEntireBalance");
                await p2.commitEntireBalance();
                await p2.test();
                console.log("p2  whitelist true");

                await display(rICO, helpers, Project);
                await p2.setWhitelist(true);
                await display(rICO, helpers, Project);
                p2.displayBalances();
                p2.displayExpectedBalances();

                await p2.test();
                p2.displayBalances();

                console.log("");
                console.log("Project p2 readBalances");
                await Project.readBalances();
                Project.displayBalances();


                console.log( "getTest: ", await rICO.methods.getTests().call() );

                console.log("Project withdrawHalf");
                await Project.withdrawHalf( async function() { await display(rICO, helpers, Project) }  );
                console.log("Project test");
                await Project.test();
                Project.displayBalances();

                return;

                break;
            }






            // const stageData = await contract.methods.stages(stageId).call();
            
            /*
            let stage = 0; // get current stage
            
            // loop for ACTORS
            let random = x; //number between 0 - 1000 (participants)
            for (let i = 0; i < random; i++) {

                actor[i].setStage(stage, tokenPrice);

                // should choose action randomly (or no action)
                // make sure to always test after each action.
                actor[i].commit(10);
                actor[i].test();

                actor[i].witdraw(10);
                actor[i].test();
            }
            */

            // sometimes, make project do something ()
        }        
        
    }
} 


async function display(rICO, helpers, Project) {

    projectAllocatedETH = new helpers.BN( await rICO.methods.projectAllocatedETH().call() );
    projectWithdrawnETH = new helpers.BN( await rICO.methods.projectWithdrawnETH().call() );
    committedETH = new helpers.BN( await rICO.methods.committedETH().call() );
    withdrawnETH = new helpers.BN( await rICO.methods.withdrawnETH().call() );
    remainingFromLastProjectWithdraw = new helpers.BN( await rICO.methods.remainingFromLastProjectWithdraw().call() );
    
    remainingFromAllocation = new helpers.BN("0");

    // Calculate the amount of allocated ETH, not withdrawn yet
    if (projectAllocatedETH.gt( projectWithdrawnETH )) {
        remainingFromAllocation = projectAllocatedETH.sub(projectWithdrawnETH);
        // revert("aci");
    }

    // Calculate ETH that is globally available:
    // Available = accepted - withdrawn - projectWithdrawn - projectNotWithdrawn
    globalAvailable = committedETH
        .sub(withdrawnETH)
        // .sub(projectAllocatedETH)
        .sub(projectWithdrawnETH)
        .sub(remainingFromLastProjectWithdraw)
        .sub(remainingFromAllocation);
    ;

    console.log("# display");

    console.log(" > committedETH:                     ", Project.toEth(committedETH) + " eth");
    console.log(" > withdrawnETH:                     ", Project.toEth(withdrawnETH) + " eth");
    console.log(" > projectAllocatedETH:              ", Project.toEth(projectAllocatedETH) + " eth");
    console.log(" > projectWithdrawnETH:              ", Project.toEth(projectWithdrawnETH) + " eth");
    console.log(" > remainingFromLastProjectWithdraw: ", Project.toEth(remainingFromLastProjectWithdraw) + " eth");
    console.log(" > remainingFromAllocation:          ", Project.toEth(remainingFromAllocation) + " eth");
    console.log(" > globalAvailable:                  ", Project.toEth(globalAvailable) + " eth");

    console.log(" > committedETH:                             ", Project.toEth(committedETH) + " eth");
    console.log(" > globalAvailable: sub(withdrawnETH)        ", Project.toEth(committedETH.sub(withdrawnETH)) + " eth");
    console.log(" > globalAvailable: sub(projectWithdrawnETH) ", Project.toEth(committedETH.sub(withdrawnETH).sub(projectWithdrawnETH)) + " eth");
    console.log(" > globalAvailable: sub(remainingFromLastPr) ", Project.toEth(committedETH.sub(withdrawnETH).sub(projectWithdrawnETH).sub(remainingFromLastProjectWithdraw)) + " eth");
    console.log(" > globalAvailable: sub(remainingFromAlloca) ", Project.toEth(committedETH.sub(withdrawnETH).sub(projectWithdrawnETH).sub(remainingFromLastProjectWithdraw).sub(remainingFromAllocation)) + " eth");



    lastProjectWithdrawBlock = await rICO.methods.lastProjectWithdrawBlock().call();
    buyPhaseStartBlock = await rICO.methods.buyPhaseStartBlock().call();
    buyPhaseEndBlock = await rICO.methods.buyPhaseEndBlock().call();
    
    let unlockStartBlock;
    if(lastProjectWithdrawBlock < buyPhaseStartBlock) {
        unlockStartBlock = buyPhaseStartBlock;
    } else {
        unlockStartBlock = lastProjectWithdrawBlock + 1;
    }

    console.log(" > lastProjectWithdrawBlock:        ", lastProjectWithdrawBlock);
    console.log(" > buyPhaseStartBlock:              ", buyPhaseStartBlock);
    console.log(" > buyPhaseEndBlock:                ", buyPhaseEndBlock);
    console.log("");
    console.log(" > unlockStartBlock:                ", unlockStartBlock);

    _currentBlock =  await rICO.methods.getCurrentBlockNumber().call();

    totalBlockCount = buyPhaseEndBlock - unlockStartBlock + 1;
    passedBlocks = _currentBlock - unlockStartBlock;

    console.log(" > totalBlockCount:                 ", totalBlockCount);
    console.log(" > passedBlocks:                    ", passedBlocks);
    console.log("");


    let unlocked = globalAvailable.mul(
        new helpers.BN(
            await rICO.methods.getCurrentUnlockPercentageFor(
                _currentBlock.toString(),
                unlockStartBlock.toString(),
                buyPhaseEndBlock.toString()
            ).call()
        )
    ).div( 
        new helpers.BN("10").pow( new helpers.BN("20"))
    );

    const result = unlocked.add(remainingFromAllocation).add(remainingFromLastProjectWithdraw);
    const getProjectAvailableAndUnlockedEth =  await rICO.methods.getProjectAvailableAndUnlockedEth().call() 

    console.log(" > getProjectAvailableEth: calc     ", Project.toEth(result) + " eth");
    console.log(" > getProjectAvailableEth: unlocked ", Project.toEth(new helpers.BN( getProjectAvailableAndUnlockedEth[1] )) + " eth");
    console.log(" > globalAvailable: exact           ", Project.toEth(new helpers.BN( getProjectAvailableAndUnlockedEth[0] )) + " eth");

}