// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/vaults/TokenFactory.sol";
import "../../contracts/mocks/MockV3Aggregator.sol";
import "../../contracts/mocks/MockERC20Token.sol";
import "../../contracts/vaults/DevToken.sol";

abstract contract TestHelper {
    MockV3Aggregator public mockV3Aggregator;
    MockERC20Token public mockERC20Token;
    TokenFactory public tokenFactory;
    DevToken public devTokenX;
    DevToken public devTokenY;

    uint8 public constant DECIMALS = 18;
    int256 public constant INITIAL_PRICE = 2000000000000000000000;
    uint256 public constant REBASE_INTERVAL = 7890000;
    string public TOKEN1_NAME = "RistP One";
    string public TOKEN1_SYMBOL = "R1";
    string public TOKEN2_NAME = "RistP Two";
    string public TOKEN2_SYMBOL = "R2";
    address[] public defaultOperators;
    address public deployer = 0xe738696676571D9b74C81716E4aE797c2440d306;
    address public sanctionsContract = 0x40C57923924B5c5c5455c48D93317139ADDaC8fb; //polygon network
}