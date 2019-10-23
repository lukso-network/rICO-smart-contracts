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

    struct TotalsByStage {
        uint256 received;		// msg.value
        uint256 accepted;		// lower than msg.value if maxCap already reached
        uint256 returned;		// received - accepted
        uint256 tokens;			// tokens bought in this stage
        uint8   state;			// has this been processed or not ? automatically set to yes if whitelisted == true
    }

    enum ContributionStates {
        NOT_SET,        // will match default value of a mapping result
        NOT_PROCESSED,
        ACCEPTED,
        REJECTED,
        CANCELLED
    }

    event ContributionEvent (
        uint8 indexed _type,
        uint16 indexed _id,
        address indexed _from,
        uint256 _value
    );

    struct Participant {
        bool   whitelisted;
        uint16  contributionsCount;
        uint256 contributed_amount;
        uint256 accepted_amount;
        uint256 withdrawn_amount;
        uint256 available_amount;
        uint256 token_amount;
        mapping ( uint16 => Contribution ) contributions;
        mapping ( uint8 => TotalsByStage ) totals;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 public ParticipantCount = 0;

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

    /*
    *   Recalculate Funds allocation
    */
    function availableEth() public view returns (uint256) {
        return TokenTracker.balanceOf(address(this)).mul(
            StageByNumber[getCurrentStage()].token_price
        ).div( 1 ether );
    }


    /*
    *   Participant commits funds
    */
    function commit()
        public
        payable
        // requireRunning
        // requireNotEnded
        requireNotFrozen
    {
        // if we received eth
        if( msg.value > 0 ) {

            // add to received value to receivedETH
            receivedETH += msg.value;

            // Participant initial state record
            Participant storage ParticipantRecord = ParticipantsByAddress[msg.sender];
            uint16 newContributionId = 0;

            // Check if participant already exists
            if(ParticipantRecord.contributionsCount == 0) {
                // increase participant count
                ParticipantCount++;

                // index
                ParticipantsById[ParticipantCount] = msg.sender;
            } else {
                newContributionId = ParticipantRecord.contributionsCount;
            }

            // contribution internal data
            handleContribution(msg.sender, newContributionId, msg.value, uint8(ContributionStates.NOT_PROCESSED));

            // if whitelisted, process the contribution automatically
            if(ParticipantRecord.whitelisted == true) {
                processContribution(msg.sender, newContributionId, uint8(ContributionStates.ACCEPTED));
            }

        } else {
            // looks like we can receive a 0 value transaction to our fallback.
            // Thus we'll use it for the withdraw method.
        }
    }

    function handleContribution(address _receiver, uint16 _contributionId, uint256 _ReceivedValue, uint8 _newState)
        internal
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[_receiver];

        uint256 MaxAcceptedValue = availableEth();
        uint256 AcceptedValue = _ReceivedValue;
        uint256 ReturnValue = 0;

        // if incomming value is higher than what we can accept,
        // just accept the difference and return the rest
        if(AcceptedValue > MaxAcceptedValue) {
            // accept max possible
            AcceptedValue = MaxAcceptedValue;
            // send the rest back
            ReturnValue = _ReceivedValue - AcceptedValue;
        }

        Contribution storage ContributionRecord = ParticipantRecord.contributions[_contributionId];
        ContributionRecord.value = AcceptedValue;

        // calculate how many tokens this contribution will receive
        ContributionRecord.tokens = getTokenAmountForEthAtStage(
            ContributionRecord.value, ContributionRecord.stageId
        );

        if(ContributionRecord.state == uint8(ContributionStates.NOT_SET)) {
            // we are dealing with a brand new contribution
            // make sure we increment participant contributions count
            ParticipantRecord.contributionsCount++;
            ParticipantRecord.contributed_amount += AcceptedValue;

            ContributionRecord.block = getCurrentBlockNumber();
            ContributionRecord.stageId = getStageAtBlock(ContributionRecord.block);

            // save Received Value and Returned Value for auditing
            ContributionRecord.received = _ReceivedValue;
            ContributionRecord.returned = ReturnValue;

        } else {
            // we are dealing with an old contribution that has now been whitelisted

            // add to processed value to acceptedETH
            acceptedETH += AcceptedValue;

            // add contribution tokens to Participant index
            ParticipantRecord.token_amount += ContributionRecord.tokens;

            // save the contributed & available amounts
            ParticipantRecord.accepted_amount += AcceptedValue;
            ParticipantRecord.available_amount += AcceptedValue;

            // add return value if any to returned totals
            ContributionRecord.returned += ReturnValue;

            // allocate tokens to participant
            bytes memory data;
            // at last run external method
            TokenTracker.send(_receiver, ContributionRecord.tokens, data);
        }

        ContributionRecord.state = _newState;

        // if received value is too high to accept we then have a return value we must send back to our participant.
        if(ReturnValue > 0) {
            ContributionRecord.returned += ReturnValue;
            returnedETH += ReturnValue;
            address(uint160(_receiver)).transfer(ReturnValue);
        }

        emit ContributionEvent(ContributionRecord.state, _contributionId, _receiver, ContributionRecord.value);
    }

    /*
    *   Process contribution for address
    */
    function processContribution(
        address _receiver, uint16 _contributionId, uint8 _to_state
    )
        internal
        returns ( bool )
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[_receiver];
        Contribution storage ContributionRecord = ParticipantRecord.contributions[_contributionId];

        if(ContributionRecord.state == uint8(ContributionStates.NOT_PROCESSED)) {

            // mark contribution as being processed by setting it's state
            ContributionRecord.state = _to_state;

            if(_to_state == uint8(ContributionStates.ACCEPTED)) {

                handleContribution(_receiver, _contributionId, ContributionRecord.value, uint8(ContributionStates.ACCEPTED));
                // event already fired. no need to do anything here.

            } else if(_to_state == uint8(ContributionStates.REJECTED)) {

                // convert to address payable and send funds back to participant
                address(uint160(_receiver)).transfer(ContributionRecord.value);
                emit ContributionEvent(ContributionRecord.state, _contributionId, _receiver, ContributionRecord.value);
            }
            return true;
        }
        return false;
    }

    /*
    *   Recalculate Funds allocation
    */
    function recalculateFunds() internal
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
        Participant storage ParticipantRecord = ParticipantsByAddress[msg.sender];
        if(ParticipantRecord.whitelisted == true) {
            revert("cancel: Participant is already whitelisted, please send tokens back to this contract in order to withdraw ETH.");
        }

        if(ParticipantRecord.contributionsCount > 0) {

            // calculate totals
            uint256 ParticipantAvailableEth = 0;

            // set contributions to Cancelled
            for( uint16 i = 0; i < ParticipantRecord.contributionsCount; i++ ) {
                Contribution storage ContributionRecord = ParticipantRecord.contributions[i];
                if(ContributionRecord.state == uint8(ContributionStates.NOT_PROCESSED)) {
                    ParticipantAvailableEth += ContributionRecord.value;

                    ContributionRecord.state = uint8(ContributionStates.CANCELLED);
                    ContributionRecord.returned += ContributionRecord.value;
                    ContributionRecord.tokens = 0;

                    emit ContributionEvent(ContributionRecord.state, i, msg.sender, ContributionRecord.value);
                }
            }

            if(ParticipantAvailableEth > 0 ) {

                if(ParticipantAvailableEth <= ParticipantRecord.contributed_amount) {

                    // Set Participant audit values
                    ParticipantRecord.token_amount = 0;
                    // ParticipantRecord.available_amount.sub(ParticipantAvailableEth);
                    ParticipantRecord.withdrawn_amount += ParticipantAvailableEth;

                    // Adjust globals
                    returnedETH += ParticipantAvailableEth;

                    // send eth back to participant including received value
                    address(uint160(msg.sender)).transfer(ParticipantAvailableEth + msg.value);

                    emit ExitEvent(msg.sender, 0, ParticipantAvailableEth, 1, false);
                    return;
                }
                else {
                    revert("cancel: Participant available eth calculation issues.");
                }
            } else {
                revert("cancel: Participant has not contributed any eth.");
            }
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
            ParticipantsByAddress[participantAddress].available_amount > 0
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

        // ParticipantRecord.available_amount only available after whitelisting, so we need to check all contributions
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
        return false;
    }


    /*
    *   Whitelisting or Rejecting
    *   start / count allow us to recover from bad actors that contribute waaaay too many times..
    *   that is.. if we want to unlock their eth
    */
    function whitelistOrReject(
        address _address,
        uint8 _mode,
        uint16 start_at,
        uint8 count
    )
        public
        requireInitialized
        requireNotFrozen
        onlyWhitelistController
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[_address];

        if(_mode == uint8(ContributionStates.ACCEPTED)) {
            ParticipantRecord.whitelisted = true;
        } else if(_mode == uint8(ContributionStates.REJECTED)) {
            ParticipantRecord.whitelisted = false;
        } else {
            revert("whitelistOrReject: invalid mode selected.");
        }

        if(ParticipantRecord.contributionsCount > 0) {
            // process available contributions between start_at + count
            for( uint16 i = start_at; i <= count; i++ ) {
                if(ParticipantRecord.contributions[i].state == uint8(ContributionStates.NOT_PROCESSED)) {
                    processContribution(_address, i, _mode);
                }
            }
        }
    }

    /*
    *   Whitelisting or Rejecting multiple addresses
    *   start is 0 / count is 10, should be fine for most
    *   for special cases we just use the whitelistOrReject method
    */
    function whitelistOrRejectMultiple(address[] memory _address, uint8 _mode) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            whitelistOrReject(_address[i], _mode, 0, 10);
        }
    }

    function isWhitelisted(address _address) public view returns ( bool ) {
        if(ParticipantsByAddress[_address].whitelisted == true) {
            return true;
        }
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

            // get amount of locked tokens
            uint256 lockedTokens = getLockedTokenAmount(_from);

            // for each stage
            /*
            getEthAmountForTokensAtStage(
                    uint256 _token_amount,
                    uint8 _stageId
                )
            */
            
            uint256 amt = ParticipantRecord.token_amount;
            ParticipantRecord.token_amount = amt.sub(_token_amount);

            // get amount per stage starting from the end

            // if a new contribution happens after a withdraw we need to make sure it's taken into account

            // based on how much has been returned so far ( could be 0 )
            // find our starting price point for tokens

            /*
            uint256 startingAmount = Participant.withdrawn_amount;

            uint256 tokensInLoop = 0;
            uint256 ethInLoop = 0;

            for( uint8 i = ContractStageCount; i > 0; i--) {
                tokensInLoop += Participant.totals[i];
                break;
            }
            */

            // index stage amounts
            // uint256[] ethAmountPerStage;

            // based on token_amount, find the

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

        // to lower gas costs, let's check if _address actually has any contributions.
        if(ParticipantsByAddress[_address].token_amount > 0) {

            uint256 currentBlock = getCurrentBlockNumber();

            // if before "development / distribution phase" ( stage 0 )
            //   - return all tokens bought through contributing.
            // if in development phase ( stage 1 to 12 )
            //   - calculate and return
            // else if after endBlock
            //   - return 0
            if(currentBlock < DistributionStartBlock) {

                // allocation phase
                return ParticipantsByAddress[_address].token_amount;

            } else if(currentBlock < EndBlock) {

                // distribution phase
                uint8 precision = 20;
                uint256 bought = ParticipantsByAddress[_address].token_amount;

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