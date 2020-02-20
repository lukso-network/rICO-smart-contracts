global.helpers = setup.helpers;
global.BN = helpers.BN;
global.MAX_UINT256 = helpers.MAX_UINT256;
global.expect = helpers.expect

global.deployerAddress = accounts[0];
global.whitelistControllerAddress = accounts[1];

global.holder = accounts[10];
global.projectWalletAddress = holder;

global.participant_1 = accounts[4];
global.participant_2 = accounts[5];
global.participant_3 = accounts[6];
global.participant_4 = accounts[7];
global.participant_5 = accounts[8];
global.participant_6 = accounts[9];


global.ApplicationEventTypes = {
    NOT_SET:0,          // will match default value of a mapping result
    CONTRIBUTION_NEW:1,
    CONTRIBUTION_CANCEL:2,
    PARTICIPANT_CANCEL:3,
    COMMITMENT_ACCEPTED:4,
    WHITELIST_APPROVE:5,
    WHITELIST_REJECT:6,
    PROJECT_WITHDRAW:7
}

global.TransferTypes = {
    NOT_SET:0,
    AUTOMATIC_REFUND:1,
    WHITELIST_REJECT:2,
    PARTICIPANT_CANCEL:3,
    PARTICIPANT_WITHDRAW:4,
    PROJECT_WITHDRAW:5
}

global.snapshotsEnabled = true;

const RICOSettings = {
    block:              100,
    blocksPerDay:       6450,
    commitPhaseDays:    22,
    stageCount:         12,
    stageDays:          30,
    saleSupply:         setup.settings.token.sale.toString(),
    salePriceIncrease:  helpers.solidity.ether * 0.002,
};

const validatorHelper = require("../../../js_validator_tests/assets/validator.js");

module.exports = {
    RICOSettings,
    validatorHelper
};
