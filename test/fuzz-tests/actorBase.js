/*
 * The actors base class for the project and participants.
 *
 * @author      Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

class Actor {
    constructor(stage, tokenPrice) {
        // set also block number?
        // the less we need to set on the actors sides, the better.
        // lets treat the actors like they know nothing about the rICO, besides which stage they are in

        this.stage = stage;
        this.tokenPrice = tokenPrice;
    }

    // sets the current stage, so that the actor can calculate its expected balances
    setStage(stage, tokenPrice) {
        this.stage = stage;
        this.tokenPrice = tokenPrice;
    }
}