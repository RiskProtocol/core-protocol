import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  RebalanceElements,
  UserRebalanceElements,
  callculateRolloverAmount,
  MULTIPLIER,
  signRebalance,
  defaultRebalanceData,
  rateLimitsDefault,
  FF_INTERVAL,
  feeScalar,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber, utils } from "ethers";

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

        const tokenFactory = await upgrades.deployProxy(TokenFactory, [
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

        // deploy smartToken 1
        const SmartToken1Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken1 = await upgrades.deployProxy(SmartToken1Factory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          true,
          deployer.address,
        ]);
        await smartToken1.deployed();

        // deploy smartToken 2
        const SmartToken2Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken2 = await upgrades.deployProxy(SmartToken2Factory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          false,
          deployer.address,
        ]);
        await smartToken2.deployed();

        //deploy orchestrator

        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
          deployer.address,
        ]);
        await orchestrator.deployed();

        //initialize the orchestrator
        await tokenFactory.initializeOrchestrator(orchestrator.address);

        // other instances to mock fake underlying token
        const TokenFactory2 = await ethers.getContractFactory(
          "TokenFactory",
          tester
        );

        const tokenFactory2 = await upgrades.deployProxy(TokenFactory2, [
          "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
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
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
        ]);
        await tokenFactory3.deployed();

        // deploy smartToken 1  for the token factory without permit
        const SmartTokenXFactory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartTokenX = await upgrades.deployProxy(SmartTokenXFactory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory3.address,
          sanctionsContract.address,
          true,
          deployer.address,
        ]);
        await smartTokenX.deployed();

        // deploy smartToken 2  for the token factory without permit
        const SmartTokenYFactory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartTokenY = await upgrades.deployProxy(SmartTokenYFactory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory3.address,
          sanctionsContract.address,
          false,
          deployer.address,
        ]);
        await smartTokenY.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          tokenFactory2,
          underlyingTokenWithoutPermit,
          tokenFactory3,
          smartTokenX,
          smartTokenY,
          sanctionsContract,
          orchestrator,
        };
      }

      describe("Constructor(Initializer)", async function () {
        it("sets the address of the underlying token correctly", async function () {
          const { smartToken1, underlyingToken } = await loadFixture(
            deployTokenFixture
          );
          const result = await smartToken1.asset();
          assert.equal(result, underlyingToken.address);
        });

        it("sets the rebalance interval correctly", async function () {
          const { tokenFactory } = await loadFixture(deployTokenFixture);
          const result = await tokenFactory.getInterval();
          expect(result).to.equal(REBALANCE_INTERVAL);
        });
      });

      describe("Initialize dev tokens", async function () {
        it("it intializes the dev tokens with the correct adderesses", async function () {
          const { smartToken1, smartToken2, tokenFactory } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          const smartToken1address = await tokenFactory.getSmartTokenAddress(0);
          const smartToken2address = await tokenFactory.getSmartTokenAddress(1);

          assert.equal(smartToken1address, smartToken1.address);
          assert.equal(smartToken2address, smartToken2.address);
        });

        it("it should ensure that unauthorized user cannot initialize smartTokens", async function () {
          const { smartToken1, smartToken2, tokenFactory, tester } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await expect(
            tokenFactory
              .connect(tester)
              .initializeSMART(smartToken1.address, smartToken2.address)
          ).to.be.reverted;
        });
      });

      it("it should ensure that  smartTokens are initialized only once", async function () {
        const { smartToken1, smartToken2, tokenFactory, tester } =
          await loadFixture(deployTokenFixture);
        await tokenFactory.initializeSMART(
          smartToken1.address,

          smartToken2.address
        );
        await expect(
          tokenFactory.initializeSMART(smartToken1.address, smartToken2.address)
        ).to.be.revertedWithCustomError(
          tokenFactory,
          "TokenFactory__AlreadyInitialized"
        );
      });

      describe("Others", async function () {
        it("it returns the correct decimals for underlying token", async function () {
          const { underlyingToken, tokenFactory } = await loadFixture(
            deployTokenFixture
          );
          assert.equal(
            await tokenFactory.decimals(),
            await underlyingToken.decimals()
          );
        });

        it("it returns the correct asset", async function () {
          const { underlyingToken, smartToken1 } = await loadFixture(
            deployTokenFixture
          );
          assert.equal(await smartToken1.asset(), underlyingToken.address);
        });

        it("it returns the correct totalAssets in the token factory", async function () {
          const { underlyingToken, tokenFactory, smartToken1 } =
            await loadFixture(deployTokenFixture);
          expect(await smartToken1.totalAssets()).to.equal(
            await underlyingToken.balanceOf(tokenFactory.address)
          );
        });

        it("it returns the correct value for convertToShares function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          assert.equal(await smartToken1.convertToShares("5"), "5");
        });

        it("it returns the correct value for convertToAssets function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          assert.equal(await smartToken1.convertToAssets("5"), "5");
        });

        it("Should set and get the signer address correctly", async function () {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.setSignersAddress(deployer.address);
          await expect(await tokenFactory.getSignersAddress()).to.be.equal(
            deployer.address
          );
        });
      });

      describe("Deposit", async function () {
        it("it returns the correct value for maxDeposit function", async function () {
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
          const maxDepositValue =
            ethers.constants.MaxUint256.sub(depositAmount);

          expect(await smartToken1.maxDeposit(deployer.address)).to.equal(
            maxDepositValue
          );
        });

        it("it returns the correct value for previewDeposit function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          expect(await smartToken1.previewDeposit("5")).to.equal("5");
        });

        it("it should revert when user wants to deposit 0 token", async function () {
          const { deployer, smartToken1, tokenFactory, smartToken2 } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          await expect(
            smartToken1.deposit("0", deployer.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__ZeroDeposit"
          );
        });

        it("it should revert with appropriate error if smartToken not initialized", async function () {
          const { deployer, smartToken1, tokenFactory } = await loadFixture(
            deployTokenFixture
          );

          await expect(
            smartToken1.deposit("0", deployer.address)
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__SmartTokenArrayOutOfBounds"
          );
        });

        it("it should allow user to deposit acceptable amount of the underlying token successfully", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await expect(
            smartToken1.deposit(depositAmount, deployer.address)
          ).to.emit(tokenFactory, "Deposit");
        });

        it("it should revert if user tries to call _deposit on token factory", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await expect(
            tokenFactory._deposit(
              deployer.address,
              deployer.address,
              depositAmount,
              depositAmount
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__MethodNotAllowed"
          );
        });

        it("it should make sure that the user is assigned correct amount of token x and y after deposit", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          expect(depositAmount).to.equal(
            await smartToken1.balanceOf(deployer.address)
          );
          expect(depositAmount).to.equal(
            await smartToken2.balanceOf(deployer.address)
          );
        });

        it("it should make sure that the user is debited correct amount of underlying token after making deposit", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          const userCurrentBalance = await underlyingToken.balanceOf(
            deployer.address
          );
          const expectedBalance = userCurrentBalance - +depositAmount;

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          assert.equal(
            await underlyingToken.balanceOf(deployer.address),
            expectedBalance
          );
        });

        it("it should revert if user trying to deposit is on sanction list", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            sanctionsContract,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);

          // add user to sanctions list
          await sanctionsContract.setSanction(deployer.address, true);
          const sanctioned = await sanctionsContract.isSanctioned(
            deployer.address
          );
          expect(sanctioned).to.equal(true);
          await expect(
            smartToken1.deposit(depositAmount, deployer.address)
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "BaseContract__SanctionedAddress"
          );

          // remove user from sanctions list
          await sanctionsContract.setSanction(deployer.address, false);
          const notSanctioned = await sanctionsContract.isSanctioned(
            deployer.address
          );
          expect(notSanctioned).to.equal(false);
        });
      });

      describe("Minting", async function () {
        it("it returns the correct value for maxMint function", async function () {
          const {
            smartToken1,
            deployer,
            tokenFactory,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const mintAmount = ethers.constants.MaxUint256.div(2).add(1);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, mintAmount);

          await smartToken1.mint(mintAmount, deployer.address);

          expect(await smartToken1.maxMint(deployer.address)).to.equal(
            ethers.constants.MaxUint256.sub(mintAmount)
          );
        });

        it("it returns the correct value for previewMint function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          assert.equal(await smartToken1.previewMint("5"), "5");
        });

        it("it should make sure that the user is assigned correct amount of token x and y after minting", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.mint(depositAmount, deployer.address);

          expect(depositAmount).to.equal(
            await smartToken1.balanceOf(deployer.address)
          );
          expect(depositAmount).to.equal(
            await smartToken2.balanceOf(deployer.address)
          );
        });
      });

      describe("Withdraw", async function () {
        it("it returns the correct value for maxWithdraw function", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          await smartToken1.transfer(tester.address, depositAmount);

          expect(await smartToken1.maxWithdraw(deployer.address)).to.equal(
            await smartToken1.balanceOf(deployer.address)
          );
        });

        it("it returns the correct value for previewWithdraw function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          expect(await smartToken1.previewWithdraw("5")).to.equal("5");
        });

        it("it should apply pending rebalance if a user wants to withdraw", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          // trigger rebalance
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          await expect(
            smartToken1.withdraw(
              ethers.constants.MaxUint256,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__WithdrawMoreThanMax"
          );
        });

        it("it should apply pending rebalance if a user wants to withdraw", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          // trigger rebalance
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.emit(tokenFactory, "RebalanceApplied");
        });

        it("it should confirm that user gets correct amount of underlying token back after withdrawal", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // get user balance before withdrawal
          const initialBalance = await underlyingToken.balanceOf(
            deployer.address
          );
          const expectedBalance = +initialBalance + +depositAmount;

          // withdraw underlying token
          await smartToken1.withdraw(
            depositAmount,
            deployer.address,
            deployer.address
          );

          assert.equal(
            await underlyingToken.balanceOf(deployer.address),
            expectedBalance
          );
        });

        it("it should revert if user tries to call _withdraw directly from the tokenFactory", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // get user balance before withdrawal
          const initialBalance = await underlyingToken.balanceOf(
            deployer.address
          );

          // withdraw underlying token
          await await expect(
            tokenFactory._withdraw(
              deployer.address,
              deployer.address,
              deployer.address,
              depositAmount,
              depositAmount
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__MethodNotAllowed"
          );
        });

        it("it should confirm that users token x and y are reduced correctly after withdrawal", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // get user token x and y balance before withdrawal
          const initialBalanceA = await smartToken1.balanceOf(deployer.address);
          const initialBalanceB = await smartToken2.balanceOf(deployer.address);

          const expectedBalanceA = +initialBalanceA - +depositAmount;
          const expectedBalanceB = +initialBalanceB - +depositAmount;

          // withdraw underlying token
          await smartToken1.withdraw(
            depositAmount,
            deployer.address,
            deployer.address
          );

          assert.equal(
            await smartToken1.balanceOf(deployer.address),
            expectedBalanceA
          );
          assert.equal(
            await smartToken2.balanceOf(deployer.address),
            expectedBalanceB
          );
        });

        it("it should confirm that user cannot withdraw another persons fund", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // withdraw underlying token
          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              tester.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__OnlyAssetOwner"
          );
        });

        it("it should test for nonReentrant in withdraw function", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          await smartToken1.withdraw(
            depositAmount,
            deployer.address,
            deployer.address
          );
          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.reverted;
        });

        it("it not allow users on the sanction list to withdraw", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            sanctionsContract,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // add user to sanctions list
          await sanctionsContract.setSanction(deployer.address, true);
          const sanctioned = await sanctionsContract.isSanctioned(
            deployer.address
          );
          expect(sanctioned).to.equal(true);

          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "BaseContract__SanctionedAddress"
          );

          // remove user from sanctions list
          await sanctionsContract.setSanction(deployer.address, false);
          const notSanctioned = await sanctionsContract.isSanctioned(
            deployer.address
          );
          expect(notSanctioned).to.equal(false);
        });
      });

      describe("Redeem", async function () {
        it("it returns the correct value for maxRedeem function", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          await smartToken2.transfer(tester.address, depositAmount);

          expect(await smartToken1.maxRedeem(deployer.address)).to.equal(
            await smartToken2.balanceOf(deployer.address)
          );
        });

        it("it returns the correct value for previewRedeem function", async function () {
          const { smartToken1 } = await loadFixture(deployTokenFixture);
          assert.equal(await smartToken1.previewRedeem("5"), "5");
        });

        it("it should revert when user wants to redeem more than maximum withdrawal amount", async function () {
          const { tokenFactory, deployer, smartToken1, smartToken2 } =
            await loadFixture(deployTokenFixture);

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          await expect(
            smartToken1.redeem(
              ethers.constants.MaxUint256,
              deployer.address,
              deployer.address
            )
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__WithdrawMoreThanMax"
          );
        });

        it("it should confirm that user gets correct amount of underlying token back after redemption", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // get user balance before redemption
          const initialBalance = await underlyingToken.balanceOf(
            deployer.address
          );
          const expectedBalance = +initialBalance + +depositAmount;

          // redeem underlying token
          await smartToken1.redeem(
            depositAmount,
            deployer.address,
            deployer.address
          );

          assert.equal(
            await underlyingToken.balanceOf(deployer.address),
            expectedBalance
          );
        });

        it("it should apply pending rebalance if a user wants to redeem tokens", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          // trigger rebalance
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          await expect(
            smartToken1.redeem(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.emit(tokenFactory, "RebalanceApplied");
        });

        it("it should confirm that user cannot redeem another persons fund", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // withdraw underlying token
          await expect(
            smartToken1.redeem(depositAmount, deployer.address, tester.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__OnlyAssetOwner"
          );
        });

        it("it should test for nonReentrant in redeem function", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          const withdrawAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);
          await smartToken1.redeem(
            withdrawAmount,
            deployer.address,
            deployer.address
          );
          await smartToken1.redeem(
            withdrawAmount,
            deployer.address,
            deployer.address
          );
          await smartToken1.redeem(
            withdrawAmount,
            deployer.address,
            deployer.address
          );
          await expect(
            smartToken1.redeem(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.be.reverted;
        });
      });

      describe(`Management Fees`, () => {
        it(`Should allow deployer set the management fee rate`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.05, days);
          await tokenFactory.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          const [dailyFee, rebaseFee] =
            await tokenFactory.getManagementFeeRate();
          expect(dailyFee).to.equal(feeDetails.dailyFee);
          expect(rebaseFee).to.equal(feeDetails.RebaseFee);
        });

        it(`Should allow not allow other users to set the management fee rate`, async () => {
          const { tokenFactory, tester } = await loadFixture(
            deployTokenFixture
          );
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(1, days);

          await expect(
            tokenFactory
              .connect(tester)
              .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it(`Should allow management fee rate to be 1e18(100%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(1, days);
          await tokenFactory.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );

          const [dailyFee, rebaseFee] =
            await tokenFactory.getManagementFeeRate();
          expect(dailyFee).to.equal(feeDetails.dailyFee);
          expect(rebaseFee).to.equal(feeDetails.RebaseFee);
        });

        it(`Should allow management fee rate to be 0(0%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0, days);
          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee);
          const [dailyFee, rebaseFee] =
            await tokenFactory.getManagementFeeRate();
          expect(dailyFee).to.equal(feeDetails.dailyFee);
          expect(rebaseFee).to.equal(feeDetails.RebaseFee);
        });

        it(`Should allow not allow management fee rate to be more than 1e18(100%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(1, days);

          await expect(
            tokenFactory
              .connect(deployer)
              .setManagementFeeRate(
                feeDetails.dailyFee + 1,
                feeDetails.RebaseFee + 1
              )
          ).to.be.reverted;
        });

        it(`Should allow the deployer to turn on the management Fees state`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.connect(deployer).setManagementFeeState(true);
          expect(await tokenFactory.getManagementFeeState()).to.be.true;
        });
        it(`Should allow the deployer to turn off the management Fees state`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.connect(deployer).setManagementFeeState(false);
          expect(await tokenFactory.getManagementFeeState()).to.be.false;
        });
        it(`Should allow only the deployer to turn off the management Fees state`, async () => {
          const { tokenFactory, tester } = await loadFixture(
            deployTokenFixture
          );

          await expect(
            tokenFactory.connect(tester).setManagementFeeState(false)
          ).to.be.reverted;
        });
      });

      describe(`Management Fees calculation only`, () => {
        it(`Should calculate the correct fees amount for 1000 wei`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const mgmtFee = 200; // Assuming 0.2% fee rate per day
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(mgmtFee / 10e18, days);
          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee);
          const amount = 1000;
          const isDefault = true;

          const fee = await tokenFactory.calculateManagementFee(
            amount,
            mgmtFee
          );

          const oneDay: bigint = BigInt(86400);
          const mgmtFeePerInterval: bigint =
            (BigInt(mgmtFee) * BigInt(REBALANCE_INTERVAL)) / oneDay;
          const lastTimeStamp: number = await tokenFactory.getLastTimeStamp();
          const nextRebalanceTimeStamp: number =
            Number(lastTimeStamp) + Number(REBALANCE_INTERVAL);
          let block = await ethers.provider.getBlock("latest");
          const now: number = block.timestamp;
          const userDepositCycle: number = nextRebalanceTimeStamp - now;

          const expectFee: number = Math.trunc(
            Math.trunc(
              (userDepositCycle * Number(mgmtFeePerInterval) * amount) /
                Number(REBALANCE_INTERVAL)
            ) / MULTIPLIER
          );

          expect(fee).to.equal(BigNumber.from(Math.trunc(expectFee)));
        });
        it(`Should throw error if FF interval is not set`, async () => {
          const { sanctionsContract, underlyingToken, deployer } =
            await loadFixture(deployTokenFixture);

          const TokenFactory = await ethers.getContractFactory(
            "TokenFactory",
            deployer
          );

          const tokenFactory = await upgrades.deployProxy(TokenFactory, [
            underlyingToken.address,
            0,
            0,
            sanctionsContract.address,
            deployer.address,
            deployer.address,
            rateLimitsDefault.withdraw,
            rateLimitsDefault.deposit,
            rateLimitsDefault.period,
          ]);
          await tokenFactory.deployed();

          const mgmtFee = 200; // Assuming 0.2% fee rate per day
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(mgmtFee / 10e18, days);
          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee);
          const amount = 1000;
          const isDefault = true;

          await expect(
            tokenFactory.calculateManagementFee(amount, mgmtFee)
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidDivision"
          );
        });

        it(`Should calculate the correct fees amount for 0 ether`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const mgmtFee = 200; // Assuming 0.2% fee rate per day
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(mgmtFee / 10e18, days);
          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee);
          const amount = ethers.utils.parseEther("0");
          const isDefault = true;

          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp: bigint = BigInt(
            Number(lastTimeStamp) + Number(REBALANCE_INTERVAL)
          );

          const oneYear: bigint = BigInt(86400 * 366);
          const numberOfRebalance: bigint =
            oneYear / BigInt(REBALANCE_INTERVAL);
          const mgmtFeePerInterval: bigint =
            BigInt(mgmtFee) / numberOfRebalance;

          let block = await ethers.provider.getBlock("latest");
          const now: bigint = BigInt(block.timestamp);
          //contract call
          await time.setNextBlockTimestamp(now);
          const fee = await tokenFactory.calculateManagementFee(
            amount,
            mgmtFee
          );

          const userDepositCycle: bigint = nextRebalanceTimeStamp - now;

          const expectedFeeUnscaled2: bigint =
            (userDepositCycle *
              mgmtFeePerInterval *
              BigInt(amount.toString())) /
            BigInt(REBALANCE_INTERVAL);

          const expectedFee: bigint = expectedFeeUnscaled2 / BigInt(10000);
          expect(fee).to.equal(expectedFee);
        });

        it(`Should calculate the correct fees amount for 1 ether`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const MGMTFEEDAILY2P = 0.00022449 * 10 ** 18;
          const FFinterval = 86400;
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);
          const mgmtFee = feeDetails.dailyFee;
          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(feeDetails.dailyFee, feeDetails.RebaseFee);
          const amount = ethers.utils.parseEther("1");
          const isDefault = true;

          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextFFTimeStamp: bigint = BigInt(
            Number(lastTimeStamp) + Number(FFinterval)
          );

          let block = await ethers.provider.getBlock("latest");
          const now: bigint = BigInt(block.timestamp);
          //contract call
          await time.setNextBlockTimestamp(now);
          const fee = await tokenFactory.calculateManagementFee(
            amount,
            mgmtFee
          );

          const userDepositCycle: bigint = nextFFTimeStamp - now;

          const expectedFeeUnscaled2: bigint =
            (userDepositCycle * BigInt(mgmtFee) * BigInt(amount.toString())) /
            BigInt(FFinterval);

          const expectedFee: bigint = expectedFeeUnscaled2 / BigInt(MULTIPLIER);
          expect(fee).to.equal(expectedFee);
        });
      });

      describe(`ERC777: Token receive and sender implementation`, () => {
        it(`Should mint correct amount of tokens to the tokenfactory`, async () => {
          const {
            tokenFactory,
            deployer,
            smartToken1,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const amount = ethers.utils.parseEther("1");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, amount);
          await smartToken1.mint(amount, tokenFactory.address);

          const tokenFactoryBalance = await smartToken1.balanceOf(
            tokenFactory.address
          );
          expect(tokenFactoryBalance).to.equal(amount);
        });

        it(`Should deposit correct amount of tokens to the tokenfactory`, async () => {
          const {
            tokenFactory,
            deployer,
            smartToken1,
            smartToken2,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const amount = ethers.utils.parseEther("1");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );
          await underlyingToken.approve(tokenFactory.address, amount);
          await smartToken1.deposit(amount, tokenFactory.address);

          const tokenFactoryBalance = await smartToken1.balanceOf(
            tokenFactory.address
          );
          expect(tokenFactoryBalance).to.equal(amount);
        });
      });

      describe("Rebalance", async function () {
        it("it can be triggered by any one apart from the deployer", async function () {
          const { tokenFactory, tester, orchestrator } = await loadFixture(
            deployTokenFixture
          );
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          await expect(
            orchestrator
              .connect(tester)
              .rebalance(
                encodedNaturalRebalance1.encodedData,
                encodedNaturalRebalance1.signature
              )
          ).to.emit(tokenFactory, "Rebalance");
        });

        it("it can be triggered by the deployer", async function () {
          const { tokenFactory, tester, orchestrator } = await loadFixture(
            deployTokenFixture
          );
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);
          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );
          await expect(
            orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            )
          ).to.emit(tokenFactory, "Rebalance");
        });

        it("it should confirm that user has correct balances of token x and y after rebalance", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("10");
          const transferAmount = ethers.utils.parseEther("1");
          const expectedBalanceX = "9333000000000000000";
          const expectedBalanceY = "10000000000000000000";
          const expectedBalanceAfterTransferx = "8333000000000000000";

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // to a transaction
          await smartToken1.transfer(tester.address, transferAmount);

          // trigger a rebalance
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);
          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          // confirm user balances when rebalance has taken place
          assert.equal(
            await smartToken1.balanceOf(deployer.address),
            expectedBalanceX
          );
          assert.equal(
            await smartToken2.balanceOf(deployer.address),
            expectedBalanceY
          );

          // do a transaction to simulate the actual reflection of the rebalance on chain
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebalance has been applied on chain
          assert.equal(
            await smartToken1.balanceOf(deployer.address),
            expectedBalanceAfterTransferx
          );
          assert.equal(
            await smartToken2.balanceOf(deployer.address),
            expectedBalanceY
          );
        });

        it("it should confirm that user has correct balances of token x and y after missing double rebalance period", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("10");
          const transferAmount = ethers.utils.parseEther("1");
          const expectedBalanceX = "9555111000000000000";
          const expectedBalanceY = "10000000000000000000";
          const expectedBalanceAfterTransferX = "8555111000000000000";

          const priceX = BigInt(667);
          const priceX2 = BigInt(666666666666666666666);
          const priceY = BigInt(1333);
          const priceU = BigInt(2000);
          const priceU2 = BigInt(2000000000000000000000);
          const priceY2 = priceU2 - priceX2;

          const lastUserRebalance: RebalanceElements = {
            BalanceFactorXY: BigInt(1e18),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(0),
          };

          const rebalance1: RebalanceElements = {
            BalanceFactorXY: BigInt(
              (BigInt(1e18) * BigInt(2) * priceX) / priceU
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              (BigInt(1e18) * BigInt(priceY - priceX)) / priceU
            ),
          };
          const rebalance2: RebalanceElements = {
            BalanceFactorXY: BigInt(
              (BigInt(rebalance1.BalanceFactorXY.toString()) *
                BigInt(2) *
                priceX2) /
                priceU2
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              BigInt(rebalance1.BalanceFactorUy.toString()) +
                (BigInt(rebalance1.BalanceFactorXY.toString()) *
                  (priceY2 - priceX2)) /
                  priceU2
            ),
          };

          const lastUserRebalanceElements: UserRebalanceElements = {
            netX: BigInt(1e19),
            netY: BigInt(9e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };

          //const firstRebalance :any[]= callculateRolloverAmount(rebalance1,lastUserRebalance,lastUserRebalanceElements);
          const secondRebalance: any[] = callculateRolloverAmount(
            rebalance2,
            lastUserRebalance,
            lastUserRebalanceElements
          );

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // to a transaction
          await smartToken2.transfer(tester.address, transferAmount);

          // trigger a rebalance
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);
          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );
          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextNextRebalanceTimeStamp =
            BigInt(lastTimeStamp) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextNextRebalanceTimeStamp);
          const encodedNaturalRebalance2 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 2,
              smartTokenXValue: priceX2.toString(),
            }
          );
          await orchestrator.rebalance(
            encodedNaturalRebalance2.encodedData,
            encodedNaturalRebalance2.signature
          );
          // confirm user balances when rebalance has taken place

          assert.equal(
            Number(await smartToken1.balanceOf(deployer.address)),
            Number(secondRebalance[0])
          );
          assert.equal(
            Number(await smartToken2.balanceOf(deployer.address)),
            Number(secondRebalance[1])
          );

          // do a transaction to simulate the actual reflection of the rebalance on chain
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebalance has been applied on chain
          assert.equal(
            Number(await smartToken1.balanceOf(deployer.address)),
            Number(secondRebalance[0] - BigInt(1e18))
          );
          assert.equal(
            Number(await smartToken2.balanceOf(deployer.address)),
            Number(secondRebalance[1])
          );
        });

        it("it should confirm that the receiver of a transfer transaction has correct balances of token x and y after rebalance period", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            tester,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("10");
          const transferAmount = ethers.utils.parseEther("1");
          const expectedBalance = "9333500000000000000";
          const expectedBalanceAfterTransfer = "10333500000000000000";

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // give the tester address some underlying asset
          await underlyingToken.transfer(tester.address, depositAmount);

          // deposit underlying token for the deployer(has 10 of x and 10 of y)
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // deposit underlying token for the tester(has 10 of x and 10 of y)
          await underlyingToken
            .connect(tester)
            .approve(tokenFactory.address, depositAmount);
          await smartToken1
            .connect(tester)
            .deposit(depositAmount, tester.address);

          // to a transaction (has 10 of x and 9 of y)
          await smartToken2
            .connect(tester)
            .transfer(deployer.address, transferAmount);

          //AT this moment
          // tester has 10 X and 9 Y
          // deployer has 10 X and 11Y
          const priceX = BigInt(667);
          const priceX2 = BigInt(666666666666666666666);
          const priceY = BigInt(1333);
          const priceU = BigInt(2000);
          const priceU2 = BigInt(2000000000000000000000);
          const priceY2 = priceU2 - priceX2;

          const lastUserRebalance: RebalanceElements = {
            BalanceFactorXY: BigInt(1e18),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(0),
          };

          const rebalance1: RebalanceElements = {
            BalanceFactorXY: BigInt(
              (BigInt(1e18) * BigInt(2) * priceX) / priceU
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              (BigInt(1e18) * BigInt(priceY - priceX)) / priceU
            ),
          };

          const lastUserRebalanceElementsTester: UserRebalanceElements = {
            netX: BigInt(1e19),
            netY: BigInt(9e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };
          const lastUserRebalanceElementsDeployer: UserRebalanceElements = {
            netX: BigInt(1e19),
            netY: BigInt(11e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };

          //const firstRebalance :any[]= callculateRolloverAmount(rebalance1,lastUserRebalance,lastUserRebalanceElements);
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

          // trigger a rebalance
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);
          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          // confirm user balances when rebalance has taken place
          assert.equal(
            await smartToken1.balanceOf(tester.address),
            postRebalanceTester[0]
          );
          assert.equal(
            await smartToken2.balanceOf(tester.address),
            postRebalanceTester[1]
          );

          // do a transaction to simulate the actual reflection of the rebalance on chain
          // now the tester account which is the receiver of this transaction should have 9.3335 balance after rebalance
          // but after getting this transfer he should have in 10.3335 for x and 9.3335 for y
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebalance has been applied on chain
          assert.equal(
            Number(await smartToken1.balanceOf(tester.address)),
            Number(postRebalanceTester[0] + BigInt(transferAmount.toString()))
          );
          assert.equal(
            await smartToken2.balanceOf(tester.address),
            postRebalanceTester[1]
          );
        });
      });
    })
  : describe.skip;
