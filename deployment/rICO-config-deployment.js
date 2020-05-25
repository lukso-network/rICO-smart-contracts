const web3 = require("web3");
let BN = web3.utils.BN;

const tokenDecimals = 18;
const ether = 1000000000000000000;      // 1 ether in wei
const etherBN = new BN(ether.toString());

//bytes32 constant private _TOKENS_RECIPIENT_INTERFACE_HASH =
//0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b

/**
 *Submitted for verification at Etherscan.io on 2020-05-13
 */
/*
 * source        https://github.com/lukso-network/rICO-smart-contracts
 * @name       LUKSO Token
 * @author      Micky Socaci <micky@binarzone.com>, Fabian Vogelsteller <@frozeman>
 * @license     Apachae 2.0
 */

/**
 * @dev Implementation of the `IERC777` interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using `_mint`.
 *
 * Support for ERC20 is included in this contract, as specified by the EIP: both
 * the ERC777 and ERC20 interfaces can be safely used when interacting with it.
 * Both `IERC777.Sent` and `IERC20.Transfer` events are emitted on token
 * movements.
 *
 * Additionally, the `granularity` value is hard-coded to `1`, meaning that there
 * are no special restrictions in the amount of tokens that created, moved, or
 * destroyed. This makes integration with ERC20 applications seamless.
 */

module.exports = {
    settings: {
        provider: "https://mainnet.infura.io/v3/69617d2389bc4d508550e9a81e47fb3c",
        networkGasPrice: 30000000000, // 10 gwei
        deployToken: false,
        deployrICO: true,
        keys: {
            // valid with ETH on rinkeby ( no 0x )
            deployerPrivateKey: "5EE0CA06B0BFAB9BCFC8AB8BB6CABCBA4DA285F10611A3D17FBDD68A20B4EFB0", // // 5EE0CA06B0BFAB9BCFC8AB8BB6CABCBA4DA285F10611A3D17FBDD68A20B4EFB0 // 0x52b333c238bf73888fdde266e9d2a39b75752807
            // set to PK to null, and tokenGenesisAddress to a valid one if you want to manually transfer tokens from tokenGenesisAddress to rICO
            tokenGenesisPrivateKey: null, //"499B1E447D0F0EB602CC2D73A2C84378A3248DDED868B80C421CE4C55A26103B",
        },
        address: {
            projectAddress: "0xD52306Eabc2BE4e2dC8Fbd1f929aC73008430f3F",
            tokenGenesisAddress: '0xC67810de5816917F1DBc618c084B82441921F55f', // set to PK to null, if you want to manually transfer tokens from project to rICO
            freezerAddress: '0x6109dcd72b8a2485A5b3Ac4E76965159e9893aB7', // rinkeby: "0x4b302ceFF48E2212a761086667195149b3861230",
            rescuerAddress: '0x87bD0fBD87C846e37193f79E7BF97b6d3AF625e3', // rinkeby: "0x29D869F89f3DC193C17EeE8D2656e69A257E01E9",
            whitelistingAddress: '0x774C67dA65373c9922c528E232B718174dFCa116', // rinkeby: "0xc9e82F820F69C67263c0abd220f31bD0Cf73D28E", // 499B1E447D0F0EB602CC2D73A2C84378A3248DDED868B80C421CE4C55A26103B
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