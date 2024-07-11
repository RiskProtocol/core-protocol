// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@trp/buttonwood-wrapper/contracts/UnbuttonToken.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "contracts/interfaces/flashloan/IFlashLoanReceiverAlt.sol";
import "contracts/interfaces/IPriceFeedOracle.sol";
import "contracts/lib/FlashloanSpecifics.sol";

contract wrappedSmartToken is
    UnbuttonToken,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    FlashloanSpecifics
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    //smartTokens
    address private sellingToken;
    bool private isWrappedX;
    IPriceFeedOracle private priceFeedOracle;
    uint256 private timeout;
    uint256 private constant SCALING_FACTOR = 10 ** 18;

    error WrappedSmartToken__Not_Implemented();
    error WrappedSmartToken__PriceFeedOutdated();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function riskInitialize(
        address underlying_,
        address sellingToken_, //alternate SMARTTOKEN
        string memory name_,
        string memory symbol_,
        uint256 initialRate,
        bool isWrappedX_,
        address owner_,
        address priceFeedOracle_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __Ownable_init();
        transferOwnership(owner_);
        __UUPSUpgradeable_init();
        underlying = underlying_;

        // NOTE: First mint with initial micro deposit
        uint256 mintAmount = INITIAL_DEPOSIT * initialRate;
        IERC20Upgradeable(underlying).safeTransferFrom(
            msg.sender,
            address(this),
            INITIAL_DEPOSIT
        );
        _mint(address(this), mintAmount);
        isWrappedX = isWrappedX_;
        sellingToken = sellingToken_;
        priceFeedOracle = IPriceFeedOracle(priceFeedOracle_);
        timeout = 30 * 16;
    }

    //override the previous implementation of initializer
    function initialize(
        address underlying_,
        string memory name_,
        string memory symbol_,
        uint256 initialRate
    ) public pure override {
        revert WrappedSmartToken__Not_Implemented();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    //flashloan

    /// @notice Allows user to take flashloans from the wrapper
    /// @dev This function is guarded by the `nonReentrant`  modifiers.
    /// we offer unwanted tokens (sellingToken) in exchange of underlying tokens
    /// @param receiver The address of the receiver.
    /// @param amount The amount of underlying assets to flashloan.
    /// @param params The parameters for the flashloan. Used by the receiver contract(Aave's interface)
    function flashLoan(
        address receiver,
        uint256 amount,
        bytes memory params
    ) external nonReentrant {
        if (address(receiver) == address(0)) {
            revert FlashLoan__InvalidReceiver();
        }

        //validate loan amount
        //verify if tokenFactory has enough assets
        if (IERC20Upgradeable(sellingToken).balanceOf(address(this)) < amount) {
            revert FlashLoan__InsufficientUnderlying();
        }

        //transfer the amount to the receiver
        // The sellingToken which is unwanted
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(sellingToken),
            receiver,
            amount
        );

        // Call executeOperation on the receiver contract
        IFlashLoanReceiverAlt receiverLoan = IFlashLoanReceiverAlt(receiver);

        // Retrieve the conversion rate from the oracle
        (uint256 conversionRate, uint256 timestamp) = priceFeedOracle
            .getConversionRate(sellingToken, underlying);

        if (block.timestamp - timestamp > timeout) {
            revert WrappedSmartToken__PriceFeedOutdated();
        }

        uint256 oracleDivider = priceFeedOracle.getConstant();
        // Calculate the amount of rebasing tokens to be repaid
        uint256 repayAmount = (amount * conversionRate) / oracleDivider;

        if (
            !(
                receiverLoan.executeOperation(
                    amount,
                    underlying, //we ask user to approve the underlying so we can
                    repayAmount,//take back the required amount
                    _msgSender(),
                    params
                )
            )
        ) {
            revert FlashLoan__FailedExecOps();
        }

        uint256 tokenBalanceInitial = IERC20Upgradeable(underlying).balanceOf(
            address(this)
        );

        //Making the user repay the amount of underlying
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(underlying),
            address(receiver),
            address(this),
            repayAmount
        );

        if (
            IERC20Upgradeable(underlying).balanceOf(address(this)) !=
            tokenBalanceInitial.add((repayAmount))
        ) {
            revert FlashLoan__FailedRepayments();
        }

        emit FlashLoanExecuted(
            receiver,
            _msgSender(),
            amount,
            repayAmount,
            params
        );
    }

    //setters
    function setTimeout(uint256 timeout_) external onlyOwner {
        timeout = timeout_;
    }

    // getters
    function getIsWrappedX() external view returns (bool) {
        return isWrappedX;
    }

    function getTimeout() external view returns (uint256) {
        return timeout;
    }

    //helper for overidding methods
    function calculateUserShare() private view returns (uint256) {
        uint256 userShare = IERC20Upgradeable(address(this)).balanceOf(
            _msgSender()
        );
        uint256 totalSupply = totalSupply();

        return (userShare * SCALING_FACTOR) / totalSupply;
    }

    function refundUnwantedTokens(address user) private {
        if (IERC20Upgradeable(sellingToken).balanceOf(address(this)) > 0) {
            address recipient = (user == address(0)) ? _msgSender() : user;

            //we calculate users share
            uint256 userShare = calculateUserShare();

            uint256 balanceUnwantedTokens = IERC20Upgradeable(sellingToken)
                .balanceOf(address(this));

            // we transfer the unwanted tokens to the user
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(sellingToken),
                recipient,
                (balanceUnwantedTokens * userShare) / SCALING_FACTOR
            );
        }
    }

    // unbutton token methods that are updated
    /// @inheritdoc IButtonWrapper
    function burn(uint256 amount) public override returns (uint256) {
        refundUnwantedTokens(address(0));
        return super.burn(amount);
    }

    /// @inheritdoc IButtonWrapper
    function burnTo(
        address to,
        uint256 amount
    ) public override returns (uint256) {
        refundUnwantedTokens(to);
        return super.burnTo(to, amount);
    }

    /// @inheritdoc IButtonWrapper
    function burnAll() public override returns (uint256) {
        refundUnwantedTokens(address(0));
        return super.burnAll();
    }

    /// @inheritdoc IButtonWrapper
    function burnAllTo(address to) public override returns (uint256) {
        refundUnwantedTokens(to);
        return super.burnAllTo(to);
    }

    /// @inheritdoc IButtonWrapper
    function withdraw(
        uint256 uAmount
    ) public override returns (uint256) {
        refundUnwantedTokens(address(0));
        return super.withdraw(uAmount);
    }

    /// @inheritdoc IButtonWrapper
    function withdrawTo(
        address to,
        uint256 uAmount
    ) public override returns (uint256) {
        refundUnwantedTokens(to);
        return super.withdrawTo(to, uAmount);
    }

    /// @inheritdoc IButtonWrapper
    function withdrawAll() public override returns (uint256) {
        refundUnwantedTokens(address(0));
        return super.withdrawAll();
    }

    /// @inheritdoc IButtonWrapper
    function withdrawAllTo(
        address to
    ) public override returns (uint256) {
        refundUnwantedTokens(to);
        return super.withdrawAllTo(to);
    }
}
