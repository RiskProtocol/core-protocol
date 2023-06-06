// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20TokenWithoutPermit is ERC20 {
    string private constant TOKEN_NAME = 'RiskW';
    constructor() ERC20(TOKEN_NAME, 'RKW'){
       _mint(_msgSender(), 200e18);
    }    
}
