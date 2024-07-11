// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

//Used by the flashloan in the wrapped smart token
interface IFlashLoanReceiverAlt {
    function executeOperation(
        uint256 loanAmount,
        address repayToken,
        uint256 repayAmount,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
