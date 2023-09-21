// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SmartToken.sol";
import "./BaseContract.sol";
import "./../interfaces/IERC20Update.sol";

error TokenFactory__MethodNotAllowed();
error TokenFactory__InvalidDivision();
error TokenFactory__InvalidSequenceNumber();
error TokenFactory__InvalidNaturalRebase();
error TokenFactory__AlreadyInitialized();
error TokenFactory__InvalidSignature();
error TokenFactory__InvalidSignatureLength();
error TokenFactory__InvalidManagementFees();

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
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    BaseContract
{
    using MathUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;
    using SafeMathUpgradeable for uint32;

    // State variables

    RebaseElements[] private rebaseElements;
    mapping(address => UserRebaseElements) private userRebaseElements;
    uint256 private constant REBASE_INT_MULTIPLIER = 10 ** 18;

    SmartToken[] private smartTokenArray;
    mapping(address => uint256) private lastRebaseCount;
    IERC20Update private baseToken;
    uint8 private baseTokenDecimals;
    uint256 private interval;
    uint256 private lastTimeStamp;
    bool private smartTokenInitialized;
    address private signersAddress;
    mapping(uint256 => bool) private sequenceNumberApplied;
    //management fees
    uint32 private constant MGMT_FEE_SCALING_FACTOR = 100000;
    uint32 private managementFeesRate; //Mgmt fee is per day
    uint32[] private mgmtFeesHistory;
    mapping(address => uint256) private userMgmtFeeHistory;
    bool private managementFeeEnabled;
    uint256[] private mgmtFeeSum;
    uint256 private lastRebaseFees;
    address private treasuryWallet;

    struct ScheduledRebase {
        //ScheduledRebase
        uint256 sequenceNumber;
        bool isNaturalRebase;
        uint256 price;
        uint256 smartTokenXprice;
    }
    //Factors to be calculated at rebase
    struct RebaseElements {
        uint256 BalanceFactorXY;
        uint256 BalanceFactorUx;
        uint256 BalanceFactorUy;
    }
    struct UserRebaseElements {
        uint256 netX;
        uint256 netY;
        uint256 Ux;
        uint256 Uy;
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
    modifier onlyIntializedOnce() {
        if (smartTokenInitialized) {
            revert TokenFactory__AlreadyInitialized();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20Update baseTokenAddress,
        uint256 rebaseInterval, // in seconds
        address sanctionsContract_,
        address signersAddress_
    ) public initializer {
        __BaseContract_init(sanctionsContract_);
        __Ownable_init();
        __UUPSUpgradeable_init();

        baseToken = IERC20Update(baseTokenAddress);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : 18;
        interval = rebaseInterval;
        lastTimeStamp = block.timestamp;
        managementFeesRate = 0;
        mgmtFeesHistory.push(managementFeesRate);
        mgmtFeeSum.push(managementFeesRate);
        nextSequenceNumber = 1;
        smartTokenInitialized = false;
        signersAddress = signersAddress_;
        lastRebaseFees = 0;
        rebaseElements.push(
            RebaseElements({
                BalanceFactorXY: 1 * REBASE_INT_MULTIPLIER,
                BalanceFactorUx: 0,
                BalanceFactorUy: 0
            })
        );
    }

    function _authorizeUpgrade(
        address
    ) internal override(UUPSUpgradeable) onlyOwner {}

    //note: renaming this method to avoid conflicts with upgradable initialize
    function initializeSMART(
        SmartToken token1,
        SmartToken token2
    ) external onlyOwner onlyIntializedOnce {
        smartTokenInitialized = true;
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
                abi.encodeWithSelector(
                    IERC20MetadataUpgradeable.decimals.selector
                )
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
    function decimals() public view virtual returns (uint8) {
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
        //rebase the user
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

    function getUserRecords(
        address sender,
        address recipient
    ) external view onlySmartTokens returns (uint256[4] memory) {
        uint256 prevBalXsender = smartTokenArray[0].unScaledbalanceOf(sender);
        uint256 prevBalYsender = smartTokenArray[1].unScaledbalanceOf(sender);
        uint256 prevBalXrecipient = smartTokenArray[0].unScaledbalanceOf(
            recipient
        );
        uint256 prevBalYrecipient = smartTokenArray[1].unScaledbalanceOf(
            recipient
        );
        return (
            [
                prevBalXsender,
                prevBalYsender,
                prevBalXrecipient,
                prevBalYrecipient
            ]
        );
    }

    function transferRecords(
        address sender,
        address recipient,
        bool tokenType,
        uint256 amount,
        uint256 prevBalXsender,
        uint256 prevBalYsender,
        uint256 prevBalXrecipient,
        uint256 prevBalYrecipient
    ) external onlySmartTokens {
        uint256 newSenderX = tokenType
            ? prevBalXsender - amount
            : prevBalXsender;
        uint256 newSenderY = tokenType
            ? prevBalYsender
            : prevBalYsender - amount;
        uint256 newRecipientX = tokenType
            ? prevBalXrecipient + amount
            : prevBalXrecipient;
        uint256 newRecipientY = tokenType
            ? prevBalYrecipient
            : prevBalYrecipient + amount;
        userRebaseElements[sender] = UserRebaseElements(
            newSenderX,
            newSenderY,
            0,
            0
        );
        userRebaseElements[recipient] = UserRebaseElements(
            newRecipientX,
            newRecipientY,
            0,
            0
        );
    }

    function factoryMint(
        uint256 smartTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        uint256 prevBalX = smartTokenArray[0].unScaledbalanceOf(receiver);
        uint256 prevBalY = smartTokenArray[1].unScaledbalanceOf(receiver);

        uint256 assets = smartTokenArray[smartTokenIndex].previewMint(amount);
        smartTokenArray[smartTokenIndex].mintAsset(receiver, assets);
        //Update the virtual records
        UserRebaseElements memory currentElement = userRebaseElements[receiver];
        if (smartTokenIndex == 0) {
            currentElement.netX = prevBalX + assets;
        } else {
            currentElement.netY = prevBalY + assets;
        }
        currentElement.Ux = 0;
        currentElement.Uy = 0;
        userRebaseElements[receiver] = currentElement;
    }

    function factoryBurn(
        uint256 smartTokenIndex,
        address owner_,
        uint256 amount
    ) private {
        uint256 prevBalX = smartTokenArray[0].unScaledbalanceOf(owner_);
        uint256 prevBalY = smartTokenArray[1].unScaledbalanceOf(owner_);

        smartTokenArray[smartTokenIndex].burn(owner_, amount);
        //Update the virtual records
        UserRebaseElements memory currentElement = userRebaseElements[owner_];

        if (smartTokenIndex == 0) {
            currentElement.netX = prevBalX - amount;
        } else {
            currentElement.netY = prevBalY - amount;
        }
        currentElement.Ux = 0;
        currentElement.Uy = 0;
        userRebaseElements[owner_] = currentElement;
    }

    // function factoryTransfer(
    //     uint256 smartTokenIndex,
    //     address receiver,
    //     uint256 amount
    // ) private {
    //     smartTokenArray[smartTokenIndex].smartTransfer(receiver, amount);
    // }
    function factoryTreasuryTransfer(uint256 amount) private {
        smartTokenArray[0].smartTreasuryTransfer(address(this), amount);
        smartTokenArray[1].smartTreasuryTransfer(address(this), amount);
    }

    function executeRebase(
        bytes memory encodedData,
        bytes memory signature
    ) external stopRebase {
        ScheduledRebase memory rebaseCall = verifyAndDecode(
            signature,
            encodedData
        );

        if (
            rebaseCall.sequenceNumber < nextSequenceNumber ||
            sequenceNumberApplied[rebaseCall.sequenceNumber]
        ) {
            revert TokenFactory__InvalidSequenceNumber();
        }
        if (
            block.timestamp < (lastTimeStamp + interval) &&
            rebaseCall.isNaturalRebase
        ) {
            revert TokenFactory__InvalidNaturalRebase();
        }
        //This is to make sure that the sequence number can be applied only once

        sequenceNumberApplied[rebaseCall.sequenceNumber] = true;
        scheduledRebases.push(rebaseCall);

        if (rebaseCall.sequenceNumber == nextSequenceNumber) {
            rebase();
        }
    }

    //todo:

    function chargeFees() private {
        if (lastRebaseFees != 0) {
            //transfer to treasury wallet
            IERC20Update smartX = IERC20Update(address(smartTokenArray[0]));
            IERC20Update smartY = IERC20Update(address(smartTokenArray[1]));

            SafeERC20.safeTransfer(smartX, treasuryWallet, lastRebaseFees);
            SafeERC20.safeTransfer(smartY, treasuryWallet, lastRebaseFees);
        }
        //now we check if we have fees to charge for the upcoming rebase
        //totalSupply for X ===Y hence we care for only 1
        uint256 totalSupplyX = smartTokenArray[0].totalSupply();
        //total user fees
        uint256 fees = calculateManagementFee(totalSupplyX, true, 0);
        //here we create and hold
        factoryTreasuryTransfer(fees);
        lastRebaseFees = fees;
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

            //get previous rebase info
            RebaseElements memory lastRebase = rebaseElements[
                rebaseElements.length - 1
            ];

            uint256 smartTokenYprice = scheduledRebase.price -
                scheduledRebase.smartTokenXprice;
            uint256 minimumPrice = scheduledRebase.smartTokenXprice;
            if (
                scheduledRebase.smartTokenXprice >
                (scheduledRebase.price - scheduledRebase.smartTokenXprice)
            ) {
                minimumPrice =
                    scheduledRebase.price -
                    scheduledRebase.smartTokenXprice;
            }

            uint256 balanceFactorXY = lastRebase
                .BalanceFactorXY
                .mul(2)
                .mul(minimumPrice)
                .div(scheduledRebase.price);

            uint256 balanceFactorUx = lastRebase.BalanceFactorUx +
                (
                    lastRebase
                        .BalanceFactorXY
                        .mul(
                            scheduledRebase.smartTokenXprice > smartTokenYprice
                                ? (scheduledRebase.smartTokenXprice -
                                    smartTokenYprice)
                                : 0
                        )
                        .div(scheduledRebase.price)
                );

            uint256 balanceFactorUy = lastRebase.BalanceFactorUy +
                (
                    lastRebase
                        .BalanceFactorXY
                        .mul(
                            smartTokenYprice > scheduledRebase.smartTokenXprice
                                ? (smartTokenYprice -
                                    scheduledRebase.smartTokenXprice)
                                : 0
                        )
                        .div(scheduledRebase.price)
                );
            rebaseElements.push(
                RebaseElements({
                    BalanceFactorXY: balanceFactorXY,
                    BalanceFactorUx: balanceFactorUx,
                    BalanceFactorUy: balanceFactorUy
                })
            );

            if (managementFeeEnabled && scheduledRebase.isNaturalRebase) {
                mgmtFeesHistory.push(managementFeesRate);
                updateManagementFeeSum(); //todo: we dont need this anymore?
                //we transfer fees that we had for last rebase to our wallet
                chargeFees();
            }

            emit Rebase(getRebaseNumber());

            //other items

            nextSequenceNumber++;

            removeRebase(i);

            // Do not increment i if we just removed an element from the array
            if (i >= scheduledRebases.length && i > 0) {
                i--;
            }
        }
    }

    function applyRebase(address owner_) public stopRebase {
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
            // factoryTransfer(
            //     0,
            //     address(this),
            //     (initialAsset1ValueEth - asset1ValueEth)
            // );
            // factoryTransfer(
            //     1,
            //     address(this),
            //     (initialAsset2ValueEth - asset2ValueEth)
            // );
            // emit Deposit(
            //     owner_,
            //     address(this),
            //     (initialAsset1ValueEth - asset1ValueEth),
            //     (initialAsset2ValueEth - asset2ValueEth)
            // );
            factoryBurn(0, owner_, initialAsset1ValueEth - asset1ValueEth);
            factoryBurn(1, owner_, initialAsset2ValueEth - asset2ValueEth);
            //update user fee history
            userMgmtFeeHistory[owner_] = getMgmtFeeFactorLength() - 1;
        }

        //normal rebase operations
        (uint256 asset1Units, uint256 asset2Units) = calculateRollOverValue(
            owner_
        );
        lastRebaseCount[owner_] = getRebaseNumber();

        if (asset1Units > asset1ValueEth) {
            factoryMint(0, owner_, (asset1Units - asset1ValueEth));
        } else {
            factoryBurn(0, owner_, (asset1ValueEth - asset1Units));
        }

        if (asset2Units > asset2ValueEth) {
            factoryMint(1, owner_, (asset2Units - asset2ValueEth));
        } else {
            factoryBurn(1, owner_, (asset2ValueEth - asset2Units));
        }

        emit RebaseApplied(owner_, getRebaseNumber());
    }

    function calculateRollOverValue(
        address owner_
    ) public view returns (uint256, uint256) {
        RebaseElements memory lastRebase = rebaseElements[
            rebaseElements.length - 1
        ];

        RebaseElements memory lastUserRebase = rebaseElements[
            (lastRebaseCount[owner_])
        ];

        UserRebaseElements memory userLastRebaseInfo = userRebaseElements[
            owner_
        ];

        uint256 netX = userLastRebaseInfo
            .netX
            .mul(lastRebase.BalanceFactorXY)
            .div(lastUserRebase.BalanceFactorXY);

        uint256 netY = userLastRebaseInfo
            .netY
            .mul(lastRebase.BalanceFactorXY)
            .div(lastUserRebase.BalanceFactorXY);

        uint256 uX = (
            (lastRebase.BalanceFactorUx - lastUserRebase.BalanceFactorUx)
                .mul(userLastRebaseInfo.netX)
                .div(lastUserRebase.BalanceFactorXY)
        ) + userLastRebaseInfo.Ux;
        uint256 uY = (
            (lastRebase.BalanceFactorUy - lastUserRebase.BalanceFactorUy)
                .mul(userLastRebaseInfo.netY)
                .div(lastUserRebase.BalanceFactorXY)
        ) + userLastRebaseInfo.Uy;

        return ((netX + uX + uY), (netY + uY + uX)); //X,Y and info
    }

    function updateUserLastRebaseCount(address owner_) public {
        if (
            smartTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            smartTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            lastRebaseCount[owner_] = getRebaseNumber();
        }
    }

    /*
    note: The following functions will be used to decode the encoded data as well as verify
    the signature in the function call
     */

    function verifyAndDecode(
        bytes memory signature,
        bytes memory encodedData
    ) private view returns (ScheduledRebase memory) {
        bytes32 hash = keccak256(encodedData);
        bytes32 ethSignedMessageHash = ECDSAUpgradeable.toEthSignedMessageHash(
            hash
        );
        // Recover the address
        address recoveredAddress = ECDSAUpgradeable.recover(
            ethSignedMessageHash,
            signature
        );

        // Verify the address
        if (recoveredAddress != signersAddress) {
            revert TokenFactory__InvalidSignature();
        }

        // If the signature is valid, decode the encodedData
        (
            uint256 sequenceNumber,
            bool isNaturalRebase,
            uint256 underlyingValue,
            uint256 smartTokenXValue
        ) = abi.decode(encodedData, (uint256, bool, uint256, uint256));
        ScheduledRebase memory data = ScheduledRebase(
            sequenceNumber,
            isNaturalRebase,
            underlyingValue,
            smartTokenXValue
        );
        return data;
    }

    function setSignersAddress(address addr) public onlyOwner {
        signersAddress = addr;
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
        if (!(rate <= MGMT_FEE_SCALING_FACTOR)) {
            revert TokenFactory__InvalidManagementFees();
        }
        managementFeesRate = rate;
        return true;
    }

    function setManagementFeeState(
        bool state
    ) external onlyOwner returns (bool) {
        managementFeeEnabled = state;
        return true;
    }

    function setTreasuryWallet(
        address wallet
    ) external onlyOwner returns (bool) {
        treasuryWallet = wallet;
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
            lastRebaseCount[user] != getRebaseNumber()
        ) {
            applyRebase(user);
        }
    }

    function removeRebase(uint256 index) private nonReentrant {
        scheduledRebases[index] = scheduledRebases[scheduledRebases.length - 1];
        scheduledRebases.pop();
    }

    //  other getter methods
    function getSignersAddress() public view returns (address) {
        return signersAddress;
    }

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

    function getRebaseNumber() public view returns (uint256) {
        return rebaseElements.length - 1; //adjusted since rebaseElements is also filled on initialization
    }

    function getMgmtFeeFactorLength() public view returns (uint256) {
        return mgmtFeesHistory.length;
    }

    function getUserLastRebaseCount(
        address userAddress
    ) public view returns (uint256) {
        return lastRebaseCount[userAddress];
    }

    function getSmartTokenAddress(
        uint8 index
    ) public view returns (SmartToken) {
        return smartTokenArray[index];
    }

    function getTreasuryAddress() public view returns (address) {
        return treasuryWallet;
    }

    function getInterval() public view returns (uint256) {
        return interval;
    }
}
