// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "./../interfaces/IERC20Update.sol";
import "./TokenFactory.sol";
import "../external/ERC20Permit.sol";
import "./BaseContract.sol";

error DevToken__NotTokenFactory();
error DevToken__MethodNotAllowed();
error DevToken__DepositMoreThanMax();
error DevToken__MintMoreThanMax();
error DevToken__WithdrawMoreThanMax();
error DevToken__RedeemMoreThanMax();
error DevToken__OnlyAssetOwner();
error DevToken__ZeroDeposit();

contract DevToken is ERC20Permit, BaseContract, IERC4626, ReentrancyGuard {
    TokenFactory private immutable tokenFactory;
    IERC20Update private immutable underlyingToken;

    modifier onlyTokenFactory() {
        if (_msgSender() != address(tokenFactory))
            revert DevToken__NotTokenFactory();
        _;
    }

    modifier onlyAssetOwner(address assetOwner) {
        if (assetOwner != _msgSender()) revert DevToken__OnlyAssetOwner();
        _;
    }

    modifier validateDepositAmount(uint256 assets, address receiver) {
        if (assets == 0) revert DevToken__ZeroDeposit();
        if (assets > maxDeposit(receiver))
            revert DevToken__DepositMoreThanMax();
        _;
    }

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address factoryAddress,
        address[] memory defaultOperators,
        address sanctionsContract_
    )
        ERC777(tokenName, tokenSymbol, defaultOperators)
        ERC20Permit(tokenName)
        BaseContract(sanctionsContract_)
    {
        tokenFactory = TokenFactory(factoryAddress);
        underlyingToken = tokenFactory.getBaseToken();
    }

    function mintAsset(
        address receiver,
        uint256 amount
    ) public onlyTokenFactory {
        _mint(receiver, amount, "", "");
    }

    /**
     * @dev See {ERC20-decimals}.
     *
     * Always returns 18, as per the
     * [ERC777 EIP](https://eips.ethereum.org/EIPS/eip-777#backward-compatibility).
     */
    function decimals()
        public
        pure
        virtual
        override(ERC777, IERC20Metadata)
        returns (uint8)
    {
        return super.decimals();
    }

    /**
     * @dev See {IERC777-name}.
     */
    function name()
        public
        view
        virtual
        override(ERC777, IERC20Metadata)
        returns (string memory)
    {
        return super.name();
    }

    /**
     * @dev See {IERC777-symbol}.
     */
    function symbol()
        public
        view
        virtual
        override(ERC777, IERC20Metadata)
        returns (string memory)
    {
        return super.symbol();
    }

    /**
     * @dev See {IERC777-totalSupply}.
     */
    function totalSupply()
        public
        view
        virtual
        override(ERC777, IERC20)
        returns (uint256)
    {
        return super.totalSupply();
    }

    /** @dev See {IERC777-burn}. */
    function burn(
        uint256 /* amount */,
        bytes memory /* data */
    ) public pure override(ERC777) {
        revert DevToken__MethodNotAllowed();
    }

    /** @dev See {IERC777-operatorBurn}. */
    function operatorBurn(
        address /* account */,
        uint256 /* amount */,
        bytes memory /* data */,
        bytes memory /* operatorData */
    ) public pure override {
        revert DevToken__MethodNotAllowed();
    }

    function devBurn(address account, uint256 amount) public onlyTokenFactory {
        _burn(account, amount, "", "");
    }

    /** @dev See {IERC777-transfer}. */
    function transfer(
        address recipient,
        uint256 amount
    )
        public
        override(ERC777, IERC20)
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(_msgSender())
        returns (bool)
    {
        handlePendingRebase(_msgSender(), recipient);
        super.transfer(recipient, amount);
        return true;
    }

    function devTransfer(
        address recipient,
        uint256 amount
    ) external onlyTokenFactory {
        super.transfer(recipient, amount);
    }

    /**
     * @dev See {IERC777-send}.
     *
     * Also emits a {IERC20-Transfer} event for ERC20 compatibility.
     */
    function send(
        address recipient,
        uint256 amount,
        bytes memory data
    )
        public
        override
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(_msgSender())
    {
        handlePendingRebase(_msgSender(), recipient);
        super.send(recipient, amount, data);
    }

    /** @dev See {IERC777-balanceOf}. */
    function balanceOf(
        address account
    ) public view override(ERC777, IERC20) returns (uint256) {
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
        override(ERC777, IERC20)
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
        address
    ) public view virtual override returns (uint256) {
        return (type(uint256).max);
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
    ) public validateDepositAmount(assets, receiver) returns (uint256) {
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
    function maxMint(address) public view virtual override returns (uint256) {
        return (type(uint256).max);
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
    ) public virtual override returns (uint256) {
        if (shares > maxMint(receiver)) revert DevToken__MintMoreThanMax();

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
            revert DevToken__WithdrawMoreThanMax();

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
        if (shares > maxRedeem(owner_)) revert DevToken__RedeemMoreThanMax();
        uint256 assets = previewRedeem(shares);
        tokenFactory._withdraw(_msgSender(), receiver, owner_, assets, shares);

        return assets;
    }
}
