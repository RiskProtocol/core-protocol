# TokenFactory
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/vaults/TokenFactory.sol)

**Inherits:**
ReentrancyGuardUpgradeable, OwnableUpgradeable, UUPSUpgradeable, [BaseContract](/contracts/vaults/BaseContract.sol/contract.BaseContract.md)

The main purposes of this contract is to act as a vault as well as it contains the shared logic
used by riskON/OFF tokens.

*Acts as the vault for holding the underlying assets/tokens. Also contains shared logic used by riskON/OFF*


## State Variables
### rebalanceElements

```solidity
RebalanceElements[] private rebalanceElements;
```


### userRebalanceElements

```solidity
mapping(address => UserRebalanceElements) private userRebalanceElements;
```


### REBALANCE_INT_MULTIPLIER

```solidity
uint256 private constant REBALANCE_INT_MULTIPLIER = 10 ** 18;
```


### smartTokenArray

```solidity
SmartToken[] private smartTokenArray;
```


### lastRebalanceCount
This mapping keeps track of the last rebalance applied to a user/address


```solidity
mapping(address => uint256) private lastRebalanceCount;
```


### baseToken
This is the instance of the underlying Token


```solidity
IERC20Update private baseToken;
```


### baseTokenDecimals
The number of decimals of the underlying Asset/Token


```solidity
uint8 private baseTokenDecimals;
```


### interval
The rebalance interval in seconds


```solidity
uint256 private interval;
```


### lastTimeStamp
The timestamp of the last rebalance


```solidity
uint256 private lastTimeStamp;
```


### smartTokenInitialized
This boolean keeps track if the smart tokens(RiskON/OFF) have already been initialized in the system


```solidity
bool private smartTokenInitialized;
```


### signersAddress
This is the signers address of RP api's that generate encoded params for rebalance


```solidity
address private signersAddress;
```


### sequenceNumberApplied
This keeps track of the 'sequenceNumber' of a rebalance which helps


```solidity
mapping(uint256 => bool) private sequenceNumberApplied;
```


### managementFeesRate

```solidity
uint256 private managementFeesRate;
```


### managementFeeEnabled

```solidity
bool private managementFeeEnabled;
```


### lastRebalanceFees

```solidity
uint256 private lastRebalanceFees;
```


### treasuryWallet

```solidity
address private treasuryWallet;
```


### orchestrator

```solidity
address private orchestrator;
```


### scheduledRebalances
*A mapping to hold the scheduled rebalances.
This helps in storing rebalances in the order they are scheduled till they are all executed*


```solidity
mapping(uint256 => ScheduledRebalance) private scheduledRebalances;
```


### scheduledRebalancesLength

```solidity
uint256 private scheduledRebalancesLength;
```


### nextSequenceNumber
*A counter to generate a unique sequence number for each rebalance.
This ensures that rebalances are executed in the order they are scheduled.*


```solidity
uint256 private nextSequenceNumber;
```


## Functions
### onlySmartTokens

Ensures the caller is one of the SmartTokens(RiskOn/Off).

*This modifier checks if the caller is either smartTokenArray[0] or smartTokenArray[1].
If not, it reverts with a custom error message.*


```solidity
modifier onlySmartTokens();
```

### onlyOrchestrator


```solidity
modifier onlyOrchestrator();
```

### onlyIntializedOnce


```solidity
modifier onlyIntializedOnce();
```

### constructor


```solidity
constructor();
```

### initialize

Initializes(replacement for the constructor) the Vault (TokenFactory) contract with specified params

*This function sets up the initial state of the TokenFactory contract. Callable only once.*


```solidity
function initialize(
    IERC20Update baseTokenAddress,
    uint256 rebalanceInterval,
    address sanctionsContract_,
    address signersAddress_
) public initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`baseTokenAddress`|`IERC20Update`|The address of the underlying token/asset|
|`rebalanceInterval`|`uint256`|The interval (in seconds) at which natural rebalances are scheduled.|
|`sanctionsContract_`|`address`|The address of the sanctions contract(chainalysis contract) to verify blacklisted addresses|
|`signersAddress_`|`address`|The address of the signer ( RP Api's) which signed the rebalance data|


### _authorizeUpgrade

Authorizes an upgrade to a new contract implementation.

*This function can only be called by the contract owner.
It overrides the `_authorizeUpgrade` function from the `UUPSUpgradeable`
contract to include the `onlyOwner` modifier, ensuring only the owner can authorize upgrades.*


```solidity
function _authorizeUpgrade(address) internal override(UUPSUpgradeable) onlyOwner;
```

### initializeSMART

Initializes the smart tokens associated with this TokenFactory.
renaming this method to avoid conflicts with upgradable initialize

*This function can only be called once, and only by the contract owner.*


```solidity
function initializeSMART(SmartToken token1, SmartToken token2) external onlyOwner onlyIntializedOnce;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token1`|`SmartToken`|The first smart token|
|`token2`|`SmartToken`|The second smart token|


### initializeOrchestrator


```solidity
function initializeOrchestrator(address orchestrator_) external onlyOwner;
```

### _tryGetAssetDecimals

Attempts to fetch the decimals of underlying token

*This function uses a static call to query the decimals from the asset.
If the call fails or the returned data is invalid, it defaults to 0.*


```solidity
function _tryGetAssetDecimals(IERC20 asset_) private view returns (bool, uint8);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`asset_`|`IERC20`|The address of the underlying token|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A return vaule containing a boolean indicating success and the decimals of the token. or false if it failed somehow|
|`<none>`|`uint8`||


### decimals

Fetches the decimal value of the underlying token

*This function returns the value of decimals that was set in the 'initialize' method*


```solidity
function decimals() public view virtual returns (uint8);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint8`|The number of decimals of the underlying token|


### getBaseToken

Retrieves the instance of the underlying token contract

*This function provides a way to access the instance of the underlying contract*


```solidity
function getBaseToken() public view virtual returns (IERC20Update);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`IERC20Update`|The instance of the underlying contract|


### maxAmountToWithdraw

Returns the maximum amount of assets the owner can withdraw.

*This function compares the balance of both smart tokens(RiskON/OFF) for the owner
and returns the balance of the smart token with the lesser amount.*


```solidity
function maxAmountToWithdraw(address owner_) public view virtual returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|The address of the owner|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The maximum amount of assets the specified owner can withdraw.|


### maxSharesOwned

Determines the maximum amount of shares owned by the owner

*This function compares the balance of both smart tokens(RiskON/OFF) for the owner
and returns the balance of the smart token with the greater amount.*


```solidity
function maxSharesOwned(address owner_) public view virtual returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|The address of the owner|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The maximum amount of shares owned by the specified owner.|


### _deposit

Deposit/mint common workflow, deposit underlying tokens, mints new shares(RiskON/OFF)
to the receiver, and also charges management fees

*Deposit/mint common workflow.*

*This function can only be called by the smart tokens and requires the caller and
receiver to not be sanctioned.*


```solidity
function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
    external
    virtual
    onlyNotSanctioned(caller)
    onlyNotSanctioned(receiver)
    onlySmartTokens;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caller`|`address`|The address of depositor|
|`receiver`|`address`|The address of receiver|
|`assets`|`uint256`|The amount of underlying tokens being deposited.|
|`shares`|`uint256`|The amount of shares(RiskON/OFF) to mint to the receiver.|


### _withdraw

Withdraw/redeem common workflow. Handles the withdrawal of underlying token.
burns shares(RiskON/OFF) from the caller, and refund any management fees

*This function can only be called by the smart tokens and requires the caller and receiver
to not be sanctioned.*


```solidity
function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
    external
    virtual
    onlyNotSanctioned(caller)
    onlyNotSanctioned(receiver)
    onlySmartTokens;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`caller`|`address`|The address withdrawing.|
|`receiver`|`address`|The address receiving the underlying token.|
|`owner`|`address`|The owner of the shares.|
|`assets`|`uint256`|The amount of underlying Token being withdrawn.|
|`shares`|`uint256`|The amount of shares(RiskON/OFF) to burn from the caller.|


### getUserRecords


```solidity
function getUserRecords(address sender, address recipient) external view onlySmartTokens returns (uint256[4] memory);
```

### transferRecords


```solidity
function transferRecords(
    address sender,
    address recipient,
    bool tokenType,
    uint256 amount,
    uint256 prevBalXsender,
    uint256 prevBalYsender,
    uint256 prevBalXrecipient,
    uint256 prevBalYrecipient
) external onlySmartTokens;
```

### updateRecord


```solidity
function updateRecord(bool tokenType, address account, uint256 amount) external onlySmartTokens;
```

### updateRecord


```solidity
function updateRecord(bool tokenType, uint256 amount) external onlySmartTokens;
```

### factoryMint

Mints the specified amount of Shares(RiskON/OFF) to the receiver

*It first previews the minting process to get the amount of Shares(RiskON/OFF)that will be minted,
and then performs the actual minting.*


```solidity
function factoryMint(uint256 smartTokenIndex, address receiver, uint256 amount) private;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smartTokenIndex`|`uint256`|The index of the smart token in the smartTokenArray.|
|`receiver`|`address`|The address of the receiver|
|`amount`|`uint256`|The amount of Shares(RiskON/OFF) to mint.|


### factoryBurn

Burns the specified amount of Shares(either of RiskON/OFF)from the owner

*It calls the `burn` function on the smart token contract*


```solidity
function factoryBurn(uint256 smartTokenIndex, address owner_, uint256 amount) private;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`smartTokenIndex`|`uint256`|The index of the smart token in the `smartTokenArray`.|
|`owner_`|`address`|The address of the owner|
|`amount`|`uint256`|The amount of Shares(either of RiskON/OFF)  to burn.|


### factoryTreasuryTransfer


```solidity
function factoryTreasuryTransfer(uint256 amount) private;
```

### factoryBalanceAdjust


```solidity
function factoryBalanceAdjust(address account, uint256 amountX, uint256 amountY) private;
```

### executeRebalance

Executes a rebalance based on the provided encoded data and signature.

*This function validates the rebalance call, schedules it, and possibly triggers
a rebalance if the sequence is in order. It first verifies the signature of the rebalance params with
the signer's public key. Then we verify if the sequence number is aligned and not already used.
Then we push the rebalance params into an array of scheduled rebalances.
Finally, if there is no gaps between the previous rebalance'sequence number, we execute this rebalance
This function can only be called when rebalance is not stopped  with the `stopRebalance` modifier.*


```solidity
function executeRebalance(bytes memory encodedData, bytes memory signature) external stopRebalance onlyOrchestrator;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`encodedData`|`bytes`|The encoded data containing the sequence number, the boolean value for natural rebalance and the price of underlying and smartTokenX|
|`signature`|`bytes`|The signature of the encoded data to verify its authenticity.|


### executeScheduledRebalances

Executes scheduled rebalances pending in the queue

*This function is called when the scheduled rebalance queue had more than 5 entries
only 5 will be executed and the rest will be left in the queue*


```solidity
function executeScheduledRebalances() external stopRebalance onlyOrchestrator;
```

### chargeFees

Charges the management fees

*This function is responsible for charging the fees of the whole universe
and related functionalities.*


```solidity
function chargeFees() private;
```

### rebalance

Handles the actual rebalancing mechanism.

*This function processes up to 5 scheduled rebalances per call.
Different factors that will help calculating user balances are calculated here
using the rebalance params.*


```solidity
function rebalance() private;
```

### applyRebalance

Applies rebalance to an account

*This function adjusts the balance of smart tokens(RiskON/RiskOFF) according to the rollOverValue.
This function can only be called when rebalance is stopped. It also calculates and applies management fees.*


```solidity
function applyRebalance(address owner_) public stopRebalance;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|The address of the account to which the rebalance will be applied.|


### calculateRollOverValue

Calculates the rollover value(Units of RiskON/OFF) for an account

*This function calculates the net balance(Units of RiskON/OFF) of a user after rebalance and
management fees are applied.*


```solidity
function calculateRollOverValue(address owner_) public view returns (uint256, uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|The address of the owner|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The calculated roll over value.|
|`<none>`|`uint256`||


### updateUserLastRebalanceCount

Updates the last rebalance count of a user.

*This function sets the last rebalance count for a user if their unscaled balances for
both smart tokens(RiskON/RiskOFF) are zero. We may use this in cases where a receiever is new to the
system*


```solidity
function updateUserLastRebalanceCount(address owner_) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`owner_`|`address`|The address of the user|


### verifyAndDecode

Verifies the provided signature and decodes the encoded data into  `ScheduledRebalance` struct.

*It recovers the address from the Ethereum signed message hash and the provided `signature`.
If the recovered address doesn't match the `signersAddress`, it reverts the transaction.
If the signature is valid, it decodes the `encodedData` into a `ScheduledRebalance` struct and returns it.*


```solidity
function verifyAndDecode(bytes memory signature, bytes memory encodedData)
    private
    view
    returns (ScheduledRebalance memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`signature`|`bytes`|The signature to be verified.|
|`encodedData`|`bytes`|The data to be decoded into a `ScheduledRebalance` struct.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`ScheduledRebalance`|data A `ScheduledRebalance` struct containing the decoded data.|


### setSignersAddress

Update the address authorized to sign rebalance transactions.

*This function can only be called by the owner of the contract.
It updates the `signersAddress` address with the provided `addr` address.*


```solidity
function setSignersAddress(address addr) public onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`addr`|`address`|The new address|


### setManagementFeeRate

Updates the rate of management fees.

*It updates the `managementFeesRate` state variable with the provided `rate` value,
if the rate is within a valid range, otherwise, it reverts the transaction.
The rate is in terms of percentage per day
scaling factor is 100000
Example 5% per day = 5000*


```solidity
function setManagementFeeRate(uint256 rate) external onlyOwner returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rate`|`uint256`|The new rate of management fees.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value|


### setManagementFeeState

Toggles the state of management fee collection.

*This function can only be called by the contract owner.
It either enables or disables the management fee collection*


```solidity
function setManagementFeeState(bool state) external onlyOwner returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`state`|`bool`|The new state of management fee collection.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value|


### setTreasuryWallet


```solidity
function setTreasuryWallet(address wallet) external onlyOwner returns (bool);
```

### calculateManagementFee

Calculates the management fee for a given amount over a particular time span.

*It computes the management fee either using the default management fee rate or a provided fee rate.
This function can be used both for deposit and withdrawal scenarios.*


```solidity
function calculateManagementFee(uint256 amount, bool isDefault, uint256 mgmtFee) public view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|The amount of RiskON/OFF to calculate the fee against.|
|`isDefault`|`bool`|When set to true, the method uses the default management fee rate,|
|`mgmtFee`|`uint256`|The management fee rate to use if `isDefault` is set to false.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|userFees The calculated management fee|


### rebalanceCheck

Checks if a user is an existing user and applies user rebalance when needed.

*This function is triggered to ensure a user's balances are updated with any rebalances
that have occurred since their last interaction with the contract.*


```solidity
function rebalanceCheck(address user) private;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|The address of the user|


### removeRebalance

Removes a rebalance entry from the `scheduledRebalances` mapping at the given sequence number.

*It deletes the entry at the given sequence number and decrements the `scheduledRebalancesLength` variable.
It is also guarded by 'nonReentrant' modifier.*


```solidity
function removeRebalance(uint256 sequenceNumber) private nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sequenceNumber`|`uint256`|The sequenceNumber of the `scheduledRebalances` mapping to remove.|


### getSignersAddress

Retrieves the address of the signer

*This function is a getter for the `signersAddress` variable.*


```solidity
function getSignersAddress() public view returns (address);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`address`|The address of the authorized signer.|


### getScheduledRebalances

Retrieves the `scheduledRebalance` struct at the given sequence number.

*This function is a getter for a single `scheduledRebalance` struct.*


```solidity
function getScheduledRebalances(uint256 sequenceNumber) public view returns (ScheduledRebalance memory);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sequenceNumber`|`uint256`|The sequence number of the `scheduledRebalances` mapping to retrieve.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`ScheduledRebalance`|The `scheduledRebalance` struct at the given sequence number.|


### getNextSequenceNumber

Retrieves the nextSequenceNumber

*This function is a getter for the `nextSequenceNumber` variable.*


```solidity
function getNextSequenceNumber() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The anextSequenceNumber|


### getLastTimeStamp

Retrieves the lastTimeStamp

*This function is a getter for the `lastTimeStamp` variable.*


```solidity
function getLastTimeStamp() external view onlyOwner returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The lastTimeStamp|


### getManagementFeeRate


```solidity
function getManagementFeeRate() public view returns (uint256);
```

### getManagementFeeState

Retrieves the managementFeeEnabled

*This function is a getter for the `managementFeeEnabled` variable.*


```solidity
function getManagementFeeState() public view returns (bool);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|The managementFeeEnabled|


### getRebalanceNumber


```solidity
function getRebalanceNumber() public view returns (uint256);
```

### getUserLastRebalanceCount


```solidity
function getUserLastRebalanceCount(address userAddress) public view returns (uint256);
```

### getSmartTokenAddress

Retrieves the interval

*This function is a getter for the `interval` variable.*


```solidity
function getSmartTokenAddress(uint8 index) public view returns (SmartToken);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint8`|The index of the SmartToken in the `smartTokenArray`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`SmartToken`|The interval|


### getTreasuryAddress


```solidity
function getTreasuryAddress() public view returns (address);
```

### getInterval

Retrieves the interval

*This function is a getter for the `interval` variable.*


```solidity
function getInterval() public view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The interval|


## Events
### RebalanceApplied

```solidity
event RebalanceApplied(address userAddress, uint256 rebalanceCount);
```

### Rebalance

```solidity
event Rebalance(uint256 rebalanceCount);
```

### Deposit

```solidity
event Deposit(address caller, address receiver, uint256 assets, uint256 shares);
```

### Withdraw

```solidity
event Withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares);
```

## Errors
### TokenFactory__MethodNotAllowed

```solidity
error TokenFactory__MethodNotAllowed();
```

### TokenFactory__InvalidDivision

```solidity
error TokenFactory__InvalidDivision();
```

### TokenFactory__InvalidSequenceNumber

```solidity
error TokenFactory__InvalidSequenceNumber();
```

### TokenFactory__InvalidNaturalRebalance

```solidity
error TokenFactory__InvalidNaturalRebalance();
```

### TokenFactory__AlreadyInitialized

```solidity
error TokenFactory__AlreadyInitialized();
```

### TokenFactory__InvalidSignature

```solidity
error TokenFactory__InvalidSignature();
```

### TokenFactory__InvalidSignatureLength

```solidity
error TokenFactory__InvalidSignatureLength();
```

### TokenFactory__InvalidManagementFees

```solidity
error TokenFactory__InvalidManagementFees();
```

## Structs
### ScheduledRebalance
Struct to store information regarding a scheduled rebalance.

*This struct holds the data for rebalances that are scheduled to be executed.*


```solidity
struct ScheduledRebalance {
    uint256 sequenceNumber;
    bool isNaturalRebalance;
    uint256 price;
    uint256 smartTokenXprice;
}
```

### RebalanceElements

```solidity
struct RebalanceElements {
    uint256 BalanceFactorXY;
    uint256 BalanceFactorUx;
    uint256 BalanceFactorUy;
    uint256 FeeFactor;
}
```

### UserRebalanceElements

```solidity
struct UserRebalanceElements {
    uint256 netX;
    uint256 netY;
    uint256 Ux;
    uint256 Uy;
}
```

