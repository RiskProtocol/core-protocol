// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
/*
    * A library is similar to a contract but you can't decalre a state variable and you can't send ether
    * Money maths is done in terms of wei, 1ether = 1E18 wei(1 * 10^18 wei)  
    * To convert the value of ether to USD, we can use chainlink and oracles.
    * Smart contracts are unable to connect with external systems like data feeds, APIs etc on their own. 
    * We dont want to get our data through a centralized node it will defeat the purpose of blockchain
    * Blockchain oracle is any device that interacts with the off chain(external) world to provide external
    data to smart contracts.
    * We will make use of chainlink(decentralized oracle network) to bring external data to our smart contract
    specifically we will be making use of chainlink data feed(this can return different data eg prices of cyptocurrencies).
    * Chainlink keepers is used for decentralized event driven executions
    * Chainlink nodes can make API calls
    * Chainlink VRF is used to get provable random numbers
*/
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