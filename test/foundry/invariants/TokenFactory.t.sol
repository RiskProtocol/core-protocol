// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../TestHelper.sol";

contract TokenFactoryTest is Test, TestHelper {
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
        factoryProxy = new ERC1967Proxy(address(tokenFactory), "");
        factoryWrapper = TokenFactory(address(factoryProxy));
        factoryWrapper.initialize(
            mockERC20Token,
            REBALANCE_INTERVAL,
            sanctionsContract,
            signersAddress,
            address(msg.sender)
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
            address(msg.sender)
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
            address(msg.sender)
        );

        // initialize dev tokens in token factory
        factoryWrapper.initializeSMART(smartTokenXWrapper, smartTokenYWrapper);
        vm.stopPrank();
    }

    function invariant_RebalanceInterval() public {
        assertEq(factoryWrapper.getInterval(), REBALANCE_INTERVAL);
    }

    function invariant_RebalanceCount() public {
        assertLe(
            factoryWrapper.getUserLastRebalanceCount(deployer),
            factoryWrapper.getRebalanceNumber()
        );
    }
}
