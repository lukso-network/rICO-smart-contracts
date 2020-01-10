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

        for(let i = 0; i < rICOBlockLength + 1; i++) {
            
            // block relative to rICO start.
            const block = commitPhaseStartBlock + i;
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
                console.log("getAvailableActions", actions);

                // await participant.executeRandomAction(actions);
                
                /*
                participant.displayBalances();
                await participant.commit( participant.currentBalances.ETH );
                await participant.test();
                participant.displayBalances();
                await participant.withdrawByETH();
                await participant.test();
                participant.displayBalances();
                */

                /*
                console.log("commit");
                // await participant.commit( participant.currentBalances.ETH.div( new helpers.BN(2) )  );
                await participant.commitEntireBalance();
                await participant.test();
                participant.displayBalances();
                */

                // reject participant
                /*
                console.log("whitelist false");
                await participant.setWhitelist(false);
                await participant.test();
                participant.displayBalances();
                */

                /*
                // whitelist participant
                console.log("whitelist true");
                await participant.setWhitelist(true);
                await participant.test();
                participant.displayBalances();
                
                console.log("sendHalfTokensBack");
                await participant.sendHalfTokensBack();
                await participant.test();
                participant.displayBalances();

                console.log("sendAllTokensBack");
                await participant.sendAllTokensBack();
                await participant.test();
                participant.displayBalances();
                */


                
                console.log("commitHalfBalance");
                await participant.commitHalfBalance();
                await participant.test();
                // participant.displayBalances();

                console.log("whitelist true");
                await participant.setWhitelist(true);
                await participant.test();

                console.log("commitEntireBalance");
                await participant.commitEntireBalance();
                await participant.test();
                // participant.displayBalances();

                actions = await participant.getAvailableActions(block);
                console.log("getAvailableActions", actions);

                /*
                console.log("sendHalfTokensBack");
                await participant.sendHalfTokensBack();
                await participant.test();

                console.log("sendAllTokensBack");
                await participant.sendAllTokensBack();
                await participant.test();
                */

                console.log("actionLog", participant.actionLog);

                console.log("");
                await Project.readBalances();
                Project.displayBalances();
                console.log("withdrawHalf");
                await Project.withdrawHalf();
                console.log("test");
                await Project.test();
                Project.displayBalances();


                const p2 = participants[1];
                p2.setBlock(block);

                console.log("commitEntireBalance");
                await p2.commitEntireBalance();
                await p2.test();
                console.log("whitelist true");
                await p2.setWhitelist(true);
                await p2.test();
                
                console.log("");
                console.log("readBalances");
                await Project.readBalances();
                console.log("withdrawHalf");
                await Project.withdrawHalf();
                console.log("test");
                await Project.test();
                Project.displayBalances();


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