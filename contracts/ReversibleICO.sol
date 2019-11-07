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

    /*
    *   Instances
    */
    using SafeMath for uint256;

    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    IERC777 public TokenContract;

    /*
    *   Addresses
    */
    address public deployerAddress;
    address public TokenContractAddress;
    address public projectWalletAddress;
    address public whitelistControllerAddress;

    /*
    *   Public Variables
    */
    uint256 public TokenSupply = 0;

    uint256 public committedETH = 0;
    uint256 public returnedETH = 0;
    uint256 public acceptedETH = 0;
    uint256 public withdrawnETH = 0;

    uint256 public projectWithdrawCount = 0;
    uint256 public projectETHAllocated = 0;
    uint256 public projectETHWithdrawn = 0;

    // minimum amount of eth we accept for a contribution
    // everything lower will trigger a withdraw, as well as sending back pending ETH
    uint256 public minContribution = 0.001 ether;

    /*
    *   Commit phase (Stage 0)
    */
    uint256 public commitPhasePrice;
    uint256 public commitPhaseStartBlock;
    uint256 public commitPhaseEndBlock;
    uint256 public commitPhaseBlockCount;

    uint256 public BuyPhaseStartBlock;
    uint256 public BuyPhaseEndBlock;
    uint256 public BuyPhaseBlockCount;
    uint256 public StageBlockCount;

    /*
    *   Buy phase (Stage 1-n)
    */
    struct Stage {
        uint256 start_block;
        uint256 end_block;
        uint256 token_price;
    }

    mapping ( uint8 => Stage ) public Stages;
    uint8 public StageCount = 0;

    /*
    *   Contract States
    */
    bool public initialized = false;
    bool public frozen = false;
    bool public started = false;
    bool public ended = false;


    // ------------------------------------------------------------------------------------------------


    // Constructor
    constructor() public {
        deployerAddress = msg.sender;
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }


    // FALLBACK function
    function ()
        external
        payable
        isInitialized
        isNotFrozen
    {
        // accept contribution for processing
        if(msg.value >= minContribution) {
            commit();

        // Participant cancels commitment during commit phase (Stage 0),
        // OR if they've not been whitelisted yet.
        } else {
            cancel();
        }
    }


    function init(
        address _TokenContractAddress,
        address _whitelistControllerAddress,
        address _projectWalletAddress,
        uint256 _commitPhaseStartBlock,
        uint256 _commitPhaseBlockCount,
        uint256 _commitPhasePrice,
        uint8   _StageCount,
        uint256 _StageBlockCount,
        uint256 _StagePriceIncrease
    )
        public
        onlyDeployer
        isNotInitialized
    {

        // Assign address variables
        TokenContractAddress = _TokenContractAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        projectWalletAddress = _projectWalletAddress;

        // Assign other variables
        commitPhaseStartBlock = _commitPhaseStartBlock;
        commitPhaseBlockCount = _commitPhaseBlockCount;
        commitPhaseEndBlock = _commitPhaseStartBlock + _commitPhaseBlockCount;
        commitPhasePrice = _commitPhasePrice;

        StageBlockCount = _StageBlockCount;


        // initialize ERC777 TokenContract
        TokenContract = IERC777(TokenContractAddress);


        // Setup stage 0: The commit phase.
        Stage storage Stage0 = Stages[StageCount]; // StageCount = 0
        Stage0.start_block = _commitPhaseStartBlock;
        Stage0.end_block = _commitPhaseStartBlock + _commitPhaseBlockCount;
        Stage0.token_price = _commitPhasePrice;

        StageCount++; // StageCount = 1


        // Setup stage 1 to n: The buy phase stages
        uint256 lastStageBlockEnd = Stage0.end_block;

        for(uint8 i = 1; i <= _StageCount; i++) {

            Stage storage StageN = Stages[StageCount]; // StageCount = n
            StageN.start_block = lastStageBlockEnd + 1;
            StageN.end_block = lastStageBlockEnd + _StageBlockCount + 1;
            StageN.token_price = _commitPhasePrice + ( _StagePriceIncrease * (i) );

            StageCount++; // StageCount = n + 1

            lastStageBlockEnd = StageN.end_block;
        }

        BuyPhaseStartBlock = commitPhaseEndBlock + 1;
        BuyPhaseEndBlock = lastStageBlockEnd;
        BuyPhaseBlockCount = lastStageBlockEnd - BuyPhaseStartBlock;

        initialized = true;
    }

    /*
        Do we want to normalise for gas usage ?!
        ( ie. add useless computation just to have the same gas used at all times ? )

        22023 - Case 1: lower than commit end
        22797 - Case 2: lower than stage[X].end_block
        22813 - Case 3: exactly at stage[X].end_block

        Doing an iteration and validating on each item range can go upto 37391 gas for 13 stages.
    */
    function getCurrentStage() public view returns ( uint8 ) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    function getStageAtBlock(uint256 _selectedBlock) public view returns ( uint8 ) {

        // *NOTE: if selectedBlock is end block.. the participant will get the correct
        //        stage now but their new transaction will end up in the
        //        next block which changes the stage vs what they've seen..
        //        resulting in a different purchase price.
        //
        // @TODO: decide how we want to handle this on the frontend,
        //        contract should always display proper data.
        //

        // return commit phase, stage 0
        if ( _selectedBlock <= commitPhaseEndBlock ) {
            return 0;
        }

        // find buy phase stage n
        // solidity floors division results, thus we get what we're looking for.
        uint256 num = (_selectedBlock - commitPhaseEndBlock) / (StageBlockCount + 1) + 1;

        // last block of each stage always computes as stage + 1
        if(Stages[uint8(num)-1].end_block == _selectedBlock) {
            // save some gas and just return instead of decrementing.
            return uint8(num - 1);
        }

        // return max_uint8 if outside range
        // @TODO: maybe revert ?!
        if(num >= StageCount) {
            return 255;
        }

        return uint8(num);
    }

    function getCurrentPrice() public view returns ( uint256 ) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    function getPriceAtBlock(uint256 blockNumber) public view returns ( uint256 ) {
        uint8 stage = getStageAtBlock(blockNumber);
        if(stage < StageCount) {
            return Stages[stage].token_price;
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
        // return (_ethValue * (10 ** 18)) / Stages[_stageId].token_price;
        return _ethValue.mul(
            (10 ** 18)
        ).div( Stages[_stageId].token_price );
    }

    function getEthAmountForTokensAtStage(
        uint256 _token_amount,
        uint8 _stageId
    )
    public view returns (uint256)
    {
        // return (_token_amount * Stages[_stageId].token_price) / (10 ** 18);
        return _token_amount.mul(
            Stages[_stageId].token_price
        ).div(
            (10 ** 18)
        );
    }

    /*
    *   Participants
    */
//
//    event ExitEvent (
//        address indexed _participant,
//        uint256 indexed _token_amount,
//        uint256 indexed _eth_amount,
//        uint8 _type,
//        bool is_partial
//    );
//
//    event DebugEvent (
//        uint256 indexed _id,
//        uint256 indexed a,
//        uint256 indexed b,
//        bool _type
//    );
//
//    struct Contribution {
//        uint256 value;
//        uint256 received;
//        uint256 returned;
//        uint256 block;
//        uint256 tokens;
//        uint8   stageId;
//        uint8   state;
//    }

    enum ApplicationEventTypes {
        NOT_SET,        // will match default value of a mapping result
        CONTRIBUTION_NEW,
        CONTRIBUTION_CANCEL,
		PARTICIPANT_CANCEL,
		WHITELIST_CANCEL,
		WHITELIST_ACCEPT,
        COMMIT_ACCEPT,
        PROJECT_WITHDRAW
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
        uint256 committed_eth;		    // msg.value
        uint256 returned_eth;		    // received - accepted_eth
        uint256 accepted_eth;		    // lower than msg.value if maxCap already reached
        uint256 withdrawn_eth;		    // withdrawn from current stage
        uint256 reserved_tokens;    // tokens bought in this stage
        uint256 bought_tokens;	    // tokens already sent to the participant in this stage
        uint256 returned_tokens;	// tokens returned by participant to contract
    }

    struct Participant {
        bool   whitelisted;
        uint16  contributionsCount;
        uint256 committed_eth;	        // msg.value
        uint256 returned_eth;	        // committed_eth - accepted_eth
        uint256 accepted_eth;	        // lower than msg.value if maxCap already reached
        uint256 withdrawn_eth;	        // cancel() / withdraw()
        uint256 reserved_tokens;    // total tokens bought in all stages
        uint256 bought_tokens;	    // total tokens already sent to the participant in all stages
        uint256 returned_tokens;    // total tokens returned by participant to contract in all stages
        mapping ( uint8 => TotalsByStage ) byStage;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 public ParticipantCount = 0;

    /*
    *   Recalculate Funds allocation
    */
    function availableEthAtStage(uint8 _stage) public view returns (uint256) {
        return TokenContract.balanceOf(address(this)).mul(
            Stages[_stage].token_price
        ).div( 10 ** 18 );
    }

    /*
    *   Participant commits funds
    */
    function commit()
        internal
        isInitialized
        isNotFrozen
    {
        // add to received value to committedETH
        committedETH += msg.value;

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
        ParticipantRecord.committed_eth += _ReceivedValue;

        // per stage
        TotalsByStage storage byStage = ParticipantRecord.byStage[currentStage];
        byStage.committed_eth += _ReceivedValue;

        // add contribution tokens to totals
        // these will change when contribution is accepted if we hit max cap
        uint256 newTokenAmount = getTokenAmountForEthAtStage(
            _ReceivedValue, currentStage
        );
        byStage.reserved_tokens += newTokenAmount;
        ParticipantRecord.reserved_tokens += newTokenAmount;

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

            uint256 processedTotals = ParticipantRecord.accepted_eth + ParticipantRecord.returned_eth;

            if(processedTotals < ParticipantRecord.committed_eth) {

                // handle the case when we have reserved more tokens than globally available
                ParticipantRecord.reserved_tokens -= byStage.reserved_tokens;
                byStage.reserved_tokens = 0;

                uint256 MaxAcceptableValue = availableEthAtStage(currentStage);

                uint256 NewAcceptedValue = byStage.committed_eth - byStage.accepted_eth;
                uint256 ReturnValue = 0;

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest

                if(NewAcceptedValue > MaxAcceptableValue) {
                    NewAcceptedValue = MaxAcceptableValue;
                    ReturnValue = byStage.committed_eth - byStage.returned_eth - byStage.accepted_eth -
                                byStage.withdrawn_eth - NewAcceptedValue;

                    // return values
                    returnedETH += ReturnValue;
                    ParticipantRecord.returned_eth += ReturnValue;
                    byStage.returned_eth = ReturnValue;
                }

                if(NewAcceptedValue > 0) {

                    // Globals add to processed value to acceptedETH
                    acceptedETH += NewAcceptedValue;
                    ParticipantRecord.accepted_eth += NewAcceptedValue;

                    byStage.accepted_eth += NewAcceptedValue;

                    uint256 newTokenAmount = getTokenAmountForEthAtStage(
                        NewAcceptedValue, _stageId
                    );

                    byStage.bought_tokens += newTokenAmount;
                    ParticipantRecord.bought_tokens += newTokenAmount;

                    // allocate tokens to participant
                    bytes memory data;
                    // solium-disable-next-line security/no-send
                    TokenContract.send(_receiver, newTokenAmount, data);
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
        uint256 ParticipantAvailableEth = ParticipantRecord.committed_eth -
                                          ParticipantRecord.withdrawn_eth -
                                          ParticipantRecord.returned_eth;

        if(ParticipantAvailableEth > 0) {
            // Adjust globals
            returnedETH += ParticipantAvailableEth;

            // Set Participant audit values
            ParticipantRecord.reserved_tokens = 0;
            ParticipantRecord.withdrawn_eth += ParticipantAvailableEth;

            // globals
            withdrawnETH += ParticipantAvailableEth;

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
    *   Participant can cancel their pending ETH commitment, if they've not been whitelisted yet.
    */
    function cancel()
        public
        payable
        isInitialized
        isNotFrozen
    {
        require(ParticipantsByAddress[msg.sender].whitelisted != true, "You can't cancel your ETH commitment after you got whitelisted, please send tokens to this contract in order to withdraw your ETH.");

        if(canCancelByEth(msg.sender)) {
            cancelContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.PARTICIPANT_CANCEL));
            return;
        }
        revert("Participant has no contributions.");
    }

    /*
    *   Return cancel modes for a participant address, informational only
    */
    function getCancelMode(address participantAddress)
        external
        view
        returns ( bool byEth, bool byTokens )
    {
        byEth = false;
        byTokens = false;

        Participant storage ParticipantRecord = ParticipantsByAddress[participantAddress];
        if(ParticipantRecord.whitelisted == true) {
            // byEth remains false as they need to send tokens back.
            byTokens = canCancelByTokens(participantAddress);
        } else {
            // byTokens remains false as the participant should have no tokens to send back anyway.
            byEth = canCancelByEth(participantAddress);
        }
    }

    function canCancelByTokens(address participantAddress)
        public
        view
        returns ( bool )
    {
        if(getLockedTokenAmount(participantAddress) > 0) {
            return true;
        }
        return false;
    }

    function canCancelByEth(address participantAddress)
        public
        view
        returns ( bool )
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[participantAddress];
        if( ParticipantRecord.committed_eth > 0 && ParticipantRecord.committed_eth > ParticipantRecord.returned_eth ) {
            return true;
        }
        return false;
    }

    /*
    *   Withdraw ( ERC777TokensRecipient method )
    */
    function withdraw(address _from, uint256 _returned_token_amount) internal {

        // Whitelisted contributor sends tokens back to the RICO contract
        // - unlinke cancel() method, this allows variable amounts.
        // - latest contributions get returned first.

        Participant storage ParticipantRecord = ParticipantsByAddress[_from];

        // this is needed otherwise participants that can call cancel() can bypass
        if(ParticipantRecord.whitelisted == true) {

            uint256 currentBlockNumber = getCurrentBlockNumber();

            // Contributors can send more tokens than they have locked,
            // thus make sure we only try to return for said amount
            uint256 RemainingTokenAmount = _returned_token_amount;
            uint256 maxLocked = getLockedTokenAmount(_from);
            uint256 ReturnTokenAmount = 0;

            if(RemainingTokenAmount > maxLocked) {
                ReturnTokenAmount = RemainingTokenAmount - maxLocked;
                RemainingTokenAmount = maxLocked;
            }

            if(RemainingTokenAmount > 0) {

                // go through stages starting with current stage
                // take stage token amount and remove from "amount participant wants to return"
                // get eth amount in said stage for that token amount
                // set stage tokens to 0
                // if stage tokens < remaining tokens to process, just sub remaining from stage
                // this way we can receive tokens in current stage / later stages and process them again.

                uint256 ReturnETHAmount = 0;

                uint8 currentStageNumber = getCurrentStage();
                for( uint8 stage_id = currentStageNumber; stage_id >= 0; stage_id-- ) {

                    // calculate how many tokens are actually locked in this stage
                    // and only use those for return.

                    uint256 tokens_in_stage = getLockedFromAmountAtBlock(
                        ParticipantRecord.byStage[stage_id].reserved_tokens +
                        ParticipantRecord.byStage[stage_id].bought_tokens,
                        currentBlockNumber
                    ) - ParticipantRecord.byStage[stage_id].returned_tokens;

                    // only try to process stages that actually have tokens in them.
                    if(tokens_in_stage > 0) {

                        if (RemainingTokenAmount < tokens_in_stage ) {
                            tokens_in_stage = RemainingTokenAmount;
                        }
                        uint256 CurrentETHAmount = getEthAmountForTokensAtStage(tokens_in_stage, stage_id);

                        ParticipantRecord.returned_tokens += tokens_in_stage;
                        ParticipantRecord.byStage[stage_id].returned_tokens += tokens_in_stage;

                        // get eth for tokens in current stage
                        ReturnETHAmount = ReturnETHAmount.add(CurrentETHAmount);
                        ParticipantRecord.byStage[stage_id].withdrawn_eth += CurrentETHAmount;

                        // remove processed token amount from requested amount
                        RemainingTokenAmount = RemainingTokenAmount.sub(tokens_in_stage);

                        // break loop if remaining amount = 0
                        if(RemainingTokenAmount == 0) {
                            break;
                        }
                    }
                }

                if(ReturnTokenAmount > 0) {
                    // return overflow tokens received

                    // allocate tokens to participant
                    bytes memory data;
                    // solium-disable-next-line security/no-send
                    TokenContract.send(_from, ReturnTokenAmount, data);
                }

                // Adjust globals
                withdrawnETH += ReturnETHAmount;

                // allocate remaining eth to project directly
                // ProjectETHAllocated

                ParticipantRecord.withdrawn_eth += ReturnETHAmount;
                address(uint160(_from)).transfer(ReturnETHAmount);
                emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _from, ReturnETHAmount);
                return;
            }
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
        isInitialized
        // isNotFrozen TODO??
        // requireNotEnded
    {
        // Rico should only receive tokens from the Rico Token Tracker.
        // any other transaction should revert
        require(msg.sender == address(TokenContract), "ERC777TokensRecipient: Invalid token");

        // 2 cases
        if(from == projectWalletAddress) {
            // 1 - project wallet adds tokens to the sale
            // Save the token amount allocated to this address
            TokenSupply += amount;
            return;
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
        isInitialized
        isNotFrozen
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
        return ParticipantsByAddress[_address].whitelisted;
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

        if(currentBlock > BuyPhaseStartBlock && currentBlock < BuyPhaseEndBlock) {
            uint256 passedBlocks = currentBlock.sub(BuyPhaseStartBlock);
            return passedBlocks.mul(
                10 ** uint256(precision)
            ).div(BuyPhaseBlockCount);
        } else if (currentBlock >= BuyPhaseEndBlock) {
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

        return getLockedFromAmountAtBlock(
            ParticipantsByAddress[_address].reserved_tokens +
            ParticipantsByAddress[_address].bought_tokens,
            getCurrentBlockNumber()
        ) - ParticipantsByAddress[_address].returned_tokens;
    }

    /*
    *   ERC777 - get the amount of locked tokens at current block number
    */
    function getLockedFromAmountAtBlock(uint256 tokenAmount, uint256 blockNumber) public view returns (uint256) {

        if(tokenAmount > 0) {

            // if before "development / buy  phase" ( stage 0 )
            //   - return all tokens bought through contributing.
            // if in development phase ( stage 1 to 12 )
            //   - calculate and return
            // else if after end_block
            //   - return 0
            if(blockNumber < BuyPhaseStartBlock) {

                // commit phase
                return tokenAmount;

            } else if(blockNumber < BuyPhaseEndBlock) {

                // buy  phase
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
        isInitialized
    {
        require(msg.sender == projectWalletAddress, "projectWithdraw: only projectWalletAddress.");

        uint256 unlocked = getProjectAvailableEth();
        require(ethAmount <= unlocked, "projectWithdraw: Specified ETH value too large.");

        projectWithdrawCount++;
        projectETHWithdrawn += ethAmount;


        emit ApplicationEvent(
            uint8(ApplicationEventTypes.PROJECT_WITHDRAW),
            uint16(projectWithdrawCount),
            projectWalletAddress,
            ethAmount
        );

        emit TransferEvent(uint8(TransferTypes.PROJECT_WITHDRAW), projectWalletAddress, ethAmount);
        address(uint160(projectWalletAddress)).transfer(ethAmount);
    }

    function getProjectAvailableEth() public view returns (uint256 _amount) {
        uint256 available = acceptedETH.sub(withdrawnETH);
        uint256 unlocked = available.mul(
            getCurrentUnlockRatio()
        ).div(10 ** 20);
        return unlocked.sub(projectETHWithdrawn).add(projectETHAllocated);
    }

    /*
    *   Helpers
    */

    // direct call: ParticipantsByAddress[_address].byStage[_stageId]._accepted
    function ParticipantTotalsDetails(
        address _address,
        uint8 _stageId
    ) public view returns (
        uint256 committed_eth,
        uint256 returned_eth,
        uint256 accepted_eth,
        uint256 withdrawn_eth,
        uint256 reserved_tokens,
        uint256 bought_tokens,
        uint256 returned_tokens
    ) {

        TotalsByStage storage TotalsRecord = ParticipantsByAddress[_address]
            .byStage[_stageId];

        return (
            TotalsRecord.committed_eth,
            TotalsRecord.returned_eth,
            TotalsRecord.accepted_eth,
            TotalsRecord.withdrawn_eth,
            TotalsRecord.reserved_tokens,
            TotalsRecord.bought_tokens,
            TotalsRecord.returned_tokens
        );
    }


    /*
    *   Modifiers
    */

    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "Only the deployer can call this method.");
        _;
    }

    modifier onlyWhitelistController() {
        require(msg.sender == whitelistControllerAddress, "Only the whitelist controller can call this method.");
        _;
    }

    modifier isInitialized() {
        require(initialized == true, "Contract must be initialized.");
        _;
    }

    modifier isNotInitialized() {
        require(initialized == false, "Contract is already initialized.");
        _;
    }

//    modifier requireRunning() {
//        require(ended == true, "requireRunning: RICO must be running");
//        _;
//    }
//
//    modifier requireNotRunning() {
//        require(ended == false, "requireRunning: RICO must not be running");
//        _;
//    }

//    modifier requireEnded() {
//        require(ended == true, "requireEnded: RICO period must have ended");
//        _;
//    }
//
//    modifier requireNotEnded() {
//        require(ended == false, "requireEnded: RICO period must not have ended");
//        _;
//    }

    modifier isFrozen() {
        require(frozen == true, "Contract is frozen.");
        _;
    }

    modifier isNotFrozen() {
        require(frozen == false, "Contract can not be frozen.");
        _;
    }

}