/*
 * source       https://github.com/lukso-network/rICO-smart-contracts
 * @name        rICO
 * @package     rICO-smart-contracts
 * @author      Micky Socaci <micky@binarzone.com>, Fabian Vogelsteller <@frozeman>, Marjorie Hernandez <marjorie@lukso.io>
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

    /// @dev The address of the introspection registry contract deployed.
    IERC1820Registry private ERC1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");


    /*
     *   Contract States
     */
    /// @dev It is set to TRUE after the deployer initializes the contract.
    bool public initialized;

    /// @dev The contract can be automatically frozen in case of inconsistencies.
    bool public frozen;


    /*
     *   Addresses
     */
    /// @dev Only the deployer is allowed to initialize the contract.
    address public deployerAddress;
    /// @dev The rICO token contract address.
    address public tokenAddress;
    /// @dev The address of wallet of the project running the rICO.
    address public projectAddress;
    /// @dev Only the whitelist controller can whitelist addresses.
    address public whitelisterAddress;


    /*
     *   Public Variables
     */
    /// @dev Total amount tokens available to be bought.
    uint256 public tokenSupply;
    /// @dev Total amount of ETH currently accepted as a commitment to buy tokens (excluding pendingETH).
    uint256 public committedETH;
    /// @dev Total amount of ETH currently pending to be whitelisted.
    uint256 public pendingETH;
    /// @dev Accumulated amount of ETH received by the smart contract.
    uint256 public totalSentETH;
    /// @dev Accumulated amount of ETH returned from canceled pending ETH.
    uint256 public canceledETH;
    /// @dev Accumulated amount of ETH withdrawn by participants.
    uint256 public withdrawnETH;
    /// @dev Count of the number the project has withdrawn from the funds raised.
    uint256 public projectWithdrawCount;
    /// @dev Total amount of ETH withdrawn by the project
    uint256 public projectWithdrawnETH;

    /// @dev Minimum amount of ETH accepted for a contribution. Everything lower than that will trigger a canceling of pending ETH.
    uint256 public minContribution = 0.001 ether;

    /*
     *   Commit phase (Stage 0)
     */
    /// @dev Initial token price in the commit phase (Stage 0).
    uint256 public commitPhasePrice;
    /// @dev Block number that indicates the start of the commit phase.
    uint256 public commitPhaseStartBlock;
    /// @dev Block number that indicates the end of the commit phase.
    uint256 public commitPhaseEndBlock;
    /// @dev The duration of the commit phase in blocks.
    uint256 public commitPhaseBlockCount;


    /*
     *   Buy phases (Stages 1-n)
     */
    /// @dev Block number that indicates the start of the buy phase (Stages 1-n).
    uint256 public buyPhaseStartBlock;
    /// @dev Block number that indicates the end of the buy phase.
    uint256 public buyPhaseEndBlock;
    /// @dev The duration of the buy phase in blocks.
    uint256 public buyPhaseBlockCount;


    mapping(uint8 => Stage) public stages;
    uint8 public stageCount;
    uint256 public stageBlockCount;

    /// @dev Maps participants stats by their address.
    mapping(address => Participant) public participants;
    /// @dev Maps participants address to a unique participant ID (incremental IDs, based on "participantCount").
    mapping(uint256 => address) public participantsById; // TODO remove?
    /// @dev Total number of rICO participants.
    uint256 public participantCount;

    //    uint256 public DEBUG1 = 9999;
    //    uint256 public DEBUG2 = 9999;
    //    uint256 public DEBUG3 = 9999;
    //    uint256 public DEBUG4 = 9999;

    /*
    *   Internal Variables
    */
    /// @dev Total amount of the current reserved ETH for the project by the participants contributions.
    uint256 internal _projectCurrentlyReservedETH;
    /// @dev Accumulated amount allocated to the project by participants.
    uint256 internal _projectTotalUnlockedETH;
    /// @dev Last block since the project has calculated the _projectTotalUnlockedETH.
    uint256 internal _projectLastBlock;


    /*
    *   Structs
    */

    /*
     *   Stages
     *   Stage 0 = commit phase
     *   Stage 1-n = buy phase
     */
    struct Stage {
        uint128 startBlock;
        uint128 endBlock;
        uint256 tokenPrice;
    }

    /*
     * Participants
     */
    struct Participant {
        bool whitelisted;
        uint32 contributions;
        uint32 withdraws;
        uint256 totalReservedTokens;
        uint256 committedEth;
        uint256 pendingEth;

        uint256 _totalUnlockedTokens;
        uint256 _currentReservedTokens;
        uint256 _lastBlock;

        mapping(uint8 => ParticipantStageDetails) stages;
    }

    struct ParticipantStageDetails {
        uint256 pendingEth;
    }

    /*
     * Events
     */
    event ApplicationEvent (
        uint8 indexed typeId,
        uint32 indexed id,
        address indexed relatedAddress,
        uint256 value
    );

    event TransferEvent (
        uint8 indexed typeId,
        address indexed relatedAddress,
        uint256 indexed value
    );

    enum ApplicationEventTypes {
        NOT_SET, // 0; will match default value of a mapping result
        CONTRIBUTION_ADDED, // 1
        CONTRIBUTION_CANCELED, // 2
        CONTRIBUTION_ACCEPTED, // 3
        WHITELIST_APPROVED, // 4
        WHITELIST_REJECTED, // 5
        PROJECT_WITHDRAWN // 6
    }

    enum TransferTypes {
        NOT_SET, // 0
        WHITELIST_REJECTED, // 1
        CONTRIBUTION_CANCELED, // 2
        CONTRIBUTION_ACCEPTED_OVERFLOW, // 3 not accepted ETH
        PARTICIPANT_WITHDRAW, // 4
        PARTICIPANT_WITHDRAW_OVERFLOW, // 5 not returnable tokens
        PROJECT_WITHDRAWN // 6
    }



    // ------------------------------------------------------------------------------------------------

    /// @notice Constructor sets the deployer and defines ERC777TokensRecipient interface support.
    constructor() public {
        deployerAddress = msg.sender;
        ERC1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }

    /**
     * @notice Initializes the contract. Only the deployer (set in the constructor) can call this method.
     * @param _tokenAddress The address of the ERC777 rICO token contract.
     * @param _whitelisterAddress The address of the controller handling whitelisting.
     * @param _projectAddress The project wallet that can withdraw the contributions.
     * @param _commitPhaseStartBlock The block in which the commit phase starts.
     * @param _commitPhaseBlockCount The duration of the commit phase in blocks.
     * @param _commitPhasePrice The initial token price (in wei) during the commit phase.
     * @param _stageCount The number of the rICO stages.
     * @param _stageBlockCount The duration of each stage in blocks.
     * @param _stagePriceIncrease A factor used to increase the token price at each subsequent stage.
     */
    function init(
        address _tokenAddress,
        address _whitelisterAddress,
        address _projectAddress,
        uint256 _commitPhaseStartBlock,
        uint256 _commitPhaseBlockCount,
        uint256 _commitPhasePrice,
        uint8 _stageCount,
        uint256 _stageBlockCount,
        uint256 _stagePriceIncrease
    )
    public
    onlyDeployer
    isNotInitialized
    {

        require(_commitPhaseStartBlock > getCurrentBlockNumber(), "Start block cannot be set in the past.");

        // Assign address variables
        tokenAddress = _tokenAddress;
        whitelisterAddress = _whitelisterAddress;
        projectAddress = _projectAddress;

        // UPDATE global STATS
        commitPhaseStartBlock = _commitPhaseStartBlock;
        commitPhaseBlockCount = _commitPhaseBlockCount;
        commitPhaseEndBlock = _commitPhaseStartBlock.add(_commitPhaseBlockCount).sub(1);
        commitPhasePrice = _commitPhasePrice;

        stageBlockCount = _stageBlockCount;
        stageCount = _stageCount;

        // Setup stage 0: The commit phase.
        Stage storage commitPhase = stages[0];

        commitPhase.startBlock = uint128(_commitPhaseStartBlock);
        commitPhase.endBlock = uint128(commitPhaseEndBlock);
        commitPhase.tokenPrice = _commitPhasePrice;

        // Setup stage 1 to n: The buy phase stages
        // Each new stage starts after the previous phase's endBlock
        uint256 previousStageEndBlock = commitPhase.endBlock;

        // Update stages: start, end, price
        for (uint8 i = 1; i <= _stageCount; i++) {
            // Get i-th stage
            Stage storage stageN = stages[i];
            // Start block is previous phase end block + 1, e.g. previous stage end=0, start=1;
            stageN.startBlock = uint128(previousStageEndBlock.add(1));
            // End block is previous phase end block + stage duration e.g. start=1, duration=10, end=0+10=10;
            stageN.endBlock = uint128(previousStageEndBlock.add(_stageBlockCount));
            // Store the current stage endBlock in order to update the next one
            previousStageEndBlock = stageN.endBlock;
            // At each stage the token price increases by _stagePriceIncrease * stageCount
            stageN.tokenPrice = _commitPhasePrice.add(_stagePriceIncrease.mul(i));
        }

        // UPDATE global STATS
        // The buy phase starts on the subsequent block of the commitPhase's (stage0) endBlock
        buyPhaseStartBlock = commitPhaseEndBlock.add(1);
        // The buy phase ends when the lat stage ends
        buyPhaseEndBlock = previousStageEndBlock;
        // The duration of buyPhase in blocks
        buyPhaseBlockCount = buyPhaseEndBlock.sub(buyPhaseStartBlock).add(1);

        // UPDATE global stats
        //        projectWithdrawnBlock = buyPhaseStartBlock;

        // The contract is now initialized
        initialized = true;
    }


    /*
     * Public functions
     * The main way to interact with the rICO.
     */

    /**
     * @notice FALLBACK function: depending on the amount received it commits or it cancels contributions.
     */
    function()
    external
    payable
    isInitialized
    isNotFrozen
    isRunning
    {
        require(msg.value > minContribution, 'To contribute, call the commit() function and send ETH along.');

        // Participant cancels commitment during commit phase (Stage 0) OR if they've not been whitelisted yet.
        cancel(msg.sender, msg.value);
    }

    /**
     * @notice ERC777TokensRecipient implementation for receiving ERC777 tokens.
     * @param _from Token sender.
     * @param _amount Token amount.
     */
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
    isNotFrozen
    {
        // rICO should only receive tokens from the rICO Token Tracker.
        // Transactions from any other sender should revert
        require(msg.sender == tokenAddress, "Invalid token sent.");

        // 1 - project wallet adds tokens to the sale
        if (_from == projectAddress) {
            // Save the token amount allocated to the rICO address
            tokenSupply = tokenSupply.add(_amount);

            // 2 - rICO contributor sends tokens back
        } else {
            withdraw(_from, _amount);
        }
    }


    /**
     * @notice External wrapper for commit() so that a participant can call it directly.
     */
    function commit()
    public
    payable
    {
        // Reject contributions lower than the minimum amount
        require(msg.value >= minContribution, "Value sent is less than minimum contribution.");
        // Call internal commit() for processing the contribution
        commit(msg.sender, msg.value);
    }


    /**
     * @notice Commits a participant's ETH.
     */
    function commit(address _sender, uint256 _value)
    internal
    isInitialized
    isNotFrozen
    isRunning
    {

        // UPDATE global STATS
        totalSentETH = totalSentETH.add(_value);

        // Participant initial state record
        Participant storage participantRecord = participants[_sender];

        // Check if participant already exists
        if (participantRecord.contributions == 0) {
            // Identify the participants by their Id
            participantsById[participantCount] = _sender;
            // Increase participant count
            participantCount++;
        }

        // Record contribution into current stage totals for the participant
        addPendingContribution(_sender, _value);

        // If whitelisted, process the contribution automatically
        if (participantRecord.whitelisted == true) {
            acceptContributionsForAddress(_sender, uint8(ApplicationEventTypes.CONTRIBUTION_ACCEPTED));
        }
    }

    /**
     * @notice External wrapper for cancel() so that a participant can call it directly.
     */
    function cancel()
    public
    payable
    {
        // Call internal cancel() for processing the request
        cancel(msg.sender, msg.value);
    }

    /**
     * @notice Cancels any participant's pending ETH commitment.
     * Pending is any ETH from participants that are not whitelisted yet.
     */
    function cancel(address _sender, uint256 _value)
    internal
    isInitialized
    isNotFrozen
    isRunning
    {
        // Participant must have pending ETH ...
        require(hasPendingETH(_sender), "Participant has no pending contributions.");

        // Cancel participant's contribution.
        cancelContributionsForAddress(_sender, _value, uint8(ApplicationEventTypes.CONTRIBUTION_CANCELED));
    }

    /**
     * @notice Approves or rejects participants.
     * @param _addresses The list of participant address.
     * @param _approve Indicates if the provided participants are approved (true) or rejected (false).
     */
    function whitelist(address[] calldata _addresses, bool _approve)
    external
    isInitialized
    isNotFrozen
    onlyWhitelistController
    {
        // Revert if the provided list is empty
        require(_addresses.length > 0, "No addresses to whitelist given.");

        for (uint256 i = 0; i < _addresses.length; i++) {
            address participantAddress = _addresses[i];

            Participant storage participantRecord = participants[participantAddress];

            if (_approve) {
                if (!participantRecord.whitelisted) {
                    // If participants are approved: whitelist them and accept their contributions
                    participantRecord.whitelisted = true;
                    acceptContributionsForAddress(participantAddress, uint8(ApplicationEventTypes.WHITELIST_APPROVED));
                }
            } else {
                // Decline participant and cancel their contributions, if they have pending ETH.
                if (hasPendingETH(participantAddress)) {
                    cancelContributionsForAddress(participantAddress, 0, uint8(ApplicationEventTypes.WHITELIST_REJECTED));
                }
                participantRecord.whitelisted = false;
            }
        }
    }

    /**
     * @notice Allows for the project to withdraw ETH.
     * @param _ethAmount The ETH amount in wei.
     */
    function projectWithdraw(uint256 _ethAmount)
    external
    isInitialized
    {
        require(msg.sender == projectAddress, "Only project wallet address.");

        // UPDATE the locked/unlocked ratio for the project
        calcProjectAllocation();

        // Get current allocated ETH to the project
        uint256 availableForWithdraw = _projectTotalUnlockedETH.sub(projectWithdrawnETH);

        require(_ethAmount <= availableForWithdraw, "Requested amount too big, not enough ETH available.");

        // UPDATE global STATS
        projectWithdrawCount++;
        projectWithdrawnETH = projectWithdrawnETH.add(_ethAmount);

        // Transfer ETH to project wallet
        address(uint160(projectAddress)).transfer(_ethAmount);

        // Event emission
        emit ApplicationEvent(
            uint8(ApplicationEventTypes.PROJECT_WITHDRAWN),
            uint32(projectWithdrawCount),
            projectAddress,
            _ethAmount
        );
        emit TransferEvent(
            uint8(TransferTypes.PROJECT_WITHDRAWN),
            projectAddress,
            _ethAmount
        );
    }

    // ------------------------------------------------------------------------------------------------

    /*
     * Public view functions
     */

    /**
     * @notice Returns TRUE if the participant is whitelisted, otherwise FALSE.
     * @param _address the participant's address.
     * @return Boolean
     */
    function isWhitelisted(address _address) public view returns (bool) {
        return participants[_address].whitelisted;
    }

    /**
     * @notice Returns project's current available ETH and unlocked ETH amount.
     * @return uint256 The unlocked amount available to the project for withdraw.
     */
    function getAvailableProjectETH() public view returns (uint256) {

        // calc from the last known point on
        uint256 newlyUnlockedEth = calcUnlockAmount(_projectCurrentlyReservedETH, _projectLastBlock);

        return _projectTotalUnlockedETH
            .add(newlyUnlockedEth)
            .sub(projectWithdrawnETH);
    }

    /**
     * @notice Returns the current stage at the current block number.
     * @return The current stage ID
     */
    function getCurrentStage() public view returns (uint8) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    /**
     * @notice Returns the current token price at the current block number.
     * @return The current ETH price in wei.
     */
    function getCurrentPrice() public view returns (uint256) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    /**
     * @notice Returns the token price at the specified block number.
     * @param _blockNumber the block number at which we want to retrieve the token price.
     * @return The ETH price in wei
     */
    function getPriceAtBlock(uint256 _blockNumber) public view returns (uint256) {
        return getPriceAtStage(getStageAtBlock(_blockNumber));
    }

    /**
     * @notice Returns the token price at the specified stage id.
     * @param _stageId the stageid number at which we want to retrieve the token price.
     */
    function getPriceAtStage(uint8 _stageId) public view returns (uint256) {
        if (_stageId <= stageCount) {
            return stages[_stageId].tokenPrice;
        }
        revert("No price data found.");
    }

    /**
     * @notice Returns the amount of tokens that ETH would buy at a specific stage.
     * @param _ethAmount The ETH amount in wei.
     * @param _stageId The stage we are interested in.
     * @return The token amount in its smallest unit
     */
    function getTokenAmountForEthAtStage(uint256 _ethAmount, uint8 _stageId) public view returns (uint256) {
        return _ethAmount
            .mul(10 ** 18)
            .div(stages[_stageId].tokenPrice);
    }

    /**
     * @notice Returns the amount of ETH (in wei) that tokens are worth at a specified stage.
     * @param _tokenAmount The amount of token.
     * @param _stageId The stage we are interested in.
     * @return The ETH amount in wei
     */
    function getEthAmountForTokensAtStage(uint256 _tokenAmount, uint8 _stageId) public view returns (uint256) {
        return _tokenAmount
            .mul(stages[_stageId].tokenPrice)
            .div(10 ** 18);
    }

    /*
     * Participant view functions
     */

    /**
    * @notice Returns the participants current pending total ETH amount
    * @param _participantAddress The participant's address.
    */
    function getParticipantPendingETH(address _participantAddress) public view returns (uint256) {
        //        Participant storage participantStats = participants[_participantAddress];
        return participants[_participantAddress].pendingEth;
    }

    /**
     * @notice Returns TRUE if the participant has reserved tokens in the current stage.
     * @param _participantAddress The participant's address.
     */
    function canWithdraw(address _participantAddress) public view returns (bool) {
        if (currentReservedTokenAmount(_participantAddress) > 0) {
            return true;
        }
        return false;
    }

    /**
     * @notice Returns TRUE if participant has pending ETH.
     * @param _participantAddress The participant's address.
     */
    function hasPendingETH(address _participantAddress) public view returns (bool) {
        if (getParticipantPendingETH(_participantAddress) > 0) {
            return true;
        }
        return false;
    }

    /**
     * @notice Returns the cancel modes for a participant.
     * @param _participantAddress The participant's address.
     * @return byEth Boolean
     * @return byTokens Boolean
     */
    function getCancelModes(address _participantAddress) external view returns (bool byEth, bool byTokens) {
        byTokens = canWithdraw(_participantAddress);
        byEth = hasPendingETH(_participantAddress);
    }

    // ------------------------------------------------------------------------------------------------

    /*
     * Helper public view functions
     */

    /**
     * @notice Returns the current block number: required in order to override when running tests.
     */
    function getCurrentBlockNumber() public view returns (uint256) {
        return block.number;
    }

    /**
     * @notice Returns the stage which a given block belongs to.
     * @param _blockNumber The block number.
     */
    function getStageAtBlock(uint256 _blockNumber) public view returns (uint8) {

        // *NOTE: if selectedBlock is end block.. the participant will get the correct
        //        stage now but their new transaction will end up in the
        //        next block which changes the stage vs what they've seen..
        //        resulting in a different purchase price.
        //
        // @TODO: decide how we want to handle this on the frontend,
        //        contract should always display proper data.
        //

        require(_blockNumber >= commitPhaseStartBlock && _blockNumber <= buyPhaseEndBlock, "Block outside of rICO period.");

        // Return commit phase (stage 0)
        if (_blockNumber <= commitPhaseEndBlock) {
            return 0;
        }

        // This is the number of blocks starting from the first stage.
        uint256 distance = _blockNumber - (commitPhaseEndBlock + 1);
        // Get the stageId (1..stageCount), commitPhase is stage 0
        // e.g. distance = 5, stageBlockCount = 5, stageID = 2
        uint256 stageID = 1 + (distance / stageBlockCount);

        return uint8(stageID);
    }


    /**
     * @notice Returns the contract's available ETH to commit at a certain stage.
     * @param _stage the stage id.
     * TODO we use such functions in the main commit calculations, are there chances of rounding errors?
     */
    function availableEthAtStage(uint8 _stage) public view returns (uint256) {
        // Multiply the number of tokens held by the contract with the token price
        // at the specified stage and perform precision adjustments(div).
        return IERC777(tokenAddress).balanceOf(address(this)).mul(
            stages[_stage].tokenPrice
        ).div(10 ** 18); // should we use 10 ** 20?
    }

    /**
     * @notice Calculates the unlocked amount of bought tokens (or ETH allocated to the project) beginning from the buy phase start to the current block.
     *
     * This is the rICOs heart, the CORE of the distribution calculation!
     *
     * @return the unlocked amount of tokens or ETH.
     */
    function calcUnlockAmount(uint256 _amount, uint256 _lastBlock) public view returns (uint256) {

        uint256 currentBlock = getCurrentBlockNumber();

        if(_amount == 0) {
            return 0;
        }

        // Calculate WITHIN the buy phase
        if (currentBlock >= buyPhaseStartBlock && currentBlock <= buyPhaseEndBlock) {

            // security/no-assign-params: "calcUnlockAmount": Avoid assigning to function parameters.
            uint256 lastBlock = _lastBlock;
            if(lastBlock < buyPhaseStartBlock) {
                lastBlock = buyPhaseStartBlock - 1; // We need to reduce it by 1, as the startBlock is alwasy already IN the period.
            }

            // get the number of blocks that have "elapsed" since the last block
            uint256 passedBlocks = currentBlock.sub(lastBlock);

            // number of blocks ( ie: start=4/end=10 => 10 - 4 => 6 )
            uint256 totalBlockCount = buyPhaseEndBlock.sub(lastBlock);

            return _amount.mul(
                passedBlocks.mul(10 ** 20)
                .div(totalBlockCount)
            ).div(10 ** 20);

            // Return everything AFTER the buy phase
        } else if (currentBlock > buyPhaseEndBlock) {
            return _amount;
        }
        // Return nothing BEFORE the buy phase
        return 0;
    }


    // TODO remove
    function getCurrentGlobalUnlockRatio() public view returns (uint256) {
        uint256 currentBlock = getCurrentBlockNumber();

        if (currentBlock >= buyPhaseStartBlock && currentBlock <= buyPhaseEndBlock) {
            // number of blocks ( ie: start=5/end=10 => 10 - 5 + 1 => 6 )
            uint256 totalBlockCount = buyPhaseEndBlock.sub(buyPhaseStartBlock).add(1);

            // get the number of blocks that have "elapsed" since the start block
            // add 1 since start block needs to return higher than 0
            uint256 passedBlocks = currentBlock.sub(buyPhaseStartBlock).add(1);

            return passedBlocks.mul(10 ** 20)
            .div(totalBlockCount);

            // Return everything AFTER the buy phase
        } else if (currentBlock > buyPhaseEndBlock) {
            return uint256(1).mul(10 ** 20);
        }
        // Return nothing BEFORE the buy phase
        return 0;
    }


    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function currentReservedTokenAmount(address _participantAddress) public view returns (uint256) {
        Participant storage participantStats = participants[_participantAddress];

        if(participantStats._currentReservedTokens == 0) {
            return 0;
        }

        return participantStats._currentReservedTokens.sub(
            calcUnlockAmount(participantStats._currentReservedTokens, participantStats._lastBlock)
        );
    }

    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function currentUnlockedTokenAmount(address _participantAddress) public view returns (uint256) {
        Participant storage participantStats = participants[_participantAddress];

        return participantStats._totalUnlockedTokens.add(
            calcUnlockAmount(participantStats._currentReservedTokens, participantStats._lastBlock)
        );
    }


    // ------------------------------------------------------------------------------------------------

    /*
     * Internal functions
     */


    /**
    * @notice Checks the projects core variables and ETH amounts in the contract for correctness.
    */
    function sanityCheckProject() internal view {
        // PROJECT: The sum of reserved + unlocked has to be equal the committedETH.
        require(
            committedETH == _projectCurrentlyReservedETH.add(_projectTotalUnlockedETH),
            'Project Sanity check failed! Reserved + Unlock must equal committedETH'
        );

        // PROJECT: The ETH in the rICO has to be the total of unlocked + reserved - withdraw
        require(
            address(this).balance == _projectTotalUnlockedETH.add(_projectCurrentlyReservedETH).add(pendingETH).sub(projectWithdrawnETH),
            'Project sanity check failed! balance = Unlock + Reserved - Withdrawn'
        );
    }

    /**
    * @notice Checks the projects core variables and ETH amounts in the contract for correctness.
    */
    function sanityCheckParticipant(address _participantAddress) internal view {
        Participant storage participantStats = participants[_participantAddress];

        //        DEBUG1 = participantStats.totalReservedTokens;
        //        DEBUG2 = participantStats._currentReservedTokens.add(participantStats._totalUnlockedTokens);

        // PARTICIPANT: The sum of reserved + unlocked has to be equal the totalReserved.
        require(
            participantStats.totalReservedTokens == participantStats._currentReservedTokens.add(participantStats._totalUnlockedTokens),
            'Participant Sanity check failed! Reser. + Unlock must equal totalReser'
        );
    }

    /**
     * @notice Calculates the projects allocation since the last calculation
     */
    function calcProjectAllocation() internal {

        uint256 newlyUnlockedEth = calcUnlockAmount(_projectCurrentlyReservedETH, _projectLastBlock);

        // UPDATE GLOBAL STATS
        _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.sub(newlyUnlockedEth);
        _projectTotalUnlockedETH = _projectTotalUnlockedETH.add(newlyUnlockedEth);
        _projectLastBlock = getCurrentBlockNumber();

        sanityCheckProject();
    }

    /**
     * @notice Calculates the participants allocation since the last calculation
     */
    function calcParticipantAllocation(address _participantAddress) internal {
        Participant storage participantStats = participants[_participantAddress];

        // UPDATE the locked/unlocked ratio for this participant
        participantStats._totalUnlockedTokens = currentUnlockedTokenAmount(_participantAddress);
        participantStats._currentReservedTokens = currentReservedTokenAmount(_participantAddress);
//        participantStats.committedEth = participantStats.committedEth.sub(
//            calcUnlockAmount(participantStats.committedEth, participantStats._lastBlock)
//        );

        // RESET BLOCKNUMBER: Reset the ratio calculations to start from this point in time.
        participantStats._lastBlock = getCurrentBlockNumber();

        // UPDATE the locked/unlocked ratio for the project
        calcProjectAllocation();
    }

    /**
     * @notice Records a new contribution.
     * @param _from Participant's address.
     * @param _receivedValue The amount contributed.
     */
    function addPendingContribution(address _from, uint256 _receivedValue) private {

        uint8 currentStage = getCurrentStage();

        Participant storage participantStats = participants[_from];
        ParticipantStageDetails storage stages = participantStats.stages[currentStage];

        // UPDATE PARTICIPANT STATS
        participantStats.contributions++;
        participantStats.pendingEth = participantStats.pendingEth.add(_receivedValue);
        stages.pendingEth = stages.pendingEth.add(_receivedValue);

        // UPDATE GLOBAL STATS
        pendingETH = pendingETH.add(_receivedValue);

        emit ApplicationEvent(
            uint8(ApplicationEventTypes.CONTRIBUTION_ADDED),
            uint32(participantStats.contributions),
            _from,
            _receivedValue
        );
    }

    /**
    * @notice Cancels all of the participant's contributions so far.
    * @param _participantAddress Participant's address
    * @param _value the ETH amount sent with the transaction, to return
    * @param _eventType Reason for canceling: {WHITELIST_REJECTED, CONTRIBUTION_CANCELED}
    */
    function cancelContributionsForAddress(address _participantAddress, uint256 _value, uint8 _eventType) internal {
        Participant storage participantStats = participants[_participantAddress];

        uint256 allPendingEth = participantStats.pendingEth;

        // Revert if there is no pending ETH contribution
        require(allPendingEth > 0, "Participant has no contributions to cancel.");

        // UPDATE PARTICIPANT STAGES
        for (uint8 stageId = 0; stageId <= getCurrentStage(); stageId++) {
            ParticipantStageDetails storage stages = participantStats.stages[stageId];
            stages.pendingEth = 0;
        }

        // UPDATE PARTICIPANT STATS
        participantStats.pendingEth = 0;

        // UPDATE GLOBAL STATS
        canceledETH = canceledETH.add(allPendingEth);
        pendingETH = pendingETH.sub(allPendingEth);

        // transfer ETH back to participant including received value
        address(uint160(_participantAddress)).transfer(allPendingEth.add(_value));

        // event emission
        emit TransferEvent(_eventType, _participantAddress, allPendingEth);
        emit ApplicationEvent(
            _eventType,
            uint32(participantStats.contributions),
            _participantAddress,
            allPendingEth
        );
    }

    /**
    * @notice Accept a participant's contribution.
    * @param _participantAddress Participant's address.
    * @param _eventType Can be either WHITELIST_APPROVED or CONTRIBUTION_ACCEPTED.
    */
    function acceptContributionsForAddress(address _participantAddress, uint8 _eventType) internal {
        Participant storage participantStats = participants[_participantAddress];

        uint8 currentStage = getCurrentStage();
        uint256 totalReturnETH;
        uint256 totalNewTokens;

        // stop if no ETH are pending
        if (participantStats.pendingEth == 0) {
            return;
        }

        calcParticipantAllocation(_participantAddress);

        // Iterate over all stages and their pending contributions
        for (uint8 stageId = 0; stageId <= currentStage; stageId++) {
            ParticipantStageDetails storage stages = participantStats.stages[stageId];

            // skip if not ETH is pending
            if (stages.pendingEth == 0) {
                continue;
            }

            uint256 maxAvailableEth = availableEthAtStage(currentStage);
            uint256 newlyCommittedEth = stages.pendingEth;
            uint256 returnEth = 0;

            // If incoming value is higher than what we can accept,
            // just accept the difference and return the rest
            if (newlyCommittedEth > maxAvailableEth) {
                returnEth = newlyCommittedEth.sub(maxAvailableEth);
                newlyCommittedEth = maxAvailableEth;

                totalReturnETH = totalReturnETH.add(returnEth);
            }

            // convert ETH to TOKENS
            uint256 newTokenAmount = getTokenAmountForEthAtStage(
                newlyCommittedEth, stageId
            );

            totalNewTokens = totalNewTokens.add(newTokenAmount);

            // UPDATE PARTICIPANT STATS
            participantStats._currentReservedTokens = participantStats._currentReservedTokens.add(newTokenAmount);
            participantStats.totalReservedTokens = participantStats.totalReservedTokens.add(newTokenAmount);
            participantStats.committedEth = participantStats.committedEth.add(newlyCommittedEth);
            participantStats.pendingEth = participantStats.pendingEth.sub(stages.pendingEth);

            stages.pendingEth = stages.pendingEth.sub(stages.pendingEth);

            // UPDATE GLOBAL STATS
            tokenSupply = tokenSupply.sub(newTokenAmount);
            pendingETH = pendingETH.sub(newlyCommittedEth);
            committedETH = committedETH.add(newlyCommittedEth);
            _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.add(newlyCommittedEth);

            // Emit event
            emit ApplicationEvent(_eventType, uint32(stageId), _participantAddress, newlyCommittedEth);
        }

        // SANITY CHECK
        sanityCheckParticipant(_participantAddress);

        // Return what couldn't be accepted
        if (totalReturnETH > 0) {

            // UPDATE global STATS
            withdrawnETH = withdrawnETH.add(totalReturnETH);

            address(uint160(_participantAddress)).transfer(totalReturnETH);
            emit TransferEvent(uint8(TransferTypes.CONTRIBUTION_ACCEPTED_OVERFLOW), _participantAddress, totalReturnETH);
        }

        // Transfer tokens to the participant
        // solium-disable-next-line security/no-send
        IERC777(tokenAddress).send(_participantAddress, totalNewTokens, "");
    }


    /**
     * @notice Allow a participant to withdraw by sending tokens back to rICO contract.
     * @param _participantAddress participant address.
     * @param _returnedTokenAmount The amount of tokens returned.
     */
    function withdraw(address _participantAddress, uint256 _returnedTokenAmount)
    internal
    isRunning
    {
        Participant storage participantStats = participants[_participantAddress];

        uint256 returnedTokenAmount = _returnedTokenAmount;
        uint256 overflowingTokenAmount;
        uint256 returnEthAmount;

        calcParticipantAllocation(_participantAddress);

        // Only allow reserved tokens be returned, return the overflow.
        if (returnedTokenAmount > participantStats._currentReservedTokens) {
            overflowingTokenAmount = returnedTokenAmount.sub(participantStats._currentReservedTokens);
            returnedTokenAmount = participantStats._currentReservedTokens;
        }


        // For STAGE 0, give back the price they put in
        if(getCurrentStage() == 0) {

            returnEthAmount = getEthAmountForTokensAtStage(returnedTokenAmount, 0);

        // For any other stage, calculate the avg price of all contributions
        } else {
            returnEthAmount = participantStats.committedEth.mul(
                returnedTokenAmount.mul(10 ** 20)
                .div(participantStats.totalReservedTokens)
            ).div(10 ** 20);
        }


        // UPDATE PARTICIPANT STATS
        participantStats.withdraws++;
        participantStats._currentReservedTokens = participantStats._currentReservedTokens.sub(returnedTokenAmount);
        participantStats.totalReservedTokens = participantStats.totalReservedTokens.sub(returnedTokenAmount);
        participantStats.committedEth = participantStats.committedEth.sub(returnEthAmount);

        // UPDATE global STATS
        tokenSupply = tokenSupply.add(returnedTokenAmount);
        withdrawnETH = withdrawnETH.add(returnEthAmount);
        committedETH = committedETH.sub(returnEthAmount);

        _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.sub(returnEthAmount);


        // SANITY CHECK
        sanityCheckParticipant(_participantAddress);


        // Return overflowing tokens received
        if (overflowingTokenAmount > 0) {
            // send tokens back to participant
            bytes memory data;
            // solium-disable-next-line security/no-send
            IERC777(tokenAddress).send(_participantAddress, overflowingTokenAmount, data);
            emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW_OVERFLOW), _participantAddress, overflowingTokenAmount);
        }

        // Return ETH back to participant
        address(uint160(_participantAddress)).transfer(returnEthAmount);
        emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _participantAddress, returnEthAmount);
    }

    /*
     *   Modifiers
     */

    /**
     * @notice Checks if the sender is the deployer.
     */
    modifier onlyDeployer() {
        require(msg.sender == deployerAddress, "Only the deployer can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the whitelist controller.
     */
    modifier onlyWhitelistController() {
        require(msg.sender == whitelisterAddress, "Only the whitelist controller can call this method.");
        _;
    }

    /**
     * @notice Requires the contract to have been initialized.
     */
    modifier isInitialized() {
        require(initialized == true, "Contract must be initialized.");
        _;
    }

    /**
     * @notice Requires the contract to NOT have been initialized,
     */
    modifier isNotInitialized() {
        require(initialized == false, "Contract is already initialized.");
        _;
    }

    /**
     * @notice @dev Requires the contract to be not frozen.
     */
    modifier isNotFrozen() {
        require(frozen == false, "Contract can not be frozen.");
        _;
    }

    /**
     * @notice Checks if the rICO is running.
     */
    modifier isRunning() {
        uint256 blockNumber = getCurrentBlockNumber();
        require(blockNumber >= commitPhaseStartBlock && blockNumber <= buyPhaseEndBlock, "Current block number outside the rICO range.");
        _;
    }
}
