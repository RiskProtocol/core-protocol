# SanctionsList
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/vaults/BaseContract.sol)

*This interface defines a method for checking if an address is on a sanctions list.
Implementing contracts should return true if the address is sanctioned, false otherwise.*


## Functions
### isSanctioned


```solidity
function isSanctioned(address addr) external view returns (bool);
```

