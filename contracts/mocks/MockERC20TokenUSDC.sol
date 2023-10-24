// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20TokenUSDC is ERC20 {
    constructor() ERC20("USDC", "USDC") {
        _mint(_msgSender(), type(uint256).max);
    }
}
