/*
 * The contract validator base class.
 *
 * @author Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
*/

const { BN, constants } = require("openzeppelin-test-helpers");
const { MAX_UINT256 } = constants;
const web3util = require("web3-utils");

const ether = 1000000000000000000; // 1 ether in wei
const etherBN = new BN(ether.toString());

const solidity = {
    ether: ether,
    etherBN: etherBN,
    gwei: 1000000000
};

class Validator {
    
    // set the defaults
    constructor(settings, currentBlock = 0) {
        this.block              = currentBlock;

        this.commitPhaseStartBlock = this.block + settings.rico.startBlockDelay;
        this.blocksPerDay       = settings.rico.blocksPerDay;       // 6450
        this.commitPhaseDays    = settings.rico.commitPhaseDays;    // 22
        this.stageCount         = settings.rico.stageCount;         // 12
        this.stageDays          = settings.rico.stageDays;          // 30
        this.commitPhasePrice   = new BN(settings.rico.commitPhasePrice);   // 0.002
        this.stagePriceIncrease = new BN(settings.rico.stagePriceIncrease); // 0.0001

        this.stages          = [];

        this.init();
    }

    init() {
        this.commitPhaseBlockCount = this.blocksPerDay * this.commitPhaseDays;
        this.commitPhaseEndBlock = this.commitPhaseStartBlock + this.commitPhaseBlockCount - 1;
        this.stageBlockCount = this.blocksPerDay * this.stageDays;

        // Generate stage data
        this.stages[0] = {
            startBlock: this.commitPhaseStartBlock,
            endBlock: this.commitPhaseEndBlock,
            tokenPrice: this.commitPhasePrice,
        };

        let lastStageBlockEnd = this.stages[0].endBlock;

        for (let i = 1; i <= this.stageCount; i++) {

            const startBlock = lastStageBlockEnd + 1;
            this.stages[i] = {
                startBlock: startBlock,
                endBlock: lastStageBlockEnd + this.stageBlockCount,
                tokenPrice: this.commitPhasePrice.add( 
                    this.stagePriceIncrease.mul( 
                        new BN(i)
                    )
                ),
            };

            lastStageBlockEnd = this.stages[i].endBlock;
        }

        // The buy phase starts on the subsequent block of the commitPhase's (stage0) endBlock
        this.buyPhaseStartBlock = this.commitPhaseEndBlock + 1;
        this.buyPhaseEndBlock = lastStageBlockEnd;
        
        // The duration of buyPhase in blocks
        this.buyPhaseBlockCount = lastStageBlockEnd - this.buyPhaseStartBlock + 1;
    }

    getTokenAmountForEthAtStage(ethValue, stageId) {
        if(typeof this.stages[stageId] === "undefined") {
            throw "Stage " + stageId + " not found.";
        }

        return new BN(ethValue.toString()).mul(
            new BN("10").pow( new BN("18") )
        ).div(
            this.stages[stageId].tokenPrice
        );
    }

    getEthAmountForTokensAtStage(tokenAmount, stageId) {
        if(typeof this.stages[stageId] === "undefined") {
            throw "Stage " + stageId + " not found.";
        }

        return new BN(tokenAmount.toString()).mul(
            this.stages[stageId].tokenPrice
        ).div(
            new BN("10").pow( new BN("18") )
        );
    }

    getCurrentGlobalUnlockRatio() {
        const currentBlock = new BN( this.getCurrentBlockNumber() );
        const BuyPhaseStartBlock = new BN( this.buyPhaseStartBlock - 1 );
        const BuyPhaseEndBlock   = new BN( this.buyPhaseEndBlock );
        const precision = new BN(20);
        return this.getUnlockPercentage(currentBlock, BuyPhaseStartBlock, BuyPhaseEndBlock, precision);
    }

    getUnlockPercentage(_currentBlock, _startBlock, _endBlock, _precision) {

        const currentBlock = new BN( _currentBlock );
        const startBlock = new BN( _startBlock - 1 ); // adjust the period
        const endBlock   = new BN( _endBlock );
        const precision   = new BN( _precision );

        if(precision.lt(new BN("2")) && precision.gt(new BN("20"))) {
            throw "Precision should be higher than 1 and lower than 20";
        }

        // currentBlock >= startBlock && currentBlock <= endBlock
        if(currentBlock.gte(startBlock) && currentBlock.lte(endBlock))
        {
            const passedBlocks = currentBlock.sub(startBlock);
            const blockCount = endBlock.sub(startBlock);

            return passedBlocks.mul(
                new BN(10).pow(precision)
            ).div(blockCount);
            
        } else if (currentBlock.gt(endBlock)) {
            return new BN(10).pow(precision);
        } else {
            // lower than or equal to start block
            return new BN(0);
        }s
    }

    getCurrentStage() {
        return this.getStageAtBlock(this.getCurrentBlockNumber());
    }

    getStageAtBlock(_blockNumber) {
        this.require(
            _blockNumber >= this.commitPhaseStartBlock && _blockNumber <= this.buyPhaseEndBlock,
            "Block outside of rICO period."
        );

        // Return commit phase (stage 0)
        if (_blockNumber <= this.commitPhaseEndBlock) {
            return 0;
        }

        // This is the number of blocks starting from the first stage.
        const distance = _blockNumber - (this.commitPhaseEndBlock + 1);
        // Get the stageId (1..stageCount), commitPhase is stage 0
        // e.g. distance = 5, stageBlockCount = 5, stageID = 2
        const stageID = 1 + (distance / this.stageBlockCount);

        return Math.floor(stageID);
    }

    getCurrentPrice() {
        return this.getPriceAtBlock(this.getCurrentBlockNumber());
    }

    getPriceAtBlock(_blockNumber) {
        const stage = this.getStageAtBlock(_blockNumber);
        if (stage <= this.stageCount) {
            return this.getStage(stage).tokenPrice;
        }
        return 0;
    }

    getParticipantReservedTokensAtBlock(_tokenAmount, _blockNumber, _precision = null) {

        if(_precision == null) {
            _precision = 20;
        }
        _precision = new BN(_precision);
        
        const tokenAmount = new BN(_tokenAmount);

        if(tokenAmount.gt(new BN(0))) {

            if(_blockNumber < this.buyPhaseStartBlock) {
                // before buy phase.. return full amount
                return tokenAmount;
            } else if(_blockNumber <= this.buyPhaseEndBlock) {
                // in buy phase

                const percentage = this.getUnlockPercentage(
                    _blockNumber,
                    this.buyPhaseStartBlock,
                    this.buyPhaseEndBlock,
                    _precision
                );

                const unlocked = tokenAmount.mul(percentage).div( 
                    new BN("10").pow(
                        _precision
                    )
                );

                return tokenAmount.sub(unlocked);
            }
            // after buyPhase's end
            return new BN("0");
        }
        return new BN("0");
    }

    getUnockedTokensForBoughtAmountAtBlock(_tokenAmount, _blockNumber, precision) {
        return new BN(_tokenAmount).sub( 
            this.getParticipantReservedTokensAtBlock(
                _tokenAmount,
                _blockNumber,
                precision
            ) 
        );
    }

    committableEthAtStageForTokenBalance(_contractTokenBalance, _stage) {
        // Multiply the number of tokens held by the contract with the token price
        // at the specified stage and perform precision adjustments(div).
        return _contractTokenBalance.mul(
            this.stages[_stage].tokenPrice
        ).div(
            new BN("10").pow(new BN("18"))
        );
    }

    getStage(id) {
        return this.stages[id];
    }

    setBlockNumber(block) {
        this.block = parseInt(block, 10);
    }

    getCurrentBlockNumber() {
        return this.block;
    }

    toEth(amount) {
        return web3util.fromWei(amount, "ether");
    }

    static toEth(amount) {
        return web3util.fromWei(amount, "ether");
    }

    getOneEtherBn() {
        return etherBN;
    }

    require(statement, message) {
        if(!statement) {
            throw message;
        }
    }
}

module.exports = Validator;
