// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../TestHelper.sol";
import "../handlers/DepositHandler.sol";

contract Deposit is Test, TestHelper {
    DepositHandler handler;
    TokenFactory factoryWrapper;
    SmartToken smartTokenXWrapper;
    SmartToken smartTokenYWrapper;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);
        address deployer = address(1);

        // deploy underlying asset
        mockERC20Token = new MockERC20Token();
        vm.startPrank(deployer);
        tokenFactory = new TokenFactory();
        tokenFactory = new TokenFactory();
        factoryProxy = new ERC1967Proxy(address(tokenFactory), "");
        factoryWrapper = TokenFactory(address(factoryProxy));
        factoryWrapper.initialize(
            mockERC20Token,
            REBALANCE_INTERVAL,
            sanctionsContract,
            signersAddress,
            deployer,
            WITHDRAW,
            DEPOSIT,
            PERIOD
        );

        // deploy token X
        smartTokenX = new SmartToken();

        vaultProxy = new ERC1967Proxy(address(smartTokenX), "");
        smartTokenXWrapper = SmartToken(address(vaultProxy));
        smartTokenXWrapper.initialize(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            true,
            deployer
        );
        // deploy token Y
        smartTokenY = new SmartToken();
        vault2Proxy = new ERC1967Proxy(address(smartTokenY), "");
        smartTokenYWrapper = SmartToken(address(vault2Proxy));
        smartTokenYWrapper.initialize(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            false,
            deployer
        );

        // initialize dev tokens in token factory
        factoryWrapper.initializeSMART(smartTokenXWrapper, smartTokenYWrapper);
        vm.stopPrank();
        // invariant test
        handler = new DepositHandler(smartTokenXWrapper, mockERC20Token);
        targetContract(address(handler));
    }

    // total supply of token x and y should be the same as total
    // deposit provided that rebalance/withdrwal has not taken place
    function invariant_TotalDeposit() public {
        assertEq(handler.totalDeposit(), smartTokenXWrapper.totalSupply());
        assertEq(handler.totalDeposit(), smartTokenYWrapper.totalSupply());
    }
}
