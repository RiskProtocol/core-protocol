// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./SmartToken.sol";
import "./../libraries/PriceFeed.sol";
import "./BaseContract.sol";
import "./../interfaces/IERC20Update.sol";

error TokenFactory__MethodNotAllowed();
error TokenFactory__InvalidDivision();
error TokenFactory__InvalidSequenceNumber();

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
    ReentrancyGuard,
    Ownable,
    BaseContract {
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;
    using SafeMath for uint256;
    using SafeMath for uint8;
    using SafeMath for uint32;

    // State variables
    uint256[] private scallingFactorX;
    SmartToken[] private smartTokenArray;
    AggregatorV3Interface private immutable priceFeed;
    mapping(address => uint256) private lastRebaseCount;
    IERC20Update private immutable baseToken;
    uint8 private immutable baseTokenDecimals;
    uint256 private immutable interval;
    uint256 private lastTimeStamp;
    //management fees
    uint32 private constant MGMT_FEE_SCALING_FACTOR = 100000;
    uint32 private managementFeesRate;
    uint32[] private mgmtFeesHistory;
    mapping(address => uint256) private userMgmtFeeHistory;
    bool private managementFeeEnabled;
    uint256[] private mgmtFeeSum;

    struct ScheduledRebase {
        //ScheduledRebase
        uint256 sequenceNumber;
        bool isNaturalRebase;
    }

    ScheduledRebase[] private scheduledRebases;
    uint256 private nextSequenceNumber;

    // Events
    event RebaseApplied(address userAddress, uint256 rebaseCount);
    event Rebase(uint256 rebaseCount);
    event Deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    );
    event Withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    );

    modifier onlySmartTokens() {
        if (
            _msgSender() == address(smartTokenArray[0]) ||
            _msgSender() == address(smartTokenArray[1])
        ) {
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
        managementFeesRate = 0;
        mgmtFeesHistory.push(managementFeesRate);
        mgmtFeeSum.push(managementFeesRate);
        nextSequenceNumber = 1;
    }

    function initialize(SmartToken token1, SmartToken token2) external onlyOwner {
        smartTokenArray.push(token1);
        smartTokenArray.push(token2);
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
    function decimals() public view virtual override returns (uint8) {
        return baseTokenDecimals;
    }

    function getBaseToken() public view virtual returns (IERC20Update) {
        return baseToken;
    }

    /**
     * @dev Returns the maximum amount of assets the owner can withdraw.
     *      (ie this returns the smaller balance between token0 and token1)
     */
    function maxAmountToWithdraw(
        address owner_
    ) public view virtual returns (uint256) {
        if (
            smartTokenArray[0].balanceOf(owner_) >
            smartTokenArray[1].balanceOf(owner_)
        ) {
            return smartTokenArray[1].balanceOf(owner_);
        } else {
            return smartTokenArray[0].balanceOf(owner_);
        }
    }

    /**
     * @dev Returns the maximum amount of shares the account holds,
     *      (ie this returns the bigger balance between token0 and token1)
     *      this is not the max value the owner can withdraw.
     */
    function maxSharesOwned(
        address owner_
    ) public view virtual returns (uint256) {
        if (
            smartTokenArray[0].balanceOf(owner_) >
            smartTokenArray[1].balanceOf(owner_)
        ) {
            return smartTokenArray[0].balanceOf(owner_);
        } else {
            return smartTokenArray[1].balanceOf(owner_);
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
    )
        external
        virtual
        onlyNotSanctioned(caller)
        onlyNotSanctioned(receiver)
        onlySmartTokens
    {
        rebaseCheck(receiver);

        SafeERC20.safeTransferFrom(baseToken, caller, address(this), assets);
        updateUserLastRebaseCount(receiver);
        //mgmtFeeslogic
        if (managementFeeEnabled) {
            uint256 fees = calculateManagementFee(shares, true, 0);
            shares -= fees;
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
    )
        external
        virtual
        onlyNotSanctioned(caller)
        onlyNotSanctioned(receiver)
        onlySmartTokens
    {
        rebaseCheck(receiver);
        //mgmt fees logic
        uint256 feesRefund = 0;

        if (managementFeeEnabled) {
            feesRefund = calculateManagementFee(assets, true, 0);
            factoryBurn(0, address(this), feesRefund);
            factoryBurn(1, address(this), feesRefund);
            emit Withdraw(caller, address(this), owner, feesRefund, feesRefund);
        }
        factoryBurn(0, caller, assets);
        factoryBurn(1, caller, assets);
        if (feesRefund > 0) {
            assets += feesRefund;
        }
        SafeERC20.safeTransfer(baseToken, receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    function factoryMint(
        uint256 smartTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        uint256 assets = smartTokenArray[smartTokenIndex].previewMint(amount);
        smartTokenArray[smartTokenIndex].mintAsset(receiver, assets);
    }

    function factoryBurn(
        uint256 smartTokenIndex,
        address owner_,
        uint256 amount
    ) private {
        smartTokenArray[smartTokenIndex].burn(owner_, amount);
    }

    function factoryTransfer(
        uint256 smartTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        smartTokenArray[smartTokenIndex].smartTransfer(receiver, amount);
    }

    function subUnchecked(
        uint256 scallingFactorX_
    ) public view returns (uint256) {
        unchecked {
            return (10 ** decimals()) - scallingFactorX_;
        }
    }

    function executeRebase(
        uint256 sequenceNumber,
        bool isNaturalRebase
    ) external onlyOwner {
        if (sequenceNumber < nextSequenceNumber) {
            revert TokenFactory__InvalidSequenceNumber();
        }

        scheduledRebases.push(ScheduledRebase(sequenceNumber, isNaturalRebase));

        if (sequenceNumber == nextSequenceNumber) {
            rebase();
        }
    }

    function rebase() private {
        uint256 i = 0;
        while (i < scheduledRebases.length && i < 5) {
            // a maximum of 5 rebases per transaction
            ScheduledRebase memory scheduledRebase = scheduledRebases[i];

            if (scheduledRebase.sequenceNumber != nextSequenceNumber) {
                i++;
                continue;
            }
            //rebase functionalities
            if (scheduledRebase.isNaturalRebase) {
                lastTimeStamp += interval;
            }
            uint256 rebasePrice = priceFeed.getPrice() / 10 ** decimals();
            uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
            uint256 divisor = rebasePrice.ceilDiv(2);
            scallingFactorX.push(
                ((asset1Price * 10 ** decimals()) / 2) / divisor
            );
            if (managementFeeEnabled && scheduledRebase.isNaturalRebase) {
                mgmtFeesHistory.push(managementFeesRate);
                updateManagementFeeSum();
            }

            emit Rebase(getScallingFactorLength());

            //other items

            nextSequenceNumber++;

            removeRebase(i);

            // Do not increment i if we just removed an element from the array
            if (i >= scheduledRebases.length && i > 0) {
                i--;
            }
        }
    }

    function applyRebase(address owner_) public {
        uint256 asset1ValueEth = smartTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = smartTokenArray[1].unScaledbalanceOf(owner_);
        uint256 initialAsset1ValueEth = asset1ValueEth;
        uint256 initialAsset2ValueEth = asset2ValueEth;

        //calculate the net balance of users after the rebases are to be applied
        (asset1ValueEth, asset2ValueEth) = calculateMgmtFeeForRebase(
            owner_,
            asset1ValueEth,
            asset2ValueEth
        );
        //verify if the user really had any pending mgmt fees
        if (
            initialAsset1ValueEth != asset1ValueEth ||
            initialAsset2ValueEth != asset2ValueEth
        ) {
            factoryTransfer(
                0,
                address(this),
                (initialAsset1ValueEth - asset1ValueEth)
            );
            factoryTransfer(
                1,
                address(this),
                (initialAsset2ValueEth - asset2ValueEth)
            );
            emit Deposit(
                owner_,
                address(this),
                (initialAsset1ValueEth - asset1ValueEth),
                (initialAsset2ValueEth - asset2ValueEth)
            );
            //update user fee history
            userMgmtFeeHistory[owner_] = getMgmtFeeFactorLength() - 1;
        }

        //normal rebase operations
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

        uint256 asset1Balance = smartTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2Balance = smartTokenArray[1].unScaledbalanceOf(owner_);

        //Calculate the net balance of user after rebases are to be applied
        (asset1Balance, asset2Balance) = calculateMgmtFeeForRebase(
            owner_,
            asset1Balance,
            asset2Balance
        );

        uint256 rollOverValue = ((asset1Balance * scallingFactorX_) +
            (asset2Balance * scallingFactorY)) / denominator;
        return rollOverValue;
    }

    function updateUserLastRebaseCount(address owner_) public {
        if (
            smartTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            smartTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            lastRebaseCount[owner_] = getScallingFactorLength();
        }
    }

    /*
    Mgmt Fees Block
    note:rate is per day
    scaling factor is 100000
    Example 5% per day = 5000
     */

    function setManagementFeeRate(
        uint32 rate
    ) external onlyOwner returns (bool) {
        require(
            rate <= MGMT_FEE_SCALING_FACTOR,
            "The management fee rate cannot exeed 100 percent (100000)"
        );
        managementFeesRate = rate;
        return true;
    }

    function setManagementFeeState(
        bool state
    ) external onlyOwner returns (bool) {
        managementFeeEnabled = state;
        return true;
    }

    function updateManagementFeeSum() private {
        uint mgmtFeeCycleCount = getMgmtFeeFactorLength() - 1;

        mgmtFeeSum.push(mgmtFeeSum[mgmtFeeCycleCount - 1] + managementFeesRate);
    }

    function calculateManagementFee(
        uint256 amount, //amount to calculate fee against
        bool isDefault, //When set to true, the method takes the default management
        //fee to calculate, otherwise uses the value in the next parameter
        uint256 mgmtFee //calculates both for fee and refund // same cal/ in wei scale
    ) public view returns (uint256) {
        uint256 internalManagementFeesRate;
        if (isDefault) {
            internalManagementFeesRate = managementFeesRate;
        } else {
            internalManagementFeesRate = mgmtFee;
        }
        //estimate the nextRebase Timestamp
        uint256 nextRebaseTimeStamp = lastTimeStamp + interval;

        //Estimate the mgmt fee per interval with respect to the fees per day value
        uint256 mgmtFeesPerInterval = internalManagementFeesRate
            .mul(interval)
            .div(1 days);

        //User deposit or Withdrawal timestamp
        uint256 userTransacTimeStamp = block.timestamp;

        //Calculate the amount of time that the user will be in the system before next rebase
        //or calculate the time left before next rebase when the user exits the system
        uint256 userDepositCycle = 0;
        if (nextRebaseTimeStamp > userTransacTimeStamp) {
            userDepositCycle = nextRebaseTimeStamp - userTransacTimeStamp;
        } else {
            userDepositCycle = 0;
        }

        if (userDepositCycle == 0 || interval == 0) {
            revert TokenFactory__InvalidDivision();
        }
        //calculate user fees
        uint256 userFees = userDepositCycle
            .mul(mgmtFeesPerInterval)
            .mul(amount)
            .div(interval)
            .div(MGMT_FEE_SCALING_FACTOR);

        return userFees;
    }

    //This method is used to calculate mgmt fees when applying a rebase
    function calculateMgmtFeeForRebase(
        address tokensHolder, //address of the owner of the holding tokens
        uint256 asset1ValueEth, // Self descriptive, first asset
        uint256 asset2ValueEth // Self descriptive, second asset
    ) private view returns (uint256, uint256) {
        if (managementFeeEnabled) {
            uint256 numberOfFeesCycle = getMgmtFeeFactorLength() - 1; //through rebase only
            uint256 numberOfUserFeeCycle = userMgmtFeeHistory[tokensHolder]; //through rebase only

            //calculate if user missed any mgmt fees for previous rebases
            uint256 outstandingFeesCount = numberOfFeesCycle -
                numberOfUserFeeCycle;

            if (outstandingFeesCount > 0) {
                uint256 sumOfFees = 0;

                //find out the average fees the user missed since he last paid
                uint256 firstFeeMissedIndex = numberOfFeesCycle -
                    outstandingFeesCount;
                sumOfFees =
                    mgmtFeeSum[numberOfFeesCycle] -
                    mgmtFeeSum[firstFeeMissedIndex];

                //calculte the fees wrt to the average
                uint256 asset1ValueEthFees = calculateManagementFee(
                    asset1ValueEth,
                    false,
                    sumOfFees
                );

                uint256 asset2ValueEthFees = calculateManagementFee(
                    asset2ValueEth,
                    false,
                    sumOfFees
                );
                //update the token amount after fees payment
                asset1ValueEth -= asset1ValueEthFees;
                asset2ValueEth -= asset2ValueEthFees;
            }
        }
        return (asset1ValueEth, asset2ValueEth);
    }

    function rebaseCheck(address user) private {
        //checks if a user is an existing user and apply user rebase when needed
        if (
            lastRebaseCount[user] != 0 &&
            lastRebaseCount[user] != getScallingFactorLength()
        ) {
            applyRebase(user);
        }
    }

    function removeRebase(uint256 index) private nonReentrant {
        scheduledRebases[index] = scheduledRebases[scheduledRebases.length - 1];
        scheduledRebases.pop();
    }

    //  other getter methods
    function getScheduledRebases()
        public
        view
        returns (ScheduledRebase[] memory)
    {
        return scheduledRebases;
    }

    function getNextSequenceNumber() public view returns (uint256) {
        return nextSequenceNumber;
    }

    function getLastTimeStamp() external view onlyOwner returns (uint256) {
        return lastTimeStamp;
    }

    function getManagementFeeRate() public view returns (uint32) {
        return managementFeesRate;
    }

    function getManagementFeeState() public view returns (bool) {
        return managementFeeEnabled;
    }

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

    function getSmartTokenAddress(uint256 index) public view returns (SmartToken) {
        return smartTokenArray[index];
    }

    function getInterval() public view returns (uint256) {
        return interval;
    }

    // unwanted methods

    /** @dev See {ERC20-totalSupply}. */
    function totalSupply() public pure override returns (uint256) {
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
