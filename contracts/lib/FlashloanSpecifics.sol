// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

contract FlashloanSpecifics {
    error FlashLoan__InsufficientUnderlying();
    error FlashLoan__FailedExecOps();
    error FlashLoan__FailedRepayments();
    error FlashLoan__InvalidReceiver();
    event FlashLoanExecuted(
        address receiver,
        address initiator,
        uint256 amount,
        uint256 premium,
        bytes params
    );
}
