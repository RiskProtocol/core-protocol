// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "forge-std/Test.sol";
import "../../contracts/vaults/TokenFactory.sol";
import "../../contracts/mocks/MockERC20Token.sol";
import "../../contracts/vaults/SmartToken.sol";
import "../../contracts/mocks/MockUUPSProxy.sol";

abstract contract TestHelper {
    MockERC20Token public mockERC20Token;
    TokenFactory public tokenFactory;
    SmartToken public smartTokenX;
    SmartToken public smartTokenY;
    ERC1967Proxy public proxy;
    ERC1967Proxy public factoryProxy;
    ERC1967Proxy public vaultProxy;
    ERC1967Proxy public vault2Proxy;

    uint8 public constant DECIMALS = 18;
    int256 public constant INITIAL_PRICE = 2000000000000000000000;
    uint256 public constant REBALANCE_INTERVAL = 7890000;
    uint256 public constant FF_INTERVAL = 86400;
    string public TOKEN1_NAME = "RistP One";
    string public TOKEN1_SYMBOL = "R1";
    string public TOKEN2_NAME = "RistP Two";
    string public TOKEN2_SYMBOL = "R2";
    address public deployer = 0xe738696676571D9b74C81716E4aE797c2440d306;
    address public sanctionsContract =
        0x40C57923924B5c5c5455c48D93317139ADDaC8fb; //polygon network
    address public signersAddress = 0x786d956DBc070815F9b53a6dd03D38EDf33EE2C7;
    uint public DEPOSIT = 10 * 10 ** 50;
    uint public WITHDRAW = 10 * 10 ** 50;
    uint public PERIOD = 1;
}
