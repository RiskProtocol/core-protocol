// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/ISmartToken.sol";

/**
@note FYI:
We make use of 0x Swap API to split and swap in one atomic tx

Sample 0X api call:
curl --location 'https://sepolia.api.0x.org/swap/v1/quote?sellToken=0x177Bf72D4aD8EBD0A2CE23180FeD33B94B5CCc25&buyToken=0x4b9420e43A9aA972b64bB3bA3B3b56E8aeD508de&sellAmount=1000000000000000000' \
--header '0x-api-key: c77ba4f3-e8f2-498b-9368-0b46ff77exxx'

The response will contain the following fields:
{
  "chainId": 1,
  "price": "0.000000000000000001",
  "guaranteedPrice": "0.000000000000000001",
  "to": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  "data": "0x415565b0000000000000000000000000...",
  "value": "0",
  "gas": 1000000,
  "estimatedGas": 100000,
  "gasPrice": "1000000000",
  "protocolFee": "0",
  "minimumProtocolFee": "0",
  "buyTokenAddress": "0x4b9420e43A9aA972b64bB3bA3B3b56E8aeD508de",
  "sellTokenAddress": "0x177Bf72D4aD8EBD0A2CE23180FeD33B94B5CCc25",
  "value": "1000000000000000000",
  "allowanceTarget": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
  "priceImpact": "0.000000000000000001",
  "liquiditySource": "Uniswap_V3",
  "sources": [
    {
      "name": "Uniswap_V3",
      "proportion": "1"
    }
  ],
  "orders": [],
  "expiry": 1634020000,
  "fillData": {
    "tokenAddressPath": [
      "0x177Bf72D4aD8EBD0A2CE23180FeD33B94B5CCc25",
      "0x4b9420e43A9aA972b64bB3bA3B3b56E8aeD508de"
    ],
    "router": "0xe592427a0aece92de3edee1f18e0157c05861564",
    "allowanceTarget": "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    "sources": [
      {
        "name": "Uniswap

/////
The returned values are used to call the swap function on the 0x contract
*/
contract AtomicTransaction is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    ISmartToken private smartTokenX;
    ISmartToken private smartTokenY;
    IERC20 private underlying;

    error AtomicTransaction_SlippageError();
    error AtomicTransaction_SwapError();
    error AtomicTransaction_InvalidBalance();
    error AtomicTransaction_InvalidParams();

    event ReceivedEther(address sender, uint256 amount);
    event DrainContract();
    event SplitAndSwap(
        address receiver,
        uint256 depositAmount,
        uint256 swapAmount
    );
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    function initialize(
        address _tokenX,
        address _tokenY,
        address _underlying,
        address _owner
    ) public initializer {
        __Ownable_init();
        transferOwnership(_owner);
        __UUPSUpgradeable_init();
        //smartokens
        smartTokenX = ISmartToken(_tokenX);
        smartTokenY = ISmartToken(_tokenY);
        underlying = IERC20(_underlying);
    }

    function _authorizeUpgrade(
        address
    ) internal override(UUPSUpgradeable) onlyOwner {}

    receive() external payable {
        emit ReceivedEther(_msgSender(), msg.value);
    }

    function drain() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
        SafeERC20.safeTransfer(
            smartTokenX,
            owner(),
            smartTokenX.balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            smartTokenY,
            owner(),
            smartTokenY.balanceOf(address(this))
        );
        SafeERC20.safeTransfer(
            underlying,
            owner(),
            underlying.balanceOf(address(this))
        );
        emit DrainContract();
    }

    function deposit(uint256 assets) private {
        uint256 allowed = underlying.allowance(_msgSender(), address(this));
        if (allowed < assets) {
            revert AtomicTransaction_InvalidBalance();
        }
        SafeERC20.safeTransferFrom(
            underlying,
            _msgSender(),
            address(this),
            assets
        );

        SafeERC20.safeApprove(
            underlying,
            address(smartTokenX.getTokenFactory()),
            assets
        );
        smartTokenX.deposit(assets, _msgSender());
    }

    //// Deposit and Swap
    function splitAndSwap(
        // The `sellTokenAddress` field from the API response.
        IERC20 sellToken,
        // The `buyTokenAddress` field from the API response.
        IERC20 buyToken,
        // The `allowanceTarget` field from the API response.
        address spender,
        // The `to` field from the API response.
        address payable swapTarget, //0x Contract
        // The `data` field from the API response.
        bytes calldata swapCallData, //swap data
        //including slippage
        uint256 expectedAmount,
        //amount of underlying to deposit
        uint256 depositAmount,
        //anount of sell token to sell
        uint256 sellAmount
    ) external payable nonReentrant returns (bool) {
        if (
            expectedAmount == 0 ||
            depositAmount == 0 ||
            sellAmount == 0 ||
            address(sellToken) == address(0) ||
            address(sellToken) == address(0) ||
            address(buyToken) == address(0)
        ) {
            revert AtomicTransaction_InvalidParams();
        }
        ///user does a depoist of underlying assets
        // @note we assume user has already approved this contract to spend the underlying
        deposit(depositAmount);

        // Track our balance of the buyToken of sell Token before the swap.
        uint256 initialAmount = buyToken.balanceOf(address(this));
        //@note User should approve the contract to spend the sell token
        SafeERC20.safeTransferFrom(
            sellToken,
            _msgSender(),
            address(this),
            sellAmount
        );

        SafeERC20.safeApprove(sellToken, spender, sellAmount);
        // Call the encoded swap function call on the contract at `swapTarget`,
        // passing along any ETH attached to this function call to cover protocol fees.
        (bool success, ) = swapTarget.call{value: msg.value}(swapCallData);
        if (!success) {
            revert AtomicTransaction_SwapError();
        }

        // Use our current buyToken balance to determine how much we've bought.
        uint256 boughtAmount = buyToken.balanceOf(address(this)) -
            initialAmount;

        if (boughtAmount < expectedAmount) {
            // If we didn't buy enough, revert the transaction. Slippage tolerance
            revert AtomicTransaction_SlippageError();
        }

        //transfer bought tokens to user
        // @note: https://0x.canny.io/request-features/p/support-for-receiving-swapped-tokens-on-another-wallet
        SafeERC20.safeTransfer(buyToken, _msgSender(), boughtAmount);

        emit SplitAndSwap(_msgSender(), depositAmount, boughtAmount);
        //if everything went through
        return true;
    }
}
