const {BN} = require("openzeppelin-test-helpers");

const tokenDecimals = 18;
const ether = 1000000000000000000;      // 1 ether in wei
const etherBN = new BN(ether.toString());

module.exports = {
    settings: {
        rico: {
            startBlockDelay: 6450,                   // currentBlock number + delay for commitPhaseStartBlock
            blocksPerDay: 6450,
            commitPhaseDays: 22,
            stageCount: 12,
            stageDays: 30,                           
            commitPhasePrice: ether * 0.002,        // uint256 _commitPhasePrice in wei
            stagePriceIncrease: ether * 0.0001      // uint256 _StagePriceIncrease in wei
        },
        token: {
            name: "LYXe Token",
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