// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;
interface IAggregationExecutor {
    /// @notice propagates information about original msg.sender and executes arbitrary data
    function execute(address msgSender) external payable returns(uint256);  // 0x4b64e492
}