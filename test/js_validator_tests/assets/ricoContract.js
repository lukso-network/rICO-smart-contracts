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
    contributionsCount: 0,
    totalReceivedETH: new BN("0"),  // Total amount of ETH received by the smart contract.
    returnedETH: new BN("0"),       // totalReceivedETH - committedETH
    committedETH: new BN("0"),      // lower than msg.value if maxCap already reached
    withdrawnETH: new BN("0"),      // cancel() / withdraw()
    allocatedETH: new BN("0"),      // allocated to project when contributing or exiting
    reservedTokens: new BN("0"),    // total tokens bought in all stages
    boughtTokens: new BN("0"),      // total tokens already sent to the participant in all stages
    returnedTokens: new BN("0"),    // total tokens returned by participant to contract in all stages
    byStage: [],
}

const ParticipantDetailsByStage = {
    totalReceivedETH: new BN("0"),  // Total amount of ETH received by the smart contract.
    returnedETH: new BN("0"),       // totalReceivedETH - committedETH
    committedETH: new BN("0"),      // lower than msg.value if maxCap already reached
    withdrawnETH: new BN("0"),      // withdrawn from current stage
    allocatedETH: new BN("0"),      // allocated to project when contributing or exiting
    reservedTokens: new BN("0"),    // tokens bought in this stage
    boughtTokens: new BN("0"),      // tokens already sent to the participant in this stage
    returnedTokens: new BN("0"),    // tokens returned by participant to contract
}


const Validator = require("./validator.js");
const TokenContract = require("./tokenContract.js");
const BalanceContract = require("./balanceContract.js");

class Contract extends Validator {

    // set the defaults
    constructor(settings) {
        super(settings);

        this.participantsByAddress = {};
        this.participantsById = [];
        this.participantCount = 0;

        this.projectAllocatedETH = new BN("0");
        this.projectWithdrawnETH = new BN("0");
        this.committedETH = new BN("0");
        this.withdrawnETH = new BN("0");
        this.totalReceivedETH = new BN("0");
        this.returnedETH = new BN("0");

        this.ApplicationEventTypes = {
            "NOT_SET": 0,
            "CONTRIBUTION_NEW": 1,
            "CONTRIBUTION_CANCEL": 2,
            "PARTICIPANT_CANCEL": 3,
            "COMMITMENT_ACCEPTED": 4,
            "WHITELIST_APPROVE": 5,
            "WHITELIST_REJECT": 6,
            "PROJECT_WITHDRAW": 7
        }

        this.TransferTypes = {
            "NOT_SET": 0,
            "AUTOMATIC_RETURN": 1,
            "WHITELIST_REJECT": 2,
            "PARTICIPANT_CANCEL": 3,
            "PARTICIPANT_WITHDRAW": 4,
            "PROJECT_WITHDRAW": 5
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

        // Add the received value to totalReceivedETH
        this.totalReceivedETH = this.totalReceivedETH.add(msg_value);

        // Participant initial state record
        let participantRecord = this.getParticipantRecordByAddress(msg_sender);

        // Check if participant has previous contributions
        if (participantRecord.contributionsCount == 0) {
            // increase participant count
            this.participantCount++;

            // index
            this.participantsById[this.participantCount] = msg_sender;
        }

        // Record contribution into current stage totals for the participant
        this.recordNewContribution(msg_sender, msg_value);

        // If whitelisted, process the contribution automatically
        if (participantRecord.whitelisted == true) {
            this.acceptContributionsForAddress(msg_sender, this.ApplicationEventTypes.COMMITMENT_ACCEPTED);
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
        participantRecord.contributionsCount++;
        participantRecord.totalReceivedETH = participantRecord.totalReceivedETH.add(_receivedValue);

        // Update participant's per-stage stats
        const byStage = participantRecord.byStage[currentStage];
        byStage.totalReceivedETH = byStage.totalReceivedETH.add(_receivedValue);

        // Get the equivalent amount in tokens
        const newTokenAmount = this.getTokenAmountForEthAtStage(
            _receivedValue, currentStage
        );

        // Update participant's reserved tokens
        byStage.reservedTokens = byStage.reservedTokens.add(newTokenAmount);
        participantRecord.reservedTokens = participantRecord.reservedTokens.add(newTokenAmount);

        this.ApplicationEvent(
            this.ApplicationEventTypes.CONTRIBUTION_NEW,
            participantRecord.contributionsCount,
            _from,
            _receivedValue
        );
    }

    acceptContributionsForAddress(_from, _eventType) {

        
        const participantRecord = this.getParticipantRecordByAddress(_from);
        const currentStage = this.getCurrentStage();

        for (let i = 0; i <= currentStage; i++) {

            const stageId = i;
            const byStage = participantRecord.byStage[stageId];
            const processedTotals = participantRecord.committedETH.add(participantRecord.returnedETH);

            if (processedTotals.lt(participantRecord.totalReceivedETH)) {

                // handle the case when we have reserved more tokens than globally available
                participantRecord.reservedTokens = participantRecord.reservedTokens.sub(byStage.reservedTokens);
                byStage.reservedTokens = 0;

                // the maximum amount is equal to the total available ETH at the current stage
                const maxAcceptableValue = this.availableEthAtStage(currentStage);

                // the per stage accepted amount: totalReceivedETH - committedETH
                let newAcceptedValue = byStage.totalReceivedETH.sub(byStage.committedETH);
                let returnValue = new BN("0");

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest
                if (newAcceptedValue.gt(maxAcceptableValue)) {
                    newAcceptedValue = maxAcceptableValue;
                    returnValue = byStage.totalReceivedETH
                        .sub(byStage.returnedETH)
                        .sub(byStage.committedETH)
                        .sub(byStage.withdrawnETH)
                        .sub(newAcceptedValue);

                    // update return values
                    this.returnedETH = this.returnedETH.add(returnValue);
                    participantRecord.returnedETH = participantRecord.returnedETH.add(returnValue);
                    byStage.returnedETH = returnValue;
                }

                if (newAcceptedValue.gt(new BN("0"))) {

                    // update values by adding the new accepted amount
                    this.committedETH = this.committedETH.add(newAcceptedValue);
                    participantRecord.committedETH = participantRecord.committedETH.add(newAcceptedValue);
                    byStage.committedETH = byStage.committedETH.add(newAcceptedValue);

                    // calculate the equivalent token amount
                    const newTokenAmount = this.getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    // update participant's token amounts
                    participantRecord.boughtTokens = participantRecord.boughtTokens.add(newTokenAmount);
                    byStage.boughtTokens = byStage.boughtTokens.add(newTokenAmount);

                    // allocate tokens to participant
                    this.IERC777().send(this.contractAddress, _from, newTokenAmount);
                }

                // if the incoming amount is too big to accept, then...
                // ... we must tranfer back the difference.
                if (returnValue.gt(new BN("0"))) {
                    this.address(this.uint160(_from)).transfer(returnValue);
                    this.TransferEvent(this.TransferTypes.AUTOMATIC_RETURN, _from, returnValue);
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

    getProjectAvailableEth() {

        let remainingFromAllocation = new BN("0");
        // Calculate the amount of allocated ETH, not withdrawn yet
        if (this.projectAllocatedETH.gt(this.projectWithdrawnETH)) {
            remainingFromAllocation = projectAllocatedETH.sub(projectWithdrawnETH);
        }

        // Calculate ETH that is globally available:
        // Available = accepted - withdrawn - projectWithdrawn - projectNotWithdrawn
        let globalAvailable = this.committedETH
            .sub(this.withdrawnETH)
            .sub(this.projectWithdrawnETH)
            .sub(this.remainingFromAllocation);

        // Multiply the available ETH with the percentage that belongs to the project now
        let unlocked = globalAvailable.mul(
            getCurrentUnlockPercentage()
        ).div(10 ** 20);

        // Available = unlocked + projectNotWithdrawn
        return unlocked.add(remainingFromAllocation);
    }

    whitelist(_address, _approve) {
        const participantRecord = this.getParticipantRecordByAddress(_address);

        if (_approve) {
            // If participants are approved: whitelist them and accept their contributions
            participantRecord.whitelisted = true;
            this.acceptContributionsForAddress(_address, this.ApplicationEventTypes.WHITELIST_APPROVE);
        } else {
            // If participants are not approved: remove them from whitelist and cancel their contributions
            participantRecord.whitelisted = false;
            this.cancelContributionsForAddress(_address, 0, this.ApplicationEventTypes.WHITELIST_REJECT);
        }
    }

    getLockedTokenAmount(_address) {
        const participantRecord = this.getParticipantRecordByAddress(_address);

        // Since we want to display token amounts even when they are not already
        // transferred to their accounts, we use reserved + bought
        return this.getLockedTokenAmountAtBlock(
            participantRecord.reservedTokens.add(participantRecord.boughtTokens),
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
        if (this.getLockedTokenAmount(_address).gt(new BN("0"))) {
            return true;
        }
        return false;
    }

    hasPendingETH(_address) {
        const participantAvailableETH = this.getParticipantAvailableETH(_address);
        if(participantAvailableETH > 0) {
            return true;
        }
        return false;
    }

    getParticipantAvailableETH(_from) {
        const participantRecord = this.getParticipantRecordByAddress(_from);
        return participantRecord.totalReceivedETH
            .sub(participantRecord.returnedETH)
            .sub(participantRecord.committedETH)
            .sub(participantRecord.withdrawnETH);
    }

    cancelContributionsForAddress(_from, _value, _eventType) {

        // Participant should only be able to cancel if they haven't been whitelisted yet...
        // ...but just to make sure take withdrawn and returned into account.
        // This is to handle the case when whitelist controller whitelists someone, then rejects...
        // ...then whitelists them again.
        const participantRecord = this.getParticipantRecordByAddress(_from);

        // Calculate participant's available ETH i.e. committed - withdrawnETH - returnedETH
        const participantAvailableETH = participantRecord.totalReceivedETH
            .sub(participantRecord.withdrawnETH)
            .sub(participantRecord.returnedETH);

        if (participantAvailableETH.gt(new BN("0"))) {
            // update total ETH returned
            // since this balance was never actually "accepted" it counts as returned...
            // ...so it does not interfere with project withdraw calculations
            this.returnedETH = this.returnedETH.add(participantAvailableETH);

            // update participant's audit values
            participantRecord.reservedTokens = 0;
            participantRecord.withdrawnETH = participantRecord.withdrawnETH.add(participantAvailableETH);

            // transfer ETH back to participant including received value
            this.address(this.uint160(_from)).transfer(participantAvailableETH.add(new BN(_value)));

            let currentTransferEventType;
            if (_eventType == this.ApplicationEventTypes.WHITELIST_REJECT) {
                currentTransferEventType = this.TransferTypes.WHITELIST_REJECT;
            } else if (_eventType == this.ApplicationEventTypes.PARTICIPANT_CANCEL) {
                currentTransferEventType = this.TransferTypes.PARTICIPANT_CANCEL;
            }

            // event emission
            this.TransferEvent(currentTransferEventType, _from, participantAvailableETH);
            this.ApplicationEvent(
                _eventType,
                participantRecord.contributionsCount,
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
            const maxLocked = this.getLockedTokenAmount(_from);
            let returnTokenAmount;
            let allocatedEthAmount;

            // if returned amount is greater than the locked amount...
            // set it equal to locked, keep track of the overflow tokens (remainingTokenAmount)
            if (remainingTokenAmount.gt(maxLocked)) {
                returnTokenAmount = remainingTokenAmount.sub(maxLocked);
                remainingTokenAmount = maxLocked;
            }

            // decrease the total allocated ETH by the equivalent participant's allocated amount
            this.projectAllocatedETH = projectAllocatedETH.sub(participantRecord.allocatedETH);

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
                    const totalInStage = participantRecord.byStage[stageId].reservedTokens
                        .add(participantRecord.byStage[stageId].boughtTokens)
                        .sub(participantRecord.byStage[stageId].returnedTokens);

                    // calculate how many tokens are actually locked at this stage...
                    // ...(at the current block number) and use only those for returning.
                    // reserved + bought - returned (at currentStage & currentBlock)
                    let tokensInStage = getLockedTokenAmountAtBlock(
                        participantRecord.byStage[stageId].reservedTokens.add(participantRecord.byStage[stageId].boughtTokens),
                        currentBlockNumber
                    ).sub(participantRecord.byStage[stageId].returnedTokens);

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
                        participantRecord.byStage[stageId].returnedTokens = participantRecord.byStage[stageId].returnedTokens.add(tokensInStage);

                        // increase the corresponding ETH counters
                        returnETHAmount = returnETHAmount.add(currentETHAmount);
                        participantRecord.byStage[stageId].withdrawnETH = participantRecord.byStage[stageId].withdrawnETH.add(currentETHAmount);

                        // allocated to project
                        const unlockedETHAmount = getEthAmountForTokensAtStage(
                            totalInStage.sub(tokensInStage), // unlocked token amount
                            stageId
                        );

                        this.allocatedEthAmount = this.allocatedEthAmount.add(unlockedETHAmount);
                        participantRecord.byStage[stageId].allocatedETH = unlockedETHAmount;

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
                    IERC777(tokenContractAddress).send(_from, returnTokenAmount, null);
                }

                // increase participant's withdrawnETH counter
                participantRecord.withdrawnETH = participantRecord.withdrawnETH.add(returnETHAmount);

                // Update total ETH withdrawn
                this.withdrawnETH = this.withdrawnETH.add(returnETHAmount);

                // allocate remaining ETH to project directly
                participantRecord.allocatedETH = allocatedEthAmount;
                this.projectAllocatedETH = this.projectAllocatedETH.add(participantRecord.allocatedETH);

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
        const unlocked = this.getProjectAvailableEth();

        // Update stats:  number of project withdrawals, total amount withdrawn by the project
        this.projectWithdrawCount++;
        this.projectWithdrawnETH = this.projectWithdrawnETH.add(_ethAmount);

        // Transfer ETH to project wallet
        address(uint160(projectWalletAddress)).transfer(_ethAmount);

        // Event emission
        ApplicationEvent(
            ApplicationEventTypes.PROJECT_WITHDRAW,
            projectWithdrawCount,
            projectWalletAddress,
            _ethAmount
        );
        TransferEvent(
            TransferTypes.PROJECT_WITHDRAW,
            projectWalletAddress,
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
            variable.byStage[i] = clone(ParticipantDetailsByStage);
        }
        return variable;
    }

    getParticipantRecordByAddress(_address) {
        const record = this.participantsByAddress[_address];
        if (!record) {
            this.participantsByAddress[_address] = this.setupNewParticipant();
        }
        return this.participantsByAddress[_address];
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
