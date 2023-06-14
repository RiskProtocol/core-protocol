import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  defaultOperators,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  DECIMALS,
  INITIAL_PRICE,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { token } from "../../typechain-types/@openzeppelin/contracts";
import { days } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time/duration";
import { BigNumber } from "ethers";

developmentChains.includes(network.name)
  ? describe("TokenFactory", async function () {
      async function deployTokenFixture() {
        const [deployer, tester] = await ethers.getSigners();

        const MockV3AggregatorFactory = await ethers.getContractFactory(
          "MockV3Aggregator",
          deployer
        );
        const mockV3Aggregator = await MockV3AggregatorFactory.deploy(
          DECIMALS,
          INITIAL_PRICE
        );
        await mockV3Aggregator.deployed();

        const MockERC20TokenWithPermit = await ethers.getContractFactory(
          "MockERC20TokenWithPermit",
          deployer
        );
        const underlyingToken = await MockERC20TokenWithPermit.deploy();
        await underlyingToken.deployed();

        // deploy sanctions list mock
        const SanctionsList = await ethers.getContractFactory(
          "MockSanctionContract",
          deployer
        );
        const sanctionsContract = await SanctionsList.deploy();
        await sanctionsContract.deployed();

        const TokenFactory = await ethers.getContractFactory(
          "TokenFactory",
          deployer
        );

        let tokenFactory = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address,
        ]);
        await tokenFactory.deployed();

        // deploy devtoken 1
        const SmartToken1Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartToken1 = await upgrades.deployProxy(SmartToken1Factory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
        ]);
        await SmartToken1.deployed();

        // deploy Smarttoken 2
        const SmartToken2Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartToken2 = await upgrades.deployProxy(SmartToken2Factory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
        ]);
        await SmartToken2.deployed();

        // other instances to mock fake underlying token
        const TokenFactory2 = await ethers.getContractFactory(
          "TokenFactory",
          tester
        );

        const tokenFactory2 = await upgrades.deployProxy(TokenFactory2, [
          "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address,
        ]);
        await tokenFactory2.deployed();

        // Underlying Asset without permit function
        const MockERC20TokenWithoutPermit = await ethers.getContractFactory(
          "MockERC20TokenWithoutPermit",
          deployer
        );
        const underlyingTokenWithoutPermit =
          await MockERC20TokenWithoutPermit.deploy();
        await underlyingTokenWithoutPermit.deployed();

        const TokenFactory3Factory = await ethers.getContractFactory(
          "TokenFactory",
          deployer
        );

        const tokenFactory3 = await upgrades.deployProxy(TokenFactory3Factory, [
          underlyingTokenWithoutPermit.address,
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address,
        ]);
        await tokenFactory3.deployed();

        // deploy Smarttoken 1  for the token factory without permit
        const SmartTokenXFactory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartTokenX = await upgrades.deployProxy(SmartTokenXFactory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory3.address,
          sanctionsContract.address,
        ]);
        await SmartTokenX.deployed();

        // deploy Smarttoken 2  for the token factory without permit
        const SmartTokenYFactory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartTokenY = await upgrades.deployProxy(SmartTokenYFactory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory3.address,
          sanctionsContract.address,
        ]);
        await SmartTokenY.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          SmartToken1,
          SmartToken2,
          mockV3Aggregator,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          tokenFactory2,
          underlyingTokenWithoutPermit,
          tokenFactory3,
          SmartTokenX,
          SmartTokenY,
          sanctionsContract,
        };
      }

      describe("Upgradeability Tests", async function () {
        it(`it should allow OWNER upgrade to newer implementations while state should be unchanged`, async function () {
          let {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          const newTokenFactory = await ethers.getContractFactory(
            "TokenFactory",
            deployer
          );
          tokenFactory = await upgrades.upgradeProxy(
            tokenFactory.address,
            newTokenFactory
          );
          expect(await tokenFactory.getInterval()).to.equal(REBASE_INTERVAL);
          expect(await tokenFactory.getSmartTokenAddress(0)).to.equal(
            SmartToken1.address
          );
        });
        it(`it not allow non owners to upgrade`, async function () {
          let {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          const newTokenFactory = await ethers.getContractFactory(
            "TokenFactory",
            tester
          );

          await expect(
            upgrades.upgradeProxy(tokenFactory.address, newTokenFactory)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    })
  : describe.skip;
