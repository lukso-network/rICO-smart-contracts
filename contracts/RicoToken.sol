pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversibleICO {
    function getParticipantReservedTokens(address) external view returns (uint256);
}

contract RicoToken is ERC777 {

    ReversibleICO public rICO;
    address public manager;
    bool public frozen; // default: false
    bool public initialized; // default: false

    constructor(
        uint256 _initialSupply,
        address[] memory _defaultOperators
    )
        ERC777("LYXe Token", "LYXe", _defaultOperators)
        public
    {
        _mint(msg.sender, msg.sender, _initialSupply, "", "");
        manager = msg.sender;
        frozen = true;
    }

    // since rico affects balances, changing the rico address
    // once setup should not be possible.
    function setup(address _rICO)
        public
        requireNotInitialized
        onlyManager
    {
        rICO = ReversibleICO(_rICO);
        frozen = false;
        initialized = true;
    }

    // new method for updating the rico address in case of rICO address update


    function changeManager(address _newManager) public onlyManager {
        manager = _newManager;
    }

    function removeManager() public onlyManager {
        manager = address(0);
    }


    // *** SECURITY functions
    function freeze() public onlyManager {
        frozen = true;
    }

    function unfreeze() public onlyManager {
        frozen = false;
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
        requireNotFrozen
//        requireInitialized
    {
        require(_amount <= getUnlockedBalance(_from), "Burning: Insufficient funds");
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
        requireNotFrozen
        requireInitialized
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

    modifier onlyManager() {
        require(msg.sender == manager, "Only manager can call this method");
        _;
    }

    modifier requireInitialized() {
        require(initialized == true, "Contract must be initialized.");
        _;
    }

    modifier requireNotInitialized() {
        require(initialized == false, "Contract is already initialized.");
        _;
    }

    modifier requireNotFrozen() {
        require(frozen == false, "requireNotFrozen: Token contract is frozen!");
        _;
    }

}
