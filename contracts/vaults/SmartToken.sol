// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC4626Upgradeable.sol";

import "./../interfaces/IERC20Update.sol";
import "./../lib/ERC20/ERC20Upgradeable.sol";
import "./../lib/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./TokenFactory.sol";
import "./BaseContract.sol";

error SmartToken__NotTokenFactory();
error SmartToken__MethodNotAllowed();
error SmartToken__DepositMoreThanMax();
error SmartToken__MintMoreThanMax();
error SmartToken__WithdrawMoreThanMax();
error SmartToken__RedeemMoreThanMax();
error SmartToken__OnlyAssetOwner();
error SmartToken__ZeroDeposit();

contract SmartToken is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    BaseContract,
    IERC4626Upgradeable,
    ReentrancyGuardUpgradeable
{
    TokenFactory private tokenFactory;
    IERC20Update private underlyingToken;

    modifier onlyTokenFactory() {
        _onlyTokenFactory();
        _;
    }

    modifier onlyAssetOwner(address assetOwner) {
        _onlyAssetOwner(assetOwner);
        _;
    }

    modifier validateDepositAmount(uint256 assets, address receiver) {
        _validateDepositAmount(assets, receiver);
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory tokenName,
        string memory tokenSymbol,
        address factoryAddress,
        address sanctionsContract_
    ) public initializer {
        //initialize deriving contracts
        __ERC20_init(tokenName, tokenSymbol);
        __ERC20Permit_init(tokenName);
        __BaseContract_init(sanctionsContract_);
        __Ownable_init(); //note: this is required as we'd need to ensure only owner can upgrade
        __UUPSUpgradeable_init();
        tokenFactory = TokenFactory(factoryAddress);
        underlyingToken = tokenFactory.getBaseToken();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function mintAsset(
        address receiver,
        uint256 amount
    ) external onlyTokenFactory {
        _mint(receiver, amount);
    }

    function burn(address account, uint256 amount) external onlyTokenFactory {
        _burn(account, amount);
    }

    /** @dev See {IERC20-transfer}. */
    function transfer(
        address recipient,
        uint256 amount
    )
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        stopTransfer
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(_msgSender())
        returns (bool)
    {
        handlePendingRebase(_msgSender(), recipient);
        super.transfer(recipient, amount);
        return true;
    }

    function smartTransfer(
        address recipient,
        uint256 amount
    ) external onlyTokenFactory {
        super.transfer(recipient, amount);
    }

    function smartTreasuryTransfer(
        address treasuryAddress,
        uint256 amount
    ) external onlyTokenFactory {
        super.treasuryTransfer(treasuryAddress, amount);
    }

    /** @dev See {IERC20-balanceOf}. */
    function balanceOf(
        address account
    )
        public
        view
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (uint256)
    {
        if (hasPendingRebase(account)) {
            return tokenFactory.calculateRollOverValue(account);
        } else {
            return unScaledbalanceOf(account);
        }
    }

    function unScaledbalanceOf(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    function hasPendingRebase(address account) public view returns (bool) {
        return
            tokenFactory.getUserLastRebaseCount(account) !=
            tokenFactory.getScallingFactorLength();
    }

    function getTokenFactory() public view returns (address) {
        return address(tokenFactory);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        stopTransfer
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(sender)
        returns (bool)
    {
        handlePendingRebase(sender, recipient);
        return super.transferFrom(sender, recipient, amount);
    }

    function handlePendingRebase(address sender, address receiver) public {
        if (hasPendingRebase(sender)) {
            tokenFactory.applyRebase(sender);
        }
        tokenFactory.updateUserLastRebaseCount(receiver);
        if (hasPendingRebase(receiver)) {
            tokenFactory.applyRebase(receiver);
        }
    }

    /** @dev See {IERC4626-asset}. */
    function asset() public view virtual override returns (address) {
        return address(underlyingToken);
    }

    /** @dev See {IERC4626-totalAssets}. */
    function totalAssets() public view virtual override returns (uint256) {
        return underlyingToken.balanceOf(address(tokenFactory));
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

    /** @dev See {IERC4626-deposit}. */
    function deposit(
        uint256 assets,
        address receiver
    )
        public
        virtual
        override
        stopDeposit
        validateDepositAmount(assets, receiver)
        returns (uint256)
    {
        uint256 shares = previewDeposit(assets);
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-deposit}. */
    function depositWithPermit(
        uint256 assets,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        public
        stopDeposit
        validateDepositAmount(assets, receiver)
        returns (uint256)
    {
        uint256 shares = previewDeposit(assets);
        underlyingToken.permit(
            _msgSender(),
            address(tokenFactory),
            shares,
            deadline,
            v,
            r,
            s
        );
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return shares;
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

    /** @dev See {IERC4626-mint}.
     *
     * As opposed to {deposit}, minting is allowed even if the vault is in a state where the price of a share is zero.
     * In this case, the shares will be minted without requiring any assets to be deposited.
     */
    function mint(
        uint256 shares,
        address receiver
    ) public virtual override stopDeposit returns (uint256) {
        if (shares > maxMint(receiver)) revert SmartToken__MintMoreThanMax();

        uint256 assets = previewMint(shares);
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return assets;
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

    /** @dev See {IERC4626-withdraw}. */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner_
    )
        public
        virtual
        override
        stopWithdraw
        onlyAssetOwner(owner_)
        nonReentrant
        returns (uint256)
    {
        // apply user pending rebase
        if (
            tokenFactory.getUserLastRebaseCount(receiver) !=
            tokenFactory.getScallingFactorLength()
        ) {
            tokenFactory.applyRebase(receiver);
        }
        if (assets > maxWithdraw(owner_))
            revert SmartToken__WithdrawMoreThanMax();

        uint256 shares = previewWithdraw(assets);
        tokenFactory._withdraw(_msgSender(), receiver, owner_, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner_
    ) public view virtual override returns (uint256) {
        return tokenFactory.maxAmountToWithdraw(owner_);
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
        address owner_
    )
        public
        virtual
        override
        stopWithdraw
        onlyAssetOwner(owner_)
        nonReentrant
        returns (uint256)
    {
        // apply user pending rebase
        if (
            tokenFactory.getUserLastRebaseCount(receiver) !=
            tokenFactory.getScallingFactorLength()
        ) {
            tokenFactory.applyRebase(receiver);
        }
        if (shares > maxRedeem(owner_)) revert SmartToken__RedeemMoreThanMax();
        uint256 assets = previewRedeem(shares);
        tokenFactory._withdraw(_msgSender(), receiver, owner_, assets, shares);

        return assets;
    }

    /**
    Helpers for modifiers to reduce size */
    function _onlyTokenFactory() private view {
        if (_msgSender() != address(tokenFactory))
            revert SmartToken__NotTokenFactory();
    }

    function _onlyAssetOwner(address assetOwner) private view {
        if (assetOwner != _msgSender()) revert SmartToken__OnlyAssetOwner();
    }

    function _validateDepositAmount(
        uint256 assets,
        address receiver
    ) private view {
        if (assets == 0) revert SmartToken__ZeroDeposit();
        if (assets > maxDeposit(receiver))
            revert SmartToken__DepositMoreThanMax();
    }
}
