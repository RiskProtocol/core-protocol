import { expect } from "chai";
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
  FF_INTERVAL,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { token } from "../../typechain-types/@openzeppelin/contracts";

developmentChains.includes(network.name)
  ? describe("TokenFactory", async function () {
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

        let tokenFactory = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
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
          true,
          deployer.address,
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
          false,
          deployer.address,
        ]);
        await SmartToken2.deployed();

        //deploy orchestrator
        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const Orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
          deployer.address,
        ]);
        await Orchestrator.deployed();

        //initialize the orchestrator
        await tokenFactory.initializeOrchestrator(Orchestrator.address);

        const swapTargetFactory = await ethers.getContractFactory(
          "MockSwapTarget",
          deployer
        );
        const swapTarget = await swapTargetFactory.deploy();
        await swapTarget.deployed();

        await swapTarget.setShouldFail(false);

        const AtomicTransactionFactory = await ethers.getContractFactory(
          "AtomicTransaction",
          deployer
        );
        const atomicTransaction = await upgrades.deployProxy(
          AtomicTransactionFactory,
          [
            SmartToken1.address,
            SmartToken2.address,
            underlyingToken.address,
            deployer.address,
          ]
        );
        await atomicTransaction.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          SmartToken1,
          SmartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          sanctionsContract,
          Orchestrator,
          swapTarget,
          atomicTransaction,
        };
      }

      describe("Atomic Swap Tests", async function () {
        it(`it should revert since swap target is dummy`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            swapTarget,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          //selling smarttoken1 for smarttoken2
          await SmartToken1.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          //should revert since swapTarget is dummy
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              SmartToken2.address,
              swapTarget.address,
              swapTarget.address, //0x Contract
              "0x", //swap data
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1")
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_SlippageError"
          );
        });
        it(`it should revert with invalid params`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            swapTarget,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          //selling smarttoken1 for smarttoken2
          await SmartToken1.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          //should revert since swapTarget is dummy
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              SmartToken2.address,
              swapTarget.address,
              swapTarget.address, //0x Contract
              "0x", //swap data
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("0")
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );
        });
        it(`it should revert if not approved`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            swapTarget,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          //selling smarttoken1 for smarttoken2
          await SmartToken1.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          //should revert since swapTarget is dummy
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              SmartToken2.address,
              swapTarget.address,
              swapTarget.address, //0x Contract
              "0x", //swap data
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1")
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidBalance"
          );
        });
        it(`it should be able to receive ether`, async function () {
          let { deployer, atomicTransaction } = await loadFixture(
            deployTokenFixture
          );
          //send ether to atomic transaction
          await deployer.sendTransaction({
            to: atomicTransaction.address,
            value: ethers.utils.parseEther("1"),
          });

          expect(
            await ethers.provider.getBalance(atomicTransaction.address)
          ).to.eq(ethers.utils.parseEther("1"));
        });

        it(`it should be able to drain ether and other tokens`, async function () {
          let {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
          } = await loadFixture(deployTokenFixture);

          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //send ether to atomic transaction
          await deployer.sendTransaction({
            to: atomicTransaction.address,
            value: ethers.utils.parseEther("1"),
          });

          await SmartToken1.deposit(
            ethers.utils.parseEther("1"),
            deployer.address
          );

          await SmartToken1.transfer(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken2.transfer(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );

          expect(
            await ethers.provider.getBalance(atomicTransaction.address)
          ).to.eq(ethers.utils.parseEther("1"));
          expect(
            await SmartToken1.balanceOf(atomicTransaction.address)
          ).to.be.equal(ethers.utils.parseEther("1"));
          expect(await SmartToken2.balanceOf(atomicTransaction.address)).to.eq(
            ethers.utils.parseEther("1")
          );

          await atomicTransaction.drain();

          expect(
            await ethers.provider.getBalance(atomicTransaction.address)
          ).to.eq(0);
          expect(await SmartToken1.balanceOf(atomicTransaction.address)).to.eq(
            0
          );
          expect(await SmartToken2.balanceOf(atomicTransaction.address)).to.eq(
            0
          );
        });
        //@note Real test with 0x swap was done
        //Refs:
        //https://sepolia.etherscan.io/tx/0x595b63d4290c43272b276185759b31f032e4e58ee6675298a8fc1edd58dc5fcc
        //https://sepolia.etherscan.io/tx/0xf77dcff7091f3dbd39bedb11827b3e7e74509efdb054d5db03e1f6ecc8ea1776
      });
    })
  : describe.skip;
