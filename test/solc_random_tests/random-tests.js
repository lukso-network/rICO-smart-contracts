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

        // for(let i = 78; i < rICOBlockLength + 1; i++) {
            
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
            

            // const participant = participants[1];
            // participant.setBlock(block);
            // await participant.whitelistApprove();
            // await participant.commitHalfBalance();
            // await participant.test();

            // Loop participants and execute a random action.
            for( let j = 0; j < participants.length; j++) {
                participants[j].setBlock(block);
                await participants[j].executeRandomActionOrNone();
            }
            await Project.executeRandomActionOrNone();

        }        
        
        Project.displayBalances();
        await Project.withdrawFullAmount();
        Project.displayBalances();

        console.log("");
        console.log("Run summary:");
        console.log("Participants:", participants.length);

    }
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