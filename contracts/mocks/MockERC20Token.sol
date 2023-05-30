// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./../interfaces/IERC20Update.sol";

contract MockERC20Token is ERC20, IERC20Update {
    constructor() ERC20('Risk', 'RK') {
       _mint(msg.sender, type(uint256).max);
    }

    function permit(address owner, address spender, uint value,
    uint deadline, uint8 v, bytes32 r, bytes32 s) external {}
}
