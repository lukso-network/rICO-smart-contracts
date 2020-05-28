const web3 = require("web3");
let BN = web3.utils.BN;

const tokenDecimals = 18;
const ether = 1000000000000000000;      // 1 ether in wei
const etherBN = new BN(ether.toString());

//bytes32 constant private _TOKENS_RECIPIENT_INTERFACE_HASH =
//0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b

/*
 * Submitted for verification at etherscan.io on 2020-05-25
 *
 *   ________            ____                           _ __    __        ______________
 *  /_  __/ /_  ___     / __ \___ _   _____  __________(_) /_  / /__     /  _/ ____/ __ \
 *   / / / __ \/ _ \   / /_/ / _ \ | / / _ \/ ___/ ___/ / __ \/ / _ \    / // /   / / / /
 *  / / / / / /  __/  / _, _/  __/ |/ /  __/ /  (__  ) / /_/ / /  __/  _/ // /___/ /_/ /
 * /_/ /_/ /_/\___/  /_/ |_|\___/|___/\___/_/  /____/_/_.___/_/\___/  /___/\____/\____/
 *
 *
 * source      https://github.com/lukso-network/rICO-smart-contracts
 * @name       Reversible ICO
 * @author     Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@binarzone.com>, Marjorie Hernandez <marjorie@lukso.io>
 * @license    Apache 2.0
 *
 * Readme more about it here https://medium.com/lukso/rico-the-reversible-ico-5392bf64318b
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
        networkGasPrice: 40000000000, // 10 gwei
        deployToken: false,
        deployrICO: true,
        keys: {
            // valid with ETH on rinkeby ( no 0x )
            deployerPrivateKey: "AAABBBB....", // no 0x
            // set to PK to null, and tokenGenesisAddress to a valid one if you want to manually transfer tokens from tokenGenesisAddress to rICO
            tokenGenesisPrivateKey: null,
        },
        address: {
            tokenContractAddress: '0xA8b919680258d369114910511cc87595aec0be6D', // REQUIRE IF deployToken == false !!
            // when using `npm run deploy-test`, ganache accounts are used instead of these here
            projectAddress: "0xD52306Eabc2BE4e2dC8Fbd1f929aC73008430f3F",
            tokenGenesisAddress: '0xC67810de5816917F1DBc618c084B82441921F55f', // set to PK to null, if you want to manually transfer tokens from project to rICO
            freezerAddress: '0x6109dcd72b8a2485A5b3Ac4E76965159e9893aB7', // rinkeby: "0x4b302ceFF48E2212a761086667195149b3861230",
            rescuerAddress: '0x87bD0fBD87C846e37193f79E7BF97b6d3AF625e3', // rinkeby: "0x29D869F89f3DC193C17EeE8D2656e69A257E01E9",
            whitelistingAddress: '0x774C67dA65373c9922c528E232B718174dFCa116', // rinkeby: "0xc9e82F820F69C67263c0abd220f31bD0Cf73D28E",
        },
        rico: {
            startBlock: 10147598, // 2020-05-27 14:00:00 on mainnet
            blocksPerDay: 6400,
            commitPhaseDays: 22,
            stageCount: 8,
            stageDays: 31,
            commitPhasePrice: ether * 0.002,        // uint256 _commitPhasePrice in wei
            stagePriceIncrease: ether * 0.0002      // uint256 _StagePriceIncrease in wei
        },
        token: {
            name: "LUKSO Token",
            symbol: "LYXe",
            decimals: tokenDecimals,
            supply: new BN(100000000) // 100 million LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
            sale: new BN(10000000) // 1M LYX
                .mul(new BN("10").pow(new BN( tokenDecimals ))),
        }
    }
};


// RINKEBY deployment
// rICO: 0x706ce3A2D48F73A879CCC5aB648d3f578BDF34F8
// Token: 0xA0610e2BE6A66f7AbA8E979a83C46ae9941D7F81
// ----------------------------------------------------------------
//     Step 3 - Deploy contracts
// ----------------------------------------------------------------
//     - Contract deployed: ReversibleICOToken
// Hash:             0x18f996b63215b92c376aa6074b42b8733436a2ca1bc4ce2d23cf8481579a49c5
// Gas used:         2542617
// Contract Address: 0xA0610e2BE6A66f7AbA8E979a83C46ae9941D7F81
// - Contract deployed: ReversibleICO
// Hash:             0xaae3a662767e7dac5674430025fdd9e759866514cea210d0a1a1a1b801f0797f
// Gas used:         3252326
// Contract Address: 0x706ce3A2D48F73A879CCC5aB648d3f578BDF34F8
// ----------------------------------------------------------------
//     Step 4 - Initialise Token Contract
// ----------------------------------------------------------------
//     - Settings:
// - ReversibleICOAddress: 0x706ce3A2D48F73A879CCC5aB648d3f578BDF34F8
// - freezerAddress:       0x4b302ceFF48E2212a761086667195149b3861230
// - rescuerAddress:       0x29D869F89f3DC193C17EeE8D2656e69A257E01E9
// - projectAddress:       0x01d934D2D2D8a4AF45532B330e67610E7697eca6
// - initialSupply:        100000000 tokens
// - Caller: 0x52b333c238Bf73888fDDe266E9D2A39B75752807
// - Hash: 0x536bed6ab05f5230bb423d4a536651cf49e747714b350f307b5af1541e3f6cc1
// - Gas used: 141426
// - Done
// ----------------------------------------------------------------
//     Step 5 - Initialise rICO Contract
// ----------------------------------------------------------------
//     - Settings:
// - TokenContractAddress:     0xA0610e2BE6A66f7AbA8E979a83C46ae9941D7F81
// - whitelistingAddress       0xc9e82F820F69C67263c0abd220f31bD0Cf73D28E
// - freezerAddress:           0x4b302ceFF48E2212a761086667195149b3861230
// - rescuerAddress:           0x29D869F89f3DC193C17EeE8D2656e69A257E01E9
// - projectAddress:           0x01d934D2D2D8a4AF45532B330e67610E7697eca6
// - commitPhaseStartBlock:    6445769
// - commitPhaseBlockCount:    23040
// - commitPhasePrice:         1000000000000000 wei
// - stagePriceIncrease:       500000000000000 wei
// - stageCount:               8
// - stageBlockCount:          5760
// - Caller: 0x52b333c238Bf73888fDDe266E9D2A39B75752807
// - Hash: 0x70c428aad19e1aa9f311208e617cf9a42220a3cc4fa24deb9395bf25b50fba33
// - Gas used: 704054