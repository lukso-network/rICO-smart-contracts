const {BN} = require("openzeppelin-test-helpers");

const tokenDecimals = 18;
const ether = 1000000000000000000;      // 1 ether in wei
const etherBN = new BN(ether.toString());

module.exports = {
    settings: {
        rico: {
            startBlockDelay: 6450,                   // currentBlock number + delay for commitPhaseStartBlock
            // startBlock: 6450,
            buyPhaseStartBlock: 6490,
            buyPhaseEndBlock: 6590, // 100 blocks later
            stageCount: 20,
            stageLimitAmountIncrease: ether * 500000, // 500k
            commitPhasePrice: ether * 0.002,        // uint256 _initialPrice in wei
            stagePriceIncrease: ether * 0.00007,
        },
        token: {
            name: "LUKSO Token",
            symbol: "LYXe",
            decimals: tokenDecimals,
            supply: new BN(100) // 100 milion
                .mul( new BN("10").pow(new BN("6")) )
                .mul(
                    // 10^18 to account for decimals
                    new BN("10").pow(new BN( tokenDecimals ))
                ),
            sale: new BN(15) // 15 milion
                .mul( new BN("10").pow(new BN("6")) )
                .mul(
                    // 10^18 to account for decimals
                    new BN("10").pow(new BN( tokenDecimals ))
                )
        }
    }
}