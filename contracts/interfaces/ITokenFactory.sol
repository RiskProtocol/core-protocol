// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "../lib/Shared.sol";

interface ITokenFactory {
    //used to execute rebase in the orchestrator
    function executeRebase(
        bytes memory encodedData,
        bytes memory signature
    ) external;

    //used to execute queued rebase in the orchestrator
    function executeScheduledRebases() external;

    function verifyAndDecode(
        bytes memory signature,
        bytes memory encodedData
    ) external view returns (Shared.ScheduledRebase memory);
}
