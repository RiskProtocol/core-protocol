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

error TokenFactory__DepositMoreThanMax();
error TokenFactory__MintMoreThanMax();
error TokenFactory__WithdrawMoreThanMax();
error TokenFactory__RedeemMoreThanMax();
error TokenFactory__OnlyAssetOwner();
error TokenFactory__ZeroDeposit();
error TokenFactory__MethodNotAllowed();
error TokenFactory__InvalidDivision();

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
    using SafeMath for uint8;
    using SafeMath for uint32;

    // State variables
    uint256[] private scallingFactorX;
    DevToken[] private devTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    IERC20 private immutable baseToken;
    uint8 private immutable baseTokenDecimals;
    uint256 private immutable interval;
    uint256 private lastTimeStamp;
    //management fees
    uint32 public managementFeesRate;
    uint32[] public mgmtFeesHistory; //todo make it private
    mapping(address => uint256) public userMgmtFeeHistory;
    bool mgmtFeesState;
    uint256[] mgmtFeeSum;

    modifier onlyAssetOwner(address assetOwner) {
        if (assetOwner != msg.sender) revert TokenFactory__OnlyAssetOwner();
        _;
    }

    // Events
    event RebaseApplied(address userAddress, uint256 rebaseCount);
    event Rebase(uint256 rebaseCount);

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
        managementFeesRate = 0;
        mgmtFeesHistory.push(managementFeesRate);
        //mgmtFeeSum[0] = managementFeesRate;
        mgmtFeeSum.push(managementFeesRate);
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
        //mgmtFeeslogic
        //todo:test run
        if (managementFeesRate > 0) {
            uint256 fees = calculateManagementFee(shares, true, 0);
            shares = shares - fees;
            factoryMint(0, address(this), fees);
            factoryMint(1, address(this), fees);
            emit Deposit(caller, address(this), fees, fees);
        }
        userMgmtFeeHistory[receiver] = getMgmtFeeFactorLength() - 1;
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
        //mgmt fees logic
        if (managementFeesRate > 0) {
            //todo: add check for boolean
            uint256 feesRefund = calculateManagementFee(assets, true, 0); //todo: calclulate for all cycles
            assets = assets + feesRefund;
            factoryBurn(0, address(this), feesRefund);
            factoryBurn(1, address(this), feesRefund);
            emit Withdraw(caller, address(this), owner, feesRefund, feesRefund);
        }
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

    function factoryTransfer(
        uint256 devTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        devTokenArray[devTokenIndex].devTransfer(receiver, amount);
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
        if (mgmtFeesState) {
            mgmtFeesHistory.push(managementFeesRate);
            updateManagementFeeSum();
        }

        emit Rebase(getScallingFactorLength());
    }

    function applyRebase(address owner_) public {
        uint256 asset1ValueEth = devTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = devTokenArray[1].unScaledbalanceOf(owner_);
        //mgmt fees
        //todo: To Test
        if (mgmtFeesState) {
            uint256 numberOfFeesCycle = getMgmtFeeFactorLength() - 1; //through rebase only
            uint256 numberOfUserFeeCycle = userMgmtFeeHistory[owner_]; //through rebase only

            uint256 outstandingFeesCount = numberOfFeesCycle -
                numberOfUserFeeCycle; //let x be 2
            // rebaseCount(5) -2 =3

            if (outstandingFeesCount > 0) {
                uint256 sumOfFees;

                uint256 firstFeeMissedIndex = numberOfFeesCycle - //7
                    outstandingFeesCount; //2
                sumOfFees = //6,7
                    mgmtFeeSum[numberOfFeesCycle] -
                    mgmtFeeSum[firstFeeMissedIndex]; //5

                uint32 averageX = uint32(sumOfFees / outstandingFeesCount);

                uint256 asset1ValueEthFees = calculateManagementFee(
                    asset1ValueEth,
                    false,
                    averageX
                ).mul(outstandingFeesCount);

                uint256 asset2ValueEthFees = calculateManagementFee(
                    asset2ValueEth,
                    false,
                    averageX
                ).mul(outstandingFeesCount);

                asset1ValueEth = asset1ValueEth - asset1ValueEthFees;
                asset2ValueEth = asset2ValueEth - asset2ValueEthFees;

                factoryTransfer(0, address(this), asset1ValueEthFees);
                factoryTransfer(1, address(this), asset2ValueEthFees);
                emit Deposit(
                    owner_,
                    address(this),
                    asset1ValueEthFees,
                    asset1ValueEthFees
                );
                userMgmtFeeHistory[owner_] = getMgmtFeeFactorLength() - 1;
            }
        }

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
        //todo: add mgmt fees

        if (managementFeesRate > 0) {
            uint256 numberOfFeesCycle = getMgmtFeeFactorLength() - 1; //through rebase only
            uint256 numberOfUserFeeCycle = userMgmtFeeHistory[owner_]; //through rebase only

            uint256 outstandingFeesCount = numberOfFeesCycle -
                numberOfUserFeeCycle;

            if (outstandingFeesCount > 0) {
                uint256 sumOfFees;

                uint256 firstFeeMissedIndex = numberOfFeesCycle -
                    outstandingFeesCount;
                sumOfFees =
                    mgmtFeeSum[numberOfFeesCycle] -
                    mgmtFeeSum[firstFeeMissedIndex];
                uint32 averageX = uint32(sumOfFees / outstandingFeesCount);

                uint256 asset1Fee = calculateManagementFee(
                    asset1Balance,
                    false,
                    averageX
                ).mul(outstandingFeesCount);

                uint256 asset2Fee = calculateManagementFee(
                    asset2Balance,
                    false,
                    averageX
                ).mul(outstandingFeesCount);
                asset1Balance -= asset1Fee;
                asset2Balance -= asset2Fee;
            }
        }

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

    /*
    Mgmt Fees Block
    rate is per annum
     */
    //scaling factor is 100
    function setManagementFeeRate(
        uint32 rate
    ) external onlyOwner returns (bool) {
        require(
            rate < 10001,
            "The management fee rate cannot exeed 100 percent (1000)"
        );
        managementFeesRate = rate;
        //managementFeesPerRebase[rebaseCount] = rate;
        return true;
    }

    function setManagementFeeState(
        bool state
    ) external onlyOwner returns (bool) {
        mgmtFeesState = state;
        return true;
    }

    function updateManagementFeeSum() private {
        uint mgmtFeeCycleCount = getMgmtFeeFactorLength() - 1;
        //todo: mgmtfeeSum is set to zero in constructor

        mgmtFeeSum.push(mgmtFeeSum[mgmtFeeCycleCount - 1] + managementFeesRate);
    }

    //0 = 0
    //1 = 1
    //2 = 3
    //3 = 3
    //4 = 6

    //6-3 = 3/2
    //1.5

    //todo: create a spreadsheet to demonstrate

    function calculateManagementFee(
        uint256 amount,
        bool isDefault,
        uint32 mgmtFee //calculates both for fee and refund // same cal/ in wei scale
    ) public view returns (uint256) {
        uint256 lastRaseTimeStamp = mgmtFeesHistory[
            getMgmtFeeFactorLength() - 1
        ];
        uint32 internalManagementFeesRate;
        if (isDefault) {
            internalManagementFeesRate = managementFeesRate; //managementFeesPerRebase[rebaseCount];
        } else {
            internalManagementFeesRate = mgmtFee;
        }

        uint256 nextRebaseTimeStamp = lastRaseTimeStamp + interval;
        uint32 mgmtFeesPerInterval = internalManagementFeesRate /
            uint32(366 days / interval); //todo:

        uint256 userDepositTimeStamp = block.timestamp;
        uint256 userDepositCycle = nextRebaseTimeStamp - userDepositTimeStamp;
        uint256 mgmtFeeCycle = nextRebaseTimeStamp - lastRaseTimeStamp;

        if (userDepositCycle == 0 || mgmtFeeCycle == 0) {
            revert TokenFactory__InvalidDivision();
        }
        uint256 userFeesUnscaled = userDepositCycle
            .mul(mgmtFeesPerInterval)
            .mul(amount)
            .div(mgmtFeeCycle);
        uint256 userFees = userFeesUnscaled.div(10000);
        return userFees;
    }

    //  other getter methods
    function getPriceFeedAddress() public view returns (AggregatorV3Interface) {
        return priceFeed;
    }

    function getScallingFactorLength() public view returns (uint256) {
        return scallingFactorX.length;
    }

    function getMgmtFeeFactorLength() public view returns (uint256) {
        return mgmtFeesHistory.length;
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

    /** @dev See {ERC20-allowance}. We don't revert directly in this function because
     *  it throws unreachable code warnings during compilation unlike ERC 20 approve function
     * */
    function allowance(
        address owner,
        address spender
    ) public view virtual override(ERC20, IERC20) onlyOwner returns (uint256) {
        return super.allowance(owner, spender);
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
