const setup = require("./init.js");
(async function() {
    return new Promise(async function (resolve, reject) {
      const init = await setup.runSetup();
      let runner = runTests(init);

      runner.on("end", e => {

        if(e) {
          reject(e);
        } else {
          resolve();
        }

        // process.exit(process.exitCode);
      });
    });
})().catch(e => {throw new Error(e)});

function runTests(init) {

  const tests = [
    "external/SafeMath",
    "1_ERC1820",
    "2_ERC777_Token",
    "3_ERC20Token",
    "4_ReversibleICO",
    "5_Cancel",
    "5_Contributions",
    "5_Flows",
    // "6_Gnosis-Safe",
    "7_Website",
    "5_ProjectWithdraw",
    // "5_Contributions",
  ];

  init.helpers.utils.toLog(
    " ----------------------------------------------------------------\n" +
      "  Step 2 - Run tests \n" +
      "  ----------------------------------------------------------------"
  );

  if (tests.length > 0) {
    const Mocha = require("mocha");

    // Instantiate a Mocha instance.
    const mocha = new Mocha();

    mocha.useColors(true);
    mocha.slow(15);
    mocha.timeout(600000);

    for (let i = 0; i < tests.length; i++) {
      try {
        mocha.addFile("test/tests/" + tests[i] + ".js");
      } catch (e) {
        console.log("error:", e);
      }
    }

    // Run the tests.
    return mocha.run(
      function(failures) {
        process.exitCode = failures ? 1 : 0; // exit with non-zero status if there were failures
      },
      true // delay execution of root suite until ready.
    );
  }
}

