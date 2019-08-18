pragma solidity ^0.5.0;

import "./zeppelin/token/ERC777/ERC777.sol";

contract RicoToken is ERC777 {
    constructor(
        uint256 initialSupply,
        address[] memory defaultOperators
    )
        ERC777("RicoToken", "RICO", defaultOperators)
        public
    {
        _mint(msg.sender, msg.sender, initialSupply, "", "");
    }

    // we need to override send / transfer methods in order to only allow transfers within RICO unlocked calculations



}