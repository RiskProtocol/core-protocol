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
import { BigNumber } from "ethers";

developmentChains.includes(network.name)
  ? describe("WrappedSmartTokens", async function () {
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

        // deploy Oracle
        const PriceFeedOracleContract = await ethers.getContractFactory(
          "PriceFeedOracle",
          deployer
        );
        const PriceFeed = await upgrades.deployProxy(
          PriceFeedOracleContract,
          [deployer.address, SmartToken1.address, SmartToken2.address],
          { initializer: "initialize", kind: "uups" }
        );

        await PriceFeed.deployed();

        //initialize smartz
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
          deployer.address
        );

        //deploy wrapped template
        const RiskWrappedTokenContract = await ethers.getContractFactory(
          "wrappedSmartToken",
          deployer
        );
        const RiskWrappedToken = await RiskWrappedTokenContract.deploy();

        //deploy the wrapper factory
        const WrapperFactoryContract = await ethers.getContractFactory(
          "WrapperFactory",
          deployer
        );
        const WrapperFactory = await upgrades.deployProxy(
          WrapperFactoryContract,
          [RiskWrappedToken.address, deployer.address],
          { initializer: "initialize", kind: "uups" }
        );

        await WrapperFactory.deployed();

        //approve the factory to spend the underlying token

        await SmartToken1.approve(
          WrapperFactory.address,
          ethers.constants.MaxUint256
        );
        await SmartToken2.approve(
          WrapperFactory.address,
          ethers.constants.MaxUint256
        );

        await WrapperFactory.create(
          SmartToken1.address,
          SmartToken2.address,
          "Wrapped SmartToken X",
          "wX",
          1,
          true,
          deployer.address,
          PriceFeed.address
        );
        await WrapperFactory.create(
          SmartToken2.address,
          SmartToken1.address,
          "Wrapped SmartToken Y",
          "wY",
          1,
          false,
          deployer.address,
          PriceFeed.address
        );

        const wXAddr = await WrapperFactory.getWrappedSmartTokens(true);
        const wYAddr = await WrapperFactory.getWrappedSmartTokens(false);

        const wX = await ethers.getContractAt("wrappedSmartToken", wXAddr);
        const wY = await ethers.getContractAt("wrappedSmartToken", wYAddr);

        //flashloan receiver
        const mockFlashLoanReceiverFactory = await ethers.getContractFactory(
          "MockFlashLoanReceiver_UnwantedTokens",
          deployer
        );
        const flashloanReceiverX = await mockFlashLoanReceiverFactory.deploy(
          wX.address
        );
        await flashloanReceiverX.deployed();

        const flashloanReceiverY = await mockFlashLoanReceiverFactory.deploy(
          wY.address
        );
        await flashloanReceiverY.deployed();

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
          flashloanReceiverX,
          flashloanReceiverY,
          PriceFeed,
          wX,
          wY,
          RiskWrappedTokenContract,
        };
      }

      describe("Wrapped Flash Loans Tests", async function () {
        it(`it should properly get the flashloan`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            PriceFeed,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(flashloanReceiverX.address, repayAmt);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block.timestamp);

          await wX.flashLoan(flashloanReceiverX.address, loanAmt, "0x");

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(repayAmt)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const repayAmtY = ethers.utils.parseEther("7");
          const loanAmtY = ethers.utils.parseEther("7");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(flashloanReceiverY.address, repayAmtY);
          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block1.timestamp);

          await wY.flashLoan(flashloanReceiverY.address, loanAmtY, "0x");

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(repayAmtY)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should revert if reciever has not approved the funds transfer`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            PriceFeed,
          } = await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));
          //await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));
          await wX.deposit(ethers.utils.parseEther("10"));

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block.timestamp);

          await SmartToken2.approve(wY.address, ethers.utils.parseEther("10"));
          //await SmartToken1.transfer(wY.address, ethers.utils.parseEther("5"));
          await wY.deposit(ethers.utils.parseEther("10"));

          await flashloanReceiverX.isApprovedMeth(false);
          await flashloanReceiverY.isApprovedMeth(false);
          await SmartToken2.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken1.transfer(
            flashloanReceiverY.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "FlashLoan__InsufficientUnderlying"
          );

          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wY,
            "FlashLoan__InsufficientUnderlying"
          );

          // Asume rebase has happened and the pool has some unwanted tokens
          //wX
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("15")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("15"),
              "0x"
            )
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });
        it(`it should revert if reciever was  not able to get enough funds to pay back`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            PriceFeed,
          } = await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));
          await wX.deposit(ethers.utils.parseEther("10"));

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block.timestamp);

          await SmartToken2.approve(wY.address, ethers.utils.parseEther("10"));
          await wY.deposit(ethers.utils.parseEther("10"));

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverY.isApprovedMeth(true);

          // Asume rebase has happened and the pool has some unwanted tokens
          //wX
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("15"),
              "0x"
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

          //wY
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("15"));

          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("15"),
              "0x"
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

          expect(await SmartToken2.balanceOf(wX.address)).to.be.equal(
            ethers.utils.parseEther("15")
          );
          expect(await SmartToken1.balanceOf(wY.address)).to.be.equal(
            ethers.utils.parseEther("15")
          );
        });

        it(`it should revert if POOL doesnot have enough selling token`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
          } = await loadFixture(deployTokenFixture);

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "FlashLoan__InsufficientUnderlying"
          );
          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wY,
            "FlashLoan__InsufficientUnderlying"
          );
        });

        it(`it should revert if reciever's execute operation returned false'`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            PriceFeed,
          } = await loadFixture(deployTokenFixture);

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block.timestamp);
          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));

          await wX.deposit(ethers.utils.parseEther("10"));
          const intialBal = await SmartToken1.balanceOf(wX.address);

          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverX.updateMockReturn(false);

          await SmartToken2.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("1"),
              "0x"
            )
          ).to.be.revertedWithCustomError(wX, "FlashLoan__FailedExecOps");
          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialBal
          );
        });
        it(`it should revert if reciever is EOA`, async function () {
          let {
            tokenFactory,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            tester,
            wX,
          } = await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));

          await wX.deposit(ethers.utils.parseEther("10"));
          const intialBal = await SmartToken1.balanceOf(wX.address);

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverX.updateMockReturn(false);
          await SmartToken2.transfer(
            tester.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            SmartToken1.flashLoan(
              tester.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.reverted;
          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialBal
          );
        });
      });

      describe("Wrapped Smart Token Misc Tests", async function () {
        it(`it should properly set the timeout`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          await wX.setTimeout(1000);
          expect(await wX.getTimeout()).to.be.equal(1000);

          await wY.setTimeout(1000);
          expect(await wX.getTimeout()).to.be.equal(1000);

          await expect(wX.connect(tester).setTimeout(10000)).to.be.revertedWith(
            "Ownable: caller is not the owner"
          );
        });

        it(`it should properly get if Wrapped is X or Y`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          expect(await wX.connect(tester).getIsWrappedX()).to.be.true;
          expect(await wY.connect(tester).getIsWrappedX()).to.be.false;
        });

        it(`it should not allow INITIALIZE Method`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          await expect(
            wX.connect(tester).initialize(tester.address, "test", "TEST", 1)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__Not_Implemented"
          );
        });

        it(`it should revert if the flashloan has timeout`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            PriceFeed,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(flashloanReceiverX.address, repayAmt);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          await wX.setTimeout(1000);
          expect(await wX.getTimeout()).to.be.equal(1000);

          //price is assumed to be 50/50 -- no discounts
          await PriceFeed.updatePrice(10, 10, block.timestamp - 1001);

          await expect(
            wX.flashLoan(flashloanReceiverX.address, loanAmt, "0x")
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__PriceFeedOutdated"
          );
        });

        ///
      });

      describe("Wrapped Token Overidden Method tests/ Refund unwanted tokens", async function () {
        it(`it should properly refund unwanted tokens in the pool if user wants to get out early`, async function () {
          let { SmartToken1, SmartToken2, deployer, wX, tester } =
            await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          //user wants to get out before the flashloan sells all unwanted tokens

          const userBalanceSM1 = await SmartToken1.balanceOf(deployer.address);
          const userBalanceSM2 = await SmartToken2.balanceOf(deployer.address);

          const wXtotalSupply = await wX.totalSupply();
          const userBalWX = await wX.balanceOf(deployer.address);

          const expectedSM2Unwanted = userBalWX
            .mul(ethers.utils.parseEther("5"))
            .div(wXtotalSupply);

          await wX.burn(userBalWX);

          //user is refunded the correct unwanted token amounts
          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2.add(expectedSM2Unwanted)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1.add(ethers.utils.parseEther("10"))
          );

          const userBalanceSM1After = await SmartToken1.balanceOf(
            deployer.address
          );
          const userBalanceSM2After = await SmartToken2.balanceOf(
            deployer.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter = userBalWX
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          const userBalWXAfter = await wX.balanceOf(deployer.address);

          await wX.burn(userBalWXAfter);

          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2After.add(expectedSM2UnwantedAfter)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1After
          );

          // user wants to burn all the tokens
          const userBalanceSM1After2 = await SmartToken1.balanceOf(
            deployer.address
          );
          const userBalanceSM2After2 = await SmartToken2.balanceOf(
            deployer.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter2 = userBalWXAfter
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          const userBalWXAfter2 = await wX.balanceOf(deployer.address);

          await wX.burnAll();

          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2After2.add(expectedSM2UnwantedAfter2)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1After2
          );

          // if user wants to burn to
          const userBalanceSM1After3 = await SmartToken1.balanceOf(
            tester.address
          );
          const userBalanceSM2After3 = await SmartToken2.balanceOf(
            tester.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //rebase happens and wX receives some unwanted tokens
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));

          const userBalTestwX = await wX.balanceOf(deployer.address);
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter3 = userBalTestwX
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          await wX.burnAllTo(tester.address);

          expect(
            Number(await SmartToken2.balanceOf(tester.address))
          ).to.be.equal(
            Number(userBalanceSM2After3.add(expectedSM2UnwantedAfter3))
          );
          expect(await SmartToken1.balanceOf(tester.address)).to.be.equal(
            userBalanceSM1After3.add(ethers.utils.parseEther("10"))
          );
        });
        it(`Should allow upgrades`, async function () {
          let {
            tokenFactory,
            SmartToken1,
            SmartToken2,
            deployer,
            wX,
            tester,
            RiskWrappedTokenContract,
          } = await loadFixture(deployTokenFixture);

          const newWrappedSmartTokenFactory = await ethers.getContractFactory(
            "wrappedSmartToken",
            tester
          );

          const existingProxyAddress = wX.address;


          await upgrades.forceImport(
            existingProxyAddress,
            RiskWrappedTokenContract
          );  
           await wX.transferOwnership(tester.address);

         expect( await upgrades.upgradeProxy(
            existingProxyAddress,
            newWrappedSmartTokenFactory
          )).to.be.ok;

        });
      });
      //
    })
  : describe.skip;
