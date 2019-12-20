/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const deployer = require("./deployer.js");
const whitelister = require("./whitelister.js");

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
            StageDays:       5,     // 30;
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
                rICO: null
            }
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
        console.log("      buyPhaseEndBlock:     ", buyPhaseEndBlock);
        console.log("");
        console.log("      rICO block length:", rICOBlockLength);

        const Whitelister = new whitelister(init, rICO, rICOSettings.whitelistControllerAddress);

        console.log("      Whitelister:", Whitelister.address);

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 4 - Run Tests \n" +
            "  ----------------------------------------------------------------"
        );

        // jump to allocation block 
        await helpers.utils.jumpToContractStage ( rICO, deployment.addresses.ContractsDeployer, 0 );

        // randomise actions of actors and call `test()` on each actor after each action

        for(let i = 0; i < rICOBlockLength; i++) {
            
            // block relative to rICO start.
            const block = commitPhaseStartBlock + i;
            await rICO.methods.jumpToBlockNumber(block).send({from: deployment.addresses.ContractsDeployer, gas: 100000});

            const currentStage = await rICO.methods.getCurrentStage().call();
            const currentAvailableEthForPurchase = await rICO.methods.availableEthAtStage(currentStage).call();

            console.log(
                "   ",
                "block:", block,
                "stage:", currentStage,
                "eth:", helpers.utils.toEth(helpers, currentAvailableEthForPurchase) + " eth"
            );


            if(i == 5) {
                const participant = participants[0];
                const actions = await participant.getCurrentlyAvailableActions();
                console.log("getAvailableActions", actions);

                participant.displayBalances();
                await participant.commit( participant.currentBalances.ETH );
                await participant.test();
                participant.displayBalances();

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