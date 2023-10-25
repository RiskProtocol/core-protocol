# MockERC20TokenWithPermit
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/ee827bcbd5b33da1299e0daca263c7bf65a112b7/contracts/mocks/MockERC20TokenWithPermit.sol)

**Inherits:**
ERC20, ERC20Permit


## State Variables
### TOKEN_NAME

```solidity
string private constant TOKEN_NAME = "Risk";
```


## Functions
### constructor


```solidity
constructor() ERC20(TOKEN_NAME, "RK") ERC20Permit(TOKEN_NAME);
```

