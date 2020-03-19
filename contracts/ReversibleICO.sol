/*
 * source       https://github.com/lukso-network/rICO-smart-contracts
 * @name        rICO
 * @package     rICO-smart-contracts
 * @author      Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
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
    IERC1820Registry private _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");


    /*
     *   Contract States
     */
    /// @dev It is set to TRUE after the deployer initializes the contract.
    bool public initialized; // default: false

    /// @dev The contract can be automatically frozen in case of inconsistencies.
    bool public frozen; // default: false


    /*
     *   Addresses
     */
    /// @dev Only the deployer is allowed to initialize the contract.
    address public deployerAddress;
    /// @dev The actual rICO token contract address.
    address public tokenContractAddress;
    /// @dev The address of wallet of the project running the rICO.
    address public projectWalletAddress;
    /// @dev Only the whitelist controller can whitelist addresses.
    address public whitelistControllerAddress;


    /*
     *   Public Variables
     */
    /// @dev Total amount tokens minted.
    uint256 public tokenSupply; // default: 0
    /// @dev Total amount of ETH received by the smart contract.
    uint256 public totalReceivedETH; // default: 0
    /// @dev Total amount of ETH returned.
    uint256 public returnedETH; // default: 0
    /// @dev Total amount of ETH accepted as a commitment to buy tokens (not including pending).
    uint256 public committedETH; // default: 0
    /// @dev Total amount of ETH withdrawn.
    uint256 public withdrawnETH; // default: 0
    /// @dev Count of the number the project has withdrawn from the funds raised.
    uint256 public projectWithdrawCount; // default: 0
    /// @dev Total amount allocated to the project by participant withdraws.
    uint256 public projectAllocatedETH; // default: 0
    /// @dev Total amount of ETH withdrawn by the project
    uint256 public projectWithdrawnETH; // default: 0

    /// @dev Minimum amount of ETH accepted for a contribution.
    /// @dev Everything lower than that will trigger a canceling of pending ETH.
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

    mapping(uint8 => Stage) public stages;
    uint8 public stageCount;
    uint256 public stageBlockCount;

    /*
     * Participants
     */
    struct Participant {
        bool whitelisted;
        uint32 contributionsCount;
        mapping(uint8 => ParticipantDetails) byStage;
    }

    struct ParticipantDetails {
        uint256 totalReceivedETH;       // Total amount of ETH received by the smart contract.
        uint256 returnedETH;            // totalReceivedETH - committedETH
        uint256 committedETH;           // lower than msg.value if maxCap already reached
        uint256 withdrawnETH;           // withdrawn from current stage
        uint256 allocatedETH;           // allocated to project when contributing or exiting
        uint256 reservedTokens;         // tokens bought in this stage
        uint256 boughtTokens;           // tokens already sent to the participant in this stage
        uint256 returnedTokens;         // tokens returned by participant to contract
        uint256 allocatedTokens;        // tokens allocated as unlocked at withdraw()
        uint256 activeTokens;
    }

    /// @dev Maps participants aggregated (i.e. all stages) stats by their address.
    mapping(address => ParticipantDetails) public participantAggregatedStats;
    /// @dev Maps participants stage stats by their address.
    mapping(address => Participant) public participantsByAddress;
    /// @dev Maps participants address to a unique participant ID (incremental IDs, based on "participantCount").
    mapping(uint256 => address) public participantsById;
    /// @dev Total number of rICO participants.
    uint256 public participantCount;


    /*
     * Events
     */
    enum ApplicationEventTypes {
        NOT_SET, // 0; will match default value of a mapping result
        CONTRIBUTION_NEW, // 1
        CONTRIBUTION_CANCEL, // 2
        PARTICIPANT_CANCEL, // 3
        COMMITMENT_ACCEPTED, // 4
        WHITELIST_APPROVE, // 5
        WHITELIST_REJECT, // 6
        PROJECT_WITHDRAW // 7
    }

    event ApplicationEvent (
        uint8 indexed _type,
        uint32 indexed _id,
        address indexed _address,
        uint256 _value
    );

    enum TransferTypes {
        NOT_SET, // 0
        AUTOMATIC_RETURN, // 1
        WHITELIST_REJECT, // 2
        PARTICIPANT_CANCEL, // 3
        PARTICIPANT_WITHDRAW, // 4
        PROJECT_WITHDRAW // 5
    }

    event TransferEvent (
        uint8 indexed _type,
        address indexed _address,
        uint256 indexed _value
    );


    // ------------------------------------------------------------------------------------------------

    /// @notice Constructor sets the deployer and defines ERC777TokensRecipient interface support.
    constructor() public {
        deployerAddress = msg.sender;
        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }

    /**
     * @notice Initializes the contract. Only the deployer (set in the constructor) can call this method.
     * @param _tokenContractAddress The address of the ERC777 rICO token contract.
     * @param _whitelistControllerAddress The address of the controller handling whitelisting.
     * @param _projectWalletAddress The project wallet that can withdraw the contributions.
     * @param _commitPhaseStartBlock The block in which the commit phase starts.
     * @param _commitPhaseBlockCount The duration of the commit phase in blocks.
     * @param _commitPhasePrice The initial token price (in wei) during the commit phase.
     * @param _stageCount The number of the rICO stages.
     * @param _stageBlockCount The duration of each stage in blocks.
     * @param _stagePriceIncrease A factor used to increase the token price at each subsequent stage.
     */
    function init(
        address _tokenContractAddress,
        address _whitelistControllerAddress,
        address _projectWalletAddress,
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
        tokenContractAddress = _tokenContractAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        projectWalletAddress = _projectWalletAddress;

        // Assign other variables
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
            // At each stage the token price increases by _stagePriceIncrease * stageCount
            stageN.tokenPrice = _commitPhasePrice.add(_stagePriceIncrease.mul(i));
            // Store the current stage endBlock in order to update the next one
            previousStageEndBlock = stageN.endBlock;
        }

        // The buy phase starts on the subsequent block of the commitPhase's (stage0) endBlock
        buyPhaseStartBlock = commitPhaseEndBlock.add(1);
        // The buy phase ends when the lat stage ends
        buyPhaseEndBlock = previousStageEndBlock;
        // The duration of buyPhase in blocks
        buyPhaseBlockCount = previousStageEndBlock.sub(buyPhaseStartBlock).add(1);
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
    {
        // Accept contributions higher than the minimum amount
        if (msg.value >= minContribution) {
            commit(msg.sender, msg.value);
        } else {
            // Participant cancels commitment during commit phase (Stage 0) OR if they've not been whitelisted yet.
            // This also allows for extended wallet compatibility by sending a non-zereo amount
            cancel(msg.sender, msg.value);
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
        // isNotFrozen TODO??
        // requireNotEnded
    {
        // rICO should only receive tokens from the rICO Token Tracker.
        // Transactions from any other sender should revert
        require(msg.sender == tokenContractAddress, "Invalid token sent.");

        // 2 cases
        if (_from == projectWalletAddress) {
            // 1 - project wallet adds tokens to the sale
            // Save the token amount allocated to this address
            tokenSupply += _amount;
            return;
        } else {

            // 2 - rICO contributor sends tokens back
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

        // Add to received value to totalReceivedETH
        totalReceivedETH = totalReceivedETH.add(_value);

        // Participant initial state record
        Participant storage participantRecord = participantsByAddress[_sender];

        // Check if participant already exists
        if (participantRecord.contributionsCount == 0) {
            // Identify the participants by their Id
            participantsById[participantCount] = _sender;
            // Increase participant count
            participantCount++;
        }

        // Record contribution into current stage totals for the participant
        recordNewContribution(_sender, _value);

        // If whitelisted, process the contribution automatically
        if (participantRecord.whitelisted == true) {
            acceptContributionsForAddress(_sender, uint8(ApplicationEventTypes.COMMITMENT_ACCEPTED));
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
     * @notice Cancels non-whitelisted participant's pending ETH commitment.
     */
    function cancel(address _sender, uint256 _value)
    internal
    isInitialized
    isNotFrozen
    isRunning
    {
        // Participant must have pending ETH ...
        require(hasPendingETH(_sender), "cancel: Participant has no pending contributions.");

        // Cancel participant's contribution.
        cancelContributionsForAddress(_sender, _value, uint8(ApplicationEventTypes.PARTICIPANT_CANCEL));
    }

    /**
     * @notice Returns project's current available ETH and unlocked ETH amount.
     * @return uint256 The unlocked amount available to the project for withdraw.
     */
    function getProjectAvailableEth() public view returns (uint256) {
        // how much eth has been "approved", minus returned, minus allocated directly
        uint256 globalAvailable = committedETH
            .sub(withdrawnETH)
            .sub(projectAllocatedETH);

        // Multiply by percentage
        uint256 unlocked = globalAvailable.mul(
            getCurrentUnlockPercentageFor(
                getCurrentBlockNumber(),
                buyPhaseStartBlock,
                buyPhaseEndBlock
            )
        ).div(10 ** 20);

        // add the allocated directly and subtract already withdrawn by project
        uint256 totalAvailable = unlocked.add(projectAllocatedETH);

        // Due to rounding errors when participants withdraw using tokens
        // projectWithdrawnETH can be 1 wei higher per participant that withdrew
        // than actually available after withdraw allocation.
        if (projectWithdrawnETH >= totalAvailable) {
            return 0;
        }

        return totalAvailable.sub(projectWithdrawnETH);
    }

    /**
     * @notice Allows for the project to withdraw ETH.
     * @param _ethAmount The ETH amount in wei.
     */
    function projectWithdraw(uint256 _ethAmount)
    external
    isInitialized
    {
        require(msg.sender == projectWalletAddress, "Only project wallet address.");

        // Get project unlocked ETH (available for withdrawing)
        uint256 unlocked = getProjectAvailableEth();
        require(_ethAmount <= unlocked, "Requested amount too big, not enough unlocked ETH available.");

        // Update stats: number of project withdrawals, total amount withdrawn by the project
        projectWithdrawCount++;
        projectWithdrawnETH = projectWithdrawnETH.add(_ethAmount);

        // Transfer ETH to project wallet
        address(uint160(projectWalletAddress)).transfer(_ethAmount);

        // Event emission
        emit ApplicationEvent(
            uint8(ApplicationEventTypes.PROJECT_WITHDRAW),
            uint32(projectWithdrawCount),
            projectWalletAddress,
            _ethAmount
        );
        emit TransferEvent(
            uint8(TransferTypes.PROJECT_WITHDRAW),
            projectWalletAddress,
            _ethAmount
        );
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
        require(_addresses.length > 0, "Empty list.");
        for (uint256 i = 0; i < _addresses.length; i++) {

            Participant storage participantRecord = participantsByAddress[_addresses[i]];

            if (_approve) {
                // Check if participant is already in the whitelist (e.g. duplicate list entry)
                if (!participantRecord.whitelisted) {
                    // If participants are approved: whitelist them and accept their contributions
                    participantRecord.whitelisted = true;
                    acceptContributionsForAddress(_addresses[i], uint8(ApplicationEventTypes.WHITELIST_APPROVE));
                }
            } else {
                // Decline participant and cancel their contributions, if they have pending ETH.
                if (hasPendingETH(_addresses[i])) {
                    cancelContributionsForAddress(_addresses[i], 0, uint8(ApplicationEventTypes.WHITELIST_REJECT));
                }
                participantRecord.whitelisted = false;
            }
        }
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
        return participantsByAddress[_address].whitelisted;
    }


    /*
        TODO?
        Do we want to normalise for gas usage ?!
        ( ie. add useless computation just to have the same gas used at all times ? )

        22023 - Case 1: lower than commit phase end
        22797 - Case 2: lower than stage[X].endBlock
        22813 - Case 3: exactly at stage[X].endBlock

        Doing an iteration and validating on each item range can go up to 37391 gas for 13 stages.
    */
    /**
     * @notice Returns the current stage at the current block number.
     */
    function getCurrentStage() public view returns (uint8) {
        return getStageAtBlock(getCurrentBlockNumber());
    }

    /**
     * @notice Returns the current token price at the current block number.
     */
    function getCurrentPrice() public view returns (uint256) {
        return getPriceAtBlock(getCurrentBlockNumber());
    }

    /**
     * @notice Returns the token price at the specified block height.
     * @param _blockNumber the block height at which we want to retrieve the token price.
     */
    function getPriceAtBlock(uint256 _blockNumber) public view returns (uint256) {
        // first retrieve the stage that the block belongs to
        uint8 stage = getStageAtBlock(_blockNumber);
        if (stage <= stageCount) {
            return stages[stage].tokenPrice;
        }
        // revert with stage not found?
        return 0;
    }

    /**
     * @notice Returns the amount of tokens that ETH would buy at a specific stage.
     * @param _ethValue The ETH amount in wei.
     * @param _stageId The stage we are interested in.
     */
    function getTokenAmountForEthAtStage(uint256 _ethValue, uint8 _stageId) public view returns (uint256) {
        // Since our tokens cost less than 1 eth, and decimals are 18
        // 1 wei will always buy something.

        // add token decimals to value before division, that way we increase precision.
        // return (_ethValue * (10 ** 18)) / Stages[_stageId].token_price;
        return _ethValue.mul(
            (10 ** 18)
        ).div(stages[_stageId].tokenPrice);
    }

    /**
     * @notice Returns the amount of ETH (in wei) that tokens are worth at a specified stage.
     * @param _tokenAmount The amount of token.
     * @param _stageId The stage we are interested in.
     */
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

    /**
     * @notice Returns participant's stats by stage.
     * @param _address The participant's address.
     * @param _stageId The relevant stage.

     * @dev Direct call: participantsByAddress[_address].byStage[_stageId]._accepted
     */
    function getParticipantDetailsByStage(address _address, uint8 _stageId)
    public
    view
    returns (
        uint256 stageTotalReceivedETH,
        uint256 stageReturnedETH,
        uint256 stageCommittedETH,
        uint256 stageWithdrawnETH,
        uint256 stageAllocatedETH,
        uint256 stageReservedTokens,
        uint256 stageBoughtTokens,
        uint256 stageReturnedTokens,
        uint256 stageAllocatedTokens,
        uint256 stageActiveTokens
    ) {

        ParticipantDetails storage totalsRecord = participantsByAddress[_address].byStage[_stageId];
        return (
            totalsRecord.totalReceivedETH,
            totalsRecord.returnedETH,
            totalsRecord.committedETH,
            totalsRecord.withdrawnETH,
            totalsRecord.allocatedETH,
            totalsRecord.reservedTokens,
            totalsRecord.boughtTokens,
            totalsRecord.returnedTokens,
            totalsRecord.allocatedTokens,
            totalsRecord.activeTokens
        );
    }

    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function getLockedTokenAmount(address _participantAddress, bool includeReserved) public view returns (uint256) {

        return getLockedTokenAmountAtBlock(
            participantAggregatedStats[_participantAddress].activeTokens,
            getCurrentBlockNumber()
        );

        // ParticipantDetails storage aggregatedStats = participantAggregatedStats[_participantAddress];
        // uint256 availableTokens = aggregatedStats.activeTokens;

        // uint256 unlocked = availableTokens.mul(
        //     getCurrentUnlockPercentageFor(
        //         getCurrentBlockNumber(),
        //         buyPhaseStartBlock,
        //         buyPhaseEndBlock
        //     )
        // ).div(10 ** 20);

        // // uint256 totalAvailable = unlocked.add(aggregatedStats.allocatedTokens);
        // // return availableTokens.sub(totalAvailable);

        // return availableTokens.sub(unlocked); // .add(aggregatedStats.allocatedTokens);
    }


    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function getLockedTokenAmountOK(address _participantAddress, bool includeReserved) public view returns (uint256) {

        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_participantAddress];

        uint256 availableTokens = aggregatedStats.boughtTokens
            .sub(aggregatedStats.returnedTokens)
            .sub(aggregatedStats.allocatedTokens);

        if(availableTokens == 0) {
            return 0;
        }

        // Multiply by percentage
        // uint256 unlocked = availableTokens.mul(
        //     getCurrentUnlockPercentageFor(
        //         getCurrentBlockNumber(),
        //         buyPhaseStartBlock,
        //         buyPhaseEndBlock
        //     )
        // ).div(10 ** 20);

        uint256 locked = getLockedTokenAmountAtBlock(
            availableTokens,
            getCurrentBlockNumber()
        );

        // aggregatedStats.allocatedTokens;
        // uint256 locked = getLockedTokenAmountAtBlock(
        //     aggregatedStats.boughtTokens.sub(aggregatedStats.returnedTokens),
        //     getCurrentBlockNumber()
        // );

        if(includeReserved) {
            // When want to display token amounts even when they are not already
            // transferred to their accounts, we add reserved to the totals
            locked = locked.add(aggregatedStats.reservedTokens);
        }

        return locked;
    }

    /**
     * @notice Returns the participant's amount of locked tokens at the current block.
     * @param _participantAddress The participant's address.
     */
    function getLockedTokenAmountOld(address _participantAddress, bool includeReserved) public view returns (uint256) {

        // active = boughtTokens - returnedTokens
        // locked = active - ( active * unlock ratio )
        // unlocked = active - locked
        // and we're missing the "allocated on withdraw"

        // Since the number of unlocked tokens should never
        // go down, we always calculate locked tokens from
        // the total the participant has ever bought ( boughtTokens )
        // and then subtract the amount they returned

        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_participantAddress];

        uint256 locked = getLockedTokenAmountAtBlock(
            aggregatedStats.boughtTokens,
            getCurrentBlockNumber()
        );

        if(includeReserved) {
            // When want to display token amounts even when they are not already
            // transferred to their accounts, we add reserved to the totals
            locked = locked.add(aggregatedStats.reservedTokens);
        }

        return locked.sub(aggregatedStats.returnedTokens);
    }

    /**
     * @notice Returns the cancel modes for a participant.
     * @param _participantAddress The participant's address.
     * @return byEth Boolean
     * @return byTokens Boolean
     */
    function getCancelModes(address _participantAddress) external view returns (bool byEth, bool byTokens) {

        //Participant storage participantRecord = participantsByAddress[_participantAddress];

        //if (participantRecord.whitelisted == true) {
            // byEth remains false as they need to send tokens back.
            byTokens = canWithdraw(_participantAddress);
        //} else {
            // byTokens remains false as the participant should have no tokens to send back anyway.
            byEth = hasPendingETH(_participantAddress);
        //}
    }

    /**
     * @notice Returns TRUE if the participant has locked tokens in the current stage.
     * @param _participantAddress The participant's address.
     */
    function canWithdraw(address _participantAddress) public view returns (bool) {
        if (getLockedTokenAmount(_participantAddress, false) > 0) {
            return true;
        }
        return false;
    }

    /**
     * @notice Returns TRUE if participant has pending ETH and is not whitelisted.
     * @param _participantAddress The participant's address.
     */
    function hasPendingETH(address _participantAddress) public view returns (bool) {
        if (getParticipantPendingETH(_participantAddress) > 0) {
            return true;
        }
        return false;
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
        return IERC777(tokenContractAddress).balanceOf(address(this)).mul(
            stages[_stage].tokenPrice
        ).div(10 ** 18);
    }


    /**
     * @notice Returns the amount of locked tokens at a certain block.
     * @param _tokenAmount The amount on tokens.
     * @param _blockNumber The specified block number.
     */
    function getLockedTokenAmountAtBlock(uint256 _tokenAmount, uint256 _blockNumber) public view returns (uint256) {

        if (_tokenAmount > 0) {

            // if before "development / buy  phase" ( in stage 0 )
            //   - return all tokens bought through contributions.
            // if in development phase ( in stage 1 to n )
            //   - calculate and return
            // else if after end_block
            //   - return 0
            if (_blockNumber < buyPhaseStartBlock) {

                // commit phase
                return _tokenAmount;

            } else if (_blockNumber <= buyPhaseEndBlock) {

                // buy  phase
                uint256 unlocked = _tokenAmount.mul(
                    getCurrentUnlockPercentage()
                ).div(10 ** 20);

                return _tokenAmount.sub(unlocked);
            }
            // after buyPhase's end
            return 0;
        }
        return 0;
    }

    /**
     * @notice Calculates the percentage of bought tokens (or ETH allocated to the project) beginning from the buy phase start to the current block.
     * @return Unlock percentage multiplied by 10 to the power of precision. (should be 20 resulting in 10 ** 20, so we can divide by 100 later and get 18 decimals).
     */
    function getCurrentUnlockPercentageFor(
        uint256 _currentBlock,
        uint256 _startBlock,
        uint256 _endBlock
    ) public pure returns (uint256) {
        uint8 precision = 20;
        if (_currentBlock >= _startBlock && _currentBlock <= _endBlock) {
            // number of blocks ( ie: start=5/end=10 => 10 - 5 + 1 => 6 )
            uint256 totalBlockCount = _endBlock.sub(_startBlock).add(1);

            // get the number of blocks that have "elapsed" since the start block
            // add 1 since start block needs to return higher than 0
            uint256 passedBlocks = _currentBlock.sub(_startBlock).add(1);

            return passedBlocks.mul(
                10 ** uint256(precision)
            ).div(totalBlockCount);
        } else if (_currentBlock > _endBlock) {
            return 10 ** uint256(precision);
        } else {
            return 0;
        }
    }

    function getCurrentUnlockPercentage() public view returns (uint256) {
        return getCurrentUnlockPercentageFor(
            getCurrentBlockNumber(),
            buyPhaseStartBlock,
            buyPhaseEndBlock
        );
    }

    // ------------------------------------------------------------------------------------------------

    /*
     * Internal functions
     */

    /**
     * @notice Allow a participant to withdraw by sending tokens back to rICO contract.
     * @param _from Sender's (participant's) address.
     * @param _returnedTokenAmount The amount of tokens returned.
     */
    function withdraw(address _from, uint256 _returnedTokenAmount) internal {

        // Contributor sends tokens back to the rICO contract.
        // - unlike cancel() method, this allows variable amounts.
        // - latest contributions get returned first.

        Participant storage participantRecord = participantsByAddress[_from];
        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_from];

        uint256 currentBlockNumber = getCurrentBlockNumber();
        uint256 remainingTokenAmount = _returnedTokenAmount;
        uint256 maxLocked = getLockedTokenAmount(_from, false); // get locked, but exclude reserved
        uint256 overflowingTokenAmount;
        uint256 returnedTokensForStage;
        uint256 returnETHAmount;


        // if returned amount is greater than the locked amount...
        // set it equal to locked, keep track of the overflow tokens (remainingTokenAmount)
        if (remainingTokenAmount > maxLocked) {
            overflowingTokenAmount = remainingTokenAmount.sub(maxLocked);
            remainingTokenAmount = maxLocked;
        }

        require(currentBlockNumber < buyPhaseEndBlock, "Withdraw not possible. Buy phase ended.");
        require(remainingTokenAmount > 0, "Withdraw not possible. Participant has no locked tokens.");

        // decrease the total allocated ETH by the equivalent participant's allocated amount
        projectAllocatedETH = projectAllocatedETH.sub(aggregatedStats.allocatedETH);

        // reset aggregated stats
        aggregatedStats.activeTokens = 0;
        aggregatedStats.allocatedTokens = 0;
        aggregatedStats.allocatedETH = 0;

        for (uint8 stageId = getCurrentStage(); stageId >= 0; stageId--) {

            if(remainingTokenAmount <= 0) {
                break;
            }

            ParticipantDetails storage byStage = participantRecord.byStage[stageId];


//            uint256 lockedTokensForStage = getLockedTokenAmountAtBlock( // works
//                byStage.activeTokens, currentBlockNumber
//            );
            uint256 lockedTokensForStage = byStage.activeTokens;

            uint256 unlockedETHAmount = getEthAmountForTokensAtStage(
                // total amount - locked amount
                // unlockedTokensInStage,
                byStage.boughtTokens.sub(byStage.returnedTokens).sub(lockedTokensForStage),
                stageId
            );

            if( byStage.activeTokens > 0 ) {

                // reset returnedTokensForStage
                if (remainingTokenAmount < lockedTokensForStage) {
                    returnedTokensForStage = remainingTokenAmount;
                } else {
                    returnedTokensForStage = lockedTokensForStage;
                }

                // calculate locked token amount from the partial stage tokens
                returnedTokensForStage = getLockedTokenAmountAtBlock(
                    returnedTokensForStage, currentBlockNumber
                );


//                uint256 allocatedByNow = getLockedTokenAmountAtBlock(
//                    returnedTokensForStage, currentBlockNumber
//                );
//                allocatedByNow = returnedTokensForStage.sub(allocatedByNow);


                // get the equivalent amount of ETH for the locked tokens in stage
                uint256 currentETHAmount = getEthAmountForTokensAtStage(returnedTokensForStage, stageId);


                // UPDATE stats
                byStage.returnedTokens = byStage.returnedTokens.add(returnedTokensForStage);
//                byStage.allocatedTokens = byStage.allocatedTokens.add(allocatedByNow);
                byStage.allocatedTokens = byStage.activeTokens.sub(returnedTokensForStage); // works
                byStage.activeTokens = byStage.activeTokens.sub(returnedTokensForStage);
//                byStage.activeTokens = byStage.activeTokens.sub(returnedTokensForStage).sub(byStage.allocatedTokens); //
                byStage.withdrawnETH = byStage.withdrawnETH.add(currentETHAmount);
                byStage.allocatedETH = unlockedETHAmount;

                aggregatedStats.allocatedTokens = aggregatedStats.allocatedTokens.add(byStage.allocatedTokens);
                aggregatedStats.returnedTokens = aggregatedStats.returnedTokens.add(returnedTokensForStage);
                aggregatedStats.activeTokens = aggregatedStats.activeTokens.add(byStage.activeTokens);
                aggregatedStats.allocatedETH = aggregatedStats.allocatedETH.add(unlockedETHAmount);
                aggregatedStats.withdrawnETH = aggregatedStats.withdrawnETH.add(currentETHAmount);

                returnETHAmount = returnETHAmount.add(currentETHAmount);
                withdrawnETH = withdrawnETH.add(currentETHAmount);
                projectAllocatedETH = projectAllocatedETH.add(unlockedETHAmount);


                // remove processed token amount from requested amount
                remainingTokenAmount = remainingTokenAmount.sub(returnedTokensForStage);
            }

            if(stageId == 0) {
                // Reverse iteration with an unsigned loop variable
                // thus we need to break the loop here
                break;
            }
        }

        // return overflow tokens received
        if (overflowingTokenAmount > 0) {
            // send tokens back to participant
            bytes memory data;
            // solium-disable-next-line security/no-send
            IERC777(tokenContractAddress).send(_from, overflowingTokenAmount, data);
        }

        // transfer ETH back to participant
        address(uint160(_from)).transfer(returnETHAmount);
        emit TransferEvent(uint8(TransferTypes.PARTICIPANT_WITHDRAW), _from, returnETHAmount);
        return;
    }

    /**
     * @notice Records a new contribution.
     * @param _from Participant's address.
     * @param _receivedValue The amount contributed.
     */
    function recordNewContribution(address _from, uint256 _receivedValue) private {
        uint8 currentStage = getCurrentStage();
        Participant storage participantRecord = participantsByAddress[_from];
        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_from];
        // Update participant's total stats
        participantRecord.contributionsCount++;
        aggregatedStats.totalReceivedETH = aggregatedStats.totalReceivedETH.add(_receivedValue);

        // Update participant's per-stage stats
        ParticipantDetails storage byStage = participantRecord.byStage[currentStage];
        byStage.totalReceivedETH = byStage.totalReceivedETH.add(_receivedValue);

        // Get the equivalent amount in tokens
        uint256 newTokenAmount = getTokenAmountForEthAtStage(
            _receivedValue, currentStage
        );

        // Update participant's reserved tokens
        // TODO: what does this mean?: then can change when contribution is accepted if max cap is hit
        byStage.reservedTokens = byStage.reservedTokens.add(newTokenAmount);
        aggregatedStats.reservedTokens = aggregatedStats.reservedTokens.add(newTokenAmount);

        emit ApplicationEvent(
            uint8(ApplicationEventTypes.CONTRIBUTION_NEW),
            uint32(participantRecord.contributionsCount),
            _from,
            _receivedValue
        );
    }

    /**
     * @notice Accept a participant's contribution.
     * @param _from Participant's address.
     * @param _eventType Can be either WHITELIST_APPROVE or COMMITMENT_ACCEPTED.
     */
    function acceptContributionsForAddress(address _from, uint8 _eventType) internal {
        Participant storage participantRecord = participantsByAddress[_from];
        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_from];

        uint256 processedTotals = aggregatedStats.committedETH.add(aggregatedStats.returnedETH);

        // whitelisted( committed ) + returned is lower than total received
        if (processedTotals < aggregatedStats.totalReceivedETH) {

            uint8 currentStage = getCurrentStage();

            for (uint8 stageId = 0; stageId <= currentStage; stageId++) {

                ParticipantDetails storage byStage = participantRecord.byStage[stageId];

                // handle the case when we have reserved more tokens than globally available
                aggregatedStats.reservedTokens = aggregatedStats.reservedTokens.sub(byStage.reservedTokens);
                byStage.reservedTokens = 0;

                // the maximum amount is equal to the total available ETH at the current stage
                uint256 maxAcceptableValue = availableEthAtStage(currentStage);

                // the per stage accepted amount: totalReceivedETH - committedETH
                uint256 newAcceptedValue = byStage.totalReceivedETH.sub(byStage.committedETH).sub(byStage.returnedETH);
                uint256 returnValue;

                if (newAcceptedValue > 0) {

                    // if incoming value is higher than what we can accept,
                    // just accept the difference and return the rest
                    if (newAcceptedValue > maxAcceptableValue) {
                        returnValue = newAcceptedValue.sub(maxAcceptableValue);
                        newAcceptedValue = maxAcceptableValue;

                        // update return values
                        returnedETH = returnedETH.add(returnValue);
                        aggregatedStats.returnedETH = aggregatedStats.returnedETH.add(returnValue);
                        byStage.returnedETH = returnValue;
                    }

                    // update values by adding the new accepted amount
                    committedETH = committedETH.add(newAcceptedValue);
                    aggregatedStats.committedETH = aggregatedStats.committedETH.add(newAcceptedValue);
                    byStage.committedETH = byStage.committedETH.add(newAcceptedValue);

                    // calculate the equivalent token amount
                    uint256 newTokenAmount = getTokenAmountForEthAtStage(
                        newAcceptedValue, stageId
                    );

                    // update participant's token amounts
                    aggregatedStats.boughtTokens = aggregatedStats.boughtTokens.add(newTokenAmount);
                    byStage.boughtTokens = byStage.boughtTokens.add(newTokenAmount);

                    aggregatedStats.activeTokens = aggregatedStats.activeTokens.add(newTokenAmount);
                    byStage.activeTokens = byStage.activeTokens.add(newTokenAmount);

                    // solium-disable-next-line security/no-send
                    IERC777(tokenContractAddress).send(_from, newTokenAmount, "");
                }

                // if the incoming amount is too big to accept, then...
                // ... we must transfer back the difference.
                if (returnValue > 0) {
                    address(uint160(_from)).transfer(returnValue);
                    emit TransferEvent(uint8(TransferTypes.AUTOMATIC_RETURN), _from, returnValue);
                }

                emit ApplicationEvent(_eventType, uint32(stageId), _from, newAcceptedValue);
            }
        }
    }

    function getParticipantPendingETH(address _from) public view returns (uint256) {

        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_from];

        // return aggregatedStats.totalReceivedETH
        //     .sub(aggregatedStats.returnedETH)
        //     .sub(aggregatedStats.committedETH)
        //     .sub(aggregatedStats.withdrawnETH);

        // return aggregatedStats.committedETH.sub(
        //     aggregatedStats.withdrawnETH
        // );


        return aggregatedStats.totalReceivedETH
            // returned when contract cannot accept full received amount
            // + returned by cancel()
            .sub(aggregatedStats.returnedETH)
            .sub(
                // ETH for which we have tokens ( whitelisted )
                aggregatedStats.committedETH
                // .sub(
                //     aggregatedStats.withdrawnETH
                // )
            );
    }

    /**
     * @notice Cancels all of the participant's contributions so far.
     * @param _from Participant's address
     * @param _value the ETH amount sent with the transaction, to return
     * @param _eventType Reason for canceling: {WHITELIST_REJECT, PARTICIPANT_CANCEL}
     * TODO add whitelisted modifier, on all functions that require such
     */
    function cancelContributionsForAddress(address _from, uint256 _value, uint8 _eventType) internal {

        // Participant should only be able to cancel if they haven't been whitelisted yet...
        // ...but just to make sure take 'withdrawn' and 'returned' into account.
        // This is to handle the case when whitelist controller whitelists someone, then rejects...
        // ...then whitelists them again.

        Participant storage participantRecord = participantsByAddress[_from];
        ParticipantDetails storage aggregatedStats = participantAggregatedStats[_from];

        // Get participant's pending ETH i.e. committed - withdrawnETH - returnedETH
        uint256 participantPendingETH = getParticipantPendingETH(_from);

        // Revert if there is no pending ETH contribution
        require(participantPendingETH > 0, "Participant has not contributed any ETH yet.");

        // Update total ETH returned
        // Since this balance was never actually "accepted" it counts as returned...
        // ...so it does not interfere with project withdraw calculations
        returnedETH = returnedETH.add(participantPendingETH);

        // update participant's audit values
        aggregatedStats.reservedTokens = 0;
        aggregatedStats.returnedETH = aggregatedStats.returnedETH.add(participantPendingETH);

        uint8 currentStage = getCurrentStage();
        for (uint8 stageId = 0; stageId <= currentStage; stageId++) {
            ParticipantDetails storage byStage = participantRecord.byStage[stageId];

            // byStage.returnedETH = byStage.totalReceivedETH
            //     .sub(byStage.returnedETH)
            //     .sub(byStage.committedETH)
            //     .sub(byStage.withdrawnETH);

            byStage.returnedETH = byStage.totalReceivedETH.sub(byStage.committedETH);


            byStage.reservedTokens = 0;
        }

        // transfer ETH back to participant including received value
        address(uint160(_from)).transfer(participantPendingETH.add(_value));

        // event emission
        emit TransferEvent(_eventType, _from, participantPendingETH);
        emit ApplicationEvent(
            _eventType,
            uint32(participantRecord.contributionsCount),
            _from,
            participantPendingETH
        );
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
        require(msg.sender == whitelistControllerAddress, "Only the whitelist controller can call this method.");
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
        require(blockNumber >= commitPhaseStartBlock && blockNumber <= buyPhaseEndBlock, "Contract outside buy in range");
        _;
    }
}
