// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/oneinch/IAggregationRouterV6.sol";

contract OneInchRouterMock {
    address public underlyingToken;
    uint256 public returnAmount;
    address public recipient;

    constructor(address _underlyingToken) {
        underlyingToken = _underlyingToken;
        returnAmount = 4950 ether; // Default return amount
    }

    function setReturnAmount(uint256 _returnAmount) external {
        returnAmount = _returnAmount;
    }

    function setRecipient(address _recipient) external {
        recipient = _recipient;
    }

    function swap(
        IAggregationExecutor executor,
        IAggregationRouterV6.SwapDescription calldata desc,
        bytes calldata data

    ) external payable returns (uint256, uint256) {
        //router should be able to pull src.token from the Atomic Swap contract
        IERC20(desc.srcToken).transferFrom(msg.sender, address(this), desc.amount);
        // Simulate transfer of underlying tokens to the contract
        IERC20(desc.dstToken).transfer(recipient, desc.minReturnAmount);
        // For testing, return fixed values
        return (returnAmount, desc.amount); // returnAmount, spentAmount
    }

function encodeData(
    address executor,
    IAggregationRouterV6.SwapDescription memory desc,
    bytes memory swapData
)
    public
    pure
    returns (bytes memory)
{
    // Define the function signature of the target function
    string memory functionSignature = "swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes)";
    
    // Compute the function selector
    bytes4 functionSelector = bytes4(keccak256(bytes(functionSignature)));
    
    // Encode the data with the function selector
    bytes memory encodedData = abi.encodeWithSelector(
        functionSelector,
        executor,
        desc,
        swapData
    );
    
    return encodedData;
}

}
