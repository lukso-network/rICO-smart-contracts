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

  let tests = require("./fuzz-tests/fuzz-tests.js");
  await tests.run(init);

  console.log("Done");
  process.exit(0);

}

