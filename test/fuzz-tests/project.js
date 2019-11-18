/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect


class Project extends Actor {
    // set the defaults
    constructor() {

        this.currentBalances = {
            ETH: 0,
            widthdrawCount: 0
        }

        this.expectedBalances = {
            ETH: ETH,
            widthdrawCount: 0
        }
    }

    /* External */

    // withdraw ETH from the rICO contract
    withdraw(ETH) {

    }

    // white list any number of addresses
    whitelist(addresses) {

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
    ...
        this.expectedBalances.ETH = ...;
    }

    // check if the expected and current balances match
    sanityCheck() {
        expect(this.expectedBalances.ETH).to.be.equal(this.currentBalances.ETH, 'ETH balance is not as expected.');
        expect(this.expectedBalances.widthdrawCount).to.be.equal(this.currentBalances.widthdrawCount, 'Widthdraw Count is not as expected.');
    }
}