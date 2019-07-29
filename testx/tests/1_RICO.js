module.exports = function(setup) {

    const helpers = setup.helpers;
    const BN = helpers.BN;
    const expectRevert = helpers.expectRevert;
    const MAX_UINT256 = helpers.MAX_UINT256;
    const expect = helpers.expect

    const ReversableICO = helpers.artifacts.require("ReversableICO.sol");

    contract("ReversableICO", function (accounts) {

        it("should assert true", function (done) {
            const RICO = ReversableICO.deployed();
            assert.isTrue(true);
            done();
        });
    });

}
