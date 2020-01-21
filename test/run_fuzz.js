const setup = require("./init.js");
(async function() { 
  try {
    const init = await setup.runSetup();
    // console.log(init.setup);
    console.log("    Running on", init.setup.helpers.networkName, "network.");
    console.log("    Provider: ", init.setup.helpers.networkConfig.provider);
    await runTests(init); 
  } catch (e) {
    throw new Error(e);
  }
})();

async function runTests(init) {

  let tests = require("./fuzz-tests/fuzz-tests.js");
  await tests.run(init);

  console.log("Done");
  process.exit(0);

}

