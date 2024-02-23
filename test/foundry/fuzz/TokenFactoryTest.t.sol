// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "./../TestHelper.sol";

contract TokenFactoryTest is Test, TestHelper {
    TokenFactory factoryWrapper;
    SmartToken smartTokenXWrapper;
    SmartToken smartTokenYWrapper;

    function setUp() public {
        address deployer = address(1);
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);

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
    }

    function testFuzz_ConvertToShares(uint256 amount) public {
        assertEq(smartTokenXWrapper.convertToShares(amount), amount);
    }

    function testFuzz_ConvertToAssets(uint256 amount) public {
        assertEq(smartTokenXWrapper.convertToAssets(amount), amount);
    }

    function testFuzz_PreviewDeposit(uint256 amount) public {
        assertEq(smartTokenXWrapper.previewDeposit(amount), amount);
    }

    // ensures users receive correct amount of token after deposit
    function testFuzz_Deposit(uint256 amount) public {
        vm.assume(amount > 0 ether);

        mockERC20Token.approve(address(factoryWrapper), amount);
        smartTokenXWrapper.deposit(amount, msg.sender);

        assertEq(smartTokenXWrapper.balanceOf(msg.sender), amount);
        assertEq(smartTokenYWrapper.balanceOf(msg.sender), amount);
    }

    // ensures users are debited correct amount of underlying token after making deposit
    function testFuzz_DebitUser(uint256 amount) public {
        vm.assume(amount > 0 ether);

        uint256 userCurrentBalance = mockERC20Token.balanceOf(address(this));
        uint256 expectedBalance = userCurrentBalance - amount;

        mockERC20Token.approve(address(factoryWrapper), amount);
        smartTokenXWrapper.deposit(amount, msg.sender);

        assertEq(mockERC20Token.balanceOf(address(this)), expectedBalance);
    }

    // it should confirm that user gets correct amount of underlying token back after withdrawal
    function testFuzz_Withdraw(uint256 amount) public {
        vm.assume(amount > 0 ether);
        vm.startPrank(address(0xaa));
        deal(address(mockERC20Token), address(0xaa), type(uint256).max);

        mockERC20Token.approve(address(factoryWrapper), amount);
        smartTokenXWrapper.deposit(amount, address(0xaa));

        uint256 userCurrentBalance = mockERC20Token.balanceOf(address(0xaa));
        uint256 expectedBalance = userCurrentBalance + amount;

        // withdraw underlying token
        smartTokenXWrapper.withdraw(amount, address(0xaa), address(0xaa));

        assertEq(mockERC20Token.balanceOf(address(0xaa)), expectedBalance);
    }

    function testFuzz_PreviewMint(uint256 amount) public {
        assertEq(smartTokenXWrapper.previewMint(amount), amount);
    }

    // ensures users receive correct amount of token after minting
    function testFuzz_Minting(uint256 amount) public {
        vm.assume(amount > 0 ether);

        mockERC20Token.approve(address(factoryWrapper), amount);
        smartTokenXWrapper.mint(amount, msg.sender);

        assertEq(smartTokenXWrapper.balanceOf(msg.sender), amount);
        assertEq(smartTokenYWrapper.balanceOf(msg.sender), amount);
    }

    function testFuzz_PreviewWithdraw(uint256 amount) public {
        assertEq(smartTokenXWrapper.previewWithdraw(amount), amount);
    }

    function testFuzz_PreviewRedeem(uint256 amount) public {
        assertEq(smartTokenXWrapper.previewRedeem(amount), amount);
    }

    function testFuzz_DepositXWithdrawY(uint128 amount) public {
        if (amount == 0) amount = 1;

        uint256 aliceUnderlyingAmount = amount;

        address alice = address(0xABCD);

        mockERC20Token.transfer(alice, aliceUnderlyingAmount);

        vm.prank(alice);

        mockERC20Token.approve(address(factoryWrapper), aliceUnderlyingAmount);

        assertEq(
            mockERC20Token.allowance(alice, address(factoryWrapper)),
            aliceUnderlyingAmount
        );

        uint256 alicePreDepositBal = mockERC20Token.balanceOf(alice);

        vm.prank(alice);
        uint256 aliceShareAmount = smartTokenXWrapper.deposit(
            aliceUnderlyingAmount,
            alice
        );

        // Expect exchange rate to be 1:1 on initial deposit.
        assertEq(aliceUnderlyingAmount, aliceShareAmount);
        assertEq(
            smartTokenXWrapper.previewWithdraw(aliceShareAmount),
            aliceUnderlyingAmount
        );
        assertEq(
            smartTokenYWrapper.previewDeposit(aliceUnderlyingAmount),
            aliceShareAmount
        );
        assertEq(smartTokenXWrapper.totalSupply(), aliceShareAmount);
        assertEq(smartTokenYWrapper.totalAssets(), aliceUnderlyingAmount);
        assertEq(smartTokenYWrapper.balanceOf(alice), aliceShareAmount);
        assertEq(
            smartTokenYWrapper.convertToAssets(
                smartTokenXWrapper.balanceOf(alice)
            ),
            aliceUnderlyingAmount
        );
        assertEq(
            mockERC20Token.balanceOf(alice),
            alicePreDepositBal - aliceUnderlyingAmount
        );

        vm.prank(alice);
        smartTokenYWrapper.withdraw(aliceUnderlyingAmount, alice, alice);

        assertEq(smartTokenXWrapper.totalAssets(), 0);
        assertEq(smartTokenXWrapper.balanceOf(alice), 0);
        assertEq(
            smartTokenYWrapper.convertToAssets(
                smartTokenXWrapper.balanceOf(alice)
            ),
            0
        );
        assertEq(mockERC20Token.balanceOf(alice), alicePreDepositBal);
    }
}
