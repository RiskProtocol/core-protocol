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
//  for multi purposes such as deposit or withdrawal.
//  This contract is also responsible for rebalances and related logic as
//  well as charging Asset under mamangemnt fees.
contract TokenFactory is
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    BaseContract
{
    //errors
    error TokenFactory__MethodNotAllowed();
    error TokenFactory__InvalidDivision();
    error TokenFactory__InvalidRebalanceParams();
    error TokenFactory__InvalidSequenceNumber();
    error TokenFactory__InvalidNaturalRebalance();
    error TokenFactory__AlreadyInitialized();
    error TokenFactory__InvalidSignature();
    error TokenFactory__InvalidSignatureLength();
    error TokenFactory__InvalidManagementFees();
    error TokenFactory__SmartTokenArrayOutOfBounds();

    using MathUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;
    using SafeMathUpgradeable for uint32;

    // State variables

    RebalanceElements[] private rebalanceElements;
    uint256[] private dailyFeeFactors;
    mapping(address => UserRebalanceElements) private userRebalanceElements;
    uint256 private constant REBALANCE_INT_MULTIPLIER = 10 ** 18;

    SmartToken[] private smartTokenArray;
    /// @notice This mapping keeps track of the last rebalance applied to a user/address
    mapping(address => uint256) private lastRebalanceCount;
    mapping(address => uint256) private lastdailyFFcount;
    /// @notice This is the instance of the underlying Token
    IERC20Update private baseToken;
    /// @notice The number of decimals of the underlying Asset/Token
    uint8 private baseTokenDecimals;
    /// @notice The rebalance interval in seconds
    uint256 private interval;
    /// @notice The timestamp of the last rebalance
    uint256 private lastTimeStamp;
    /// @notice This boolean keeps track if the smart tokens(RiskON/OFF) have already been initialized in the system
    bool private smartTokenInitialized;
    /// @notice This is the signers address of RP api's that generate encoded params for rebalance
    mapping(address => bool) private signers;
    /// @notice This is used by the feefactors method to calculate the fees
    uint256 private FFinterval;
    uint256 private FFLastTimeStamp;
    /// @notice This keeps track of the 'sequenceNumber' of a rebalance which helps
    //  guarding against the same rebalance being applied twice in the system
    mapping(uint256 => bool) private sequenceNumberApplied;
    //management fees
    uint256 private managementFeesRate; //Mgmt fee is per day & scalin Factor is now 10E18
    uint256 private managementFeesRateRebalance;
    bool private managementFeeEnabled;
    uint256 private lastRebalanceFees;
    address private treasuryWallet;
    address private orchestrator;

    //Native token
    bool private isNativeToken;

    //Factors to be calculated at rebalance
    struct RebalanceElements {
        uint256 BalanceFactorXY;
        uint256 BalanceFactorUx;
        uint256 BalanceFactorUy;
    }
    struct UserRebalanceElements {
        uint256 netX;
        uint256 netY;
        uint256 Ux;
        uint256 Uy;
    }

    /// @dev A mapping to hold the scheduled rebalances.
    /// This helps in storing rebalances in the order they are scheduled till they are all executed
    mapping(uint256 => Shared.ScheduledRebalance) private scheduledRebalances;

    uint256 private scheduledRebalancesLength;

    /// @dev A counter to generate a unique sequence number for each rebalance.
    /// This ensures that rebalances are executed in the order they are scheduled.
    uint256 private nextSequenceNumber;

    //ratelimits
    uint256 private period; //period is in seconds
    uint256 private withdrawLimit; //is in wei
    uint256 private depositLimit; //is in wei
    bool private hasWithdrawLimit;
    bool private hasDepositLimit;
    mapping(address => uint256) private currentWithdrawPeriodEnd;
    mapping(address => uint256) private currentWithdrawPeriodAmount;
    mapping(address => uint256) private currentDepositPeriodEnd;
    mapping(address => uint256) private currentDepositPeriodAmount;

    // Events
    event RebalanceApplied(address userAddress, uint256 rebalanceCount);
    event Rebalance(uint256 rebalanceCount);
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

    event WithdrawLimitToggled(bool enabled);
    event DepositLimitToggled(bool enabled);
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
    /// @param rebalanceInterval The interval (in seconds) at which natural rebalances are scheduled.
    /// @param sanctionsContract_ The address of the sanctions contract(chainalysis contract) to verify
    /// blacklisted addresses
    /// @param signersAddress_ The address of the signer ( RP Api's) which signed the rebalance data
    function initialize(
        IERC20Update baseTokenAddress,
        uint256 rebalanceInterval, // in seconds
        uint256 ffInterval, // in seconds
        address sanctionsContract_,
        address signersAddress_,
        address owner_,
        uint256 withdrawLimit_,
        uint256 depositLimit_,
        uint256 limitPeriod_,
        bool isNativeToken_
    ) public initializer {
        //initialize deriving contracts

        __BaseContract_init(sanctionsContract_);
        __Ownable_init();
        transferOwnership(owner_);
        __UUPSUpgradeable_init();

        baseToken = IERC20Update(baseTokenAddress);
        isNativeToken = isNativeToken_;
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : 18;
        interval = rebalanceInterval;
        // We assign the lastTimeStamp to the timestamp at the beginning of the system
        lastTimeStamp = block.timestamp;
        FFLastTimeStamp = block.timestamp;
        managementFeesRate = 0;
        nextSequenceNumber = 1;
        smartTokenInitialized = false;
        signers[signersAddress_] = true; //setting signer as true
        lastRebalanceFees = 0;
        rebalanceElements.push(
            RebalanceElements({
                BalanceFactorXY: 1 * REBALANCE_INT_MULTIPLIER,
                BalanceFactorUx: 0,
                BalanceFactorUy: 0
            })
        );
        //we also update the dailyfeefactors for the contract
        dailyFeeFactors.push(1 * REBALANCE_INT_MULTIPLIER);
        FFinterval = ffInterval;
        withdrawLimit = withdrawLimit_;
        depositLimit = depositLimit_;
        period = limitPeriod_;
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
        //Verify if receiver has any pending rebalance and apply his pending ones if any
        FFCheck(receiver);
        rebalanceCheck(receiver);
        // Transfer the underlying token from the caller to the Vault(tokenFactory/ THIS)
        SafeERC20.safeTransferFrom(baseToken, caller, address(this), assets);
        // If the user is new to the system, we update his last rebalance count to the latest
        updateUserLastFFCount(receiver);
        updateUserLastRebalanceCount(receiver);
        //mgmtFeeslogic
        if (managementFeeEnabled) {
            //Calculate the management fees owed for the remaining period of the current rebalance
            uint256 fees = calculateManagementFee(shares, 0);
            shares -= fees;
            // Mint the fees to the Vault(TokenFcatory/This) --
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
        //Verify if receiver has any pending rebalance and apply his pending ones if any
        FFCheck(receiver);
        rebalanceCheck(receiver);
        //mgmt fees logic, initialize the feesRefund to 0
        uint256 feesRefund = 0;

        if (managementFeeEnabled) {
            //Calculate the management fees refund for the remaining period of the current rebalance
            feesRefund = calculateManagementFee(assets, 0);
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
        userRebalanceElements[sender] = UserRebalanceElements(
            newSenderX,
            newSenderY,
            0,
            0
        );
        userRebalanceElements[recipient] = UserRebalanceElements(
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
        userRebalanceElements[account] = UserRebalanceElements(
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

        userRebalanceElements[address(this)] = UserRebalanceElements(
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
        UserRebalanceElements memory currentElement = userRebalanceElements[
            receiver
        ];
        if (smartTokenIndex == 0) {
            currentElement.netX = prevBalX + assets;
        } else {
            currentElement.netY = prevBalY + assets;
        }
        currentElement.Ux = 0;
        currentElement.Uy = 0;
        userRebalanceElements[receiver] = currentElement;
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
        UserRebalanceElements memory currentElement = userRebalanceElements[
            owner_
        ];

        if (smartTokenIndex == 0) {
            currentElement.netX = prevBalX - amount;
        } else {
            currentElement.netY = prevBalY - amount;
        }
        currentElement.Ux = 0;
        currentElement.Uy = 0;
        userRebalanceElements[owner_] = currentElement;
    }

    //create and transfer fees to tokenFactory to hold for 1 rebalance
    function factoryTreasuryTransfer(uint256 amount) private {
        smartTokenArray[0].smartTreasuryTransfer(address(this), amount);
        smartTokenArray[1].smartTreasuryTransfer(address(this), amount);
    }

    //Adjust balance of users based on applied rebalance
    function factoryBalanceAdjust(
        address account,
        uint256 amountX,
        uint256 amountY
    ) private {
        smartTokenArray[0].smartBalanceAdjust(account, amountX);
        smartTokenArray[1].smartBalanceAdjust(account, amountY);
    }

    /// @notice Executes a rebalance based on the provided encoded data and signature.
    /// @dev This function validates the rebalance call, schedules it, and possibly triggers
    /// a rebalance if the sequence is in order. It first verifies the signature of the rebalance params with
    /// the signer's public key. Then we verify if the sequence number is aligned and not already used.
    /// Then we push the rebalance params into an array of scheduled rebalances.
    /// Finally, if there is no gaps between the previous rebalance'sequence number, we execute this rebalance
    /// This function can only be called when rebalance is not stopped  with the `stopRebalance` modifier.
    /// @param encodedData The encoded data containing the sequence number,
    /// the boolean value for natural rebalance and the price of underlying and smartTokenX
    /// @param signature The signature of the encoded data to verify its authenticity.
    function executeRebalance(
        bytes memory encodedData,
        bytes memory signature
    ) external stopRebalance onlyOrchestrator {
        // Decodes and verifies the rebalance params data against the provided signature.
        Shared.ScheduledRebalance memory rebalanceCall = verifyAndDecode(
            signature,
            encodedData
        );
        // Checks if the sequence number of the rebalance call is valid and not already applied.

        if (
            rebalanceCall.sequenceNumber < nextSequenceNumber ||
            sequenceNumberApplied[rebalanceCall.sequenceNumber]
        ) {
            revert TokenFactory__InvalidSequenceNumber();
        }
        // Checks if the current block timestamp is valid for a natural rebalance.
        if (
            rebalanceCall.isNaturalRebalance &&
            block.timestamp <
            (lastTimeStamp +
                (interval *
                    ((rebalanceCall.sequenceNumber - nextSequenceNumber) + 1)))
        ) {
            revert TokenFactory__InvalidNaturalRebalance();
        }
        // Mark the sequence number as applied to prevent future rebalances with the same sequence number.
        sequenceNumberApplied[rebalanceCall.sequenceNumber] = true;
        // Store the rebalance data for later use if we have a gap in the sequence numbers
        scheduledRebalances[rebalanceCall.sequenceNumber] = rebalanceCall;
        // increment the length of the scheduled rebalances
        scheduledRebalancesLength++;

        // If the sequence number matches the next expected sequence number, execute the rebalance.
        if (rebalanceCall.sequenceNumber == nextSequenceNumber) {
            rebalance();
        }
    }

    /**
     * @notice Executes scheduled rebalances pending in the queue
     * @dev This function is called when the scheduled rebalance queue had more than 5 entries
     * only 5 will be executed and the rest will be left in the queue
     */
    function executeScheduledRebalances()
        external
        stopRebalance
        onlyOrchestrator
    {
        if (
            scheduledRebalancesLength > 0 &&
            scheduledRebalances[nextSequenceNumber].sequenceNumber ==
            nextSequenceNumber
        ) {
            rebalance();
        }
    }

    ///@notice Charges the management fees
    ///@dev This function is responsible for charging the fees of the whole universe
    /// and related functionalities.
    /// We charge the fees on a daily Basis/ each FFinterval
    function chargeFees() private {
        if (
            lastRebalanceFees != 0 ||
            smartTokenArray[0].balanceOf(address(this)) > 0
        ) {
            //We check and apply rebalance to the contract and treasury address
            FFCheck(address(this));
            FFCheck(treasuryWallet);
            rebalanceCheck(address(this));
            rebalanceCheck(treasuryWallet);

            //We charge the fees due by the contract as well
            lastRebalanceFees -= calculateManagementFee(lastRebalanceFees, 0);

            uint256 fee = (smartTokenArray[0].balanceOf(address(this)) >=
                lastRebalanceFees &&
                smartTokenArray[1].balanceOf(address(this)) >=
                lastRebalanceFees &&
                lastRebalanceFees != 0)
                ? lastRebalanceFees
                : (
                    smartTokenArray[0].balanceOf(address(this)) <
                        smartTokenArray[1].balanceOf(address(this))
                        ? smartTokenArray[0].balanceOf(address(this))
                        : smartTokenArray[1].balanceOf(address(this))
                );

            smartTokenArray[0].transfer(treasuryWallet, fee);
            smartTokenArray[1].transfer(treasuryWallet, fee);
        }
        //now we check if we have fees to charge for the upcoming rebalance
        //totalSupply for X ===Y hence we care for only 1
        uint256 totalSupplyX = smartTokenArray[0].totalSupply();
        //total user fees
        uint256 fees = calculateManagementFee(totalSupplyX, 0);

        //here we create and hold
        factoryTreasuryTransfer(fees);

        lastRebalanceFees = fees;
    }

    /// @notice Handles the actual rebalancing mechanism.
    /// @dev This function processes up to 5 scheduled rebalances per call.
    /// Different factors that will help calculating user balances are calculated here
    /// using the rebalance params.
    function rebalance() private {
        uint256 i = 0;
        while (i < 5) {
            // a maximum of 5 rebalances per transaction
            Shared.ScheduledRebalance
                memory scheduledRebalance = scheduledRebalances[
                    nextSequenceNumber
                ];
            // Skip to the next iteration if the sequence number doesn't match
            if (scheduledRebalance.sequenceNumber != nextSequenceNumber) {
                break;
            }
            //rebalance functionalities
            // Update the last timestamp if it's a natural rebalance
            if (scheduledRebalance.isNaturalRebalance) {
                lastTimeStamp += interval;
            }

            //get previous rebalance info
            RebalanceElements memory lastRebalance = rebalanceElements[
                rebalanceElements.length - 1
            ];
            if (
                scheduledRebalance.smartTokenXprice == 0 ||
                scheduledRebalance.price == 0 ||
                scheduledRebalance.smartTokenXprice == scheduledRebalance.price
            ) {
                revert TokenFactory__InvalidRebalanceParams();
            }
            uint256 smartTokenYprice = scheduledRebalance.price -
                scheduledRebalance.smartTokenXprice;
            uint256 minimumPrice = scheduledRebalance.smartTokenXprice;
            if (
                scheduledRebalance.smartTokenXprice >
                (scheduledRebalance.price - scheduledRebalance.smartTokenXprice)
            ) {
                minimumPrice =
                    scheduledRebalance.price -
                    scheduledRebalance.smartTokenXprice;
            }

            uint256 balanceFactorXY = lastRebalance
                .BalanceFactorXY
                .mul(2)
                .mul(minimumPrice)
                .div(scheduledRebalance.price);

            uint256 balanceFactorUx = lastRebalance.BalanceFactorUx +
                (
                    lastRebalance
                        .BalanceFactorXY
                        .mul(
                            scheduledRebalance.smartTokenXprice >
                                smartTokenYprice
                                ? (scheduledRebalance.smartTokenXprice -
                                    smartTokenYprice)
                                : 0
                        )
                        .div(scheduledRebalance.price)
                );

            uint256 balanceFactorUy = lastRebalance.BalanceFactorUy +
                (
                    lastRebalance
                        .BalanceFactorXY
                        .mul(
                            smartTokenYprice >
                                scheduledRebalance.smartTokenXprice
                                ? (smartTokenYprice -
                                    scheduledRebalance.smartTokenXprice)
                                : 0
                        )
                        .div(scheduledRebalance.price)
                );

            rebalanceElements.push(
                RebalanceElements({
                    BalanceFactorXY: balanceFactorXY,
                    BalanceFactorUx: balanceFactorUx,
                    BalanceFactorUy: balanceFactorUy
                })
            );
            //We now update the FF
            dailyFeeFactorsUpdate();

            emit Rebalance(getRebalanceNumber());

            // Remove the processed rebalance from the queue using the sequence number
            removeRebalance(nextSequenceNumber);

            // Increment the sequence number for the next rebalance to be processed
            // this must be done after removing the previous rebalance from the queue to
            // avoid removing the wrong rebalance
            nextSequenceNumber++;
            // Increment the counter
            i++;
        }
    }

    function updateFeeFactor() private {
        //get previous FF info
        uint256 lastFF = dailyFeeFactors[dailyFeeFactors.length - 1];
        dailyFeeFactors.push(
            lastFF
                .mul(
                    REBALANCE_INT_MULTIPLIER -
                        (
                            managementFeeEnabled && managementFeesRate > 0
                                ? managementFeesRate.mul(FFinterval).div(1 days) //assuming 1 interval is one day,
                                //then we can use 1 days/1days = 1
                                : //otherwise useful when doing hourly
                                0
                        )
                )
                .div(REBALANCE_INT_MULTIPLIER)
        );
    }

    function dailyFeeFactorsUpdate() public {
        if (block.timestamp >= FFLastTimeStamp + FFinterval) {
            FFLastTimeStamp += FFinterval;
            updateFeeFactor();
            //then we check if fees should be applied
            if (managementFeeEnabled && managementFeesRate > 0) {
                chargeFees();
            }
        }
    }

    /// @notice should apply this to users before any interaction with the contracts
    function applyFF(address owner) public {
        if (lastdailyFFcount[owner] != getDailyFeeFactorNumber()) {
            lastdailyFFcount[owner] = getDailyFeeFactorNumber();
        }
    }

    function updateUserLastFFCount(address owner_) public {
        if (
            smartTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            smartTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            lastdailyFFcount[owner_] = getDailyFeeFactorNumber();
        }
    }

    function FFCheck(address user) private {
        if (
            // Verify if the user is an existing user and if they have missed any FF operations.
            lastdailyFFcount[user] != 0 &&
            lastdailyFFcount[user] != getDailyFeeFactorNumber()
        ) {
            // Apply FF
            applyFF(user);
        }
    }

    /// @notice Applies rebalance to an account
    /// @dev This function adjusts the balance of smart tokens(RiskON/RiskOFF) according to the rollOverValue.
    /// This function can only be called when rebalance is stopped. It also calculates and applies management fees.
    /// @param owner_ The address of the account to which the rebalance will be applied.
    function applyRebalance(address owner_) public stopRebalance {
        //normal rebalance operations
        (uint256 assetX, uint256 assetY) = calculateRollOverValue(owner_);
        lastRebalanceCount[owner_] = getRebalanceNumber();
        lastdailyFFcount[owner_] = getDailyFeeFactorNumber();
        factoryBalanceAdjust(owner_, assetX, assetY);
        emit RebalanceApplied(owner_, getRebalanceNumber());
    }

    /// @notice Calculates the rollover value(Units of RiskON/OFF) for an account
    /// @dev This function calculates the net balance(Units of RiskON/OFF) of a user after rebalance and
    /// management fees are applied.
    /// @param owner_ The address of the owner
    /// @return The calculated roll over value.
    function calculateRollOverValue(
        address owner_
    ) public view returns (uint256, uint256) {
        RebalanceElements memory lastRebalance = rebalanceElements[
            rebalanceElements.length - 1
        ];

        RebalanceElements memory lastUserRebalance = rebalanceElements[
            (lastRebalanceCount[owner_])
        ];

        UserRebalanceElements
            memory userLastRebalanceInfo = userRebalanceElements[owner_];

        uint256 netX = userLastRebalanceInfo
            .netX
            .mul(lastRebalance.BalanceFactorXY)
            .div(lastUserRebalance.BalanceFactorXY);

        uint256 netY = userLastRebalanceInfo
            .netY
            .mul(lastRebalance.BalanceFactorXY)
            .div(lastUserRebalance.BalanceFactorXY);

        uint256 uX = (
            (lastRebalance.BalanceFactorUx - lastUserRebalance.BalanceFactorUx)
                .mul(userLastRebalanceInfo.netX)
                .div(lastUserRebalance.BalanceFactorXY)
        ) + userLastRebalanceInfo.Ux;
        uint256 uY = (
            (lastRebalance.BalanceFactorUy - lastUserRebalance.BalanceFactorUy)
                .mul(userLastRebalanceInfo.netY)
                .div(lastUserRebalance.BalanceFactorXY)
        ) + userLastRebalanceInfo.Uy;

        uint256 lastGlobalFF = dailyFeeFactors[getDailyFeeFactorNumber()];
        uint256 lastUserFF = dailyFeeFactors[lastdailyFFcount[owner_]];
        return (
            (netX + uX + uY).mul(lastGlobalFF).div(lastUserFF),
            (netY + uY + uX).mul(lastGlobalFF).div(lastUserFF)
        ); //X,Y
    }

    /// @notice Updates the last rebalance count of a user.
    /// @dev This function sets the last rebalance count for a user if their unscaled balances for
    /// both smart tokens(RiskON/RiskOFF) are zero. We may use this in cases where a receiever is new to the
    /// system
    /// @param owner_ The address of the user
    function updateUserLastRebalanceCount(address owner_) public {
        if (
            smartTokenArray[0].unScaledbalanceOf(owner_) == 0 &&
            smartTokenArray[1].unScaledbalanceOf(owner_) == 0
        ) {
            // If both balances are zero, update the last rebalance count
            // of the owner to the current scaling factor length
            // Therefore user has no more pending rebalances technically
            lastRebalanceCount[owner_] = getRebalanceNumber();
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
    ) public view returns (Shared.ScheduledRebalance memory) {
        // Hash the encoded data
        bytes32 hash = keccak256(encodedData);

        // Recover the address
        address recoveredAddress = ECDSAUpgradeable.recover(hash, signature);

        // Verify the address
        if (signers[recoveredAddress] == false) {
            revert TokenFactory__InvalidSignature();
        }

        // If the signature is valid, decode the encodedData into a  `ScheduledRebalance` struct
        (
            uint256 sequenceNumber,
            bool isNaturalRebalance,
            uint256 underlyingValue,
            uint256 smartTokenXValue
        ) = abi.decode(encodedData, (uint256, bool, uint256, uint256));
        Shared.ScheduledRebalance memory data = Shared.ScheduledRebalance(
            sequenceNumber,
            isNaturalRebalance,
            underlyingValue,
            smartTokenXValue
        );
        return data;
    }

    /// @notice Update the address authorized to sign rebalance transactions.
    /// @dev This function can only be called by the owner of the contract.
    /// It updates the `signersAddress` address with the provided `addr` address.
    /// @param addr The new address
    function setSignersAddress(address addr) external onlyOwner {
        signers[addr] = true;
    }

    function removeSigner(address signer) external onlyOwner {
        signers[signer] = false;
    }

    /// @notice Updates the rate of management fees.
    /// @dev It updates the `managementFeesRate` state variable with the provided `rate` value,
    /// if the rate is within a valid range, otherwise, it reverts the transaction.
    /// The rate is in terms of percentage per day
    ///    scaling factor is 10E18
    ///    Example 5% per day = 0.05*10E18
    /// @param rate The new rate of management fees. It is DAILY RATE
    /// @param rateRebalance The new rate of management fees for rebalance.(REBALANCE RATE)
    /// @return A boolean value
    function setManagementFeeRate(
        uint256 rate, //Daily Rate
        uint256 rateRebalance //Rebalance Rate(example Quaterly rate)
    ) external onlyOwner returns (bool) {
        if (!(rate <= REBALANCE_INT_MULTIPLIER)) {
            revert TokenFactory__InvalidManagementFees();
        }
        managementFeesRate = rate;
        managementFeesRateRebalance = rateRebalance;

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
        uint256 mgmtFee
    ) public view returns (uint256) {
        uint256 internalManagementFeesRate;
        //note:: we check if we are default or not
        mgmtFee > 0
            ? internalManagementFeesRate = mgmtFee
            : internalManagementFeesRate = managementFeesRate;
        //estimate the next FF timestamp
        uint256 nextFFTimeStamp = FFLastTimeStamp + FFinterval;

        //Estimate the mgmt fee per interval with respect to the fees per day value
        //The management fee rate is in terms of points per day, please checkout 'setManagementFee' Method
        // for more info
        uint256 mgmtFeesPerInterval = internalManagementFeesRate
            .mul(FFinterval)
            .div(1 days); // if the interval is one hour,then this is useful

        //User deposit or Withdrawal timestamp
        uint256 userTransacTimeStamp = block.timestamp;

        //Calculate the amount of time that the user will be in the system before next rebalance
        //or calculate the time left before next rebalance when the user exits the system
        uint256 userDepositCycle = 0;
        if (nextFFTimeStamp > userTransacTimeStamp) {
            userDepositCycle = nextFFTimeStamp - userTransacTimeStamp;
        }

        // deposit cycle should be atleast 1 second before rebalance
        if (userDepositCycle == 0 || FFinterval == 0) {
            revert TokenFactory__InvalidDivision();
        }
        //calculate user fees (Pro-rata)
        uint256 userFees = userDepositCycle
            .mul(mgmtFeesPerInterval)
            .mul(amount)
            .div(FFinterval)
            .div(REBALANCE_INT_MULTIPLIER);

        return userFees;
    }

    /// @notice Checks if a user is an existing user and applies user rebalance when needed.
    /// @dev This function is triggered to ensure a user's balances are updated with any rebalances
    /// that have occurred since their last interaction with the contract.
    /// @param user The address of the user
    function rebalanceCheck(address user) private {
        if (
            // Verify if the user is an existing user and if they have missed any rebalance operations.
            lastRebalanceCount[user] != 0 &&
            lastRebalanceCount[user] != getRebalanceNumber()
        ) {
            // Apply rebalance
            applyRebalance(user);
        }
    }

    /// @notice Removes a rebalance entry from the `scheduledRebalances` mapping at the given sequence number.
    /// @dev It deletes the entry at the given sequence number and decrements the `scheduledRebalancesLength` variable.
    /// It is also guarded by 'nonReentrant' modifier.
    /// @param sequenceNumber The sequenceNumber of the `scheduledRebalances` mapping to remove.
    function removeRebalance(uint256 sequenceNumber) private nonReentrant {
        delete scheduledRebalances[sequenceNumber];
        scheduledRebalancesLength--;
    }

    /// @notice Verifies if a signer is valid
    /// @dev Verifies if a signer is valid
    /// @param addr The address of the signer
    /// @return true if signer is valid
    function isValidSigner(address addr) public view returns (bool) {
        return signers[addr];
    }

    /// ratelimits
    function withdrawLimitMod(
        uint256 amount
    ) external onlySmartTokens returns (bool) {
        if (!hasWithdrawLimit) return false;

        updatePeriod(
            _msgSender(),
            currentWithdrawPeriodEnd,
            currentWithdrawPeriodAmount
        );

        uint256 newWithdrawAmount = currentWithdrawPeriodAmount[_msgSender()] +
            amount;
        if (newWithdrawAmount > withdrawLimit) return true;

        currentWithdrawPeriodAmount[_msgSender()] = newWithdrawAmount;
        return false;
    }

    function depositLimitMod(
        uint256 amount
    ) external onlySmartTokens returns (bool) {
        if (!hasDepositLimit) return false;

        updatePeriod(
            _msgSender(),
            currentDepositPeriodEnd,
            currentDepositPeriodAmount
        );

        uint256 newDepositAmount = currentDepositPeriodAmount[_msgSender()] +
            amount;
        if (newDepositAmount > depositLimit) return true;

        currentDepositPeriodAmount[_msgSender()] = newDepositAmount;
        return false;
    }

    function updatePeriod(
        address user,
        mapping(address => uint256) storage currentPeriodEnd,
        mapping(address => uint256) storage currentPeriodAmount
    ) internal {
        if (currentPeriodEnd[user] < block.timestamp) {
            currentPeriodEnd[user] = block.timestamp + period;
            currentPeriodAmount[user] = 0;
        }
    }

    function updateWithdrawLimit(uint newLimit) external onlyOwner {
        require(newLimit > 0, "Deposit limit must be positive");
        withdrawLimit = newLimit;
    }

    function updateDepositLimit(uint newLimit) external onlyOwner {
        require(newLimit > 0, "Deposit limit must be positive");
        depositLimit = newLimit;
    }

    function updateLimitPeriod(uint newPeriod) external onlyOwner {
        require(newPeriod > 0, "Period must be positive");
        period = newPeriod;
    }

    function toggleWithdrawLimit() external onlyOwner {
        hasWithdrawLimit = !hasWithdrawLimit;
        emit WithdrawLimitToggled(hasWithdrawLimit);
    }

    function toggleDepositLimit() external onlyOwner {
        hasDepositLimit = !hasDepositLimit;
        emit DepositLimitToggled(hasDepositLimit);
    }

    /// @notice Retrieves the `scheduledRebalance` struct at the given sequence number.
    /// @dev This function is a getter for a single `scheduledRebalance` struct.
    /// @param sequenceNumber The sequence number of the `scheduledRebalances` mapping to retrieve.
    /// @return The `scheduledRebalance` struct at the given sequence number.
    function getScheduledRebalances(
        uint256 sequenceNumber
    ) public view returns (Shared.ScheduledRebalance memory) {
        return scheduledRebalances[sequenceNumber];
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

    function getManagementFeeRate() public view returns (uint256, uint256) {
        return (managementFeesRate, managementFeesRateRebalance);
    }

    /// @notice Retrieves the managementFeeEnabled
    /// @dev This function is a getter for the `managementFeeEnabled` variable.
    /// @return The managementFeeEnabled
    function getManagementFeeState() public view returns (bool) {
        return managementFeeEnabled;
    }

    function getRebalanceNumber() public view returns (uint256) {
        return rebalanceElements.length - 1; //adjusted since rebalanceElements is also filled on initialization
    }

    function getUserLastRebalanceCount(
        address userAddress
    ) public view returns (uint256) {
        return lastRebalanceCount[userAddress];
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

    /// @notice Validates if the amount of underlying locked in the token factory is
    // always >= than the totalSupply of RiskOn/Off
    /// @dev This function is used the smartoken modifer
    /// @return true if underlying is less
    function insufficientUnderlying() external view returns (bool) {
        if (!smartTokenInitialized) {
            revert TokenFactory__SmartTokenArrayOutOfBounds();
        }

        return (IERC20Update(address(smartTokenArray[0])).totalSupply() >
            baseToken.balanceOf(address(this)) ||
            IERC20Update(address(smartTokenArray[1])).totalSupply() >
            baseToken.balanceOf(address(this)));
    }

    function withdrawLimitStatus() public view returns (bool) {
        return hasWithdrawLimit;
    }

    function depositLimitStatus() public view returns (bool) {
        return hasDepositLimit;
    }

    function getWithdrawLimit() public view returns (uint256) {
        return withdrawLimit;
    }

    function getDepositLimit() public view returns (uint256) {
        return depositLimit;
    }

    function getLimitPeriod() public view returns (uint256) {
        return period;
    }

    function getUserLimitPerPeriod(
        address user,
        bool isWithdraw
    ) public view returns (uint256 periodEnd, uint256 currentAmount) {
        if (isWithdraw) {
            return (
                currentWithdrawPeriodEnd[user],
                currentWithdrawPeriodAmount[user]
            );
        } else {
            return (
                currentDepositPeriodEnd[user],
                currentDepositPeriodAmount[user]
            );
        }
    }

    /// Getters for the new fees mechanisms
    function getLastFFTimeStamp() external view returns (uint256) {
        return FFLastTimeStamp;
    }
    function getDailyFeeFactorNumber() public view returns (uint256) {
        return dailyFeeFactors.length - 1; //adjusted since rebalanceElements is also filled on initialization
    }
    function getUserLastFFCount(
        address userAddress
    ) public view returns (uint256) {
        return lastdailyFFcount[userAddress];
    }

    function getIsNativeToken() public view returns (bool) {
        return isNativeToken;
    }
}
