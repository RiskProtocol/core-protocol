// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

contract Shared {
    /// @notice Struct to store information regarding a scheduled rebalance.
    /// @dev This struct holds the data for rebalances that are scheduled to be executed.
    struct ScheduledRebalance {
        // A unique number assigned to each rebalance, used to manage execution order and guard againts duplicates
        uint256 sequenceNumber;
        //Indicates whether this is a natural rebalance (occurs at regular planned intervals) or an early rebalance.
        bool isNaturalRebalance;
        // The price of the underlying asset at the rebalance time
        uint256 price;
        // The price of the smart token X at the rebalance time
        uint256 smartTokenXprice;
    }
}
