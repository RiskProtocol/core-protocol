# MockSanctionContract
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/ee827bcbd5b33da1299e0daca263c7bf65a112b7/contracts/mocks/MockSanctionContract.sol)


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

