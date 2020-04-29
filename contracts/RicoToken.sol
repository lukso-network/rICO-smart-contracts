pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversibleICO {
    function getParticipantReservedTokens(address) external view returns (uint256);
}

contract RicoToken is ERC777 {

    ReversibleICO public rICO;

    bool public frozen; // default: false
    bool public initialized; // default: false
    
    // addresses
    address public managerAddress; // should be same as freezer address in rICO
    address public rescuerAddress; // should be same as rescuerAddress address in rICO

    // ------------------------------------------------------------------------------------------------

    constructor(
        address[] memory _defaultOperators
    )
    ERC777("LYXe Token", "LYXe", _defaultOperators)
    public
    {
        managerAddress = msg.sender;
    }

    // Init the rICO token and attach it to the rICO
    function init(
        address _ricoAddress,
        address _rescuerAddress,
        address _projectAddress,
        uint256 _initialSupply
    )
    public
    isNotInitialized
    onlyManagerAddress
    {
        _mint(_projectAddress, _projectAddress, _initialSupply, "", "");
        
        rICO = ReversibleICO(_ricoAddress);
        rescuerAddress = _rescuerAddress;
        
        initialized = true;
    }


    // *** SECURITY functions
    function removeManager()
    public
    onlyManagerAddress
    isNotFrozen
    {
        managerAddress = address(0);
    }

    function freeze() public onlyManagerAddress {
        frozen = true;
    }

    function unfreeze() public onlyManagerAddress {
        frozen = false;
    }

    // The rICO address can only be changed when the contract is frozen
    function changeRICO(address _ricoAddress)
    public
    onlyRescuerAddress
    isFrozen
    {
        rICO = ReversibleICO(_ricoAddress);
    }

    // *** Public functions
    function getLockedBalance(address _owner) public view returns(uint256) {
        return rICO.getParticipantReservedTokens(_owner);
    }

    function getUnlockedBalance(address _owner) public view returns(uint256) {
        uint256 balance = balanceOf(_owner);
        uint256 locked = rICO.getParticipantReservedTokens(_owner);

        if(balance > 0 && locked > 0 && balance >= locked) {
            return balance.sub(locked);
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

        if(_to == address(rICO)) {
            // full balance can be sent back to rico
            require(_amount <= balanceOf(_from), "Sending failed: Insufficient funds");
        } else {
            // for every other address limit to unlocked balance
            require(_amount <= getUnlockedBalance(_from), "Sending failed: Insufficient funds");
        }

        ERC777._move(_operator, _from, _to, _amount, _userData, _operatorData);
    }


    // *** Modifiers

    modifier onlyManagerAddress() {
        require(msg.sender == managerAddress, "Only manager address can call this method");
        _;
    }
    
    modifier onlyRescuerAddress() {
        require(msg.sender == rescuerAddress, "Only the rescuer address can call this method.");
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

    modifier isFrozen() {
        require(frozen == true, "Token contract not frozen.");
        _;
    }

    modifier isNotFrozen() {
        require(frozen == false, "Token contract is frozen!");
        _;
    }
}
