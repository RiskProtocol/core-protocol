# MockERC20Token
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/d528418042db61177ce53f6ee7a0a539f1f5bd77/contracts/mocks/MockERC20Token.sol)

**Inherits:**
ERC20, [IERC20Update](/contracts/interfaces/IERC20Update.sol/interface.IERC20Update.md)


## Functions
### constructor


```solidity
constructor() ERC20("Risk", "RK");
```

### permit


```solidity
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    external;
```

