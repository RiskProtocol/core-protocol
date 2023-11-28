# Orchestrator
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/orchestrator/Orchestrator.sol)

**Inherits:**
UUPSUpgradeable, OwnableUpgradeable


## State Variables
### operations

```solidity
Operation[] public operations;
```


### tokenFactory

```solidity
ITokenFactory private tokenFactory;
```


## Functions
### lessThanLength


```solidity
modifier lessThanLength(uint256 index);
```

### constructor


```solidity
constructor();
```

### initialize


```solidity
function initialize(address _tokenFactory) public initializer;
```

### _authorizeUpgrade


```solidity
function _authorizeUpgrade(address) internal override(UUPSUpgradeable) onlyOwner;
```

### rebalance


```solidity
function rebalance(bytes memory encodedData, bytes memory signature) external;
```

### executeScheduledRebalances

Executes scheduled rebalances pending in the queue

*This function is called when the scheduled rebalance queue had more than 5 entries
only 5 will be executed and the rest will be left in the queue*


```solidity
function executeScheduledRebalances() external;
```

### addOperation

Adds a ops that gets called for a downstream receiver of rebalances


```solidity
function addOperation(uint256 index, address destination, bytes memory data) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|The position at which the new ops should be added|
|`destination`|`address`|Address of contract destination|
|`data`|`bytes`|ops data payload|


### removeOperation


```solidity
function removeOperation(uint256 index) external onlyOwner lessThanLength(index);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index of ops to remove.|


### setOperationEnabled


```solidity
function setOperationEnabled(uint256 index, address destinationAddress, bool enabled)
    external
    onlyOwner
    lessThanLength(index);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`index`|`uint256`|Index of ops.|
|`destinationAddress`|`address`||
|`enabled`|`bool`|True for enabled, false for disabled.|


### operationsSize


```solidity
function operationsSize() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Number of ops, both enabled and disabled, in ops list.|


### getTokenFactory


```solidity
function getTokenFactory() external view returns (address);
```

## Events
### OperationAdded

```solidity
event OperationAdded(bool enabled, address destination, bytes data);
```

### OperationRemoved

```solidity
event OperationRemoved(uint256 index);
```

### OperationStatusChanged

```solidity
event OperationStatusChanged(uint256 index, bool enabled);
```

### RebalanceExecuted

```solidity
event RebalanceExecuted(bytes data);
```

### OperationExecuted

```solidity
event OperationExecuted(bytes data, address destination);
```

## Errors
### Orchestrator_FailedOperation

```solidity
error Orchestrator_FailedOperation();
```

### Orchestrator_Index_Out_Bounds

```solidity
error Orchestrator_Index_Out_Bounds();
```

### Orchestrator_Wrong_Dest_Addr

```solidity
error Orchestrator_Wrong_Dest_Addr();
```

## Structs
### Operation

```solidity
struct Operation {
    bool enabled;
    address destination;
    bytes data;
}
```

