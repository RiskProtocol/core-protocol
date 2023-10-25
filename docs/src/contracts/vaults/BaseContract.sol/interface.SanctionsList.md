# SanctionsList
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/ee827bcbd5b33da1299e0daca263c7bf65a112b7/contracts/vaults/BaseContract.sol)

*This interface defines a method for checking if an address is on a sanctions list.
Implementing contracts should return true if the address is sanctioned, false otherwise.*


## Functions
### isSanctioned


```solidity
function isSanctioned(address addr) external view returns (bool);
```

