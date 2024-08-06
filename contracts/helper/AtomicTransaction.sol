// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../interfaces/ISmartToken.sol";
import "../interfaces/IBpool.sol";

/**
 * @title AtomicTransaction
 * @dev Implements Underlying deposits and instant swaps using a Balancer pool
 * note user should approve the underlying and the selltokens to be spent by the contract
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

    uint256 private balancerVariable_minAmountOut;
    uint256 private balancerVariable_maxPrice;

    error AtomicTransaction_SlippageError();
    error AtomicTransaction_SwapError();
    error AtomicTransaction_InvalidBalance();
    error AtomicTransaction_InvalidParams();
    error AtomicTransaction_BalancerError();
    error AtomicTransaction_ExpiryReached();

    event ReceivedEther(address sender, uint256 amount);
    event DrainContract();
    event SplitAndSwap(
        address receiver,
        uint256 depositAmount,
        uint256 swapAmount
    );

    modifier expiryDateCheck(uint256 expiryDate) {
        if (expiryDate < block.timestamp) {
            revert AtomicTransaction_ExpiryReached();
        }
        _;
    }

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
        balancerVariable_minAmountOut = 1;
        balancerVariable_maxPrice = uint256(type(uint256).max);
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
        uint256 allowed = underlying.allowance(_msgSender(), address(this)); //!!!!
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
        // The selling token(riskon or off)
        IERC20 sellToken,
        //The balancer pool address
        address bPoolAddress,
        //including slippage
        uint256 expectedAmount,
        //amount of underlying to deposit
        uint256 depositAmount,
        //anount of sell token to sell
        uint256 sellAmount,
        //expiry date
        uint256 expiryDate
    ) external payable expiryDateCheck(expiryDate) nonReentrant returns (bool) {
        if (
            expectedAmount == 0 ||
            depositAmount == 0 ||
            sellAmount == 0 ||
            address(sellToken) == address(0)
        ) {
            revert AtomicTransaction_InvalidParams();
        }

        IERC20 buyToken = (sellToken == smartTokenX)
            ? smartTokenY
            : smartTokenX;

        IBPool balancerPool = IBPool(bPoolAddress);

        if (
            !balancerPool.isBound(address(sellToken)) ||
            !balancerPool.isBound(address(buyToken))
        ) {
            revert AtomicTransaction_BalancerError();
        }

        ///user does a depoist of underlying assets
        // @note we assume user has already approved this contract to spend the underlying
        deposit(depositAmount);

        // Track our balance of the buyToken of sell Token before the swap.
        // uint256 initialAmount = buyToken.balanceOf(address(this));
        //@note User should approve the contract to spend the sell token
        SafeERC20.safeTransferFrom(
            sellToken,
            _msgSender(),
            address(this),
            sellAmount
        );

        SafeERC20.safeApprove(sellToken, bPoolAddress, sellAmount);

        // Perform the swap at the Balancer Pool
        (uint256 boughtAmount, ) = balancerPool.swapExactAmountIn(
            address(sellToken),
            sellAmount,
            address(buyToken),
            balancerVariable_minAmountOut,
            balancerVariable_maxPrice
        );

        if (boughtAmount < expectedAmount) {
            // If we didn't buy enough, revert the transaction. Slippage tolerance
            revert AtomicTransaction_SlippageError();
        }

        //transfer bought tokens to user
        SafeERC20.safeTransfer(buyToken, _msgSender(), boughtAmount);

        emit SplitAndSwap(_msgSender(), depositAmount, boughtAmount);
        //if everything went through
        return true;
    }

    function setBalancerVariables(
        uint256 minAmountOut,
        uint256 maxPrice
    ) external onlyOwner {
        balancerVariable_minAmountOut = minAmountOut;
        balancerVariable_maxPrice = maxPrice;
    }

    function getBalancerVariables() external view returns (uint256, uint256) {
        return (balancerVariable_minAmountOut, balancerVariable_maxPrice);
    }
}
