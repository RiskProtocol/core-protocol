// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DevToken is ERC20, Ownable {
    constructor(
        string memory tokenName,
        string memory tokenSymbol
    ) ERC20(tokenName, tokenSymbol) {}

    function issueToken(address receiver, uint256 amount) public onlyOwner {
        _mint(receiver, amount);
    }

    function tokenBalance(address owner) public view returns (uint256) {
        return balanceOf(owner);
    }

    function burnToken(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }
}
