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

function expectThrow(block, message) {
    let thrown = false;
    try {
        block();
    } catch (e) {
        thrown = true;
        expect(e, "Thrown message did not match").is.equal(message);    
    }
    expect(thrown, "Should have thrown.").to.be.equal(true);
}

module.exports = {
    conditional,
    clone,
    BN,
    MAX_UINT256,
    expect,
    expectThrow
};