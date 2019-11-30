/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

module.exports = {
    async run (init) {
        
        const helpers = init.helpers;
        const numberOfParticipants = 16;
        const rICOSettings = { blocksPerDay: 24 };

        const deployer = require("./deployer.js");

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 2 - Initialize Participants \n" +
            "  ----------------------------------------------------------------"
        );

        const participants = await deployer.createParticipants(init, numberOfParticipants);
        
        // console.log(participants);

        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 3 - Run Deployment \n" +
            "  ----------------------------------------------------------------"
        );
        const deployment = await deployer.run(init, rICOSettings);

        // contract instances
        const rICOToken = deployment.contracts.rICOToken;
        const rICO = deployment.contracts.rICO;

        // contract addresses
        const addresses = deployment.addresses;

        console.log("    rICO Settings");
        const commitPhaseStartBlock = await rICO.methods.commitPhaseStartBlock().call();
        console.log("      commitPhaseStartBlock:", commitPhaseStartBlock);
        const commitPhaseEndBlock = await rICO.methods.commitPhaseEndBlock().call();
        console.log("      commitPhaseEndBlock:  ", commitPhaseEndBlock);

        const buyPhaseStartBlock = await rICO.methods.buyPhaseStartBlock().call();
        console.log("      buyPhaseStartBlock:   ", buyPhaseStartBlock);
        const buyPhaseEndBlock = await rICO.methods.buyPhaseEndBlock().call();
        console.log("      buyPhaseEndBlock:     ", buyPhaseEndBlock);

        console.log("");
        const rICOBlockLength = buyPhaseEndBlock - commitPhaseStartBlock;
        console.log("      rICO block length:", rICOBlockLength);


        helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 4 - Run Tests \n" +
            "  ----------------------------------------------------------------"
        );

        // jump to allocation block 
        await helpers.utils.jumpToContractStage ( rICO, deployment.addresses.ContractsDeployer, 0 );

        // randomise actions of actors and call `test()` on each actor after each action

        for(let i = 0; i < rICOBlockLength; i++) {

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