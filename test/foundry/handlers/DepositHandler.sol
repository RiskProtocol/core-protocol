// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "../TestHelper.sol";

contract DepositHandler is Test, TestHelper {   
    uint256 public totalDeposit;

    constructor(SmartToken _smartTokenX, MockERC20Token _mockERC20Token) {
        smartTokenX = _smartTokenX;
        mockERC20Token = _mockERC20Token;
    }

    function deposit(uint256 amount) public {
        vm.assume(amount > 0 ether && amount < type(uint256).max);
        mockERC20Token.approve(address(tokenFactory), amount);
        uint256 shares = smartTokenX.deposit(amount, address(0xaa));
        totalDeposit += shares;
    }
}
