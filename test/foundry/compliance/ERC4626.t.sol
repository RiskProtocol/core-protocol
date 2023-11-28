// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.9;

import {Test} from "forge-std/Test.sol";
import "./../TestHelper.sol";

contract ERC4626Test is Test, TestHelper {
    MockERC20Token underlying;
    SmartToken vault;
    SmartToken vault2;
    TokenFactory factoryWrapper;
    SmartToken vaultWrapper1;
    SmartToken vaultWrapper2;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);

        // deploy chainlink mock

        // deploy underlying asset
        underlying = new MockERC20Token();
        tokenFactory = new TokenFactory();

        factoryProxy = new UUPSProxy(address(tokenFactory), "");
        factoryWrapper = TokenFactory(address(factoryProxy));
        factoryWrapper.initialize(
            underlying,
            REBALANCE_INTERVAL,
            sanctionsContract,
            signersAddress
        );

        vault = new SmartToken();
        vaultProxy = new UUPSProxy(address(vault), "");
        vaultWrapper1 = SmartToken(address(vaultProxy));
        vaultWrapper1.initialize(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            true
        );

        vault2 = new SmartToken();
        vault2Proxy = new UUPSProxy(address(vault2), "");
        vaultWrapper2 = SmartToken(address(vault2Proxy));
        vaultWrapper2.initialize(
            TOKEN2_NAME,
            TOKEN2_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            false
        );

        // initialize dev tokens in token factory
        factoryWrapper.initializeSMART(vaultWrapper1, vaultWrapper2);
    }

    function testMetadata() public {
        SmartToken vlt = new SmartToken();
        UUPSProxy vltProxy = new UUPSProxy(address(vlt), "");
        SmartToken vltWrapper = SmartToken(address(vltProxy));
        vltWrapper.initialize(
            TOKEN1_NAME,
            TOKEN1_SYMBOL,
            address(factoryWrapper),
            sanctionsContract,
            true
        );

        assertEq(vltWrapper.name(), TOKEN1_NAME);
        assertEq(vltWrapper.symbol(), TOKEN1_SYMBOL);
        assertEq(address(vltWrapper.asset()), address(underlying));
        assertEq(vltWrapper.decimals(), 18);
    }

    function testFuzz_SingleDepositWithdraw(uint128 amount) public {
        if (amount == 0) amount = 1;

        uint256 aliceUnderlyingAmount = amount;

        address alice = address(0xABCD);

        underlying.transfer(alice, aliceUnderlyingAmount);

        vm.prank(alice);

        underlying.approve(address(factoryWrapper), aliceUnderlyingAmount);

        assertEq(
            underlying.allowance(alice, address(factoryWrapper)),
            aliceUnderlyingAmount
        );

        uint256 alicePreDepositBal = underlying.balanceOf(alice);

        vm.prank(alice);
        uint256 aliceShareAmount = vaultWrapper1.deposit(
            aliceUnderlyingAmount,
            alice
        );

        // Expect exchange rate to be 1:1 on initial deposit.
        assertEq(aliceUnderlyingAmount, aliceShareAmount);
        assertEq(
            vaultWrapper1.previewWithdraw(aliceShareAmount),
            aliceUnderlyingAmount
        );
        assertEq(
            vaultWrapper1.previewDeposit(aliceUnderlyingAmount),
            aliceShareAmount
        );
        assertEq(vaultWrapper1.totalSupply(), aliceShareAmount);
        assertEq(vaultWrapper1.totalAssets(), aliceUnderlyingAmount);
        assertEq(vaultWrapper1.balanceOf(alice), aliceShareAmount);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(alice)),
            aliceUnderlyingAmount
        );
        assertEq(
            underlying.balanceOf(alice),
            alicePreDepositBal - aliceUnderlyingAmount
        );

        vm.prank(alice);
        vaultWrapper1.withdraw(aliceUnderlyingAmount, alice, alice);

        assertEq(vaultWrapper1.totalAssets(), 0);
        assertEq(vaultWrapper1.balanceOf(alice), 0);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(alice)),
            0
        );
        assertEq(underlying.balanceOf(alice), alicePreDepositBal);
    }

    function testFuzz_SingleMintRedeem(uint128 amount) public {
        if (amount == 0) amount = 1;

        uint256 aliceShareAmount = amount;

        address alice = address(0xABCD);

        underlying.transfer(alice, aliceShareAmount);

        vm.prank(alice);
        underlying.approve(address(factoryWrapper), aliceShareAmount);
        assertEq(
            underlying.allowance(alice, address(factoryWrapper)),
            aliceShareAmount
        );

        uint256 alicePreDepositBal = underlying.balanceOf(alice);

        vm.prank(alice);
        uint256 aliceUnderlyingAmount = vaultWrapper1.mint(
            aliceShareAmount,
            alice
        );

        // Expect exchange rate to be 1:1 on initial mint.
        assertEq(aliceShareAmount, aliceUnderlyingAmount);
        assertEq(
            vaultWrapper1.previewWithdraw(aliceShareAmount),
            aliceUnderlyingAmount
        );
        assertEq(
            vaultWrapper1.previewDeposit(aliceUnderlyingAmount),
            aliceShareAmount
        );
        assertEq(vaultWrapper1.totalSupply(), aliceShareAmount);
        assertEq(vaultWrapper1.totalAssets(), aliceUnderlyingAmount);
        assertEq(vaultWrapper1.balanceOf(alice), aliceUnderlyingAmount);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(alice)),
            aliceUnderlyingAmount
        );
        assertEq(
            underlying.balanceOf(alice),
            alicePreDepositBal - aliceUnderlyingAmount
        );

        vm.prank(alice);
        vaultWrapper1.redeem(aliceShareAmount, alice, alice);

        assertEq(vaultWrapper1.totalAssets(), 0);
        assertEq(vaultWrapper1.balanceOf(alice), 0);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(alice)),
            0
        );
        assertEq(underlying.balanceOf(alice), alicePreDepositBal);
    }

    function testMultipleMintDepositRedeemWithdraw() public {
        // Scenario:
        // A = Alice, B = Bob
        //  ________________________________________________________
        // | Vault shares | A share | A assets | B share | B assets |
        // |========================================================|
        // | 1. Alice mints 2000 shares (costs 2000 tokens)         |
        // |--------------|---------|----------|---------|----------|
        // |         2000 |    2000 |     2000 |       0 |        0 |
        // |--------------|---------|----------|---------|----------|
        // | 2. Bob deposits 4000 tokens (mints 4000 shares)        |
        // |--------------|---------|----------|---------|----------|
        // |         6000 |    2000 |     2000 |    4000 |     4000 |
        //  --------------------------------------------------------

        address alice = address(0xABCD);
        address bob = address(0xDCBA);

        underlying.transfer(alice, 4000);

        vm.prank(alice);
        underlying.approve(address(factoryWrapper), 4000);

        assertEq(underlying.allowance(alice, address(factoryWrapper)), 4000);

        underlying.transfer(bob, 7001);

        vm.prank(bob);
        underlying.approve(address(factoryWrapper), 7001);

        assertEq(underlying.allowance(bob, address(factoryWrapper)), 7001);

        // 1. Alice mints 2000 shares (costs 2000 tokens)
        vm.prank(alice);

        uint256 aliceUnderlyingAmount = vaultWrapper1.mint(2000, alice);

        uint256 aliceShareAmount = vaultWrapper1.previewDeposit(
            aliceUnderlyingAmount
        );

        // Expect to have received the requested mint amount.
        assertEq(aliceShareAmount, 2000);

        assertEq(vaultWrapper1.balanceOf(alice), aliceShareAmount);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(alice)),
            aliceUnderlyingAmount
        );
        assertEq(
            vaultWrapper1.convertToShares(aliceUnderlyingAmount),
            vaultWrapper1.balanceOf(alice)
        );

        // Expect a 1:1 ratio before mutation.
        assertEq(aliceUnderlyingAmount, 2000);

        // Sanity check.
        assertEq(vaultWrapper1.totalSupply(), aliceShareAmount);
        assertEq(vaultWrapper1.totalAssets(), aliceUnderlyingAmount);

        // 2. Bob deposits 4000 tokens (mints 4000 shares)
        vm.prank(bob);
        uint256 bobShareAmount = vaultWrapper1.deposit(4000, bob);
        uint256 bobUnderlyingAmount = vaultWrapper1.previewWithdraw(
            bobShareAmount
        );

        // Expect to have received the requested underlying amount.
        assertEq(bobUnderlyingAmount, 4000);
        assertEq(vaultWrapper1.balanceOf(bob), bobShareAmount);
        assertEq(
            vaultWrapper1.convertToAssets(vaultWrapper1.balanceOf(bob)),
            bobUnderlyingAmount
        );
        assertEq(
            vaultWrapper1.convertToShares(bobUnderlyingAmount),
            vaultWrapper1.balanceOf(bob)
        );

        // Expect a 1:1 ratio before mutation.
        assertEq(bobShareAmount, bobUnderlyingAmount);

        // Sanity check.
        uint256 preMutationShareBal = aliceShareAmount + bobShareAmount;
        uint256 preMutationBal = aliceUnderlyingAmount + bobUnderlyingAmount;
        assertEq(vaultWrapper1.totalSupply(), preMutationShareBal);
        assertEq(vaultWrapper1.totalAssets(), preMutationBal);
        assertEq(vaultWrapper1.totalSupply(), 6000);
        assertEq(vaultWrapper1.totalAssets(), 6000);
    }

    function testFailDepositWithNotEnoughApproval() public {
        underlying.transfer(address(this), 0.5e18);
        underlying.approve(address(factoryWrapper), 0.5e18);
        assertEq(
            underlying.allowance(address(this), address(factoryWrapper)),
            0.5e18
        );

        vaultWrapper1.deposit(1e18, address(this));
    }

    function testFailWithdrawWithNotEnoughUnderlyingAmount() public {
        underlying.transfer(address(this), 0.5e18);
        underlying.approve(address(factoryWrapper), 0.5e18);

        vaultWrapper1.deposit(0.5e18, address(this));

        vaultWrapper1.withdraw(1e18, address(this), address(this));
    }

    function testFailRedeemWithNotEnoughShareAmount() public {
        underlying.transfer(address(this), 0.5e18);
        underlying.approve(address(factoryWrapper), 0.5e18);

        vaultWrapper1.deposit(0.5e18, address(this));

        vaultWrapper1.redeem(1e18, address(this), address(this));
    }

    function testFailWithdrawWithNoUnderlyingAmount() public {
        vaultWrapper1.withdraw(1e18, address(this), address(this));
    }

    function testFailRedeemWithNoShareAmount() public {
        vaultWrapper1.redeem(1e18, address(this), address(this));
    }

    function testFailDepositWithNoApproval() public {
        vaultWrapper1.deposit(1e18, address(this));
    }

    function testFailMintWithNoApproval() public {
        vaultWrapper1.mint(1e18, address(this));
    }

    function testFailDepositZero() public {
        vaultWrapper1.deposit(0, address(this));
    }

    function testWithdrawZero() public {
        vaultWrapper1.withdraw(0, address(this), address(this));

        assertEq(vaultWrapper1.balanceOf(address(this)), 0);
        assertEq(
            vaultWrapper1.convertToAssets(
                vaultWrapper1.balanceOf(address(this))
            ),
            0
        );
        assertEq(vaultWrapper1.totalSupply(), 0);
        assertEq(vaultWrapper1.totalAssets(), 0);
    }

    function testVaultInteractionsForSomeoneElse() public {
        // init 2 users with a 1e18 balance
        address alice = address(0xABCD);
        address bob = address(0xDCBA);
        underlying.transfer(alice, 1e18);
        underlying.transfer(bob, 1e18);

        vm.prank(alice);
        underlying.approve(address(factoryWrapper), 1e18);

        vm.prank(bob);
        underlying.approve(address(factoryWrapper), 1e18);

        // alice deposits 1e18 for bob
        vm.prank(alice);
        vaultWrapper1.deposit(1e18, bob);

        assertEq(vaultWrapper1.balanceOf(alice), 0);
        assertEq(vaultWrapper1.balanceOf(bob), 1e18);
        assertEq(underlying.balanceOf(alice), 0);

        // bob mint 1e18 for alice
        vm.prank(bob);
        vaultWrapper1.mint(1e18, alice);
        assertEq(vaultWrapper1.balanceOf(alice), 1e18);
        assertEq(vaultWrapper1.balanceOf(bob), 1e18);
        assertEq(underlying.balanceOf(bob), 0);

        // alice redeem 1e18 for bob
        vm.prank(alice);
        vaultWrapper1.redeem(1e18, bob, alice);

        assertEq(vaultWrapper1.balanceOf(alice), 0);
        assertEq(vaultWrapper1.balanceOf(bob), 1e18);
        assertEq(underlying.balanceOf(bob), 1e18);

        // bob withdraw 1e18 for alice
        vm.prank(bob);
        vaultWrapper1.withdraw(1e18, alice, bob);

        assertEq(vaultWrapper1.balanceOf(alice), 0);
        assertEq(vaultWrapper1.balanceOf(bob), 0);
        assertEq(underlying.balanceOf(alice), 1e18);
    }
}
