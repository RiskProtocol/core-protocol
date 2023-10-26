import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  encodedNaturalRebase1,
  signersAddress,
} from "../../helper-hardhat-config";
import { getPermitDigest, sign } from "../../utils/signatures";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import exp from "constants";

developmentChains.includes(network.name)
  ? describe("Circuit Breaker", async function () {
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
          REBASE_INTERVAL,
          sanctionsContract.address,
          signersAddress,
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

      describe("Deposit, test circuit breakers to stop deposit", async function () {
        it("Should not deposit tokens when circuit breaker is on", async function () {
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

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.toggleDepositCircuitBreaker();

          await expect(
            smartToken1.deposit(depositAmount, deployer.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__DepositCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleDepositCircuitBreaker();
        });

        it("should not deposit tokens with permit when circuit breaker is on", async function () {
          const { smartToken1, chainId, deployer, tester } = await loadFixture(
            deployTokenFixture
          );
          // Create the approval request
          const approve = {
            owner: deployer.address,
            spender: tester.address,
            value: 100,
          };

          // deadline as much as you want in the future
          const deadline = 100000000000000;

          // deadline as much as you want in the future
          const invalidDeadline = 0;

          // Get the user's nonce
          const nonce = await smartToken1.nonces(deployer.address);

          // Get the EIP712 digest
          const digest = getPermitDigest(
            await smartToken1.name(),
            smartToken1.address,
            chainId,
            approve,
            nonce,
            deadline
          );

          // Sign it
          // NOTE: Using web3.eth.sign will hash the message internally again which
          // we do not want, so we're manually signing here
          const ownerPrivateKey = process.env.TEST_PRIVATE_KEY!;
          const privateKey1Buffer = Buffer.from(ownerPrivateKey, "hex");
          const { v, r, s } = sign(digest, privateKey1Buffer);

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await smartToken1.toggleDepositCircuitBreaker();

          await expect(
            smartToken1.depositWithPermit(
              approve.value,
              approve.owner,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__DepositCircuitBreaker"
          );

          await smartToken1.toggleDepositCircuitBreaker();

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );
        });

        it("should not mint tokens when circuit breaker is on", async function () {
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

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.toggleDepositCircuitBreaker();

          await expect(
            smartToken1.mint(depositAmount, deployer.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__DepositCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleDepositCircuitBreaker();
        });
      });

      describe("Withdraw, test circuit breakers to stop withdraw", async function () {
        it("Should not withdraw tokens when circuit breaker is on", async function () {
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

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.deposit(depositAmount, deployer.address);

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await smartToken1.toggleWithdrawCircuitBreaker();

          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__WithdrawCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleWithdrawCircuitBreaker();
        });

        it("should not redeem tokens when circuit breaker is on", async function () {
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

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.deposit(depositAmount, deployer.address);

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await smartToken1.toggleWithdrawCircuitBreaker();

          await expect(
            smartToken1.redeem(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__WithdrawCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleWithdrawCircuitBreaker();
        });
      });

      describe("Transfer, test circuit breakers to stop transfer", async function () {
        it("should not transfer tokens when circuit breaker is on", async function () {
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

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.deposit(depositAmount, deployer.address);

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await smartToken1.toggleTransferCircuitBreaker();

          await expect(
            smartToken1.transfer(deployer.address, depositAmount)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__TransferCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleTransferCircuitBreaker();
        });

        it("should not transferFrom tokens when circuit breaker is on", async function () {
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

          await underlyingToken.approve(tokenFactory.address, depositAmount);

          await smartToken1.deposit(depositAmount, deployer.address);

          const depositorBalanceBefore = await smartToken1.balanceOf(
            deployer.address
          );

          await smartToken1.toggleTransferCircuitBreaker();

          await expect(
            smartToken1.transferFrom(
              deployer.address,
              deployer.address,
              depositAmount
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "BaseContract__TransferCircuitBreaker"
          );

          expect(await smartToken1.balanceOf(deployer.address)).to.equal(
            depositorBalanceBefore
          );

          await smartToken1.toggleTransferCircuitBreaker();
        });
      });

      describe("Rebase, test circuit breakers to stop rebase", async function () {
        it("should not rebase tokens when circuit breaker is on", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.constants.MaxUint256.div(2);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.mint(depositAmount, deployer.address);

          const userBal: bigint = await smartToken1.balanceOf(deployer.address);
          const factBal = await smartToken1.balanceOf(tokenFactory.address);

          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);

          await tokenFactory.toggleRebaseCircuitBreaker();

          await expect(
            tokenFactory.executeRebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "BaseContract__RebaseCircuitBreaker"
          );

          let block2 = await ethers.provider.getBlock("latest");
          const now2 = block2.timestamp;

          await time.setNextBlockTimestamp(now2);

          //assume that user made tx, apply rebase
          await time.setNextBlockTimestamp(now2);

          await expect(
            tokenFactory.applyRebase(deployer.address)
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "BaseContract__RebaseCircuitBreaker"
          );

          await tokenFactory.toggleRebaseCircuitBreaker();
        });
      });

      describe("Stop and resume all circuit breakers", async function () {
        it("should stop and resume all circuit breakers", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);

          await smartToken1.stopAllCircuitBreakers();
          expect(await smartToken1.isDepositCircuitBreaker()).to.be.true;

          expect(await smartToken1.isWithdrawCircuitBreaker()).to.be.true;

          expect(await smartToken1.isTransferCircuitBreaker()).to.be.true;

          expect(await smartToken1.isRebaseCircuitBreaker()).to.be.true;

          await smartToken1.resumeAllCircuitBreakers();

          expect(await smartToken1.isDepositCircuitBreaker()).to.be.false;

          expect(await smartToken1.isWithdrawCircuitBreaker()).to.be.false;

          expect(await smartToken1.isTransferCircuitBreaker()).to.be.false;

          expect(await smartToken1.isRebaseCircuitBreaker()).to.be.false;
        });
      });
    })
  : describe.skip;
