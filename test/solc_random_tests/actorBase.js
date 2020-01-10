/*
 * The actors base class for the project and participants.
 *
 * @author      Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

class Actor {
    constructor() {
        // set also block number?
        // the less we need to set on the actors sides, the better.
        // lets treat the actors like they know nothing about the rICO, besides which stage they are in

        this.stage = 0;
        this.tokenPrice = 0;
    }

    // sets the current stage, so that the actor can calculate its expected balances
    setStage(stage, tokenPrice) {
        this.stage = stage;
        this.tokenPrice = tokenPrice;
    }

    toEth(value) {
        return this.helpers.utils.toEth(this.helpers, value.toString())
    }
}

module.exports = Actor;
