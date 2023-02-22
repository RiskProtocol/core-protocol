// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./DevToken.sol";

error TokenFactory__InsufficientFund();

/**
 * @title ERC-20 Rebase Tokens
 * @author Okwuosa Chijioke
 * @notice Still under development
 * @dev This implements 2 ERC-20 tokens that will be minted in exactly the same proportion as the
 * underlying ERC-20 token transferred into the Factory contract.
 * The asset will be burned in exactly the same proportion when asked to redeem/withdrawal the underlying asset.
 * The contract will implement periodic rebalancing
 */
contract TokenFactory is ReentrancyGuard{
    // State variables
    DevToken[] private s_devTokenArray;
    address private immutable i_baseTokenAddress;
    address[] private s_funders;

    // Events
    event AssetBought(address indexed recipient, uint256 amount);
    event AssetWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address baseTokenAddress,
        string memory token1Name,
        string memory token1Symbol,
        string memory token2Name,
        string memory token2Symbol
    ) {
        i_baseTokenAddress = baseTokenAddress;

        DevToken devToken1 = new DevToken(token1Name, token1Symbol);
        s_devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken(token2Name, token2Symbol);
        s_devTokenArray.push(devToken2);
    }

    function sendToken(
        uint256 _devTokenIndex,
        address _receiver,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].issueToken(_receiver, _amount);
    }

    function getBalance(
        uint256 _devTokenIndex,
        address _owner
    ) public view returns (uint256) {
        return s_devTokenArray[_devTokenIndex].tokenBalance(_owner);
    }

    function burnToken(
        uint256 _devTokenIndex,
        address _owner,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].burnToken(_owner, _amount);
    }

    function buyAsset() public payable nonReentrant {
        sendToken(0, msg.sender, msg.value);
        sendToken(1, msg.sender, msg.value);
        s_funders.push(msg.sender);
        emit AssetBought(msg.sender, msg.value);
    }

    function withdrawAsset(uint256 _amount) public nonReentrant{
        if (_amount > getBalance(0, msg.sender))
            revert TokenFactory__InsufficientFund();
        burnToken(0, msg.sender, _amount);
        burnToken(1, msg.sender, _amount);
        payable(msg.sender).transfer(_amount);
        emit AssetWithdrawn(msg.sender, _amount);
    }

    function getBaseTokenAddress() public view returns (address) {
        return i_baseTokenAddress;
    }
}
