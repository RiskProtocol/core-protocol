// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@trp/buttonwood-wrapper/contracts/UnbuttonToken.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "contracts/interfaces/flashloan/IFlashLoanReceiverAlt.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "contracts/lib/FlashloanSpecifics.sol";
import "contracts/vaults/BaseContract.sol";

contract wrappedSmartToken is
    UnbuttonToken,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    FlashloanSpecifics,
    BaseContract
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeMathUpgradeable for uint256;

    //structs
    struct PriceFeed {
        uint256 smartTokenXValue;
        uint256 smartTokenYValue;
        uint256 timestamp;
    }

    struct DiscountRates {
        uint256 startTime;
        uint256 endTime;
        uint256 discountMin;
        uint256 discountMax;
    }

    //state variables
    //smartTokens
    address private sellingToken;
    bool private isWrappedX;
    uint256 private timeout;
    uint256 private constant SCALING_FACTOR = 10 ** 18;
    /// @notice This is the signers address of RP api's that generate encoded params for rebalance
    mapping(address => bool) private signers;

    DiscountRates private currentDiscountRates;

    //erors
    error WrappedSmartToken__Not_Implemented();
    error WrappedSmartToken__PriceFeedOutdated();
    error WrappedSmartToken__InvalidSigner();
    error WrappedSmartToken__InvalidDiscount();

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
        address signer,
        uint256 timeout_,
        address sanctionsContract_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __Ownable_init();
        transferOwnership(owner_);
        __UUPSUpgradeable_init();
        __BaseContract_init(sanctionsContract_);
        underlying = underlying_;

        // NOTE: First mint with initial micro deposit
        uint256 mintAmount = INITIAL_DEPOSIT.mul(initialRate); //expecred to be 1:1
        IERC20Upgradeable(underlying).safeTransferFrom(
            _msgSender(),
            address(this),
            INITIAL_DEPOSIT
        );
        _mint(address(this), mintAmount);
        isWrappedX = isWrappedX_;
        sellingToken = sellingToken_;
        signers[signer] = true;
        timeout = timeout_;
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
        bytes memory encodedData,
        bytes memory signature,
        bytes memory params
    )
        external
        nonReentrant
        stopFlashLoan
        onlyNotSanctioned(receiver)
        onlyNotSanctioned(_msgSender())
    {
        if (address(receiver) == address(0)) {
            revert FlashLoan__InvalidReceiver();
        }

        //verfify signature
        PriceFeed memory priceFeed = verifyAndDecode(signature, encodedData);

        // We dont need to waste storage on this since encoded Data is required params, user
        // should fetch it from our apis and use
        if (block.timestamp > priceFeed.timestamp.add(timeout)) {
            revert WrappedSmartToken__PriceFeedOutdated();
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

        //get conversion rate
        (uint256 conversionRate, uint256 discountRate) = getConversionRate(
            priceFeed,
            currentDiscountRates.startTime,
            currentDiscountRates.endTime,
            currentDiscountRates.discountMin,
            currentDiscountRates.discountMax
        );
        // Calculate the amount of rebasing tokens to be repaid
        uint256 repayAmount = (amount.mul(conversionRate)).div(SCALING_FACTOR);

        if (currentDiscountRates.discountMax > 0) {
            repayAmount = (
                repayAmount.mul(SCALING_FACTOR.sub(discountRate)).div(
                    SCALING_FACTOR
                )
            );
        }

        if (
            !(
                receiverLoan.executeOperation(
                    amount,
                    underlying, //we ask user to approve the underlying so we can
                    repayAmount, //take back the required amount
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

    function setDiscountRate(
        uint256 startTime,
        uint256 endTime,
        uint256 discountMin,
        uint256 discountMax
    ) external onlyOwner {
        if (
            discountMin > discountMax ||
            discountMax > SCALING_FACTOR ||
            endTime < startTime ||
            startTime == endTime ||
            discountMin == discountMax
        ) {
            revert WrappedSmartToken__InvalidDiscount();
        }
        currentDiscountRates = DiscountRates(
            startTime,
            endTime,
            discountMin,
            discountMax
        );
    }

    function setSigners(address signer, bool status) external onlyOwner {
        signers[signer] = status;
    }

    // getters
    function getIsWrappedX() external view returns (bool) {
        return isWrappedX;
    }

    function getTimeout() external view returns (uint256) {
        return timeout;
    }

    function getDiscountRate() external view returns (DiscountRates memory) {
        return currentDiscountRates;
    }

    function getSigners(address signer) external view returns (bool) {
        return signers[signer];
    }

    //helper for overidding methods
    function calculateUserShare() private view returns (uint256) {
        uint256 userShare = IERC20Upgradeable(address(this)).balanceOf(
            _msgSender()
        );

        return (userShare.mul(SCALING_FACTOR)).div(totalSupply());
    }

    function refundUnwantedTokens(address user) private {
        if (IERC20Upgradeable(sellingToken).balanceOf(address(this)) > 0) {
            address recipient = (user == address(0)) ? _msgSender() : user;

            uint256 balanceUnwantedTokens = IERC20Upgradeable(sellingToken)
                .balanceOf(address(this));

            // we transfer the unwanted tokens to the user
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(sellingToken),
                recipient,
                (balanceUnwantedTokens.mul(calculateUserShare())).div(
                    SCALING_FACTOR
                )
            );
        }
    }

    function getConversionRate(
        PriceFeed memory priceFeed,
        uint256 t1, //unix timestamp/blocktime
        uint256 t2,
        uint256 x1, // 100% == 1e18
        uint256 x2
    ) private view returns (uint256, uint256) {
        uint256 currentTime = block.timestamp;
        //discount logic
        uint256 discountPercentage;
        if (x2 != 0) {
            if (currentTime >= t1 && currentTime <= t2) {
                // Linearly interpolate between x1 and x2 based on the time
                discountPercentage = x1.add(
                    ((x2.sub(x1)).mul(currentTime.sub(t1))).div(t2.sub(t1))
                );
            } else {
                discountPercentage = x2;
            }
        } else {
            discountPercentage = 0;
        }

        // Retrieve the conversion rate
        if (isWrappedX) {
            return (
                priceFeed.smartTokenXValue.mul(SCALING_FACTOR).div(
                    priceFeed.smartTokenYValue
                ),
                discountPercentage
            );
        } else {
            return (
                priceFeed.smartTokenYValue.mul(SCALING_FACTOR).div(
                    priceFeed.smartTokenXValue
                ),
                discountPercentage
            );
        }
    }

    /// @notice Verifies the provided signature and decodes the encoded data into  `ScheduledRebalance` struct.
    /// @dev It recovers the address from the Ethereum signed message hash and the provided `signature`.
    /// If the recovered address doesn't match the `signersAddress`, it reverts the transaction.
    /// If the signature is valid, it decodes the `encodedData` into a `ScheduledRebalance` struct and returns it.
    /// @param signature The signature to be verified.
    /// @param encodedData The data to be decoded into a `ScheduledRebalance` struct.
    /// @return data A `ScheduledRebalance` struct containing the decoded data.
    function verifyAndDecode(
        bytes memory signature,
        bytes memory encodedData
    ) private view returns (PriceFeed memory) {
        // Hash the encoded data
        bytes32 hash = keccak256(encodedData);

        // Recover the address
        address recoveredAddress = ECDSAUpgradeable.recover(hash, signature);

        // Verify the address
        if (signers[recoveredAddress] == false) {
            revert WrappedSmartToken__InvalidSigner(); // Invalid signer
        }

        // If the signature is valid, decode the encodedData into a  `ScheduledRebalance` struct
        (
            uint256 smartTokenXValue,
            uint256 smartTokenYValue,
            uint256 timestamp
        ) = abi.decode(encodedData, (uint256, uint256, uint256));
        PriceFeed memory data = PriceFeed(
            smartTokenXValue,
            smartTokenYValue,
            timestamp
        );
        return data;
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
    function withdraw(uint256 uAmount) public override returns (uint256) {
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
    function withdrawAllTo(address to) public override returns (uint256) {
        refundUnwantedTokens(to);
        return super.withdrawAllTo(to);
    }
}
