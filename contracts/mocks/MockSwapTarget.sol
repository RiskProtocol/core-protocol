//Mocking the swap target contract
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract MockSwapTarget {
    bool public shouldFail;

    // Function to set the failure mode of the swap call
    function setShouldFail(bool _shouldFail) public {
        shouldFail = _shouldFail;
    }

    // Fallback function to simulate swap call
    // This function simulates the swap operation
    receive() external payable {
        require(!shouldFail, "Mock: swap failed");
    }

    function dummyData() public returns (bytes memory) {
        return abi.encodeWithSignature("dummyData()");
    }
}
