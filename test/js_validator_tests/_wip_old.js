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

describe("Javascript Contract - Work in progress", function () {

    before(function () {
        this.JSContract = new contractHelper(settings);
    });

    describe("Participant - commits 1 eth", function () {
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

        shouldRunOrig(address, testStage, false);
        shouldRunMod(address, testStage, false);
    });

});

function initTests(grouping) {


    describe(grouping[0], function () {
        // tests
        if(typeof grouping[1] === "function") {
            before(grouping[1]());
        }

        // tests
        const tests = grouping[2];

        for(let i = 0; i < tests.length; i++) {
            it(tests[i][0], tests[i][1]);
        }

        // describes
        const subtests = grouping[3];
        if(subtests) {
            for(let i = 0; i < subtests.length; i++) {
                initTests(subtests[i]);
            }
        }
    });

}

function shouldRunMod(_address, _testStage, _whitelisted = false) {

    const tests = [
        "State changes after first contribution by a Participant",  // title
        null,   // before
        // it tests
        [
            [
                "Contract.participantsById indexes the participant id => address", function () {
                    expect(this.JSContract.participantsById[this.JSContract.participantCount]).is.equal(_address);
                }
            ],
            
            [
                "Contract.participantCount increases by 1", function () {
                    const oldParticipantCount = this.oldState.participantCount;
                    const newParticipantCount = this.JSContract.participantCount;
                    expect(newParticipantCount).is.equal(oldParticipantCount + 1);
                }
            ],
        ],
        // describe
        [
            [
                "ParticipantRecord",  // title
                null,   // before
                // tests
                [
                    [
                        "contributionsCount is 1", function () {
                            const newParticipantRecord = this.JSContract.participantsByAddress[_address];
                            expect(newParticipantRecord.contributionsCount).is.equal(1);
                        }
                    ]
                ]
            ],
            [
                "ParticipantRecord 2",  // title
                null,   // before
                // tests
                [
                    [
                        "contributionsCount is 1", function () {
                            const newParticipantRecord = this.JSContract.participantsByAddress[_address];
                            expect(newParticipantRecord.contributionsCount).is.equal(1);
                        }
                    ],
                ],
            ],
        ]
    ];

    initTests(tests);
}


function shouldRunOrig(_address, _testStage, _whitelisted = false) {

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

        describe("ParticipantRecord 2", function () {

            it("contributionsCount is 1", function () {
                const newParticipantRecord = this.JSContract.participantsByAddress[_address];
                expect(newParticipantRecord.contributionsCount).is.equal(1);
            });

        });
    });
}