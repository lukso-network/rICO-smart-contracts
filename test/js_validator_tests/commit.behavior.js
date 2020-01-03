const {
    conditional,
    settings,
    clone,
    BN,
    MAX_UINT256,
    expect,
} = require("./_settings.js");


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

            it("contributionsCount is 1", function () {
                const newParticipantRecord = this.JSContract.participantsByAddress[_address];
                expect(newParticipantRecord.contributionsCount).is.equal(1);
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

        it("Contract.totalReceivedETH increases by commited value", function () {
            const difference = new BN(this.JSContract.totalReceivedETH.toString())
                .sub(new BN(this.oldState.totalReceivedETH.toString()));
            expect(difference.toString()).is.equal(this.CommitTestValue.toString());
        });

        describe("ParticipantRecord", function () {
            let oldParticipantRecord, newParticipantRecord, oldbyStage, newbyStage, reservedTokens;

            before(function () {

                oldParticipantRecord = this.oldState.participantsByAddress[_address];
                if (!oldParticipantRecord) {
                    oldParticipantRecord = this.oldState.setupNewParticipant();
                }
                newParticipantRecord = this.JSContract.participantsByAddress[_address];

                oldbyStage = oldParticipantRecord.byStage[_testStage];
                newbyStage = newParticipantRecord.byStage[_testStage];

                reservedTokens = this.oldState.getTokenAmountForEthAtStage(
                    this.CommitTestValue.toString(), _testStage
                );

            });

            it("contributionsCount increases by 1", function () {
                expect(
                    newParticipantRecord.contributionsCount
                ).is.equal(
                    oldParticipantRecord.contributionsCount + 1
                );
            });

            it("totalReceivedETH increases by commited value", function () {
                const difference = new BN(newParticipantRecord.totalReceivedETH.toString())
                    .sub(new BN(oldParticipantRecord.totalReceivedETH.toString()));
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

                it("reservedTokens is 0", function () {
                    expect(newParticipantRecord.reservedTokens.toString()).is.equal("0");
                });

                it("boughtTokens increases by getTokenAmountForEthAtStage(value)", function () {
                    const difference = new BN(newParticipantRecord.boughtTokens.toString())
                        .sub(new BN(oldParticipantRecord.boughtTokens.toString()));
                    expect(difference.toString()).is.equal(reservedTokens.toString());
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

                it("reservedTokens increases by getTokenAmountForEthAtStage(value)", function () {
                    const difference = new BN(newParticipantRecord.reservedTokens.toString())
                        .sub(new BN(oldParticipantRecord.reservedTokens.toString()));
                    expect(difference.toString()).is.equal(reservedTokens.toString());
                });
            }

            describe("currentStageRecord", function () {

                it("totalReceivedETH increases by commited value", function () {
                    const difference = new BN(newbyStage.totalReceivedETH.toString())
                        .sub(new BN(oldbyStage.totalReceivedETH.toString()));
                    expect(difference.toString()).is.equal(this.CommitTestValue.toString());
                });

                conditional("doesNotChange", "returnedETH does not change", function () {
                    expect(newbyStage.returnedETH.toString()).is.equal(oldbyStage.returnedETH.toString());
                });

                if (_whitelisted) {

                    it("committedETH increases by commit value", function () {
                        const difference = new BN(newbyStage.committedETH.toString())
                            .sub(new BN(oldbyStage.committedETH.toString()));
                        expect(difference.toString()).is.equal(this.CommitTestValue.toString());
                    });

                } else {

                    conditional("doesNotChange", "committedETH does not change", function () {
                        expect(newbyStage.committedETH.toString()).is.equal(oldbyStage.committedETH.toString());
                    });

                }

                conditional("doesNotChange", "withdrawnETH does not change", function () {
                    expect(newbyStage.withdrawnETH.toString()).is.equal(oldbyStage.withdrawnETH.toString());
                });

                conditional("doesNotChange", "allocatedETH does not change", function () {
                    expect(newbyStage.allocatedETH.toString()).is.equal(oldbyStage.allocatedETH.toString());
                });


                if (_whitelisted) {

                    it("reservedTokens is 0", function () {
                        expect(newbyStage.reservedTokens.toString()).is.equal("0");
                    });

                    it("boughtTokens increases by getTokenAmountForEthAtStage(value)", function () {
                        const difference = new BN(newbyStage.boughtTokens.toString())
                            .sub(new BN(oldbyStage.boughtTokens.toString()));
                        expect(difference.toString()).is.equal(reservedTokens.toString());
                    });

                } else {

                    it("reservedTokens increases by getTokenAmountForEthAtStage(value)", function () {
                        const difference = new BN(newbyStage.reservedTokens.toString())
                            .sub(new BN(oldbyStage.reservedTokens.toString()));
                        expect(difference.toString()).is.equal(reservedTokens.toString());
                    });

                    conditional("doesNotChange", "boughtTokens does not change", function () {
                        expect(newbyStage.boughtTokens.toString()).is.equal(oldbyStage.boughtTokens.toString());
                    });

                }

                conditional("doesNotChange", "returnedTokens does not change", function () {
                    expect(newbyStage.returnedTokens.toString()).is.equal(oldbyStage.returnedTokens.toString());
                });

            });

            if (_testStage > 0) {

                describe("Each Previous StageRecord (" + (_testStage - 1) + ")", function () {

                    conditional("doesNotChange", "totalReceivedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].totalReceivedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].totalReceivedETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "returnedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].returnedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].returnedETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "committedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].committedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].committedETH.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "withdrawnETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].withdrawnETH.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].withdrawnETH.toString()
                            );
                        }
                    });

                    if (_whitelisted) {
                    
                        conditional("doesNotChange", "reservedTokens is 0", function () {
                            for(let i = _testStage - 1; i >= 0; i--) {
                                expect(oldParticipantRecord.byStage[i].reservedTokens.toString()).is.equal("0");
                                expect(newParticipantRecord.byStage[i].reservedTokens.toString()).is.equal("0");
                            }
                        });
                    
                    } else {

                        conditional("doesNotChange", "reservedTokens does not change", function () {
                            for(let i = _testStage - 1; i >= 0; i--) {
                                expect(
                                    newParticipantRecord.byStage[i].reservedTokens.toString()
                                ).is.equal(
                                    oldParticipantRecord.byStage[i].reservedTokens.toString()
                                );
                            }
                        });

                    }
                    conditional("doesNotChange", "boughtTokens does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].boughtTokens.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].boughtTokens.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "returnedTokens does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].returnedTokens.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].returnedTokens.toString()
                            );
                        }
                    });

                    conditional("doesNotChange", "allocatedETH does not change", function () {
                        for(let i = _testStage - 1; i >= 0; i--) {
                            expect(
                                newParticipantRecord.byStage[i].allocatedETH.toString()
                            ).is.equal(
                                oldParticipantRecord.byStage[i].allocatedETH.toString()
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

