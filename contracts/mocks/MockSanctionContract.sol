// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

contract MockSanctionContract {
    mapping(address => bool) private sanctions;

    function isSanctioned(address addr) external view returns (bool) {
        return sanctions[addr];
    }

    function setSanction(address addr, bool isSanctioned_) external {
        sanctions[addr] = isSanctioned_;
    }
}
