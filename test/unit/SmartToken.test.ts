import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  signRebalance,
  defaultRebalanceData,
  RebalanceElements,
  UserRebalanceElements,
  callculateRolloverAmount,
  rateLimitsDefault,
  FF_INTERVAL,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

developmentChains.includes(network.name)
  ? describe("SmartToken", async function () {
      async function deployTokenFixture() {
        const [deployer, tester] = await ethers.getSigners();

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
        const tokenFactory = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
        ]);
        await tokenFactory.deployed();

        // deploy smartToken 1
        const SmartToken1 = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken1 = await upgrades.deployProxy(SmartToken1, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          true,
        ]);
        await smartToken1.deployed();

        // deploy smartToken 2
        const SmartToken2 = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken2 = await upgrades.deployProxy(SmartToken2, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          false,
        ]);
        await smartToken2.deployed();
        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
        ]);
        await orchestrator.deployed();

        await tokenFactory.initializeOrchestrator(orchestrator.address);

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          sanctionsContract,
          orchestrator,
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

      describe("Transfers", async function () {
        it("Should transfer tokens between accounts", async function () {
          const {
            smartToken1,
            tokenFactory,
            smartToken2,
            underlyingToken,
            deployer,
            tester,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("50")
          );
          await smartToken1.deposit(
            ethers.utils.parseEther("50"),
            deployer.address
          );

          // Transfer 50 =
          await smartToken1.transfer(
            tester.address,
            ethers.utils.parseEther("50")
          );
          const testerBal = await smartToken1.balanceOf(tester.address);
          assert.equal(
            testerBal.toString(),
            ethers.utils.parseEther("50").toString()
          );

          // Transfer 40 Tokens
          await smartToken1
            .connect(tester)
            .transfer(deployer.address, ethers.utils.parseEther("40"));
          const deployerBalance = await smartToken1.balanceOf(deployer.address);
          assert.equal(
            deployerBalance.toString(),
            ethers.utils.parseEther("40").toString()
          );

          //So now deployer has 40 X and 50 Y
          // and tester has 10X and 0Y

          const priceX = BigInt(666666666666666666666);
          const priceU = BigInt(2000000000000000000000);
          const priceY = priceU - priceX;

          const lastUserRebalance: RebalanceElements = {
            BalanceFactorXY: BigInt(1e18),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(0),
          };

          const rebalance1: RebalanceElements = {
            BalanceFactorXY: BigInt(
              (BigInt(1e18) * BigInt(2) * priceX) / BigInt(priceU)
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              (BigInt(1e18) * BigInt(priceY - priceX)) / BigInt(priceU)
            ),
          };

          const lastUserRebalanceElementsTester: UserRebalanceElements = {
            netX: BigInt(ethers.utils.parseEther("10").toString()),
            netY: BigInt(0),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };
          const lastUserRebalanceElementsDeployer: UserRebalanceElements = {
            netX: BigInt(ethers.utils.parseEther("40").toString()),
            netY: BigInt(ethers.utils.parseEther("50").toString()),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };

          const postRebalanceTester: any[] = callculateRolloverAmount(
            rebalance1,
            lastUserRebalance,
            lastUserRebalanceElementsTester
          );
          const postRebalanceDeplyer: any[] = callculateRolloverAmount(
            rebalance1,
            lastUserRebalance,
            lastUserRebalanceElementsDeployer
          );

          const encodedEarlyRebalance1 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
              smartTokenXValue: priceX.toString(),
            }
          );

          //apply rebalance
          await orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          assert.equal(
            Number(BigInt(await smartToken2.balanceOf(tester.address))),
            Number(postRebalanceTester[1])
          );
          assert.equal(
            Number(BigInt(await smartToken1.balanceOf(deployer.address))),
            Number(postRebalanceDeplyer[0])
          );
          assert.equal(
            Number(BigInt(await smartToken2.balanceOf(deployer.address))),
            Number(postRebalanceDeplyer[1])
          );

          const testerBalPrev = await smartToken2.balanceOf(tester.address);
          const deployerBalPrev = await smartToken2.balanceOf(deployer.address);

          // Approve 10 tokens from owner to addr1
          await smartToken2.approve(
            tester.address,
            ethers.utils.parseEther("10")
          );

          // Addr1 transfers 50 tokens from owner to addr2
          await smartToken2
            .connect(tester)
            .transferFrom(
              deployer.address,
              tester.address,
              ethers.utils.parseEther("10")
            );

          const deplyerBal = await smartToken2.balanceOf(deployer.address);
          assert.equal(
            deplyerBal.toString(),
            BigInt(deployerBalPrev) -
              BigInt(ethers.utils.parseEther("10").toString())
          ); // 1000 - 50 = 950

          const testerBalance = await smartToken2.balanceOf(tester.address);
          assert.equal(
            testerBalance.toString(),
            BigInt(testerBalPrev) +
              BigInt(ethers.utils.parseEther("10").toString())
          );
        });
        it("Should validate max deposit", async function () {
          const {
            smartToken1,
            tokenFactory,
            smartToken2,
            underlyingToken,
            deployer,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.constants.MaxUint256
          );
          await smartToken1.deposit(
            ethers.constants.MaxUint256.div(2).add(1),
            deployer.address
          );

          // Transfer 50 of smartToken2 to tester
          await smartToken2.transfer(
            tester.address,
            ethers.utils.parseEther("50")
          );

          // because of the 50 transfer, the max deposit should return balance of MaxUint256 - balanceOf(smartToken2)
          await expect(await smartToken1.maxDeposit(deployer.address)).to.gte(
            ethers.constants.MaxUint256.div(2).toString()
          );

          await expect(
            smartToken1.deposit(
              ethers.constants.MaxUint256.div(2).add(2),
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__DepositMoreThanMax"
          );

          // Transfer a lot of smartToken1 to tester
          await smartToken1.transfer(
            tester.address,
            ethers.constants.MaxUint256.div(4)
          );

          // because of the previous transfer, the max deposit should return balance of MaxUint256 - balanceOf(smartToken1)
          await expect(await smartToken1.maxDeposit(deployer.address)).to.gte(
            ethers.constants.MaxUint256.div(2).toString()
          );
        });
      });
    })
  : describe.skip;
