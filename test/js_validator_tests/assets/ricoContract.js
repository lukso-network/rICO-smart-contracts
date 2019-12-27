/*
 * The test participant class.
 *
 * @author Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
*/

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
    byStage:[],
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

class Contract extends Validator {

    // set the defaults
    constructor(settings) {
        super(settings);

        this.participantsByAddress = [];
        this.participantsById = [];
        this.participantCount = 0;

        this.projectAllocatedETH = new BN("0");
        this.projectWithdrawnETH = new BN("0");
        this.committedETH = new BN("0");
        this.withdrawnETH = new BN("0");        
        this.totalReceivedETH = new BN("0");

        this.ApplicationEventTypes = {
            "NOT_SET"               :0,
            "CONTRIBUTION_NEW"      :1,
            "CONTRIBUTION_CANCEL"   :2,
            "PARTICIPANT_CANCEL"    :3,
            "COMMITMENT_ACCEPTED"   :4,
            "WHITELIST_APPROVE"     :5,
            "WHITELIST_REJECT"      :6,
            "PROJECT_WITHDRAW"      :7
        }
    

        this.contractAddress = "ricoContractAddress";
        this.deployerAddress = "deployerAddress";
        
        this.TokenContract = new TokenContract(
            setup.settings.token.supply.toString(),
            this.deployerAddress
        );

        this.TokenContract.send(
            this.deployerAddress, 
            this.contractAddress, 
            setup.settings.token.sale.toString()
        );
        
    }

    IERC777(_address = null) {
        return this.TokenContract("ricoContractAddress");
    }

    address(_to) {

    }

    setupNewParticipant() {
        const variable = {... Participant};
        for (let i = 0; i <= this.StageCount; i++) {
            variable.byStage[i] = {... ParticipantDetailsByStage};
        }
        return variable;
    }

    commit(msg_sender, msg_value) {

        // Add to received value to totalReceivedETH
        this.totalReceivedETH = this.totalReceivedETH.add(msg_value);

        // Participant initial state record
        let participantRecord = this.participantsByAddress[msg_sender];

        // initialize js only
        if (!participantRecord) {
            this.participantsByAddress[msg_sender] = this.setupNewParticipant();
            participantRecord = this.participantsByAddress[msg_sender];
        }

        // Check if participant already exists
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

    recordNewContribution( _from, _receivedValue) {
        const currentStage = this.getCurrentStage();
        const participantRecord = this.participantsByAddress[_from];

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

    acceptContributionsForAddress( _from, _eventType) {
        const participantRecord = this.participantsByAddress[_from];
        const currentStage = this.getCurrentStage();

        for ( i = 0; i <= currentStage; i++) {

            const stageId = i;
            const byStage = participantRecord.byStage[stageId];
            const processedTotals = participantRecord.committedETH.add( this.participantRecord.returnedETH );

            if (processedTotals.lt(participantRecord.totalReceivedETH)) {

                // handle the case when we have reserved more tokens than globally available
                participantRecord.reservedTokens = participantRecord.reservedTokens.sub(byStage.reservedTokens);
                byStage.reservedTokens = 0;

                // the maximum amount is equal to the total available ETH at the current stage
                const maxAcceptableValue = availableEthAtStage(currentStage);

                // the per stage accepted amount: totalReceivedETH - committedETH
                let newAcceptedValue = byStage.totalReceivedETH.sub(byStage.committedETH);
                let returnValue;

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest
                if (newAcceptedValue > maxAcceptableValue) {
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
                    const newTokenAmount = getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    // update participant's token amounts
                    participantRecord.boughtTokens = participantRecord.boughtTokens.add(newTokenAmount);
                    byStage.boughtTokens = byStage.boughtTokens.add(newTokenAmount);

                    // allocate tokens to participant
                    this.IERC777().send( this.contractAddress, _from, newTokenAmount);
                }

                // if the incoming amount is too big to accept, then...
                // ... we must tranfer back the difference.
                if (returnValue.gt(new BN("0"))) {
                    address(_from).transfer(returnValue);
                    TransferEvent(TransferTypes.AUTOMATIC_RETURN, _from, returnValue);
                }

                this.ApplicationEvent(_eventType, stageId, _from, newAcceptedValue);
            }
        }
    }

    availableEthAtStage(_stage) {
        // Multiply the number of tokens held by the contract with the token price
        // at the specified stage and perform precision adjustments(div).
        return IERC777().balanceOf( this.contractAddress ).mul(
            stages[_stage].tokenPrice
        ).div(10 ** 18);
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


    projectWithdraw(_ethAmount) {

    }


    ApplicationEvent(_type, _id, _address, _value) {
        // call this listeners for _type
        console.log("ApplicationEvent: ", _type, _id, _address, _value);
    }

}



module.exports = Contract;
