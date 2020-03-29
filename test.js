const Table                     = require('cli-table');

const _ = require('lodash');
function clone(_what) {
    return _.cloneDeep(_what);
}

const stageBlockCount = 10;
const stageCount = 11;
const start = 11;

const s1Start = start + stageBlockCount;
const end = start + stageCount * stageBlockCount;

let current = start;

const Participant = {
    boughtTokens: 0,
    returnedTokens: 0,
    tokenBalance: 0,
    allocatedBalance: 0,
    processedBalance: 0,
    byStage: []
}

const ParticipantDetailsByStage = {
    boughtTokens: 0,
    returnedTokens: 0,
    tokenBalance: 0,
    allocatedBalance: 0,
    processedBalance: 0
}

const participantsByAddress = [];

function getParticipantRecordByAddress(_address) {
    const record = participantsByAddress[_address];
    if (!record) {
        participantsByAddress[_address] = setupNewParticipant();
    }
    return participantsByAddress[_address];
}

function setupNewParticipant() {
    const variable = clone(Participant);
    for (let i = 0; i <= stageCount; i++) {
        variable.byStage[i] = clone(ParticipantDetailsByStage);
    }
    return variable;
}

function getStageAtBlock(_current) {
    return Math.ceil((_current - s1Start + 1) / stageBlockCount);
}

function buy(_address, amount) {
    const currentStage = getStageAtBlock(current);
    const user = getParticipantRecordByAddress(_address);
    let byStage = user.byStage[currentStage];
    if(!byStage) {
        user.byStage[currentStage] = {};
        byStage = user.byStage[currentStage];
    }
    byStage.boughtTokens += amount;
    byStage.tokenBalance += amount;
    user.boughtTokens += amount;
    user.tokenBalance += amount;
}

function getProcessedForReturned(
    _unlockedTokens,
    _oldProcessedTokens,
    _returnedTokenAmount,
    _lockedTokens
) {
    const returned = (
        // active minus processed
        _unlockedTokens - _oldProcessedTokens
    ) * (
        // percentage of the locked sum was returned
        _returnedTokenAmount / _lockedTokens
    );
    return returned;
}

function withdraw(_address, amount) {
    const currentStage = getStageAtBlock(current);
    const user = getParticipantRecordByAddress(_address);
    
    let returnedTokenAmount = amount;
    const maxLocked = locked(_address);
    if(amount > maxLocked) {
        returnedTokenAmount = maxLocked;
    }

    user.returnedTokens += returnedTokenAmount;
    user.tokenBalance -= returnedTokenAmount;

    let processedBalance = 0;

    for(let i = currentStage; i >= 0; i-- ) {

        const byStage = user.byStage[i];
        const unlockedInStage = (byStage.tokenBalance - byStage.processedBalance) * globalUnlockRatio() / 100 + byStage.processedBalance;
        const lockedInStage = byStage.tokenBalance - unlockedInStage;

        if(returnedTokenAmount > 0) {

            // how much are we processing in this stage ?
            let toProcess = lockedInStage;

            if (returnedTokenAmount <= lockedInStage) {
                // Partial return

                // find difference 
                byStage.processedBalance+= getProcessedForReturned(
                    unlockedInStage,
                    byStage.processedBalance,
                    returnedTokenAmount,
                    lockedInStage
                );

                toProcess = returnedTokenAmount;
            } else {
                byStage.processedBalance = unlockedInStage;
            }
            
            byStage.returnedTokens += toProcess;
            byStage.tokenBalance -= toProcess;

            // remove processed token amount from requested amount
            returnedTokenAmount-= toProcess;
        }
        processedBalance += byStage.processedBalance;
    }
    user.processedBalance = processedBalance;
}


function unlocked(_address) {
    const user = getParticipantRecordByAddress(_address);
    const returned = (user.tokenBalance - user.processedBalance) * globalUnlockRatio() / 100 + user.processedBalance;
    return returned;
}

function locked(_address) {
    const user = getParticipantRecordByAddress(_address);
    return user.tokenBalance - unlocked(_address);
}

function globalUnlockRatio() {
    if (current >= s1Start && current < end) {
        const totalBlockCount = end - s1Start;
        const passedBlocks = current - s1Start + 1 ;
        return 100 * passedBlocks / totalBlockCount;
    } else if (current >= end) {
        return 100;
    } else {
        return 0;
    }
}

function setBlockToStage(id, end = false, add = 0) {
    current = start + id * stageBlockCount;
    if(end) {
        current+= stageBlockCount - 1;
    }
    current+= add;
}

function viewInfo() {
    console.log("block:             ", current);
    console.log("StageId:           ", getStageAtBlock(current));
    console.log("globalUnlockRatio: ", globalUnlockRatio());
    console.log();
}

function viewUserInfo(_address) {
    
    const user = getParticipantRecordByAddress(_address);

    const stageHeaders = [];
    const stageBought = [];
    const stageReturned = [];
    const stageBalance = [];
    for(let i = 0; i < stageCount; i++) {
        const byStage = user.byStage[i];

        stageHeaders.push("Stage "+i);
        stageBought.push(byStage.boughtTokens);
        stageReturned.push(byStage.returnedTokens);
        stageBalance.push(byStage.tokenBalance);
    }

    const userInfoTable = new Table({
        head: ["/", "Total", ... stageHeaders],
        // colWidths: [20, 15, 15]
    });

    userInfoTable.push(["Bought", user.boughtTokens, ... stageBought]);
    userInfoTable.push(["Returned", user.returnedTokens, ... stageReturned]);
    userInfoTable.push(["Balance", user.tokenBalance, ... stageBalance]);

    console.log("Token Balances for _address(",_address,"):");
    console.log(userInfoTable.toString());
}

function viewTimeProgression(_address) {

    const backupBlock = current;
    const startStage = getStageAtBlock(current);

    const user = getParticipantRecordByAddress(_address);

    const stageHeaders = [];
    const stageBalance = [];
    const stageLocked = [];
    const stageUnlocked = [];
    const stageProcessed = [];
    
    for(let i = 0; i < stageCount; i++) {
        const byStage = user.byStage[i];
        stageHeaders.push("Stage "+i);
        stageBalance.push(byStage.tokenBalance);
        stageProcessed.push(byStage.processedBalance);

        setBlockToStage(i, true);
        if(i >= startStage) {
            stageLocked.push( locked(_address) );
            stageUnlocked.push( unlocked(_address) );
        } else {
            stageLocked.push( 0 );
            stageUnlocked.push( 0 );
        }
    }

    const timeProgressionTable = new Table({
        head: ["/", ... stageHeaders],
        // colWidths: [20, 15, 15]
    });

    timeProgressionTable.push(["Balance", ... stageBalance]);
    timeProgressionTable.push(["Locked", ... stageLocked]);
    timeProgressionTable.push(["Unlocked", ... stageUnlocked]);
    timeProgressionTable.push(["Processed", ... stageProcessed]);

    console.log("Time Progression for _address(",_address,"):");
    console.log(timeProgressionTable.toString());

    current = backupBlock;
}


console.clear();

setBlockToStage(2, true);
viewInfo();

// buy("user1", 20);
// viewUserInfo("user1");
// viewTimeProgression("user1");

buy("user2", 100);
viewTimeProgression("user2");
withdraw("user2", 40);
viewTimeProgression("user2");

setBlockToStage(5, true);
withdraw("user2", 20);
viewTimeProgression("user2");

const user2 = getParticipantRecordByAddress("user2");
// console.log(user2)
viewUserInfo("user2");

