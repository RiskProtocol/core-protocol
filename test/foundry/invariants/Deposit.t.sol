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

        // deploy underlying asset
        mockERC20Token = new MockERC20Token();
        tokenFactory = new TokenFactory();
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
            sanctionsContract
        );
        // deploy token Y
        smartTokenY = new SmartToken();
        vault2Proxy = new UUPSProxy(address(smartTokenY), "");
        smartTokenYWrapper = SmartToken(address(vault2Proxy));
        smartTokenYWrapper.initialize(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(factoryWrapper),
            sanctionsContract
        );

        // initialize dev tokens in token factory
        factoryWrapper.initializeSMART(smartTokenXWrapper, smartTokenYWrapper);

        // invariant test
        handler = new DepositHandler(smartTokenXWrapper, mockERC20Token);
        targetContract(address(handler));
    }

    // total supply of token x and y should be the same as total
    // deposit provided that rebase/withdrwal has not taken place
    function invariant_TotalDeposit() public {
        assertEq(handler.totalDeposit(), smartTokenXWrapper.totalSupply());
        assertEq(handler.totalDeposit(), smartTokenYWrapper.totalSupply());
    }
}
