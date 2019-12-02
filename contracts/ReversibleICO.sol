/*
 * source       https://github.com/lukso-network/rICO-smart-contracts
 * @name        rICO
 * @package     rICO-smart-contracts
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

    /// @dev the address of the introspection registry contract deployed on Ethereum mainnet.
    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    /// @dev the actual rICO token contract
    IERC777 public tokenContract;


    /*
    *   Contract States
    */
    /// @dev it is set to true after the deployer initializes the contract.
    bool public initialized; // default: false
    /// @dev the contract get frozen only in case of an emergency
    bool public frozen; // default: false
    //TODO unused variable
    bool public started; // default: false
    bool public ended; // default: false


    /*
    *   Addresses
    */
    /// @dev the deployer is only allowed to initialize the contract.
    address public deployerAddress;
    /// @dev the actual rICO token contract address.
    address public tokenContractAddress;
    // the address of wallet handling the funds raised.
    address public projectWalletAddress;
    // only the whitelist controller can whitelist addresses.
    address public whitelistControllerAddress;


    /*
    *   Public Variables
    */
    /// @dev total amount tokens minted
    uint256 public tokenSupply; // default: 0
    /// @dev total amount of ETH commited
    uint256 public committedETH; // default: 0
    /// @dev total amount of ETH returned
    uint256 public returnedETH; // default: 0
    /// @dev total amount of ETH accepted
    uint256 public acceptedETH; // default: 0
    /// @dev total amount of ETH withdrawn
    uint256 public withdrawnETH; // default: 0
    /// @dev denotes how many times the project has withdrawn from the funds raised
    uint256 public projectWithdrawCount; // default: 0
    /// @dev total amount allocated to the contract
    uint256 public projectAllocatedETH; // default: 0
    /// @dev total amount of ETH withdrawn by the project
    uint256 public projectWithdrawnETH; // default: 0
    // Minimum amount of ETH accepted for a contribution
    // everything lower than that will trigger a canceling of pending ETH
    uint256 public minContribution = 0.001 ether;


    /*
    *   Commit phase (Stage 0)
    */
    /// @dev initial token price (commit phase)
    uint256 public commitPhasePrice;
    /// @dev block number that indicates the start of the commitment phase
    uint256 public commitPhaseStartBlock;
    /// @dev block number that indicates the end of the rICO period
    uint256 public commitPhaseEndBlock;
    /// @dev the duration of the rICO period in blocks
    uint256 public commitPhaseBlockCount;


    /*
    *   Buy phases (Stages 1-n)
    */
    /// @dev block number that indicates the start of the 1st buy phase
    uint256 public buyPhaseStartBlock;
    /// @dev block number that indicates the end of the buy phase
    uint256 public buyPhaseEndBlock;
    /// @dev the duration of the buy period in blocks
    uint256 public buyPhaseBlockCount;


    /*
    *   Stages
    *   Stage 0 = commit phase
    *   Stages 1-n = buy phase
    */
    struct Stage {
        uint256 startBlock;
        uint256 endBlock;
        uint256 tokenPrice;
    }

    mapping ( uint8 => Stage ) public stages;
    uint8 public stageCount; // default: 0
    /// @dev the duration of each stage in blocks
    uint256 public stageBlockCount;

    /*
    * Participants
    */
    struct Participant {
        bool   whitelisted;
        uint32  contributionsCount;
        uint256 committedETH;	        // msg.value
        uint256 returnedETH;	        // committedETH - acceptedETH
        uint256 acceptedETH;	        // lower than msg.value if maxCap already reached
        uint256 withdrawnETH;	        // cancel() / withdraw()
        uint256 allocatedETH;              // allocated to project when contributing or exiting
        uint256 reservedTokens;         // total tokens bought in all stages
        uint256 boughtTokens;	        // total tokens already sent to the participant in all stages
        uint256 returnedTokens;         // total tokens returned by participant to contract in all stages
        mapping ( uint8 => ParticipantDetailsByStage ) byStage;
    }

    struct ParticipantDetailsByStage {
        uint256 committedETH;		    // msg.value
        uint256 returnedETH;		    // committedETH - acceptedETH
        uint256 acceptedETH;		    // lower than msg.value if maxCap already reached
        uint256 withdrawnETH;		    // withdrawn from current stage
        uint256 allocatedETH;           // allocated to project when contributing or exiting
        uint256 reservedTokens;         // tokens bought in this stage
        uint256 boughtTokens;	        // tokens already sent to the participant in this stage
        uint256 returnedTokens;	        // tokens returned by participant to contract
    }

    /// @dev identifies participants' stats by their address
    mapping ( address => Participant ) public participantsByAddress;
    /// @dev identifies participants' address by their unique ID
    mapping ( uint256 => address ) public participantsById;
    /// @dev total number of rICO participants
    uint256 public participantCount;


    /*
    * Events
    */
    enum ApplicationEventTypes {
        NOT_SET,                // 0; will match default value of a mapping result
        CONTRIBUTION_NEW,       // 1
        CONTRIBUTION_CANCEL,    // 2
        PARTICIPANT_CANCEL,     // 3
        COMMITMENT_ACCEPTED,    // 4
        WHITELIST_APPROVE,      // 5
        WHITELIST_REJECT,       // 6
        PROJECT_WITHDRAW        // 7
    }

    event ApplicationEvent (
        uint8 indexed _type,
        uint32 indexed _id,
        address indexed _address,
        uint256 _value
    );

    enum TransferTypes {
        NOT_SET,                // 0
        AUTOMATIC_RETURN,       // 1
        WHITELIST_REJECT,       // 2
        PARTICIPANT_CANCEL,     // 3
        PARTICIPANT_WITHDRAW,   // 4
        PROJECT_WITHDRAW        // 5
    }

    event TransferEvent (
        uint8 indexed _type,
        address indexed _address,
        uint256 indexed _value
    );


    // ------------------------------------------------------------------------------------------------


    /// @dev Constructor sets the deployer and defines ERC777TokensRecipient interface support
    constructor() public {
        deployerAddress = msg.sender;
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }

    /// @dev Initializes the contract: only the deployer (set in the constructor) can call this method
    /// @param _tokenContractAddress the address of the ERC777 rICO token contract.
    /// @param _whitelistControllerAddress the address of the controller handling whitelisting.
    /// @param _projectWalletAddress the project wallet that can withdraw the contributions.
    /// @param _commitPhaseStartBlock the block in which the commit phase starts.
    /// @param _commitPhaseBlockCount the duration of the commit phase in blocks.
    /// @param _commitPhasePrice the initial token price (in wei) during the commit phase.
    /// @param _stageCount the number of the rICO stages.
    /// @param _stageBlockCount the duration of each stage in blocks.
    /// @param _stagePriceIncrease a factor used to increase the token price at each subsequent stage.
    function init(
        address _tokenContractAddress,
        address _whitelistControllerAddress,
        address _projectWalletAddress,
        uint256 _commitPhaseStartBlock,
        uint256 _commitPhaseBlockCount,
        uint256 _commitPhasePrice,
        uint8   _stageCount,
        uint256 _stageBlockCount,
        uint256 _stagePriceIncrease
    )
        public
        onlyDeployer
        isNotInitialized
    {

        // Assign address variables
        tokenContractAddress = _tokenContractAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        projectWalletAddress = _projectWalletAddress;

        // Assign other variables
        commitPhaseStartBlock = _commitPhaseStartBlock;
        commitPhaseBlockCount = _commitPhaseBlockCount;
        commitPhaseEndBlock = _commitPhaseStartBlock + _commitPhaseBlockCount;
        commitPhasePrice = _commitPhasePrice;

        stageBlockCount = _stageBlockCount;


        // initialize ERC777 tokenContract
        tokenContract = IERC777(tokenContractAddress);


        // Setup stage 0: The commit phase.
        Stage storage stage0 = stages[stageCount]; // stageCount = 0
        stage0.startBlock = _commitPhaseStartBlock;
        stage0.endBlock = _commitPhaseStartBlock + _commitPhaseBlockCount;
        stage0.tokenPrice = _commitPhasePrice;

        stageCount++; // stageCount = 1


        // Setup stage 1 to n: The buy phase stages
        uint256 lastStageBlockEnd = stage0.endBlock;

        for(uint8 i = 1; i <= _stageCount; i++) {

            Stage storage stageN = stages[stageCount]; // stageCount = n
            // each new stage starts after the previous phase's endBlock
            stageN.startBlock = lastStageBlockEnd + 1;
            stageN.endBlock = lastStageBlockEnd + _stageBlockCount + 1;
            // at each stage the token price increases by _stagePriceIncrease * #stage
            stageN.tokenPrice = _commitPhasePrice + ( _stagePriceIncrease * (i) );
            // stageCount = n + 1
            stageCount++;

            lastStageBlockEnd = stageN.endBlock;
        }

        // the buy phase starts on the subsequent block of the commitPhase's (stage0) endBlock
        buyPhaseStartBlock = commitPhaseEndBlock + 1;
        buyPhaseEndBlock = lastStageBlockEnd;
        // the duration of buyPhase in blocks
        buyPhaseBlockCount = lastStageBlockEnd - buyPhaseStartBlock;

        initialized = true;
    }


    /*
     * Public functions
     * The main way to interact with the rICO.
     */

    /// @dev FALLBACK: depending on the amount received it commits or it cancels contributions.
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


    /// @dev ERC777TokensRecipient implementation for receiving ERC777 tokens.
    /// @param _from token sender.
    /// @param _amount token amount.
    function tokensReceived(
        address,
        address _from,
        address,
        uint256 _amount,
        bytes calldata,
        bytes calldata
    )
    external
    isInitialized
    // isNotFrozen TODO??
    // requireNotEnded
    {
        // rICO should only receive tokens from the rICO Token Tracker.
        // transactions from any other sender should revert
        require(msg.sender == address(tokenContract), "Invalid token sent.");

        // 2 cases
        if(_from == projectWalletAddress) {
            // 1 - project wallet adds tokens to the sale
            // Save the token amount allocated to this address
            tokenSupply += _amount;
            return;
        } else {

            // 2 - rico contributor sends tokens back
            withdraw(_from, _amount);
        }

    }


    /// @dev Cancels non-whitelisted participant's pending ETH commitment.
    function cancel()
    public
    isInitialized
    isNotFrozen
    {
        // only non-whitelisted participants can cancel their contribution
        require(
            participantsByAddress[msg.sender].whitelisted != true,
            "Commitment canceling only possible using tokens after you got whitelisted."
        );

        // if there is available committed ETH...
        if(canCancelByEth(msg.sender)) {
            // ...cancel participant's contribution
            cancelContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.PARTICIPANT_CANCEL));
            return;
        }
        revert("Participant has no contributions.");
    }


    /// @dev Allows for the project to withdraw ETH.
    /// param _ethAmount the ETH amount in wei.
    function projectWithdraw(uint256 _ethAmount)
    external
    isInitialized
    {
        require(msg.sender == projectWalletAddress, "Only project wallet address.");

        // get project unlocked ETH (available for withdrawing)
        uint256 unlocked = getProjectAvailableEth();
        require(_ethAmount <= unlocked, "Requested amount too big, not enough unlocked ETH available.");

        // update stats:  #project withdrawals, total amount withdrawn by the project
        projectWithdrawCount++;
        projectWithdrawnETH += _ethAmount;


        // transfer ETH to project wallet
        address(uint160(projectWalletAddress)).transfer(_ethAmount);

        // event emission
        emit ApplicationEvent(
            uint8(ApplicationEventTypes.PROJECT_WITHDRAW),
            uint32(projectWithdrawCount),
            projectWalletAddress,
            _ethAmount
        );

        emit TransferEvent(uint8(TransferTypes.PROJECT_WITHDRAW), projectWalletAddress, _ethAmount);
    }


    /// @dev Returns project's unlocked (i.e. available for withdrawing) ETH
    function getProjectAvailableEth() public view returns (uint256 _amount) {

        uint256 remainingFromAllocation;

        // calculate the ammount of allocated ETH not withdrawn yet
        if(projectAllocatedETH > projectWithdrawnETH) {
            remainingFromAllocation = projectAllocatedETH.sub(projectWithdrawnETH);
        }

        // calculate ETH that is globally available:
        // available = accepted - withdrawn - projectWithdrawn - projectNotWithdrawn
        uint256 globalAvailable = acceptedETH
            .sub(withdrawnETH)
            .sub(projectWithdrawnETH)
            .sub(remainingFromAllocation);

        // multiply the available ETH with the percentage that belongs to the project now
        uint256 unlocked = globalAvailable.mul(
            getCurrentUnlockPercentage()
        ).div(10 ** 20);

        // available = unlocked + projectNotWithdrawn
        return unlocked.add(remainingFromAllocation);
    }


    /// @dev Whitelists or rejects participants.
    /// @param _address the participant's address.
    /// @param _approve true for approved (WHITELIST_APPROVE), false for rejected (WHITELIST_REJECT).
    function whitelist(
        address _address,
        bool _approve
    )
    public
    isInitialized
    isNotFrozen
    onlyWhitelistController
    {
        Participant storage participantRecord = participantsByAddress[_address];

        if(_approve) {
            // if participants are approved: whitelist them and accept their contributions
            participantRecord.whitelisted = true;
            acceptContributionsForAddress(_address, uint8(ApplicationEventTypes.WHITELIST_APPROVE));
        } else {
            // if participants are not approved: remove them from whitelist and cacnel their contributions
            participantRecord.whitelisted = false;
            cancelContributionsForAddress(_address, uint8(ApplicationEventTypes.WHITELIST_REJECT));
        }
    }

    /*
    *   Whitelisting or Rejecting multiple addresses
    */
    /// @dev Whitelists or rejects a list participants.
    /// @param _address the list of participants' addresses.
    /// @param _approve denotes whether they are approved or rejected.
    function whitelistMultiple(address[] memory _address, bool _approve) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            whitelist(_address[i], _approve);
        }
    }

    // ------------------------------------------------------------------------------------------------

    /*
    * Public view functions
    */

    /// @dev Returns true if the participant is whiteliste or false otherwise.
    /// @param _address the participant's address.
    function isWhitelisted(address _address) public view returns ( bool ) {
        return participantsByAddress[_address].whitelisted;
    }

    /*
        Do we want to normalise for gas usage ?!
        ( ie. add useless computation just to have the same gas used at all times ? )

        22023 - Case 1: lower than commit phase end
        22797 - Case 2: lower than stage[X].endBlock
        22813 - Case 3: exactly at stage[X].endBlock

        Doing an iteration and validating on each item range can go upto 37391 gas for 13 stages.
    */

    /// @dev Returns the current stage i.e. at the current block number.
    function getCurrentStage() public view returns ( uint8 ) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    /// @dev Returns the current token price i.e. at the current block number.
    function getCurrentPrice() public view returns ( uint256 ) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    /// @dev Returns the token price at the specified block height.
    /// @param _blockNumber the block height at which we want to retrieve the token price.
    function getPriceAtBlock(uint256 _blockNumber) public view returns ( uint256 ) {
        // first retrieve the stage that the block belongs to
        uint8 stage = getStageAtBlock(_blockNumber);
        if(stage < stageCount) {
            return stages[stage].tokenPrice;
        }
        // revert with stage not found?
        return 0;
    }

    /// @dev Returns the amount of tokens that ETH would buy (i.e. reverse ratio) at a specified stage.
    /// @param _ethValue the ETH amount in wei.
    /// @param _stageId the stage we are interested in.
    function getTokenAmountForEthAtStage(uint256 _ethValue, uint8 _stageId) public view returns (uint256) {
        // Since our tokens cost less than 1 eth, and decimals are 18
        // 1 wei will always buy something.

        // add token decimals to value before division, that way we increase precision.
        // return (_ethValue * (10 ** 18)) / Stages[_stageId].token_price;
        return _ethValue.mul(
            (10 ** 18)
        ).div( stages[_stageId].tokenPrice );
    }

    /// @dev Returns the amount of ETH (in wei) that tokens are worth (i.e. ratio) at a specified stage.
    /// @param _tokenAmount the amount of token.
    /// @param _stageId the stage we are interested in.
    function getEthAmountForTokensAtStage(uint256 _tokenAmount, uint8 _stageId) public view returns (uint256) {
        // return (_token_amount * Stages[_stageId].token_price) / (10 ** 18);
        return _tokenAmount.mul(
            stages[_stageId].tokenPrice
        ).div(
            (10 ** 18)
        );
    }

    /*
    * Participant view functions
    */

    // direct call: participantsByAddress[_address].byStage[_stageId]._accepted
    /// @dev Returns participant's stats.
    /// @param _address the participant's address.
    /// @param _stageId the relevant stage.
    function getParticipantDetailsByStage(
        address _address,
        uint8 _stageId
    )
    public
    view
    returns (
        uint256 stageCommittedETH,
        uint256 stageReturnedETH,
        uint256 stageAcceptedETH,
        uint256 stageWithdrawnETH,
        uint256 stageReservedTokens,
        uint256 stageBoughtTokens,
        uint256 stageReturnedTokens
    )
    {

        ParticipantDetailsByStage storage totalsRecord = participantsByAddress[_address]
        .byStage[_stageId];

        return (
            totalsRecord.committedETH,
            totalsRecord.returnedETH,
            totalsRecord.acceptedETH,
            totalsRecord.withdrawnETH,
            totalsRecord.reservedTokens,
            totalsRecord.boughtTokens,
            totalsRecord.returnedTokens
        );
    }

    /*
    *   ERC777 - get the amount of locked tokens at current block number
    */
    /// @dev Returns the participant's amount of locked tokens at the current block.
    /// @param _participantAddress the relevant participant's address.
    function getLockedTokenAmount(address _participantAddress) public view returns (uint256) {

        // since we want to display token amounts even when they are not already
        // transferred to their accounts, we use reserved + bought
        return getLockedTokenAmountAtBlock(
            participantsByAddress[_participantAddress].reservedTokens +
            participantsByAddress[_participantAddress].boughtTokens,
            getCurrentBlockNumber()
        ) - participantsByAddress[_participantAddress].returnedTokens;
    }

    /*
    *
    */
    /// @dev Returns the cancel modes for a participant.
    /// @param _participantAddress the relevant participant's address.
    function getCancelModes(address _participantAddress) external view returns (bool byEth, bool byTokens) {

        Participant storage participantRecord = participantsByAddress[_participantAddress];

        if(participantRecord.whitelisted == true) {
            // byEth remains false as they need to send tokens back.
            byTokens = canCancelByTokens(_participantAddress);
        } else {
            // byTokens remains false as the participant should have no tokens to send back anyway.
            byEth = canCancelByEth(_participantAddress);
        }
    }

    /// @dev Returns true if the participant has locked tokens in current stage.
    /// @param _participantAddress the address of the relevant participant.
    function canCancelByTokens(address _participantAddress) public  view  returns (bool) {
        if(getLockedTokenAmount(_participantAddress) > 0) {
            return true;
        }
        return false;
    }

    /// @dev Returns true if participant has committed ETH and the amount is greater than the amount returned so far.
    /// @param _participantAddress the address of the relevant participant.
    function canCancelByEth(address _participantAddress) public view returns (bool) {
        Participant storage participantRecord = participantsByAddress[_participantAddress];
        if(participantRecord.committedETH > 0 && participantRecord.committedETH > participantRecord.returnedETH ) {
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------------------------------------

    /*
    * Helper public view functions
    */

    /// @dev Returns current block number: required in order to override it when running tests
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
    }

    /// @dev Returns the stage at which the given block belongs to.
    /// @param _selectedBlock the block number.
    function getStageAtBlock(uint256 _selectedBlock) public view returns (uint8) {

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
        uint256 num = (_selectedBlock - commitPhaseEndBlock) / (stageBlockCount + 1) + 1;

        // last block of each stage always computes as stage + 1
        if(stages[uint8(num)-1].endBlock == _selectedBlock) {
            // save some gas and just return instead of decrementing.
            return uint8(num - 1);
        }

        // return max_uint8 if outside range
        // @TODO: maybe revert ?!
        if(num >= stageCount) {
            return 255;
        }

        return uint8(num);
    }


    /// @dev Calculcates the contract's ETH allocation at a certain stage.
    /// @param _stage the stage id.
    function availableEthAtStage(uint8 _stage) public view returns (uint256) {
        // multiply the number of tokens held by the contract with the token price...
        // ... at the specified stage and perform precision adjustments(div).
        return tokenContract.balanceOf(address(this)).mul(
            stages[_stage].tokenPrice
        ).div( 10 ** 18 );
    }


    /// @dev Returns the amount of locked tokens at a certain block.
    /// @param _tokenAmount the amount on tokens.
    /// @param _blockNumber the specified block number.
    function getLockedTokenAmountAtBlock(uint256 _tokenAmount, uint256 _blockNumber) public view returns (uint256) {

        if(_tokenAmount > 0) {

            // if before "development / buy  phase" ( stage 0 )
            //   - return all tokens bought through contributing.
            // if in development phase ( stage 1 to n )
            //   - calculate and return
            // else if after end_block
            //   - return 0
            if(_blockNumber < buyPhaseStartBlock) {

                // commit phase
                return _tokenAmount;

            } else if(_blockNumber < buyPhaseEndBlock) {

                // buy  phase
                uint8 precision = 20;
                uint256 bought = _tokenAmount;

                uint256 unlocked = bought.mul(
                    getCurrentUnlockPercentage()
                ).div(10 ** uint256(precision));

                return bought.sub(unlocked);

            } else {

                // after buyPhase's end
                return 0;
            }
        } else {
            return 0;
        }
    }

    /*
    *   Calculates the percentage of bought tokens (or ETH allocated to the project) beginning from the buy phase start to the current block.
    *   Returns unlock percentage multiplied by 10 to the power of precision
    *  ( should be 20 resulting in 10 ** 20, so we can divide by 100 later and get 18 decimals )
    */
    /// @dev Calculates the percentage of bought tokens (or ETH allocated to the project) beginning from the buy phase start to the current block.
    /// Returns unlock percentage multiplied by 10 to the power of precision.
    /// (should be 20 resulting in 10 ** 20, so we can divide by 100 later and get 18 decimals).
    function getCurrentUnlockPercentage() public view returns (uint256) {
        uint8 precision = 20;
        // get current block
        uint256 currentBlock = getCurrentBlockNumber();

        if(currentBlock > buyPhaseStartBlock && currentBlock < buyPhaseEndBlock) {
            // get the number of blocks that have "elapsed" since the buyPhase start
            uint256 passedBlocks = currentBlock.sub(buyPhaseStartBlock);
            return passedBlocks.mul(
                10 ** uint256(precision)
            ).div(buyPhaseBlockCount);
        } else if (currentBlock >= buyPhaseEndBlock) {
            return 0; // 10 ** uint256(precision);
        } else {
            return 0; // 10 ** uint256(precision);
        }
    }


    // ------------------------------------------------------------------------------------------------

    /*
    * Internal functions
    */


    /// @dev Commits participant's funds.
    function commit()
    internal
    isInitialized
    isRunning
    isNotFrozen
    {
        // add to received value to committedETH
        committedETH += msg.value;

        // Participant initial state record
        Participant storage participantRecord = participantsByAddress[msg.sender];

        // Check if participant already exists
        if(participantRecord.contributionsCount == 0) {
            // increase participant count
            participantCount++;

            // index
            participantsById[participantCount] = msg.sender;
        }

        // record contribution into current stage totals for the participant
        recordNewContribution(msg.sender, msg.value);

        // if whitelisted, process the contribution automatically
        if(participantRecord.whitelisted == true) {
            acceptContributionsForAddress(msg.sender, uint8(ApplicationEventTypes.COMMITMENT_ACCEPTED));
        }
    }


    /// @dev Allows for a participant to withdraw by sending tokens back to rICO.
    /// @param _from sender's (participant's) address.
    /// @param _returnedTokenAmount the amount of tokens returned.
    function withdraw(address _from, uint256 _returnedTokenAmount) internal {

        // Whitelisted contributor sends tokens back to the rICO contract.
        // - unlinke cancel() method, this allows variable amounts.
        // - latest contributions get returned first.

        Participant storage participantRecord = participantsByAddress[_from];

        // this is needed otherwise participants that can call cancel() can bypass
        if(participantRecord.whitelisted == true) {

            uint256 currentBlockNumber = getCurrentBlockNumber();

            // Contributors can send more tokens than they have locked,
            // thus make sure we only try to return for said amount
            uint256 remainingTokenAmount = _returnedTokenAmount;
            uint256 maxLocked = getLockedTokenAmount(_from);
            uint256 returnTokenAmount;
            uint256 allocatedEthAmount;

            // if returned amount is greater than the locked amount...
            // set it equal to locked, keep track of the overflow tokens (remainingTokenAmount)
            if(remainingTokenAmount > maxLocked) {
                returnTokenAmount = remainingTokenAmount - maxLocked;
                remainingTokenAmount = maxLocked;
            }

            // decrease the total allocated ETH by the equivalent participant's allocated amount
            projectAllocatedETH = projectAllocatedETH.sub(participantRecord.allocatedETH);

            if(remainingTokenAmount > 0) {

                // go through stages starting with current stage
                // take stage token amount and remove from "amount participant wants to return"
                // get ETH amount in said stage for that token amount
                // set stage tokens to 0
                // if stage tokens < remaining tokens to process, just subtract remaining from stage
                // this way we can receive tokens in current stage / later stages and process them again.

                uint256 returnETHAmount; // defaults to 0

                uint8 currentStageNumber = getCurrentStage();

                for(uint8 stageId = currentStageNumber; stageId >= 0; stageId--) {

                    // total participant tokens at the current stage i.e. reserved + bought - returned
                    uint256 totalInStage = participantRecord.byStage[stageId].reservedTokens +
                        participantRecord.byStage[stageId].boughtTokens -
                        participantRecord.byStage[stageId].returnedTokens;

                    // calculate how many tokens are actually locked at this stage...
                    // ...(at the current block number) and use only those for returning.
                    // reserved + bought - returned (at currentStage & currentBlock)
                    uint256 tokensInStage = getLockedTokenAmountAtBlock(
                        participantRecord.byStage[stageId].reservedTokens +
                        participantRecord.byStage[stageId].boughtTokens,
                        currentBlockNumber
                    ) - participantRecord.byStage[stageId].returnedTokens;

                    // only try to process stages that the participant has actually tokens reserved.
                    if(tokensInStage > 0) {

                        // if the remaining amount is less than the amount available in the current stage
                        if (remainingTokenAmount < tokensInStage ) {
                            tokensInStage = remainingTokenAmount;
                        }
                        //get the equivalent amount of returned tokens in ETH
                        uint256 currentETHAmount = getEthAmountForTokensAtStage(tokensInStage, stageId);

                        //increase the returned tokens counters accordingly
                        participantRecord.returnedTokens += tokensInStage;
                        participantRecord.byStage[stageId].returnedTokens += tokensInStage;

                        // increase the corresponding ETH counters
                        returnETHAmount = returnETHAmount.add(currentETHAmount);
                        participantRecord.byStage[stageId].withdrawnETH += currentETHAmount;

                        // allocated to project
                        uint256 unlockedETHAmount = getEthAmountForTokensAtStage(
                            totalInStage.sub(tokensInStage),    // unlocked token amount
                            stageId
                        );

                        allocatedEthAmount += unlockedETHAmount;
                        participantRecord.byStage[stageId].allocatedETH = unlockedETHAmount;

                        // remove processed token amount from requested amount
                        remainingTokenAmount = remainingTokenAmount.sub(tokensInStage);

                        // break loop if remaining amount = 0
                        if(remainingTokenAmount == 0) {
                            break;
                        }
                    }
                }

                // return overflow tokens received
                if(returnTokenAmount > 0) {
                    // send tokens back to participant
                    bytes memory data;
                    // solium-disable-next-line security/no-send
                    tokenContract.send(_from, returnTokenAmount, data);
                }

                // increase participant's withdrawnETH counter
                participantRecord.withdrawnETH += returnETHAmount;

                // Update total ETH withdrawn
                withdrawnETH += returnETHAmount;

                // allocate remaining ETH to project directly
                participantRecord.allocatedETH = allocatedEthAmount;
                projectAllocatedETH = projectAllocatedETH.add(participantRecord.allocatedETH);

                participantRecord.withdrawnETH += returnETHAmount; //DUPLICATE??
                // transfer ETH back to participant
                address(uint160(_from)).transfer(returnETHAmount);
                emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _from, returnETHAmount);
                return;
            }
        }
        // If address is not Whitelisted a call to this results in a revert
        revert("Withdraw not possible. Participant has no locked tokens.");
    }

    /// @dev Records a new contribution.
    /// @param _from participant's address.
    /// @param _receivedValue the amount contributed.
    function recordNewContribution(address _from, uint256 _receivedValue) internal {
        uint8 currentStage = getCurrentStage();
        Participant storage participantRecord = participantsByAddress[_from];

        // update participant's total stats
        participantRecord.contributionsCount++;
        participantRecord.committedETH += _receivedValue;

        // update participant's per-stage stats
        ParticipantDetailsByStage storage byStage = participantRecord.byStage[currentStage];
        byStage.committedETH += _receivedValue;


        // get the equivalent amount in tokens
        uint256 newTokenAmount = getTokenAmountForEthAtStage(
            _receivedValue, currentStage
        );
        // update participant's reserved tokens
        // thee can change when contribution is accepted if max cap is hit
        byStage.reservedTokens += newTokenAmount;
        participantRecord.reservedTokens += newTokenAmount;

        emit ApplicationEvent(
            uint8(ApplicationEventTypes.CONTRIBUTION_NEW),
            uint32(participantRecord.contributionsCount),
            _from,
            _receivedValue
        );
    }

    /// @dev Accept participant's contribution.
    /// param _from participant's address.
    /// param _eventType can be either WHITELIST_APPROVE or COMMITMENT_ACCEPTED.
    function acceptContributionsForAddress(
        address _from,
        uint8 _eventType
    )
    internal
    {
        Participant storage participantRecord = participantsByAddress[_from];
        uint8 currentStage = getCurrentStage();

        for(uint8 i = 0; i <= currentStage; i++) {
            uint8 stageId = i;

            ParticipantDetailsByStage storage byStage = participantRecord.byStage[stageId];

            uint256 processedTotals = participantRecord.acceptedETH + participantRecord.returnedETH;

            if(processedTotals < participantRecord.committedETH) {

                // handle the case when we have reserved more tokens than globally available
                participantRecord.reservedTokens -= byStage.reservedTokens;
                byStage.reservedTokens = 0;

                // the maximum amount is equal to the total available ETH at the current stage
                uint256 maxAcceptableValue = availableEthAtStage(currentStage);

                // the per stage accepted amount: committedETH - acceptedETH
                uint256 newAcceptedValue = byStage.committedETH - byStage.acceptedETH;
                uint256 returnValue;

                // if incomming value is higher than what we can accept,
                // just accept the difference and return the rest
                if(newAcceptedValue > maxAcceptableValue) {
                    newAcceptedValue = maxAcceptableValue;
                    returnValue = byStage.committedETH - byStage.returnedETH - byStage.acceptedETH -
                    byStage.withdrawnETH - newAcceptedValue;

                    // update return values
                    returnedETH += returnValue;
                    participantRecord.returnedETH += returnValue;
                    byStage.returnedETH = returnValue;
                }

                if(newAcceptedValue > 0) {

                    // update values by adding the new accepted amount
                    acceptedETH += newAcceptedValue;
                    participantRecord.acceptedETH += newAcceptedValue;
                    byStage.acceptedETH += newAcceptedValue;

                    // calculate the equivalent token amount
                    uint256 newTokenAmount = getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    // update participant's token amounts
                    participantRecord.boughtTokens += newTokenAmount;
                    byStage.boughtTokens += newTokenAmount;

                    // allocate tokens to participant
                    bytes memory data;
                    // solium-disable-next-line security/no-send
                    tokenContract.send(_from, newTokenAmount, data);
                }

                // if the incoming amount is too big to accept, then...
                // ... we must tranfer back the difference.
                if(returnValue > 0) {
                    address(uint160(_from)).transfer(returnValue);
                    emit TransferEvent(uint8(TransferTypes.AUTOMATIC_RETURN), _from, returnValue);
                }

                emit ApplicationEvent(_eventType, uint32(stageId), _from, newAcceptedValue);
            }
        }
    }

    /// @dev Cancels all of the participant's contributions so far.
    /// @param _from participant's address
    /// @param _eventType reason for canceling: {WHITELIST_REJECT, PARTICIPANT_CANCEL}
    function cancelContributionsForAddress(
        address _from,
        uint8 _eventType
    )
    internal
    {

        // one should only be able to cancel if they haven't been whitelisted yet...
        // ...but just to make sure take withdrawn and returned into account.
        // This is to handle the case when whitelist controller whitelists someone, then rejects...
        // ...then whitelists them again.

        Participant storage participantRecord = participantsByAddress[_from];

        // calculate participant's available ETH i.e. commited - withdrawnETH - returnedETH
        uint256 participantAvailableETH = participantRecord.committedETH -
            participantRecord.withdrawnETH -
            participantRecord.returnedETH;

        if(participantAvailableETH > 0) {
            // update total ETH returned
            returnedETH += participantAvailableETH;

            // update participant's audit values
            participantRecord.reservedTokens = 0;
            participantRecord.withdrawnETH += participantAvailableETH;


            // since this balance was never actually "accepted" it counts as returned
            // otherwise it interferes with project withdraw calculations
            returnedETH += participantAvailableETH; // TO DO: REMOVE DUPLICATE!!!

            // transfer ETH back to participant including received value
            address(uint160(_from)).transfer(participantAvailableETH + msg.value);

            uint8 currentTransferEventType;

            if(_eventType == uint8(ApplicationEventTypes.WHITELIST_REJECT)) {
                currentTransferEventType = uint8(TransferTypes.WHITELIST_REJECT);
            } else if (_eventType == uint8(ApplicationEventTypes.PARTICIPANT_CANCEL)) {
                currentTransferEventType = uint8(TransferTypes.PARTICIPANT_CANCEL);
            }

            // event emission
            emit TransferEvent(currentTransferEventType, _from, participantAvailableETH);
            emit ApplicationEvent(
                _eventType,
                uint32(participantRecord.contributionsCount),
                _from,
                participantAvailableETH
            );

        } else {
            revert("Participant has not contributed any ETH yet.");
        }
    }


    /*
    *   Modifiers
    */

    /// @dev Checks if the sender is the deployer.
    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "Only the deployer can call this method.");
        _;
    }

    /// @dev Checks if the sender is the whitelist controller.
    modifier onlyWhitelistController() {
        require(msg.sender == whitelistControllerAddress, "Only the whitelist controller can call this method.");
        _;
    }

    /// @dev Requires the contract to have been initiallized
    modifier isInitialized() {
        require(initialized == true, "Contract must be initialized.");
        _;
    }

    /// @dev Requires the contract to NOT have been initiallized
    modifier isNotInitialized() {
        require(initialized == false, "Contract is already initialized.");
        _;
    }

    /// @dev Requires the contract to be frozen
    modifier isFrozen() {
        require(frozen == true, "Contract is not frozen.");
        _;
    }

    /// @dev Requires the contract to be non-frozen
    modifier isNotFrozen() {
        require(frozen == false, "Contract can not be frozen.");
        _;
    }

    modifier isRunning() {
        uint256 blockNumber = getCurrentBlockNumber();
        require(blockNumber >= commitPhaseStartBlock && blockNumber <= buyPhaseEndBlock, "Contract outside buyin range");
        _;
    }


}
