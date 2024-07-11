// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

interface IPriceFeedOracle {

    function getConversionRate(
        address from,
        address to
    ) external view returns (uint256, uint256) ;

    function getConstant() external pure returns(uint256);
    
}
