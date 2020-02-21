const {
    conditional,
    clone,
    BN,
    MAX_UINT256,
    expect,
    expectThrow
} = require("./_test.utils.js");

const contractHelper = require("./assets/ricoContract.js");

const {
    shouldHaveValidStateAfterFirstContributionFromParticipant,
    shouldHaveValidStateAfterContributionFromExistingParticipant,
    shouldHaveValidStateAfterOneNewContribution,
} = require('./commit.behavior');

describe("Javascript Validator - Contract - commit()", function () {

    before(function () {
        this.JSContract = new contractHelper(setup.settings);
    });

    describe("Participant - commits 1 eth", function () {
        const address = "participant_1_address";
        const testStage = 0;

        before(function () {

            // navigate contract to testStage startBlock
            this.JSContract.setBlockNumber(
                this.JSContract.stages[testStage].startBlock
            );

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            this.oldState = clone(this.JSContract);
            this.value = this.JSContract.getOneEtherBn();
            this.JSContract.commit(address, this.value);

            // set variable so we can test balances.
            this.BalanceTestValue = this.value;
            this.CommitTestValue = this.value;
        });

        shouldHaveValidStateAfterFirstContributionFromParticipant(address, testStage);

    });


    describe("Participant - commits 1 eth - second time", function () {
        const address = "participant_1_address";
        const testStage = 0;

        before(function () {

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            this.oldState = clone(this.JSContract);
            this.value = this.JSContract.getOneEtherBn();
            this.JSContract.commit(address, this.value);

            // set variable so we can test balances.
            this.BalanceTestValue = this.value;
            this.CommitTestValue = this.value;
        });

        shouldHaveValidStateAfterContributionFromExistingParticipant(address, testStage);

    });


    describe("Participant - commits 1 eth - third time", function () {
        const address = "participant_1_address";
        const testStage = 0;

        before(function () {

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            this.oldState = clone(this.JSContract);
            this.value = this.JSContract.getOneEtherBn();
            this.JSContract.commit(address, this.value);

            // set variable so we can test balances.
            this.BalanceTestValue = this.value;
            this.CommitTestValue = this.value;
        });

        shouldHaveValidStateAfterContributionFromExistingParticipant(address, testStage);

    });


    describe("Participant 2 - commits 1 eth", function () {
        const address = "participant_2_address";
        const testStage = 0;

        before(function () {

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            this.oldState = clone(this.JSContract);
            this.value = this.JSContract.getOneEtherBn();
            this.JSContract.commit(address, this.value);

            // set variable so we can test balances.
            this.BalanceTestValue = this.value;
            this.CommitTestValue = this.value;
        });

        shouldHaveValidStateAfterFirstContributionFromParticipant(address, testStage);

        it("Contract.participantCount is 2", function () {
            expect(this.JSContract.participantCount).is.equal(2);
        });

    });

});