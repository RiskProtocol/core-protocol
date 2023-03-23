// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
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
contract TokenFactory is ReentrancyGuard, Ownable {
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;
    using SafeMath for uint256;

    // State variables
    uint256[] private scallingFactorX;
    DevToken[] private devTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    uint8 private immutable baseTokenDecimals;
    ERC20 private immutable baseToken;

    // Events
    event AssetBought(address indexed recipient, uint256 amount);
    event AssetWithdrawn(address indexed owner, uint256 amount);

    constructor(address baseTokenAddress, address priceFeedAddress) {
        baseToken = ERC20(baseTokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        baseTokenDecimals = baseToken.decimals();
    }

    function initialize(
        string memory token1Name,
        string memory token1Symbol,
        string memory token2Name,
        string memory token2Symbol,
        address tokenFactoryAddress
    ) public {
        DevToken devToken1 = new DevToken(
            token1Name,
            token1Symbol,
            tokenFactoryAddress
        );
        devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken(
            token2Name,
            token2Symbol,
            tokenFactoryAddress
        );
        devTokenArray.push(devToken2);
    }

    function mint(
        uint256 devTokenIndex,
        address receiver,
        uint256 amount
    ) private nonReentrant {
        devTokenArray[devTokenIndex].mint(receiver, amount);
    }

    function burn(
        uint256 devTokenIndex,
        address owner_,
        uint256 amount
    ) private nonReentrant {
        devTokenArray[devTokenIndex].burn(owner_, amount);
    }

    function subUnchecked(
        uint256 scallingFactorX_
    ) public view returns (uint256) {
        unchecked {
            return (10 ** baseTokenDecimals) - scallingFactorX_;
        }
    }

    function balanceOf(
        uint256 devTokenIndex,
        address owner_
    ) public view returns (uint256) {
        return devTokenArray[devTokenIndex].balanceOf(owner_);
    }

    function transfer(
        uint256 devTokenIndex,
        address to,
        uint256 value
    ) public returns (bool) {
        return devTokenArray[devTokenIndex].transfer(to, value);
    }

    function rebase() public onlyOwner {
        uint256 rebasePrice = priceFeed.getPrice() / 10 ** baseTokenDecimals;
        uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
        uint256 divisor = rebasePrice.ceilDiv(2);
        scallingFactorX.push(
            ((asset1Price * 10 ** baseTokenDecimals) / 2) / divisor
        );
    }

    function applyRebase(address owner_) public {   
        uint256 asset1ValueEth = devTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = devTokenArray[1].unScaledbalanceOf(owner_);

        uint256 rollOverValue = calculateRollOverValue(owner_);
        lastRebaseCount[owner_] = getScallingFactorLength();

        if (rollOverValue > asset1ValueEth) {
            mint(0, owner_, (rollOverValue - asset1ValueEth));
        } else {
            burn(0, owner_, (asset1ValueEth - rollOverValue));
        }

        if (rollOverValue > asset2ValueEth) {
            mint(1, owner_, (rollOverValue - asset2ValueEth));
        } else {
            burn(1, owner_, (asset2ValueEth - rollOverValue));
        }
    }

    function calculateRollOverValue(
        address owner_
    ) public view returns (uint256) {      
        uint256 scallingFactorX_ = scallingFactorX[lastRebaseCount[owner_]];
        uint256 scallingFactorY = subUnchecked(scallingFactorX_);
        uint256 denominator = 10 ** baseTokenDecimals;
              
        uint256 asset1Balance = devTokenArray[0].unScaledbalanceOf(owner_) /
             denominator;
        uint256 asset2Balance = devTokenArray[1].unScaledbalanceOf(owner_) /
             denominator;
        uint256 rollOverValue = (asset1Balance * scallingFactorX_) +
            (asset2Balance * scallingFactorY);
        return rollOverValue;
    }

    function buyAsset() public payable  {
        emit AssetBought(msg.sender, msg.value);
        mint(0, msg.sender, msg.value);
        mint(1, msg.sender, msg.value);       
    }

    function withdrawAsset(uint256 amount) public {        
        if (lastRebaseCount[msg.sender] != getScallingFactorLength()) {
            applyRebase(msg.sender);
        }
        if (amount > balanceOf(0, msg.sender))
            revert TokenFactory__InsufficientFund();

        emit AssetWithdrawn(msg.sender, amount);
        burn(0, msg.sender, amount);
        burn(1, msg.sender, amount);        
        payable(msg.sender).transfer(amount);
    }

    function getBaseTokenAddress() public view returns (ERC20) {
        return baseToken;
    }

    function getPriceFeedAddress() public view returns (AggregatorV3Interface) {
        return priceFeed;
    }

    function getScallingFactor(uint256 index) public view returns (uint256) {
        return scallingFactorX[index];
    }

    function getScallingFactorLength() public view returns (uint256) {
        return scallingFactorX.length;
    }

    function getUserLastRebaseCount(
        address userAddress
    ) public view returns (uint256) {
        return lastRebaseCount[userAddress];
    }

    function getDevTokenAddress(uint256 index) public view returns (DevToken) {
        return devTokenArray[index];
    }
}
