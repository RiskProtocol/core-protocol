// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";
import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "./DevToken.sol";
import "./../libraries/PriceFeed.sol";

error TokenFactory__DepositMoreThanMax();
error TokenFactory__MintMoreThanMax();
error TokenFactory__WithdrawMoreThanMax();
error TokenFactory__RedeemMoreThanMax();
error TokenFactory__OnlyAssetOwner();
error TokenFactory__ZeroDeposit();
error TokenFactory__UpkeepNotNeeded();
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
contract TokenFactory is
    ERC20,
    IERC4626,
    ReentrancyGuard,
    Ownable,
    AutomationCompatible,
    ChainlinkClient
{
    /* Type declarations */
    enum TokenFactoryState {
        OPEN,
        CALCULATING
    }

    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;
    using SafeMath for uint256;
    using Chainlink for Chainlink.Request;

    // State variables
    uint256[] private scallingFactorX;
    DevToken[] private devTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    IERC20 private immutable baseToken;
    uint8 private immutable baseTokenDecimals;
    uint256 private immutable interval;
    uint256 private lastTimeStamp;
    TokenFactoryState private tokenFactoryState;
    bytes32 private jobId;
    uint256 private fee;

    modifier onlyAssetOwner(address assetOwner) {
        if (assetOwner != msg.sender) revert TokenFactory__OnlyAssetOwner();
        _;
    }

    // Events
    event RebaseApplied(address userAddress, uint256 rebaseCount);
    event Rebase(uint256 rebaseCount, uint256 newScallingFactorX);
    event RequestMultipleFulfilled(
        bytes32 indexed requestId,
        uint256 undResponse,
        uint256 navResponse,
        uint256 timResponse
    );

    constructor(
        IERC20 baseTokenAddress,
        address priceFeedAddress,
        uint256 rebaseInterval, // in seconds
        address chainlinkTokenAddress,
        address chainlinkOracleAddress,
        bytes32 chainlinkJobId,
        uint256 linkFee
    ) ERC20("RiskProtocolVault", "RPK") {
        baseToken = IERC20(baseTokenAddress);
        priceFeed = AggregatorV3Interface(priceFeedAddress);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : super.decimals();
        interval = rebaseInterval;
        lastTimeStamp = block.timestamp;
        tokenFactoryState = TokenFactoryState.OPEN;
        setChainlinkToken(chainlinkTokenAddress);
        setChainlinkOracle(chainlinkOracleAddress);
        jobId = chainlinkJobId;
        fee = (1 * LINK_DIVISIBILITY) / linkFee;
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
        return (type(uint256).max) - 1;
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
        if (assets == 0) revert TokenFactory__ZeroDeposit();
        if (assets > maxDeposit(receiver))
            revert TokenFactory__DepositMoreThanMax();
        uint256 shares = previewDeposit(assets);
        _deposit(_msgSender(), receiver, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view virtual override returns (uint256) {
        return (type(uint256).max) - 1;
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
        if (shares > maxMint(receiver)) revert TokenFactory__MintMoreThanMax();

        uint256 assets = previewMint(shares);
        _deposit(_msgSender(), receiver, assets, shares);

        return assets;
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(
        address owner_
    ) public view virtual override returns (uint256) {
        return maxAmountToWithdraw(owner_);
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
        if (getUserLastRebaseCount(receiver) != getScallingFactorLength()) {
            applyRebase(receiver);
        }
        if (assets > maxWithdraw(owner_))
            revert TokenFactory__WithdrawMoreThanMax();

        uint256 shares = previewWithdraw(assets);
        _withdraw(_msgSender(), receiver, owner_, assets, shares);

        return shares;
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner_
    ) public view virtual override returns (uint256) {
        return maxAmountToWithdraw(owner_);
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
        if (getUserLastRebaseCount(receiver) != getScallingFactorLength()) {
            applyRebase(receiver);
        }
        if (shares > maxRedeem(owner_))
            revert TokenFactory__RedeemMoreThanMax();
        uint256 assets = previewRedeem(shares);
        _withdraw(_msgSender(), receiver, owner_, assets, shares);

        return assets;
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
    ) internal virtual {
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
    ) internal virtual {
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
        uint256 assets = previewMint(amount);
        devTokenArray[devTokenIndex].mint(receiver, assets);
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

    // chainlink automation
    function readyForUpkeep() private view returns (bool ready) {
        bool isOpen = TokenFactoryState.OPEN == tokenFactoryState;
        bool timePassed = (block.timestamp - lastTimeStamp) > interval;
        bool hasDeposits = totalAssets() > 0;

        ready = (isOpen && timePassed && hasDeposits);
    }

    /**
     * @dev This is the function that the Chainlink Keeper nodes call
     * they look for `upkeepNeeded` to return True.
     * the following should be true for this to return true:
     * 1. The time interval has passed between rebase period.
     * 2. Trading is in open state.
     * 3. Implicity, your subscription is funded with LINK.
     * 4. The contract has some deposits
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        public
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded = readyForUpkeep();
        return (upkeepNeeded, performData);
        // We don't use the checkData here, The checkData is defined when the Upkeep was registered.
    }

    /**
     * @dev Once `checkUpkeep` is returning `true`, this function is called
     */
    function performUpkeep(bytes calldata /* performData */) external override {
        // It is highly recommended revalidating the upkeep
        bool upkeepNeeded = readyForUpkeep();
        if (!upkeepNeeded) {
            revert TokenFactory__UpkeepNotNeeded();
        }
        tokenFactoryState = TokenFactoryState.CALCULATING;
        requestMultipleParameters();
    }

    // chainlink Any API
    function requestMultipleParameters() public {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfillMultipleParameters.selector
        );
        req.add(
            "urlBTC",
            "https://jiokeokwuosa.github.io/risk-page/response.json"
        );
        req.add("pathBTC", "UND");
        req.add(
            "urlUSD",
            "https://jiokeokwuosa.github.io/risk-page/response.json"
        );
        req.add("pathUSD", "NAV");
        req.add(
            "urlEUR",
            "https://jiokeokwuosa.github.io/risk-page/response.json"
        );
        req.add("pathEUR", "TIM");

        //send the request
        sendChainlinkRequest(req, fee); // MWR API.
    }

    /**
     * @notice Fulfillment function for multiple parameters in a single request
     * @dev This is called by the oracle. recordChainlinkFulfillment must be used.
     */
    function fulfillMultipleParameters(
        bytes32 requestId,
        uint256 undResponse,
        uint256 navResponse,
        uint256 timResponse
    ) public recordChainlinkFulfillment(requestId) {
        emit RequestMultipleFulfilled(
            requestId,
            undResponse,
            navResponse,
            timResponse
        );
        uint256 chainlinkDivisor = 100000;
        uint256 underlyingTokenAmount = undResponse / chainlinkDivisor;
        uint256 navAmount = navResponse / chainlinkDivisor;
        rebase(underlyingTokenAmount, navAmount);
    }

    /**
     * Allow withdraw of Link tokens / base tokens from the contract
     */  

    function rescueTokens(     
        address tokenAddress,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        SafeERC20.safeTransfer(token, to, amount);
    }

    function rebase(uint256 rebasePrice, uint256 asset1Price) internal {
        uint256 divisor = rebasePrice.ceilDiv(2);
        uint256 newScallingFactorX = ((asset1Price * 10 ** decimals()) / 2) /
            divisor;
        scallingFactorX.push(newScallingFactorX);

        lastTimeStamp += interval * 2;
        tokenFactoryState = TokenFactoryState.OPEN;

        emit Rebase(getScallingFactorLength(), newScallingFactorX);
    }

    function rebaseManualTrigger(
        uint256 rebasePrice,
        uint256 asset1Price
    ) public onlyOwner {
        rebase(rebasePrice, asset1Price);
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
            devTokenArray[0].unScaledbalanceOf(owner_) == 0
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
        override(ERC20, IERC20)
        returns (uint256)
    {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-balanceOf}. */
    function balanceOf(
        address /* account */
    ) public view virtual override(ERC20, IERC20) returns (uint256) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-transfer}. */
    function transfer(
        address /* to */,
        uint256 /* amount */
    ) public virtual override(ERC20, IERC20) returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-allowance}. */
    function allowance(
        address /* owner */,
        address /* spender */
    ) public view virtual override(ERC20, IERC20) returns (uint256) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-approve}. */
    function approve(
        address /* spender */,
        uint256 /* amount */
    ) public virtual override(ERC20, IERC20) returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }

    /** @dev See {ERC20-transferFrom}. */
    function transferFrom(
        address /* from */,
        address /* to */,
        uint256 /* amount  */
    ) public virtual override(ERC20, IERC20) returns (bool) {
        revert TokenFactory__MethodNotAllowed();
    }
}
