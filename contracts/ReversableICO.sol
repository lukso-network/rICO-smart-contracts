/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

contract ReversableICO {

    /*
    *   Contract Settings
    */
    uint256 public StartBlock;
    uint256 public EndBlock;
    uint256 public SaleStageBlockCount;
    uint256 public RicoStageBlockCount;

    address public TokenTrackerAddress;
    address public whitelistControllerAddress;

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
    }

    // fallback function
    function () external payable {
        this.commit();
    }

    function addSettings(
        address _TokenTrackerAddress,
        address _whitelistControllerAddress,
        uint256 _StartBlock,
        uint256 _SaleStageBlockCount,
        uint256 _RicoStageBlockCount
    )
        public
        onlyDeployer
        requireNotInitialized
    {
        TokenTrackerAddress = _TokenTrackerAddress;
        whitelistControllerAddress = _whitelistControllerAddress;
        StartBlock = _StartBlock;
        SaleStageBlockCount = _SaleStageBlockCount;
        RicoStageBlockCount = _RicoStageBlockCount;

        // calculate end block
        EndBlock = _StartBlock + _SaleStageBlockCount + _RicoStageBlockCount;

        initialized = true;
    }

    function getCurrentStage() public view returns ( uint256 ) {
        // Stages
        uint256 test = block.timestamp;

        return test;
    }


    /*
    *   Participants
    */
    struct Contribution {
        uint256 value;
        uint256 block;
    }

    struct Participant {
        bool   whitelisted;
        uint16  contributionsCount;
        mapping ( uint16 => Contribution ) contributions;
    }

    mapping ( address => Participant ) public ParticipantsByAddress;
    mapping ( uint256 => address ) public ParticipantsById;
    uint256 ParticipantCount = 0;

    /*
    *   Investor commits funds
    */
    function commit()
        public
        payable
        requireRunning
        requireNotEnded
        requireNotFrozen
    {
        /*
        // require(isStarted() && notFrozen(), "");
        require(isWhitelisted(msg.sender), "Address is not whitelisted to participate");
        require(msg.value > 0, "Value must be higher than zero");

        // contribute first, then get whitelisted.

        ParticipantType storage newRecord = ParticipantsByAddress[_address];
        newRecord.whitelisted = true;
        ParticipantCount++;

        based on amount of blocks that passed, take the cut for the project
        */
    }

    /*
    *   Whitelisting
    */

    function whitelist(address _address) public {
        Participant storage newRecord = ParticipantsByAddress[_address];
        newRecord.whitelisted = true;
        ParticipantCount++;
    }

    function whitelistMultiple(address[] memory _address) public {
        for( uint16 i = 0; i < _address.length; i++ ) {
            this.whitelist(_address[i]);
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
        requireInitialized
        requireRunning
        requireNotFrozen
        requireNotEnded
    {
        // call internal refund method()
        this.refund();
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
        require(msg.sender == deployerAddress, "Only deployer can call this method");
        _;
    }

    modifier requireInitialized() {
        require(initialized == true, "Contract must be initialized");
        _;
    }

    modifier requireNotInitialized() {
        require(initialized == false, "Contract must not be initialized");
        _;
    }

    modifier requireRunning() {
        require(ended == true, "RICO must be running");
        _;
    }

    modifier requireNotRunning() {
        require(ended == false, "RICO must not be running");
        _;
    }

    modifier requireEnded() {
        require(ended == true, "RICO period must have ended");
        _;
    }

    modifier requireNotEnded() {
        require(ended == false, "RICO period must not have ended");
        _;
    }

    modifier requireFrozen() {
        require(frozen == true, "Contract must be frozen");
        _;
    }

    modifier requireNotFrozen() {
        require(frozen == false, "Contract must not be frozen");
        _;
    }

}