pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";
import "./ReversableICO.sol";

contract RicoToken is ERC777 {
    
    ReversableICO public rico;
    constructor(
        uint256 initialSupply,
        address[] memory defaultOperators,
        address _rico
    )
        ERC777("RicoToken", "RICO", defaultOperators)
        public
    {
        
        _mint(msg.sender, msg.sender, initialSupply, "", "");
        rico = ReversableICO(_rico);
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
        require(amount <= balanceOf(from).sub(rico.getLockedTokenAmount(from)), "Insufficient funds");
        ERC777._move(operator, from, to, amount, userData, operatorData);
    }



}