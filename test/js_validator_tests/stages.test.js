const {
    conditional,
    clone,
    BN,
    MAX_UINT256,
    expect,
    expectThrow
} = require("./_test.utils.js");

const validatorHelper = require("./assets/validator.js");

function shouldReturnTheSameResult(instance1, instance2, stageId, getterName, blockDifference) {
    const result1 = shouldReturnExpectedStageId(instance1, stageId, getterName, blockDifference);
    const result2 = shouldReturnExpectedStageId(instance2, stageId, getterName, blockDifference);
    expect(result1.toString(), "Returned stage ids do not match").is.equal( result2.toString() );
}

function shouldReturnExpectedStageId(instance, stageId, getterName, blockDifference) {
    const blockInStage = instance.getStage(stageId)[getterName] + blockDifference;
    const resultingStageId = instance.getStageAtBlock(blockInStage);
    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
    return resultingStageId;
}

describe("Javascript Validator - Tests", function () {
    let Validator, CustomSettingsValidator, startBlock = 100;
    
    const CustomSettings = {
        token: setup.settings.token,
        rico: {
            startBlockDelay:    10,
            blocksPerDay:       10,
            commitPhaseDays:    10,
            stageCount:         12,
            stageDays:          10,
            commitPhasePrice:   setup.settings.rico.commitPhasePrice, 
            stagePriceIncrease: setup.settings.rico.stagePriceIncrease
        }
    };

    before(function ()  {
        Validator = new validatorHelper(setup.settings);
        CustomSettingsValidator = new validatorHelper(CustomSettings, startBlock);
    });

    describe("Stage initialisation", function () {

        before(function ()  {
            console.log("      Settings:");
            console.log("       startBlock:      ", startBlock);
            console.log("       startBlockDelay: ", CustomSettings.rico.startBlockDelay);
            console.log("       blocksPerDay:    ", CustomSettings.rico.blocksPerDay);
            console.log("       commitPhaseDays: ", CustomSettings.rico.commitPhaseDays);
            console.log("       stageCount:      ", CustomSettings.rico.stageCount);
            console.log("       stageDays:       ", CustomSettings.rico.stageDays);
        });

        describe("Stage[0]", function () {
            let currentStageData;
            let currentStageId = 0;

            before(function ()  {
                currentStageData = CustomSettingsValidator.stages[currentStageId];
            });

            it("stage[0] startBlock is 110", function () {
                expect(currentStageData.startBlock, "startBlock incorrect").is.equal( 110 );
                expect(currentStageData.startBlock, "startBlock incorrect").is.equal( startBlock + CustomSettings.rico.startBlockDelay );
            });

            it("stage[0] duration is 99 ( endBlock - startBlock )", function () {
                const duration = currentStageData.endBlock - currentStageData.startBlock;
                expect(duration, "duration incorrect").is.equal( 99 );
                expect(duration, "duration incorrect").is.equal( CustomSettings.rico.stageDays * CustomSettings.rico.commitPhaseDays - 1 );
            });
        
            it("stage[0] endBlock is 209 ( startBlock=110 + duration ) => 209", function () {
                expect(currentStageData.endBlock, "endBlock incorrect").is.equal( 209 );
                const duration = currentStageData.endBlock - currentStageData.startBlock;
                expect(currentStageData.endBlock, "endBlock incorrect").is.equal( startBlock + CustomSettings.rico.startBlockDelay + duration );
            }); 

            it("stage[0] stagePriceIncrease is correct", function () {
                const price = CustomSettings.rico.commitPhasePrice + ( currentStageId * CustomSettings.rico.stagePriceIncrease );
                expect(currentStageData.tokenPrice.toString(), "tokenPrice incorrect").is.equal( price.toString() );
            }); 
        });


        describe("Stage[1]", function () {
            let currentStageData;
            let currentStageId = 1;

            before(function ()  {
                currentStageData = CustomSettingsValidator.stages[currentStageId];
            });

            it("stage[1] startBlock is 210", function () {
                expect(currentStageData.startBlock, "startBlock incorrect").is.equal( 210 );
            });

            it("stage[1] duration is 99 ( endBlock - startBlock )", function () {
                const duration = currentStageData.endBlock - currentStageData.startBlock;
                expect(duration, "duration incorrect").is.equal( 99 );
                expect(duration, "duration incorrect").is.equal( CustomSettings.rico.stageDays * CustomSettings.rico.blocksPerDay - 1 );
            });
        
            it("stage[1] endBlock is 309 ( startBlock=110 + duration ) => 309", function () {
                expect(currentStageData.endBlock, "endBlock incorrect").is.equal( 309 );
            }); 

            it("stage[1] stagePriceIncrease is correct", function () {
                const price = CustomSettings.rico.commitPhasePrice + ( currentStageId * CustomSettings.rico.stagePriceIncrease );
                expect(currentStageData.tokenPrice.toString(), "tokenPrice incorrect").is.equal( price.toString() );
            }); 
        });

        describe("Stage[12]", function () {
            let currentStageData;
            let currentStageId = 12;

            before(function ()  {
                currentStageData = CustomSettingsValidator.stages[currentStageId];
            });

            it("stage[12] startBlock is 1310", function () {
                expect(currentStageData.startBlock, "startBlock incorrect").is.equal( 1310 );
            });

            it("stage[12] duration is 99 ( endBlock - startBlock )", function () {
                const duration = currentStageData.endBlock - currentStageData.startBlock;
                expect(duration, "duration incorrect").is.equal( 99 );
                expect(duration, "duration incorrect").is.equal( CustomSettings.rico.stageDays * CustomSettings.rico.blocksPerDay - 1 );
            });
        
            it("stage[12] endBlock is 1409 ( startBlock=110 + duration ) => 1409", function () {
                expect(currentStageData.endBlock, "endBlock incorrect").is.equal( 1409 );
            }); 

            it("stage[12] stagePriceIncrease is correct", function () {
                const price = CustomSettings.rico.commitPhasePrice + ( currentStageId * CustomSettings.rico.stagePriceIncrease );
                expect(currentStageData.tokenPrice.toString(), "tokenPrice incorrect").is.equal( price.toString() );
            }); 
        });

    });

    describe("Stage Methods", function () {

        it("stage count matches for both test instances", function() {
            expect(Validator.stageCount, "stageCount does not match").is.equal( CustomSettingsValidator.stageCount );
            expect(Validator.stageCount, "stageCount does not match").is.equal( CustomSettings.rico.stageCount );
        });

        describe("getStageAtBlock(_blockNumber)", function () {

            describe("stage 0", function () {
                let stageId = 0;

                it("should return 0 when called using using stage[0].startBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "startBlock", 0);
                });

                it("should return 0 when called using using stage[0].endBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "endBlock", 0);
                });
            });

            describe("stage 1", function () {
                let stageId = 1;

                it("should return 1 when called using using stage[1].startBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "startBlock", 0);
                });
                
                it("should return 1 when called using using stage[1].endBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "endBlock", 0);
                });
            });

            describe("stage 6", function () {
                let stageId = 6;

                it("should return 6 when called using using stage[6].startBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "startBlock", 0);
                });
                
                it("should return 6 when called using using stage[6].endBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "endBlock", 0);
                });
            });

            describe("last stage", function () {
                let stageId;
                before(function () {
                    stageId = Validator.stageCount;
                });

                it("should return stageCount when called using using stage[stageCount].startBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "startBlock", 0);
                });
                
                it("should return stageCount when called using using stage[stageCount].endBlock", function() {
                    shouldReturnTheSameResult(Validator, CustomSettingsValidator, stageId, "endBlock", 0);
                });
            });

            describe("1 block before 0", function () {
                let stageId = 0;
                it("should throw \"Block outside of rICO period.\"", function() {
                    let blockInStage = Validator.getStage(stageId).startBlock - 1;
                    expectThrow(() => {
                        Validator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");

                    blockInStage = CustomSettingsValidator.getStage(stageId).startBlock - 1;
                    expectThrow(() => {
                        CustomSettingsValidator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");
                });
            });

            describe("1 block after last stage", function () {
                let stageId;
                before(function () {
                    stageId = Validator.stageCount;
                });

                it("should throw \"Block outside of rICO period.\"", function() {
                    let blockInStage = Validator.getStage(stageId).endBlock + 1;
                    expectThrow(() => {
                        Validator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");

                    blockInStage = CustomSettingsValidator.getStage(stageId).endBlock + 1;
                    expectThrow(() => {
                        CustomSettingsValidator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");
                });
            });

            // describe("test", function () {
            //     let stageId = 0;
            //     it("test", function() {

            //         const blockInStage = Validator.getStage(stageId).startBlock;
            //         console.log("blockInStage:     ", blockInStage);
            //         const resultingStageId = Validator.getStageAtBlock(blockInStage);
            //         console.log("resultingStageId: ", resultingStageId);

            //     });
            // });

        });
    });


});