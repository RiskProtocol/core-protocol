// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./DevToken.sol";
import "./library/PriceFeed.sol";
import "hardhat/console.sol";

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
contract TokenFactory is ReentrancyGuard {
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;

    // State variables
    struct scallingFactor {
        uint256 scallingFactorX;
        uint256 scallingFactorY;
    }
    scallingFactor[] private s_scallingFactor;
    DevToken[] private s_devTokenArray;
    address private immutable i_baseTokenAddress;
    AggregatorV3Interface private immutable i_priceFeed;
    mapping(address => uint256) s_lastRebaseCount; 

    // Events
    event AssetBought(address indexed recipient, uint256 amount);
    event AssetWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address baseTokenAddress,
        address priceFeedAddress,
        string memory token1Name,
        string memory token1Symbol,
        string memory token2Name,
        string memory token2Symbol
    ) {
        i_baseTokenAddress = baseTokenAddress;
        i_priceFeed = AggregatorV3Interface(priceFeedAddress);

        DevToken devToken1 = new DevToken(token1Name, token1Symbol);
        s_devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken(token2Name, token2Symbol);
        s_devTokenArray.push(devToken2);
    }

    function mint(
        uint256 _devTokenIndex,
        address _receiver,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].mint(_receiver, _amount);
    }

    function balanceOf(
        uint256 _devTokenIndex,
        address _owner
    ) public view returns (uint256) {
        if (s_lastRebaseCount[msg.sender] != getScallingFactorLength()) {
            console.log("rebase needed");
            uint256 scallingFactorX = s_scallingFactor[
                s_lastRebaseCount[msg.sender]
            ].scallingFactorX;
            uint256 scallingFactorY = s_scallingFactor[
                s_lastRebaseCount[msg.sender]
            ].scallingFactorY;           

            uint256 newTokenValue = ((s_devTokenArray[0].balanceOf(_owner) /
                1e18) * scallingFactorX) +
                ((s_devTokenArray[1].balanceOf(_owner) / 1e18) *
                    scallingFactorY);
            return newTokenValue;
        } else {
            console.log("rebase not needed");
            return s_devTokenArray[_devTokenIndex].balanceOf(_owner);
        }
    }

    function transfer(
        uint256 _devTokenIndex,
        address to,
        uint256 value
    ) public returns (bool) {
        if (s_lastRebaseCount[msg.sender] != getScallingFactorLength()) {
            applyRebase();
        }
        return true;
        // fix the bug here
        // return s_devTokenArray[_devTokenIndex].transfer(to, value);
    }

    function burn(
        uint256 _devTokenIndex,
        address _owner,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].burn(_owner, _amount);
    }

    function rebase() public {
        uint256 rebasePrice = i_priceFeed.getPrice() / 1e18;
        uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
        uint256 asset2Price = rebasePrice - asset1Price;
        uint256 divisor = rebasePrice.ceilDiv(2);
        s_scallingFactor.push(
            scallingFactor(
                ((asset1Price * 1e18) / 2) / divisor,
                ((asset2Price * 1e18) / 2) / divisor
            )
        );
    }

    function applyRebase() internal {
        console.log("applying rebase");
        uint256 scallingFactorX = s_scallingFactor[
            s_lastRebaseCount[msg.sender]
        ].scallingFactorX;
        uint256 scallingFactorY = s_scallingFactor[
            s_lastRebaseCount[msg.sender]
        ].scallingFactorY;

        uint256 asset1Balance = s_devTokenArray[0].balanceOf(msg.sender) / 1e18;
        uint256 asset2Balance = s_devTokenArray[1].balanceOf(msg.sender) / 1e18;
        uint256 asset1ValueEth = asset1Balance * 1e18;
        uint256 asset2ValueEth = asset2Balance * 1e18;
        uint256 rollOverValue = (asset1Balance * scallingFactorX) +
            (asset2Balance * scallingFactorY);

        if (rollOverValue > asset1ValueEth) {
            mint(0, msg.sender, (rollOverValue - asset1ValueEth));
        } else {
            burn(0, msg.sender, (asset1ValueEth - rollOverValue));
        }

        if (rollOverValue > asset2ValueEth) {
            mint(1, msg.sender, (rollOverValue - asset2ValueEth));
        } else {
            burn(1, msg.sender, (asset2ValueEth - rollOverValue));
        }

        s_lastRebaseCount[msg.sender] = getScallingFactorLength();
    }

    function buyAsset() public payable nonReentrant {
        mint(0, msg.sender, msg.value);
        mint(1, msg.sender, msg.value);       
        emit AssetBought(msg.sender, msg.value);
    }

    function withdrawAsset(uint256 _amount) public nonReentrant {
        if (_amount > balanceOf(0, msg.sender))
            revert TokenFactory__InsufficientFund();
        burn(0, msg.sender, _amount);
        burn(1, msg.sender, _amount);
        payable(msg.sender).transfer(_amount);
        emit AssetWithdrawn(msg.sender, _amount);
    }

    function getBaseTokenAddress() public view returns (address) {
        return i_baseTokenAddress;
    }

    function getPriceFeedAddress() public view returns (AggregatorV3Interface) {
        return i_priceFeed;
    }

    function getScallingFactor(
        uint256 index
    ) public view returns (scallingFactor memory) {
        return s_scallingFactor[index];
    }

    function getScallingFactorLength() public view returns (uint256) {
        return s_scallingFactor.length;
    }
}
