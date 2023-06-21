// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";
import "./TokenFactory.sol";

error SmartToken__DepositMoreThanMax();
error SmartToken__MintMoreThanMax();
error SmartToken__WithdrawMoreThanMax();
error SmartToken__RedeemMoreThanMax();
error SmartToken__ZeroDeposit();

abstract contract Vault is Initializable, IERC4626Upgradeable {
    TokenFactory private tokenFactory;

    modifier validateDepositAmount(uint256 assets, address receiver) {
        if (assets == 0) revert SmartToken__ZeroDeposit();
        if (assets > maxDeposit(receiver))
            revert SmartToken__DepositMoreThanMax();
        _;
    }

    function __VaultContract_init(
      address factoryAddress
    ) internal onlyInitializing {
        tokenFactory = TokenFactory(factoryAddress);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }


    function getTokenContract() public view returns (address) {
        return address(tokenFactory);
    }

    /** @dev See {IERC4626-convertToShares}. */
    function convertToShares(
        uint256 assets
    ) public view virtual override returns (uint256 shares) {
        return assets;
    }

    /** @dev See {IERC4626-convertToAssets}. */
    function convertToAssets(
        uint256 shares
    ) public view virtual override returns (uint256 assets) {
        return shares;
    }

    /** @dev See {IERC4626-maxDeposit}. */
    function maxDeposit(
        address account
    ) public view virtual override returns (uint256) {
        return type(uint256).max - tokenFactory.maxSharesOwned(account);
    }

    /** @dev See {IERC4626-previewDeposit}. */
    function previewDeposit(
        uint256 assets
    ) public view virtual override returns (uint256) {
        return assets;
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(
        address account
    ) public view virtual override returns (uint256) {
        return type(uint256).max - tokenFactory.maxSharesOwned(account);
    }

    /** @dev See {IERC4626-previewMint}. */
    function previewMint(
        uint256 shares
    ) public view virtual override returns (uint256) {
        return shares;
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(
        address owner_
    ) public view virtual override returns (uint256) {
        return tokenFactory.maxAmountToWithdraw(owner_);
    }

    /** @dev See {IERC4626-previewWithdraw}. */
    function previewWithdraw(
        uint256 assets
    ) public view virtual override returns (uint256) {
        return assets;
    }


    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner_
    ) public view virtual override returns (uint256) {
        return tokenFactory.maxAmountToWithdraw(owner_);
    }
}