// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

library PriceFeed{
    
    function getPrice(AggregatorV3Interface priceFeed) internal view returns(uint256) {
        // here we have to interact with chainlink to get the price
        // inorder to interact with external contracts we will need the address and ABI
        // to get the ABI, we have to compile the interface   
        // this price below is ether in terms of USD         
        (,int256 price,,,) = priceFeed.latestRoundData();   
        // return uint256(price * 1e10); 
        return uint256(price); 

    }   
}