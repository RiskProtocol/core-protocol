# MockSanctionContract
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/mocks/MockSanctionContract.sol)


## State Variables
### sanctions

```solidity
mapping(address => bool) private sanctions;
```


## Functions
### isSanctioned


```solidity
function isSanctioned(address addr) external view returns (bool);
```

### setSanction


```solidity
function setSanction(address addr, bool isSanctioned_) external;
```

