const {
    conditional,
    clone,
    BN,
    MAX_UINT256,
    expect,
    expectThrow
} = require("./_test.utils.js");

function shouldHaveValidStateAfterFirstContributionFromParticipant(_address, _testStage, _whitelisted = false) {

    describe("State changes after first contribution by a Participant", function () {

        it("Contract.participantsById indexes the participant id => address", function () {
            expect(this.JSContract.participantsById[this.JSContract.participantCount]).is.equal(_address);
        });

        it("Contract.participantCount increases by 1", function () {
            const oldParticipantCount = this.oldState.participantCount;
            const newParticipantCount = this.JSContract.participantCount;
            expect(newParticipantCount).is.equal(oldParticipantCount + 1);
        });

        describe("ParticipantRecord", function () {

            it("contributions is 1", function () {
                const newParticipantRecord = this.JSContract.participants[_address];
                expect(newParticipantRecord.contributions).is.equal(1);
            });

        });

    });

    shouldHaveValidStateAfterOneNewContribution(_address, _testStage, _whitelisted);
}

function shouldHaveValidStateAfterContributionFromExistingParticipant(_address, _testStage, _whitelisted = false) {

    describe("Contract State changes after contribution from existing Participant", function () {

        it("Contract.participantCount does not change", function () {
            const oldParticipantCount = this.oldState.participantCount;
            const newParticipantCount = this.JSContract.participantCount;
            expect(newParticipantCount).is.equal(oldParticipantCount);
        });

    });

    shouldHaveValidStateAfterOneNewContribution(_address, _testStage, _whitelisted);
}


function shouldHaveValidStateAfterOneNewContribution(_address, _testStage, _whitelisted = false) {

    describe("State changes after a new contribution", function () {

        it("Contract.totalSentETH increases by commited value", function () {
            const difference = new BN(this.JSContract.totalSentETH.toString())
                .sub(new BN(this.oldState.totalSentETH.toString()));
            expect(difference.toString()).is.equal(this.CommitTestValue.toString());
        });

        describe("ParticipantRecord", function () {
            let oldParticipantRecord, newParticipantRecord, oldstages, newstages, pendingTokens;

            before(function () {

                oldParticipantRecord = this.oldState.participants[_address];
                if (!oldParticipantRecord) {
                    oldParticipantRecord = this.oldState.setupNewParticipant();
                }
                newParticipantRecord = this.JSContract.participants[_address];

                oldstages = oldParticipantRecord.stages[_testStage];
                newstages = newParticipantRecord.stages[_testStage];

                pendingTokens = this.oldState.getTokenAmountForEthAtStage(
                    this.CommitTestValue.toString(), _testStage
                );

            });

            it("contributions increases by 1", function () {
                expect(
                    newParticipantRecord.contributions
                ).is.equal(
                    oldParticipantRecord.contributions + 1
                );
            });

            it("totalSentETH increases by commited value", function () {
                const difference = new BN(newParticipantRecord.totalSentETH.toString())
                    .sub(new BN(oldParticipantRecord.totalSentETH.toString()));
                expect(difference.toString()).is.equal(this.CommitTestValue.toString());
            });

            conditional("doesNotChange", "returnedETH does not change", function () {
                expect(newParticipantRecord.returnedETH.toString())
                    .is.equal(oldParticipantRecord.returnedETH.toString());
            });

            conditional("doesNotChange", "withdrawnETH does not change", function () {
                expect(newParticipantRecord.withdrawnETH.toString())
                    .is.equal(oldParticipantRecord.withdrawnETH.toString());
            });

            conditional("doesNotChange", "allocatedETH does not change", function () {
                expect(newParticipantRecord.allocatedETH.toString())
                    .is.equal(oldParticipantRecord.allocatedETH.toString());
            });

            conditional("doesNotChange", "returnedTokens does not change", function () {
                expect(newParticipantRecord.returnedTokens.toString())
                    .is.equal(oldParticipantRecord.returnedTokens.toString());
            });


            if (_whitelisted) {

                it("committedETH increases by commit value", function () {
                    const difference = new BN(newParticipantRecord.committedETH.toString())
                        .sub(new BN(oldParticipantRecord.committedETH.toString()));
                    expect(difference.toString()).is.equal(this.CommitTestValue.toString());
                });

                it("pendingTokens is 0", function () {
                    expect(newParticipantRecord.pendingTokens.toString()).is.equal("0");
                });

                it("boughtTokens increases by getTokenAmountForEthAtStage(value)", function () {
                    const difference = new BN(newParticipantRecord.boughtTokens.toString())
                        .sub(new BN(oldParticipantRecord.boughtTokens.toString()));
                    expect(difference.toString()).is.equal(pendingTokens.toString());
                });

            } else {

                conditional("doesNotChange", "committedETH does not change", function () {
                    expect(newParticipantRecord.committedETH.toString())
                        .is.equal(oldParticipantRecord.committedETH.toString());
                });

                conditional("doesNotChange", "boughtTokens does not change", function () {
                    expect(newParticipantRecord.boughtTokens.toString())
                        .is.equal(oldParticipantRecord.boughtTokens.toString());
                });

                it("pendingTokens increases by getTokenAmountForEthAtStage(value)", function () {
                    const difference = new BN(newParticipantRecord.pendingTokens.toString())
                        .sub(new BN(oldParticipantRecord.pendingTokens.toString()));
                    expect(difference.toString()).is.equal(pendingTokens.toString());
                });
            }

            describe("currentStageRecord", function () {

                it("totalSentETH increases by commited value", function () {
                    const difference = new BN(newstages.totalSentETH.toString())
                        .sub(new BN(oldstages.totalSentETH.toString()));
                    expect(difference.toString()).is.equal(this.CommitTestValue.toString());
                });

                conditional("doesNotChange", "returnedETH does not change", function () {
                    expect(newstages.returnedETH.toString()).is.equal(oldstages.returnedETH.toString());
                });

                if (_whitelisted) {

                    it("committedETH increases by commit value", function () {
                        const difference = new BN(newstages.committedETH.toString())
                            .sub(new BN(oldstages.committedETH.toString()));
                        expect(difference.toString()).is.equal(this.CommitTestValue.toString());
                    });

                } else {

                    conditional("doesNotChange", "committedETH does not change", function () {
                        expect(newstages.committedETH.toString()).is.equal(oldstages.committedETH.toString());
                    });

                }

                conditional("doesNotChange", "withdrawnETH does not change", function () {
                    expect(newstages.withdrawnETH.toString()).is.equal(oldstages.withdrawnETH.toString());
                });

                conditional("doesNotChange", "allocatedETH does not change", function () {
                    expect(newstages.allocatedETH.toString()).is.equal(oldstages.allocatedETH.toString());
                });


                if (_whitelisted) {

                    it("pendingTokens is 0", function () {
                        expect(newstages.pendingTokens.toString()).is.equal("0");
                    });

                    it("boughtTokens increases by getTokenAmountForEthAtStage(value)", function () {
                        const difference = new BN(newstages.boughtTokens.toString())
                            .sub(new BN(oldstages.boughtTokens.toString()));
                        expect(difference.toString()).is.equal(pendingTokens.toString());
                    });

                } else {

                    it("pendingTokens increases by getTokenAmountForEthAtStage(value)", function () {
                        const difference = new BN(newstages.pendingTokens.toString())
                            .sub(new BN(oldstages.pendingTokens.toString()));
                        expect(difference.toString()).is.equal(pendingTokens.toString());
                    });

                    conditional("doesNotChange", "boughtTokens does not change", function () {
                        expect(newstages.boughtTokens.toString()).is.equal(oldstages.boughtTokens.toString());
                    });

                }

                conditional("doesNotChange", "returnedTokens does not change", function () {
                    expect(newstages.returnedTokens.toString()).is.equal(oldstages.returnedTokens.toString());
                });

            });

            if (_testStage > 0) {

                describe("Each Previous StageRecord (" + (_testStage - 1) + ")", function () {

                    conditional("doesNotChange", "totalSentETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].totalSentETH.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].totalSentETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "returnedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].returnedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].returnedETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "committedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].committedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].committedETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "withdrawnETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].withdrawnETH.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].withdrawnETH.toString()
                            );
                        }
                    });

                    if (_whitelisted) {
                    
                        conditional("doesNotChange", "pendingTokens is 0", function () {
                            for(let i = _testStage - 1; i >= 0; i--) {
                                expect(oldParticipantRecord.stages[i].pendingTokens.toString()).is.equal("0");
                                expect(newParticipantRecord.stages[i].pendingTokens.toString()).is.equal("0");
                            }
                        });
                    
                    } else {

                        conditional("doesNotChange", "pendingTokens does not change", function () {
                            for(let i = _testStage - 1; i >= 0; i--) {
                                expect(
                                    newParticipantRecord.stages[i].pendingTokens.toString()
                                ).is.equal(
                                    oldParticipantRecord.stages[i].pendingTokens.toString()
                                );
                            }
                        });

                    }
                    conditional("doesNotChange", "boughtTokens does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].boughtTokens.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].boughtTokens.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "returnedTokens does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].returnedTokens.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].returnedTokens.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "allocatedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.stages[i].allocatedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.stages[i].allocatedETH.toString()
                            );
                        }
                    });

                });
            }

        });

        testBalanceChange("sentToContract", "commit value", _address);
    });
}


function testBalanceChange(mode, name, _address) {

    describe("ETH Balances:", function () {

        let titleOne, titleTwo;
        if (mode == "sentToContract") {
            titleOne = "increases by " + name;
            titleTwo = "decreases by " + name;
        } else if (mode == "sentByContract") {
            titleOne = "decreases by " + name;
            titleTwo = "increases by " + name;
        } else if (mode == "same") {
            titleOne = "does not change";
            titleTwo = "does not change";
        }

        it("Contract ETH balance " + titleOne, function () {
            const oldBalance = this.oldState.BalanceContractInstance.balanceOf(this.oldState.contractAddress);
            const newBalance = this.JSContract.BalanceContractInstance.balanceOf(this.JSContract.contractAddress);

            if (mode == "sentToContract") {
                const expectedBalance = oldBalance.add(this.BalanceTestValue);
                expect(newBalance.toString()).is.equal(expectedBalance.toString());
            } else if (mode == "sentByContract") {
                const expectedBalance = oldBalance.sub(this.BalanceTestValue);
                expect(newBalance.toString()).is.equal(expectedBalance.toString());
            } else if (mode == "same") {
                expect(oldBalance.toString()).is.equal(newBalance.toString());
            }
        });

        it("Participant ETH balance " + titleTwo, function () {
            const oldBalance = this.oldState.BalanceContractInstance.balanceOf(_address);
            const newBalance = this.JSContract.BalanceContractInstance.balanceOf(_address);

            if (mode == "sentToContract") {
                const expectedBalance = oldBalance.sub(this.BalanceTestValue);
                expect(newBalance.toString()).is.equal(expectedBalance.toString());
            } else if (mode == "sentByContract") {
                const expectedBalance = oldBalance.add(this.BalanceTestValue);
                expect(newBalance.toString()).is.equal(expectedBalance.toString());
            } else if (mode == "same") {
                expect(oldBalance.toString()).is.equal(newBalance.toString());
            }
        });

    });

}

module.exports = {
    shouldHaveValidStateAfterFirstContributionFromParticipant,
    shouldHaveValidStateAfterContributionFromExistingParticipant,
    shouldHaveValidStateAfterOneNewContribution,
    testBalanceChange
};

