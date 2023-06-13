pragma solidity >=0.8.0;
import {PRBTest} from "@prb/test/PRBTest.sol";
//import "@std/console.sol";
//import "./../TestHelper.sol";
import {Vm} from "forge-std/Vm.sol";
import {DSTest} from "ds-test/test.sol";
import "./../TestHelper.sol";

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ProxyTester} from "../../../lib/foundry-upgrades/src/ProxyTester.sol";

contract _Test is DSTest, TestHelper {
    TokenFactory tokenFactory1;
    TokenFactory tokenFactoryProxy1;
    TokenFactory tokenFactoryProxy2;
    MockERC20Token underlying;
    ProxyTester proxy1;
    //MockV3Aggregator mockV3Aggregator;
    //MockERC20Token mockERC20Token;
    address proxyAddress;

    address admin;
    //n network
    Vm constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function setUp() public {
        mockV3Aggregator = new MockV3Aggregator(DECIMALS, INITIAL_PRICE);
        address mockV3AggregatorAddress = address(mockV3Aggregator);

        // deploy underlying asset
        underlying = new MockERC20Token();

        //
        proxy1 = new ProxyTester();

        tokenFactory1 = new TokenFactory();
        admin = vm.addr(69);

        proxy1.setType("uups");
        proxyAddress = proxy1.deploy(address(tokenFactory1), admin);

        assertEq(proxyAddress, proxy1.proxyAddress());
        assertEq(proxyAddress, address(proxy1.uups()));

        // wrap in ABI to support easier calls
        tokenFactoryProxy1 = TokenFactory(address(proxyAddress));
        //proxy = new UUPSProxy(address(tokenFactory1), "");
        //tokenFactoryProxy1 = TokenFactory(address(proxy));
        tokenFactoryProxy1.initialize(
            underlying,
            mockV3AggregatorAddress,
            REBASE_INTERVAL,
            sanctionsContract
        );
    }

    function testCanInitialize() public {
        assertEq(tokenFactoryProxy1.getInterval(), REBASE_INTERVAL);
    }
}
