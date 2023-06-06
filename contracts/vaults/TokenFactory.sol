// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./DevToken.sol";
import "./../libraries/PriceFeed.sol";
import "./BaseContract.sol";
import "./../interfaces/IERC20Update.sol";

error TokenFactory__MethodNotAllowed();


/**
 * @title ERC-20 Rebase Tokens
 * @author Okwuosa Chijioke
 * @notice Still under development
 * @dev This implements 2 ERC-20 tokens that will be minted in exactly the same proportion as the
 * underlying ERC-20 token transferred into the Factory contract.
 * The asset will be burned in exactly the same proportion when asked to redeem/withdrawal the underlying asset.
 * The contract will implement periodic rebalancing
 */
contract TokenFactory is ERC20, ReentrancyGuard, Ownable, BaseContract {
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;
    using SafeMath for uint256;

    // State variables
    uint256[] private scallingFactorX;
    DevToken[] private devTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    IERC20Update private immutable baseToken;
    uint8 private immutable baseTokenDecimals;
    uint256 private immutable interval;
    uint256 private lastTimeStamp;

    // Events
    event RebaseApplied(address userAddress, uint256 rebaseCount);
    event Rebase(uint256 rebaseCount);
    event Deposit(address caller, address receiver, uint256 assets, uint256 shares);
    event Withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares);

    modifier onlyDevTokens() {
        if (_msgSender() == address(devTokenArray[0]) || _msgSender() == address(devTokenArray[1])) {
            _;
        } else {
            revert TokenFactory__MethodNotAllowed();
        }
    }

    constructor(
        IERC20Update baseTokenAddress,
        address priceFeedAddress,
        uint256 rebaseInterval, // in seconds
        address sanctionsContract_
    ) ERC20("RiskProtocolVault", "RPK") BaseContract(sanctionsContract_) {
        baseToken = IERC20Update(baseTokenAddress);
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
        if (
            success &&
            encodedDecimals.length >= 32 &&
            abi.decode(encodedDecimals, (uint256)) <= type(uint8).max
        ) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            return (true, uint8(returnedDecimals));
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
        override
        returns (uint8)
    {
        return baseTokenDecimals;
    }

    function getBaseToken() public view virtual returns (IERC20Update) {
        return baseToken;
    }

    function maxAmountToWithdraw(
        address owner_
    ) public view virtual returns (uint256) {
        if (
            devTokenArray[0].balanceOf(owner_) >
            devTokenArray[1].balanceOf(owner_)
        ) {
            return devTokenArray[1].balanceOf(owner_);
        } else {
            return devTokenArray[0].balanceOf(owner_);
        }
    }

    /**
     * @dev Deposit/mint common workflow.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) external
      virtual
      onlyNotSanctioned(caller)
      onlyNotSanctioned(receiver)
      onlyDevTokens() {
        SafeERC20.safeTransferFrom(baseToken, caller, address(this), assets);
        updateUserLastRebaseCount(receiver);
        factoryMint(0, receiver, shares);
        factoryMint(1, receiver, shares);

        emit Deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Withdraw/redeem common workflow.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) external
      virtual
      onlyNotSanctioned(caller)
      onlyNotSanctioned(receiver)
      onlyDevTokens() {
        factoryBurn(0, caller, assets);
        factoryBurn(1, caller, assets);
        SafeERC20.safeTransfer(baseToken, receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function factoryMint(
        uint256 devTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        uint256 assets = devTokenArray[devTokenIndex].previewMint(amount);
        devTokenArray[devTokenIndex].mintAsset(receiver, assets);
    }

    function factoryBurn(
        uint256 devTokenIndex,
        address owner_,
        uint256 amount
    ) private {
        devTokenArray[devTokenIndex].devBurn(owner_, amount);
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

        emit Rebase(getScallingFactorLength());
    }

    function applyRebase(address owner_) public {
        uint256 asset1ValueEth = devTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = devTokenArray[1].unScaledbalanceOf(owner_);

        uint256 rollOverValue = calculateRollOverValue(owner_);
        lastRebaseCount[owner_] = getScallingFactorLength();

        if (rollOverValue > asset1ValueEth) {
            factoryMint(0, owner_, (rollOverValue - asset1ValueEth));
        } else {
            factoryBurn(0, owner_, (asset1ValueEth - rollOverValue));
        }

        if (rollOverValue > asset2ValueEth) {
            factoryMint(1, owner_, (rollOverValue - asset2ValueEth));
        } else {
            factoryBurn(1, owner_, (asset2ValueEth - rollOverValue));
        }

        emit RebaseApplied(owner_, getScallingFactorLength());
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
            devTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            lastRebaseCount[owner_] = getScallingFactorLength();
        }
    }

    //  other getter methods
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

    function getInterval() public view returns (uint256) {
        return interval;
    }

    // unwanted methods

    /** @dev See {ERC20-totalSupply}. */
    function totalSupply()
        public
        pure
        override
        returns (uint256)
    {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-balanceOf}. */
    function balanceOf(
        address /* account */
    ) public view virtual override returns (uint256) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-transfer}. */
    function transfer(
        address /* to */,
        uint256 /* amount */
    ) public virtual override returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-allowance}. We don't revert directly in this function because
     *  it throws unreachable code warnings during compilation unlike ERC 20 approve function
     * */
    function allowance(
        address owner,
        address spender
    ) public view virtual override onlyOwner returns (uint256) {
        return super.allowance(owner, spender);
    }

    /** @dev See {ERC20-approve}. */
    function approve(
        address /* spender */,
        uint256 /* amount */
    ) public virtual override returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-transferFrom}. */
    function transferFrom(
        address /* from */,
        address /* to */,
        uint256 /* amount  */
    ) public virtual override returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }
}
