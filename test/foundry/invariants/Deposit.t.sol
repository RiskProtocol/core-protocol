// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../TestHelper.sol";
import "../handlers/DepositHandler.sol";

contract Deposit is Test, TestHelper  {   
    DepositHandler handler;
    
    function setUp() public {        
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);
       
        // deploy chainlink mock
        mockV3Aggregator = new MockV3Aggregator(DECIMALS, INITIAL_PRICE);
        address mockV3AggregatorAddress = address(mockV3Aggregator);

        // deploy underlying asset
        mockERC20Token = new MockERC20Token();
        tokenFactory = new TokenFactory(
            mockERC20Token,
            mockV3AggregatorAddress,
            REBASE_INTERVAL,
            sanctionsContract
        );

        // deploy token X
        devTokenX = new DevToken(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(tokenFactory),
            defaultOperators,
            sanctionsContract
        );
        // deploy token Y
        devTokenY = new DevToken(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(tokenFactory),
            defaultOperators,
            sanctionsContract
        );

        // initialize dev tokens in token factory
        tokenFactory.initialize(devTokenX, devTokenY);

        // invariant test
        handler = new DepositHandler(devTokenX, mockERC20Token);
        targetContract(address(handler));
    }

    // total supply of token x and y should be the same as total
    // deposit provided that rebase/withdrwal has not taken place
    function invariant_TotalDeposit() public {        
        assertEq(handler.totalDeposit(), devTokenX.totalSupply());
        assertEq(handler.totalDeposit(), devTokenY.totalSupply());
    }
}
