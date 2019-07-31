/*
 * source       https://github.com/mickys/rico-poc/
 * @name        RICO
 * @package     rico-poc
 * @author      Micky Socaci <micky@nowlive.ro>
 * @license     MIT
*/

pragma solidity ^0.5.0;

import '../ReversableICO.sol';

contract ReversableICOMock is ReversableICO {

    uint256 currentBlockNumber = 0;

    // required so we can override when running tests
    function getCurrentBlockNumber() public view returns (uint256) {
        return currentBlockNumber;
    }

    function increaseCurrentBlockNumber(uint256 _num) public {
        currentBlockNumber += _num;
    }

}