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
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
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

        const initial3rdToken = await MockERC20TokenWithPermit.deploy();
        await initial3rdToken.deployed();

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
          false,
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

        const balancerPoolFactory = await ethers.getContractFactory(
          "MockBalancerPool",
          deployer
        );
        const balancerPool = await balancerPoolFactory.deploy();
        await balancerPool.deployed();

        await balancerPool.testIsBound(true);

        const balancerPoolFAILING = await balancerPoolFactory.deploy();
        await balancerPoolFAILING.deployed();
        await balancerPoolFAILING.testIsBound(false);

        //the 1inch mock
        const oneInchRouterFactory = await ethers.getContractFactory(
          "OneInchRouterMock",
          deployer
        );
        const oneInchRouter = await oneInchRouterFactory.deploy(
          initial3rdToken.address
        );
        await oneInchRouter.deployed();

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
          balancerPool,
          atomicTransaction,
          oneInchRouter,
          initial3rdToken,
          balancerPoolFAILING,
        };
      }

      describe("Atomic Swap Tests", async function () {
        it(`it should revert since swap slippage is faked to be less than expected value`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
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
          const timestamp = await time.latest();
          const newTimeStamp = timestamp + 1000;

          // mock will return less than allowed by slippage
          await balancerPool.testMock(ethers.utils.parseEther("0.9"));
          await balancerPool.testIsBound(true);
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address, //0x Contract
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              newTimeStamp.toString()
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
            balancerPool,
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
          const timestamp = await time.latest();
          const newTimeStamp = timestamp + 1000;
          //should revert since swapTarget is dummy
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              ethers.constants.AddressZero,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              newTimeStamp.toString()
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              newTimeStamp.toString()
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("0"),
              ethers.utils.parseEther("1"),
              newTimeStamp.toString()
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("0"),
              newTimeStamp.toString()
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          const actualTime = await time.latest();
          const expiredTime = actualTime - 1;
          // and older timestamp
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              expiredTime.toString()
            )
          ).to.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_ExpiryReached"
          );
        });
        it(`it should be OK in normal cases`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
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

          const actualTime = await time.latest();
          const newTime = actualTime + 1;
          // and older timestamp
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              actualTime.toString()
            )
          ).to.ok;

          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              newTime.toString()
            )
          ).to.ok;
        });

        it(`should be able to trade split and swap functions and constraints correctly`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
            oneInchRouter,
            initial3rdToken,
            balancerPoolFAILING,
            deployer,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          //@note for tradeaplitandswap
          //@note selling token is smarttoken1
          await initial3rdToken.approve(
            oneInchRouter.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken1.approve(
            balancerPool.address,
            ethers.utils.parseEther("1")
          );
          await oneInchRouter.setReturnAmount(ethers.utils.parseEther("1"));
          await oneInchRouter.setRecipient(atomicTransaction.address);
          const calldata =
            "0x07ed2379000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090000000000000000000000008ac76a51cc950d9822d68b83fe1ad97b32cd580d0000000000000000000000001d2f0da169ceb9fc7b3144628db156f3f6c60dbe00000000000000000000000095569fff9b815483de479736986495144f32d18000000000000000000000000050c67c8d0792b8256ff478f7d4a5e02c01431fe400000000000000000000000000000000000000000000000000038d7ea4c680000000000000000000000000000000000000000000000000000005946273a4016b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf788ac76a51cc950d9822d68b83fe1ad97b32cd580d00206ae4071138000f424095569fff9b815483de479736986495144f32d180111111125421ca6dc452d289314280a0f8842a6500000000000000000000000000000000000000000000000000000000000000018ac76a51cc950d9822d68b83fe1ad97b32cd580d00d1165fad";
          const actualTime = await time.latest();
          const newTime = actualTime + 100;
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              ethers.constants.AddressZero,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              ethers.constants.AddressZero,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          //@note when router is address zero
          await expect(
            atomicTransaction.tradeSplitSwap(
              ethers.constants.AddressZero,
              //the 1 inch call data
              calldata,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              ethers.constants.AddressZero,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              ethers.constants.AddressZero,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidParams"
          );

          //@note when time is expired
          const expiredTime = actualTime - 1;
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken1.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              expiredTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_ExpiryReached"
          );

          //@note revert if sellToken is not bound to balancer pool
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPoolFAILING.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_BalancerError"
          );

          //@note one inch data errors
          //@note when 1inch data is empty
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              ethers.utils.arrayify("0x"),
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidOneInchData"
          );

          //revert when dest token is not underlying token
          const calldata2 =
            "0x07ed2379000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd090000000000000000000000008ac76a51cc950d9822d68b83fe1ad97b32cd580d0000000000000000000000001d2f0da169ceb9fc7b3144628db156f3f6c60dbe00000000000000000000000095569fff9b815483de479736986495144f32d1800000000000000000000000007a0df1ac4130c15ad482fd7570e9c920db01517b000000000000000000000000000000000000000000000000000000174876e8000000000000000000000000000000000000000000000000000000001655554aa300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000009f00000000000000000000000000000000000000000000000000008100001a0020d6bdbf788ac76a51cc950d9822d68b83fe1ad97b32cd580d00206ae4071138000f424095569fff9b815483de479736986495144f32d180111111125421ca6dc452d289314280a0f8842a6500000000000000000000000000000000000000000000000000000000000000018ac76a51cc950d9822d68b83fe1ad97b32cd580d00d1165fad";
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata2,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_InvalidUnOrReceiver"
          );

          //@note revert when min return amount is not met THAT IS SPLippage error
          let swapDescription: SwapDescription = {
            srcToken: initial3rdToken.address, // Source token contract address
            dstToken: underlyingToken.address, // Destination token contract address
            srcReceiver: deployer.address, // Source receiver address
            dstReceiver: atomicTransaction.address, // Destination receiver address
            amount: ethers.utils.parseEther("1").toBigInt().toString(), // Amount in Wei
            minReturnAmount: ethers.utils.parseEther("1").toBigInt().toString(), // Minimum return amount in Wei
            flags: ethers.BigNumber.from(0).toBigInt().toString(), // Flags, if any
          };

          let executorAddress = ethers.constants.AddressZero; // Your executor address
          let additionalData = "0x"; // Additional data as bytes

          const calldata3 = await oneInchRouter.encodeData(
            executorAddress,
            swapDescription,
            additionalData
          );
          await oneInchRouter.setReturnAmount(
            BigInt(swapDescription.minReturnAmount) - BigInt(1)
          );
          await underlyingToken.transfer(
            oneInchRouter.address,
            swapDescription.minReturnAmount
          );
          await initial3rdToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata3,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_SlippageError"
          );

          //@note revert when underlying is less than return amount Swap error
          swapDescription = {
            srcToken: initial3rdToken.address, // Source token contract address
            dstToken: underlyingToken.address, // Destination token contract address
            srcReceiver: deployer.address, // Source receiver address
            dstReceiver: atomicTransaction.address, // Destination receiver address
            amount: ethers.utils.parseEther("1").toBigInt().toString(), // Amount in Wei
            minReturnAmount: ethers.utils.parseEther("1").toBigInt().toString(), // Minimum return amount in Wei
            flags: ethers.BigNumber.from(0).toBigInt().toString(), // Flags, if any
          };

          executorAddress = ethers.constants.AddressZero; // Your executor address
          additionalData = "0x"; // Additional data as bytes

          const calldata4 = await oneInchRouter.encodeData(
            executorAddress,
            swapDescription,
            additionalData
          );
          await oneInchRouter.setReturnAmount(
            BigInt(swapDescription.minReturnAmount) + BigInt(1)
          );
          await underlyingToken.transfer(
            oneInchRouter.address,
            swapDescription.minReturnAmount
          );
          await initial3rdToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata4,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_SwapError"
          );
        });

        it(`it should be able to trade split  correctly`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
            oneInchRouter,
            initial3rdToken,
            balancerPoolFAILING,
            deployer,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          //for tradeaplitandswap
          //selling token is smarttoken1
          await initial3rdToken.approve(
            oneInchRouter.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken1.approve(
            balancerPool.address,
            ethers.utils.parseEther("1")
          );
          await oneInchRouter.setReturnAmount(ethers.utils.parseEther("1"));
          await oneInchRouter.setRecipient(atomicTransaction.address);

          //@note revert when underlying is less than return amount Swap error
          let swapDescription = {
            srcToken: initial3rdToken.address, // Source token contract address
            dstToken: underlyingToken.address, // Destination token contract address
            srcReceiver: deployer.address, // Source receiver address
            dstReceiver: atomicTransaction.address, // Destination receiver address
            amount: ethers.utils.parseEther("1").toBigInt().toString(), // Amount in Wei
            minReturnAmount: ethers.utils.parseEther("1").toBigInt().toString(), // Minimum return amount in Wei
            flags: ethers.BigNumber.from(0).toBigInt().toString(), // Flags, if any
          };

          let executorAddress = ethers.constants.AddressZero; // Your executor address
          let additionalData = "0x"; // Additional data as bytes
          const actualTime = await time.latest();
          const newTime = actualTime + 100;
          const calldata5 = await oneInchRouter.encodeData(
            executorAddress,
            swapDescription,
            additionalData
          );
          await oneInchRouter.setReturnAmount(
            BigInt(swapDescription.minReturnAmount)
          );
          await underlyingToken.transfer(
            oneInchRouter.address,
            swapDescription.minReturnAmount
          );
          await initial3rdToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata5,
              //are we selling the selling token to balancer pool
              false,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              "0",
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.ok;

          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            swapDescription.minReturnAmount
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            swapDescription.minReturnAmount
          );
        });

        it(`it should be able to trade split and SWAP correctly`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
            oneInchRouter,
            initial3rdToken,
            deployer,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("100")
          );
          await SmartToken1.deposit(
            ethers.utils.parseEther("100"),
            atomicTransaction.address
          );
          //for tradeaplitandswap
          //selling token is smarttoken1
          await initial3rdToken.approve(
            oneInchRouter.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken1.approve(
            balancerPool.address,
            ethers.utils.parseEther("1")
          );
          await oneInchRouter.setReturnAmount(ethers.utils.parseEther("1"));
          await oneInchRouter.setRecipient(atomicTransaction.address);

          //@note revert when underlying is less than return amount Swap error
          let swapDescription = {
            srcToken: initial3rdToken.address, // Source token contract address
            dstToken: underlyingToken.address, // Destination token contract address
            srcReceiver: deployer.address, // Source receiver address
            dstReceiver: atomicTransaction.address, // Destination receiver address
            amount: ethers.utils.parseEther("1").toBigInt().toString(), // Amount in Wei
            minReturnAmount: ethers.utils.parseEther("1").toBigInt().toString(), // Minimum return amount in Wei
            flags: ethers.BigNumber.from(0).toBigInt().toString(), // Flags, if any
          };

          let executorAddress = ethers.constants.AddressZero; // Your executor address
          let additionalData = "0x"; // Additional data as bytes
          const actualTime = await time.latest();
          const newTime = actualTime + 100;
          const calldata5 = await oneInchRouter.encodeData(
            executorAddress,
            swapDescription,
            additionalData
          );
          await oneInchRouter.setReturnAmount(
            BigInt(swapDescription.minReturnAmount)
          );
          await underlyingToken.transfer(
            oneInchRouter.address,
            swapDescription.minReturnAmount
          );
          await initial3rdToken.approve(
            atomicTransaction.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken2.approve(
            atomicTransaction.address,
            swapDescription.minReturnAmount
          );

          await balancerPool.testMock(swapDescription.minReturnAmount);
          //sell all
          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata5,
              //are we selling the selling token to balancer pool
              true,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              swapDescription.minReturnAmount,
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              BigInt(swapDescription.minReturnAmount) * BigInt(2),
              //expiry date
              newTime
            )
          ).to.be.revertedWithCustomError(
            atomicTransaction,
            "AtomicTransaction_SlippageError"
          );

          await expect(
            atomicTransaction.tradeSplitSwap(
              oneInchRouter.address,
              //the 1 inch call data
              calldata5,
              //are we selling the selling token to balancer pool
              true,
              //token that the user wants to sell
              SmartToken2.address,
              //amount of token the user wants to sell
              swapDescription.minReturnAmount,
              //balancer pool address
              balancerPool.address,
              //expected amount of token to receive
              "0",
              //expiry date
              newTime
            )
          ).to.be.emit(atomicTransaction, "TradeSplitSwap");
        });

        it(`it should revert if not approved`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            atomicTransaction,
            balancerPool,
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
          const timestamp = await time.latest();
          const newTimeStamp = timestamp + 1000;
          //should revert since swapTarget is dummy
          // the sold tokens are not sold hence the buy tokens are not bought
          // therefore slippage condition is not met
          await expect(
            atomicTransaction.splitAndSwap(
              SmartToken1.address,
              balancerPool.address,
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              ethers.utils.parseEther("1"),
              timestamp.toString()
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

        it(`it should be able to update balancer params`, async function () {
          let { deployer, atomicTransaction } = await loadFixture(
            deployTokenFixture
          );

          const maxPrice = ethers.utils.parseEther("100");
          const minimumAmoutOut = ethers.utils.parseEther("0.001");

          await atomicTransaction.setBalancerVariables(
            minimumAmoutOut,
            maxPrice
          );

          const balancerParams = await atomicTransaction.getBalancerVariables();

          expect(balancerParams[0]).to.eq(minimumAmoutOut);
          expect(balancerParams[1]).to.eq(maxPrice);
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
      });
    })
  : describe.skip;

interface SwapDescription {
  srcToken: string;
  dstToken: string;
  srcReceiver: string;
  dstReceiver: string;
  amount: string;
  minReturnAmount: string;
  flags: string;
}
