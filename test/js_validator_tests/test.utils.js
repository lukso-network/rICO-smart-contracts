const {
    conditional,
    settings,
    clone,
    BN,
    MAX_UINT256,
    expect,
} = require("./_settings.js");


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
    expectThrow
};
