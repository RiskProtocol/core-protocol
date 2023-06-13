// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "./../TestHelper.sol";

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

    function testFuzz_ConvertToShares(uint256 amount) public {
        assertEq(devTokenX.convertToShares(amount), amount);
    }

    function testFuzz_ConvertToAssets(uint256 amount) public {
        assertEq(devTokenX.convertToAssets(amount), amount);
    }

    function testFuzz_PreviewDeposit(uint256 amount) public {
        assertEq(devTokenX.previewDeposit(amount), amount);
    }

    // ensures users receive correct amount of token after deposit
    function testFuzz_Deposit(uint256 amount) public {
        vm.assume(amount > 0 ether);

        mockERC20Token.approve(address(tokenFactory), amount);
        devTokenX.deposit(amount, msg.sender);

        assertEq(devTokenX.balanceOf(msg.sender), amount);
        assertEq(devTokenY.balanceOf(msg.sender), amount);
    }

    // ensures users are debited correct amount of underlying token after making deposit
    function testFuzz_DebitUser(uint256 amount) public {
        vm.assume(amount > 0 ether);

        uint256 userCurrentBalance = mockERC20Token.balanceOf(address(this));
        uint256 expectedBalance = userCurrentBalance - amount;

        mockERC20Token.approve(address(tokenFactory), amount);
        devTokenX.deposit(amount, msg.sender);

        assertEq(mockERC20Token.balanceOf(address(this)), expectedBalance);
    }

    // it should confirm that user gets correct amount of underlying token back after withdrawal
    function testFuzz_Withdraw(uint256 amount) public {
        vm.assume(amount > 0 ether);
        vm.startPrank(address(0xaa));
        deal(address(mockERC20Token), address(0xaa), type(uint256).max);

        mockERC20Token.approve(address(tokenFactory), amount);
        devTokenX.deposit(amount, address(0xaa));

        uint256 userCurrentBalance = mockERC20Token.balanceOf(address(0xaa));
        uint256 expectedBalance = userCurrentBalance + amount;

        // withdraw underlying token
        devTokenX.withdraw(amount, address(0xaa), address(0xaa));

        assertEq(mockERC20Token.balanceOf(address(0xaa)), expectedBalance);
    }

    function testFuzz_PreviewMint(uint256 amount) public {
        assertEq(devTokenX.previewMint(amount), amount);
    }

    // ensures users receive correct amount of token after minting
    function testFuzz_Minting(uint256 amount) public {
        vm.assume(amount > 0 ether);

        mockERC20Token.approve(address(tokenFactory), amount);
        devTokenX.mint(amount, msg.sender);

        assertEq(devTokenX.balanceOf(msg.sender), amount);
        assertEq(devTokenY.balanceOf(msg.sender), amount);
    }

    function testFuzz_PreviewWithdraw(uint256 amount) public {
        assertEq(devTokenX.previewWithdraw(amount), amount);
    }

    function testFuzz_PreviewRedeem(uint256 amount) public {
        assertEq(devTokenX.previewRedeem(amount), amount);
    }

    function testFuzz_DepositXWithdrawY(uint128 amount) public {
        if (amount == 0) amount = 1;

        uint256 aliceUnderlyingAmount = amount;

        address alice = address(0xABCD);

        mockERC20Token.transfer(alice, aliceUnderlyingAmount);

        vm.prank(alice);

        mockERC20Token.approve(address(tokenFactory), aliceUnderlyingAmount);

        assertEq(
            mockERC20Token.allowance(alice, address(tokenFactory)),
            aliceUnderlyingAmount
        );

        uint256 alicePreDepositBal = mockERC20Token.balanceOf(alice);

        vm.prank(alice);
        uint256 aliceShareAmount = devTokenX.deposit(
            aliceUnderlyingAmount,
            alice
        );

        // Expect exchange rate to be 1:1 on initial deposit.
        assertEq(aliceUnderlyingAmount, aliceShareAmount);
        assertEq(
            devTokenX.previewWithdraw(aliceShareAmount),
            aliceUnderlyingAmount
        );
        assertEq(
            devTokenY.previewDeposit(aliceUnderlyingAmount),
            aliceShareAmount
        );
        assertEq(devTokenX.totalSupply(), aliceShareAmount);
        assertEq(devTokenY.totalAssets(), aliceUnderlyingAmount);
        assertEq(devTokenY.balanceOf(alice), aliceShareAmount);
        assertEq(
            devTokenY.convertToAssets(devTokenX.balanceOf(alice)),
            aliceUnderlyingAmount
        );
        assertEq(
            mockERC20Token.balanceOf(alice),
            alicePreDepositBal - aliceUnderlyingAmount
        );

        vm.prank(alice);
        devTokenY.withdraw(aliceUnderlyingAmount, alice, alice);

        assertEq(devTokenX.totalAssets(), 0);
        assertEq(devTokenX.balanceOf(alice), 0);
        assertEq(devTokenY.convertToAssets(devTokenX.balanceOf(alice)), 0);
        assertEq(mockERC20Token.balanceOf(alice), alicePreDepositBal);
    }
}
