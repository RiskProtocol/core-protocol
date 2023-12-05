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

/// @title SmartToken Contract ERC20/4626  compatible Tokens (RiskON/RiskOFF)
/// @dev This is a rebalancing token, part of Risk Protocol's system
/// The same contract is used by both RiskON and RiskOFF
/// Whenever a user deposit a unit of underlying in the Vault(TokenFactory), the user
/// is expected to recieve a unit of both RiskON and RiskOFF.
/// At every rebalance operation, the user RiskOn/OFF balances will be aligned with respect to
/// the rebalance math.
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
    //errors
    error SmartToken__NotTokenFactory();
    error SmartToken__MethodNotAllowed();
    error SmartToken__DepositMoreThanMax();
    error SmartToken__MintMoreThanMax();
    error SmartToken__WithdrawMoreThanMax();
    error SmartToken__RedeemMoreThanMax();
    error SmartToken__OnlyAssetOwner();
    error SmartToken__ZeroDeposit();
    error SmartToken__InsufficientUnderlying();

    /// @notice The tokenFactory instance
    TokenFactory private tokenFactory;
    /// @notice The underlyingToken instance
    IERC20Update private underlyingToken;
    bool private isX;

    /// @dev Ensures that the function is only callable by the TokenFactory contract.
    /// Calls the helper function `_onlyTokenFactory` to check the caller.
    modifier onlyTokenFactory() {
        _onlyTokenFactory();
        _;
    }
    /// @dev Ensures that the function is only callable by the token owner/holder.
    /// Calls the helper function `_onlyAssetOwner` to check the caller against the provided token owner/holder address.
    /// @param assetOwner The address of the token owner/holder.
    modifier onlyAssetOwner(address assetOwner) {
        _onlyAssetOwner(assetOwner);
        _;
    }
    /// @dev Validates the deposit amount to ensure it is not 0 or more than the receiver can get.
    /// Calls the helper function `_validateDepositAmount` to check the deposit amount and receiver.
    /// @param assets The amount of token to deposit.
    /// @param receiver The address receiving the deposit.
    modifier validateDepositAmount(uint256 assets, address receiver) {
        _validateDepositAmount(assets, receiver);
        _;
    }
    //todo
    modifier insufficientUnderlying() {
        if (tokenFactory.insufficientUnderlying()) {
            revert SmartToken__InsufficientUnderlying();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes(replacement for the constructor) the SmartToken contract with specified parameters.
    /// @dev This function sets up the initial state of the SmartToken contract. Callable only once.
    /// It initializes inherited contracts and sets the initial values for `tokenFactory` and `underlyingToken`.
    /// @param tokenName The name of the token.
    /// @param tokenSymbol The symbol of the token.
    /// @param factoryAddress The address of the TokenFactory contract.
    /// @param sanctionsContract_ The address of the SanctionsList contract.
    function initialize(
        string memory tokenName,
        string memory tokenSymbol,
        address factoryAddress,
        address sanctionsContract_,
        bool isX_ //is this token X or Y?
    ) public initializer {
        //initialize deriving contracts
        __ERC20_init(tokenName, tokenSymbol);
        __ERC20Permit_init(tokenName);
        __BaseContract_init(sanctionsContract_);
        //@note This is required as we'd need to ensure only owner can upgrade
        __Ownable_init();
        __UUPSUpgradeable_init();
        tokenFactory = TokenFactory(factoryAddress);
        underlyingToken = tokenFactory.getBaseToken();
        isX = isX_;
    }

    /// @notice Authorizes an upgrade to a new contract implementation.
    /// @dev This function can only be called by the contract owner.
    /// It overrides the `_authorizeUpgrade` function from the `UUPSUpgradeable`
    /// contract to include the `onlyOwner` modifier, ensuring only the owner can authorize upgrades.
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Mints the specified amount of tokens to the receiver.
    /// @dev This function can only be called by the TokenFactory contract.
    /// @param receiver The address of the account that will receive the minted tokens.
    /// @param amount The amount of tokens to mint.
    function mintAsset(
        address receiver,
        uint256 amount
    ) external onlyTokenFactory {
        //erc20 mint
        _mint(receiver, amount);
    }

    /// @notice Burns the specified amount of tokens from the account.
    /// @dev This function can only be called by the TokenFactory contract.
    /// @param account The address of the account from which tokens will be burned.
    /// @param amount The amount of tokens to burn.
    function burn(address account, uint256 amount) external onlyTokenFactory {
        //erc20 burn
        _burn(account, amount);
    }

    /// @notice Transfers the specified amount of tokens to the specified recipient.
    /// @dev Overrides the `transfer` function from `ERC20Upgradeable` and `IERC20Upgradeable` contracts.
    /// If the sender or receiver has a pending rebalance, it is handled before the transfer.
    /// This function can only be called when transfers are not stopped,
    /// and neither the sender nor the recipient are on the sanctions list.
    /// @param recipient The address to which tokens will be transferred.
    /// @param amount The amount of tokens to transfer.
    /// @return Always return true unless reverted
    function transfer(
        address recipient,
        uint256 amount
    )
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        stopTransfer
        insufficientUnderlying
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(_msgSender())
        returns (bool)
    {
        handlePendingRebalance(_msgSender(), recipient);

        uint256[4] memory bals = tokenFactory.getUserRecords(
            _msgSender(),
            recipient
        );

        bool result = super.transfer(recipient, amount);

        tokenFactory.transferRecords(
            _msgSender(),
            recipient,
            isX,
            amount,
            bals[0],
            bals[1],
            bals[2],
            bals[3]
        );

        return result;
    }

    function smartTreasuryTransfer(
        address treasuryAddress,
        uint256 amount
    ) external onlyTokenFactory {
        tokenFactory.updateRecord(isX, amount);

        super.treasuryTransfer(treasuryAddress, amount);
    }

    function smartBalanceAdjust(
        address account,
        uint256 amount
    ) external onlyTokenFactory {
        //update the internal record
        tokenFactory.updateRecord(isX, account, amount);

        super.balanceAdjust(account, amount);
    }

    /// @notice Returns the balance of the specified account
    /// @dev Overrides the `balanceOf` function from the inherited `ERC20Upgradeable` and `IERC20Upgradeable` contracts.
    /// If the account has a pending rebalance, the function calculates the calculated balance
    /// post rebalance using the 'calculateRollOverValue' method.
    /// Otherwise, it returns the erc20 balance using `unScaledbalanceOf` method.
    /// @param account The address of the account whose balance will be retrieved.
    /// @return The balance of the specified account.
    function balanceOf(
        address account
    )
        public
        view
        override(ERC20Upgradeable, IERC20Upgradeable)
        returns (uint256)
    {
        if (hasPendingRebalance(account)) {
            (uint256 asset1Units, uint256 asset2Units) = tokenFactory
                .calculateRollOverValue(account);

            if (isX) {
                return asset1Units;
            }
            return asset2Units;
        } else {
            return unScaledbalanceOf(account);
        }
    }

    /// @notice Returns the unscaled(unaffected by pending rebalances) balance of the specified account.
    /// @dev This function returns the ERC20 balance(unaffected by pending rebalances) of the account.
    /// @param account The address of the account.
    /// @return The unscaled(unaffected by pending rebalances) balance of the specified account.
    function unScaledbalanceOf(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    /// @notice Checks if the specified account has a pending rebalance.
    /// @dev Compares the account's last rebalance count with the current scalingfactor length
    /// to determine if a rebalance is pending.
    /// @param account The address of the account
    /// @return A boolean value indicating whether the specified account has a pending rebalance.
    function hasPendingRebalance(address account) public view returns (bool) {
        return
            //'getUserLastRebalanceCount' returns the amount of rebalance applied to account
            tokenFactory.getUserLastRebalanceCount(account) !=
            tokenFactory.getRebalanceNumber();
    }

    /// @notice Retrieves the address of the Vault (TokenFactory) contract.
    /// @dev This function casts the `tokenFactory` variable to an address and returns it.
    /// @return The address of the Vault (TokenFactory) contract.
    function getTokenFactory() public view returns (address) {
        return address(tokenFactory);
    }

    /// @notice Transfers the specified amount of tokens from the sender to the recipient.
    /// @dev Overrides the `transferFrom` function from the inherited `ERC20Upgradeable` and
    /// `IERC20Upgradeable` contracts.
    /// If the sender or recipient has a pending rebalance, it is handled before the transfer.
    /// This function can only be called when transfers are not stopped, and neither the sender
    /// nor the recipient are on the sanctions list.
    /// @param sender The address from which tokens will be transferred.
    /// @param recipient The address to which tokens will be transferred.
    /// @param amount The amount of tokens to transfer.
    /// @return A boolean value indicating whether the operation succeeded.
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        override(ERC20Upgradeable, IERC20Upgradeable)
        stopTransfer
        insufficientUnderlying
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(sender)
        returns (bool)
    {
        handlePendingRebalance(sender, recipient);
        uint256[4] memory bals = tokenFactory.getUserRecords(sender, recipient);
        bool result = super.transferFrom(sender, recipient, amount);
        tokenFactory.transferRecords(
            sender,
            recipient,
            isX,
            amount,
            bals[0],
            bals[1],
            bals[2],
            bals[3]
        );

        return result;
    }

    /// @notice Handles pending rebalances for the sender and receiver addresses.
    /// @dev This function checks if the sender or receiver has a pending rebalance and applies the rebalance if needed.
    /// @param sender The address of the sender involved in a transfer operation.
    /// @param receiver The address of the receiver involved in a transfer operation.
    function handlePendingRebalance(address sender, address receiver) public {
        if (hasPendingRebalance(sender)) {
            //The 'applyRebalance' method on the Vault(TokenFactory) is called
            tokenFactory.applyRebalance(sender);
        }
        //if the receiver is a new user to the system, we update his rebalance count
        //before proceeding
        tokenFactory.updateUserLastRebalanceCount(receiver);
        if (hasPendingRebalance(receiver)) {
            //The 'applyRebalance' method on the Vault(TokenFactory) is called
            tokenFactory.applyRebalance(receiver);
        }
    }

    /// @notice Retrieves the address of the underlying token.
    /// @dev It overrides the `asset` function from the `IERC4626Upgradeable` interface.
    /// @return The address of the underlying token.
    function asset() public view virtual override returns (address) {
        return address(underlyingToken);
    }

    /// @notice Retrieves the total amount of assets held by the TokenFactory.
    /// @dev It overrides the `totalAssets` function from the `IERC4626Upgradeable` interface.
    /// @return The total amount of assets held by the Vault(TokenFactory).
    function totalAssets() public view virtual override returns (uint256) {
        //queries the balance of the underlying token held by Vault(TokenFactory).
        return underlyingToken.balanceOf(address(tokenFactory));
    }

    /// @notice Converts a specified amount of  underlying assets to shares(RiskOn/Off).
    /// @dev It overrides the `convertToShares` function from the `IERC4626Upgradeable` interface.
    /// @param assets The amount of assets to convert to shares.
    /// @return shares The amount of shares(RiskOn/Off) for the amount of assets.
    function convertToShares(
        uint256 assets
    ) public view virtual override returns (uint256 shares) {
        //returns the input assets value as the number of shares. Conversion is 1:1.
        return assets;
    }

    /// @notice Converts a specified amount of shares(RiskOn/Off) to underlying assets.
    /// @dev It overrides the `convertToAssets` function from the `IERC4626Upgradeable` interface.
    /// @param shares The amount of shares to convert to assets.
    /// @return assets The amount of assets for the amount of shares(RiskOn/Off).
    function convertToAssets(
        uint256 shares
    ) public view virtual override returns (uint256 assets) {
        //returns the input shares value as the number of assets. Conversion is 1:1.
        return shares;
    }

    /// @notice Calculates the maximum amount of assets that can be deposited by a specific account.
    /// @dev It overrides the `maxDeposit` function from the `IERC4626Upgradeable` interface.
    /// @param account The address of the account for which to calculate the maximum deposit amount.
    /// @return The maximum amount of assets that can be deposited by the account.
    function maxDeposit(
        address account
    ) public view virtual override returns (uint256) {
        //difference between the maximum uint256 value and the maximum shares owned by the account
        return type(uint256).max - tokenFactory.maxSharesOwned(account);
    }

    /// @notice Provides a preview of the number of shares(RiskOn/Off) that would be received for a amount of assets.
    /// @dev It overrides the `previewDeposit` function from the `IERC4626Upgradeable` interface.
    /// @param assets The amount of assets to preview the deposit.
    /// @return The amount of shares(RiskOn/Off) for the specified amount of assets.
    function previewDeposit(
        uint256 assets
    ) public view virtual override returns (uint256) {
        //returns the input assets value as the number of shares. Conversion is 1:1.
        return assets;
    }

    /// @notice Deposits an amount of underlying assets, crediting the shares(RiskON/OFF) to the receiver.
    /// @dev It overrides the `deposit` function from the `IERC4626Upgradeable` interface.
    /// The `stopDeposit` circuit breaker can be used to freeze deposits and `validateDepositAmount` modifier to
    /// validate the deposit amount
    /// @param assets The amount of assets to deposit.
    /// @param receiver The receiver address.
    /// @return The amount of shares(RiskOn/Off) the receiver will get.
    function deposit(
        uint256 assets,
        address receiver
    )
        public
        virtual
        override
        stopDeposit
        insufficientUnderlying
        validateDepositAmount(assets, receiver)
        returns (uint256)
    {
        //Use 'previewDeposit' method to get the converted amount of underlying assets to shares
        uint256 shares = previewDeposit(assets);
        //calls the '_deposit' method of Vault(tokenFactory) to deposit the underlying. For more info please checkout
        // the tokenFactory contract
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return shares;
    }

    /// @notice Deposits an amount of underlying assets, crediting the shares(RiskON/OFF) to the receiver
    /// with an EIP-2612 permit for approval.
    /// @dev  It overrides the `deposit` function from the `IERC4626Upgradeable` interface.
    /// The `stopDeposit` circuit breaker can be used to freeze deposits and `validateDepositAmount` modifier to
    /// validate the deposit amount then calls `permit` on the `underlyingToken` to set the allowance,
    /// @param assets The amount of underlying assets to deposit.
    /// @param receiver The address of the receiver
    /// @param deadline The deadline for the permit signature to be valid, as a UNIX timestamp.
    /// @param v The recovery byte of the signature.
    /// @param r part of the ECDSA signature pair.
    /// @param s part of the ECDSA signature pair.
    /// @return The amount of shares(RiskOn/Off) the receiber will get
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
        insufficientUnderlying
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
        //calls the '_deposit' method of Vault(tokenFactory) to deposit the underlying. For more info please checkout
        // the tokenFactory contract
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return shares;
    }

    /// @notice Calculates the maximum amount of shares(RiskOn/Off) that can be minted for a user.
    /// @dev It overrides the `maxMint` function from the `IERC4626Upgradeable` interface.
    /// @param account The address of user for which to calculate the maximum mintable shares(RiskOn/Off).
    /// @return The maximum amount of shares(RiskOn/Off) that can be minted for the user.
    function maxMint(
        address account
    ) public view virtual override returns (uint256) {
        //difference between the maximum uint256 value and the maximum shares owned by the account
        return type(uint256).max - tokenFactory.maxSharesOwned(account);
    }

    /// @notice Provides a preview of the amount of underlying assets required to mint a number of shares(RiskOn/Off).
    /// @dev It overrides the `previewMint` function from the `IERC4626Upgradeable` interface.
    /// @param shares The number of shares(RiskOn/Off) to mint.
    /// @return The amount of underlying assets required to mint the specified number of shares(RiskOn/Off).
    function previewMint(
        uint256 shares
    ) public view virtual override returns (uint256) {
        //returns the input shares value as the number of shares. Conversion is 1:1.
        return shares;
    }

    /// @notice mints an amount of shares, crediting the shares(RiskON/OFF) to the receiver.
    /// @dev It overrides the `deposit` function from the `IERC4626Upgradeable` interface.
    /// The `stopDeposit` circuit breaker can be used to freeze minting. As opposed to {deposit},
    /// minting is allowed even if the vault is in a state where the price of a share is zero.
    /// In this case, the shares will be minted without requiring any assets to be deposited.
    /// @param shares The amount of shares(RiskON/OFF) to mint.
    /// @param receiver The receiver address.
    /// @return The amount of assets that were deposited to mint the specified number of shares(RiskON/OFF).
    function mint(
        uint256 shares,
        address receiver
    )
        public
        virtual
        override
        stopDeposit
        insufficientUnderlying
        returns (uint256)
    {
        if (shares > maxMint(receiver)) revert SmartToken__MintMoreThanMax();
        //Use 'previewMint' method to get the converted amount of shares to underlying
        uint256 assets = previewMint(shares);
        //calls the '_deposit' method of Vault(tokenFactory) to deposit the underlying. For more info please checkout
        // the tokenFactory contract
        tokenFactory._deposit(_msgSender(), receiver, assets, shares);

        return assets;
    }

    /// @notice Calculates the maximum amount of underlying assets that can be withdrawn by a specified owner.
    /// @dev  It overrides the `maxWithdraw` function from the `IERC4626Upgradeable` interface.
    /// @param owner_ The address of the owner for which to calculate the maximum underlying withdrawable assets.
    /// @return The maximum amount of assets that can be withdrawn by the specified owner.
    function maxWithdraw(
        address owner_
    ) public view virtual override returns (uint256) {
        //for more info, please check the 'maxAmountToWithdraw' method on the Vault(tokenFactory)
        return tokenFactory.maxAmountToWithdraw(owner_);
    }

    /// @notice Provide a preview of number of shares(RiskOn/Off) required to withdraw an amount of underlying assets.
    /// @dev It overrides the `previewWithdraw` function from the `IERC4626Upgradeable` interface.
    /// @param assets The amount of assets to withdraw.
    /// @return The number of shares(RiskOn/Off) required to withdraw the specified amount of assets.
    function previewWithdraw(
        uint256 assets
    ) public view virtual override returns (uint256) {
        //Conversion Ration 1:1
        return assets;
    }

    /// @notice Allows an owner to withdraw a specified amount of underlying assets, transferring them to a receiver.
    /// @dev This function overrides the `withdraw` function from the `IERC4626Upgradeable` interface,
    /// and is guarded by the `stopWithdraw`, `onlyAssetOwner`, and `nonReentrant` modifiers.
    /// @param assets The amount of underlying assets to withdraw.
    /// @param receiver The address to which the assets should be transferred.
    /// @param owner_ The address of the owner making the withdrawal.
    /// @return The number of shares(RiskON/OFF) corresponding to the withdrawn assets.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner_
    )
        public
        virtual
        override
        stopWithdraw
        insufficientUnderlying
        onlyAssetOwner(owner_)
        nonReentrant
        returns (uint256)
    {
        // checks for any pending rebalances for the receiver and applies them if necessary
        //@note This is deprecated and will be replaced in upcoming commits
        if (
            tokenFactory.getUserLastRebalanceCount(receiver) !=
            tokenFactory.getRebalanceNumber()
        ) {
            tokenFactory.applyRebalance(receiver);
        }
        //checks that the specified amount of underlying assets is within the maximum allowed for withdrawal

        if (assets > maxWithdraw(owner_))
            revert SmartToken__WithdrawMoreThanMax();
        uint256 shares = previewWithdraw(assets);
        // calls the '_withdraw' method on the Vault(TokenFactory). For more info, check out the tokenFcatory contract
        tokenFactory._withdraw(_msgSender(), receiver, owner_, assets, shares);

        return shares;
    }

    /// @notice Computes the maximum amount of underlying assets that can be redeemed by owner.
    /// @dev It overrides the `maxRedeem` function from the `IERC4626Upgradeable` interface.
    /// @param owner_ The address of the owner.
    /// @return The maximum amount of  underlying assets that the owner can redeem.
    function maxRedeem(
        address owner_
    ) public view virtual override returns (uint256) {
        //for more info, please check the 'maxAmountToWithdraw' method on the Vault(tokenFactory)
        return tokenFactory.maxAmountToWithdraw(owner_);
    }

    /// @notice Provides a preview of the amount of underlying assets that would be received when
    /// redeeming a number of shares(RiskON/OFF).
    /// @dev It overrides the `previewRedeem` function from the `IERC4626Upgradeable` interface.
    /// @param shares The number of shares(RiskON/OFF) to compute the equivalent underlying asset amount for.
    /// @return The equivalent asset amount for the given number of shares(RiskON/OFF).
    function previewRedeem(
        uint256 shares
    ) public view virtual override returns (uint256) {
        //Conversion Ration 1:1
        return shares;
    }

    /** @dev See {IERC4626-redeem}. */
    /// @notice Allows a user to redeem some amount of underlying assets based on an input amount of shares(RiskON/OFF).
    /// @dev It overrides the `redeem` function from the `IERC4626Upgradeable` interface.
    /// and is guarded by the `stopWithdraw`, `onlyAssetOwner`, and `nonReentrant` modifiers.
    /// @param shares The number of shares(RiskON/OFF) to redeem for underlying assets.
    /// @param receiver The address of receiver.
    /// @param owner_ The address of the owner.
    /// @return The amount of underlying assets redeemed.
    function redeem(
        uint256 shares,
        address receiver,
        address owner_
    )
        public
        virtual
        override
        stopWithdraw
        insufficientUnderlying
        onlyAssetOwner(owner_)
        nonReentrant
        returns (uint256)
    {
        // checks for any pending rebalances for the receiver and applies them if necessary
        //@note This is deprecated and will be replaced in upcoming commits
        if (
            tokenFactory.getUserLastRebalanceCount(receiver) !=
            tokenFactory.getRebalanceNumber()
        ) {
            tokenFactory.applyRebalance(receiver);
        }
        //checks that the specified amount of underlying assets is within the maximum allowed for withdrawal
        if (shares > maxRedeem(owner_)) revert SmartToken__RedeemMoreThanMax();

        uint256 assets = previewRedeem(shares);
        // calls the '_withdraw' method on the Vault(TokenFactory). For more info, check out the tokenFcatory contract
        tokenFactory._withdraw(_msgSender(), receiver, owner_, assets, shares);

        return assets;
    }

    /**
    Helpers for modifiers to reduce size */
    /// @notice Checks if the caller is the Vault (tokenFactory)
    /// @dev This function is utilized by the `onlyTokenFactory` modifier to ensure that only the token
    /// factory can call certain functions.
    function _onlyTokenFactory() private view {
        if (_msgSender() != address(tokenFactory))
            revert SmartToken__NotTokenFactory();
    }

    /// @notice Checks if the caller is the asset owner.
    /// @param assetOwner The address of the asset owner.
    /// @dev This function is utilized by the `onlyAssetOwner` modifier to ensure that only the asset owner
    /// can call certain functions.
    function _onlyAssetOwner(address assetOwner) private view {
        if (assetOwner != _msgSender()) revert SmartToken__OnlyAssetOwner();
    }

    /// @notice Validates the deposit amount.
    /// @param assets The amount of underlying assets being deposited.
    /// @param receiver The address of the receiver
    /// @dev This function is utilized by the `validateDepositAmount` modifier to ensure that the deposit amount is
    ///  neither zero nor exceeds the maximum allowed deposit for the receiver.
    function _validateDepositAmount(
        uint256 assets,
        address receiver
    ) private view {
        if (assets == 0) revert SmartToken__ZeroDeposit();
        if (assets > maxDeposit(receiver))
            revert SmartToken__DepositMoreThanMax();
    }
}
