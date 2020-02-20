const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

// to decrease verbosity of the tests output, set this to false,
// and the suite will disable "does not change" tests
runDoesNotChangeChecks = true;

// with this enabled, the suite will run all tests on all sub objects it can
// else a generic test that ensures the "before" block is run.
runAllSubTests = true;

const tokenSupply = new BN(100)
    .mul(
        // milion
        new BN("10").pow(new BN("6"))
    )
    .mul(
        // 10^18 to account for decimals
        new BN("10").pow(new BN("18"))
    );

const saleSupply = new BN(15)
    .mul(
        // milion
        new BN("10").pow(new BN("6"))
    )
    .mul(
        // 10^18 to account for decimals
        new BN("10").pow(new BN("18"))
    );

const settings = {
    block: 100,
    blocksPerDay: 6450,
    commitPhaseDays: 22,
    stageCount: 12,
    stageDays: 30,
    tokenSupply: tokenSupply,
    saleSupply: saleSupply
};

function conditional(typeOrBool, title, callback, elseCallBack = null) {
    if (typeOrBool === "doesNotChange" && runDoesNotChangeChecks) {
        it(title, callback);
    } else if (typeOrBool === "AllSubTests") {
        if(runAllSubTests) {
            callback();
        } else if (typeof elseCallBack === "function") {
            elseCallBack();
        } else {
            throw ("missing else callback will result in 'before' block not being executed.");
        }
    } else if (typeOrBool === true) {
        it(title, callback);
    }

}

const _ = require('lodash');

function clone(_what) {
    return _.cloneDeep(_what);
}

module.exports = {
    conditional,
    settings,
    clone,
    BN,
    MAX_UINT256,
    expect,
};