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

    /// @dev Security guard. The freezer address can the freeze the contract and move its funds in case of emergency.
    bool public frozen;
    uint256 public frozenPeriod;
    uint256 public freezeStart;


    /*
     *   Addresses
     */
    /// @dev Only the deploying address is allowed to initialize the contract.
    address public deployingAddress;
    /// @dev The rICO token contract address.
    address public tokenAddress;
    /// @dev The address of wallet of the project running the rICO.
    address public projectAddress;
    /// @dev Only the whitelist controller can whitelist addresses.
    address public whitelistingAddress;
    /// @dev Only the freezer address can call the freeze functions.
    address public freezerAddress;
    /// @dev Only the rescuer address can move funds if the rICO is frozen.
    address public rescuerAddress;


    /*
     *   Public Variables
     */
    /// @dev Total amount tokens initially available to be bought, increases if the project adds more.
    uint256 public initialTokenSupply;
    /// @dev Total amount tokens currently available to be bought.
    uint256 public tokenSupply;
    /// @dev Total amount of ETH currently accepted as a commitment to buy tokens (excluding pendingETH).
    uint256 public committedETH;
    /// @dev Total amount of ETH currently pending to be whitelisted.
    uint256 public pendingETH;
    /// @dev Accumulated amount of all ETH returned from canceled pending ETH.
    uint256 public canceledETH;
    /// @dev Accumulated amount of all ETH withdrawn by participants.
    uint256 public withdrawnETH;
    /// @dev Count of the number the project has withdrawn from the funds raised.
    uint256 public projectWithdrawCount;
    /// @dev Total amount of ETH withdrawn by the project
    uint256 public projectWithdrawnETH;

    /// @dev Minimum amount of ETH accepted for a contribution. Everything lower than that will trigger a canceling of pending ETH.
    uint256 public minContribution = 0.001 ether;
    uint256 public maxContribution = 4000 ether;

    mapping(uint8 => Stage) public stages;
    uint8 public stageCount;

    /// @dev Maps participants stats by their address.
    mapping(address => Participant) public participants;
    /// @dev Maps participants address to a unique participant ID (incremental IDs, based on "participantCount").
    mapping(uint256 => address) public participantsById;
    /// @dev Total number of rICO participants.
    uint256 public participantCount;

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

    /*
    *   Internal Variables
    */
    /// @dev Total amount of the current reserved ETH for the project by the participants contributions.
    uint256 internal _projectCurrentlyReservedETH;
    /// @dev Accumulated amount allocated to the project by participants.
    uint256 internal _projectUnlockedETH;
    /// @dev Last block since the project has calculated the _projectUnlockedETH.
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
        uint256 tokenLimit; // 500k > 9.5M >
        uint256 tokenPrice;
    }

    /*
     * Participants
     */
    struct Participant {
        bool whitelisted;
        uint32 contributions;
        uint32 withdraws;
        uint256 firstContributionBlock;
        uint256 reservedTokens;
        uint256 committedETH;
        uint256 pendingETH;

        uint256 _currentReservedTokens;
        uint256 _unlockedTokens;
        uint256 _lastBlock;

        mapping(uint8 => ParticipantStageDetails) stages;
    }

    struct ParticipantStageDetails {
        uint256 pendingETH;
    }

    /*
     * Events
     */
    event PendingContributionAdded(address indexed participantAddress, uint256 indexed amount, uint32 indexed contributionId, uint8 stageId);
    event PendingContributionsCanceled(address indexed participantAddress, uint256 indexed amount, uint32 indexed contributionId);

    event WhitelistApproved(address indexed participantAddress, uint256 indexed pendingETH, uint32 indexed contributions);
    event WhitelistRejected(address indexed participantAddress, uint256 indexed pendingETH, uint32 indexed contributions);

    event ContributionsAccepted(address indexed participantAddress, uint256 indexed ethAmount, uint256 indexed tokenAmount, uint8 stageId);

    event ProjectWithdraw(address indexed projectAddress, uint256 indexed amount, uint32 indexed withdrawCount);
    event ParticipantWithdraw(address indexed participantAddress, uint256 indexed ethAmount, uint256 indexed tokenAmount, uint32 withdrawCount);

    event StageChanged(uint8 indexed stageId, uint256 indexed tokenLimit, uint256 indexed tokenPrice, uint256 effectiveBlockNumber);
    event WhitelistingAddressChanged(address indexed whitelistingAddress, uint8 indexed stageId, uint256 indexed effectiveBlockNumber);
    event FreezerAddressChanged(address indexed freezerAddress, uint8 indexed stageId, uint256 indexed effectiveBlockNumber);

    event SecurityFreeze(address indexed freezerAddress, uint8 indexed stageId, uint256 indexed effectiveBlockNumber);
    event SecurityUnfreeze(address indexed freezerAddress, uint8 indexed stageId, uint256 indexed effectiveBlockNumber);
    event SecurityDisableEscapeHatch(address indexed freezerAddress, uint8 indexed stageId, uint256 indexed effectiveBlockNumber);
    event SecurityEscapeHatch(address indexed rescuerAddress, address indexed to, uint8 indexed stageId, uint256 effectiveBlockNumber);


    event TransferEvent (
        uint8 indexed typeId,
        address indexed relatedAddress,
        uint256 indexed value
    );

    enum TransferTypes {
        NOT_SET, // 0
        WHITELIST_REJECTED, // 1
        CONTRIBUTION_CANCELED, // 2
        CONTRIBUTION_ACCEPTED_OVERFLOW, // 3 not accepted ETH
        PARTICIPANT_WITHDRAW, // 4
        PARTICIPANT_WITHDRAW_OVERFLOW, // 5 not returnable tokens
        PROJECT_WITHDRAWN, // 6
        FROZEN_ESCAPEHATCH_TOKEN, // 7
        FROZEN_ESCAPEHATCH_ETH // 8
    }


    // ------------------------------------------------------------------------------------------------

    /// @notice Constructor sets the deployer and defines ERC777TokensRecipient interface support.
    constructor() public {
        deployingAddress = msg.sender;
        ERC1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }

    /**
     * @notice Initializes the contract. Only the deployer (set in the constructor) can call this method.
     * @param _tokenAddress The address of the ERC777 rICO token contract.
     * @param _whitelistingAddress The address handling whitelisting.
     * @param _projectAddress The project wallet that can withdraw ETH contributions.
     * @param _commitPhaseStartBlock The block at which the commit phase starts.
     * @param _buyPhaseStartBlock The duration of the commit phase in blocks.
     * @param _initialPrice The initial token price (in WEI per token) during the commit phase.
     * @param _stageCount The number of the rICO stages, excluding the commit phase (Stage 0).
     * @param _stageLimitAmountIncrease The duration of each stage in blocks.
     * @param _stagePriceIncrease A factor used to increase the token price from the _initialPrice at each subsequent stage. The increase already happens in the first stage too.
     */
    function init(
        address _tokenAddress,
        address _whitelistingAddress,
        address _freezerAddress,
        address _rescuerAddress,
        address _projectAddress,
        uint256 _commitPhaseStartBlock,
        uint256 _buyPhaseStartBlock,
        uint256 _buyPhaseEndBlock,
        uint256 _initialPrice,
        uint8 _stageCount, // Its not recommended to choose more than 50 stages! (9 stages require ~650k GAS when whitelisting contributions, the whitelisting function could run out of gas with a high number of stages, preventing accepting contributions)
        uint256 _stageLimitAmountIncrease,
        uint256 _stagePriceIncrease
    )
    public
    onlyDeployingAddress
    isNotInitialized
    {
        require(_tokenAddress != address(0), "_tokenAddress cannot be 0x");
        require(_whitelistingAddress != address(0), "_whitelistingAddress cannot be 0x");
        require(_freezerAddress != address(0), "_freezerAddress cannot be 0x");
        require(_rescuerAddress != address(0), "_rescuerAddress cannot be 0x");
        require(_projectAddress != address(0), "_projectAddress cannot be 0x");
        // require(_commitPhaseStartBlock > getCurrentBlockNumber(), "Start block cannot be set in the past.");

        // Assign address variables
        tokenAddress = _tokenAddress;
        whitelistingAddress = _whitelistingAddress;
        freezerAddress = _freezerAddress;
        rescuerAddress = _rescuerAddress;
        projectAddress = _projectAddress;

        // UPDATE global STATS
        commitPhaseStartBlock = _commitPhaseStartBlock;
        commitPhaseEndBlock = _buyPhaseStartBlock.sub(1);
        commitPhaseBlockCount = commitPhaseEndBlock.sub(commitPhaseStartBlock).add(1);
        commitPhasePrice = _initialPrice;

        stageCount = _stageCount;


        // Setup stage 0: The commit phase.
        Stage storage commitPhase = stages[0];
        commitPhase.tokenLimit = _stageLimitAmountIncrease;
        commitPhase.tokenPrice = _initialPrice;


        // Setup stage 1 to n: The buy phase stages
        uint256 previousStageLimitAmount = _stageLimitAmountIncrease;

        // Update stages: start, end, price
        for (uint8 i = 1; i <= _stageCount; i++) {
            // Get i-th stage
            Stage storage byStage = stages[i];
            // set the stage limit amount
            byStage.tokenLimit = previousStageLimitAmount.add(_stageLimitAmountIncrease);
            // Store the current stage endBlock in order to update the next one
            previousStageLimitAmount = byStage.tokenLimit;
            // At each stage the token price increases by _stagePriceIncrease * stageCount
            byStage.tokenPrice = _initialPrice.add(_stagePriceIncrease.mul(i));
        }

        // UPDATE global STATS
        // The buy phase starts on the subsequent block of the commitPhase's (stage0) endBlock
        buyPhaseStartBlock = _buyPhaseStartBlock;
        // The buy phase ends when the lat stage ends
        buyPhaseEndBlock = _buyPhaseEndBlock;
        // The duration of buyPhase in blocks
        buyPhaseBlockCount = buyPhaseEndBlock.sub(buyPhaseStartBlock).add(1);

        // The contract is now initialized
        initialized = true;
    }

    /*
     * Public functions
     * ------------------------------------------------------------------------------------------------
     */

    /*
     * Public functions
     * The main way to interact with the rICO.
     */

    /**
     * @notice FALLBACK function: If the amount sent is smaller than `minContribution` it cancels all pending contributions.
     * IF you are a known contributor with at least 1 contribution and you are whitelisted, you can send ETH without calling "commit()" to contribute more.
     */
    function()
    external
    payable
    isInitialized
    isNotFrozen
    {
        Participant storage participantStats = participants[msg.sender];

        // allow to commit directly if its a known user with at least 1 contribution
        if (participantStats.whitelisted == true && participantStats.contributions > 0) {
            commit();

        // otherwise try to cancel
        } else {
            require(msg.value < minContribution, 'To contribute call commit() [0x3c7a3aff] and send ETH along.');

            // Participant cancels pending contributions.
            cancelPendingContributions(msg.sender, msg.value);
        }
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
        // rICO should only receive tokens from the rICO token contract.
        // Transactions from any other token contract revert
        require(msg.sender == tokenAddress, "Invalid token contract sent tokens.");

        // Project wallet adds tokens to the sale
        if (_from == projectAddress) {
            // increase the supply
            tokenSupply = tokenSupply.add(_amount);
            initialTokenSupply = initialTokenSupply.add(_amount);

            // rICO participant sends tokens back
        } else {
            withdraw(_from, _amount);
        }
    }

    /**
     * @notice Allows a participant to reserve tokens by committing ETH as contributions.
     *
     *  Function signature: 0x3c7a3aff
     */
    function commit()
    public
    payable
    isInitialized
    isNotFrozen
    isRunning
    {
        // Reject contributions lower than the minimum amount, and max than maxContribution
        require(msg.value >= minContribution, "Value sent is less than the minimum contribution.");

        // Participant initial state record
        uint8 currentStage = getCurrentStage();
        Participant storage participantStats = participants[msg.sender];
        ParticipantStageDetails storage byStage = participantStats.stages[currentStage];

        require(participantStats.committedETH.add(msg.value) <= maxContribution, "Value sent is larger than the maximum contribution.");

        // Check if participant already exists
        if (participantStats.contributions == 0) {
            // Identify the participants by their Id
            participantsById[participantCount] = msg.sender;
            // Increase participant count
            participantCount++;
        }

        // UPDATE PARTICIPANT STATS
        participantStats.contributions++;
        participantStats.pendingETH = participantStats.pendingETH.add(msg.value);
        byStage.pendingETH = byStage.pendingETH.add(msg.value);

        // UPDATE GLOBAL STATS
        pendingETH = pendingETH.add(msg.value);

        emit PendingContributionAdded(
            msg.sender,
            msg.value,
            uint32(participantStats.contributions),
            currentStage
        );

        // If whitelisted, process the contribution automatically
        if (participantStats.whitelisted == true) {
            acceptContributions(msg.sender);
        }
    }

    /**
     * @notice Allows a participant to cancel pending contributions
     *
     *  Function signature: 0xea8a1af0
     */
    function cancel()
    external
    payable
    isInitialized
    isNotFrozen
    {
        cancelPendingContributions(msg.sender, msg.value);
    }

    /**
     * @notice Approves or rejects participants.
     * @param _addresses The list of participant address.
     * @param _approve Indicates if the provided participants are approved (true) or rejected (false).
     */
    function whitelist(address[] calldata _addresses, bool _approve)
    external
    onlyWhitelistingAddress
    isInitialized
    isNotFrozen
    isRunning
    {
        // Revert if the provided list is empty
        require(_addresses.length > 0, "No addresses given to whitelist.");

        for (uint256 i = 0; i < _addresses.length; i++) {
            address participantAddress = _addresses[i];

            Participant storage participantStats = participants[participantAddress];

            if (_approve) {
                if (participantStats.whitelisted == false) {
                    // If participants are approved: whitelist them and accept their contributions
                    participantStats.whitelisted = true;
                    emit WhitelistApproved(participantAddress, participantStats.pendingETH, uint32(participantStats.contributions));
                }

                // accept any pending ETH
                acceptContributions(participantAddress);

            } else {
                participantStats.whitelisted = false;
                emit WhitelistRejected(participantAddress, participantStats.pendingETH, uint32(participantStats.contributions));

                // Cancel participants pending contributions.
                cancelPendingContributions(participantAddress, 0);
            }
        }
    }

    /**
     * @notice Allows the project to withdraw tokens.
     * @param _tokenAmount The token amount.
     */
    // TODO add stageCount increase if higher stageId is supplied?
    function projectTokenWithdraw(uint256 _tokenAmount)
    external
    onlyProjectAddress
    isInitialized
    {
        // decrease the supply
        tokenSupply = tokenSupply.sub(_tokenAmount);
        initialTokenSupply = initialTokenSupply.sub(_tokenAmount);

        // sent all tokens from the contract to the _to address
        // solium-disable-next-line security/no-send
        IERC777(tokenAddress).send(projectAddress, _tokenAmount, "");
    }

    /**
     * @notice Allows for the project to withdraw ETH.
     * @param _ethAmount The ETH amount in wei.
     */
    function projectWithdraw(uint256 _ethAmount)
    external
    onlyProjectAddress
    isInitialized
    isNotFrozen
    {
        // UPDATE the locked/unlocked ratio for the project
        calcProjectAllocation();

        // Get current allocated ETH to the project
        uint256 availableForWithdraw = _projectUnlockedETH.sub(projectWithdrawnETH);

        require(_ethAmount <= availableForWithdraw, "Requested amount too high, not enough ETH unlocked.");

        // UPDATE global STATS
        projectWithdrawCount++;
        projectWithdrawnETH = projectWithdrawnETH.add(_ethAmount);

        // Event emission
        emit ProjectWithdraw(
            projectAddress,
            _ethAmount,
            uint32(projectWithdrawCount)
        );
        emit TransferEvent(
            uint8(TransferTypes.PROJECT_WITHDRAWN),
            projectAddress,
            _ethAmount
        );

        // Transfer ETH to project wallet
        address(uint160(projectAddress)).transfer(_ethAmount);
    }

    // TODO enable receiving of tokens from other rICO
    // TODO enable receiving of funds from other rICO


    function changeStage(uint8 _stageId, uint256 _tokenLimit, uint256 _tokenPrice)
    external
    onlyProjectAddress
    isInitialized
    {
        stages[_stageId].tokenLimit = _tokenLimit;
        stages[_stageId].tokenPrice = _tokenPrice;

        emit StageChanged(_stageId, _tokenLimit, _tokenPrice, getCurrentEffectiveBlockNumber());
    }


    function changeWhitelistingAddress(address _newAddress)
    external
    onlyProjectAddress
    isInitialized
    {
        whitelistingAddress = _newAddress;
        emit WhitelistingAddressChanged(whitelistingAddress, getCurrentStage(), getCurrentEffectiveBlockNumber());
    }


    function changeFreezerAddress(address _newAddress)
    external
    onlyProjectAddress
    isInitialized
    {
        freezerAddress = _newAddress;
        emit FreezerAddressChanged(freezerAddress, getCurrentStage(), getCurrentEffectiveBlockNumber());
    }


    /*
    * Security functions.
    * If the rICO runs fine the freezer address can be set to 0x0, for the beginning its good to have a safe guard.
    */

    /**
     * @notice Freezes the rICO in case of emergency.
     *
     * Function signature: 0x62a5af3b
     */
    function freeze()
    external
    onlyFreezerAddress
    isNotFrozen
    {
        frozen = true;
        freezeStart = getCurrentEffectiveBlockNumber();

        // Emit event
        emit SecurityFreeze(freezerAddress, getCurrentStage(), freezeStart);
    }

    /**
     * @notice Un-freezes the rICO.
     *
     * Function signature: 0x6a28f000
     */
    function unfreeze()
    external
    onlyFreezerAddress
    isFrozen
    {
        uint256 currentBlock = getCurrentEffectiveBlockNumber();

        frozen = false;
        frozenPeriod = frozenPeriod.add(
            currentBlock.sub(freezeStart)
        );

        // Emit event
        emit SecurityUnfreeze(freezerAddress, getCurrentStage(), currentBlock);
    }

    /**
     * @notice Sets the freeze address to 0x0
     *
     * Function signature: 0xeb10dec7
     */
    function disableEscapeHatch()
    external
    onlyFreezerAddress
    isNotFrozen
    {
        freezerAddress = address(0);
        rescuerAddress = address(0);

        // Emit event
        emit SecurityDisableEscapeHatch(freezerAddress, getCurrentStage(), getCurrentEffectiveBlockNumber());
    }

    /**
     * @notice Moves the funds to a safe place, in case of emergency. Only possible, when the the rICO is frozen.
     */
    function escapeHatch(address _to)
    external
    onlyRescuerAddress
    isFrozen
    {
        require(getCurrentEffectiveBlockNumber() == freezeStart.add(18000), 'Let it cool.. Wait at least ~3 days (18000 blk) before moving anything.');

        uint256 tokenBalance = IERC777(tokenAddress).balanceOf(address(this));
        uint256 ethBalance = address(this).balance;

        // sent all tokens from the contract to the _to address
        // solium-disable-next-line security/no-send
        IERC777(tokenAddress).send(_to, tokenBalance, "");

        // sent all ETH from the contract to the _to address
        address(uint160(_to)).transfer(ethBalance);

        // Emit events
        emit SecurityEscapeHatch(rescuerAddress, _to, getCurrentStage(), getCurrentEffectiveBlockNumber());

        emit TransferEvent(uint8(TransferTypes.FROZEN_ESCAPEHATCH_TOKEN), _to, tokenBalance);
        emit TransferEvent(uint8(TransferTypes.FROZEN_ESCAPEHATCH_ETH), _to, ethBalance);
    }


    /*
     * Public view functions
     * ------------------------------------------------------------------------------------------------
     */

    /**
     * @notice Returns project's total unlocked ETH.
     * @return uint256 The amount of ETH unlocked over the whole rICO.
     */
    function getUnlockedProjectETH() public view returns (uint256) {

        // calc from the last known point on
        uint256 newlyUnlockedEth = calcUnlockedAmount(_projectCurrentlyReservedETH, _projectLastBlock);

        return _projectUnlockedETH
        .add(newlyUnlockedEth);
    }

    /**
     * @notice Returns project's current available unlocked ETH reduced by what was already withdrawn.
     * @return uint256 The amount of ETH available to the project for withdraw.
     */
    function getAvailableProjectETH() public view returns (uint256) {
        return getUnlockedProjectETH()
            .sub(projectWithdrawnETH);
    }

    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function getParticipantReservedTokens(address _participantAddress) public view returns (uint256) {
        Participant storage participantStats = participants[_participantAddress];

        if(participantStats._currentReservedTokens == 0) {
            return 0;
        }

        return participantStats._currentReservedTokens.sub(
            calcUnlockedAmount(participantStats._currentReservedTokens, participantStats._lastBlock)
        );
    }

    /**
     * @notice Returns the participant's amount of unlocked tokens at the current block.
     * This function is used for internal sanity checks.
     * Note: this value can differ from the actual unlocked token balance of the participant, if he received tokens from other sources than the rICO.
     * @param _participantAddress The participant's address.
     */
    function getParticipantUnlockedTokens(address _participantAddress) public view returns (uint256) {
        Participant storage participantStats = participants[_participantAddress];

        return participantStats._unlockedTokens.add(
            calcUnlockedAmount(participantStats._currentReservedTokens, participantStats._lastBlock)
        );
    }

    /**
    * @notice Returns the token amount that are still available at the current stage
    * @return The amount of tokens
    */
    function getAvailableTokenAtCurrentStage() public view returns (uint256) {
        return stages[getCurrentStage()].tokenLimit.sub(
            initialTokenSupply.sub(tokenSupply)
        );
    }


    /**
     * @notice Returns the current stage at current sold token amount
     * @return The current stage ID
     */
    function getCurrentStage() public view returns (uint8) {
        return getStageForTokenLimit(initialTokenSupply.sub(tokenSupply));
    }

    /**
     * @notice Returns the current token price at the current stage.
     * @return The current ETH price in wei.
     */
    function getCurrentPrice() public view returns (uint256) {
        return getPriceAtStage(getCurrentStage());
    }


    /**
     * @notice Returns the token price at the specified stage ID.
     * @param _stageId the stage ID at which we want to retrieve the token price.
     */
    function getPriceAtStage(uint8 _stageId) public view returns (uint256) {
        if (_stageId <= stageCount) {
            return stages[_stageId].tokenPrice;
        }
        return 0;
    }


    /**
     * @notice Returns the token price for when a specific amount of tokens is sold
     * @param _tokenLimit  The amount of tokens for which we want to know the respective token price
     * @return The ETH price in wei
     */
    function getPriceForTokenLimit(uint256 _tokenLimit) public view returns (uint256) {
        return getPriceAtStage(getStageForTokenLimit(_tokenLimit));
    }

    /**
    * @notice Returns the stage when a certain amount of tokens is reserved
    * @param _tokenLimit The amount of tokens for which we want to know the stage ID
    */
    function getStageForTokenLimit(uint256 _tokenLimit) public view returns (uint8) {

        // Go through all stages, until we find the one that matches the supply
        for (uint8 stageId = 0; stageId <= stageCount; stageId++) {
            Stage storage byStage = stages[stageId];

            if(_tokenLimit <= byStage.tokenLimit) {
                return uint8(stageId);
                break;
            }
        }
        // if amount is more than available stages return last stage with the highest price
        return uint8(stageCount);
    }

    /**
     * @notice Returns the rICOs available ETH to reserve tokens at a given stage.
     * @param _stageId the stage ID.
     */
    function committableEthAtStage(uint8 _stageId) public view returns (uint256) {
        uint8 currentStage = getCurrentStage();
        uint256 supply;

        // past stages
        if(_stageId < currentStage) {
            return 0;

        // last stage
        } else if(_stageId == stageCount) {
            supply = tokenSupply;

        // current stage
        } else if(_stageId == currentStage) {
            supply = stages[currentStage].tokenLimit.sub(
                initialTokenSupply.sub(tokenSupply)
            );

        // later stages
        } else if(_stageId > currentStage) {
            supply = stages[_stageId].tokenLimit.sub(stages[_stageId - 1].tokenLimit); // calc difference to last stage
        }

        return getEthAmountForTokensAtStage(
            supply
        , _stageId);
    }

    /**
     * @notice Returns the amount of tokens that given ETH would buy at a given stage.
     * @param _ethAmount The ETH amount in wei.
     * @param _stageId the stage ID.
     * @return The token amount in its smallest unit (token "wei")
     */
    function getTokenAmountForEthAtStage(uint256 _ethAmount, uint8 _stageId) public view returns (uint256) {
        return _ethAmount
        .mul(10 ** 18)
        .div(stages[_stageId].tokenPrice);
    }

    /**
     * @notice Returns the amount of ETH (in wei) for a given token amount at a given stage.
     * @param _tokenAmount The amount of token.
     * @param _stageId the stage ID.
     * @return The ETH amount in wei
     */
    function getEthAmountForTokensAtStage(uint256 _tokenAmount, uint8 _stageId) public view returns (uint256) {
        return _tokenAmount
        .mul(stages[_stageId].tokenPrice)
        .div(10 ** 18);
    }

    /**
     * @notice Returns the current block number: required in order to override when running tests.
     */
    function getCurrentBlockNumber() public view returns (uint256) {
        return uint256(block.number);
    }

    /**
     * @notice Returns the current block number - the frozen period: required in order to override when running tests.
     */
    function getCurrentEffectiveBlockNumber() public view returns (uint256) {
        return uint256(block.number)
        .sub(frozenPeriod); // make sure we deduct any frozenPeriod from calculations
    }

    /**
     * @notice rICO HEART: Calculates the unlocked amount tokens/ETH beginning from the buy phase start or last block to the current block.
     * This function is used by the participants as well as the project, to calculate the current unlocked amount.
     *
     * @return the unlocked amount of tokens or ETH.
     */
    function calcUnlockedAmount(uint256 _amount, uint256 _lastBlock) public view returns (uint256) {

        uint256 currentBlock = getCurrentEffectiveBlockNumber();

        if(_amount == 0) {
            return 0;
        }

        // Calculate WITHIN the buy phase
        if (currentBlock >= buyPhaseStartBlock && currentBlock < buyPhaseEndBlock) {

            // security/no-assign-params: "calcUnlockedAmount": Avoid assigning to function parameters.
            uint256 lastBlock = _lastBlock;
            if(lastBlock < buyPhaseStartBlock) {
                lastBlock = buyPhaseStartBlock.sub(1); // We need to reduce it by 1, as the startBlock is always already IN the period.
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
        } else if (currentBlock >= buyPhaseEndBlock) {
            return _amount;
        }
        // Return nothing BEFORE the buy phase
        return 0;
    }

    /*
     * Internal functions
     * ------------------------------------------------------------------------------------------------
     */


    /**
    * @notice Checks the projects core variables and ETH amounts in the contract for correctness.
    */
    function sanityCheckProject() internal view {
        // PROJECT: The sum of reserved + unlocked has to be equal the committedETH.
        require(
            committedETH == _projectCurrentlyReservedETH.add(_projectUnlockedETH),
            'Project Sanity check failed! Reserved + Unlock must equal committedETH'
        );

        // PROJECT: The ETH in the rICO has to be the total of unlocked + reserved - withdraw
        require(
            address(this).balance == _projectUnlockedETH.add(_projectCurrentlyReservedETH).add(pendingETH).sub(projectWithdrawnETH),
            'Project sanity check failed! balance = Unlock + Reserved - Withdrawn'
        );
    }

    /**
    * @notice Checks the projects core variables and ETH amounts in the contract for correctness.
    */
    function sanityCheckParticipant(address _participantAddress) internal view {
        Participant storage participantStats = participants[_participantAddress];

        // PARTICIPANT: The sum of reserved + unlocked has to be equal the totalReserved.
        require(
            participantStats.reservedTokens == participantStats._currentReservedTokens.add(participantStats._unlockedTokens),
            'Participant Sanity check failed! Reser. + Unlock must equal totalReser'
        );
    }

    /**
     * @notice Calculates the projects allocation since the last calculation.
     */
    function calcProjectAllocation() internal {

        uint256 newlyUnlockedEth = calcUnlockedAmount(_projectCurrentlyReservedETH, _projectLastBlock);

        // UPDATE GLOBAL STATS
        _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.sub(newlyUnlockedEth);
        _projectUnlockedETH = _projectUnlockedETH.add(newlyUnlockedEth);
        _projectLastBlock = getCurrentEffectiveBlockNumber();

        sanityCheckProject();
    }

    /**
     * @notice Calculates the participants allocation since the last calculation.
     */
    function calcParticipantAllocation(address _participantAddress) internal {
        Participant storage participantStats = participants[_participantAddress];

        // UPDATE the locked/unlocked ratio for this participant
        participantStats._unlockedTokens = getParticipantUnlockedTokens(_participantAddress);
        participantStats._currentReservedTokens = getParticipantReservedTokens(_participantAddress);

        // RESET BLOCK NUMBER: Force the unlock calculations to start from this point in time.
        participantStats._lastBlock = getCurrentEffectiveBlockNumber();

        // UPDATE the locked/unlocked ratio for the project as well
        calcProjectAllocation();
    }

    /**
     * @notice Cancels any participant's pending ETH contributions.
     * Pending is any ETH from participants that are not whitelisted yet.
     */
    function cancelPendingContributions(address _participantAddress, uint256 _sentValue)
    internal
    isInitialized
    isNotFrozen
    {
        Participant storage participantStats = participants[_participantAddress];
        uint256 participantPendingEth = participantStats.pendingETH;

        // Fail silently if no ETH are pending
        if(participantPendingEth == 0) {
            // sent at least back what he contributed
            if(_sentValue > 0) {
                address(uint160(_participantAddress)).transfer(_sentValue);
            }
            return;
        }

        // UPDATE PARTICIPANT STAGES
        for (uint8 stageId = 0; stageId <= stageCount; stageId++) {
            ParticipantStageDetails storage byStage = participantStats.stages[stageId];
            byStage.pendingETH = 0;
        }

        // UPDATE PARTICIPANT STATS
        participantStats.pendingETH = 0;

        // UPDATE GLOBAL STATS
        canceledETH = canceledETH.add(participantPendingEth);
        pendingETH = pendingETH.sub(participantPendingEth);

        // Emit events
        emit PendingContributionsCanceled(_participantAddress, participantPendingEth, uint32(participantStats.contributions));
        emit TransferEvent(
            uint8(TransferTypes.CONTRIBUTION_CANCELED),
            _participantAddress,
            participantPendingEth
        );


        // transfer ETH back to participant including received value
        address(uint160(_participantAddress)).transfer(participantPendingEth.add(_sentValue));

        // SANITY check
        sanityCheckParticipant(_participantAddress);
        sanityCheckProject();
    }


    /**
    * @notice Accept a participant's contribution.
    * @param _participantAddress Participant's address.
    */
    function acceptContributions(address _participantAddress)
    internal
    isInitialized
    isNotFrozen
    isRunning
    {
        Participant storage participantStats = participants[_participantAddress];

        // Fail silently if no ETH are pending
        if (participantStats.pendingETH == 0) {
            return;
        }

        uint8 currentStage = getCurrentStage();
        uint256 totalRefundedETH;
        uint256 totalNewReservedTokens;

        calcParticipantAllocation(_participantAddress);

        // set the first contribution block
        if(participantStats.committedETH == 0) {
            participantStats.firstContributionBlock = participantStats._lastBlock; // `_lastBlock` was set in calcParticipantAllocation()
        }

        // Iterate over all stages and their pending contributions
        for (uint8 stageId = 0; stageId <= stageCount; stageId++) {
            ParticipantStageDetails storage byStage = participantStats.stages[stageId];

            // skip if not ETH is pending
            if (byStage.pendingETH == 0) {
                continue;

            }

            // skip if stage is below "currentStage" (as they have no available tokens)
            if(stageId < currentStage) {
                // add this stage pendingETH to the "currentStage"
                participantStats.stages[currentStage].pendingETH = participantStats.stages[currentStage].pendingETH.add(byStage.pendingETH);
                // and reset this stage
                byStage.pendingETH = 0;
                continue;
            }

            // Continue only if in "currentStage" and later stages
            uint256 maxCommittableEth = committableEthAtStage(stageId);
            uint256 newlyCommittedEth = byStage.pendingETH;
            uint256 returnEth = 0;
            uint256 overflowEth = 0;

            // If incoming value is higher than what we can accept,
            // just accept the difference and return the rest
            if (newlyCommittedEth > maxCommittableEth) {
                overflowEth = newlyCommittedEth.sub(maxCommittableEth);
                newlyCommittedEth = maxCommittableEth;

                // if in the last stage, return ETH
                if (stageId == stageCount) {
                    returnEth = overflowEth;
                    totalRefundedETH = totalRefundedETH.add(returnEth);

                // if below the last stage, move pending ETH to the next stage
                } else {
                    participantStats.stages[stageId + 1].pendingETH = participantStats.stages[stageId + 1].pendingETH.add(overflowEth);
                    byStage.pendingETH = byStage.pendingETH.sub(overflowEth);
                }
            }

            // convert ETH to TOKENS
            uint256 newTokenAmount = getTokenAmountForEthAtStage(
                newlyCommittedEth, stageId
            );

            totalNewReservedTokens = totalNewReservedTokens.add(newTokenAmount);

            // UPDATE PARTICIPANT STATS
            participantStats._currentReservedTokens = participantStats._currentReservedTokens.add(newTokenAmount);
            participantStats.reservedTokens = participantStats.reservedTokens.add(newTokenAmount);
            participantStats.committedETH = participantStats.committedETH.add(newlyCommittedEth);
            participantStats.pendingETH = participantStats.pendingETH.sub(newlyCommittedEth).sub(returnEth);

            byStage.pendingETH = byStage.pendingETH.sub(newlyCommittedEth).sub(returnEth);

            // UPDATE GLOBAL STATS
            tokenSupply = tokenSupply.sub(newTokenAmount);
            pendingETH = pendingETH.sub(newlyCommittedEth).sub(returnEth);
            committedETH = committedETH.add(newlyCommittedEth);
            _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.add(newlyCommittedEth);

            // Emit event
            emit ContributionsAccepted(_participantAddress, newlyCommittedEth, newTokenAmount, stageId);
        }

        // Refund what couldn't be accepted
        if (totalRefundedETH > 0) {
            emit TransferEvent(uint8(TransferTypes.CONTRIBUTION_ACCEPTED_OVERFLOW), _participantAddress, totalRefundedETH);
            address(uint160(_participantAddress)).transfer(totalRefundedETH);
        }

        // Transfer tokens to the participant
        // solium-disable-next-line security/no-send
        IERC777(tokenAddress).send(_participantAddress, totalNewReservedTokens, "");

        // SANITY CHECK
        sanityCheckParticipant(_participantAddress);
        sanityCheckProject();
    }


    /**
     * @notice Allow a participant to withdraw by sending tokens back to rICO contract.
     * @param _participantAddress participant address.
     * @param _returnedTokenAmount The amount of tokens returned.
     */
    function withdraw(address _participantAddress, uint256 _returnedTokenAmount)
    internal
    isInitialized
    isNotFrozen
    isRunning
    {

        Participant storage participantStats = participants[_participantAddress];

        calcParticipantAllocation(_participantAddress);

        require(_returnedTokenAmount > 0, 'You can not withdraw without sending tokens.');
        require(participantStats._currentReservedTokens > 0 && participantStats.reservedTokens > 0, 'You can not withdraw, you have no locked tokens.');

        uint256 returnedTokenAmount = _returnedTokenAmount;
        uint256 overflowingTokenAmount;
        uint256 returnEthAmount;

        // Only allow reserved tokens be returned, return the overflow.
        if (returnedTokenAmount > participantStats._currentReservedTokens) {
            overflowingTokenAmount = returnedTokenAmount.sub(participantStats._currentReservedTokens);
            returnedTokenAmount = participantStats._currentReservedTokens;
        }

        // Calculate the return amount
        returnEthAmount = participantStats.committedETH.mul(
            returnedTokenAmount.mul(10 ** 20)
            .div(participantStats.reservedTokens)
        ).div(10 ** 20);


        // UPDATE PARTICIPANT STATS
        participantStats.withdraws++;
        participantStats._currentReservedTokens = participantStats._currentReservedTokens.sub(returnedTokenAmount);
        participantStats.reservedTokens = participantStats.reservedTokens.sub(returnedTokenAmount);
        participantStats.committedETH = participantStats.committedETH.sub(returnEthAmount);

        // UPDATE global STATS
        tokenSupply = tokenSupply.add(returnedTokenAmount);
        withdrawnETH = withdrawnETH.add(returnEthAmount);
        committedETH = committedETH.sub(returnEthAmount);

        _projectCurrentlyReservedETH = _projectCurrentlyReservedETH.sub(returnEthAmount);


        // Return overflowing tokens received
        if (overflowingTokenAmount > 0) {
            // send tokens back to participant
            bytes memory data;

            // solium-disable-next-line security/no-send
            IERC777(tokenAddress).send(_participantAddress, overflowingTokenAmount, data);

            // Emit event
            emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW_OVERFLOW), _participantAddress, overflowingTokenAmount);
        }

        // Emit events
        emit ParticipantWithdraw(_participantAddress, returnEthAmount, returnedTokenAmount, uint32(participantStats.withdraws));
        emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _participantAddress, returnEthAmount);

        // Return ETH back to participant
        address(uint160(_participantAddress)).transfer(returnEthAmount);

        // SANITY CHECK
        sanityCheckParticipant(_participantAddress);
        sanityCheckProject();
    }

    /*
     *   Modifiers
     */

    /**
     * @notice Checks if the sender is the project.
     */
    modifier onlyProjectAddress() {
        require(msg.sender == projectAddress, "Only the project can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the deployer.
     */
    modifier onlyDeployingAddress() {
        require(msg.sender == deployingAddress, "Only the deployer can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the whitelist controller.
     */
    modifier onlyWhitelistingAddress() {
        require(msg.sender == whitelistingAddress, "Only the whitelist controller can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the freezer controller address.
     */
    modifier onlyFreezerAddress() {
        require(msg.sender == freezerAddress, "Only the freezer address can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the freezer controller address.
     */
    modifier onlyRescuerAddress() {
        require(msg.sender == rescuerAddress, "Only the rescuer address can call this method.");
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
        require(initialized == false, "Contract can not be initialized.");
        _;
    }

    /**
     * @notice @dev Requires the contract to be frozen.
     */
    modifier isFrozen() {
        require(frozen == true, "rICO has to be frozen!");
        _;
    }

    /**
     * @notice @dev Requires the contract not to be frozen.
     */
    modifier isNotFrozen() {
        require(frozen == false, "rICO is frozen!");
        _;
    }

    /**
     * @notice Checks if the rICO is running.
     */
    modifier isRunning() {
        uint256 blockNumber = getCurrentEffectiveBlockNumber();
        require(blockNumber >= commitPhaseStartBlock && blockNumber <= buyPhaseEndBlock, "Current block is outside the rICO period.");
        _;
    }
}