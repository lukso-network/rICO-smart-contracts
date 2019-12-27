const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const validatorHelper = require("./assets/validator.js");
const contractHelper = require("./assets/ricoContract.js");

const settings = {
    block:              100,
    blocksPerDay:       6450,
    commitPhaseDays:    22,
    StageCount:         12,
    StageDays:          30,
};

describe("Javascript Contract Tests", function () {
    let JSContract;

    before(function ()  {
        JSContract = new contractHelper(settings);
    });

    
    describe("Setup", function () {

        describe("TokenContract", function () {

            it("has correct supply", function() {
                // console.log(JSContract.TokenContract.balances);
                /*
                expect(
                    JSContract.TokenContract.toString()
                ).is.equal(value.toString());
                */
            });
        });
        
    });

    describe("commit()", function () {

        describe("1 participant commits 1 eth", function () {
            let address = "0xFa08d898cC4F180259aaDBA3A7227D515F8626f2";
            let value;

            before(function ()  {
                value = JSContract.getOneEtherBn();
                JSContract.commit(address, value);
            });

            it("totalReceivedETH increases correctly", function() {
                expect(
                    JSContract.totalReceivedETH.toString()
                ).is.equal(value.toString());
            });

            it("participantsByAddress contributionsCount increases correctly", function() {
                expect(
                    JSContract.participantsByAddress[address].contributionsCount
                ).is.equal(1);
            });

            it("totalReceivedETH increases correctly", function() {
                console.log(JSContract.participantsByAddress);
            });
        });

    });

});