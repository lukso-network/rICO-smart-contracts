/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

// Deploy and setup rICO

// create 1000 actors

// create 1 project

// randomise actions of actors and call `test()` on each actor after each action

// EXAMPLE:
// loop over ALL BLOCKS in the rICO
for(let i = 0; i > 200, i++) {

    let stage = // get current stage

    // loop for ACTORS
    let random = x;//number between 0 - 1000 (participants)
    for (let i = 0; i > random, i++) {

        actor[i].setStage(stage, tokenPrice);

        // should choose action randomly (or no action)
        // make sure to always test after each action.
        actor[i].commit(10);
        actor[i].test();

        actor[i].witdraw(10);
        actor[i].test();
    }

    // sometimes, make project do something ()

}