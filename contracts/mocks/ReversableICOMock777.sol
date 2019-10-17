/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

import './ReversableICOMock.sol';

contract ReversableICOMock777 is ReversableICOMock {

    mapping( address => uint256 ) public balances;

    function setLockedTokenAmount(address wallet, uint256 _balance) external {
        balances[wallet] = _balance;
    }

    function getLockedTokenAmount(address wallet) public view returns (uint256) {
        return balances[wallet];
    }

}