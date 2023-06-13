// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../TestHelper.sol";

contract TokenFactoryTest is Test, TestHelper {
    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);

        // deploy chainlink mock
        mockV3Aggregator = new MockV3Aggregator(DECIMALS, INITIAL_PRICE);
        address mockV3AggregatorAddress = address(mockV3Aggregator);

        // deploy underlying asset
        mockERC20Token = new MockERC20Token();
        tokenFactory = new TokenFactory();
        // mockERC20Token,
        // mockV3AggregatorAddress,
        // REBASE_INTERVAL,
        // sanctionsContract

        // deploy token X
        devTokenX = new DevToken();
        // TOKEN1_NAME,
        // TOKEN1_SYMBOL,
        // address(tokenFactory),
        // defaultOperators,
        // sanctionsContract
        // deploy token Y
        devTokenY = new DevToken();
        // TOKEN2_NAME,
        // TOKEN2_SYMBOL,
        // address(tokenFactory),
        // defaultOperators,
        // sanctionsContract

        // initialize dev tokens in token factory
        tokenFactory.initializeSMART(devTokenX, devTokenY);
    }

    function invariant_RebaseInterval() public {
        assertEq(tokenFactory.getInterval(), REBASE_INTERVAL);
    }

    function invariant_RebaseCount() public {
        assertLe(
            tokenFactory.getUserLastRebaseCount(deployer),
            tokenFactory.getScallingFactorLength()
        );
    }
}
