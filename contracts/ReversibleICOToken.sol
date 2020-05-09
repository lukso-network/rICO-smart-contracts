pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversibleICO {
    function getParticipantReservedTokens(address) external view returns (uint256);
}

contract ReversibleICOToken is ERC777 {

    ReversibleICO public rICO;

    bool public frozen; // default: false
    bool public initialized; // default: false
    
    // addresses
    address public deployingAddress;
    address public projectAddress; // receives the initial amount and can set the migration address
    address public migrationAddress; // The contract address which will handle the token migration
    address public freezerAddress; // should be same as freezer address in rICO
    address public rescuerAddress; // should be same as rescuerAddress address in rICO

    // ------------------------------------------------------------------------------------------------

    constructor(
        string memory name,
        string memory symbol,
        address[] memory _defaultOperators
    )
    ERC777(name, symbol, _defaultOperators)
    public
    {
        deployingAddress = msg.sender;
    }

    // Init the rICO token and attach it to the rICO
    function init(
        address _ricoAddress,
        address _freezerAddress,
        address _rescuerAddress,
        address _projectAddress,
        uint256 _initialSupply
    )
    public
    isNotInitialized
    onlyDeployingAddress
    {
        require(_freezerAddress != address(0), "_freezerAddress cannot be 0x");
        require(_rescuerAddress != address(0), "_rescuerAddress cannot be 0x");
        require(_projectAddress != address(0), "_projectAddress cannot be 0x");

        rICO = ReversibleICO(_ricoAddress);
        projectAddress = _projectAddress;
        freezerAddress = _freezerAddress;
        rescuerAddress = _rescuerAddress;

        _mint(_projectAddress, _projectAddress, _initialSupply, "", "");

        initialized = true;
    }

    // *** Migration process
    function addMigrationAddress(address _migrationAddress)
    public
    onlyProjectAddress
    {
        migrationAddress = _migrationAddress;
    }


    // *** SECURITY functions
    function removeFreezer()
    public
    onlyFreezerAddress
    isNotFrozen
    {
        freezerAddress = address(0);
    }

    function freeze() public onlyFreezerAddress {
        frozen = true;
    }

    function unfreeze() public onlyFreezerAddress {
        frozen = false;
    }

    // The rICO address can only be changed when the contract is frozen
    function changeRICO(address _newRicoAddress)
    public
    onlyRescuerAddress
    isFrozen
    {
        rICO = ReversibleICO(_newRicoAddress);
    }

    // *** Public functions
    function getLockedBalance(address _owner) public view returns(uint256) {
        if(address(rICO) != address(0)) {
            return rICO.getParticipantReservedTokens(_owner);
        } else {
            return 0;
        }
    }

    function getUnlockedBalance(address _owner) public view returns(uint256) {
        uint256 balance = balanceOf(_owner);

        if(address(rICO) != address(0)) {
            uint256 locked = rICO.getParticipantReservedTokens(_owner);

            if(balance > 0 && locked > 0 && balance >= locked) {
                return balance.sub(locked);
            }
        }

        return balance;
    }


    // *** Internal functions

    // We override burn as well. So users can not burn locked tokens.
    function _burn(
        address _operator,
        address _from,
        uint256 _amount,
        bytes memory _data,
        bytes memory _operatorData
    )
    internal
    isNotFrozen
    isInitialized
    {
        require(_amount <= getUnlockedBalance(_from), "Burning failed: Insufficient funds");
        ERC777._burn(_operator, _from, _amount, _data, _operatorData);
    }

    // We need to override send / transfer methods in order to only allow transfers within RICO unlocked calculations
    // The rico address can receive any amount for withdraw functionality
    function _move(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _userData,
        bytes memory _operatorData
    )
    internal
    isNotFrozen
    isInitialized
    {

        // If tokens are send to the rICO, OR tokens are sent to the migration contract
        // OR rICO is not set allow transfers the total balance
        if(
            _to == address(rICO) ||
            _to == migrationAddress ||
            address(rICO) == address(0)
        ) {
            // full balance can be sent back to rico
            require(_amount <= balanceOf(_from), "Sending failed: Insufficient funds");

        } else {
            // for every other address limit to unlocked balance
            require(_amount <= getUnlockedBalance(_from), "Sending failed: Insufficient funds");
        }

        ERC777._move(_operator, _from, _to, _amount, _userData, _operatorData);
    }


    // *** Modifiers
    /**
     * @notice Checks if the sender is the deployer.
     */
    modifier onlyDeployingAddress() {
        require(msg.sender == deployingAddress, "Only the deployer can call this method.");
        _;
    }

    /**
     * @notice Checks if the sender is the deployer.
     */
    modifier onlyProjectAddress() {
        require(msg.sender == projectAddress, "Only the project can call this method.");
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
        require(initialized == false, "Contract is already initialized.");
        _;
    }

    /**
     * @notice @dev Requires the contract to be frozen.
     */
    modifier isFrozen() {
        require(frozen == true, "Token contract not frozen.");
        _;
    }

    /**
     * @notice @dev Requires the contract not to be frozen.
     */
    modifier isNotFrozen() {
        require(frozen == false, "Token contract is frozen!");
        _;
    }
}
