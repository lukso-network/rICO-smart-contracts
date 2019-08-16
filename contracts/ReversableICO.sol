/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/IERC777.sol";
import "./zeppelin/token/ERC777/IERC777Recipient.sol";
import "./zeppelin/introspection/IERC1820Registry.sol";

contract ReversableICO is IERC777Recipient {

    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    address public TokenTrackerAddress;
    IERC777 public TokenTracker;

    address public whitelistControllerAddress;

    /*
    *   Contract Settings
    */
    uint256 public StartBlock;
    uint256 public EndBlock;

    uint256 public InitialTokenSupply;

    uint256 public maxEth = 30000 ether;
    uint256 public receivedEth = 0;
    uint256 public acceptedEth = 0;

    /*
    * Allocation period
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
    function () external payable {
        commit();
    }

    function addSettings(
        address _TokenTrackerAddress,
        address _whitelistControllerAddress,
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

        // initialize ERC777 TokenTracker
        TokenTracker = IERC777(TokenTrackerAddress);

        // Save the token amount allocated to this address
        InitialTokenSupply = TokenTracker.balanceOf(address(this));

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
        return (_ethValue * (10 ** 18)) / StageByNumber[_stageId].token_price;
    }

    /*
    function getFraction(
        uint256 numerator, uint256 denominator, uint256 precision
    )
    public pure
    returns(uint256)
    {
        // caution, check safe-to-multiply here
        uint _numerator = numerator * 10 ** (precision + 1);
        // with rounding of last digit
        uint _quotient = ((_numerator / denominator) + 5) / 10;
        return _quotient;
    }
    */


    // uint256 myFraction = getFraction(myIcoTokens, ICOtokensInStage, precision);
    // return (preIcoUnsoldSupply * myFraction) / ( 10 ** precision );

    /*
    *   Participants
    */
    struct Contribution {
        uint256 value;
        uint256 block;
        uint8   stageId;
        uint8   state;
        uint256 tokens;
    }

    enum ContributionStates {
        NOT_SET,        // will match default value of a mapping result
        NOT_PROCESSED,
        ACCEPTED,
        REJECTED
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
        mapping ( uint16 => Contribution ) contributions;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 public ParticipantCount = 0;
    uint256 public WhitelistedCount = 0;
    uint256 public RejectedCount = 0;

    function ParticipantContributionDetails(
        address _address,
        uint16 contribution_id
    ) public view returns (
        uint256 _value,
        uint256 _block,
        uint8 _stageId,
        uint8 _state,
        uint256 _tokens
    ) {
        //
        // direct call: ParticipantsByAddress[_address].contributions[contribution_id].value
        //
        // mapping to records vs calling directly yields lower gas usage ( 24115 vs 24526 )

        Participant storage Record = ParticipantsByAddress[_address];
        Contribution storage ContributionRecord = Record.contributions[contribution_id];
        return (
            ContributionRecord.value,
            ContributionRecord.block,
            ContributionRecord.stageId,
            ContributionRecord.state,
            ContributionRecord.tokens
        );
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

            uint256 MaxAcceptedValue = maxEth - acceptedEth;
            uint256 AcceptedValue = msg.value;
            uint256 returnValue = 0;

            // if incomming value is higher than what we can accept,
            // just accept the difference and return the rest
            if(AcceptedValue > MaxAcceptedValue) {
                // accept max possible
                AcceptedValue = MaxAcceptedValue;
                // send the rest back
                returnValue = msg.value - AcceptedValue;
            }
            // add to received value to receivedETH
            receivedEth += AcceptedValue;

            // Check if participant already exists
            Participant storage ParticipantRecord = ParticipantsByAddress[msg.sender];

            uint16 newContributionId = 0;

            if(ParticipantRecord.contributionsCount == 0) {
                // increase participant count
                ParticipantCount++;
            } else {
                newContributionId = ParticipantRecord.contributionsCount;
            }

            // Save new contribution
            Contribution storage ContributionRecord = ParticipantRecord.contributions[newContributionId];
            ContributionRecord.value = AcceptedValue;
            ContributionRecord.block = getCurrentBlockNumber();
            ContributionRecord.stageId = getStageAtBlock(ContributionRecord.block);
            ContributionRecord.state = uint8(ContributionStates.NOT_PROCESSED);

            // calculate how many tokens this contribution will receive
            ContributionRecord.tokens = getTokenAmountForEthAtStage(
                AcceptedValue, ContributionRecord.stageId
            );

            ParticipantRecord.contributionsCount++;

            // if whitelisted, process the contribution automatically
            if(ParticipantRecord.whitelisted == true) {
                processContribution(msg.sender, newContributionId, uint8(ContributionStates.ACCEPTED));
            }

            // if received value is too high to accept we then have a return value we must send back to our participant.
            if(returnValue > 0) {
                msg.sender.transfer(returnValue);
            }

        } else {
            // @TODO: we most likely cannot receive 0 value on a payable.. test it
        }
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
                // accept contribution
                acceptedEth += ContributionRecord.value;

                // allocate tokens to participant
                bytes memory data;
                TokenTracker.send(_receiver, ContributionRecord.tokens, data);

                // emit contributionAccepted event.
            } else if(_to_state == uint8(ContributionStates.REJECTED)) {
                // convert to address payable and send funds back to participant
                address(uint160(_receiver)).transfer(ContributionRecord.value);

                // emit contributionRejected event.
            }

            emit ContributionEvent(ContributionRecord.state, _contributionId, _receiver, ContributionRecord.value);

            return true;
        }
        return false;
    }

    /*
    *   Participant cancels commitment duiring Allocation Stage
    */
    function cancel()
        public
        payable
    {
        // code
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

        // Check if we actually have a ParticipantRecord
        if(ParticipantRecord.contributionsCount > 0) {
            if(_mode == uint8(ContributionStates.ACCEPTED)) {
                ParticipantRecord.whitelisted = true;
                WhitelistedCount++;
            } else if(_mode == uint8(ContributionStates.REJECTED)) {
                // redundant since default is false ?
                ParticipantRecord.whitelisted = false;
                RejectedCount++;
            } else {
                revert("whitelistOrReject: invalid mode selected.");
            }

            // process available contributions between start_at + count
            for( uint16 i = start_at; i <= count; i++ ) {
                if(ParticipantRecord.contributions[i].state == uint8(ContributionStates.NOT_PROCESSED)) {
                    processContribution(_address, i, _mode);
                }
            }
        } else {
            revert("whitelistOrReject: Participant record not found.");
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
    * Refund ( ERC777TokensRecipient method )
    */
    function refund() public view returns (bool) {
        // 1. make sure we're receiving the correct tokens, else revert
        // 2. get current balance, and
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
        // requireInitialized
        // requireRunning
        // requireNotFrozen
        // requireNotEnded
    {
        if( initialized == true ) {
            require(msg.sender == address(TokenTracker), "ERC777TokensRecipient: Invalid token");

            // call internal refund method()
            // refund();

        }
        // else accept any token when not initialized, so we can set things up.
    }

    /*
    *   Utils
    */
    // required so we can override when running tests
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
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