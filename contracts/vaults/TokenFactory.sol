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
import "./../lib/Shared.sol";

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
    //errors
    error TokenFactory__MethodNotAllowed();
    error TokenFactory__InvalidDivision();
    error TokenFactory__InvalidSequenceNumber();
    error TokenFactory__InvalidNaturalRebase();
    error TokenFactory__AlreadyInitialized();
    error TokenFactory__InvalidSignature();
    error TokenFactory__InvalidSignatureLength();
    error TokenFactory__InvalidManagementFees();

    using MathUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;
    using SafeMathUpgradeable for uint32;

    // State variables

    RebaseElements[] private rebaseElements;
    mapping(address => UserRebaseElements) private userRebaseElements;
    uint256 private constant REBASE_INT_MULTIPLIER = 10 ** 18;

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
    //management fees
    uint256 private managementFeesRate; //Mgmt fee is per day & scalin Factor is now 10E18
    bool private managementFeeEnabled;
    uint256 private lastRebaseFees;
    address private treasuryWallet;
    address private orchestrator;

    //Factors to be calculated at rebase
    struct RebaseElements {
        uint256 BalanceFactorXY;
        uint256 BalanceFactorUx;
        uint256 BalanceFactorUy;
        uint256 FeeFactor;
    }
    struct UserRebaseElements {
        uint256 netX;
        uint256 netY;
        uint256 Ux;
        uint256 Uy;
    }

    /// @dev A mapping to hold the scheduled rebases.
    /// This helps in storing rebases in the order they are scheduled till they are all executed
    mapping(uint256 => Shared.ScheduledRebase) private scheduledRebases;

    uint256 private scheduledRebasesLength;

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
    modifier onlyOrchestrator() {
        if (_msgSender() != address(orchestrator)) {
            revert TokenFactory__MethodNotAllowed();
        }
        _;
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
        nextSequenceNumber = 1;
        smartTokenInitialized = false;
        signersAddress = signersAddress_;
        lastRebaseFees = 0;
        rebaseElements.push(
            RebaseElements({
                BalanceFactorXY: 1 * REBASE_INT_MULTIPLIER,
                BalanceFactorUx: 0,
                BalanceFactorUy: 0,
                FeeFactor: 1 * REBASE_INT_MULTIPLIER
            })
        );
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

    function initializeOrchestrator(address orchestrator_) external onlyOwner {
        orchestrator = orchestrator_;
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

    //for general users
    function updateRecord(
        bool tokenType,
        address account,
        uint256 amount
    ) external onlySmartTokens {
        uint256 prevBalX = smartTokenArray[0].unScaledbalanceOf(account);
        uint256 prevBalY = smartTokenArray[1].unScaledbalanceOf(account);
        userRebaseElements[account] = UserRebaseElements(
            tokenType ? amount : prevBalX,
            tokenType ? prevBalY : amount,
            0,
            0
        );
    }

    //for treasury only
    function updateRecord(
        bool tokenType,
        uint256 amount
    ) external onlySmartTokens {
        uint256 prevBalX = smartTokenArray[0].unScaledbalanceOf(address(this));
        uint256 prevBalY = smartTokenArray[1].unScaledbalanceOf(address(this));

        userRebaseElements[address(this)] = UserRebaseElements(
            tokenType ? (prevBalX + amount) : prevBalX,
            tokenType ? prevBalY : (prevBalY + amount),
            0,
            0
        );
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
        uint256 prevBalX = smartTokenArray[0].unScaledbalanceOf(receiver);
        uint256 prevBalY = smartTokenArray[1].unScaledbalanceOf(receiver);

        uint256 assets = smartTokenArray[smartTokenIndex].previewMint(amount);
        // Mint either riskON/OFF to the receiver. Please see 'mintAsset' in SmartToken contract for more info.
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

    //create and transfer fees to tokenFactory to hold for 1 rebase
    function factoryTreasuryTransfer(uint256 amount) private {
        smartTokenArray[0].smartTreasuryTransfer(address(this), amount);
        smartTokenArray[1].smartTreasuryTransfer(address(this), amount);
    }

    //Adjust balance of users based on applied rebase
    function factoryBalanceAdjust(
        address account,
        uint256 amountX,
        uint256 amountY
    ) private {
        smartTokenArray[0].smartBalanceAdjust(account, amountX);
        smartTokenArray[1].smartBalanceAdjust(account, amountY);
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
    ) external stopRebase onlyOrchestrator {
        // Decodes and verifies the rebase params data against the provided signature.
        Shared.ScheduledRebase memory rebaseCall = verifyAndDecode(
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
            rebaseCall.isNaturalRebase &&
            block.timestamp <
            (lastTimeStamp +
                (interval *
                    ((rebaseCall.sequenceNumber - nextSequenceNumber) + 1)))
        ) {
            revert TokenFactory__InvalidNaturalRebase();
        }
        // Mark the sequence number as applied to prevent future rebases with the same sequence number.
        sequenceNumberApplied[rebaseCall.sequenceNumber] = true;
        // Store the rebase data for later use if we have a gap in the sequence numbers
        scheduledRebases[rebaseCall.sequenceNumber] = rebaseCall;
        // increment the length of the scheduled rebases
        scheduledRebasesLength++;

        // If the sequence number matches the next expected sequence number, execute the rebase.
        if (rebaseCall.sequenceNumber == nextSequenceNumber) {
            rebase();
        }
    }

    /**
     * @notice Executes scheduled rebases pending in the queue
     * @dev This function is called when the scheduled rebase queue had more than 5 entries
     * only 5 will be executed and the rest will be left in the queue
     */
    function executeScheduledRebases() external stopRebase onlyOrchestrator {
        if (
            scheduledRebasesLength > 0 &&
            scheduledRebases[nextSequenceNumber].sequenceNumber ==
            nextSequenceNumber
        ) {
            rebase();
        }
    }

    ///@notice Charges the management fees
    ///@dev This function is responsible for charging the fees of the whole universe
    /// and related functionalities.
    function chargeFees() private {
        if (
            lastRebaseFees != 0 ||
            smartTokenArray[0].balanceOf(address(this)) > 0
        ) {
            //We check and apply rebase to the contract and treasury address
            rebaseCheck(address(this));
            rebaseCheck(treasuryWallet);

            //We charge the fees due by the contract as well
            lastRebaseFees -= calculateManagementFee(lastRebaseFees, true, 0);

            uint256 fee = (smartTokenArray[0].balanceOf(address(this)) >=
                lastRebaseFees &&
                smartTokenArray[1].balanceOf(address(this)) >= lastRebaseFees &&
                lastRebaseFees != 0)
                ? lastRebaseFees
                : (
                    smartTokenArray[0].balanceOf(address(this)) <
                        smartTokenArray[1].balanceOf(address(this))
                        ? smartTokenArray[0].balanceOf(address(this))
                        : smartTokenArray[1].balanceOf(address(this))
                );

            smartTokenArray[0].transfer(treasuryWallet, fee);
            smartTokenArray[1].transfer(treasuryWallet, fee);
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

    /// @notice Handles the actual rebasing mechanism.
    /// @dev This function processes up to 5 scheduled rebases per call.
    /// Different factors that will help calculating user balances are calculated here
    /// using the rebase params.
    //@note This is deprecated and will be replaced in upcoming commits
    function rebase() private {
        uint256 i = 0;
        while (i < 5) {
            // a maximum of 5 rebases per transaction
            Shared.ScheduledRebase memory scheduledRebase = scheduledRebases[
                nextSequenceNumber
            ];
            // Skip to the next iteration if the sequence number doesn't match
            if (scheduledRebase.sequenceNumber != nextSequenceNumber) {
                break;
            }
            //rebase functionalities
            // Update the last timestamp if it's a natural rebase
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
            uint256 feeFactor = lastRebase
                .FeeFactor
                .mul(
                    REBASE_INT_MULTIPLIER -
                        (
                            scheduledRebase.isNaturalRebase
                                ? managementFeesRate.mul(interval).div(1 days)
                                : 0
                        )
                )
                .div(REBASE_INT_MULTIPLIER);

            rebaseElements.push(
                RebaseElements({
                    BalanceFactorXY: balanceFactorXY,
                    BalanceFactorUx: balanceFactorUx,
                    BalanceFactorUy: balanceFactorUy,
                    FeeFactor: feeFactor
                })
            );

            if (managementFeeEnabled && scheduledRebase.isNaturalRebase) {
                //we transfer fees that we had for last rebase to our wallet
                chargeFees();
            }

            emit Rebase(getRebaseNumber());

            // Remove the processed rebase from the queue using the sequence number
            removeRebase(nextSequenceNumber);

            // Increment the sequence number for the next rebase to be processed
            // this must be done after removing the previous rebase from the queue to avoid removing the wrong rebase
            nextSequenceNumber++;
            // Increment the counter
            i++;
        }
    }

    /// @notice Applies rebase to an account
    /// @dev This function adjusts the balance of smart tokens(RiskON/RiskOFF) according to the rollOverValue.
    /// This function can only be called when rebase is stopped. It also calculates and applies management fees.
    //@note This is deprecated and will be replaced in upcoming commits
    /// @param owner_ The address of the account to which the rebase will be applied.
    function applyRebase(address owner_) public stopRebase {
        //normal rebase operations
        (uint256 assetX, uint256 assetY) = calculateRollOverValue(owner_);
        lastRebaseCount[owner_] = getRebaseNumber();
        factoryBalanceAdjust(owner_, assetX, assetY);
        emit RebaseApplied(owner_, getRebaseNumber());
    }

    /// @notice Calculates the rollover value(Units of RiskON/OFF) for an account
    /// @dev This function calculates the net balance(Units of RiskON/OFF) of a user after rebase and
    /// management fees are applied.
    //@note This is deprecated and will be replaced in upcoming commits
    /// @param owner_ The address of the owner
    /// @return The calculated roll over value.
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

        return (
            (netX + uX + uY).mul(lastRebase.FeeFactor).div(
                lastUserRebase.FeeFactor
            ),
            (netY + uY + uX).mul(lastRebase.FeeFactor).div(
                lastUserRebase.FeeFactor
            )
        ); //X,Y
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
            lastRebaseCount[owner_] = getRebaseNumber();
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
    ) public view returns (Shared.ScheduledRebase memory) {
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
        Shared.ScheduledRebase memory data = Shared.ScheduledRebase(
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
        uint256 rate
    ) external onlyOwner returns (bool) {
        if (!(rate <= REBASE_INT_MULTIPLIER)) {
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

    function setTreasuryWallet(
        address wallet
    ) external onlyOwner returns (bool) {
        treasuryWallet = wallet;
        return true;
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
            .div(REBASE_INT_MULTIPLIER);

        return userFees;
    }

    /// @notice Checks if a user is an existing user and applies user rebase when needed.
    /// @dev This function is triggered to ensure a user's balances are updated with any rebases
    /// that have occurred since their last interaction with the contract.
    /// @param user The address of the user
    function rebaseCheck(address user) private {
        if (
            // Verify if the user is an existing user and if they have missed any rebase operations.
            lastRebaseCount[user] != 0 &&
            lastRebaseCount[user] != getRebaseNumber()
        ) {
            // Apply rebase
            applyRebase(user);
        }
    }

    /// @notice Removes a rebase entry from the `scheduledRebases` mapping at the given sequence number.
    /// @dev It deletes the entry at the given sequence number and decrements the `scheduledRebasesLength` variable.
    /// It is also guarded by 'nonReentrant' modifier.
    /// @param sequenceNumber The sequenceNumber of the `scheduledRebases` mapping to remove.
    function removeRebase(uint256 sequenceNumber) private nonReentrant {
        delete scheduledRebases[sequenceNumber];
        scheduledRebasesLength--;
    }

    /// @notice Retrieves the address of the signer
    /// @dev This function is a getter for the `signersAddress` variable.
    /// @return The address of the authorized signer.
    function getSignersAddress() public view returns (address) {
        return signersAddress;
    }

    /// @notice Retrieves the `scheduledRebase` struct at the given sequence number.
    /// @dev This function is a getter for a single `scheduledRebase` struct.
    /// @param sequenceNumber The sequence number of the `scheduledRebases` mapping to retrieve.
    /// @return The `scheduledRebase` struct at the given sequence number.
    function getScheduledRebases(
        uint256 sequenceNumber
    ) public view returns (Shared.ScheduledRebase memory) {
        return scheduledRebases[sequenceNumber];
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

    function getManagementFeeRate() public view returns (uint256) {
        return managementFeesRate;
    }

    /// @notice Retrieves the managementFeeEnabled
    /// @dev This function is a getter for the `managementFeeEnabled` variable.
    /// @return The managementFeeEnabled
    function getManagementFeeState() public view returns (bool) {
        return managementFeeEnabled;
    }

    function getRebaseNumber() public view returns (uint256) {
        return rebaseElements.length - 1; //adjusted since rebaseElements is also filled on initialization
    }

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

    function getTreasuryAddress() public view returns (address) {
        return treasuryWallet;
    }

    /// @notice Retrieves the interval
    /// @dev This function is a getter for the `interval` variable.
    /// @return The interval
    function getInterval() public view returns (uint256) {
        return interval;
    }
}
