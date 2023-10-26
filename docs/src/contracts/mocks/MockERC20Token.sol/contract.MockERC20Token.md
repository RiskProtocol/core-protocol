# MockERC20Token
[Git Source](https://github.com/RiskProtocol/core-protocol/blob/ee827bcbd5b33da1299e0daca263c7bf65a112b7/contracts/mocks/MockERC20Token.sol)

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

