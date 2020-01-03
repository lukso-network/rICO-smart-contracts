const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const {
    conditional,
    settings,
    clone,
} = require("./_settings.js");

const contractHelper = require("./assets/ricoContract.js");

const {
    shouldHaveValidStateAfterWhitelistModeWithNoContributions,
    shouldHaveValidStateAfterWhitelistMode,
    shouldHaveValidStateAfterAcceptContributionsForAddress,
    shouldHaveValidStateAfterCancelContributionsForAddress,
} = require('./whitelist.behavior');

const {
    shouldHaveValidStateAfterFirstContributionFromParticipant,
    shouldHaveValidStateAfterContributionFromExistingParticipant,
    shouldHaveValidStateAfterOneNewContribution,
    testBalanceChange,
} = require('./commit.behavior');

const {
    shouldHavePendingEth,
} = require('./withdraw.behavior');


describe("Javascript Contract - Work in progress", function () {

    before(function () {
        this.JSContract = new contractHelper(settings);
    });

    describe("Scenario: Stage:0, Participant contributes then gets whitelisted then withdraws full amount", function () {

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

            describe("canWithdraw()", function () {

                it("test", function() {
                    const canWithdraw = this.JSContract.canWithdraw(address);
                    console.log("canWithdraw:", canWithdraw.toString());
                })
            });

            describe("hasPendingETH()", function () {

                it("test", function() {
                    const hasPendingETH = this.JSContract.hasPendingETH(address);
                    console.log("hasPendingETH:", hasPendingETH.toString());
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


            describe("canWithdraw()", function () {

                it("test", function() {
                    const canWithdraw = this.JSContract.canWithdraw(address);
                    console.log("canWithdraw:", canWithdraw.toString());
                })
            });

            describe("hasPendingETH()", function () {

                it("test", function() {
                    const hasPendingETH = this.JSContract.hasPendingETH(address);
                    console.log("hasPendingETH:", hasPendingETH.toString());
                })
            });
            

        });


        // describe("- Participant withdraws full amount", function () {

        //     before(function () {
        //         this.oldState = clone(this.JSContract);
        //         this.JSContract.whitelist(address, _accept);

        //         // set variables so we can test balances.
        //         this.BalanceTestValue = this.value;
        //         this.CommitTestValue = this.value;
        //     });


        //     it("Participant token balance is " + contractHelper.toEth(expectedTokenBalance), function () {
        //         const balance = this.JSContract.TokenContractInstance.balanceOf(address);
        //         expect(
        //             balance.toString()
        //         ).is.equal(
        //             expectedTokenBalance.toString()
        //         );

        //         const advertisedBalance = this.JSContract.getTokenAmountForEthAtStage(this.value, testStage);
        //         expect(
        //             balance.toString()
        //         ).is.equal(
        //             advertisedBalance.toString()
        //         );
        //     });

        //     shouldHaveValidStateAfterWhitelistMode(address, testStage, _accept);
        // });

    });

});
