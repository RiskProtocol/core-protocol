// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract DevToken is ERC20, Ownable, ERC20Permit {
    constructor(
        string memory tokenName,
        string memory tokenSymbol
    ) ERC20(tokenName, tokenSymbol) ERC20Permit(tokenName) {}

    function issueToken(address receiver, uint256 amount) public onlyOwner {
        _mint(receiver, amount);
    }

    function tokenBalance(address owner) public view returns (uint256) {
        return balanceOf(owner);
    }

    function burnToken(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        return super.permit(owner, spender, value, deadline, v, r, s);
    }
}
