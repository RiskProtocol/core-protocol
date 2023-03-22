// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./TokenFactory.sol";
import "hardhat/console.sol";


contract DevToken is ERC20, Ownable, ERC20Permit, ReentrancyGuard  {
    TokenFactory private immutable tokenFactory;

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address tokenFactoryAddress
    ) ERC20(tokenName, tokenSymbol) ERC20Permit(tokenName){
        tokenFactory = TokenFactory(tokenFactoryAddress);
    }

    function mint(address receiver, uint256 amount) public onlyOwner {
        _mint(receiver, amount);
    }

    function burn(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }

    function transfer(
        address to,
        uint256 amount
    ) public override returns (bool) {
        address owner_ = tx.origin;
        if (
            tokenFactory.getUserLastRebaseCount(owner_) !=
            tokenFactory.getScallingFactorLength()
        ) {
            tokenFactory.applyRebase(owner_);
        }        
        _transfer(owner_, to, amount);
        return true;
    }

    function balanceOf(address account) public view override returns (uint256) {             
        if (           
            tokenFactory.getUserLastRebaseCount(tx.origin) !=
            tokenFactory.getScallingFactorLength()
        ) {
            return tokenFactory.calculateRollOverValue(account);
        } else {            
            return unScaledbalanceOf(account);
        }
    }

    function unScaledbalanceOf(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }
}
