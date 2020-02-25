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
    "1_js_validator",
    // "stages.test",
    // "commit.test",
    // "whitelist.test",
    // "_wip"
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
    mocha.slow(5);
    mocha.timeout(600000);

    for (let i = 0; i < tests.length; i++) {
      try {
        mocha.addFile("test/js_validator_tests/" + tests[i] + ".js");
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

