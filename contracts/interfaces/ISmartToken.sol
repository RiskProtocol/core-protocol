// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISmartToken is IERC20 {
    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256);

    function getTokenFactory() external returns (address);
}
