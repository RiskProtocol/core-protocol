# MockERC20TokenWithPermit
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/mocks/MockERC20TokenWithPermit.sol)

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

