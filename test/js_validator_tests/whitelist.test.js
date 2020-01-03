
const {
    conditional,
    settings,
    clone,
    BN,
    MAX_UINT256,
    expect,
} = require("./_settings.js");

const {
    shouldHaveValidStateAfterFirstContributionFromParticipant,
    shouldHaveValidStateAfterContributionFromExistingParticipant,
    shouldHaveValidStateAfterOneNewContribution,
} = require('./commit.behavior');

const {
    shouldHaveValidStateAfterWhitelistModeWithNoContributions,
    shouldHaveValidStateAfterWhitelistMode,
    shouldHaveValidStateAfterAcceptContributionsForAddress,
    shouldHaveValidStateAfterCancelContributionsForAddress,
} = require('./whitelist.behavior');


const contractHelper = require("./assets/ricoContract.js");

describe("Javascript Validator - Contract - whitelist()", function () {

    describe("Scenario: Stage:0, Participant gets whitelisted then contributes", function () {
        const address = "participant_1_address";
        const _accept = true;
        const testStage = 0;

        before(function () {
            this.JSContract = new contractHelper(settings);

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );
        });

        describe("- Participant gets whitelisted", function () {

            before(function () {
                this.oldState = clone(this.JSContract);
                this.JSContract.whitelist(address, _accept);
            });

            shouldHaveValidStateAfterWhitelistModeWithNoContributions(address, _accept);

        });

        describe("- Participant commits 1 eth", function () {
            const genericCallbackTitle = "Contract State changes are valid after whitelisting of Participant with no contributions";

            before(function () {
                this.oldState = clone(this.JSContract);
                this.value = this.JSContract.getOneEtherBn();
                this.JSContract.commit(address, this.value);

                // set variable so we can test balances.
                this.BalanceTestValue = this.value;
                this.CommitTestValue = this.value;
            });

            conditional("AllSubTests", "", function() { 
                shouldHaveValidStateAfterFirstContributionFromParticipant(address, testStage, _accept);
            }, function() {
                it(genericCallbackTitle, function() {
                    
                })
            });

        });

    });

    describe("Scenario: Stage:0, Participant contributes then gets whitelisted", function () {
        const address = "participant_1_address";
        const _accept = true;
        const testStage = 0;
        const expectedTokenBalance = "500000000000000000000";

        before(function () {
            this.JSContract = new contractHelper(settings);

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            this.value = this.JSContract.getOneEtherBn();
        });

        describe("- Participant commits 1 eth", function () {
            const genericCallbackTitle = "Contract State changes are valid after first contribution by Participant";

            before(function () {
                this.oldState = clone(this.JSContract);
                this.JSContract.commit(address, this.value);

                // set variables so we can test balances.
                this.BalanceTestValue = this.value;
                this.CommitTestValue = this.value;
            });

            
            conditional("AllSubTests", genericCallbackTitle, function() { 
                // _accept is false since the participant is not already whitelisted
                shouldHaveValidStateAfterFirstContributionFromParticipant(address, testStage, false);
            }, function() {
                it(genericCallbackTitle, function() {
                    
                })
            });
        });

        describe("- Participant gets whitelisted", function () {

            before(function () {
                this.oldState = clone(this.JSContract);
                this.JSContract.whitelist(address, _accept);

                // set variables so we can test balances.
                this.BalanceTestValue = this.value;
                this.CommitTestValue = this.value;
            });


            it("Participant token balance is " + contractHelper.toEth(expectedTokenBalance), function () {
                const balance = this.JSContract.TokenContractInstance.balanceOf(address);
                expect(
                    balance.toString()
                ).is.equal(
                    expectedTokenBalance.toString()
                );

                const advertisedBalance = this.JSContract.getTokenAmountForEthAtStage(this.value, testStage);
                expect(
                    balance.toString()
                ).is.equal(
                    advertisedBalance.toString()
                );
            });

            shouldHaveValidStateAfterWhitelistMode(address, testStage, _accept);
        });

    });

    describe("Scenario: Stage:6, Participant contributes then gets rejected", function () {
        const address = "participant_1_address";
        const _accept = false;
        const testStage = 6;

        before(function () {
            this.JSContract = new contractHelper(settings);

            // set initial balance for address to 10 eth
            this.JSContract.BalanceContractInstance.set(
                address, this.JSContract.getOneEtherBn().mul(new BN("10"))
            );

            // navigate contract to testStage startBlock
            this.JSContract.setBlockNumber(
                this.JSContract.stages[testStage].startBlock
            );
        });

        describe("- Participant commits 1 eth", function () {

            before(function () {
                this.oldState = clone(this.JSContract);
                this.value = this.JSContract.getOneEtherBn();
                this.JSContract.commit(address, this.value);

                // set variable so we can test balances.
                this.BalanceTestValue = this.value;
                this.CommitTestValue = this.value;
            });

            conditional("AllSubTests", "Contract State changes are valid after first contribution by Participant", function() { 
                shouldHaveValidStateAfterFirstContributionFromParticipant(address, testStage, false);
            });
            
        });

        describe("- Participant gets rejected", function () {

            before(function () {
                this.oldState = clone(this.JSContract);
                this.JSContract.whitelist(address, _accept);

                const oldParticipantRecord = this.oldState.participantsByAddress[address];
                const oldStateParticipantAvailableETH = oldParticipantRecord.totalReceivedETH
                    .sub(oldParticipantRecord.withdrawnETH)
                    .sub(oldParticipantRecord.returnedETH);

                // set variable so we can test balances.
                this.BalanceTestValue = oldStateParticipantAvailableETH;
                this.CommitTestValue = this.value;
            });

            shouldHaveValidStateAfterWhitelistMode(address, testStage, _accept);
        });

    });

});