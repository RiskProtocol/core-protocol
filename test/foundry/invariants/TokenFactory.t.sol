// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../TestHelper.sol";

contract TokenFactoryTest is Test, TestHelper {
    TokenFactory factoryWrapper;
    SmartToken smartTokenXWrapper;
    SmartToken smartTokenYWrapper;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);

        // deploy underlying asset
        mockERC20Token = new MockERC20Token();
        tokenFactory = new TokenFactory();
        factoryProxy = new UUPSProxy(address(tokenFactory), "");
        factoryWrapper = TokenFactory(address(factoryProxy));
        factoryWrapper.initialize(
            mockERC20Token,
            REBASE_INTERVAL,
            sanctionsContract,
            signersAddress
        );

        // deploy token X
        smartTokenX = new SmartToken();

        vaultProxy = new UUPSProxy(address(smartTokenX), "");
        smartTokenXWrapper = SmartToken(address(vaultProxy));
        smartTokenXWrapper.initialize(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            true
        );
        // deploy token Y
        smartTokenY = new SmartToken();
        vault2Proxy = new UUPSProxy(address(smartTokenY), "");
        smartTokenYWrapper = SmartToken(address(vault2Proxy));
        smartTokenYWrapper.initialize(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            false
        );

        // initialize dev tokens in token factory
        factoryWrapper.initializeSMART(smartTokenXWrapper, smartTokenYWrapper);
    }

    function invariant_RebaseInterval() public {
        assertEq(factoryWrapper.getInterval(), REBASE_INTERVAL);
    }

    function invariant_RebaseCount() public {
        assertLe(
            factoryWrapper.getUserLastRebaseCount(deployer),
            factoryWrapper.getRebaseNumber()
        );
    }
}
