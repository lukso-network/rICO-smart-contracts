/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

module.exports = {
    async run (init) {

        init.helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 2 - Run Deployment \n" +
            "  ----------------------------------------------------------------"
        );

        const deployer = require("./deployer.js");
        const deployment = await deployer.run(init);

        // contract instances
        const rICOToken = deployment.contracts.rICOToken;
        const rICO = deployment.contracts.rICO;

        // contract addresses
        const addresses = deployment.addresses;

        init.helpers.utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 3 - Run Tests \n" +
            "  ----------------------------------------------------------------"
        );

        // jump to allocation block 
        await helpers.utils.jumpToContractStage ( rICO, ContractsDeployer, 0 );

        // create 1000 actors ( each needs a wallet, and accounts[0] to transfer over some funds )
        // each action needs validator

        // randomise actions of actors and call `test()` on each actor after each action

        // EXAMPLE:
        // loop over ALL BLOCKS in the rICO
        for(let i = 0; i > 200; i++) {

            let stage = 0;// get current stage
            
            // loop for ACTORS
            let random = x; //number between 0 - 1000 (participants)
            for (let i = 0; i > random; i++) {

                actor[i].setStage(stage, tokenPrice);

                // should choose action randomly (or no action)
                // make sure to always test after each action.
                actor[i].commit(10);
                actor[i].test();

                actor[i].witdraw(10);
                actor[i].test();
            }

            // sometimes, make project do something ()
        }        

    }
} 