async function runSetup() {

    const Web3 = require("web3");
    let web3Instance, network;

    if (process.argv[3] == "coverage") {
        network = process.argv[3];
    } else {
        // Network name we're using to run the tests
        network = process.argv[4];
    }

    if (!network || network === "js") {
        network = "development";
    }

    // load truffle config
    const truffleConfig = require("../truffle-config.js");

    let accounts;
    let networkConfig = truffleConfig.networks[network];

    if (truffleConfig.networks[network]) {
        web3Instance = await new Web3(truffleConfig.networks[network].provider());
        if(process.argv[4] === "js") {
            accounts = [];
        } else {
            accounts = await web3Instance.eth.getAccounts();
        }
    } else {
        console.log(
        "Specified Network [" + network + "] not found in truffle-config."
        );
        process.exit(1);
    }

    // global required by openzeppelin-test-helpers
    global.web3 = web3Instance;

    const {
        BN,
        constants,
        expectRevert,
        expectEvent
    } = require("openzeppelin-test-helpers");

    // const BN = require("bignumber.js");
    const { MAX_UINT256 } = constants;
    const web3util = require("web3-utils");
    const Table = require("cli-table");
    const utils = require("./solc_tests/helpers/utils");
    const safeUtils = require("./solc_tests/helpers/safeUtils");
    const { assert, expect } = require("chai");
    const { assertInvalidOpcode } = require("./solc_tests/helpers/assertThrow");

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 1 - Setting up helpers and globals \n" +
        "  ----------------------------------------------------------------"
    );

    const ether = 1000000000000000000; // 1 ether in wei
    const etherBN = new BN(ether.toString());

    const solidity = {
        ether: ether,
        etherBN: etherBN,
        gwei: 1000000000
    };

    // https://github.com/0xjac/ERC1820
    const { ERC1820 } = require("./ERC1820.js");

    // edit this to change "funds supplier address"
    ERC1820.FundsSupplierAddress = accounts[10];
    


    function toIntVal(val) {
        return parseInt(val);
    }

    // https://web3js.readthedocs.io/en/v1.2.1/web3.html#extend
    web3.extend({
        property: "evm",
        methods: [
        {
            name: "snapshot",
            call: "evm_snapshot",
            params: 0,
            outputFormatter: toIntVal
        },
        {
            name: "revert",
            call: "evm_revert",
            params: 1,
            inputFormatter: [toIntVal]
        }
        ]
    });

    const rICOConfig = require("./rICO-config-tests.js");

    const setup = {
        network: network,
        globals: {},
        helpers: {
            networkName: network,
            networkConfig: networkConfig,
            assertInvalidOpcode: assertInvalidOpcode,
            utils: utils,
            safeUtils: safeUtils,
            web3util: web3util,
            web3: web3,
            web3Instance: web3Instance,
            Table: Table,
            BN: BN,
            constants: constants,
            expectRevert: expectRevert,
            expectEvent: expectEvent,
            MAX_UINT256: MAX_UINT256,
            expect: expect,
            assert: assert,
            solidity: solidity,
            ERC1820: ERC1820,
            addresses: {
                ERC1820: ERC1820.ContractAddress,
                Token: null,
                Rico: null
            }
        },
        settings: rICOConfig.settings
    };

    global.setup = setup;
    global.helpers = setup.helpers;
    global.accounts = accounts;
    global.assert = assert;

    return global;
}

module.exports = {
    runSetup: runSetup    
}
