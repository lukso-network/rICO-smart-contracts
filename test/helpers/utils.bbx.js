const web3util      = require('web3-utils');
const dateFormat    = require('dateformat');
/*
 ascii escape codes

 Black        0;30     Dark Gray     1;30
 Red          0;31     Light Red     1;31
 Green        0;32     Light Green   1;32
 Brown/Orange 0;33     Yellow        1;33
 Blue         0;34     Light Blue    1;34
 Purple       0;35     Light Purple  1;35
 Cyan         0;36     Light Cyan    1;36
 Light Gray   0;37     White         1;37

 */

let colors = {
    none:         "\x1B[0m",
    black:        '\x1B[0;30m',
    dark_gray:    '\x1B[1;30m',
    red:          '\x1B[0;31m',
    light_red:    '\x1B[1;31m',
    green:        '\x1B[0;32m',
    light_green:  '\x1B[1;32m',
    orange:       '\x1B[0;33m',
    yellow:       '\x1B[1;33m',
    blue:         '\x1B[0;34m',
    light_blue:   '\x1B[1;34m',
    purple:       '\x1B[0;35m',
    light_purple: '\x1B[1;35m',
    cyan:         '\x1B[0;36m',
    light_cyan:   '\x1B[1;36m',
    light_gray:   '\x1B[0;37m',
    white:        '\x1B[1;37m'
};

let logPre = "      ";


let FundingStageStates = [
    { key: 0,  name: "NONE"},
    { key: 1,  name: "NEW"},
    { key: 2,  name: "IN_PROGRESS"},
    { key: 3,  name: "FINAL"}
];

let FundingEntityStates = [
    { key: 0,  name: "NONE"},
    { key: 1,  name: "NEW"},
    { key: 2,  name: "WAITING"},
    { key: 3,  name: "IN_PROGRESS"},
    { key: 4,  name: "COOLDOWN"},
    { key: 5,  name: "FUNDING_ENDED"},
    { key: 6,  name: "FAILED"},
    { key: 7,  name: "FAILED_FINAL"},
    { key: 8,  name: "SUCCESSFUL"},
    { key: 9,  name: "SUCCESSFUL_FINAL"},
];

let FundingMethodIds = [
    "NONE",
    "DIRECT_ONLY",
    "MILESTONE_ONLY",
    "DIRECT_AND_MILESTONE"
];

let StateArray = {
    "Funding": [
        { key: 0,  name: "NONE"},
        { key: 1,  name: "NEW"},
        { key: 2,  name: "WAITING"},
        { key: 3,  name: "IN_PROGRESS"},
        { key: 4,  name: "COOLDOWN"},
        { key: 5,  name: "FUNDING_ENDED"},
        { key: 6,  name: "FAILED"},
        { key: 7,  name: "FAILED_FINAL"},
        { key: 8,  name: "SUCCESSFUL"},
        { key: 9,  name: "SUCCESSFUL_FINAL"},
    ],
    "FundingManager": [
        {key: 0, name: "NONE"},
        {key: 1, name: "NEW"},
        {key: 2, name: "WAITING"},
        {key: 10, name: "FUNDING_FAILED_START"},
        {key: 11, name: "FUNDING_FAILED_PROGRESS"},
        {key: 12, name: "FUNDING_FAILED_DONE"},
        {key: 20, name: "FUNDING_SUCCESSFUL_START"},
        {key: 21, name: "FUNDING_SUCCESSFUL_PROGRESS"},
        {key: 22, name: "FUNDING_SUCCESSFUL_DONE"},
        {key: 25, name: "FUNDING_SUCCESSFUL_ALLOCATE"},

        {key: 30, name: "MILESTONE_PROCESS_START"},
        {key: 31, name: "MILESTONE_PROCESS_PROGRESS"},
        {key: 32, name: "MILESTONE_PROCESS_DONE"},
        {key: 40, name: "EMERGENCY_PROCESS_START"},
        {key: 41, name: "EMERGENCY_PROCESS_PROGRESS"},
        {key: 42, name: "EMERGENCY_PROCESS_DONE"},
        {key: 100, name: "COMPLETE_PROCESS_START"},
        {key: 101, name: "COMPLETE_PROCESS_PROGRESS"},
        {key: 102, name: "COMPLETE_PROCESS_DONE"},
    ],
    "Milestones": [
        {key: 0, name: "NONE"},
        {key: 1, name: "NEW"},
        {key: 2, name: "WAITING"},
        {key: 5, name: "IN_DEVELOPMENT"},

        {key: 10, name: "WAITING_MEETING_TIME"},
        {key: 11, name: "DEADLINE_MEETING_TIME_YES"},
        {key: 12, name: "DEADLINE_MEETING_TIME_FAILED"},

        {key: 20, name: "VOTING_IN_PROGRESS"},
        {key: 22, name: "VOTING_ENDED_YES"},
        {key: 23, name: "VOTING_ENDED_NO"},
        {key: 25, name: "VOTING_ENDED_NO_FINAL"},
        {key: 30, name: "VOTING_FUNDS_PROCESSED"},
        {key: 50, name: "FINAL"},

        {key: 99, name: "CASHBACK_OWNER_MIA"},
        {key: 250, name: "DEVELOPMENT_COMPLETE"},
    ],
    "ApplicationEntity": [
        {key: 0, name: "NONE"},
        {key: 1, name: "NEW"},
        {key: 2, name: "WAITING"},
        {key: 3, name: "IN_FUNDING"},

        {key: 5, name: "IN_DEVELOPMENT"},
        {key: 50, name: "IN_CODE_UPGRADE"},
        {key: 100, name: "UPGRADED"},
        {key: 150, name: "IN_GLOBAL_CASHBACK"},
        {key: 200, name: "LOCKED"},
        {key: 250, name: "DEVELOPMENT_COMPLETE"},
    ],
};


let RecordArray = {
    "Funding": [
        { key: 0,  name: "NONE"},
        { key: 1,  name: "NEW"},
        { key: 2,  name: "IN_PROGRESS"},
        { key: 3,  name: "FINAL"}
    ],
    "FundingManager": [],
    "Milestones":[
        { key: 0,  name: "NONE"},
        { key: 1,  name: "NEW"},
        { key: 2,  name: "IN_PROGRESS"},
        { key: 3,  name: "FINAL"}
    ],
    "Proposals":[
        { key: 0,  name: "NONE"},
        { key: 1,  name: "NEW"},
        { key: 2,  name: "ACCEPTING_VOTES"},
        { key: 3,  name: "VOTING_ENDED"},
        { key: 10,  name: "VOTING_RESULT_YES"},
        { key: 20,  name: "VOTING_RESULT_NO"},
    ],
};

let ActionArray = {
    "Proposals":[
        { key: 1,   name: "MILESTONE_DEADLINE"},
        { key: 2,   name: "MILESTONE_POSTPONING"},
        { key: 60,  name: "EMERGENCY_FUND_RELEASE"},
        { key: 50,  name: "IN_DEVELOPMENT_CODE_UPGRADE"},
        { key: 51,  name: "AFTER_COMPLETE_CODE_UPGRADE"},
        { key: 75,  name: "PROJECT_DELISTING"},
    ],
};


module.exports = {
    hasEvent(tx, eventNamePlusReturn) {
        let eventSig = web3util.sha3(eventNamePlusReturn);
        return tx.receipt.logs.filter(x => x.topics[0] === eventSig);
    },
    getEventArgs(tx) {
        // tx.receipt.logs[0].topics[2];
    },
    getProposalRequestId(receipt) {
        return web3util.toDecimal( receipt[0].topics[2] );
    },
    getProposalEventData(receipt) {

        let eventMapping = [
            {
                name: "EventAddVoteIntoResult(uint256,bool,uint256)",
                sha: web3util.sha3("EventAddVoteIntoResult(uint256,bool,uint256)"),
                type: 1
            },
            {
                name: "EventProcessVoteTotals(uint256,uint256,uint256)",
                sha: web3util.sha3("EventProcessVoteTotals(uint256,uint256,uint256)"),
                type: 2
            }
        ];

        let result = [];
        for(let i = 0; i < receipt.logs.length; i++)
        {
            let event = receipt.logs[i];
            let current = eventMapping.filter(x => x.sha === event.topics[0])[0];

            if(current.type === 2) {
                console.log(
                    "EventProcessVoteTotals( ",
                    web3util.toDecimal( event.topics[1] ), ",",
                    web3util.toDecimal( event.topics[2] ), ",",
                    web3util.toDecimal( event.topics[3] ),
                    " )"
                );
            }

            else if(current.type === 1) {

                console.log(
                    "EventAddVoteIntoResult( ",
                    web3util.toDecimal( event.topics[1] ), ",",
                    web3util.toDecimal( event.topics[2] ), ",",
                    web3util.fromWei(event.topics[3], "ether"),
                    " )"
                );
            }
        }

        return result;
    },
    colors,
    toLog( what ) {
        console.log(colors.white, what, colors.none);
    },
    toDate(seconds) {
        return dateFormat(parseInt(seconds) * 1000, "yyyy-mm-dd, HH:MM:ss TT");
    },
    topicToAddress(hexString) {
        return hexString.replace("0x000000000000000000000000", "0x");
    },
    toDateFromHex(hex) {
        return this.toDate( web3util.toDecimal(hex) );
    },
    getBalance(artifacts, address) {
        let solAccUtils = artifacts.require('SolidityAccountUtils');
        return solAccUtils.new().then(function(instance){ return instance.getBalance.call(address) });
    },
    transferTo(artifacts, _val, _from, _to) {
        let solAccUtils = artifacts.require('SolidityAccountUtils');
        return solAccUtils.new().then(function(instance){ return instance.transferTo(_to, {value: _val, from: _from}) });
    },

    /*
        This is useless for testing.. time is going to really depend on testrpc internal time,
        and we can't do anything about going back to test multiple things.

        instead we mock time in both ApplicationEntity and Assets
    */
    /*
    async timeTravelTo(helpers, time) {
        console.log("timeTravelTo: ", helpers.utils.toDate(time) );
        let now = new Date().getTime() / 1000; // seconds
        let difference = parseInt(time).toFixed(0) - parseInt(now).toFixed(0);
        if(difference > 0) {
            return new Promise((resolve, reject) => {
                helpers.web3.currentProvider.sendAsync({
                    jsonrpc: "2.0",
                    method: "evm_increaseTime",
                    params: [difference],
                    id: new Date().getTime()
                }, (err, result) => {
                    if (err) {
                        return reject(err)
                    }
                    return resolve(result)
                });
            })
        } else {
            return ;
        }
    },
    */
    async showContractDebug(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        // purchaseRecords
        let RecordsNum = await assetContract.purchaseRecordsNum.call();

        helpers.utils.toLog(
            logPre + "Puchase Record Count: "+
            helpers.utils.colors.orange+
            RecordsNum
        );

        if (RecordsNum > 0) {

            for (let i = 1; i <= RecordsNum; i++) {
                let Record = await assetContract.purchaseRecords.call(i);
                helpers.utils.toLog(logPre + "Record ID:      " + i);         // uint16
                helpers.utils.toLog(logPre + "  unix_time:      " + helpers.utils.toDateFromHex(Record[0]));        // uint256
                helpers.utils.toLog(logPre + "  payment_method: " + helpers.web3util.toDecimal(Record[1]));         // uint8
                helpers.utils.toLog(logPre + "  amount:         " + helpers.web3util.fromWei(Record[2], "ether"));  // uint256
                helpers.utils.toLog(logPre + "  index:          " + helpers.web3util.toDecimal(Record[3]));         // uint16
                helpers.utils.toLog("");
            }
        }
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let amountDirect = await assetContract.amount_direct.call();
        let amountDirectInEther = helpers.web3util.fromWei(amountDirect, "ether");
        helpers.utils.toLog(
            logPre + "Direct balance:      "+amountDirectInEther
        );

        let amountMilestone = await assetContract.amount_milestone.call();
        let amountMilestoneInEther = helpers.web3util.fromWei(amountMilestone, "ether");
        helpers.utils.toLog(
            logPre + "Milestone balance:   "+amountMilestoneInEther
        );

        await showContractBalance(helpers, assetContract);

        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );
        helpers.utils.toLog("");
    },
    async showAccountBalances(helpers, accounts) {
        helpers.utils.toLog(logPre + " TestRPC Balances: ");
        for (let i = 0; i < accounts.length; i++) {
            let balance = await helpers.utils.getBalance(helpers.artifacts, accounts[i]);
            helpers.utils.toLog(
                logPre +
                "["+i+"] "+accounts[i]+ ": "+ helpers.web3util.fromWei(balance, "ether")
            );
        }
    },
    async showContractBalance(helpers, contract) {
        helpers.utils.toLog("\n" + logPre + " Contract Balances: ");
        let balance = await helpers.utils.getBalance(helpers.artifacts, contract.address.toString());
        helpers.utils.toLog(
            logPre +
            contract.address.toString()+ ": "+ helpers.web3util.fromWei(balance, "ether")
        );
    },
    async showGasUsage(helpers, tx, name) {
        helpers.utils.toLog(name + " GAS USAGE: " +
            helpers.utils.colors.purple +
            tx.receipt.cumulativeGasUsed
        );
    },
    async getGasPrice(helpers) {
        let stub = await helpers.getContract("EmptyStub");
        return stub.class_defaults.gasPrice;
    },
    async getGasUsage(helpers, tx, name) {
        return(name + "GAS USAGE: " +
            helpers.utils.colors.purple +
            tx.receipt.cumulativeGasUsed
        );
    },

    async showFundingState(helpers, assetContract) {
        await helpers.utils.showDebugSettings(helpers, assetContract);
        await helpers.utils.showDebugFundingStages(helpers, assetContract);
        // await helpers.utils.showDebugFundingStageStateRequiredChanges(helpers, assetContract);
        await helpers.utils.showDebugRequiredStateChanges(helpers, assetContract);

    },
    async showCurrentState(helpers, assetContract) {
        await helpers.utils.showGeneralRequiredStateChanges(helpers, assetContract);
    },

    async showApplicationAssetTable(helpers, TestBuilder) {

        // console.log("Application Entity Asset Setup Table: ")
        let ApplicationEntity = await TestBuilder.getDeployedByName("ApplicationEntity");

        let table = new helpers.Table({
            head: ["Name", "Initialized", "Settings Locked"],
            colWidths: [20, 15, 15]
        });

        let AssetCollectionNum = await ApplicationEntity.AssetCollectionNum.call();

        for (let i = 0; i < AssetCollectionNum.toString(); i++) {

            let assetNameBytes = await ApplicationEntity.AssetCollectionIdToName.call(i);
            let assetName = await helpers.web3util.toUtf8(assetNameBytes);

            let object = await TestBuilder.getDeployedByName(assetName);

            let initialized = await object._initialized.call();
            let settingsApplied = await object._settingsApplied.call();


            table.push([
                    assetName,
                    initialized.toString(),
                    settingsApplied.toString(),
                ]
            );
        }

        console.log(table.toString());
        // console.log("");



    },
    async showAllStates(helpers, TestBuilder) {

        // console.log("Application Entity Asset State Table: ")

        let ApplicationEntity = await TestBuilder.getDeployedByName("ApplicationEntity");

        let Funding = await TestBuilder.getDeployedByName("Funding");
        let FundingManager = await TestBuilder.getDeployedByName("FundingManager");
        let Milestones = await TestBuilder.getDeployedByName("Milestones");
        let Proposals = await TestBuilder.getDeployedByName("Proposals");

        let table = new helpers.Table({
            head: ["Name", "CHGS", "Current", "Required", "Rec Cur", "Rec Req", "Extra 1", "Extra 2"],
            colWidths: [20, 7, 32, 32, 20, 20, 14, 10]
        });

        table.push(await helpers.utils.getApplicationRequiredStateChanges( helpers, ApplicationEntity) );
        table.push(await helpers.utils.getOneLineRequiredStateChanges( helpers, Funding) );
        table.push(await helpers.utils.getOneLineRequiredStateChanges( helpers, FundingManager) );
        table.push(await helpers.utils.getOneLineRequiredStateChanges( helpers, Milestones) );
        table.push(await helpers.utils.getOneLineRequiredStateChanges( helpers, Proposals) );

        return table.toString();
    },

    async getOneLineRequiredStateChanges(helpers, assetContract) {

        let contractTimeStamp = await assetContract.getTimestamp.call();
        let assetName = await assetContract.assetName.call();
        let contractType = await helpers.web3util.toUtf8(assetName);

        let logLine = "";
        let logColor = helpers.utils.colors.white;
        let color;

        let cols = [];

        cols.push(contractType);

        let reqChanges = await assetContract.getRequiredStateChanges.call();
        let hasChanges = await assetContract.hasRequiredStateChanges.call();

        if (hasChanges.toString() === "false") {
            color = helpers.utils.colors.green;
        } else {
            color = helpers.utils.colors.red;
        }

        cols.push(color+hasChanges.toString());

        if(contractType === "Funding" || contractType === "Milestones" ) {


            let CurrentRecordState = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[0]));
            let RecordStateRequired = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[1]));
            let EntityStateRequired = helpers.utils.getEntityStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[2]));

            let CurrentEntityStateReq = await assetContract.CurrentEntityState.call();
            let CurrentEntityState = await helpers.web3util.toDecimal(CurrentEntityStateReq);

            // cols.push(helpers.utils.colors.green + "[" + CurrentEntityState + "] " + helpers.utils.getEntityStateNameById(contractType, CurrentEntityState));
            cols.push(helpers.utils.colors.green + helpers.utils.getEntityStateNameById(contractType, CurrentEntityState));

            if (reqChanges[2].toString() === "0") {
                color = helpers.utils.colors.green;
            } else {
                color = helpers.utils.colors.red;
            }

            // cols.push(color + "[" + reqChanges[2].toString() + "] " + EntityStateRequired);
            cols.push(color + EntityStateRequired);

            // cols.push(helpers.utils.colors.green + "[" + reqChanges[0] + "] " + CurrentRecordState);
            cols.push(helpers.utils.colors.green + CurrentRecordState);

            color = helpers.utils.colors.red;
            let stateChangeInt = helpers.web3util.toDecimal(reqChanges[1]);
            if (stateChangeInt === 0) {
                color = helpers.utils.colors.green;
            }
            //cols.push(color + "[" + stateChangeInt + "] " + RecordStateRequired);
            cols.push(color + RecordStateRequired);


            if (contractType === "Funding") {

                let FundingStageNum = await assetContract.FundingStageNum.call();
                let currentFundingStage = await assetContract.currentFundingStage.call();

//                cols.push(logColor + "Stages: " + helpers.utils.colors.orange + FundingStageNum);
//                cols.push(logColor + "Current: " + helpers.utils.colors.orange + currentFundingStage);
                cols.push(logColor + "Rec:" + helpers.utils.colors.orange + FundingStageNum);
                cols.push(logColor + "Cur:" + helpers.utils.colors.orange + currentFundingStage);

            } else if (contractType === "Milestones") {

                let RecordNum = await assetContract.RecordNum.call();
                let currentRecord = await assetContract.currentRecord.call();

//                cols.push(logColor + "Stages: " + helpers.utils.colors.orange + RecordNum);
//                cols.push(logColor + "Current: " + helpers.utils.colors.orange + currentRecord);
                cols.push(logColor + "Rec:" + helpers.utils.colors.orange + RecordNum);
                cols.push(logColor + "Cur:" + helpers.utils.colors.orange + currentRecord);

            } else {
                cols.push("");
                cols.push("");
            }



        }
        else if(contractType === "FundingManager") {

            let CurrentEntityStateID =  helpers.web3util.toDecimal(reqChanges[0]);
            let RequiredEntityStateID = helpers.web3util.toDecimal(reqChanges[1]);

            let CurrentEntityStateName = helpers.utils.getEntityStateNameById(contractType, CurrentEntityStateID);
            let RequiredEntityStateName = helpers.utils.getEntityStateNameById(contractType, RequiredEntityStateID);

            color = helpers.utils.colors.red;
//            cols.push(helpers.utils.colors.green + "[" + CurrentEntityStateID + "] " + CurrentEntityStateName);
            cols.push(helpers.utils.colors.green + CurrentEntityStateName);

            if (RequiredEntityStateID.toString() === "0") {
                color = helpers.utils.colors.green;
            }
//            cols.push(color + "[" + RequiredEntityStateID + "] " + RequiredEntityStateName);
            cols.push(color + RequiredEntityStateName);

            let vaultNum = await assetContract.vaultNum.call();
            let lastProcessedVaultId = await assetContract.lastProcessedVaultId.call();

            cols.push("");
            cols.push("");
//            cols.push(logColor+"vaultNum: " +  helpers.utils.colors.orange +  vaultNum);
            cols.push(logColor+"VNum:" +  helpers.utils.colors.orange +  vaultNum);
//            cols.push(logColor+"Last Processed: " + helpers.utils.colors.orange + lastProcessedVaultId);
            cols.push(logColor+"Last:" + helpers.utils.colors.orange + lastProcessedVaultId);

        } else if (contractType === "Proposals") {

            // quite different from other assets. We list the ids of proposals that require processing before finalisation

            let NumberOfActiveProposals = await helpers.web3util.toDecimal(reqChanges);

            if(hasChanges === true) {

                if (NumberOfActiveProposals > 0) {

                    let ProposalIdWithChanges = [];

                    for(let i = 0; i < NumberOfActiveProposals; i++) {

                        let ActiveProposalId = await assetContract.ActiveProposalIds.call(i);
                        // let ProposalRecord = await assetContract.ProposalsById.call(ActiveProposalId);
                        let canEndVoting = await assetContract.canEndVoting(ActiveProposalId);
                        if(canEndVoting === true) {
                            ProposalIdWithChanges.push(ActiveProposalId);
                        }
                    }
                    cols.push( helpers.utils.colors.red + ProposalIdWithChanges.join(", ") );
                }
            } else {
                cols.push( helpers.utils.colors.green + "NONE" );
            }

            let RecordNum = await assetContract.RecordNum.call();

            cols.push("");
            cols.push("");
            cols.push("");
            cols.push(logColor+"Num:" + helpers.utils.colors.orange +  RecordNum);
            cols.push(logColor+"Act:" + helpers.utils.colors.orange + NumberOfActiveProposals);
        }
        return cols;
    },

    async getApplicationRequiredStateChanges(helpers, assetContract) {

        let contractTimeStamp = await assetContract.getTimestamp.call();
        let assetName = "ApplicationEntity";

        let cols = [];
        cols.push(assetName);
        let color;

        let hasChanges = await assetContract.hasRequiredStateChanges.call();
        let changes = "false";
        if(hasChanges) {
            changes = "true";
        }

        if (hasChanges === false) {
            color = helpers.utils.colors.green;
        } else {
            color = helpers.utils.colors.red;
        }
        cols.push(color+changes);

        let reqChanges = await assetContract.getRequiredStateChanges.call();

        let CurrentEntityStateID =  helpers.web3util.toDecimal(reqChanges[0]);
        let RequiredEntityStateID = helpers.web3util.toDecimal(reqChanges[1]);

        let CurrentEntityStateName = helpers.utils.getEntityStateNameById(assetName, CurrentEntityStateID);
        let RequiredEntityStateName = helpers.utils.getEntityStateNameById(assetName, RequiredEntityStateID);

//        cols.push( helpers.utils.colors.green + "[" + CurrentEntityStateID + "] " + CurrentEntityStateName );
        cols.push( helpers.utils.colors.green + CurrentEntityStateName );

        if (RequiredEntityStateID.toString() === "0") {
            color = helpers.utils.colors.green;
        } else {
            color = helpers.utils.colors.red;
        }

        // cols.push( color + "[" + RequiredEntityStateID + "] " + RequiredEntityStateName );
        cols.push( color + RequiredEntityStateName );
        cols.push("");
        cols.push("");
        cols.push( helpers.utils.toDate(contractTimeStamp) );

        let ApplicationEntityLocked = await assetContract._locked.call();
        if(ApplicationEntityLocked) {
            cols.push( "LOCKED" );
        } else {
            cols.push( "" );
        }


        return cols;
    },



    async showGeneralRequiredStateChanges(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - Required State Changes: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let contractTimeStamp = await assetContract.getTimestamp.call();
        let assetName = await assetContract.assetName.call();
        let contractType = helpers.web3util.toUtf8(assetName);


        helpers.utils.toLog(
            logPre + "Asset Name:              " + contractType
        );

        helpers.utils.toLog(
            logPre + "Contract Time and Date:  " + helpers.utils.toDate(contractTimeStamp)
        );

        let reqChanges = await assetContract.getRequiredStateChanges.call();

        if(contractType === "Funding" ) {

            let CurrentRecordState = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[0]));
            let RecordStateRequired = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[1]));
            let EntityStateRequired = helpers.utils.getEntityStateNameById(contractType,helpers.web3util.toDecimal(reqChanges[2]));

            let CurrentEntityStateReq = await assetContract.CurrentEntityState.call();
            let CurrentEntityState = helpers.web3util.toDecimal(CurrentEntityStateReq);


            let stageId = helpers.web3util.toDecimal(await assetContract.currentFundingStage.call());

            helpers.utils.toLog(
                logPre + "Current stage id:        " + stageId
            );

            helpers.utils.toLog(
                logPre + "Received RECORD state:   " +
                helpers.utils.colors.green +
                "[" + reqChanges[0] + "] " +
                CurrentRecordState
            );

            let color = helpers.utils.colors.red;

            let stateChangeInt = helpers.web3util.toDecimal(reqChanges[1]);
            if (stateChangeInt == 0) {
                color = helpers.utils.colors.green;
            }

            helpers.utils.toLog(
                logPre + "Required RECORD change:  " +
                color +
                "[" + stateChangeInt + "] " +
                RecordStateRequired
            );

            color = helpers.utils.colors.red;


            helpers.utils.toLog(
                logPre + "Current ENTITY:          " +
                helpers.utils.colors.green +
                "[" + CurrentEntityState + "] " +
                helpers.utils.getEntityStateNameById(contractType, CurrentEntityState)
            );

            if (reqChanges[2] == 0) {
                color = helpers.utils.colors.green;
            }
            helpers.utils.toLog(
                logPre + "Required ENTITY change:  " +
                color +
                "[" + reqChanges[2] + "] " +
                EntityStateRequired
            );

        } else if(contractType === "Milestones") {

            let CurrentRecordState = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[0]));
            let RecordStateRequired = helpers.utils.getRecordStateNameById(contractType, helpers.web3util.toDecimal(reqChanges[1]));
            let EntityStateRequired = helpers.utils.getEntityStateNameById(contractType,helpers.web3util.toDecimal(reqChanges[2]));

            let CurrentEntityStateReq = await assetContract.CurrentEntityState.call();
            let CurrentEntityState = helpers.web3util.toDecimal(CurrentEntityStateReq);


            let currentRecordId = helpers.web3util.toDecimal(await assetContract.currentRecord.call());

            helpers.utils.toLog(
                logPre + "Current record id:        " + currentRecordId
            );

            helpers.utils.toLog(
                logPre + "Received RECORD state:   " +
                helpers.utils.colors.green +
                "[" + reqChanges[0] + "] " +
                CurrentRecordState
            );

            let color = helpers.utils.colors.red;

            let stateChangeInt = helpers.web3util.toDecimal(reqChanges[1]);
            if (stateChangeInt == 0) {
                color = helpers.utils.colors.green;
            }

            helpers.utils.toLog(
                logPre + "Required RECORD change:  " +
                color +
                "[" + stateChangeInt + "] " +
                RecordStateRequired
            );

            color = helpers.utils.colors.red;


            helpers.utils.toLog(
                logPre + "Current ENTITY:          " +
                helpers.utils.colors.green +
                "[" + CurrentEntityState + "] " +
                helpers.utils.getEntityStateNameById(contractType, CurrentEntityState)
            );

            if (reqChanges[2] == 0) {
                color = helpers.utils.colors.green;
            }
            helpers.utils.toLog(
                logPre + "Required ENTITY change:  " +
                color +
                "[" + reqChanges[2] + "] " +
                EntityStateRequired
            );


        } else if(contractType === "FundingManager") {


            let vaultNum = await assetContract.vaultNum.call();
            let lastProcessedVaultId = await assetContract.lastProcessedVaultId.call();
            let hasRequiredStateChanges = await assetContract.hasRequiredStateChanges.call();

            helpers.utils.toLog(
                logPre + "Number of Vaults:        " +
                helpers.utils.colors.orange +
                vaultNum
            );
            helpers.utils.toLog(
                logPre + "Last Processed Vault ID  " +
                helpers.utils.colors.orange +
                lastProcessedVaultId
            );
            helpers.utils.toLog(
                logPre + "Required State Changes   " +
                helpers.utils.colors.green +
                hasRequiredStateChanges
            );


            let CurrentEntityStateID =  helpers.web3util.toDecimal(reqChanges[0]);
            let RequiredEntityStateID = helpers.web3util.toDecimal(reqChanges[1]);

            let CurrentEntityStateName = helpers.utils.getEntityStateNameById(contractType, CurrentEntityStateID);
            let RequiredEntityStateName = helpers.utils.getEntityStateNameById(contractType, RequiredEntityStateID);

            if (CurrentEntityStateID === 0) {
                color = helpers.utils.colors.green;
            }

            color = helpers.utils.colors.red;
            helpers.utils.toLog(
                logPre + "Current ENTITY:          " +
                helpers.utils.colors.green +
                "[" + CurrentEntityStateID + "] " +
                CurrentEntityStateName
            );

            if (CurrentEntityStateID === 0) {
                color = helpers.utils.colors.green;
            }
            helpers.utils.toLog(
                logPre + "Required ENTITY change:  " +
                color +
                "[" + RequiredEntityStateID + "] " +
                RequiredEntityStateName
            );

        }
        helpers.utils.toLog("");
    },


    async showApplicationRequiredStateChanges(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - ApplicationEntity Required State Changes: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let contractTimeStamp = await assetContract.getTimestamp.call();
        let assetName = "ApplicationEntity";

        helpers.utils.toLog(
            logPre + "Contract Time and Date:  " + helpers.utils.toDate(contractTimeStamp)
        );

        let reqChanges = await assetContract.getRequiredStateChanges.call();
        let hasRequiredStateChanges = await assetContract.hasRequiredStateChanges.call();

        helpers.utils.toLog(
            logPre + "Required State Changes   " +
            helpers.utils.colors.green +
            hasRequiredStateChanges
        );

        let CurrentEntityStateID =  helpers.web3util.toDecimal(reqChanges[0]);
        let RequiredEntityStateID = helpers.web3util.toDecimal(reqChanges[1]);

        let CurrentEntityStateName = helpers.utils.getEntityStateNameById(assetName, CurrentEntityStateID);
        let RequiredEntityStateName = helpers.utils.getEntityStateNameById(assetName, RequiredEntityStateID);

        if (CurrentEntityStateID === 0) {
            color = helpers.utils.colors.green;
        }

        color = helpers.utils.colors.red;
        helpers.utils.toLog(
            logPre + "Current ENTITY:          " +
            helpers.utils.colors.green +
            "[" + CurrentEntityStateID + "] " +
            CurrentEntityStateName
        );

        if (CurrentEntityStateID === 0) {
            color = helpers.utils.colors.green;
        }
        helpers.utils.toLog(
            logPre + "Required ENTITY change:  " +
            color +
            "[" + RequiredEntityStateID + "] " +
            RequiredEntityStateName
        );


        helpers.utils.toLog("");
    },

    async runStateChanger(helpers, assetContract) {

        let hasChanges = await assetContract.hasStateChanges.call();
        if (hasChanges === true) {

            helpers.utils.toLog(logPre + helpers.utils.colors.purple + "Running doStateChanges ...");
            tx = await assetContract.doStateChanges(true);

            for (let log of tx.logs) {
                if (log.event === "DebugRecordRequiredChanges") {
                    console.log(logPre + " Record C: " + helpers.utils.getFundingStageStateNameById(helpers.web3util.toDecimal(log.args._current)));
                    console.log(logPre + " Record R: " + helpers.utils.getFundingStageStateNameById(helpers.web3util.toDecimal(log.args._required)));
                } else if (log.event === "DebugEntityRequiredChanges") {
                    console.log(logPre + " Entity C: " + helpers.utils.getFundingEntityStateNameById(helpers.web3util.toDecimal(log.args._current)));
                    console.log(logPre + " Entity R: " + helpers.utils.getFundingEntityStateNameById(helpers.web3util.toDecimal(log.args._required)));
                } else if (log.event === "DebugCallAgain") {
                    let whoAr = [0, "Entity", "Record"];
                    let who = helpers.web3util.toDecimal(log.args._who);
                    console.log(logPre + " DebugCallAgain: " + whoAr[who]);
                } else if (log.event === "EventEntityProcessor") {
                    console.log(logPre + " EventEntityProcessor: state:" + helpers.utils.getFundingEntityStateNameById(helpers.web3util.toDecimal(log.args._state)) );
                }

            }

            await helpers.utils.showGasUsage(helpers, tx);
            await helpers.utils.showDebugRequiredStateChanges(helpers, assetContract);
        }
    },
    async showDebugRequiredStateChanges(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - Required State Changes: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let contractTimeStamp = await assetContract.getTimestamp.call();
        helpers.utils.toLog(
            logPre + "Contract Time and Date:  " + helpers.utils.toDate(contractTimeStamp)
        );

        let reqChanges = await assetContract.getRequiredStateChanges.call();

        let CurrentFundingStageState = helpers.utils.getFundingStageStateNameById(helpers.web3util.toDecimal(reqChanges[0]));
        let FundingStageStateRequired = helpers.utils.getFundingStageStateNameById(helpers.web3util.toDecimal(reqChanges[1]));
        let EntityStateRequired = helpers.utils.getFundingEntityStateNameById(helpers.web3util.toDecimal(reqChanges[2]));


        let CurrentEntityStateReq =  await assetContract.CurrentEntityState.call();
        let CurrentEntityState = helpers.web3util.toDecimal(CurrentEntityStateReq);


        let stageId = helpers.web3util.toDecimal( await assetContract.currentFundingStage.call() );

        helpers.utils.toLog(
            logPre + "Current stage id:        " + stageId
        );

        helpers.utils.toLog(
            logPre + "Received RECORD state:   " +
            helpers.utils.colors.green +
            "["+reqChanges[0]+"] "+
            CurrentFundingStageState
        );

        let color = helpers.utils.colors.red;

        let stateChangeInt = helpers.web3util.toDecimal(reqChanges[1]);
        if(stateChangeInt == 0) {
            color = helpers.utils.colors.green;
        }

        helpers.utils.toLog(
            logPre + "Required RECORD change:  " +
            color +
            "["+stateChangeInt+"] "+
            FundingStageStateRequired
        );

        color = helpers.utils.colors.red;


        helpers.utils.toLog(
            logPre + "Current ENTITY:          " +
            helpers.utils.colors.green +
            "["+CurrentEntityState+"] "+
            helpers.utils.getFundingEntityStateNameById(CurrentEntityState)
        );

        if(reqChanges[2] == 0 ) {
            color = helpers.utils.colors.green;
        }
        helpers.utils.toLog(
            logPre + "Required ENTITY change:  " +
            color +
            "["+reqChanges[2]+"] "+
            EntityStateRequired
        );

        // FundingStageStates
        // let FundingStage = await assetContract.Collection.call(stageId);
        // helpers.utils.displayFundingStageStruct(helpers, FundingStage);

        helpers.utils.toLog("");
    },
    async showDebugFundingStageStateRequiredChanges(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - FundingStage Required State Changes: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let contractTimeStamp = await assetContract.getTimestamp.call();
        helpers.utils.toLog(
            logPre + "Contract Time and Date: " + helpers.utils.toDate(contractTimeStamp)
        );

        let stageId = helpers.web3util.toDecimal( await assetContract.currentFundingStage.call() );

        helpers.utils.toLog(
            logPre + "Current stage id:      " + stageId
        );

        let FundingStage = await assetContract.Collection.call(stageId);
        helpers.utils.toLog(
            logPre + "Current state:          " +
            helpers.utils.colors.green +
            helpers.utils.getFundingStageStateNameById(helpers.web3util.toDecimal(FundingStage[2]))
        );

        let stateChanges = await assetContract.getRequiredStateChanges.call();
        let RecordStateRequired = stateChanges[1];
        let EntityStateRequired = stateChanges[2];


        let stateChangeInt = helpers.web3util.toDecimal(RecordStateRequired);
        if(stateChangeInt !== 0) {
            helpers.utils.toLog(
                logPre + "Required record change: " +
                helpers.utils.colors.red +
                helpers.utils.getFundingStageStateNameById(stateChangeInt)
            );
        } else {
            helpers.utils.toLog(
                logPre + "Required record change: " +
                helpers.utils.colors.green +
                helpers.utils.getFundingStageStateNameById(stateChangeInt)
            );
        }

        // FundingStageStates

        // let FundingStage = await assetContract.Collection.call(stageId);
        // helpers.utils.displayFundingStageStruct(helpers, FundingStage);


        helpers.utils.toLog("");
    },
    async showCurrentSettings(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - Current Settings: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let AmountRaised = await assetContract.AmountRaised.call();
        let AmountCapSoft = await assetContract.AmountCapSoft.call();
        let AmountCapHard = await assetContract.AmountCapHard.call();
        helpers.utils.toLog(logPre + "AmountRaised ether:  " + helpers.web3util.fromWei(AmountRaised, "ether"));
        helpers.utils.toLog(logPre + "AmountCapSoft ether: " + helpers.web3util.fromWei(AmountCapSoft, "ether"));
        helpers.utils.toLog(logPre + "AmountCapHard ether: " + helpers.web3util.fromWei(AmountCapHard, "ether"));

        let stageId = helpers.web3util.toDecimal( await assetContract.currentFundingStage.call() );

        helpers.utils.toLog(
            logPre +
            "Current STAGE id:    " + stageId
        );

        let FundingStage = await assetContract.Collection.call(stageId);

        helpers.utils.toLog(
            logPre +
            "time_start:          " +
            helpers.utils.toDateFromHex(FundingStage[3])
        );

        helpers.utils.toLog(
            logPre +
            "time_end:            " +
            helpers.utils.toDateFromHex(FundingStage[4])
        );

        helpers.utils.toLog(
            logPre +
            "amount_cap_soft:     " +
            helpers.web3util.fromWei(FundingStage[5], "ether")
        );
        helpers.utils.toLog(
            logPre +
            "amount_cap_hard:     " +
            helpers.web3util.fromWei(FundingStage[6], "ether")
        );


        let Contract_current_timestamp = await assetContract.getTimestamp.call();

        helpers.utils.toLog(
            logPre +
            "CURRENT DATE:        " +
            helpers.utils.toDate(Contract_current_timestamp)
        );

    },
    async showDebugSettings(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - Settings: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );
        let AmountRaised = await assetContract.AmountRaised.call();
        let AmountCapSoft = await assetContract.GlobalAmountCapSoft.call();
        let AmountCapHard = await assetContract.GlobalAmountCapHard.call();
        let TokenSellPercentage = await assetContract.TokenSellPercentage.call();

        let Contract_current_timestamp = await assetContract.getTimestamp.call();
        let Funding_Setting_funding_time_start = await assetContract.Funding_Setting_funding_time_start.call();
        let Funding_Setting_funding_time_end = await assetContract.Funding_Setting_funding_time_end.call();
        let Funding_Setting_cashback_time_start = await assetContract.Funding_Setting_cashback_time_start.call();
        let Funding_Setting_cashback_time_end = await assetContract.Funding_Setting_cashback_time_end.call();

        helpers.utils.toLog(logPre + "AmountRaised ether:    " + helpers.web3util.fromWei(AmountRaised, "ether"));
        helpers.utils.toLog(logPre + "AmountCapSoft ether:   " + helpers.web3util.fromWei(AmountCapSoft, "ether"));
        helpers.utils.toLog(logPre + "AmountCapHard ether:   " + helpers.web3util.fromWei(AmountCapHard, "ether"));
        helpers.utils.toLog(logPre + "TokenSellPercentage %: " + helpers.web3util.toDecimal(TokenSellPercentage));


        helpers.utils.toLog(
            logPre + "CURRENT DATE:        " + helpers.utils.toDate(Contract_current_timestamp)
        );
        helpers.utils.toLog(
            logPre + "Funding Start DATE:  " + helpers.utils.toDate(Funding_Setting_funding_time_start)
        );
        helpers.utils.toLog(
            logPre + "Funding End DATE:    " + helpers.utils.toDate(Funding_Setting_funding_time_end)
        );

        helpers.utils.toLog(
            logPre + "CashBack Start DATE: " + helpers.utils.toDate(Funding_Setting_cashback_time_start)
        );
        helpers.utils.toLog(
            logPre + "CashBack End DATE:   " + helpers.utils.toDate(Funding_Setting_cashback_time_end)
        );

        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );
        helpers.utils.toLog("");
    }
    ,
    async showDebugFundingStages(helpers, assetContract) {

        helpers.utils.toLog("\n" + logPre + " Debug - Funding Stages: ");
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );

        let FundingStageNum = await assetContract.FundingStageNum.call();
        if (FundingStageNum > 0) {
            helpers.utils.toLog(logPre +
                "[" +
                helpers.utils.colors.orange +
                FundingStageNum +
                helpers.utils.colors.none +
                "] Funding Stages: ");

            for (let i = 1; i <= FundingStageNum; i++) {
                let stageId = i;
                helpers.utils.toLog(logPre + "Checking stage id: " + stageId);

                let FundingStage = await assetContract.Collection.call(stageId);
                helpers.utils.displayFundingStageStruct(helpers, FundingStage);

            }
        } else {
            helpers.utils.toLog(logPre + "None Found");
        }
        helpers.utils.toLog(
            logPre + "-----------------------------------------------------------"
        );
        helpers.utils.toLog("");
    },
    displayFundingStageStruct(helpers, struct) {

        // helpers.utils.toLog(struct);
        helpers.utils.toLog(logPre + "name:             " + helpers.web3util.toAscii(struct[0]));           // bytes32
        helpers.utils.toLog(logPre + "description:      " + helpers.web3util.toAscii(struct[1]));           // bytes32
        helpers.utils.toLog(logPre + "state:            " + helpers.web3util.toDecimal(struct[2]));         // uint8
        helpers.utils.toLog(logPre + "time_start:       " + helpers.utils.toDateFromHex(struct[3]));        // uint256
        helpers.utils.toLog(logPre + "time_end:         " + helpers.utils.toDateFromHex(struct[4]));        // uint256
        helpers.utils.toLog(logPre + "amount_cap_soft:  " + helpers.web3util.fromWei(struct[5], "ether"));  // uint256
        helpers.utils.toLog(logPre + "amount_cap_hard:  " + helpers.web3util.fromWei(struct[6], "ether"));  // uint256
        helpers.utils.toLog(logPre + "amount_raised:    " + helpers.web3util.fromWei(struct[7], "ether"));  // uint256
        helpers.utils.toLog(logPre + "minimum_entry:    " + helpers.web3util.fromWei(struct[8], "ether"));  // uint256
        helpers.utils.toLog(logPre + "methods:          " + helpers.web3util.toDecimal(struct[9]));         // uint8
        helpers.utils.toLog(logPre + "fixed_tokens:     " + helpers.web3util.toDecimal(struct[10]));        // uint256
        helpers.utils.toLog(logPre + "use_parity:       " + struct[11]);                                    // bool
        helpers.utils.toLog(logPre + "token_share_perc: " + helpers.web3util.toDecimal(struct[12]));        // uint8
        helpers.utils.toLog(logPre + "index:            " + helpers.web3util.toDecimal(struct[13]));        // uint8
        helpers.utils.toLog("");
    },

    async displayProposal(helpers, ProposalsAsset, ProposalId) {

        helpers.utils.toLog(logPre + "Proposal Id ["+ProposalId+"]" );
        let ProposalRecord = await ProposalsAsset.ProposalsById.call( ProposalId );

        helpers.utils.toLog(logPre + "creator:           "+ ProposalRecord[0].toString());
        helpers.utils.toLog(logPre + "name:              "+ helpers.web3util.toUtf8(ProposalRecord[1]));
        helpers.utils.toLog(logPre + "actionType:        "+ helpers.utils.getActionNameById("Proposals", ProposalRecord[2].toNumber() ) );
        helpers.utils.toLog(logPre + "state:             "+ helpers.utils.getRecordStateNameById("Proposals", ProposalRecord[3].toNumber() ) );
        helpers.utils.toLog(logPre + "hash:              "+ ProposalRecord[4].toString());
        helpers.utils.toLog(logPre + "addr:              "+ ProposalRecord[5].toString());
        helpers.utils.toLog(logPre + "sourceCodeUrl:     "+ helpers.web3util.toUtf8(ProposalRecord[6]));
        helpers.utils.toLog(logPre + "extra:             "+ ProposalRecord[7].toString());
        helpers.utils.toLog(logPre + "time_start:        "+ helpers.utils.toDateFromHex(ProposalRecord[8]));
        helpers.utils.toLog(logPre + "time_end:          "+ helpers.utils.toDateFromHex(ProposalRecord[9]));
        helpers.utils.toLog(logPre + "index:             "+ ProposalRecord[10].toString());

        let ProposalResultRecord = await ProposalsAsset.ResultsByProposalId.call( ProposalId );

        helpers.utils.toLog(logPre + "" );
        helpers.utils.toLog(logPre + "Result Record:" );
        helpers.utils.toLog(logPre + "totalAvailable:    "+ helpers.utils.getInTotal(helpers, ProposalResultRecord[0]) );
        helpers.utils.toLog(logPre + "requiredForResult: "+ helpers.utils.getInTotal(helpers, ProposalResultRecord[1]) );
        helpers.utils.toLog(logPre + "totalSoFar:        "+ helpers.utils.getInTotal(helpers, ProposalResultRecord[2]) );
        helpers.utils.toLog(logPre + "yes:               "+ helpers.utils.getInTotal(helpers, ProposalResultRecord[3]) );
        helpers.utils.toLog(logPre + "no:                "+ helpers.utils.getInTotal(helpers, ProposalResultRecord[4]) );
        helpers.utils.toLog(logPre + "requiresCounting:  "+ ProposalResultRecord[5].toString());
        helpers.utils.toLog(logPre + "" );

        let hasRequiredStateChanges = await ProposalsAsset.hasRequiredStateChanges.call();
        helpers.utils.toLog(logPre + "RequiredStateChanges:"+ hasRequiredStateChanges.toString() );

        let ActiveProposalNum = await ProposalsAsset.ActiveProposalNum.call();
        helpers.utils.toLog(logPre + "ActiveProposalNum:   "+ ActiveProposalNum.toString() );

        let ActiveProposalId = await ProposalsAsset.ActiveProposalIds.call(0);
        helpers.utils.toLog(logPre + "ActiveProposalIds[0]:"+ ActiveProposalId.toString() );

        let needsProcessing = await ProposalsAsset.needsProcessing.call( ActiveProposalId );
        helpers.utils.toLog(logPre + "needsProcessing:    "+ needsProcessing.toString() );

        let expiryChangesState = await ProposalsAsset.expiryChangesState.call( ActiveProposalId );
        helpers.utils.toLog(logPre + "expiryChangesState: "+ expiryChangesState.toString() );

        helpers.utils.toLog(logPre + "" );

    },
    async displayCashBackStatus(helpers, TestBuildHelper, wallet) {

        let vault = await TestBuildHelper.getMyVaultAddress(wallet);
        let canCashBack = await vault.canCashBack.call();

        let checkFundingStateFailed                         = await vault.checkFundingStateFailed.call();
        let checkOwnerFailedToSetTimeOnMeeting              = await vault.checkOwnerFailedToSetTimeOnMeeting.call();
        let checkMilestoneStateInvestorVotedNoVotingEndedNo = await vault.checkMilestoneStateInvestorVotedNoVotingEndedNo.call();

        let etherBalance = await helpers.utils.getBalance(helpers.artifacts, vault.address);
        let etherBalanceInFull = helpers.web3util.fromWei(etherBalance, "ether");

        console.log("canCashBack: ", canCashBack.toString());
        console.log("checkFundingStateFailed:   ", checkFundingStateFailed.toString());
        console.log("checkOwnerFailedToSetTime: ", checkOwnerFailedToSetTimeOnMeeting.toString());
        console.log("checkMVotedNoVotingEndedNo:", checkMilestoneStateInvestorVotedNoVotingEndedNo.toString());
        console.log("ether balance:             ", etherBalanceInFull.toString());

    },
    getInTotal( helpers, bigNumber ) {
        let result = helpers.web3util.fromWei(bigNumber, "ether");
        return result.toString();
    },
    getFundingStageStateNameById(_id) {
        return FundingStageStates.filter(x => x.key === _id)[0].name;
    },
    getFundingStageStateIdByName(_name) {
        return FundingStageStates.filter(x => x.name === _name)[0].key;
    },
    getFundingEntityStateNameById(_id) {
        return FundingEntityStates.filter(x => x.key === _id)[0].name;
    },
    getFundingEntityStateIdByName(_name) {
        return FundingEntityStates.filter(x => x.name === _name)[0].key;
    },
    getEntityStateNameById(_type, _id) {
        return StateArray[_type].filter(x => x.key === _id)[0].name;
    },
    getEntityStateIdByName(_type, _name) {
        return StateArray[_type].filter(x => x.name === _name)[0].key;
    },
    getRecordStateNameById(_type, _id) {
        return RecordArray[_type].filter(x => x.key === _id)[0].name;
    },
    getRecordStateIdByName(_type, _name) {
        return RecordArray[_type].filter(x => x.name === _name)[0].key;
    },
    getActionNameById(_type, _id) {
        return ActionArray[_type].filter(x => x.key === _id)[0].name;
    },
    getActionIdByName(_type, _name) {
        return ActionArray[_type].filter(x => x.name === _name)[0].key;
    },
    getSetupClone(setup, newSettings) {
        return {
            helpers: setup.helpers,
            contracts: setup.contracts,
            assetContractNames: setup.assetContractNames,
            settings: newSettings
        };
    },
    async getContractBalance(helpers, address) {
        return await helpers.utils.getBalance(helpers.artifacts, address);
    },
    getAssetContractByName(array, name) {
        return array.filter(x => x.name === name)[0];
    },
};
