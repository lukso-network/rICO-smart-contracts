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

contract ReversableICO is IERC777Recipient {

    using SafeMath for uint256;

    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    address public TokenTrackerAddress;
    IERC777 public TokenTracker;

    address public whitelistControllerAddress;
    address public TeamWalletAddress;

    /*
    *   Contract Settings
    */
    uint256 public StartBlock;
    uint256 public DistributionStartBlock;
    uint256 public DistributionBlockLength;
    uint256 public EndBlock;

    uint256 public InitialTokenSupply;

    // uint256 public maxEth = 30000 ether;
    uint256 public receivedETH = 0;
    uint256 public returnedETH = 0;
    uint256 public acceptedETH = 0;

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
    function () external payable {
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
        address _TeamWalletAddress,
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
        TeamWalletAddress = _TeamWalletAddress;

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
        return (_ethValue * (10 ** 18)) / StageByNumber[_stageId].token_price;
    }

    /*
    *   Participants
    */
    struct Contribution {
        uint256 value;
        uint256 received;
        uint256 returned;
        uint256 block;
        uint256 tokens;
        uint8   stageId;
        uint8   state;
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
        uint256 withdrawn_amount;
        uint256 available_amount;
        uint256 token_amount;
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
        // return 30000 ether;
        // return 30000000000000000000000;
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

            /*
            uint256 MaxAcceptedValue = availableEth();
            uint256 AcceptedValue = msg.value;
            uint256 ReturnValue = 0;

            // if incomming value is higher than what we can accept,
            // just accept the difference and return the rest
            if(AcceptedValue > MaxAcceptedValue) {
                // accept max possible
                AcceptedValue = MaxAcceptedValue;
                // send the rest back
                ReturnValue = msg.value - AcceptedValue;
            }

            // Save new contribution
            Contribution storage ContributionRecord = ParticipantRecord.contributions[newContributionId];
            ContributionRecord.value = AcceptedValue;
            ContributionRecord.block = getCurrentBlockNumber();
            ContributionRecord.stageId = getStageAtBlock(ContributionRecord.block);
            ContributionRecord.state = uint8(ContributionStates.NOT_PROCESSED);

            // save Received Value and Returned Value for auditing
            ContributionRecord.received = msg.value;
            ContributionRecord.returned = ReturnValue;


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
            if(ReturnValue > 0) {
                returnedETH += ReturnValue;
                msg.sender.transfer(ReturnValue);
            }
            */

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
                ParticipantRecord.contributed_amount += AcceptedValue;
                ParticipantRecord.available_amount += AcceptedValue;

                // add return value if any to returned totals
                ContributionRecord.returned += ReturnValue;
            }

            ContributionRecord.state = _newState;

            // if received value is too high to accept we then have a return value we must send back to our participant.
            if(ReturnValue > 0) {
                ContributionRecord.returned += ReturnValue;
                returnedETH += ReturnValue;
                address(uint160(_receiver)).transfer(ReturnValue);
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

                handleContribution(_receiver, _contributionId, ContributionRecord.value, uint8(ContributionStates.ACCEPTED));


                /*
                // make sure we can still accept value when this is running.
                uint256 MaxAcceptedValue = availableEth();
                uint256 AcceptedValue = ContributionRecord.value;
                uint256 ReturnValue = 0;

                // if value is higher than what we can accept,
                // just accept the difference and return the rest
                if(AcceptedValue > MaxAcceptedValue) {
                    // accept max possible
                    AcceptedValue = MaxAcceptedValue;
                    // send the rest back
                    ReturnValue = ContributionRecord.value - AcceptedValue;

                    // re calculate how many tokens this contribution will receive
                    ContributionRecord.tokens = getTokenAmountForEthAtStage(
                        AcceptedValue, ContributionRecord.stageId
                    );
                }

                // add to processed value to acceptedETH
                acceptedETH += AcceptedValue;

                // save AcceptedValue and ReturnValue value for auditing
                // ContributionRecord.received = AcceptedValue;
                // ContributionRecord.returned = ReturnValue;

                // calculate funds allocations
                // recalculateFunds();

                // add the tokens we're allocating to the participant to their index
                ParticipantRecord.token_amount += ContributionRecord.tokens;

                // save the contributed amount
                ParticipantRecord.contributed_amount += AcceptedValue;
                ParticipantRecord.available_amount += AcceptedValue;

                // allocate tokens to participant
                bytes memory data;
                // at last run external method
                TokenTracker.send(_receiver, ContributionRecord.tokens, data);

                // if processed value is too high to accept we then have a return value we must send back to our participant.
                if(ReturnValue > 0) {
                    ContributionRecord.returned += ReturnValue;
                    returnedETH += ReturnValue;
                    msg.sender.transfer(ReturnValue);
                }
                */

            } else if(_to_state == uint8(ContributionStates.REJECTED)) {
                // convert to address payable and send funds back to participant
                address(uint160(_receiver)).transfer(ContributionRecord.value);
            }

            emit ContributionEvent(ContributionRecord.state, _contributionId, _receiver, ContributionRecord.value);

            return true;
        }
        return false;
    }

    /*
    *   Recalculate Funds allocation
    */
    function recalculateFunds() internal {

    }

    /*
    *   Participant cancels commitment duiring Allocation Stage if they've not been whitelisted yet.
    */
    function cancel()
        public
        payable
        requireNotFrozen
    {
        Participant storage ParticipantRecord = ParticipantsByAddress[msg.sender];
        if(ParticipantRecord.whitelisted == true) {
            revert("cancel: Participant is already whitelisted, please send tokens back to this contract in order to withdraw ETH.");
        }
        /*
         else {

             if(ParticipantRecord.contributionsCount > 0) {

                if(_to_state == uint8(ContributionStates.REJECTED)) {
                    // convert to address payable and send funds back to participant
                    address(uint160(_receiver)).transfer(ContributionRecord.value);
                }

                // contributionCleanupAtWithdraw
                
                // save the contributed amount
                Participant.withdrawn_amount += ContributionRecord.value;
                ParticipantRecord.available_amount -= ContributionRecord.value;
                emit ContributionEvent(ContributionRecord.state, _contributionId, _receiver, ContributionRecord.value);
             }
        }

        uint16 newContributionId = 0;

        if(ParticipantRecord.contributionsCount == 0) {
            // increase participant count
            ParticipantCount++;
        } else {
            newContributionId = ParticipantRecord.contributionsCount;
        }

        // check if we've been whitelisted

        // check if we have any contributions

        // code


        ParticipantRecord.available_amount > 0
        contributed_amount
        withdrawn_amount
        /*
        for( uint16 i = 0; i < ParticipantRecord.contributionsCount; i++ ) {
            Contribution storage ContributionRecord = ParticipantRecord.contributions[i];
            if(ContributionRecord.state == uint8(ContributionStates.NOT_PROCESSED)) {

            }
        }
        */
    }

    /*
    *   Return cancel modes for a participant address
    */
    function getCancelModeStates(address participantAddress)
        public
        view
        returns ( bool byEth, bool byTokens )
    {
        byEth = false;
        byTokens = false;

        Participant storage ParticipantRecord = ParticipantsByAddress[participantAddress];
        if(ParticipantRecord.whitelisted == true) {

            // byEth remains false as they need to send tokens back.
            // check participant token balance
            if( TokenTracker.balanceOf(address(participantAddress)) > 0 && ParticipantRecord.available_amount > 0 ) {
                byTokens = true;
            }
        } else {

            // byTokens remains false as the participant should have no tokens to send back anyway.
             if(ParticipantRecord.available_amount > 0) {
                byEth = true;
            }
        }
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
    *   Withdraw ( ERC777TokensRecipient method )
    */
    function withdraw() public view returns (bool) {
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

            // call internal withdraw method()
            // withdraw();

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

                return bought.mul(
                    getCurrentUnlockRatio()
                ).div(10 ** uint256(precision));

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
        require(msg.sender == TeamWalletAddress, "only TeamWalletAddress");

        require(ethAmount <= projectETH, "Specified ETH value too large." );


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