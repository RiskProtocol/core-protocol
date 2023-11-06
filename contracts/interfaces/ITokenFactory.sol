// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

interface ITokenFactory {
    //used to execute rebase in the orchestrator
    function executeRebase(
        bytes memory encodedData,
        bytes memory signature
    ) external;

    //used to execute queued rebase in the orchestrator
    function executeScheduledRebases() external;
}
