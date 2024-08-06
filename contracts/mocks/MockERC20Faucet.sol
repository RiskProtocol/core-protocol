// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./../interfaces/IERC20Update.sol";

contract MockERC20Faucet is ERC20, IERC20Update {
    uint256 public constant initialSupply = 100_000_000 * 10**18;
    uint256 public constant faucetAmount = 10 * 10**18;

    constructor() ERC20('riskBTC', 'rBTC') {
        _mint(msg.sender, initialSupply);
    }

    function permit(address owner, address spender, uint256 value,
        uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {}

    function faucet() external {
        // Check if the caller has a zero balance
        require(balanceOf(msg.sender) == 0, "You already have tokens");

        // Mint the faucet amount to the caller
        _mint(msg.sender, faucetAmount);
    }
}
