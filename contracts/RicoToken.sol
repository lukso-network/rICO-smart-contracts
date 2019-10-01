pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

interface ReversableICO {
    function getLockedTokenAmount(address) external returns (uint256);
}
contract RicoToken is ERC777 {
    
    ReversableICO public rico;
    constructor(
        uint256 initialSupply,
        address[] memory _defaultOperators)
        ERC777("RicoToken", "RICO", _defaultOperators)
        public
    {
        _mint(msg.sender, msg.sender, initialSupply, "", "");
    }

    function setupRico(address _rico) public {
        rico = ReversableICO(_rico);
    }

    function getLockedBalance(address owner) public returns(uint){
        return rico.getLockedTokenAmount(owner);
    }

    function getUnlockedBalance(address owner) public returns(uint){
        return balanceOf(owner).sub(rico.getLockedTokenAmount(owner));
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
        require(amount <= getUnlockedBalance(from), "Insufficient funds");
        ERC777._move(operator, from, to, amount, userData, operatorData);
    }



}