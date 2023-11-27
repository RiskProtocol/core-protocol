// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

contract MockElasticSupplyPool {
    event WeightResynced(uint256 priceX);

    function resyncWeight(uint256 priceX) external {
        //do nothing
    }
}
