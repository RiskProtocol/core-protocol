// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockBalancerPool
 * @dev Simulates a Balancer Pool for testing purposes.
 */
contract MockBalancerPool {

    constructor(){}

    uint256 private tokenAmountOut;
    bool private isBound_;

    function swapExactAmountIn(
        address tokenIn,
        uint256 tokenAmountIn,
        address tokenOut,
        uint256 minAmountOut,
        uint256 maxPrice
    ) external returns (uint , uint ) {
    
        return (tokenAmountOut,0);
    }

        function isBound(address token) external view returns (bool){
            return isBound_;
        }

    function testMock(uint256 tokenAmountOut_) public {
        tokenAmountOut = tokenAmountOut_;
    }
    function testIsBound(bool isBound_par) public {
        isBound_ = isBound_par;
    }
}
