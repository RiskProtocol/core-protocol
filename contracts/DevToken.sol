// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract DevToken is ERC20, Ownable {
    constructor(
        string memory tokenName,
        string memory tokenSymbol
    ) ERC20(tokenName, tokenSymbol) {}    

    function mint(address receiver, uint256 amount) public onlyOwner {
        _mint(receiver, amount);
    }

    function burn(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    } 

    function transfer(address to, uint256 amount) public override returns (bool) {       
        address owner = tx.origin;        
        _transfer(owner, to, amount);
        return true;
    }   
}

