// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "../lib/Shared.sol";

interface ITokenFactory {
    //used to execute rebalance in the orchestrator
    function executeRebalance(
        bytes memory encodedData,
        bytes memory signature
    ) external;

    //used to execute queued rebalance in the orchestrator
    function executeScheduledRebalances() external;

    function verifyAndDecode(
        bytes memory signature,
        bytes memory encodedData
    ) external view returns (Shared.ScheduledRebalance memory);
}
