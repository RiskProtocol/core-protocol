pragma solidity >=0.8.0;

import "./../TestHelper.sol";

contract _Test is Test, TestHelper {
    TokenFactory factoryWrapper;
    SmartToken smartTokenXWrapper;
    SmartToken smartTokenYWrapper;
    MockERC20Token underlying;
    address private owner;
    address private nonAuthorized;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("mainnet"), 17268750);

        owner = vm.addr(1);
        nonAuthorized = address(20);
        vm.startPrank(owner);
        // deploy chainlink mock
        mockV3Aggregator = new MockV3Aggregator(DECIMALS, INITIAL_PRICE);
        address mockV3AggregatorAddress = address(mockV3Aggregator);

        // deploy underlying asset
        underlying = new MockERC20Token();
        tokenFactory = new TokenFactory();
        factoryProxy = new UUPSProxy(address(tokenFactory), "");
        factoryWrapper = TokenFactory(address(factoryProxy));
        factoryWrapper.initialize(
            underlying,
            mockV3AggregatorAddress,
            REBASE_INTERVAL,
            sanctionsContract
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
        vm.stopPrank();
    }

    function testCanInitialize() public {
        assertEq(factoryWrapper.getInterval(), REBASE_INTERVAL);
        assertEq(address(factoryWrapper.getBaseToken()), address(underlying));
        assertEq(smartTokenYWrapper.name(), TOKEN2_NAME);
        assertEq((smartTokenYWrapper.symbol()), TOKEN2_SYMBOL);
        assertEq(smartTokenXWrapper.name(), TOKEN1_NAME);
        assertEq((smartTokenXWrapper.symbol()), TOKEN1_SYMBOL);
    }

    function testCanUpgrade() public {
        vm.startPrank(owner);

        TokenFactory tokenFactory2 = new TokenFactory();
        factoryWrapper.upgradeTo(address(tokenFactory2));

        assertEq(factoryWrapper.getInterval(), REBASE_INTERVAL);
        assertEq(address(factoryWrapper.getBaseToken()), address(underlying));
        assertEq(address(factoryWrapper.owner()), address(owner));

        SmartToken smartTok2 = new SmartToken();
        smartTokenXWrapper.upgradeTo(address(smartTok2));
        smartTokenYWrapper.upgradeTo(address(smartTok2));

        assertEq(smartTokenYWrapper.name(), TOKEN2_NAME);
        assertEq((smartTokenYWrapper.symbol()), TOKEN2_SYMBOL);
        assertEq(smartTokenXWrapper.name(), TOKEN1_NAME);
        assertEq((smartTokenXWrapper.symbol()), TOKEN1_SYMBOL);
        assertEq(address(smartTokenXWrapper.owner()), address(owner));
        assertEq(address(smartTokenYWrapper.owner()), address(owner));

        vm.stopPrank();
    }

    function testUnauthorizedUpgrade() public {
        vm.startPrank(nonAuthorized);
        TokenFactory tokenFactory2 = new TokenFactory();
        SmartToken smartTok2 = new SmartToken();

        vm.expectRevert();
        factoryWrapper.upgradeTo(address(tokenFactory2));
        vm.expectRevert();
        smartTokenXWrapper.upgradeTo(address(smartTok2));
        vm.expectRevert();
        smartTokenYWrapper.upgradeTo(address(smartTok2));
        vm.stopPrank();
    }
}
