import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  DECIMALS,
  INITIAL_PRICE,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

developmentChains.includes(network.name)
  ? describe("SmartToken", async function () {
      async function deployTokenFixture() {
        const [deployer, tester] = await ethers.getSigners();

        const MockV3Aggregator = await ethers.getContractFactory(
          "MockV3Aggregator",
          deployer
        );
        const mockV3Aggregator = await MockV3Aggregator.deploy(
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
        const tokenFactory = await TokenFactory.deploy(
          underlyingToken.address,
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address
        );
        await tokenFactory.deployed();

        // deploy smartToken 1
        const SmartToken1 = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );
        const smartToken1 = await SmartToken1.deploy(
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address
        );
        await smartToken1.deployed();

        // deploy smartToken 2
        const SmartToken2 = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );
        const smartToken2 = await SmartToken2.deploy(
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address
        );
        await smartToken2.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          mockV3Aggregator,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          sanctionsContract,
        };
      }

      describe("Constructor", async function () {
        it("sets the name of the dev tokens correctly", async function () {
          const { smartToken1, smartToken2 } = await loadFixture(
            deployTokenFixture
          );
          assert.equal(await smartToken1.name(), TOKEN1_NAME);
          assert.equal(await smartToken2.name(), TOKEN2_NAME);
        });

        it("sets the symbol of the dev tokens correctly", async function () {
          const { smartToken1, smartToken2 } = await loadFixture(
            deployTokenFixture
          );
          assert.equal(await smartToken1.symbol(), TOKEN1_SYMBOL);
          assert.equal(await smartToken2.symbol(), TOKEN2_SYMBOL);
        });

        it("sets the correct address for the token factory", async function () {
          const { smartToken1, smartToken2, tokenFactory } = await loadFixture(
            deployTokenFixture
          );
          assert.equal(
            await smartToken1.getTokenFactory(),
            tokenFactory.address
          );
          assert.equal(
            await smartToken2.getTokenFactory(),
            tokenFactory.address
          );
        });
      });

      describe("Burn", async function () {
        it("should not allow unauthorized users to call the burn function", async function () {
          const { smartToken1, smartToken2, tester } = await loadFixture(
            deployTokenFixture
          );
          const amount = ethers.utils.parseEther("1");
          const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

          await expect(
            smartToken1.connect(tester).burn(tester.address, amount)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__NotTokenFactory"
          );
          await expect(
            smartToken2.connect(tester).burn(tester.address, amount)
          ).to.be.revertedWithCustomError(
            smartToken2,
            "SmartToken__NotTokenFactory"
          );
        });
      });

      describe("Mint", async function () {
        it("should not allow other users to perform mint function except Token Factory", async function () {
          const { smartToken1, deployer, tester } = await loadFixture(
            deployTokenFixture
          );
          const amount = ethers.utils.parseEther("1");
          await expect(
            smartToken1.connect(tester).mintAsset(deployer.address, amount)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__NotTokenFactory"
          );
        });
      });
    })
  : describe.skip;
