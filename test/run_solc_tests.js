const setup = require("./init.js");
(async function() {
  try {
    const init = await setup.runSetup();
    await runTests(init); 
  } catch (e) {
    console.log("error:", e);
  }
})();

async function runTests(init) {

  const tests = [
    //"external/SafeMath",
    "1_ERC1820",
    "rework/flows/random_tests",
    // "2_ERC777_Token",
    // "3_ERC20Token",
    "rework/flows/token_balances", // test pass when run alone???
    // "rework/phases",
    // "rework/methods/stages",
    // "5_Cancel", 
    // "5_Contributions",
    // "5_Flows",
    // "5_ProjectWithdraw",
    // "6_Gnosis-Safe",
    // "7_Website",
    // "10_ProjectWithdraw",




    // Needs fixing
    // "rework/methods/tokens/getParticipantReservedTokens",
    // "rework/methods/tokens/buyTokens",
    // "rework/flows/whitelist",
    // "rework/flows/withdraw",

  ];

  init.helpers.utils.toLog(
    " ----------------------------------------------------------------\n" +
      "  Step 2 - Run tests \n" +
      "  ----------------------------------------------------------------"
  );

  // let testFiles = [];

  // for (let i = 0; i < tests.length; i++) {
  //   testFiles.push("test/solc_tests/" + tests[i] + ".js");
  // }

  // const MochaRunner = require("./mocha-runner.js");
  // const runner1 = new MochaRunner();

  // await runner1.run(testFiles).then(() => {
  //   runner1.cleanup();
  //   console.log("Done");
  //   process.exit(process.exitCode);
  // });

  if (tests.length > 0) {
    const Mocha = require("mocha");

    // Instantiate a Mocha instance.
    const mocha = new Mocha();

    mocha.useColors(true);
    mocha.slow(15);
    mocha.timeout(600000);
    mocha.checkLeaks(true);

    for (let i = 0; i < tests.length; i++) {
      try {
        mocha.addFile("test/solc_tests/" + tests[i] + ".js");
      } catch (e) {
        console.log("error:", e);
      }
    }

    // Run the tests.
    const runner = mocha.run(
      function(failures) {
        process.exitCode = failures ? 1 : 0; // exit with non-zero status if there were failures
      },
      true // delay execution of root suite until ready.
    );

    runner.on("end", e => {
      console.log("Done");
      process.exit(process.exitCode);
    });
  }
  

}

