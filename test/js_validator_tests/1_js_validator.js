const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const validatorHelper = require("./assets/validator.js");

const settings = {
    block:              100,
    blocksPerDay:       6450,
    commitPhaseDays:    22,
    stageCount:         12,
    stageDays:          30,
};

const {
    expectThrow
} = require('./test.utils');

describe("Javascript Validator - Tests", function () {
    let Validator;

    before(function ()  {
        Validator = new validatorHelper(settings);
    });

    describe("Integrity checking", function () {

        beforeEach(async function () {
            Validator = new validatorHelper(settings);
        });

        describe("Settings are assigned correctly", function () {

            it("block is correct", function() {
                expect(Validator.block, "block not correct").is.equal(settings.block);
            });
            
            it("commitPhaseStartBlock is correct", function() {
                expect(Validator.commitPhaseStartBlock, "commitPhaseStartBlock not correct").is.equal(
                    settings.block + settings.blocksPerDay
                );
            });

            it("commitPhaseBlockCount is correct", function() {
                expect(Validator.commitPhaseBlockCount, "commitPhaseBlockCount not correct").is.equal(
                    settings.blocksPerDay * settings.commitPhaseDays
                );
            });

            it("commitPhaseEndBlock is correct", function() {
                expect(Validator.commitPhaseEndBlock, "commitPhaseEndBlock not correct").is.equal(
                    // commitPhaseStartBlock ( current block + 1 day )
                    (settings.block + settings.blocksPerDay) + 
                    // commitPhaseBlockCount
                    ( settings.commitPhaseDays * settings.blocksPerDay )
                    // subtract 1 so both start and end blocks are in the block count range
                    - 1
                );
            });

            it("buyPhaseStartBlock is correct", function() {
                expect(Validator.buyPhaseStartBlock, "buyPhaseStartBlock not correct").is.equal(
                    Validator.getStage(1).startBlock
                );
            });

            it("buyPhaseEndBlock is correct", function() {
                expect(Validator.buyPhaseEndBlock, "buyPhaseEndBlock not correct").is.equal(
                    Validator.getStage(Validator.stageCount).endBlock
                );
            });

            it("buyPhaseBlockCount is correct", function() {
                expect(Validator.buyPhaseBlockCount, "buyPhaseBlockCount not correct").is.equal(
                    Validator.buyPhaseEndBlock - Validator.buyPhaseStartBlock
                );
            });

            it("blocksPerDay is correct", function() {
                expect(Validator.blocksPerDay, "blocksPerDay not correct").is.equal(settings.blocksPerDay);
            });

            it("commitPhaseDays is correct", function() {
                expect(Validator.commitPhaseDays, "commitPhaseDays not correct").is.equal(settings.commitPhaseDays);
            });

            it("stageDays is correct", function() {
                expect(Validator.stageDays, "stageDays not correct").is.equal(settings.stageDays);
            });

            it("commitPhasePrice is 0.002", function() {
                expect(
                    Validator.toEth(Validator.commitPhasePrice),
                    "commitPhasePrice not correct"
                ).is.equal("0.002");
            });

            it("stagePriceIncrease is 0.0001", function() {
                expect(
                    Validator.toEth(Validator.stagePriceIncrease),
                    "stagePriceIncrease not correct"
                ).is.equal("0.0001");
            });


        });

        describe("getCurrentBlockNumber()", function () {
            it("returns block correctly", function() {
                expect(Validator.getCurrentBlockNumber()).is.equal(settings.block);
            });
        });

        describe("setBlockNumber()", function () {
            it("sets block correctly", function() {
                Validator.setBlockNumber(2);
                expect(Validator.getCurrentBlockNumber()).is.equal(2);
            });
        });
    });

    describe("Initialization", function () {

        describe("stage generation", function () {

            it("stageCount is correct", function() {
                expect(Validator.stageCount).is.equal(settings.stageCount);
            });

            it("pricing increases by 10% for each stage", function() {

                let expectedPrice = Validator.commitPhasePrice;
                let validCount = 0;
                for(let i = 0; i < settings.stageCount; i++) {
                    const stageData = Validator.getStage(i);
                    expect(stageData.tokenPrice.toString(), "Expected stage pricing is wrong.").is.equal(expectedPrice.toString());
                    expectedPrice = stageData.tokenPrice.add( Validator.stagePriceIncrease );
                    validCount++;
                }
                expect(validCount, "At least one stage pricing is wrong.").is.equal(settings.stageCount);
            });
        });
    });

    describe("Stage Methods", function () {

        describe("getStageAtBlock(_blockNumber)", function () {

            describe("stage 0", function () {
                let stageId = 0;

                it("should return correct stageId using startBlock", function() {
                    const blockInStage = Validator.getStage(stageId).startBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });

                it("should return correct stageId using endBlock", function() {
                    const blockInStage = Validator.getStage(stageId).endBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
            });

            describe("stage 1", function () {
                let stageId = 1;

                it("should return correct stageId using startBlock", function() {
                    const blockInStage = Validator.getStage(stageId).startBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
                
                it("should return correct stageId using endBlock", function() {
                    const blockInStage = Validator.getStage(stageId).endBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
            });

            describe("stage 6", function () {
                let stageId = 6;

                it("should return correct stageId using startBlock", function() {
                    const blockInStage = Validator.getStage(stageId).startBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
                
                it("should return correct stageId using endBlock", function() {
                    const blockInStage = Validator.getStage(stageId).endBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
            });

            describe("last stage", function () {
                let stageId;
                before(function () {
                    stageId = Validator.stageCount;
                });

                it("should return correct stageId using startBlock", function() {
                    const blockInStage = Validator.getStage(stageId).startBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
                
                it("should return correct stageId using endBlock", function() {
                    const blockInStage = Validator.getStage(stageId).endBlock;
                    const resultingStageId = Validator.getStageAtBlock(blockInStage);
                    expect(resultingStageId.toString(), "Incorrect stage id returned").is.equal( stageId.toString() );
                });
            });

            describe("1 block before 0", function () {
                let stageId = 0;
                it("should throw \"Block outside of rICO period.\"", function() {
                    const blockInStage = Validator.getStage(stageId).startBlock - 1;
                    expectThrow(() => {
                        Validator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");
                });
            });

            describe("1 block after last stage", function () {
                let stageId;
                before(function () {
                    stageId = Validator.stageCount;
                });

                it("should throw \"Block outside of rICO period.\"", function() {
                    const blockInStage = Validator.getStage(stageId).endBlock + 1;
                    expectThrow(() => {
                        Validator.getStageAtBlock(blockInStage);
                    }, "Block outside of rICO period.");
                });
            });
        });
    });


    describe("Price Methods", function () {

        describe("getPriceAtBlock(_blockNumber)", function () {
            let _blockNumber = 0;

            describe("edge of commit and buy block range", function () {

                describe("before commitPhaseStartBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(0).startBlock - 1;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.commitPhaseStartBlock - 1);
                    });

                    it("should throw \"Block outside of rICO period.\"", function() {
                        expectThrow(() => {
                            const price = Validator.getPriceAtBlock(_blockNumber);
                        }, "Block outside of rICO period.");
                    });
                });

                describe("at commitPhaseStartBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(0).startBlock;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.commitPhaseStartBlock);
                    });

                    it("should return commitPhasePrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(0).tokenPrice.toString()
                        );
                    });
                });

                describe("at buyPhaseEndBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(Validator.stageCount).endBlock;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.buyPhaseEndBlock);
                    });

                    it("should return commitPhasePrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(Validator.stageCount).tokenPrice.toString()
                        );
                    });
                });

                describe("after buyPhaseEndBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(Validator.stageCount).endBlock + 1;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.buyPhaseEndBlock + 1);
                    });

                    it("should throw \"Block outside of rICO period.\"", function() {
                        expectThrow(() => {
                            const price = Validator.getPriceAtBlock(_blockNumber);
                        }, "Block outside of rICO period.");
                    });

                });
            });

            describe("first stage", function () {
                let startPrice, endPrice;
                const stageId = 0;
                describe("startBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.commitPhaseStartBlock);
                    });

                    it("should return commitPhasePrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        startPrice = price;
                    });
                });

                describe("endBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                        expect(_blockNumber, "Incorrect block").is.equal(Validator.commitPhaseStartBlock);
                    });

                    it("should return commitPhasePrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        endPrice = price;
                    });
                });

                describe("StartBlock price and EndBlock price", function () {
                    it("should be higher than 0 and match", function() {
                        expect(startPrice).is.bignumber.gt(new BN(0));
                        expect(endPrice).is.bignumber.gt(new BN(0));
                        expect(startPrice.toString(), "Start and end prices do not match").is.equal(endPrice.toString());
                    });
                });
            });

            describe("stage 6", function () {
                let startPrice, endPrice;
                const stageId = 6;
                describe("startBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                    });

                    it("should return stage tokenPrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        startPrice = price;
                    });
                });

                describe("endBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                    });

                    it("should return stage tokenPrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        endPrice = price;
                    });
                });

                describe("StartBlock price and EndBlock price", function () {
                    it("should be higher than 0 and match", function() {
                        expect(startPrice).is.bignumber.gt(new BN(0));
                        expect(endPrice).is.bignumber.gt(new BN(0));
                        expect(startPrice.toString(), "Start and end prices do not match").is.equal(endPrice.toString());
                    });
                });
            });
            
            describe("last stage", function () {
                let startPrice, endPrice;
                let stageId;

                before(function () {
                    stageId = Validator.stageCount;
                });

                describe("startBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                    });

                    it("should return stage tokenPrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        startPrice = price;
                    });
                });

                describe("endBlock", function () {

                    before(function () {
                        _blockNumber = Validator.getStage(stageId).startBlock;
                    });

                    it("should return stage tokenPrice", function() {
                        const price = Validator.getPriceAtBlock(_blockNumber);
                        expect(price.toString(), "Incorrect price returned").is.equal(
                            Validator.getStage(stageId).tokenPrice.toString()
                        );
                        endPrice = price;
                    });
                });

                describe("StartBlock price and EndBlock price", function () {
                    it("should be higher than 0 and match", function() {
                        expect(startPrice).is.bignumber.gt(new BN(0));
                        expect(endPrice).is.bignumber.gt(new BN(0));
                        expect(startPrice.toString(), "Start and end prices do not match").is.equal(endPrice.toString());
                    });
                });
            });
        });

        describe("getTokenAmountForEthAtStage()", function () {
            
            describe("1 eth", function () {
                let ethAmount;

                before(function ()  {
                    ethAmount = Validator.getOneEtherBn();
                });

                describe("stage 0", function () {
                    let stageId = 0;

                    it("should return 500 tokens", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        expect(Validator.toEth(TokenAmount), "Incorrect token amount returned").is.equal("500");
                    });
                });

                describe("stage 1", function () {
                    let stageId = 1;

                    it("should return 476.190476190476190476 tokens", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        expect(Validator.toEth(TokenAmount), "Incorrect token amount returned").is.equal("476.190476190476190476");
                    });
                });

                describe("stage 6", function () {
                    let stageId = 6;

                    it("should return 384.615384615384615384 tokens", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        expect(Validator.toEth(TokenAmount), "Incorrect token amount returned").is.equal("384.615384615384615384");
                    });
                });

                describe("last stage", function () {
                    let stageId;
                    before(function () {
                        stageId = Validator.stageCount;
                    });

                    it("should return 312.5 tokens", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        expect(Validator.toEth(TokenAmount), "Incorrect token amount returned").is.equal("312.5");
                    });
                });

            });

        });

        describe("getEthAmountForTokensAtStage()", function () {
            
            describe("1 eth worth of tokens", function () {
                let ethAmount;

                before(function ()  {
                    ethAmount = Validator.getOneEtherBn();
                });

                describe("stage 0", function () {
                    let stageId = 0;

                    it("should return 1 eth", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        const returnedEthAmount = Validator.getEthAmountForTokensAtStage(TokenAmount, stageId);
                        expect(returnedEthAmount.toString(), "Incorrect eth amount returned").is.equal( ethAmount.toString() );
                    });
                });

                describe("stage 1", function () {
                    let stageId = 1;

                    it("should return 1 eth minus 1 wei", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        const returnedEthAmount = Validator.getEthAmountForTokensAtStage(TokenAmount, stageId);
                        expect(returnedEthAmount.toString(), "Incorrect eth amount returned").is.equal( ethAmount.sub(new BN(1)).toString() );
                    });
                });

                describe("stage 6", function () {
                    let stageId = 6;

                    it("should return 1 eth minus 1 wei", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        const returnedEthAmount = Validator.getEthAmountForTokensAtStage(TokenAmount, stageId);
                        expect(returnedEthAmount.toString(), "Incorrect eth amount returned").is.equal( ethAmount.sub(new BN(1)).toString() );
                    });
                });

                describe("last stage", function () {
                    let stageId;
                    before(function () {
                        stageId = Validator.stageCount;
                    });

                    it("should return 1 eth", function() {
                        const TokenAmount = Validator.getTokenAmountForEthAtStage(ethAmount, stageId);
                        const returnedEthAmount = Validator.getEthAmountForTokensAtStage(TokenAmount, stageId);
                        expect(returnedEthAmount.toString(), "Incorrect eth amount returned").is.equal( ethAmount.toString() );
                    });
                });

            });

        });


        describe("getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision)", function () {
            let precision;
            
            before(function ()  {
                precision = new BN("10").pow( new BN("20") );
            });

            describe("_currentBlock in range", function () {

                describe("_currentBlock = 0, _startBlock = 0, _endBlock = 100", function () {
                    const _currentBlock = 0;
                    const _startBlock = 0;
                    const _endBlock = 100;

                    it("should return 0", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0" );
                    });
                });

                describe("_currentBlock = 100, _startBlock = 100, _endBlock = 200", function () {
                    const _currentBlock = 100;
                    const _startBlock = 100;
                    const _endBlock = 200;

                    it("should return 0", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0" );
                    });
                });

                describe("_currentBlock = 1, _startBlock = 0, _endBlock = 100", function () {
                    const _currentBlock = 1;
                    const _startBlock = 0;
                    const _endBlock = 100;

                    it("should return 0.01", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0.01" );
                    });
                });

                describe("_currentBlock = 101, _startBlock = 100, _endBlock = 200", function () {
                    const _currentBlock = 101;
                    const _startBlock = 100;
                    const _endBlock = 200;

                    it("should return 0.01", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0.01" );
                    });
                });

                describe("_currentBlock = 50, _startBlock = 0, _endBlock = 100", function () {
                    const _currentBlock = 50;
                    const _startBlock = 0;
                    const _endBlock = 100;

                    it("should return 0.5", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0.5" );
                    });
                });

                describe("_currentBlock = 100, _startBlock = 0, _endBlock = 100", function () {
                    const _currentBlock = 100;
                    const _startBlock = 0;
                    const _endBlock = 100;

                    it("should return 1", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "1" );
                    });
                });
            });

            describe("_currentBlock ouside range", function () {

                describe("before range => _currentBlock = 0, _startBlock = 1, _endBlock = 101", function () {
                    const _currentBlock = 0;
                    const _startBlock = 1;
                    const _endBlock = 101;

                    it("should return 0", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "0" );
                    });
                });

                describe("after range => _currentBlock = 101, _startBlock = 0, _endBlock = 100", function () {
                    const _currentBlock = 101;
                    const _startBlock = 0;
                    const _endBlock = 100;

                    it("should return 1", function() {
                        let percentage = Validator.getUnlockPercentage(_currentBlock, _startBlock, _endBlock, precision);
                        percentage = percentage.mul(new BN(1000)).div(precision);
                        percentage = percentage.toNumber() / 1000;
                        expect( percentage.toString(), "Incorrect percentage returned").is.equal( "1" );
                    });
                });

            });
        });
        
        describe("getLockedTokenAmountAtBlock(_tokenAmount, _blockNumber, precision) ", function () {
            let precision;
            let CustomSettingsValidator;
            
            const CustomSettings = {
                block:              100,
                blocksPerDay:       10,
                commitPhaseDays:    10,
                stageCount:         1,
                stageDays:          10,
            };

            before(function ()  {
                precision = new BN("10").pow( new BN("20") );
                CustomSettingsValidator = new validatorHelper(CustomSettings);
            });
            
            describe("_blockNumber in range", function () {

                describe("_tokenAmount = 100, _blockNumber = range * 0.25", function () {
                    let _tokenAmount = 100;
                    it("should return 75", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.25 );
                        let locked = CustomSettingsValidator.getLockedTokenAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "75" );
                    });
                });

                describe("_tokenAmount = 100, _blockNumber = range * 0.50 ( middle of the range )", function () {
                    let _tokenAmount = 100;
                    it("should return 50", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.5 );
                        let locked = CustomSettingsValidator.getLockedTokenAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "50" );
                    });
                });

                describe("_tokenAmount = 100, _blockNumber = range * 0.75", function () {
                    let _tokenAmount = 100;
                    it("should return 25", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.75 );
                        let locked = CustomSettingsValidator.getLockedTokenAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "25" );
                    });
                });

            });

            describe("_blockNumber outside range", function () {

                describe("block before buyPhaseStartBlock", function () {
                    const _tokenAmount = 1000;
                    let _blockNumber;

                    before(function ()  {
                        _blockNumber = CustomSettingsValidator.buyPhaseStartBlock - 1;
                    });

                    it("should return full amount", function() {
                        let locked = CustomSettingsValidator.getLockedTokenAmountAtBlock(_tokenAmount, _blockNumber, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( _tokenAmount.toString() );
                    });
                });

                describe("block after buyPhaseEndBlock", function () {
                    const _tokenAmount = 1000;
                    let _blockNumber;

                    before(function ()  {
                        _blockNumber = CustomSettingsValidator.buyPhaseEndBlock + 1;
                    });

                    it("should return 0", function() {
                        let locked = CustomSettingsValidator.getLockedTokenAmountAtBlock(_tokenAmount, _blockNumber, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "0" );
                    });
                });

            });

        });

        describe("getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, _blockNumber, precision) ", function () {
            let precision;
            let CustomSettingsValidator;
            
            const CustomSettings = {
                block:              100,
                blocksPerDay:       10,
                commitPhaseDays:    10,
                stageCount:         1,
                stageDays:          10,
            };

            before(function ()  {
                precision = new BN("10").pow( new BN("20") );
                CustomSettingsValidator = new validatorHelper(CustomSettings);
            });
            
            describe("_blockNumber in range", function () {

                describe("_tokenAmount = 100, _blockNumber = range * 0.25", function () {
                    let _tokenAmount = 100;
                    it("should return 25", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.25 );
                        let locked = CustomSettingsValidator.getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "25" );
                    });
                });

                describe("_tokenAmount = 100, _blockNumber = range * 0.50 ( middle of the range )", function () {
                    let _tokenAmount = 100;
                    it("should return 50", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.5 );
                        let locked = CustomSettingsValidator.getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "50" );
                    });
                });

                describe("_tokenAmount = 100, _blockNumber = range * 0.75", function () {
                    let _tokenAmount = 100;
                    it("should return 75", function() {
                        const rangeStartblock = CustomSettingsValidator.getStage(1).startBlock;
                        const middleBlock = rangeStartblock + ( CustomSettingsValidator.buyPhaseBlockCount * 0.75 );
                        let locked = CustomSettingsValidator.getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, middleBlock, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "75" );
                    });
                });

            });

            describe("_blockNumber outside range", function () {

                describe("block before buyPhaseStartBlock", function () {
                    const _tokenAmount = 1000;
                    let _blockNumber;

                    before(function ()  {
                        _blockNumber = CustomSettingsValidator.buyPhaseStartBlock - 1;
                    });

                    it("should return 0", function() {
                        let locked = CustomSettingsValidator.getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, _blockNumber, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( "0" );
                    });
                });

                describe("block after buyPhaseEndBlock", function () {
                    const _tokenAmount = 1000;
                    let _blockNumber;

                    before(function ()  {
                        _blockNumber = CustomSettingsValidator.buyPhaseEndBlock + 1;
                    });

                    it("should return full amount", function() {
                        let locked = CustomSettingsValidator.getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, _blockNumber, precision);
                        expect( locked.toString(), "Incorrect locked amount returned").is.equal( _tokenAmount.toString() );
                    });
                });

            });

        });
        
    });

});