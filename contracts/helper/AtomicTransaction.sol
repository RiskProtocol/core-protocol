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
import "../interfaces/oneinch/IAggregationExecutor.sol";
import "../interfaces/oneinch/IAggregationRouterV6.sol";

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

    error AtomicTransaction_SlippageError(uint256 expected, uint256 actual);
    error AtomicTransaction_SwapError();
    error AtomicTransaction_InvalidBalance();
    error AtomicTransaction_InvalidParams();
    error AtomicTransaction_InvalidOneInchData();
    error AtomicTransaction_BalancerError();
    error AtomicTransaction_ExpiryReached();
    error AtomicTransaction_InvalidUnOrReceiver();

    event ReceivedEther(address sender, uint256 amount);
    event DrainContract(address owner);
    event SplitAndSwap(
        address receiver,
        uint256 depositAmount,
        uint256 sellAmount
    );
    event TradeSplitSwap(
        address user,
        uint256 returnAmount,
        uint256 spentAmount,
        uint256 sellAmount
    );

    modifier expiryDateCheck(uint256 expiryDate) {
        if (expiryDate < block.timestamp) {
            revert AtomicTransaction_ExpiryReached();
        }
        _;
    }
    // Modifier to prevent zero address usage
    modifier nonZeroAddress(address addr) {
        if (addr == address(0)) {
            revert AtomicTransaction_InvalidParams();
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
        __ReentrancyGuard_init();
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
        emit DrainContract(owner());
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
    )
        external
        payable
        expiryDateCheck(expiryDate)
        nonZeroAddress(bPoolAddress)
        nonReentrant
        returns (bool)
    {
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
        verifybPool(balancerPool, sellToken, buyToken);

        ///user does a depoist of underlying assets
        // @note we assume user has already approved this contract to spend the underlying
        deposit(depositAmount);

        //@note User should approve the contract to spend the sell token
        balancerSwap(
            sellToken,
            buyToken,
            balancerPool,
            sellAmount,
            expectedAmount
        );
        emit SplitAndSwap(_msgSender(), depositAmount, sellAmount);

        //if everything went through
        return true;
    }

    /// Trade Split and Swap
    /// User must approve this contract to spend their srcToken
    /// Frontend should make an api call with
    /// from as this contract, origin as the user(signer) and receiver as this contract again
    /// sample API call : curl --location 'https://api.1inch.dev/swap/v6.0/56/swap?src=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d&dst=0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE&amount=100000000000&from=0x7a0DF1aC4130C15ad482fD7570E9c920Db01517B&origin=0x9B29dbc5278C44aF9a45988e8f393CB3B9f25EbF&slippage=50&compatibility=true&receiver=0x7a0DF1aC4130C15ad482fD7570E9c920Db01517B&disableEstimate=true' \
    function tradeSplitSwap(
        //the 1inch router address
        address router_,
        //the 1 inch call data
        bytes calldata data,
        //are we selling the selling token to balancer pool
        bool isSwap,
        //token that the user wants to sell
        IERC20 sellToken,
        //amount of token the user wants to sell
        uint256 sellAmount,
        //balancer pool address
        address bPoolAddress,
        //expected amount of token to receive
        uint256 balancerexpectedAmount,
        //expiry date
        uint256 expiryDate
    )
        external
        payable
        nonReentrant
        nonZeroAddress(bPoolAddress)
        nonZeroAddress(router_)
        expiryDateCheck(expiryDate)
        returns (bool)
    {   
        IERC20 buyToken = (sellToken == smartTokenX)
            ? smartTokenY
            : smartTokenX;

        IBPool balancerPool = IBPool(bPoolAddress);

        verifybPool(balancerPool, sellToken, buyToken);
        //we swap the holding tokens for the underlying
        IAggregationRouterV6 router = IAggregationRouterV6(router_);
        (
            address executor,
            IAggregationRouterV6.SwapDescription memory desc,
            bytes memory swapData
        ) = decodeData(data);

        if (desc.dstToken != underlying || desc.dstReceiver != address(this)) {
            revert AtomicTransaction_InvalidUnOrReceiver();
        }
        //assuming the user has approved the contract to spend the third party token
        IERC20(desc.srcToken).transferFrom(
            _msgSender(),
            address(this),
            desc.amount
        );

        IERC20(desc.srcToken).approve(router_, desc.amount);

        //@note user should approve 1inch contract already
        // and set this contract as receiver of funds
        (uint returnAmt, uint spentAmt) = router.swap(
            IAggregationExecutor(executor),
            desc,
            swapData
        );

        //we verify if the the return amount is greater than the  min return amount and if this contract has been credited already
        if (returnAmt < desc.minReturnAmount) {
            revert AtomicTransaction_SlippageError(
                desc.minReturnAmount,
                returnAmt
            );
        }

        if (underlying.balanceOf(address(this)) < returnAmt) {
            revert AtomicTransaction_SwapError();
        }

        //now that we have underlying, we split
        underlying.safeApprove(
            address(smartTokenX.getTokenFactory()),
            returnAmt
        );
        smartTokenX.deposit(returnAmt, _msgSender());

        if (isSwap) {
            //now we swap
            //@note User should approve the contract to spend the sell token
            balancerSwap(
                sellToken,
                buyToken,
                balancerPool,
                sellAmount,
                balancerexpectedAmount
            );
        }
        emit TradeSplitSwap(_msgSender(), returnAmt, spentAmt, sellAmount);
        return true;
    }

    function balancerSwap(
        IERC20 sellToken,
        IERC20 buyToken,
        IBPool balancerPool,
        uint256 sellAmount,
        uint256 balancerexpectedAmount
    ) private {

        SafeERC20.safeTransferFrom(
            sellToken,
            _msgSender(),
            address(this),
            sellAmount
        );

        SafeERC20.safeApprove(sellToken, address(balancerPool), sellAmount);

        // Perform the swap at the Balancer Pool
        (uint256 boughtAmount, ) = balancerPool.swapExactAmountIn(
            address(sellToken),
            sellAmount,
            address(buyToken),
            balancerVariable_minAmountOut,
            balancerVariable_maxPrice
        );

        if (boughtAmount < balancerexpectedAmount) {
            // If we didn't buy enough, revert the transaction. Slippage tolerance
            revert AtomicTransaction_SlippageError(
                balancerexpectedAmount,
                boughtAmount
            );
        }
        //transfer bought tokens to user
        SafeERC20.safeTransfer(buyToken, _msgSender(), boughtAmount);
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

    function verifybPool(
        IBPool balancerPool,
        IERC20 sellToken,
        IERC20 buyToken
    ) private view {
        if (
            !balancerPool.isBound(address(sellToken)) ||
            !balancerPool.isBound(address(buyToken))
        ) {
            revert AtomicTransaction_BalancerError();
        }
    }

    function decodeData(
        bytes calldata data
    )
        public
        pure
        returns (
            address,
            IAggregationRouterV6.SwapDescription memory,
            bytes memory
        )
    {
        if (data.length < 4) {
            revert AtomicTransaction_InvalidOneInchData();
        }
        // Skip the first 4 bytes (function selector)
        bytes calldata params = data[4:];

        (
            address executorDecoded,
            IAggregationRouterV6.SwapDescription memory descDecoded,
            bytes memory swapDataDecoded
        ) = abi.decode(
                params,
                (address, IAggregationRouterV6.SwapDescription, bytes)
            );
        return (executorDecoded, descDecoded, swapDataDecoded);
    }
}
