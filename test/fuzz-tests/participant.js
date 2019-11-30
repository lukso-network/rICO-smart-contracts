/*
 * The test participant class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const Actor = require("./actorBase.js");

class Participant extends Actor {
    
    // set the defaults
    constructor(properties, ETH) {
        super();

        this.properties = properties;

        // should be add the tokenPrice?
        // and do the calculation based on the current token price?

        this.currentBalances = {
            ETH: ETH,
            Token: 0,
            withdrawableETH: 0,
            unlockedToken: 0,
        };

        this.expectedBalances = {
            ETH: ETH,
            Token: 0,
            withdrawableETH: 0,
            unlockedToken: 0,
        };
    }

    /* External */

    // commit ETH to the rICO contract
    commit(ETH) {

    }

    // withdraw ETH from the rICO contract
    withdraw(Token) {

    }

    test() {
        this.readBalances();
        this.recalculateExpectedBalances();

        this.sanityCheck();
    }

    /* Internal */

    // read balances from rICO and Token contract
    readBalances() {

        // set all values new
        // this.currentBalances.ETH = ...;
        // ...
    }

    // recalculate expected balances
    recalculateExpectedBalances() {
        // ...
        // this.expectedBalances.ETH = ...;
    }

    // check if the expected and current balances match
    sanityCheck() {
        expect(this.expectedBalances.ETH).to.be.equal(this.currentBalances.ETH, 'ETH balance is not as expected.');
        expect(this.expectedBalances.Token).to.be.equal(this.currentBalances.Token, 'Token balance is not as expected.');
        expect(this.expectedBalances.withdrawableETH).to.be.equal(this.currentBalances.withdrawableETH, 'Withdrawable ETH balance is not as expected.');
        expect(this.expectedBalances.unlockedToken).to.be.equal(this.currentBalances.unlockedToken, 'Unlocked Token balance is not as expected.');
    }
}

module.exports = Participant;
