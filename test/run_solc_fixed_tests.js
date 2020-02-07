const setup = require("./init.js");
(async function() { 
  const init = await setup.runSetup();
  // console.log(init.setup);
  console.log("    Running on", init.setup.helpers.networkName, "network.");
  console.log("    Provider: ", init.setup.helpers.networkConfig.provider);
  await runTests(init);
})();

async function runTests(init) {

  let tests = require("./solc_random_tests/fixed-tests.js");
  await tests.run(init);

  console.log("Done");
  // TODO exit with 1 on failure
  process.exit(0);

}

