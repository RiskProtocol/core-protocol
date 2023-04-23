// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DevToken.sol";
import "./../libraries/PriceFeed.sol";
import "hardhat/console.sol";

error TokenFactory__DepositMoreThanMax();
error TokenFactory__MintMoreThanMax();
error TokenFactory__WithdrawMoreThanMax();
error TokenFactory__RedeemMoreThanMax();
error TokenFactory__OnlyAssetOwner();

/**
 * @title ERC-20 Rebase Tokens
 * @author Okwuosa Chijioke
 * @notice Still under development
 * @dev This implements 2 ERC-20 tokens that will be minted in exactly the same proportion as the
 * underlying ERC-20 token transferred into the Factory contract.
 * The asset will be burned in exactly the same proportion when asked to redeem/withdrawal the underlying asset.
 * The contract will implement periodic rebalancing
 */
contract TokenFactory is ERC20, IERC4626, ReentrancyGuard, Ownable {
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;
    using SafeMath for uint256;

    // State variables
    uint256[] private scallingFactorX;
    DevToken[] private devTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    IERC20 private immutable baseToken;
    uint8 private immutable baseTokenDecimals;
    uint256 private immutable interval;
    uint256 private lastTimeStamp;

    modifier onlyAssetOwner(address assetOwner) {
        if (assetOwner != msg.sender) revert TokenFactory__OnlyAssetOwner();
        _;
    }

    constructor(
        IERC20 baseTokenAddress,
        address priceFeedAddress,
        uint256 rebaseInterval // in seconds
    ) ERC20("RiskProtocolVault", "RPK") {
        baseToken = IERC20(baseTokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : super.decimals();
        interval = rebaseInterval;
        lastTimeStamp = block.timestamp;
    }

    function initialize(DevToken token1, DevToken token2) external onlyOwner {
        devTokenArray.push(token1);
        devTokenArray.push(token2);
    }

    /**
     * @dev Attempts to fetch the asset decimals. A return value of false indicates that the attempt failed in some way.
     */
    function _tryGetAssetDecimals(
        IERC20 asset_
    ) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_)
            .staticcall(
                abi.encodeWithSelector(IERC20Metadata.decimals.selector)
            );
        if (success && encodedDecimals.length >= 32) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            if (returnedDecimals <= type(uint8).max) {
                return (true, uint8(returnedDecimals));
            }
        }
        return (false, 0);
    }

    /**
     * @dev Decimals are read from the underlying asset in the constructor and cached. If this fails (e.g., the asset
     * has not been created yet), the cached value is set to a default obtained by `super.decimals()` (which depends on
     * inheritance but is most likely 18). Override this function in order to set a guaranteed hardcoded value.
     * See {IERC20Metadata-decimals}.
     */
    function decimals()
        public
        view
        virtual
        override(IERC20Metadata, ERC20)
        returns (uint8)
    {
        return baseTokenDecimals;
    }

    /** @dev See {IERC4626-asset}. */
    function asset() public view virtual override returns (address) {
        return address(baseToken);
    }

    /** @dev See {IERC4626-totalAssets}. */
    function totalAssets() public view virtual override returns (uint256) {
        return baseToken.balanceOf(address(this));
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
        address
    ) public view virtual override returns (uint256) {
        return _isVaultCollateralized() ? type(uint256).max : 0;
    }

    /** @dev See {IERC4626-previewDeposit}. */
    function previewDeposit(
        uint256 assets
    ) public view virtual override returns (uint256) {
        return assets;
    }

    /** @dev See {IERC4626-deposit}. */
    function deposit(
        uint256 assets,
        address receiver
    ) public virtual override returns (uint256) {
        if (assets > maxDeposit(receiver))
            revert TokenFactory__DepositMoreThanMax();
        uint256 shares = previewDeposit(assets);
        SafeERC20.safeTransferFrom(baseToken, receiver, address(this), assets);
        updateUserLastRebaseCount(receiver);
        mint_(0, receiver, assets);
        mint_(1, receiver, assets);
        emit Deposit(msg.sender, receiver, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /** @dev See {IERC4626-previewMint}. */
    function previewMint(
        uint256 shares
    ) public view virtual override returns (uint256) {
        return shares;
    }

    /** @dev See {IERC4626-mint}.
     *
     * As opposed to {deposit}, minting is allowed even if the vault is in a state where the price of a share is zero.
     * In this case, the shares will be minted without requiring any assets to be deposited.
     */
    function mint(
        uint256 shares,
        address receiver
    ) public virtual override nonReentrant returns (uint256) {
        if (shares > maxMint(receiver)) revert TokenFactory__MintMoreThanMax();
        uint256 assets = previewMint(shares);
        _mint(receiver, assets);
        return assets;
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(
        address owner
    ) public view virtual override returns (uint256) {
        return maxAmountToWithdraw(owner);
    }

    /** @dev See {IERC4626-previewWithdraw}. */
    function previewWithdraw(
        uint256 assets
    ) public view virtual override returns (uint256) {
        return assets;
    }

    /** @dev See {IERC4626-withdraw}. */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override onlyAssetOwner(owner) returns (uint256) {
        // apply user pending rebase
        if (getUserLastRebaseCount(receiver) != getScallingFactorLength()) {
            applyRebase(receiver);
        }
        if (assets > maxWithdraw(owner))
            revert TokenFactory__WithdrawMoreThanMax();
        uint256 shares = previewWithdraw(assets);
        burn_(0, owner, assets);
        burn_(1, owner, assets);
        SafeERC20.safeTransfer(baseToken, receiver, assets);
        emit Withdraw(_msgSender(), receiver, owner, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner
    ) public view virtual override returns (uint256) {
        return maxAmountToWithdraw(owner);
    }

    /** @dev See {IERC4626-previewRedeem}. */
    function previewRedeem(
        uint256 shares
    ) public view virtual override returns (uint256) {
        return shares;
    }

    /** @dev See {IERC4626-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256) {
        if (shares > maxRedeem(owner)) revert TokenFactory__RedeemMoreThanMax();
        uint256 assets = previewRedeem(shares);
        withdraw(assets, receiver, owner);

        return assets;
    }

    function maxAmountToWithdraw(
        address owner
    ) public view virtual returns (uint256) {
        if (
            devTokenArray[0].balanceOf(owner) >
            devTokenArray[1].balanceOf(owner)
        ) {
            return devTokenArray[1].balanceOf(owner);
        } else {
            return devTokenArray[0].balanceOf(owner);
        }
    }

    /**
     * @dev Checks if vault is "healthy" in the sense of having assets backing the circulating shares.
     */
    function _isVaultCollateralized() private view returns (bool) {
        return totalAssets() > 0 || totalSupply() == 0;
    }

    function mint_(
        uint256 devTokenIndex,
        address receiver,
        uint256 amount
    ) private nonReentrant {
        uint256 assets = previewMint(amount);
        if (assets > maxMint(receiver)) revert TokenFactory__MintMoreThanMax();
        devTokenArray[devTokenIndex].mint(receiver, assets);
    }

    function burn_(
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
            return (10 ** decimals()) - scallingFactorX_;
        }
    }

    function rebase() external onlyOwner {
        uint256 rebasePrice = priceFeed.getPrice() / 10 ** decimals();
        uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
        uint256 divisor = rebasePrice.ceilDiv(2);
        scallingFactorX.push(((asset1Price * 10 ** decimals()) / 2) / divisor);
    }

    function applyRebase(address owner_) public {
        uint256 asset1ValueEth = devTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = devTokenArray[1].unScaledbalanceOf(owner_);

        uint256 rollOverValue = calculateRollOverValue(owner_);
        lastRebaseCount[owner_] = getScallingFactorLength();

        if (rollOverValue > asset1ValueEth) {
            mint_(0, owner_, (rollOverValue - asset1ValueEth));
        } else {
            burn_(0, owner_, (asset1ValueEth - rollOverValue));
        }

        if (rollOverValue > asset2ValueEth) {
            mint_(1, owner_, (rollOverValue - asset2ValueEth));
        } else {
            burn_(1, owner_, (asset2ValueEth - rollOverValue));
        }
    }

    function calculateRollOverValue(
        address owner_
    ) public view returns (uint256) {
        uint256 scallingFactorX_ = scallingFactorX[lastRebaseCount[owner_]];
        uint256 scallingFactorY = subUnchecked(scallingFactorX_);
        uint256 denominator = 10 ** decimals();

        uint256 asset1Balance = devTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2Balance = devTokenArray[1].unScaledbalanceOf(owner_);
        uint256 rollOverValue = ((asset1Balance * scallingFactorX_) +
            (asset2Balance * scallingFactorY)) / denominator;

        return rollOverValue;
    }

    function updateUserLastRebaseCount(address owner_) public {
        if (
            devTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            devTokenArray[0].unScaledbalanceOf(owner_) == 0
        ) {
            lastRebaseCount[owner_] = getScallingFactorLength();
        }
    }

    function getPriceFeedAddress() public view returns (AggregatorV3Interface) {
        return priceFeed;
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
