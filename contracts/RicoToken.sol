pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversibleICO {
    function getLockedTokenAmount(address) external returns (uint256);
}

contract RicoToken is ERC777 {

    ReversibleICO public rICO;
    address public manager;
    bool public frozen = false;
    bool public initialized = false;

    constructor(
        uint256 initialSupply,
        address[] memory _defaultOperators
    )
        ERC777("LYXeToken", "LYXe", _defaultOperators)
        public
    {
        _mint(msg.sender, msg.sender, initialSupply, "", "");
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

    function changeManager(address _newManager) public onlyManager {
        manager = _newManager;
    }

    function setFrozen(bool _status) public onlyManager {
        frozen = _status;
    }

    function getLockedBalance(address owner) public returns(uint) {
        return rICO.getLockedTokenAmount(owner);
    }

    function getUnlockedBalance(address owner) public returns(uint) {
        return balanceOf(owner).sub(rICO.getLockedTokenAmount(owner));
    }

    // We should override burn as well. So users can't burn locked amounts
    function _burn(
        address operator,
        address from,
        uint256 amount,
        bytes memory data,
        bytes memory operatorData
    )
        internal
        requireNotFrozen
    {
        require(amount <= getUnlockedBalance(from), "getUnlockedBalance: Insufficient funds");
        ERC777._burn(operator, from, amount, data, operatorData);
    }

    // We need to override send / transfer methods in order to only allow transfers within RICO unlocked calculations
    // ricoAddress can receive any amount for withdraw functionality
    function _move(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
        internal
        requireNotFrozen
        requireInitialized
    {

        if(to == address(rICO)) {
            // full balance can be sent back to rico
            require(amount <= balanceOf(from), "getUnlockedBalance: Insufficient funds");
        } else {
            // for every other address limit to unlocked balance
            require(amount <= getUnlockedBalance(from), "getUnlockedBalance: Insufficient funds");
        }

        ERC777._move(operator, from, to, amount, userData, operatorData);
    }

    modifier onlyManager() {
        require(msg.sender == manager, "onlyManager: Only manager can call this method");
        _;
    }

    modifier requireInitialized() {
        require(initialized == true, "requireInitialized: Contract must be initialized");
        _;
    }
    modifier requireNotInitialized() {
        require(initialized == false, "requireNotInitialized: Contract must not be initialized");
        _;
    }

    modifier requireNotFrozen() {
        require(frozen == false, "requireNotFrozen: Contract must not be frozen");
        _;
    }

}