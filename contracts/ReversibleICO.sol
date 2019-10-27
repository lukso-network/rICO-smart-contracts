/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

import "./zeppelin/math/SafeMath.sol";
import "./zeppelin/token/ERC777/IERC777.sol";
import "./zeppelin/token/ERC777/IERC777Recipient.sol";
import "./zeppelin/introspection/IERC1820Registry.sol";

contract ReversibleICO is IERC777Recipient {

    using SafeMath for uint256;

    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    address public TokenTrackerAddress;
    IERC777 public TokenTracker;

    address public whitelistControllerAddress;
    address public projectWalletAddress;

    /*
    *   Contract Settings
    */
    uint256 public StartBlock;
    uint256 public DistributionStartBlock;
    uint256 public DistributionBlockLength;
    uint256 public EndBlock;

    uint256 public TokenSupply = 0;

    // uint256 public maxEth = 30000 ether;
    uint256 public receivedETH = 0;
    uint256 public returnedETH = 0;
    uint256 public acceptedETH = 0;
    uint256 public withdrawnETH = 0;

    // commited eth
    uint256 public contributorsETH = 0;

    uint256 public projectETH = 0;
    uint256 public projectETHWithdrawn = 0;

    // minimum amount of eth we accept for a contribution
    // everything lower will trigger a withdraw
    uint256 public minContribution = 0.001 ether;

    /*
    *   Allocation period
    */
    uint256 public AllocationPrice;
    uint256 public AllocationBlockCount;
    uint256 public AllocationEndBlock;
    uint256 public StageBlockCount;

    /*
    *   Contract Stages
    */
    struct ContractStage {
        uint256 start_block;
        uint256 end_block;
        uint256 token_price;
    }

    mapping ( uint8 => ContractStage ) public StageByNumber;
    uint8 public ContractStageCount = 0;

    /*
    *   Addresses
    */
    address public deployerAddress;

    /*
    *   Internals
    */
    bool public initialized = false;
    bool public running = false;
    bool public frozen = false;
    bool public ended = false;

    /*
    *   When a user cancels their contribution, delete the mapping or keep it and set it's state to CANCELLED
    */
    bool public contributionCleanupAtWithdraw = false;

    enum Stages {
        DEPLOYED,
        INITIALIZED,
        SALE,
        RICO,
        ENDED,
        FROZEN
    }

    constructor() public {
        deployerAddress = msg.sender;
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }

    // fallback function
    function ()
        external
        payable
        requireInitialized
        requireNotFrozen
    {
        if(msg.value >= minContribution) {
            // accept contribution for processing
            commit();
        } else {
            // Participant cancels commitment duiring Allocation Stage if they've not been whitelisted yet.
            cancel();
        }
    }

    function addSettings(
        address _TokenTrackerAddress,
        address _whitelistControllerAddress,
        address _projectWalletAddress,
        uint256 _StartBlock,
        uint256 _AllocationBlockCount,
        uint256 _AllocationPrice,
        uint8   _StageCount,
        uint256 _StageBlockCount,
        uint256 _StagePriceIncrease
    )
        public
        onlyDeployer
        requireNotInitialized
    {
        // addresses
        TokenTrackerAddress = _TokenTrackerAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        projectWalletAddress = _projectWalletAddress;

        // initialize ERC777 TokenTracker
        TokenTracker = IERC777(TokenTrackerAddress);

        // Allocation settings
        StartBlock = _StartBlock;
        AllocationBlockCount = _AllocationBlockCount;
        AllocationEndBlock = StartBlock + AllocationBlockCount;
        AllocationPrice = _AllocationPrice;

        StageBlockCount = _StageBlockCount;

        // first stage is allocation. Set it up.
        ContractStage storage StageRecord = StageByNumber[ContractStageCount];
        StageRecord.start_block = _StartBlock;
        StageRecord.end_block = _StartBlock + _AllocationBlockCount;
        StageRecord.token_price = _AllocationPrice;
        ContractStageCount++;

        uint256 lastStageBlockEnd = StageRecord.end_block;

        // calculate block ranges and set price for each period
        for(uint8 i = 1; i <= _StageCount; i++) {

            StageRecord = StageByNumber[ContractStageCount];
            StageRecord.start_block = lastStageBlockEnd + 1;
            StageRecord.end_block = lastStageBlockEnd + _StageBlockCount + 1;
            StageRecord.token_price = _AllocationPrice + ( _StagePriceIncrease * (i) );
            ContractStageCount++;

            lastStageBlockEnd = StageRecord.end_block;
        }

        EndBlock = lastStageBlockEnd;

        DistributionStartBlock = AllocationEndBlock + 1;
        DistributionBlockLength = lastStageBlockEnd - DistributionStartBlock;

        initialized = true;
    }

    /*
        Do we want to normalise for gas usage ?!
        ( ie. add useless computation just to have the same gas used at all times ? )

        22023 - Case 1: lower than allocation end
        22797 - Case 2: lower than stage[X].end_block
        22813 - Case 3: exactly at stage[X].end_block

        Doing an interation and validating on each item range can go upto 37391 gas for 13 stages.
    */
    function getCurrentStage() public view returns ( uint8 ) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    function getStageAtBlock(uint256 selectedBlock) public view returns ( uint8 ) {

        // *NOTE: if selectedBlock is end block.. the user will get the correct
        //        stage now but their new transaction will end up in the
        //        next block which changes the stage vs what they've seen..
        //        resulting in a different purchase price.
        //
        // @TODO: decide how we want to handle this on the frontend,
        //        contract should always display proper data.
        //
        if ( selectedBlock <= AllocationEndBlock ) {
            return 0;
        }

        // solidity floors division results, thus we get what we're looking for.
        uint256 num = (selectedBlock - AllocationEndBlock) / (StageBlockCount + 1) + 1;

        // last block of each stage always computes as stage + 1
        if(StageByNumber[uint8(num)-1].end_block == selectedBlock) {
            // save some gas and just return instead of decrementing.
            return uint8(num - 1);
        }

        // return max_uint8 if outside range
        // @TODO: maybe revert ?!
        if(num >= ContractStageCount ) {
            return 255;
        }

        return uint8(num);
    }

    function getCurrentPrice() public view returns ( uint256 ) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    function getPriceAtBlock(uint256 blockNumber) public view returns ( uint256 ) {
        uint8 stage = getStageAtBlock(blockNumber);
        if(stage < ContractStageCount ) {
            return StageByNumber[stage].token_price;
        }
        // revert with stage not found?
        return 0;
    }

    // Since our tokens cost less than 1 eth, and decimals are 18
    // 1 wei will always buy something.
    function getTokenAmountForEthAtStage(
        uint256 _ethValue,
        uint8 _stageId
    )
    public view returns (uint256)
    {
        // add token decimals to value before division, that way we increase precision.
        // return (_ethValue * (10 ** 18)) / StageByNumber[_stageId].token_price;
        return _ethValue.mul(
            (10 ** 18)
        ).div( StageByNumber[_stageId].token_price );
    }

    function getEthAmountForTokensAtStage(
        uint256 _token_amount,
        uint8 _stageId
    )
    public view returns (uint256)
    {
        // return (_token_amount / StageByNumber[_stageId].token_price) / (10 ** 18));
        return _token_amount.mul(
            StageByNumber[_stageId].token_price
        ).div(
            (10 ** 18)
        );
    }

    /*
    *   Participants
    */

    event ExitEvent (
        address indexed _participant,
        uint256 indexed _token_amount,
        uint256 indexed _eth_amount,
        uint8 _type,
        bool is_partial
    );

    event DebugEvent (
        uint256 indexed _id,
        uint256 indexed a,
        uint256 indexed b,
        bool _type
    );

    struct Contribution {
        uint256 value;
        uint256 received;
        uint256 returned;
        uint256 block;
        uint256 tokens;
        uint8   stageId;
        uint8   state;
    }

    enum ApplicationEventTypes {
        NOT_SET,        // will match default value of a mapping result
        CONTRIBUTION_NEW,
        CONTRIBUTION_CANCEL,
		PARTICIPANT_CANCEL,
		WHITELIST_CANCEL,
		WHITELIST_ACCEPT,
        COMMIT_ACCEPT
    }

    event ApplicationEvent (
        uint8 indexed _type,
        uint16 indexed _id,
        address indexed _from,
        uint256 _value
    );

    enum TransferTypes {
        NOT_SET,
        AUTOMATIC_RETURN,
        WHITELIST_CANCEL,
        PARTICIPANT_CANCEL,
        PARTICIPANT_WITHDRAW,
        PROJECT_WITHDRAW
    }

    event TransferEvent (
        uint8 indexed _type,
        address indexed _to,
        uint256 indexed _value
    );


    struct TotalsByStage {
        uint256 received;		    // msg.value
        uint256 returned;		    // received - accepted
        uint256 accepted;		    // lower than msg.value if maxCap already reached
        uint256 withdrawn;		    // withdrawn from current stage
        uint256 tokens_reserved;    // tokens bought in this stage
        uint256 tokens_awarded;	    // tokens already sent to the user in this stage
    }

    struct Participant {

        uint256 contributed_amount;
        uint256 accepted_amount;
        uint256 withdrawn_amount;
        uint256 available_amount;
        uint256 token_amount;
        mapping ( uint16 => Contribution ) contributions;

        bool   whitelisted;
        uint16  contributionsCount;
        uint256 received;	        // msg.value
        uint256 returned;	        // received - accepted
        uint256 accepted;	        // lower than msg.value if maxCap already reached
        uint256 withdrawn;	        // cancel() / withdraw()
        uint256 tokens_reserved;    // tokens bought in all stages
        uint256 tokens_awarded;	    // tokens already sent to the user in all stages
        mapping ( uint8 => TotalsByStage ) byStage;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 public ParticipantCount = 0;

    /*
    *   Recalculate Funds allocation
    */
    function availableEth() public view returns (uint256) {
        return TokenTracker.balanceOf(address(this)).mul(
            StageByNumber[getCurrentStage()].token_price
        ).div( 10 ** 18 );
    }

    /*
    *   Participant commits funds
    */
    function commit()
        internal
        requireInitialized
        requireNotFrozen
    {
        // add to received value to receivedETH
        receivedETH += msg.value;

        // Participant initial state record
        Participant storage ParticipantRecord = ParticipantsByAddress[msg.sender];

        // Check if participant already exists
        if(ParticipantRecord.contributionsCount == 0) {
            // increase participant count
            ParticipantCount++;

            // index
            ParticipantsById[ParticipantCount] = msg.sender;
        }

        // record contribution into current stage totals for the participant
        recordNewContribution(msg.sender, msg.value);

        // if whitelisted, process the contribution automatically
        if(ParticipantRecord.whitelisted == true) {
            acceptContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.COMMIT_ACCEPT));
        }
    }

    /// @dev
    /// just records every contribution
    /// does not return anything or care about overselling
    function recordNewContribution(address _receiver, uint256 _ReceivedValue)
        internal
    {
        uint8 currentStage = getCurrentStage();
        Participant storage ParticipantRecord = ParticipantsByAddress[_receiver];

        // per account
        ParticipantRecord.contributionsCount++;
        ParticipantRecord.received += _ReceivedValue;

        // per stage
        TotalsByStage storage byStage = ParticipantRecord.byStage[currentStage];
        byStage.received += _ReceivedValue;

        // add contribution tokens to totals
        // these will change when contribution is accepted if we hit max cap
        uint256 newTokenAmount = getTokenAmountForEthAtStage(
            _ReceivedValue, currentStage
        );
        byStage.tokens_reserved += newTokenAmount;
        ParticipantRecord.tokens_reserved += newTokenAmount;

        emit ApplicationEvent(
            uint8(ApplicationEventTypes.CONTRIBUTION_NEW),
            ParticipantRecord.contributionsCount,
            _receiver,
            _ReceivedValue
        );
    }

    function acceptContributionsForAddress(
        address _receiver,
        uint8 _event_type
    )
        internal
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[_receiver];

        uint8 currentStage = getCurrentStage();
        for(uint8 i = 0; i <= currentStage; i++) {
            uint8 _stageId = i;

            TotalsByStage storage byStage = ParticipantRecord.byStage[_stageId];

            uint256 processedTotals = ParticipantRecord.accepted + ParticipantRecord.returned;

            if(processedTotals < ParticipantRecord.received) {

                // handle the case when we have reserved more tokens than globally available
                ParticipantRecord.tokens_reserved -= byStage.tokens_reserved;
                byStage.tokens_reserved = 0;

                uint256 MaxAcceptableValue = availableEth();

                uint256 NewAcceptedValue = byStage.received - byStage.accepted;
                uint256 ReturnValue = 0;

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest

                if(NewAcceptedValue > MaxAcceptableValue) {
                    NewAcceptedValue = MaxAcceptableValue;
                    ReturnValue = byStage.received - byStage.returned - byStage.accepted -
                                byStage.withdrawn - NewAcceptedValue;

                    // return values
                    returnedETH += ReturnValue;
                    ParticipantRecord.returned += ReturnValue;
                    byStage.returned = ReturnValue;
                }

                if(NewAcceptedValue > 0) {

                    // Globals add to processed value to acceptedETH
                    acceptedETH += NewAcceptedValue;
                    ParticipantRecord.accepted += NewAcceptedValue;

                    byStage.accepted += NewAcceptedValue;

                    uint256 newTokenAmount = getTokenAmountForEthAtStage(
                        NewAcceptedValue, _stageId
                    );

                    byStage.tokens_awarded += newTokenAmount;
                    ParticipantRecord.tokens_awarded += newTokenAmount;

                    // allocate tokens to participant
                    bytes memory data;
                    // solium-disable-next-line security/no-send
                    TokenTracker.send(_receiver, newTokenAmount, data);
                }

                // if stored value is too high to accept we then have
                // a return value we must send back to our participant.
                if(ReturnValue > 0) {
                    address(uint160(_receiver)).transfer(ReturnValue);
                    emit TransferEvent(uint8(TransferTypes.AUTOMATIC_RETURN), _receiver, ReturnValue);
                }

                emit ApplicationEvent(_event_type, _stageId, _receiver, NewAcceptedValue);
            }
        }
    }

    function cancelContributionsForAddress(
        address _receiver,
        uint8 _event_type
    )
        internal
    {

        Participant storage ParticipantRecord = ParticipantsByAddress[_receiver];
        // one should only be able to cancel if they haven't been whitelisted

        // but just to make sure take withdrawn and returned into account.
        // to handle the case when whitelister whitelists someone, then rejects
        // them, then whitelists them back
        uint256 ParticipantAvailableEth = ParticipantRecord.received -
                                          ParticipantRecord.withdrawn -
                                          ParticipantRecord.returned;

        if(ParticipantAvailableEth > 0) {
            // Adjust globals
            returnedETH += ParticipantAvailableEth;

            // @TODO: update globals for projectWithdraw

            // Set Participant audit values
            ParticipantRecord.tokens_reserved = 0;
            ParticipantRecord.withdrawn += ParticipantAvailableEth;

            // @TODO: Reset stage records ?

            // send eth back to participant including received value
            address(uint160(_receiver)).transfer(ParticipantAvailableEth + msg.value);

            uint8 currentTransferEventType = 0;
            if(_event_type == uint8(ApplicationEventTypes.WHITELIST_CANCEL)) {
                currentTransferEventType = uint8(TransferTypes.WHITELIST_CANCEL);
            } else if (_event_type == uint8(ApplicationEventTypes.PARTICIPANT_CANCEL)) {
                currentTransferEventType = uint8(TransferTypes.PARTICIPANT_CANCEL);
            }
            emit TransferEvent(currentTransferEventType, _receiver, ParticipantAvailableEth);

            emit ApplicationEvent(
                _event_type,
                ParticipantRecord.contributionsCount,
                _receiver,
                ParticipantAvailableEth
            );
        } else {
            revert("cancel: Participant has not contributed any eth.");
        }
    }

    /*
    *   Recalculate Funds allocation
    */
    function recalculateFunds() internal
    // solium-disable-next-line no-empty-blocks
    {
        //
    }

    /*
    *   Participant cancels commitment if they've not been whitelisted yet.
    */
    function cancel()
        public
        payable
        requireInitialized
        requireNotFrozen
    {
        if(ParticipantsByAddress[msg.sender].whitelisted == true) {
            revert("cancel: Please send tokens back to this contract in order to withdraw ETH.");
        }

        if(canCancelBySendingEthToContract(msg.sender)) {
            cancelContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.PARTICIPANT_CANCEL));
            return;
        }
        revert("cancel: Participant has no contributions.");
    }

    /*
    *   Return cancel modes for a participant address, frontend only
    */
    function getCancelModeStates(address participantAddress)
        external
        view
        returns ( bool byEth, bool byTokens )
    {
        byEth = false;
        byTokens = false;

        Participant storage ParticipantRecord = ParticipantsByAddress[participantAddress];
        if(ParticipantRecord.whitelisted == true) {
            // byEth remains false as they need to send tokens back.
            byTokens = canCancelBySendingTokensBack(participantAddress);
        } else {
            // byTokens remains false as the participant should have no tokens to send back anyway.
            byEth = canCancelBySendingEthToContract(participantAddress);
        }
    }

    function canCancelBySendingTokensBack(address participantAddress)
        public
        view
        returns ( bool )
    {
        if( TokenTracker.balanceOf(address(participantAddress)) > 0 &&
            ParticipantsByAddress[participantAddress].accepted > 0
        ) {
            return true;
        }
        return false;
    }

    function canCancelBySendingEthToContract(address participantAddress)
        public
        view
        returns ( bool )
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[participantAddress];

        if( ParticipantRecord.received > 0 && ParticipantRecord.received > ParticipantRecord.returned ) {
            return true;
        }

        /*
        // ParticipantRecord.amount_accepted only available after whitelisting, so we need to check all contributions
        uint256 ParticipantAvailableEth = 0;
        for( uint16 i = 0; i < ParticipantRecord.contributionsCount; i++ ) {
            Contribution storage ContributionRecord = ParticipantRecord.contributions[i];
            if(ContributionRecord.state == uint8(ContributionStates.NOT_PROCESSED)) {
                ParticipantAvailableEth += ContributionRecord.value;
            }
        }

        if(ParticipantAvailableEth > 0 && ParticipantAvailableEth <= ParticipantRecord.contributed_amount) {
            return true;
        }
        */
        return false;
    }

    /*
    *   Withdraw ( ERC777TokensRecipient method )
    */
    function withdraw(address _from, uint256 _token_amount) internal returns (bool) {

        // Whitelisted contributor sends tokens back to the RICO contract
        // - unlinke cancel() method, this allows variable amounts.
        // - latest contributions get returned first.

        Participant storage ParticipantRecord = ParticipantsByAddress[_from];
        if(ParticipantRecord.whitelisted == true) {

            uint256 withdrawValue = 0;
            // get amount of locked tokens
            // uint256 lockedTokens = getLockedTokenAmount(_from);

            // for each stage
            /*
            getEthAmountForTokensAtStage(
                    uint256 _token_amount,
                    uint8 _stageId
                )
            */

            uint256 amt = ParticipantRecord.tokens_awarded;
            ParticipantRecord.tokens_awarded = amt.sub(_token_amount);

            // get amount per stage starting from the end

            // if a new contribution happens after a withdraw we need to make sure it's taken into account

            // based on how much has been returned so far ( could be 0 )
            // find our starting price point for tokens

            /*
            uint256 startingAmount = Participant.withdrawn_amount;

            uint256 tokensInLoop = 0;
            uint256 ethInLoop = 0;

            for( uint8 i = ContractStageCount; i > 0; i--) {
                tokensInLoop += Participant.byStage[i];
                break;
            }
            */

            // index stage amounts
            // uint256[] ethAmountPerStage;

            // based on token_amount, find the

            emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _from, withdrawValue);
            return true;
        }

        // If address is not Whitelisted a call to this results in a revert
        revert("withdraw: Withdraw not possible. Participant has no locked tokens.");
    }

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    )
        external
        requireInitialized
        // requireNotFrozen
        // requireNotEnded
    {
        // Rico should only receive tokens from the Rico Token Tracker.
        // any other transaction should revert
        require(msg.sender == address(TokenTracker), "ERC777TokensRecipient: Invalid token");

        // 2 cases
        if(from == projectWalletAddress) {
            // 1 - project wallet adds tokens to the sale
            // Save the token amount allocated to this address
            TokenSupply += amount;

        } else {

            // 2 - rico contributor sends tokens back
            withdraw(from, amount);
        }
    }


    /*
    *   Whitelisting or Rejecting
    */
    function whitelistOrReject(
        address _address,
        uint8 _mode
    )
        public
        requireInitialized
        requireNotFrozen
        onlyWhitelistController
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[_address];

        if(_mode == uint8(ApplicationEventTypes.WHITELIST_ACCEPT)) {
            ParticipantRecord.whitelisted = true;

            // accept all contributions
            acceptContributionsForAddress(_address, _mode);

        } else if(_mode == uint8(ApplicationEventTypes.WHITELIST_CANCEL)) {
            ParticipantRecord.whitelisted = false;

            // cancel all contributions
            cancelContributionsForAddress(_address, _mode);

        } else {
            revert("whitelistOrReject: invalid mode specified.");
        }

    }

    /*
    *   Whitelisting or Rejecting multiple addresses
    *   start is 0 / count is 10, should be fine for most
    *   for special cases we just use the whitelistOrReject method
    */
    function whitelistOrRejectMultiple(address[] memory _address, uint8 _mode) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            whitelistOrReject(_address[i], _mode);
        }
    }

    function isWhitelisted(address _address) public view returns ( bool ) {
        if(ParticipantsByAddress[_address].whitelisted == true) {
            return true;
        }
        return false;
    }

    /*
    *   Utils
    */
    // required so we can override when running tests
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
    }

    /*
    *   RICO Ratio methods:
    */

    /*
        Returns unlock ratio multiplied by 10 to the power of precision
        ( should be 20 resulting in 10 ** 20, so we can divide by 100 later and get 18 decimals )
    */
    function getCurrentUnlockRatio()
        public view
        returns(uint256)
    {
        uint8 precision = 20;
        uint256 currentBlock = getCurrentBlockNumber();

        if(currentBlock > DistributionStartBlock && currentBlock < EndBlock) {
            uint256 passedBlocks = currentBlock.sub(DistributionStartBlock);
            return passedBlocks.mul(
                10 ** uint256(precision)
            ).div(DistributionBlockLength);
        } else if (currentBlock >= EndBlock) {
            return 0; // 10 ** uint256(precision);
        } else {
            return 0; // 10 ** uint256(precision);
        }
    }

    /*
    *   ERC777 - get the amount of locked tokens at current block number
    */
    function getLockedTokenAmount(address _address) public view returns (uint256) {

        // since we want to display token amounts even when they're not already
        // transferred to their accounts, we use reserved + awarded

        uint256 tokenAmount = ParticipantsByAddress[_address].tokens_awarded +
                              ParticipantsByAddress[_address].tokens_reserved;

        // to lower gas costs, let's check if _address actually has any contributions.
        if(tokenAmount > 0) {

            uint256 currentBlock = getCurrentBlockNumber();

            // if before "development / distribution phase" ( stage 0 )
            //   - return all tokens bought through contributing.
            // if in development phase ( stage 1 to 12 )
            //   - calculate and return
            // else if after endBlock
            //   - return 0
            if(currentBlock < DistributionStartBlock) {

                // allocation phase
                return tokenAmount;

            } else if(currentBlock < EndBlock) {

                // distribution phase
                uint8 precision = 20;
                uint256 bought = tokenAmount;

                uint256 unlocked = bought.mul(
                        getCurrentUnlockRatio()
                    ).div(10 ** uint256(precision)
                );

                return bought.sub(unlocked);

            } else {

                // after contract end
                return 0;
            }
        } else {
            return 0;
        }
    }

    /*
    *   Project Withdraw
    */
    function projectWithdraw(uint256 ethAmount)
        public
        requireInitialized
        returns (bool)
    {
        require(msg.sender == projectWalletAddress, "only projectWalletAddress");

        require(ethAmount <= projectETH, "Specified ETH value too large.");


        /*
        // based on how many
        return bought.mul(
            getCurrentUnlockRatio(precision)
        ).div(10 ** uint256(precision));
        //
        */
    }

    /*
    *   Helpers
    */

    function ParticipantContributionDetails(
        address _address,
        uint16 contribution_id
    ) public view returns (
        uint256 _value,
        uint256 _received,
        uint256 _returned,
        uint256 _block,
        uint8 _stageId,
        uint8 _state,
        uint256 _tokens
    ) {
        //
        // direct call: ParticipantsByAddress[_address].contributions[contribution_id].value
        //
        // mapping to records vs calling directly yields lower gas usage

        Participant storage Record = ParticipantsByAddress[_address];
        Contribution storage ContributionRecord = Record.contributions[contribution_id];
        return (
            ContributionRecord.value,
            ContributionRecord.received,
            ContributionRecord.returned,
            ContributionRecord.block,
            ContributionRecord.stageId,
            ContributionRecord.state,
            ContributionRecord.tokens
        );
    }

    // direct call: ParticipantsByAddress[_address].byStage[_stageId]._accepted
    function ParticipantTotalsDetails(
        address _address,
        uint8 _stageId
    ) public view returns (
        uint256 received,
        uint256 returned,
        uint256 accepted,
        uint256 withdrawn,
        uint256 tokens_reserved,
        uint256 tokens_awarded
    ) {

        TotalsByStage storage TotalsRecord = ParticipantsByAddress[_address]
            .byStage[_stageId];

        return (
            TotalsRecord.received,
            TotalsRecord.returned,
            TotalsRecord.accepted,
            TotalsRecord.withdrawn,
            TotalsRecord.tokens_reserved,
            TotalsRecord.tokens_awarded
        );
    }


    /*
    *   Modifiers
    */

    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "onlyDeployer: Only deployer can call this method");
        _;
    }

    modifier onlyWhitelistController() {
        require(msg.sender == whitelistControllerAddress, "onlyWhitelistController: Only Whitelist Controller can call this method");
        _;
    }

    modifier requireInitialized() {
        require(initialized == true, "requireInitialized: Contract must be initialized");
        _;
    }

    modifier requireNotInitialized() {
        require(initialized == false, "requireInitialized: Contract must not be initialized");
        _;
    }

    modifier requireRunning() {
        require(ended == true, "requireRunning: RICO must be running");
        _;
    }

    modifier requireNotRunning() {
        require(ended == false, "requireRunning: RICO must not be running");
        _;
    }

    modifier requireEnded() {
        require(ended == true, "requireEnded: RICO period must have ended");
        _;
    }

    modifier requireNotEnded() {
        require(ended == false, "requireEnded: RICO period must not have ended");
        _;
    }

    modifier requireFrozen() {
        require(frozen == true, "requireFrozen: Contract must be frozen");
        _;
    }

    modifier requireNotFrozen() {
        require(frozen == false, "requireFrozen: Contract must not be frozen");
        _;
    }

}