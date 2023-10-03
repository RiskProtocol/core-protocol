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

/// @title The Vault or TokenFactory contract.
/// @notice The main purposes of this contract is to act as a vault as well as it contains the shared logic
/// used by riskON/OFF tokens.
/// @dev Acts as the vault for holding the underlying assets/tokens. Also contains shared logic used by riskON/OFF
// for multi purposes such as deposit or withdrawal. This contract is also responsible for rebases and related logic as
// well as charging Asset under mamangemnt fees.
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
    //@note This is deprecated and will be replaced in upcoming commits
    uint256[] private scallingFactorX;
    /// @notice This is the array of the smart tokens(RiskON/OFF)
    SmartToken[] private smartTokenArray;
    /// @notice This mapping keeps track of the last rebase applied to a user/address
    mapping(address => uint256) private lastRebaseCount;
    /// @notice This is the instance of the underlying Token
    IERC20Update private baseToken;
    /// @notice The number of decimals of the underlying Asset/Token
    uint8 private baseTokenDecimals;
    /// @notice The rebase interval in seconds
    uint256 private interval;
    /// @notice The timestamp of the last rebase
    uint256 private lastTimeStamp;
    /// @notice This boolean keeps track if the smart tokens(RiskON/OFF) have already been initialized in the system
    bool private smartTokenInitialized;
    /// @notice This is the signers address of RP api's that generate encoded params for rebase
    address private signersAddress;
    /// @notice This keeps track of the 'sequenceNumber' of a rebase which helps guarding against the same rebase being
    // applied twice in the system
    mapping(uint256 => bool) private sequenceNumberApplied;
    //management fees scaling factor
    uint32 private constant MGMT_FEE_SCALING_FACTOR = 100000;
    /// @notice This keeps track of the management fee rate, which is in terms of point per day. example 0.02% per day
    uint32 private managementFeesRate;
    //@note This is deprecated and will be replaced in upcoming commits
    uint32[] private mgmtFeesHistory;
    //@note This is deprecated and will be replaced in upcoming commits
    mapping(address => uint256) private userMgmtFeeHistory;
    /// @notice This keeps track if the management fee is enabled or disabled in the system
    bool private managementFeeEnabled;
    //@note This is deprecated and will be replaced in upcoming commits
    uint256[] private mgmtFeeSum;

    /// @notice Struct to store information regarding a scheduled rebase.
    /// @dev This struct holds the data for rebases that are scheduled to be executed.
    struct ScheduledRebase {
        // A unique number assigned to each rebase, used to manage execution order and guard againts duplicates
        uint256 sequenceNumber;
        //Indicates whether this is a natural rebase (occurs at regular planned intervals) or an early rebase.
        bool isNaturalRebase;
        // The price of the underlying asset at the rebase time
        uint256 price;
        // The price of the smart token X at the rebase time
        uint256 smartTokenXprice;
    }
    /// @dev An array to hold all the scheduled rebases.
    /// This helps in storing rebases in the order they are scheduled till they are all executed
    ScheduledRebase[] private scheduledRebases;
    /// @dev A counter to generate a unique sequence number for each rebase.
    /// This ensures that rebases are executed in the order they are scheduled.
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
    /// @notice Ensures the caller is one of the SmartTokens(RiskOn/Off).
    /// @dev This modifier checks if the caller is either smartTokenArray[0] or smartTokenArray[1].
    ///      If not, it reverts with a custom error message.
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

    /// @notice Initializes(replacement for the constructor) the Vault (TokenFactory) contract with specified params
    /// @dev This function sets up the initial state of the TokenFactory contract. Callable only once.
    /// @param baseTokenAddress The address of the underlying token/asset
    /// @param rebaseInterval The interval (in seconds) at which natural rebases are scheduled.
    /// @param sanctionsContract_ The address of the sanctions contract(chainalysis contract) to verify
    /// blacklisted addresses
    /// @param signersAddress_ The address of the signer ( RP Api's) which signed the rebase data
    function initialize(
        IERC20Update baseTokenAddress,
        uint256 rebaseInterval, // in seconds
        address sanctionsContract_,
        address signersAddress_
    ) public initializer {
        //initialize deriving contracts

        __BaseContract_init(sanctionsContract_);
        __Ownable_init();
        __UUPSUpgradeable_init();

        baseToken = IERC20Update(baseTokenAddress);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : 18;
        interval = rebaseInterval;
        // We assign the lastTimeStamp to the timestamp at the beginning of the system
        lastTimeStamp = block.timestamp;
        managementFeesRate = 0;
        //@note This is deprecated and will be replaced in upcoming commits
        mgmtFeesHistory.push(managementFeesRate);
        mgmtFeeSum.push(managementFeesRate);
        /// nextSequence starts at 1
        nextSequenceNumber = 1;
        smartTokenInitialized = false;
        signersAddress = signersAddress_;
    }

    /// @notice Authorizes an upgrade to a new contract implementation.
    /// @dev This function can only be called by the contract owner.
    /// It overrides the `_authorizeUpgrade` function from the `UUPSUpgradeable`
    /// contract to include the `onlyOwner` modifier, ensuring only the owner can authorize upgrades.
    function _authorizeUpgrade(
        address
    ) internal override(UUPSUpgradeable) onlyOwner {}

    /// @notice Initializes the smart tokens associated with this TokenFactory.
    /// renaming this method to avoid conflicts with upgradable initialize
    /// @dev This function can only be called once, and only by the contract owner.
    /// @param token1 The first smart token
    /// @param token2 The second smart token
    function initializeSMART(
        SmartToken token1,
        SmartToken token2
    ) external onlyOwner onlyIntializedOnce {
        // smartTokenInitialized is set to true, vault cannot be initialized with other SMARTs
        smartTokenInitialized = true;
        smartTokenArray.push(token1);
        smartTokenArray.push(token2);
    }

    /// @notice Attempts to fetch the decimals of underlying token
    /// @dev This function uses a static call to query the decimals from the asset.
    /// If the call fails or the returned data is invalid, it defaults to 0.
    /// @param asset_ The address of the underlying token
    /// @return A return vaule containing a boolean indicating success and the decimals of the token. or false
    /// if it failed somehow
    function _tryGetAssetDecimals(
        IERC20 asset_
    ) private view returns (bool, uint8) {
        // Performing a static call to the 'decimals' function of the underlying token
        (bool success, bytes memory encodedDecimals) = address(asset_)
            .staticcall(
                abi.encodeWithSelector(
                    IERC20MetadataUpgradeable.decimals.selector
                )
            );
        // Checking if the call was successful, the length of the returned data,
        // and the size of the decoded value.
        if (
            success &&
            encodedDecimals.length >= 32 &&
            abi.decode(encodedDecimals, (uint256)) <= type(uint8).max
        ) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            return (true, uint8(returnedDecimals));
        }
        // If any of the conditions are not met, return false with a default value of 0.
        return (false, 0);
    }

    /// @notice Fetches the decimal value of the underlying token
    /// @dev This function returns the value of decimals that was set in the 'initialize' method
    /// @return The number of decimals of the underlying token
    function decimals() public view virtual returns (uint8) {
        return baseTokenDecimals;
    }

    /// @notice Retrieves the instance of the underlying token contract
    /// @dev This function provides a way to access the instance of the underlying contract
    /// @return The instance of the underlying contract
    function getBaseToken() public view virtual returns (IERC20Update) {
        return baseToken;
    }

    /// @notice Returns the maximum amount of assets the owner can withdraw.
    /// @dev This function compares the balance of both smart tokens(RiskON/OFF) for the owner
    ///      and returns the balance of the smart token with the lesser amount.
    /// @param owner_ The address of the owner
    /// @return The maximum amount of assets the specified owner can withdraw.
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

    /// @notice Determines the maximum amount of shares owned by the owner
    /// @dev This function compares the balance of both smart tokens(RiskON/OFF) for the owner
    ///      and returns the balance of the smart token with the greater amount.
    /// @param owner_ The address of the owner
    /// @return The maximum amount of shares owned by the specified owner.
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
    /// @notice Deposit/mint common workflow, deposit underlying tokens, mints new shares(RiskON/OFF)
    /// to the receiver, and also charges management fees
    /// @dev This function can only be called by the smart tokens and requires the caller and
    /// receiver to not be sanctioned.
    /// @param caller The address of depositor
    /// @param receiver The address of receiver
    /// @param assets The amount of underlying tokens being deposited.
    /// @param shares The amount of shares(RiskON/OFF) to mint to the receiver.
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    )
        external
        virtual
        //Ensures that the caller and receiver is not sanctioned
        onlyNotSanctioned(caller)
        onlyNotSanctioned(receiver)
        //Ensures this method is called only by RiskON/Off
        onlySmartTokens
    {
        //Verify if receiver has any pending rebase and apply his pending ones if any
        rebaseCheck(receiver);
        // Transfer the underlying token from the caller to the Vault(tokenFactory/ THIS)
        SafeERC20.safeTransferFrom(baseToken, caller, address(this), assets);
        // If the user is new to the system, we update his last rebase count to the latest
        updateUserLastRebaseCount(receiver);
        //mgmtFeeslogic
        if (managementFeeEnabled) {
            //Calculate the management fees owed for the remaining period of the current rebase
            uint256 fees = calculateManagementFee(shares, true, 0);
            shares -= fees;
            // Mint the fees to the Vault(TokenFcatory/This) --
            //@note This is deprecated and will be replaced in upcoming commits
            factoryMint(0, address(this), fees);
            factoryMint(1, address(this), fees);
            emit Deposit(caller, address(this), fees, fees);
        }
        //@note This is deprecated and will be replaced in upcoming commits
        userMgmtFeeHistory[receiver] = getMgmtFeeFactorLength() - 1;
        //Mint the shares(RiskON/OFF) that the user should receive after the fees if any
        factoryMint(0, receiver, shares);
        factoryMint(1, receiver, shares);

        emit Deposit(caller, receiver, assets, shares);
    }

    /// @notice Withdraw/redeem common workflow. Handles the withdrawal of underlying token.
    /// burns shares(RiskON/OFF) from the caller, and refund any management fees
    /// @dev This function can only be called by the smart tokens and requires the caller and receiver
    /// to not be sanctioned.
    /// @param caller The address withdrawing.
    /// @param receiver The address receiving the underlying token.
    /// @param owner The owner of the shares.
    /// @param assets The amount of underlying Token being withdrawn.
    /// @param shares The amount of shares(RiskON/OFF) to burn from the caller.
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    )
        external
        virtual
        //Ensures that the caller and receiver is not sanctioned
        onlyNotSanctioned(caller)
        onlyNotSanctioned(receiver)
        //Ensures this method is called only by RiskON/Off
        onlySmartTokens
    {
        //Verify if receiver has any pending rebase and apply his pending ones if any
        rebaseCheck(receiver);
        //mgmt fees logic, initialize the feesRefund to 0
        uint256 feesRefund = 0;

        if (managementFeeEnabled) {
            //Calculate the management fees refund for the remaining period of the current rebase
            feesRefund = calculateManagementFee(assets, true, 0);
            //Burn the refunded fees from the Vault(TokenFactory/This)
            factoryBurn(0, address(this), feesRefund);
            factoryBurn(1, address(this), feesRefund);
            emit Withdraw(caller, address(this), owner, feesRefund, feesRefund);
        }
        //Burn the Shares(RiskON/OFF) the owner wants to withdraw
        factoryBurn(0, caller, assets);
        factoryBurn(1, caller, assets);
        if (feesRefund > 0) {
            assets += feesRefund;
        }
        //Transfer the corresponding amount of underlying token/assets to the receiver
        SafeERC20.safeTransfer(baseToken, receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    /// @notice Mints the specified amount of Shares(RiskON/OFF) to the receiver
    /// @dev It first previews the minting process to get the amount of Shares(RiskON/OFF)that will be minted,
    /// and then performs the actual minting.
    /// @param smartTokenIndex The index of the smart token in the smartTokenArray.
    /// @param receiver The address of the receiver
    /// @param amount The amount of Shares(RiskON/OFF) to mint.
    function factoryMint(
        uint256 smartTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        //Preview the minting amount. Please see 'previewMint' in SmartToken contract for more info.
        uint256 assets = smartTokenArray[smartTokenIndex].previewMint(amount);
        // Mint either riskON/OFF to the receiver. Please see 'mintAsset' in SmartToken contract for more info.
        smartTokenArray[smartTokenIndex].mintAsset(receiver, assets);
    }

    /// @notice Burns the specified amount of Shares(either of RiskON/OFF)from the owner
    /// @dev It calls the `burn` function on the smart token contract
    /// @param smartTokenIndex The index of the smart token in the `smartTokenArray`.
    /// @param owner_ The address of the owner
    /// @param amount The amount of Shares(either of RiskON/OFF)  to burn.
    function factoryBurn(
        uint256 smartTokenIndex,
        address owner_,
        uint256 amount
    ) private {
        // Burn either riskON/OFF of the owner. Please see 'burn' in SmartToken contract for more info
        smartTokenArray[smartTokenIndex].burn(owner_, amount);
    }

    //@note This is deprecated and will be replaced in upcoming commits
    function factoryTransfer(
        uint256 smartTokenIndex,
        address receiver,
        uint256 amount
    ) private {
        smartTokenArray[smartTokenIndex].smartTransfer(receiver, amount);
    }

    //@note This is deprecated and will be replaced in upcoming commits
    function subUnchecked(
        uint256 scallingFactorX_
    ) public view returns (uint256) {
        unchecked {
            return (10 ** decimals()) - scallingFactorX_;
        }
    }

    /// @notice Executes a rebase based on the provided encoded data and signature.
    /// @dev This function validates the rebase call, schedules it, and possibly triggers
    /// a rebase if the sequence is in order. It first verifies the signature of the rebase params with
    /// the signer's public key. Then we verify if the sequence number is aligned and not already used.
    /// Then we push the rebase params into an array of scheduled rebases. Finally, if there is no gaps between the
    /// previous rebase'sequence number, we execute this rebase
    /// This function can only be called when rebase is not stopped  with the `stopRebase` modifier.
    /// @param encodedData The encoded data containing the sequence number, the boolean value for natural rebase and the
    /// price of underlying and smartTokenX
    /// @param signature The signature of the encoded data to verify its authenticity.
    function executeRebase(
        bytes memory encodedData,
        bytes memory signature
    ) external stopRebase {
        // Decodes and verifies the rebase params data against the provided signature.
        ScheduledRebase memory rebaseCall = verifyAndDecode(
            signature,
            encodedData
        );
        // Checks if the sequence number of the rebase call is valid and not already applied.

        if (
            rebaseCall.sequenceNumber < nextSequenceNumber ||
            sequenceNumberApplied[rebaseCall.sequenceNumber]
        ) {
            revert TokenFactory__InvalidSequenceNumber();
        }
        // Checks if the current block timestamp is valid for a natural rebase.
        if (
            block.timestamp < (lastTimeStamp + interval) &&
            rebaseCall.isNaturalRebase
        ) {
            revert TokenFactory__InvalidNaturalRebase();
        }
        // Mark the sequence number as applied to prevent future rebases with the same sequence number.
        sequenceNumberApplied[rebaseCall.sequenceNumber] = true;
        // Store the rebase data for later use if we have a gap in the sequence numbers
        scheduledRebases.push(rebaseCall);
        // If the sequence number matches the next expected sequence number, execute the rebase.
        if (rebaseCall.sequenceNumber == nextSequenceNumber) {
            rebase();
        }
    }

    /// @notice Handles the actual rebasing mechanism.
    /// @dev This function processes up to 5 scheduled rebases per call.
    /// Different factors that will help calculating user balances are calculated here
    /// using the rebase params.
    //@note This is deprecated and will be replaced in upcoming commits
    function rebase() private {
        uint256 i = 0;
        while (i < scheduledRebases.length && i < 5) {
            // a maximum of 5 rebases per transaction
            ScheduledRebase memory scheduledRebase = scheduledRebases[i];
            // Skip to the next iteration if the sequence number doesn't match
            if (scheduledRebase.sequenceNumber != nextSequenceNumber) {
                i++;
                continue;
            }
            //rebase functionalities
            // Update the last timestamp if it's a natural rebase
            if (scheduledRebase.isNaturalRebase) {
                lastTimeStamp += interval;
            }
            // Compute rebase price, asset price, and divisor for scaling
            // We assume that the prices are as such
            // if underlying has 18 decimals and the price of underlying is 2000$
            // Then the price is 2000 x 10e18
            // The same logic applies to the price of the smartTokenX.
            //@note This is deprecated and will be replaced in upcoming commits
            uint256 rebasePrice = scheduledRebase.price / 10 ** decimals();
            uint256 asset1Price = scheduledRebase.smartTokenXprice; //x 10e18
            uint256 divisor = rebasePrice.ceilDiv(2);
            // We store the scallingFactorX, which will help us later in calculating the
            // value of X and Y a user should get post rebase in the  'calculateRollOver' method
            //@note This is deprecated and will be replaced in upcoming commits
            scallingFactorX.push((asset1Price / 2) / divisor);
            if (managementFeeEnabled && scheduledRebase.isNaturalRebase) {
                // We calculate the cummulative sum of the management fees at every natural rebase whenever the
                // management fee is enabled. This would later help us to calculate fees of users for
                // cummulative rebase periods
                //@note This is deprecated and will be replaced in upcoming commits
                mgmtFeesHistory.push(managementFeesRate);
                updateManagementFeeSum();
            }

            emit Rebase(getScallingFactorLength());

            // Increment the sequence number for the next rebase
            nextSequenceNumber++;
            // Remove the processed rebase from the queue
            removeRebase(i);

            // Do not increment i if we just removed an element from the array
            if (i >= scheduledRebases.length && i > 0) {
                i--;
            }
        }
    }

    /// @notice Applies rebase to an account
    /// @dev This function adjusts the balance of smart tokens(RiskON/RiskOFF) according to the rollOverValue.
    /// This function can only be called when rebase is stopped. It also calculates and applies management fees.
    //@note This is deprecated and will be replaced in upcoming commits
    /// @param owner_ The address of the account to which the rebase will be applied.
    function applyRebase(address owner_) public stopRebase {
        // Retrieve unscaled balances of the owner for both smart tokens
        //for more info, please checkout 'unScaledbalanceOf' method in the SmartToken Contract
        uint256 asset1ValueEth = smartTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2ValueEth = smartTokenArray[1].unScaledbalanceOf(owner_);
        // Store initial unscaled balances for later comparison
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
            // Transfer management fees to the Vault(TokenFcatory), therefore the user pays
            // his pending fees
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
            //update user fee history so that he is not charged for management fees for the rebased periods
            userMgmtFeeHistory[owner_] = getMgmtFeeFactorLength() - 1;
        }

        // Calculate the rollOverValue for the owner, that is the new amount of RiskON/OFF he ll have post rebase
        // For more info, please check 'rollOverValue' method
        uint256 rollOverValue = calculateRollOverValue(owner_);
        // Update the owner's last rebase count
        lastRebaseCount[owner_] = getScallingFactorLength();
        // Adjust the owner's balances
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

    /// @notice Calculates the rollover value(Units of RiskON/OFF) for an account
    /// @dev This function calculates the net balance(Units of RiskON/OFF) of a user after rebase and
    /// management fees are applied.
    //@note This is deprecated and will be replaced in upcoming commits
    /// @param owner_ The address of the owner
    /// @return The calculated roll over value.
    function calculateRollOverValue(
        address owner_
    ) public view returns (uint256) {
        // Retrieve the scaling factor for the owner's last rebase
        uint256 scallingFactorX_ = scallingFactorX[lastRebaseCount[owner_]];
        uint256 scallingFactorY = subUnchecked(scallingFactorX_);
        // The denominator is 10 raised to the power of the number of underlying token
        uint256 denominator = 10 ** decimals();
        // Get the unscaled balances of the owner for both riskON/OFF
        uint256 asset1Balance = smartTokenArray[0].unScaledbalanceOf(owner_);
        uint256 asset2Balance = smartTokenArray[1].unScaledbalanceOf(owner_);

        //Calculate the net balance of user after rebases are to be applied
        // and after the management fees are applied
        //For more info, please checkout 'calculateMgmtFeeForRebase' method
        (asset1Balance, asset2Balance) = calculateMgmtFeeForRebase(
            owner_,
            asset1Balance,
            asset2Balance
        );
        //@note This is deprecated and will be replaced in upcoming commits
        uint256 rollOverValue = ((asset1Balance * scallingFactorX_) +
            (asset2Balance * scallingFactorY)) / denominator;
        return rollOverValue;
    }

    /// @notice Updates the last rebase count of a user.
    /// @dev This function sets the last rebase count for a user if their unscaled balances for
    /// both smart tokens(RiskON/RiskOFF) are zero. We may use this in cases where a receiever is new to the
    /// system
    /// @param owner_ The address of the user
    function updateUserLastRebaseCount(address owner_) public {
        if (
            smartTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            smartTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            // If both balances are zero, update the last rebase count of the owner to the current scaling factor length
            // Therefore user has no more pending rebases technically
            lastRebaseCount[owner_] = getScallingFactorLength();
        }
    }

    /// @notice Verifies the provided signature and decodes the encoded data into  `ScheduledRebase` struct.
    /// @dev It recovers the address from the Ethereum signed message hash and the provided `signature`.
    /// If the recovered address doesn't match the `signersAddress`, it reverts the transaction.
    /// If the signature is valid, it decodes the `encodedData` into a `ScheduledRebase` struct and returns it.
    /// @param signature The signature to be verified.
    /// @param encodedData The data to be decoded into a `ScheduledRebase` struct.
    /// @return data A `ScheduledRebase` struct containing the decoded data.
    function verifyAndDecode(
        bytes memory signature,
        bytes memory encodedData
    ) private view returns (ScheduledRebase memory) {
        // Hash the encoded data
        bytes32 hash = keccak256(encodedData);
        // Convert the hash to an Ethereum signed message hash
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

        // If the signature is valid, decode the encodedData into a  `ScheduledRebase` struct
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

    /// @notice Update the address authorized to sign rebase transactions.
    /// @dev This function can only be called by the owner of the contract.
    /// It updates the `signersAddress` address with the provided `addr` address.
    /// @param addr The new address
    function setSignersAddress(address addr) public onlyOwner {
        signersAddress = addr;
    }

    /// @notice Updates the rate of management fees.
    /// @dev It updates the `managementFeesRate` state variable with the provided `rate` value,
    /// if the rate is within a valid range, otherwise, it reverts the transaction.
    /// The rate is in terms of percentage per day
    ///    scaling factor is 100000
    ///    Example 5% per day = 5000
    //@note This is deprecated and will be replaced in upcoming commits
    /// @param rate The new rate of management fees.
    /// @return A boolean value
    function setManagementFeeRate(
        uint32 rate
    ) external onlyOwner returns (bool) {
        if (!(rate <= MGMT_FEE_SCALING_FACTOR)) {
            revert TokenFactory__InvalidManagementFees();
        }
        managementFeesRate = rate;
        return true;
    }

    /// @notice Toggles the state of management fee collection.
    /// @dev This function can only be called by the contract owner.
    /// It either enables or disables the management fee collection
    /// @param state The new state of management fee collection.
    /// @return A boolean value
    function setManagementFeeState(
        bool state
    ) external onlyOwner returns (bool) {
        managementFeeEnabled = state;
        return true;
    }

    /// @notice Updates the cumulative sum of management fees over rebase cycles.
    /// @dev This function is called internally to maintain a commulative sum of management fees,
    /// which can be used for calculating fees owed over time.
    //@note This is deprecated and will be replaced in upcoming commits
    function updateManagementFeeSum() private {
        uint mgmtFeeCycleCount = getMgmtFeeFactorLength() - 1;

        mgmtFeeSum.push(mgmtFeeSum[mgmtFeeCycleCount - 1] + managementFeesRate);
    }

    /// @notice Calculates the management fee for a given amount over a particular time span.
    /// @dev It computes the management fee either using the default management fee rate or a provided fee rate.
    /// This function can be used both for deposit and withdrawal scenarios.
    /// @param amount The amount of RiskON/OFF to calculate the fee against.
    /// @param isDefault When set to true, the method uses the default management fee rate,
    // otherwise uses the value in the `mgmtFee` parameter.
    /// @param mgmtFee The management fee rate to use if `isDefault` is set to false.
    /// @return userFees The calculated management fee
    function calculateManagementFee(
        uint256 amount,
        bool isDefault,
        uint256 mgmtFee
    ) public view returns (uint256) {
        uint256 internalManagementFeesRate;
        if (isDefault) {
            // Use the default management fee rate if `isDefault` is true.
            internalManagementFeesRate = managementFeesRate;
        } else {
            // Otherwise, use the provided `mgmtFee`.
            internalManagementFeesRate = mgmtFee;
        }
        //estimate the nextRebase Timestamp
        uint256 nextRebaseTimeStamp = lastTimeStamp + interval;

        //Estimate the mgmt fee per interval with respect to the fees per day value
        //The management fee rate is in terms of points per day, please checkout 'setManagementFee' Method
        // for more info
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
        // deposit cycle should be atleast 1 second before rebase
        if (userDepositCycle == 0 || interval == 0) {
            revert TokenFactory__InvalidDivision();
        }
        //calculate user fees (Pro-rata)
        uint256 userFees = userDepositCycle
            .mul(mgmtFeesPerInterval)
            .mul(amount)
            .div(interval)
            .div(MGMT_FEE_SCALING_FACTOR);

        return userFees;
    }

    //This method is used to calculate mgmt fees when applying a rebase
    //@note This is deprecated and will be replaced in upcoming commits
    /// @notice Calculates the outstanding management fee for a token holder over past rebases.
    /// @dev It calculates any missed management fees from previous rebases, computes the fees and
    ///adjusts the RiskON/OFF values accordingly.
    /// @param tokensHolder The address of the owner
    /// @param asset1ValueEth The value of the first SmartTokenX(RiskON) held by the token holder.
    /// @param asset2ValueEth The value of the second SmartTokenY(RiskOFF) held by the token holder.
    /// @return The adjusted values of RiskON/OFF after deduction of any management fees.
    function calculateMgmtFeeForRebase(
        address tokensHolder,
        uint256 asset1ValueEth,
        uint256 asset2ValueEth
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

    /// @notice Checks if a user is an existing user and applies user rebase when needed.
    /// @dev This function is triggered to ensure a user's balances are updated with any rebases
    /// that have occurred since their last interaction with the contract.
    /// @param user The address of the user
    function rebaseCheck(address user) private {
        if (
            // Verify if the user is an existing user and if they have missed any rebase operations.
            lastRebaseCount[user] != 0 &&
            lastRebaseCount[user] != getScallingFactorLength()
        ) {
            // Apply rebase
            applyRebase(user);
        }
    }

    /// @notice Removes a rebase entry from the `scheduledRebases` array at a specific index.
    /// @dev It overwrites the rebase entry at the given index with the last entry in the array,
    /// and then removes the last entry.
    /// It is also guarded by 'nonReentrant' modifier.
    /// @param index The index in the `scheduledRebases` array of the rebase entry to remove.
    function removeRebase(uint256 index) private nonReentrant {
        scheduledRebases[index] = scheduledRebases[scheduledRebases.length - 1];
        scheduledRebases.pop();
    }

    /// @notice Retrieves the address of the signer
    /// @dev This function is a getter for the `signersAddress` variable.
    /// @return The address of the authorized signer.
    function getSignersAddress() public view returns (address) {
        return signersAddress;
    }

    /// @notice Retrieves the array of ScheduledRebase
    /// @dev This function is a getter for the `scheduledRebases` array variable.
    /// @return The array of the scheduledRebases.
    function getScheduledRebases()
        public
        view
        returns (ScheduledRebase[] memory)
    {
        return scheduledRebases;
    }

    /// @notice Retrieves the nextSequenceNumber
    /// @dev This function is a getter for the `nextSequenceNumber` variable.
    /// @return The anextSequenceNumber
    function getNextSequenceNumber() public view returns (uint256) {
        return nextSequenceNumber;
    }

    /// @notice Retrieves the lastTimeStamp
    /// @dev This function is a getter for the `lastTimeStamp` variable.
    /// @return The lastTimeStamp
    function getLastTimeStamp() external view onlyOwner returns (uint256) {
        return lastTimeStamp;
    }

    /// @notice Retrieves the managementFeesRate
    /// @dev This function is a getter for the `managementFeesRate` variable.
    /// @return The managementFeesRate
    function getManagementFeeRate() public view returns (uint32) {
        return managementFeesRate;
    }

    /// @notice Retrieves the managementFeeEnabled
    /// @dev This function is a getter for the `managementFeeEnabled` variable.
    /// @return The managementFeeEnabled
    function getManagementFeeState() public view returns (bool) {
        return managementFeeEnabled;
    }

    /// @notice Retrieves the length of scallingFactorX
    /// @dev This function is a getter for the length of `scallingFactorX` array.
    /// @return The length of scallingFactorX
    function getScallingFactorLength() public view returns (uint256) {
        return scallingFactorX.length;
    }

    /// @notice Retrieves the length of mgmtFeesHistory
    /// @dev This function is a getter for the length of `mgmtFeesHistory` array.
    /// @return The length of mgmtFeesHistory
    function getMgmtFeeFactorLength() public view returns (uint256) {
        return mgmtFeesHistory.length;
    }

    /// @notice Retrieves the UserLastRebaseCount
    /// @dev This function is a getter for the UserLastRebaseCount
    /// @param userAddress The address of the user whose rebase count is being queried.
    /// @return The UserLastRebaseCount
    function getUserLastRebaseCount(
        address userAddress
    ) public view returns (uint256) {
        return lastRebaseCount[userAddress];
    }

    /// @notice Retrieves the interval
    /// @dev This function is a getter for the `interval` variable.
    /// @param index The index of the SmartToken in the `smartTokenArray`.
    /// @return The interval
    function getSmartTokenAddress(
        uint8 index
    ) public view returns (SmartToken) {
        return smartTokenArray[index];
    }

    /// @notice Retrieves the interval
    /// @dev This function is a getter for the `interval` variable.
    /// @return The interval
    function getInterval() public view returns (uint256) {
        return interval;
    }
}
