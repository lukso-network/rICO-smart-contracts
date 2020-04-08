/*
 * The rico validator class.
 *
 * @author Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
*/

const _ = require('lodash');
function clone(_what) {
    return _.cloneDeep(_what);
}

const { BN, constants } = require("openzeppelin-test-helpers");

const { MAX_UINT256 } = constants;
const web3util = require("web3-utils");

const ether = 1000000000000000000; // 1 ether in wei
const etherBN = new BN(ether.toString());

const solidity = {
    ether: ether,
    etherBN: etherBN,
    gwei: 1000000000
};

const Participant = {
    whitelisted: false,
    contributions: 0,
    totalSentETH: new BN("0"),  // Total amount of ETH received by the smart contract.
    returnedETH: new BN("0"),       // totalSentETH - committedETH
    committedETH: new BN("0"),      // lower than msg.value if maxCap already reached
    withdrawnETH: new BN("0"),      // cancel() / withdraw()
    allocatedETH: new BN("0"),      // allocated to project when contributing or exiting
    pendingTokens: new BN("0"),    // total tokens bought in all stages
    boughtTokens: new BN("0"),      // total tokens already sent to the participant in all stages
    returnedTokens: new BN("0"),    // total tokens returned by participant to contract in all stages
    stages: [],
}

const ParticipantDetailsByStage = {
    totalSentETH: new BN("0"),  // Total amount of ETH received by the smart contract.
    returnedETH: new BN("0"),       // totalSentETH - committedETH
    committedETH: new BN("0"),      // lower than msg.value if maxCap already reached
    withdrawnETH: new BN("0"),      // withdrawn from current stage
    allocatedETH: new BN("0"),      // allocated to project when contributing or exiting
    pendingTokens: new BN("0"),    // tokens bought in this stage
    boughtTokens: new BN("0"),      // tokens already sent to the participant in this stage
    returnedTokens: new BN("0"),    // tokens returned by participant to contract
}


const Validator = require("./validator.js");
const TokenContract = require("./tokenContract.js");
const BalanceContract = require("./balanceContract.js");

class Contract extends Validator {

    // set the defaults
    constructor(settings, currentBlock = 0) {
        super(settings, currentBlock);

        this.participants = {};
        this.participantsById = [];
        this.participantCount = 0;

        this._projectUnlockedETH = new BN("0");
        this.projectWithdrawnETH = new BN("0");
        this.committedETH = new BN("0");
        this.withdrawnETH = new BN("0");
        this.totalSentETH = new BN("0");
        this.returnedETH = new BN("0");

        this.ApplicationEventTypes = {
            "NOT_SET": 0,
            "CONTRIBUTION_ADDED": 1,
            "CONTRIBUTION_CANCELED": 2,
            "CONTRIBUTION_ACCEPTED": 3,
            "WHITELIST_APPROVED": 4,
            "WHITELIST_REJECTED": 5,
            "PROJECT_WITHDRAWN": 6
        }

        this.TransferTypes = {
            "NOT_SET": 0,
            "WHITELIST_REJECTED": 1,
            "CONTRIBUTION_CANCELED": 2,
            "CONTRIBUTION_ACCEPTED_OVERFLOW": 3,
            "PARTICIPANT_WITHDRAW": 4,
            "PARTICIPANT_WITHDRAW_OVERFLOW": 5,
            "PROJECT_WITHDRAWN": 6
        }

        this.contractAddress = "ricoContractAddress";
        this.deployerAddress = "deployerAddress";

        this.TokenContractInstance = new TokenContract(
            settings.token.supply,
            this.deployerAddress
        );

        this.BalanceContractInstance = new BalanceContract();

        this.TokenContractInstance.send(
            this.deployerAddress,
            this.contractAddress,
            settings.token.sale,
        );

    }

    commit(msg_sender, msg_value) {

        // @js-only
        this.BalanceContractInstance.transferWithFromAndTo(msg_sender, this.contractAddress, msg_value);

        // Add the received value to totalSentETH
        this.totalSentETH = this.totalSentETH.add(msg_value);

        // Participant initial state record
        let participantRecord = this.getParticipantRecordByAddress(msg_sender);

        // Check if participant has previous contributions
        if (participantRecord.contributions == 0) {
            // increase participant count
            this.participantCount++;

            // index
            this.participantsById[this.participantCount] = msg_sender;
        }

        // Record contribution into current stage totals for the participant
        this.recordNewContribution(msg_sender, msg_value);

        // If whitelisted, process the contribution automatically
        if (participantRecord.whitelisted == true) {
            this.acceptContributionsForAddress(msg_sender, this.ApplicationEventTypes.CONTRIBUTION_ACCEPTED);
        }
    }

    cancelByEth() {
        // amount does not matter

    }

    cancelByTokens(amount) {
        // amount required

    }

    recordNewContribution(_from, _receivedValue) {
        const currentStage = this.getCurrentStage();
        const participantRecord = this.getParticipantRecordByAddress(_from);

        // Update participant's total stats
        participantRecord.contributions++;
        participantRecord.totalSentETH = participantRecord.totalSentETH.add(_receivedValue);

        // Update participant's per-stage stats
        const stages = participantRecord.stages[currentStage];
        stages.totalSentETH = stages.totalSentETH.add(_receivedValue);

        // Get the equivalent amount in tokens
        const newTokenAmount = this.getTokenAmountForEthAtStage(
            _receivedValue, currentStage
        );

        // Update participant's reserved tokens
        stages.pendingTokens = stages.pendingTokens.add(newTokenAmount);
        participantRecord.pendingTokens = participantRecord.pendingTokens.add(newTokenAmount);

        this.ApplicationEvent(
            this.ApplicationEventTypes.CONTRIBUTION_ADDED,
            participantRecord.contributions,
            _from,
            _receivedValue
        );
    }

    acceptContributionsForAddress(_from, _eventType) {

        
        const participantRecord = this.getParticipantRecordByAddress(_from);
        const currentStage = this.getCurrentStage();

        for (let i = 0; i <= currentStage; i++) {

            const stageId = i;
            const stages = participantRecord.stages[stageId];
            const processedTotals = participantRecord.committedETH.add(participantRecord.returnedETH);

            if (processedTotals.lt(participantRecord.totalSentETH)) {

                // handle the case when we have reserved more tokens than globally available
                participantRecord.pendingTokens = participantRecord.pendingTokens.sub(stages.pendingTokens);
                stages.pendingTokens = 0;

                // the maximum amount is equal to the total available ETH at the current stage
                const maxAcceptableValue = this.availableEthAtStage(currentStage);

                // the per stage accepted amount: totalSentETH - committedETH
                let newAcceptedValue = stages.totalSentETH.sub(stages.committedETH);
                let returnValue = new BN("0");

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest
                if (newAcceptedValue.gt(maxAcceptableValue)) {
                    newAcceptedValue = maxAcceptableValue;
                    returnValue = stages.totalSentETH
                        .sub(stages.returnedETH)
                        .sub(stages.committedETH)
                        .sub(stages.withdrawnETH)
                        .sub(newAcceptedValue);

                    // update return values
                    this.returnedETH = this.returnedETH.add(returnValue);
                    participantRecord.returnedETH = participantRecord.returnedETH.add(returnValue);
                    stages.returnedETH = returnValue;
                }

                if (newAcceptedValue.gt(new BN("0"))) {

                    // update values by adding the new accepted amount
                    this.committedETH = this.committedETH.add(newAcceptedValue);
                    participantRecord.committedETH = participantRecord.committedETH.add(newAcceptedValue);
                    stages.committedETH = stages.committedETH.add(newAcceptedValue);

                    // calculate the equivalent token amount
                    const newTokenAmount = this.getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    // update participant's token amounts
                    participantRecord.boughtTokens = participantRecord.boughtTokens.add(newTokenAmount);
                    stages.boughtTokens = stages.boughtTokens.add(newTokenAmount);

                    // allocate tokens to participant
                    this.IERC777().send(this.contractAddress, _from, newTokenAmount);
                }

                // if the incoming amount is too big to accept, then...
                // ... we must tranfer back the difference.
                if (returnValue.gt(new BN("0"))) {
                    this.address(this.uint160(_from)).transfer(returnValue);
                    this.TransferEvent(this.TransferTypes.CONTRIBUTION_ACCEPTED_OVERFLOW, _from, returnValue);
                }

                this.ApplicationEvent(_eventType, stageId, _from, newAcceptedValue);
            }
        }
    }

    availableEthAtStage(_stage) {
        return this.availableEthAtStageForTokenBalance(
            this.IERC777().balanceOf(this.contractAddress),
            _stage
        );
    }

    getAvailableProjectETH() {

        let remainingFromAllocation = new BN("0");
        // Calculate the amount of allocated ETH, not withdrawn yet
        if (this._projectUnlockedETH.gt(this.projectWithdrawnETH)) {
            remainingFromAllocation = _projectUnlockedETH.sub(projectWithdrawnETH);
        }

        // Calculate ETH that is globally available:
        // Available = accepted - withdrawn - projectWithdrawn - projectNotWithdrawn
        let globalAvailable = this.committedETH
            .sub(this.withdrawnETH)
            .sub(this.projectWithdrawnETH)
            .sub(this.remainingFromAllocation);

        // Multiply the available ETH with the percentage that belongs to the project now
        let unlocked = globalAvailable.mul(
            getCurrentGlobalUnlockRatio()
        ).div(10 ** 20);

        // Available = unlocked + projectNotWithdrawn
        return unlocked.add(remainingFromAllocation);
    }

    whitelist(_address, _approve) {
        const participantRecord = this.getParticipantRecordByAddress(_address);

        if (_approve) {
            // If participants are approved: whitelist them and accept their contributions
            participantRecord.whitelisted = true;
            this.acceptContributionsForAddress(_address, this.ApplicationEventTypes.WHITELIST_APPROVED);
        } else {
            // If participants are not approved: remove them from whitelist and cancel their contributions
            participantRecord.whitelisted = false;
            this.cancelContributionsForAddress(_address, 0, this.ApplicationEventTypes.WHITELIST_REJECTED);
        }
    }

    currentReservedTokenAmount(_address) {
        const participantRecord = this.getParticipantRecordByAddress(_address);

        // Since we want to display token amounts even when they are not already
        // transferred to their accounts, we use reserved + bought
        return this.currentReservedTokenAmountAtBlock(
            participantRecord.pendingTokens.add(participantRecord.boughtTokens),
            this.getCurrentBlockNumber()
        ).sub(participantRecord.returnedTokens);
    }

    getCancelModes(_address) {
        const participantRecord = this.getParticipantRecordByAddress(_address);
        
        if (participantRecord.whitelisted == true) {
            // byEth remains false as they need to send tokens back.
            byTokens = this.canWithdraw(_address);
        } else {
            // byTokens remains false as the participant should have no tokens to send back anyway.
            byEth = this.hasPendingETH(_address);
        }

        return {
            byTokens: byTokens,
            byEth: byEth
        }
    }

    canWithdraw(_address) {
        if (this.currentReservedTokenAmount(_address).gt(new BN("0"))) {
            return true;
        }
        return false;
    }

    hasPendingETH(_address) {
        const participantAvailableETH = this.getParticipantPendingETH(_address);
        if(participantAvailableETH > 0) {
            return true;
        }
        return false;
    }

    getParticipantPendingETH(_from) {
        const participantRecord = this.getParticipantRecordByAddress(_from);
        return participantRecord.committedETH.sub(participantRecord.withdrawnETH);
    }

    cancelContributionsForAddress(_from, _value, _eventType) {

        // Participant should only be able to cancel if they haven't been whitelisted yet...
        // ...but just to make sure take withdrawn and returned into account.
        // This is to handle the case when whitelist controller whitelists someone, then rejects...
        // ...then whitelists them again.
        const participantRecord = this.getParticipantRecordByAddress(_from);

        // Calculate participant's available ETH i.e. committed - withdrawnETH - returnedETH
        const participantAvailableETH = participantRecord.totalSentETH
            .sub(participantRecord.withdrawnETH)
            .sub(participantRecord.returnedETH);

        if (participantAvailableETH.gt(new BN("0"))) {
            // update total ETH returned
            // since this balance was never actually "accepted" it counts as returned...
            // ...so it does not interfere with project withdraw calculations
            this.returnedETH = this.returnedETH.add(participantAvailableETH);

            // update participant's audit values
            participantRecord.pendingTokens = 0;
            participantRecord.withdrawnETH = participantRecord.withdrawnETH.add(participantAvailableETH);

            // transfer ETH back to participant including received value
            this.address(this.uint160(_from)).transfer(participantAvailableETH.add(new BN(_value)));

            let currentTransferEventType;
            if (_eventType == this.ApplicationEventTypes.WHITELIST_REJECTED) {
                currentTransferEventType = this.TransferTypes.WHITELIST_REJECTED;
            } else if (_eventType == this.ApplicationEventTypes.CONTRIBUTION_CANCELED) {
                currentTransferEventType = this.TransferTypes.CONTRIBUTION_CANCELED;
            }

            // event emission
            this.TransferEvent(currentTransferEventType, _from, participantAvailableETH);
            this.ApplicationEvent(
                _eventType,
                participantRecord.contributions,
                _from,
                participantAvailableETH
            );

        } else {
            throw ("Participant has no available ETH to withdraw.");
        }
    }

    withdraw( _from, _returnedTokenAmount) {

        // Whitelisted contributor sends tokens back to the rICO contract.
        // - unlinke cancel() method, this allows variable amounts.
        // - latest contributions get returned first.

        const participantRecord = this.getParticipantRecordByAddress(_from);

        // This is needed otherwise participants that can call cancel() and bypass!
        if (participantRecord.whitelisted == true) {

            const currentBlockNumber = getCurrentBlockNumber();

            // Contributors can send more tokens than they have locked,
            // thus make sure we only try to return for said amount
            let remainingTokenAmount = _returnedTokenAmount;
            const maxLocked = this.currentReservedTokenAmount(_from);
            let returnTokenAmount;
            let allocatedEthAmount;

            // if returned amount is greater than the locked amount...
            // set it equal to locked, keep track of the overflow tokens (remainingTokenAmount)
            if (remainingTokenAmount.gt(maxLocked)) {
                returnTokenAmount = remainingTokenAmount.sub(maxLocked);
                remainingTokenAmount = maxLocked;
            }

            // decrease the total allocated ETH by the equivalent participant's allocated amount
            this._projectUnlockedETH = _projectUnlockedETH.sub(participantRecord.allocatedETH);

            if (remainingTokenAmount.gt(new BN("0"))) {

                // go through stages starting with current stage
                // take stage token amount and remove from "amount participant wants to return"
                // get ETH amount in said stage for that token amount
                // set stage tokens to 0
                // if stage tokens < remaining tokens to process, just subtract remaining from stage
                // this way we can receive tokens in current stage / later stages and process them again.

                let returnETHAmount;
                // defaults to 0

                const currentStageNumber = getCurrentStage();

                for (let stageId = currentStageNumber; stageId >= 0; stageId--) {

                    // total participant tokens at the current stage i.e. reserved + bought - returned
                    const totalInStage = participantRecord.stages[stageId].pendingTokens
                        .add(participantRecord.stages[stageId].boughtTokens)
                        .sub(participantRecord.stages[stageId].returnedTokens);

                    // calculate how many tokens are actually locked at this stage...
                    // ...(at the current block number) and use only those for returning.
                    // reserved + bought - returned (at currentStage & currentBlock)
                    let tokensInStage = currentReservedTokenAmountAtBlock(
                        participantRecord.stages[stageId].pendingTokens.add(participantRecord.stages[stageId].boughtTokens),
                        currentBlockNumber
                    ).sub(participantRecord.stages[stageId].returnedTokens);

                    // only try to process stages that the participant has actually reserved tokens.
                    if (tokensInStage.gt(new BN("0"))) {

                        // if the remaining amount is less than the amount available in the current stage
                        if (remainingTokenAmount.lt(tokensInStage)) {
                            tokensInStage = remainingTokenAmount;
                        }
                        //get the equivalent amount of returned tokens in ETH
                        const currentETHAmount = this.getEthAmountForTokensAtStage(tokensInStage, stageId);

                        //increase the returned tokens counters accordingly
                        participantRecord.returnedTokens = participantRecord.returnedTokens.add(tokensInStage);
                        participantRecord.stages[stageId].returnedTokens = participantRecord.stages[stageId].returnedTokens.add(tokensInStage);

                        // increase the corresponding ETH counters
                        returnETHAmount = returnETHAmount.add(currentETHAmount);
                        participantRecord.stages[stageId].withdrawnETH = participantRecord.stages[stageId].withdrawnETH.add(currentETHAmount);

                        // allocated to project
                        const unlockedETHAmount = getEthAmountForTokensAtStage(
                            totalInStage.sub(tokensInStage), // unlocked token amount
                            stageId
                        );

                        this.allocatedEthAmount = this.allocatedEthAmount.add(unlockedETHAmount);
                        participantRecord.stages[stageId].allocatedETH = unlockedETHAmount;

                        // remove processed token amount from requested amount
                        remainingTokenAmount = remainingTokenAmount.sub(tokensInStage);

                        // break loop if remaining amount = 0
                        if (remainingTokenAmount == 0) {
                            break;
                        }
                    }
                }

                // return overflow tokens received
                if (returnTokenAmount.gt(new BN("0"))) {
                    // send tokens back to participant
                    IERC777(tokenAddress).send(_from, returnTokenAmount, null);
                }

                // increase participant's withdrawnETH counter
                participantRecord.withdrawnETH = participantRecord.withdrawnETH.add(returnETHAmount);

                // Update total ETH withdrawn
                this.withdrawnETH = this.withdrawnETH.add(returnETHAmount);

                // allocate remaining ETH to project directly
                participantRecord.allocatedETH = allocatedEthAmount;
                this._projectUnlockedETH = this._projectUnlockedETH.add(participantRecord.allocatedETH);

                // transfer ETH back to participant
                address(uint160(_from)).transfer(returnETHAmount);
                TransferEvent( TransferTypes.PARTICIPANT_WITHDRAW, _from, returnETHAmount);
                return;
            }
        }
        // If address is not Whitelisted a call to this results in a revert
        throw("Withdraw not possible. Participant has no locked tokens.");
    }

    projectWithdraw(_ethAmount) {

        // Get project unlocked ETH (available for withdrawing)
        const unlocked = this.getAvailableProjectETH();

        // Update stats:  number of project withdrawals, total amount withdrawn by the project
        this.projectWithdrawCount++;
        this.projectWithdrawnETH = this.projectWithdrawnETH.add(_ethAmount);

        // Transfer ETH to project wallet
        address(uint160(projectAddress)).transfer(_ethAmount);

        // Event emission
        ApplicationEvent(
            ApplicationEventTypes.PROJECT_WITHDRAWN,
            projectWithdrawCount,
            projectAddress,
            _ethAmount
        );
        TransferEvent(
            TransferTypes.PROJECT_WITHDRAWN,
            projectAddress,
            _ethAmount
        );
    }

    IERC777(_address = null) {
        return this.TokenContractInstance;
    }

    uint160(_from) {
        return _from;
    }

    address(_to) {
        this.BalanceContractInstance.setFrom(this.contractAddress);
        this.BalanceContractInstance.setTo(_to);
        return this.BalanceContractInstance;
    }

    setupNewParticipant() {
        const variable = clone(Participant);
        for (let i = 0; i <= this.stageCount; i++) {
            variable.stages[i] = clone(ParticipantDetailsByStage);
        }
        return variable;
    }

    getParticipantRecordByAddress(_address) {
        const record = this.participants[_address];
        if (!record) {
            this.participants[_address] = this.setupNewParticipant();
        }
        return this.participants[_address];
    }

    TransferEvent(_type, _address, _value) {
        // call listeners for _type
        // console.log("TransferEvent: ", _type, _address, _value);
    }

    ApplicationEvent(_type, _id, _address, _value) {
        // call listeners for _type
        // console.log("ApplicationEvent: ", _type, _id, _address, _value);
    }

}

module.exports = Contract;
