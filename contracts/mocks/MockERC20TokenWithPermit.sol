// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract MockERC20TokenWithPermit is ERC20, ERC20Permit {
    string private constant TOKEN_NAME = 'Risk';
    constructor() ERC20(TOKEN_NAME, 'RK') ERC20Permit(TOKEN_NAME) {
       _mint(msg.sender, 200e18);
    }    
}
