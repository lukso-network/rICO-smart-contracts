const {BN} = require("openzeppelin-test-helpers");

const tokenDecimals = 18;
const ether = 1000000000000000000;      // 1 ether in wei
const etherBN = new BN(ether.toString());

module.exports = {
    settings: {
        provider: "https://rinkeby.infura.io/v3/69617d2389bc4d508550e9a81e47fb3c",
        networkGasPrice: 10000000000, // 10 gwei
        keys: {
            // valid with ETH on rinkeby ( no 0x )
            deployerPrivateKey: "5EE0CA06B0BFAB9BCFC8AB8BB6CABCBA4DA285F10611A3D17FBDD68A20B4EFB0", // 0x52b333c238bf73888fdde266e9d2a39b75752807
            // set to PK to null, and address to valid one if you want to manually transfer tokens from project to rICO
            projectPrivateKey: "499B1E447D0F0EB602CC2D73A2C84378A3248DDED868B80C421CE4C55A26103B",
        },
        address: {
            liveProjectAddress: null, // set to PK to null, and address to valid one if you want to manually transfer tokens from project to rICO
            liveFreezerAddress: "0x0eCDDb6BdF53Bf36A25BfF59756ed7c1DE2937F5",
            liveRescuerAddress: "0x7839919B879250910E8646f3B46EBbCA8438bE32",
            liveWhitelistingAddress: "0x1c4476B864c4a848374a65ce2c09eFD56163faFA",
        },
        rico: {
            startBlockDelay: 6445769, // 2020-05-07 11:00:00 on rinkeby
            blocksPerDay: 5760,
            commitPhaseDays: 4,
            stageCount: 8,
            stageDays: 1,
            commitPhasePrice: ether * 0.001,        // uint256 _commitPhasePrice in wei
            stagePriceIncrease: ether * 0.0005      // uint256 _StagePriceIncrease in wei
        },
        token: {
            name: "LYXe Token",
            symbol: "LYXe",
            decimals: tokenDecimals,
            supply: new BN(100000000) // 100 million LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
            sale: new BN(200000) // 200k LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
        }
    }
};