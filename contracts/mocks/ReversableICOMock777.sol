/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

contract ReversableICOMock777 {

    mapping( address => uint256 ) public balances;

    function setLockedTokenAmount(address wallet, uint256 _balance) external {
        balances[wallet] = _balance;
    }

    function getLockedTokenAmount(address wallet) external returns (uint256) {
        return balances[wallet];
    }

}