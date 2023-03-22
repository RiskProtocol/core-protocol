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
    uint256[] private s_scallingFactorX;
    DevToken[] private s_devTokenArray;
    AggregatorV3Interface private immutable i_priceFeed;
    mapping(address => uint256) private s_lastRebaseCount;
    uint8 private i_baseTokenDecimals;
    ERC20 private immutable i_baseToken;

    // Events
    event AssetBought(address indexed recipient, uint256 amount);
    event AssetWithdrawn(address indexed owner, uint256 amount);

    constructor(address baseTokenAddress, address priceFeedAddress) {
        i_baseToken = ERC20(baseTokenAddress);
        i_priceFeed = AggregatorV3Interface(priceFeedAddress);
        i_baseTokenDecimals = i_baseToken.decimals();
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
        s_devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken(
            token2Name,
            token2Symbol,
            tokenFactoryAddress
        );
        s_devTokenArray.push(devToken2);
    }

    function mint(
        uint256 _devTokenIndex,
        address _receiver,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].mint(_receiver, _amount);
    }

    function burn(
        uint256 _devTokenIndex,
        address _owner,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].burn(_owner, _amount);
    }

    function subUnchecked(
        uint256 scallingFactorX
    ) public view returns (uint256) {
        unchecked {
            return 10 ** i_baseTokenDecimals - scallingFactorX;
        }
    }

    function balanceOf(
        uint256 _devTokenIndex,
        address _owner
    ) public view returns (uint256) {
        return s_devTokenArray[_devTokenIndex].balanceOf(_owner);
    }

    function transfer(
        uint256 _devTokenIndex,
        address to,
        uint256 value
    ) public returns (bool) {
        return s_devTokenArray[_devTokenIndex].transfer(to, value);
    }

    function rebase() public onlyOwner{
        uint256 rebasePrice = i_priceFeed.getPrice() /
            10 ** i_baseTokenDecimals;
        uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
        uint256 divisor = rebasePrice.ceilDiv(2);
        s_scallingFactorX.push(
            ((asset1Price * 10 ** i_baseTokenDecimals) / 2) / divisor
        );
    }

    function applyRebase(address owner) public {
        uint256 asset1ValueEth = s_devTokenArray[0].unScaledbalanceOf(
           owner
        );
        uint256 asset2ValueEth = s_devTokenArray[1].unScaledbalanceOf(
            owner
        );

        uint256 rollOverValue = calculateRollOverValue(owner);

        if (rollOverValue > asset1ValueEth) {
            mint(0, owner, (rollOverValue - asset1ValueEth));
        } else {
            burn(0, owner, (asset1ValueEth - rollOverValue));
        }

        if (rollOverValue > asset2ValueEth) {
            mint(1, owner, (rollOverValue - asset2ValueEth));
        } else {
            burn(1, owner, (asset2ValueEth - rollOverValue));
        }       
        s_lastRebaseCount[owner] = getScallingFactorLength();
    }

    function calculateRollOverValue(
        address _owner
    ) public view returns (uint256) {
        uint256 scallingFactorX = s_scallingFactorX[s_lastRebaseCount[_owner]];
        uint256 scallingFactorY = subUnchecked(scallingFactorX);

        uint256 asset1Balance = s_devTokenArray[0].unScaledbalanceOf(_owner) /
            10 ** i_baseTokenDecimals;
        uint256 asset2Balance = s_devTokenArray[1].unScaledbalanceOf(_owner) /
            10 ** i_baseTokenDecimals;
        uint256 rollOverValue = (asset1Balance * scallingFactorX) +
            (asset2Balance * scallingFactorY);
        return rollOverValue;
    }

    function buyAsset() public payable nonReentrant {
        mint(0, msg.sender, msg.value);
        mint(1, msg.sender, msg.value);
        emit AssetBought(msg.sender, msg.value);
    }

    function withdrawAsset(uint256 _amount) public nonReentrant {
        if (s_lastRebaseCount[msg.sender] != getScallingFactorLength()) {
            applyRebase(msg.sender);
        }
        if (_amount > balanceOf(0, msg.sender))
            revert TokenFactory__InsufficientFund();
        burn(0, msg.sender, _amount);
        burn(1, msg.sender, _amount);
        payable(msg.sender).transfer(_amount);
        emit AssetWithdrawn(msg.sender, _amount);
    }

    function getBaseTokenAddress() public view returns (ERC20) {
        return i_baseToken;
    }

    function getPriceFeedAddress() public view returns (AggregatorV3Interface) {
        return i_priceFeed;
    }

    function getScallingFactor(uint256 index) public view returns (uint256) {
        return s_scallingFactorX[index];
    }

    function getScallingFactorLength() public view returns (uint256) {
        return s_scallingFactorX.length;
    }

    function getUserLastRebaseCount(
        address userAddress
    ) public view returns (uint256) {
        return s_lastRebaseCount[userAddress];
    }

    function getDevTokenAddress(uint256 index) public view returns (DevToken) {
        return s_devTokenArray[index];
    }
}
