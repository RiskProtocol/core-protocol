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
import { BigNumber } from "ethers";

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

        const mockFlashLoanReceiverFactory = await ethers.getContractFactory(
          "MockFlashLoanReceiver_UND",
          deployer
        );
        const flashloanReceiver = await mockFlashLoanReceiverFactory.deploy(
          tokenFactory.address
        );
        await flashloanReceiver.deployed();
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
          flashloanReceiver,
        };
      }

      describe("Flash Loans Tests", async function () {
        it(`it should properly get the flashloan`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(true);
          await underlyingToken.transfer(
            flashloanReceiver.address,
            ethers.utils.parseEther("1")
          );

          await SmartToken1.flashLoan(
            flashloanReceiver.address,
            ethers.utils.parseEther("1"),
            "0x"
          );

          const premium = ethers.utils.parseEther("1").mul(5).div(10000);

          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10").add(premium));
        });

        it(`it should revert if reciever has not approved the funds transfer`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(false);
          await underlyingToken.transfer(
            flashloanReceiver.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            SmartToken1.flashLoan(
              flashloanReceiver.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWith("ERC20: insufficient allowance");

          const premium = 0; // ( ethers.utils.parseEther("1")).mul(5).div(10000);

          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10").add(premium));
        });
        it(`it should revert if reciever was  not able to get enough funds to pay back`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(true);

          await expect(
            SmartToken1.flashLoan(
              flashloanReceiver.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10"));
        });

        it(`it should revert if POOL doesnot have enough underlying`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await expect(
            SmartToken1.flashLoan(
              flashloanReceiver.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            SmartToken1,
            "SmartToken__FlashLoanInsufficientUnderlying"
          );
        });

        it(`it should revert if reciever's execute operation returned false'`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(true);
          await flashloanReceiver.updateMockReturn(false);
          await underlyingToken.transfer(
            flashloanReceiver.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            SmartToken1.flashLoan(
              flashloanReceiver.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          ).to.be.revertedWithCustomError(
            SmartToken1,
            "SmartToken__FlashLoanFailedExecOps"
          );
          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10"));
        });

        it(`it should revert if reciever is EOA`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
            tester,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(true);
          await flashloanReceiver.updateMockReturn(false);
          await underlyingToken.transfer(
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
          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10"));
        });
        it(`it should properly set the premium percentage`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          let premium = 500;
          await tokenFactory.setPremiumPercentage(premium);
          expect(await tokenFactory.getFlashloanPremium()).to.be.equal(premium);

          //test the upper and lower bounds

          premium = 0;
          await tokenFactory.setPremiumPercentage(premium);
          expect(await tokenFactory.getFlashloanPremium()).to.be.equal(premium);

          premium = 10000;
          await tokenFactory.setPremiumPercentage(premium);
          expect(await tokenFactory.getFlashloanPremium()).to.be.equal(premium);
        });

        it(`it should properly calculate and deduct the premium amount`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiver,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("10")
          );

          await SmartToken1.deposit(
            ethers.utils.parseEther("10"),
            deployer.address
          );
          await flashloanReceiver.isApprovedMeth(true);

          const premiumPercent = 10;
          await tokenFactory.setPremiumPercentage(premiumPercent);

          await underlyingToken.transfer(
            flashloanReceiver.address,
            ethers.utils.parseEther("1")
          );
          const premium = ethers.utils
            .parseEther("10")
            .mul(premiumPercent)
            .div(10000);
          expect(
            await SmartToken1.flashLoan(
              flashloanReceiver.address,
              ethers.utils.parseEther("10"),
              "0x"
            )
          )
            .to.emit(SmartToken1, "FlashLoanExecuted")
            .withArgs([
              flashloanReceiver.address,
              deployer.address,
              ethers.utils.parseEther("10"),
              premium,
              "0x",
            ]);

          expect(
            await underlyingToken.balanceOf(tokenFactory.address)
          ).to.be.equal(ethers.utils.parseEther("10").add(premium));
        });

        it(`it should properly return the POOL address`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2 } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          expect(await SmartToken1.getFlashLoanPool()).to.be.equal(
            tokenFactory.address
          );
        });
      });
    })
  : describe.skip;
