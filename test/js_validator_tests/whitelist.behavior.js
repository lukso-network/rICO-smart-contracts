const {
    conditional,
    clone,
    BN,
    MAX_UINT256,
    expect,
    expectThrow
} = require("./_test.utils.js");

const {
    shouldHaveValidStateAfterFirstContributionFromParticipant,
    shouldHaveValidStateAfterContributionFromExistingParticipant,
    shouldHaveValidStateAfterOneNewContribution,
    testBalanceChange,
} = require('./commit.behavior');


function shouldHaveValidStateAfterWhitelistModeWithNoContributions(_address, _accept) {

    describe("Contract State changes after whitelisting of Participant with no contributions", function () {

        describe("ParticipantRecord", function () {
            let newParticipantRecord;

            before(function () {
                newParticipantRecord = this.JSContract.participants[_address];
            });

            it("whitelisted is " + _accept.toString(), function () {
                expect(newParticipantRecord.whitelisted).is.equal(_accept);
            });
        });

        testBalanceChange("same", "", _address);
    });

}

function shouldHaveValidStateAfterWhitelistMode(_address, _testStage, _accept) {
    
    describe("State changes after whitelist mode: " + _accept.toString(), function () {

        describe("ParticipantRecord", function () {
            let newParticipantRecord;

            before(function () {
                newParticipantRecord = this.JSContract.participants[_address];
            });

            it("whitelisted is " + _accept.toString(), function () {
                expect(newParticipantRecord.whitelisted).is.equal(_accept);
            });
        });

        if (_accept) {
            shouldHaveValidStateAfterAcceptContributionsForAddress(_address, _testStage, _accept);
        } else {
            shouldHaveValidStateAfterCancelContributionsForAddress(_address, _testStage, _accept);
        }

    });

}

function shouldHaveValidStateAfterAcceptContributionsForAddress(_address, _testStage, _accept) {

    describe("acceptContributionsForAddress()", function () {

        let oldParticipantRecord, newParticipantRecord, oldStateParticipantAvailableETH, newStateParticipantAvailableETH;

        before(function () {
            oldParticipantRecord = this.oldState.participants[_address];
            newParticipantRecord = this.JSContract.participants[_address];

            oldStateParticipantAvailableETH = oldParticipantRecord.totalSentETH
                .sub(oldParticipantRecord.withdrawnETH)
                .sub(oldParticipantRecord.returnedETH);

            newStateParticipantAvailableETH = newParticipantRecord.totalSentETH
                .sub(newParticipantRecord.withdrawnETH)
                .sub(newParticipantRecord.returnedETH);
        });

        describe("Contract:", function () {

            conditional("doesNotChange", "returnedETH does not change", function () {
                expect(this.oldState.returnedETH.toString()).is.equal(this.JSContract.returnedETH.toString());
            });

            it("committedETH increases by commit value", function () {
                const difference = new BN(this.JSContract.committedETH.toString())
                    .sub(new BN(this.oldState.committedETH.toString()));
                expect(difference.toString()).is.equal(this.CommitTestValue.toString());
            });

        });

        describe("ParticipantRecord:", function () {

            let newParticipantRecord;

            before(function () {
                newParticipantRecord = this.JSContract.participants[_address];
            });

            it("whitelisted is " + _accept.toString(), function () {
                expect(newParticipantRecord.whitelisted).is.equal(_accept);
            });

            it("ParticipantAvailableETH is commit value", function () {
                expect(newStateParticipantAvailableETH.toString()).is.equal(this.CommitTestValue.toString());
            });

            it("committedETH increases by commit value", function () {
                const difference = new BN(newParticipantRecord.committedETH.toString())
                    .sub(new BN(oldParticipantRecord.committedETH.toString()));
                expect(difference.toString()).is.equal(this.CommitTestValue.toString());
            });

        });


        describe("Tokens:", function () {

            it("Participant token balance is oldState.ParticipantRecord.pendingTokens", function () {
                const expectedBalance = this.oldState.participants[_address].pendingTokens;
                const balance = this.JSContract.TokenContractInstance.balanceOf(_address);
                expect(
                    balance.toString()
                ).is.equal(
                    expectedBalance.toString()
                );
            });

            it("ParticipantRecord.pendingTokens is 0", function () {
                expect(newParticipantRecord.pendingTokens.toString()).is.equal("0");
            });

        });
    });

    testBalanceChange("same", "", _address);

}


function shouldHaveValidStateAfterCancelContributionsForAddress(_address, _accept) {

    describe("cancelContributionsForAddress()", function () {

        let oldParticipantRecord, newParticipantRecord, oldStateParticipantAvailableETH, newStateParticipantAvailableETH;

        before(function () {
            oldParticipantRecord = this.oldState.participants[_address];
            newParticipantRecord = this.JSContract.participants[_address];

            oldStateParticipantAvailableETH = oldParticipantRecord.totalSentETH
                .sub(oldParticipantRecord.withdrawnETH)
                .sub(oldParticipantRecord.returnedETH);

            newStateParticipantAvailableETH = newParticipantRecord.totalSentETH
                .sub(newParticipantRecord.withdrawnETH)
                .sub(newParticipantRecord.returnedETH);
        });

        describe("Contract:", function () {

            conditional("doesNotChange", "committedETH does not change", function () {
                expect(this.JSContract.committedETH.toString()).is.equal(this.oldState.committedETH.toString());
            });

            it("returnedETH increases by oldState.ParticipantAvailableETH value", function () {
                const difference = new BN(this.JSContract.returnedETH.toString())
                    .sub(new BN(this.oldState.returnedETH.toString()));
                expect(difference.toString()).is.equal(oldStateParticipantAvailableETH.toString());
            });

        });

        describe("ParticipantRecord:", function () {

            it("ParticipantAvailableETH is 0", function () {
                expect(newStateParticipantAvailableETH.toString()).is.equal("0");
            });

            it("whitelisted is false", function () {
                expect(newParticipantRecord.whitelisted).is.equal(false);
            });

            it("pendingTokens is 0", function () {
                expect(newParticipantRecord.pendingTokens.toString()).is.equal("0");
            });

            it("withdrawnETH increases by oldState.ParticipantAvailableETH", function () {
                const difference = new BN(newParticipantRecord.withdrawnETH.toString())
                    .sub(new BN(oldParticipantRecord.withdrawnETH.toString()));
                expect(difference.toString()).is.equal(oldStateParticipantAvailableETH.toString());
            });

        });

        describe("Tokens:", function () {

            it("Participant token balance does not change", function () {
                const oldBalance = this.oldState.TokenContractInstance.balanceOf(_address);
                const newBalance = this.JSContract.TokenContractInstance.balanceOf(_address);
                expect(
                    oldBalance.toString()
                ).is.equal(
                    newBalance.toString()
                );
            });

            it("ParticipantRecord.pendingTokens is 0", function () {
                expect(newParticipantRecord.pendingTokens.toString()).is.equal("0");
            });

        });

        testBalanceChange("sentByContract", "oldState.ParticipantAvailableETH", _address);

    });

}

module.exports = {
    shouldHaveValidStateAfterWhitelistModeWithNoContributions,
    shouldHaveValidStateAfterWhitelistMode,
    shouldHaveValidStateAfterAcceptContributionsForAddress,
    shouldHaveValidStateAfterCancelContributionsForAddress,
};

