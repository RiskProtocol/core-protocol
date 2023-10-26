# BaseContract
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/ee827bcbd5b33da1299e0daca263c7bf65a112b7/contracts/vaults/BaseContract.sol)

**Inherits:**
Initializable, OwnableUpgradeable

Please refer to Chainalysis documentation (https://go.chainalysis.com/chainalysis-oracle-docs.html)
for the sanctions list.

*It is utilized by TokenFactory and SmartTokens
to manage interactions with potentially sanctioned addresses and to handle
emergency situations by halting certain operations.*


## State Variables
### sanctionsContract

```solidity
address private sanctionsContract;
```


### depositCircuitBreaker

```solidity
bool private depositCircuitBreaker;
```


### withdrawCircuitBreaker

```solidity
bool private withdrawCircuitBreaker;
```


### transferCircuitBreaker

```solidity
bool private transferCircuitBreaker;
```


### rebaseCircuitBreaker

```solidity
bool private rebaseCircuitBreaker;
```


## Functions
### onlyNotSanctioned

*Checks if the address is sanctioned.*


```solidity
modifier onlyNotSanctioned(address addressToCheck);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`addressToCheck`|`address`|The address to be checked.|


### stopDeposit

*Reverts if the deposit circuit breaker is active.
This modifier is used to halt user deposits in emergency situations.*


```solidity
modifier stopDeposit();
```

### stopWithdraw

*Reverts if the withdraw circuit breaker is active.
This modifier is used to halt user withdrawals in emergency situations.*


```solidity
modifier stopWithdraw();
```

### stopTransfer

*Reverts if the transfer circuit breaker is active.
This modifier is used to halt smart token transfers in emergency situations.*


```solidity
modifier stopTransfer();
```

### stopRebase

*Reverts if the rebase circuit breaker is active.
This modifier is used to halt rebase operations in emergency situations.*


```solidity
modifier stopRebase();
```

### __BaseContract_init

*Initializes the BaseContract with a sanctions contract address.*


```solidity
function __BaseContract_init(address sanctionsContract_) internal onlyInitializing;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sanctionsContract_`|`address`|The address of the sanctions contract.|


### constructor


```solidity
constructor();
```

### toggleDepositCircuitBreaker

Toggles the deposit circuit breaker on or off.

*This function allows the contract owner to halt or resume deposit operations in case of emergency.
Only the owner can call this function.*


```solidity
function toggleDepositCircuitBreaker() external onlyOwner;
```

### toggleWithdrawCircuitBreaker

Toggles the withdraw circuit breaker on or off.

*This function allows the contract owner to halt or resume withdraw operations in case of emergency.
Only the owner can call this function.*


```solidity
function toggleWithdrawCircuitBreaker() external onlyOwner;
```

### toggleTransferCircuitBreaker

Toggles the transfer circuit breaker on or off.

*This function allows the contract owner to halt or resume smart token transfers in case of emergency.
Only the owner can call this function.*


```solidity
function toggleTransferCircuitBreaker() external onlyOwner;
```

### toggleRebaseCircuitBreaker

Toggles the rebase circuit breaker on or off.

*This function allows the contract owner to halt or resume rebase operations in case of emergency.
Only the owner can call this function.*


```solidity
function toggleRebaseCircuitBreaker() external onlyOwner;
```

### stopAllCircuitBreakers

Activates all circuit breakers, halting deposit, withdraw, transfer, and rebase operations.

*This function allows the contract owner to halt critical operations in case of emergency.
Only the owner can call this function.*


```solidity
function stopAllCircuitBreakers() external onlyOwner;
```

### resumeAllCircuitBreakers

Deactivates all circuit breakers, resuming deposit, withdraw, transfer, and rebase operations.

*This function allows the contract owner to resume critical operations after an emergency halt.
Only the owner can call this function.*


```solidity
function resumeAllCircuitBreakers() external onlyOwner;
```

### isDepositCircuitBreaker

Checks if the deposit circuit breaker is active.


```solidity
function isDepositCircuitBreaker() external view returns (bool);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value indicating whether the deposit circuit breaker is active pr not|


### isWithdrawCircuitBreaker

Checks if the withdraw circuit breaker is active.


```solidity
function isWithdrawCircuitBreaker() external view returns (bool);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value indicating whether the withdraw circuit breaker is active or not.|


### isTransferCircuitBreaker

Checks if the transfer circuit breaker is active.


```solidity
function isTransferCircuitBreaker() external view returns (bool);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value indicating whether the transfer circuit breaker is active or not.|


### isRebaseCircuitBreaker

Checks if the rebase circuit breaker is active.


```solidity
function isRebaseCircuitBreaker() external view returns (bool);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|A boolean value indicating whether the rebase circuit breaker is active or not.|


## Errors
### BaseContract__SanctionedAddress

```solidity
error BaseContract__SanctionedAddress();
```

### BaseContract__DepositCircuitBreaker

```solidity
error BaseContract__DepositCircuitBreaker();
```

### BaseContract__WithdrawCircuitBreaker

```solidity
error BaseContract__WithdrawCircuitBreaker();
```

### BaseContract__TransferCircuitBreaker

```solidity
error BaseContract__TransferCircuitBreaker();
```

### BaseContract__RebaseCircuitBreaker

```solidity
error BaseContract__RebaseCircuitBreaker();
```

