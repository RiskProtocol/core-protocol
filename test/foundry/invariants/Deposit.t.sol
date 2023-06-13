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
        smartTokenX = new SmartToken(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(tokenFactory),
            sanctionsContract
        );
        // deploy token Y
        smartTokenY = new SmartToken(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(tokenFactory),
            sanctionsContract
        );

        // initialize dev tokens in token factory
        tokenFactory.initialize(smartTokenX, smartTokenY);

        // invariant test
        handler = new DepositHandler(smartTokenX, mockERC20Token);
        targetContract(address(handler));
    }

    // total supply of token x and y should be the same as total
    // deposit provided that rebase/withdrwal has not taken place
    function invariant_TotalDeposit() public {        
        assertEq(handler.totalDeposit(), smartTokenX.totalSupply());
        assertEq(handler.totalDeposit(), smartTokenY.totalSupply());
    }
}
