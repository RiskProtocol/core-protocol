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
  rateLimitsDefault,
} from "../../helper-hardhat-config";
import { getPermitDigest, sign } from "../../utils/signatures";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

developmentChains.includes(network.name)
  ? describe("RateLimits", async function () {
      async function deployTokenFixture() {
        const [deployer, tester] = await ethers.getSigners();

        const chainId = 31337;

        const MockERC20Token = await ethers.getContractFactory(
          "MockERC20Token",
          deployer
        );
        const underlyingToken = await MockERC20Token.deploy();

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

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          chainId,
        };
      }

      describe("Withdraw, test circuit breakers to stop withdraw", async function () {
        // it("Should not withdraw tokens when circuit breaker is on", async function () {
        //   const {
        //     smartToken1,
        //     deployer,
        //     tokenFactory,
        //     smartToken2,
        //     underlyingToken,
        //   } = await loadFixture(deployTokenFixture);
        //   const depositAmount = ethers.constants.MaxUint256.div(2).add(1);

        //   await tokenFactory.initializeSMART(
        //     smartToken1.address,
        //     smartToken2.address
        //   );

        //   await underlyingToken.approve(tokenFactory.address, depositAmount);

        //   await smartToken1.deposit(depositAmount, deployer.address);

        //   const depositorBalanceBefore = await smartToken1.balanceOf(
        //     deployer.address
        //   );

        //   await smartToken1.toggleWithdrawCircuitBreaker();

        //   await expect(
        //     smartToken1.withdraw(
        //       depositAmount,
        //       deployer.address,
        //       deployer.address
        //     )
        //   ).to.be.revertedWithCustomError(
        //     smartToken1,
        //     "BaseContract__WithdrawCircuitBreaker"
        //   );

        //   expect(await smartToken1.balanceOf(deployer.address)).to.equal(
        //     depositorBalanceBefore
        //   );

        //   await smartToken1.toggleWithdrawCircuitBreaker();
        // });

        it("Should toggle withdraw limit correctly", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.constants.MaxUint256.div(2).add(1);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          expect(await tokenFactory.getWithdrawLimit()).to.equal(true);
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          expect(await tokenFactory.getWithdrawLimit()).to.equal(false);
        });

        it("Should toggle deposit limit correctly", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.constants.MaxUint256.div(2).add(1);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          await tokenFactory.connect(deployer).toggleDepositLimit();
          expect(await tokenFactory.getDepositLimit()).to.equal(true);
          await tokenFactory.connect(deployer).toggleDepositLimit();
          expect(await tokenFactory.getDepositLimit()).to.equal(false);
        });
      });
    })
  : describe.skip;
