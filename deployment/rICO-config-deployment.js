const web3 = require("web3");
let BN = web3.utils.BN;

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
            projectPrivateKey: null, //"499B1E447D0F0EB602CC2D73A2C84378A3248DDED868B80C421CE4C55A26103B",
        },
        address: {
            liveProjectAddress: "0x01d934D2D2D8a4AF45532B330e67610E7697eca6",//null, // set to PK to null, and address to valid one if you want to manually transfer tokens from project to rICO
            liveFreezerAddress: "0x4b302ceFF48E2212a761086667195149b3861230",
            liveRescuerAddress: "0x29D869F89f3DC193C17EeE8D2656e69A257E01E9",
            liveWhitelistingAddress: "0xc9e82F820F69C67263c0abd220f31bD0Cf73D28E", // 499B1E447D0F0EB602CC2D73A2C84378A3248DDED868B80C421CE4C55A26103B
        },
        rico: {
            startBlock: 6445769, // 2020-05-07 11:00:00 on rinkeby
            blocksPerDay: 5760,
            commitPhaseDays: 4,
            stageCount: 8,
            stageDays: 1,
            commitPhasePrice: ether * 0.001,        // uint256 _commitPhasePrice in wei
            stagePriceIncrease: ether * 0.0005      // uint256 _StagePriceIncrease in wei
        },
        token: {
            name: "LUKSO Token",
            symbol: "LYXe",
            decimals: tokenDecimals,
            supply: new BN(100000000) // 100 million LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
            sale: new BN(200000) // 200k LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
        }
    }
};