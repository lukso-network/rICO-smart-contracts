pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversableICO {
    function getLockedTokenAmount(address) external returns (uint256);
}
contract RicoToken is ERC777 {
    
    ReversableICO public rICO;
    address public manager;
    bool public freezed;

    constructor(
        uint256 initialSupply,
        address[] memory _defaultOperators)
        ERC777("LYXeToken", "LYXe", _defaultOperators)
        public
    {
        _mint(msg.sender, msg.sender, initialSupply, "", "");
        manager = msg.sender;
        freezed = true;
    }
    event Setup(address hah);
    function setup(address _rICO, address _newManager) public {
        // require(msg.sender == manager);
        // rICO = ReversableICO(_rICO);
        // manager = _newManager;
        // freezed = false;
        emit Setup(msg.sender);
    }

    function changeManager(address _newManager) public {
        require(msg.sender == manager, "Not authorized");
        manager = _newManager;
    }


    function setFreezed(bool _status) public {
        require(msg.sender == manager);
        freezed = _status;
    }

    function getLockedBalance(address owner) public returns(uint){
        return rICO.getLockedTokenAmount(owner);
    }

    function getUnlockedBalance(address owner) public returns(uint){
        return balanceOf(owner).sub(rICO.getLockedTokenAmount(owner));
    }


    
    //We should override burn as well. So users can't burn locked amounts
      function _burn(
        address operator,
        address from,
        uint256 amount,
        bytes memory data,
        bytes memory operatorData
    )
        internal
    {
        require(!freezed, "Contract is freezed");
        require(amount <= getUnlockedBalance(from), "Insufficient funds");
        ERC777._burn(operator, from, amount, data, operatorData);
    }
    // we need to override send / transfer methods in order to only allow transfers within RICO unlocked calculations
      function _move(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
        internal
    {
        require(!freezed, "Contract is freezed");
        require(amount <= getUnlockedBalance(from), "Insufficient funds");
        ERC777._move(operator, from, to, amount, userData, operatorData);
    }



}