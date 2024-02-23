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
          deployer.address,
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
          deployer.address,
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

      describe("Withdraw, Deposit Rate Limits", async function () {
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
          expect(await tokenFactory.withdrawLimitStatus()).to.equal(true);
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          expect(await tokenFactory.withdrawLimitStatus()).to.equal(false);
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
          expect(await tokenFactory.depositLimitStatus()).to.equal(true);
          await tokenFactory.connect(deployer).toggleDepositLimit();
          expect(await tokenFactory.depositLimitStatus()).to.equal(false);
        });

        it("Should update the period correctly", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          await tokenFactory.connect(deployer).updateLimitPeriod(200);
          expect(await tokenFactory.getLimitPeriod()).to.equal(200);
        });
        it("Should not allow non-owner to update the period", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          await expect(
            tokenFactory.connect(tester).updateLimitPeriod(200)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("Should update withdraw limit correctly", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          await tokenFactory.connect(deployer).updateWithdrawLimit(200000);
          expect(
            await tokenFactory.connect(deployer).getWithdrawLimit()
          ).to.be.equal(200000);
        });
        it("Should update deposit limit correctly", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          await tokenFactory.connect(deployer).updateDepositLimit(200000);
          expect(
            await tokenFactory.connect(deployer).getDepositLimit()
          ).to.be.equal(200000);
        });
      });

      describe("Withdraw Functionality", async function () {
        it("Should allow a valid withdrawal within limit", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          //toggle the withdraw limits since it is initially false
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(120); //120 seconds
          await tokenFactory.connect(deployer).updateWithdrawLimit(20000); // 20000 wei of underlying

          const depositAmount = 10000;
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          const deployerBalbef = await smartToken1.balanceOf(deployer.address);
          const withdrawAmt = 100;
          await smartToken1.withdraw(
            withdrawAmt,
            deployer.address,
            deployer.address
          );
          const deployerBalAft = await smartToken1.balanceOf(deployer.address);
          expect(+deployerBalbef).to.be.equal(+deployerBalAft + +withdrawAmt);
        });

        it("Should not allow withdrawal that exceeds limit", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          //toggle the withdraw limits since it is initially false
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(120); //120 seconds
          await tokenFactory.connect(deployer).updateWithdrawLimit(20000); // 20000 wei of underlying

          const depositAmount = 100000;
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__WithdrawLimitHit"
          );
        });
        it("Should reset the withdraw limit after period ends", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          const period = 120;

          //toggle the withdraw limits since it is initially false
          await tokenFactory.connect(deployer).toggleWithdrawLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(period); //120 seconds
          await tokenFactory.connect(deployer).updateWithdrawLimit(20000); // 20000 wei of underlying
          const depositAmount = 100000;
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          const withdrawAmount = 20000;
          const firstBalance = await smartToken1.balanceOf(deployer.address);

          await smartToken1.withdraw(
            withdrawAmount,
            deployer.address,
            deployer.address
          ); // Simulate the passing of blocks to exceed the period
          const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;
          const nextPeriodTimeStamp =
            BigInt(now) + BigInt(period) + BigInt(0.5 * +period);
          await time.setNextBlockTimestamp(nextPeriodTimeStamp);
          // Attempt another withdraw which should be successful as the period has reset
          await smartToken1.withdraw(
            withdrawAmount,
            deployer.address,
            deployer.address
          );
          const newBalance = await smartToken1.balanceOf(deployer.address);
          expect(+newBalance).to.equal(+firstBalance - 2 * +withdrawAmount);
        });
      });
      describe("Deposit Functionality", async function () {
        it("Should allow a valid deposit within limit", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          //toggle the deposit limits since it is initially false
          await tokenFactory.connect(deployer).toggleDepositLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(120); //120 seconds
          await tokenFactory.connect(deployer).updateDepositLimit(20000); // 20000 wei of underlying

          const depositAmount = 20000;
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          const deployerBalAft = await smartToken1.balanceOf(deployer.address);
          expect(+deployerBalAft).to.be.equal(+depositAmount);
        });

        it("Should not allow deposit that exceeds limit", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          //toggle the deposit limits since it is initially false
          await tokenFactory.connect(deployer).toggleDepositLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(120); //120 seconds
          await tokenFactory.connect(deployer).updateDepositLimit(20000); // 20000 wei of underlying

          const depositAmount = 200000;
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await expect(
            smartToken1.deposit(depositAmount, deployer.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__DepositLimitHit"
          );
        });
        it("Should reset the Deposit limit after period ends", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          const period = 120;

          //toggle the deposit limits since it is initially false
          await tokenFactory.connect(deployer).toggleDepositLimit();
          await tokenFactory.connect(deployer).updateLimitPeriod(period); //120 seconds
          await tokenFactory.connect(deployer).updateDepositLimit(20000); // 20000 wei of underlying
          const depositAmount = 20000;
          await underlyingToken.approve(
            tokenFactory.address,
            +depositAmount * +2
          );
          await smartToken1.deposit(depositAmount, deployer.address);
          const firstBalance = await smartToken1.balanceOf(deployer.address);

          // Simulate the passing of blocks to exceed the period
          const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;
          const nextPeriodTimeStamp =
            BigInt(now) + BigInt(period) + BigInt(0.5 * +period);
          await time.setNextBlockTimestamp(nextPeriodTimeStamp);

          // Attempt another withdraw which should be successful as the period has reset
          await smartToken1.deposit(depositAmount, deployer.address);

          const newBalance = await smartToken1.balanceOf(deployer.address);
          expect(+newBalance).to.equal(+firstBalance + depositAmount);
        });
      });
    })
  : describe.skip;
