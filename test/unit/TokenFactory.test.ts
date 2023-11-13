import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  RebaseElements,
  UserRebaseElements,
  callculateRolloverAmount,
  MULTIPLIER,
  signRebase,
  defaultRebaseData,
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
          REBASE_INTERVAL,
          sanctionsContract.address,
          deployer.address,
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
        ]);
        await smartToken2.deployed();

        //deploy orchestrator

        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
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
          REBASE_INTERVAL,
          sanctionsContract.address,
          deployer.address,
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
          REBASE_INTERVAL,
          sanctionsContract.address,
          deployer.address,
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

        it("sets the rebase interval correctly", async function () {
          const { tokenFactory } = await loadFixture(deployTokenFixture);
          const result = await tokenFactory.getInterval();
          expect(result).to.equal(REBASE_INTERVAL);
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
          await expect(
            await tokenFactory.getSignersAddress()
          ).to.be.equal(deployer.address);

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
          const { deployer, smartToken1 } = await loadFixture(
            deployTokenFixture
          );
          await expect(
            smartToken1.deposit("0", deployer.address)
          ).to.be.revertedWithCustomError(
            smartToken1,
            "SmartToken__ZeroDeposit"
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

        it("it should apply pending rebase if a user wants to withdraw", async function () {
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

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);

          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          // trigger rebase
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
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

        it("it should apply pending rebase if a user wants to withdraw", async function () {
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

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);

          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          // trigger rebase
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );

          await expect(
            smartToken1.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.emit(tokenFactory, "RebaseApplied");
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
            "SmartToken__RedeemMoreThanMax"
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

        it("it should apply pending rebase if a user wants to redeem tokens", async function () {
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

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);

          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          // trigger rebase
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );

          await expect(
            smartToken1.redeem(
              depositAmount,
              deployer.address,
              deployer.address
            )
          ).to.emit(tokenFactory, "RebaseApplied");
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
          await tokenFactory.connect(deployer).setManagementFeeRate(5000);
          expect(await tokenFactory.getManagementFeeRate()).to.equal(5000);
        });

        it(`Should allow not allow other users to set the management fee rate`, async () => {
          const { tokenFactory, tester } = await loadFixture(
            deployTokenFixture
          );

          await expect(
            tokenFactory.connect(tester).setManagementFeeRate(5000)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it(`Should allow management fee rate to be 1e18(100%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          await tokenFactory
            .connect(deployer)
            .setManagementFeeRate(BigNumber.from("1000000000000000000"));
          expect(await tokenFactory.getManagementFeeRate()).to.equal(
            utils.parseEther("1")
          );
        });

        it(`Should allow management fee rate to be 0(0%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          await tokenFactory.connect(deployer).setManagementFeeRate(0);
          expect(await tokenFactory.getManagementFeeRate()).to.equal(0);
        });

        it(`Should allow not allow management fee rate to be more than 1e18(100%)`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );

          await expect(
            tokenFactory
              .connect(deployer)
              .setManagementFeeRate(utils.parseEther("1.000000000000000001"))
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
          await tokenFactory.connect(deployer).setManagementFeeRate(mgmtFee);
          const amount = 1000;
          const isDefault = true;

          const fee = await tokenFactory.calculateManagementFee(
            amount,
            isDefault,
            mgmtFee
          );

          const oneDay: bigint = BigInt(86400);
          const mgmtFeePerInterval: bigint =
            (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;
          const lastTimeStamp: number = await tokenFactory.getLastTimeStamp();
          const nextRebaseTimeStamp: number =
            Number(lastTimeStamp) + Number(REBASE_INTERVAL);
          let block = await ethers.provider.getBlock("latest");
          const now: number = block.timestamp;
          const userDepositCycle: number = nextRebaseTimeStamp - now;

          const expectFee: number = Math.trunc(
            Math.trunc(
              (userDepositCycle * Number(mgmtFeePerInterval) * amount) /
                Number(REBASE_INTERVAL)
            ) / MULTIPLIER
          );

          expect(fee).to.equal(BigNumber.from(Math.trunc(expectFee)));
        });
        it(`Should throw error if rebase interval is not set`, async () => {
            const { sanctionsContract, underlyingToken, deployer } = await loadFixture(
              deployTokenFixture
            );

            const TokenFactory = await ethers.getContractFactory(
              "TokenFactory",
              deployer
            );
    
            const tokenFactory = await upgrades.deployProxy(TokenFactory, [
              underlyingToken.address,
              0,
              sanctionsContract.address,
              signersAddress,
            ]);
            await tokenFactory.deployed();


            const mgmtFee = 200; // Assuming 0.2% fee rate per day
            await tokenFactory.connect(deployer).setManagementFeeRate(mgmtFee);
            const amount = 1000;
            const isDefault = true;

            await expect(tokenFactory.calculateManagementFee(
              amount,
              false,
              mgmtFee
            )).to.be.revertedWithCustomError(
              tokenFactory,
              "TokenFactory__InvalidDivision"
            );
          });

        it(`Should calculate the correct fees amount for 0 ether`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const mgmtFee = 200; // Assuming 0.2% fee rate per day
          await tokenFactory.connect(deployer).setManagementFeeRate(mgmtFee);
          const amount = ethers.utils.parseEther("0");
          const isDefault = true;

          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp: bigint = BigInt(
            Number(lastTimeStamp) + Number(REBASE_INTERVAL)
          );

          const oneYear: bigint = BigInt(86400 * 366);
          const numberOfRebase: bigint = oneYear / BigInt(REBASE_INTERVAL);
          const mgmtFeePerInterval: bigint = BigInt(mgmtFee) / numberOfRebase;

          let block = await ethers.provider.getBlock("latest");
          const now: bigint = BigInt(block.timestamp);
          //contract call
          await time.setNextBlockTimestamp(now);
          const fee = await tokenFactory.calculateManagementFee(
            amount,
            isDefault,
            mgmtFee
          );

          const userDepositCycle: bigint = nextRebaseTimeStamp - now;

          const expectedFeeUnscaled2: bigint =
            (userDepositCycle *
              mgmtFeePerInterval *
              BigInt(amount.toString())) /
            BigInt(REBASE_INTERVAL);

          const expectedFee: bigint = expectedFeeUnscaled2 / BigInt(10000);
          expect(fee).to.equal(expectedFee);
        });

        it(`Should calculate the correct fees amount for 1 ether`, async () => {
          const { tokenFactory, deployer } = await loadFixture(
            deployTokenFixture
          );
          const mgmtFee = 200; // Assuming 0.2% fee rate per day
          await tokenFactory.connect(deployer).setManagementFeeRate(mgmtFee);
          const amount = ethers.utils.parseEther("1");
          const isDefault = true;

          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp: bigint = BigInt(
            Number(lastTimeStamp) + Number(REBASE_INTERVAL)
          );

          const oneDay: bigint = BigInt(86400);
          const mgmtFeePerInterval: bigint =
            (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;

          let block = await ethers.provider.getBlock("latest");
          const now: bigint = BigInt(block.timestamp);
          //contract call
          await time.setNextBlockTimestamp(now);
          const fee = await tokenFactory.calculateManagementFee(
            amount,
            isDefault,
            mgmtFee
          );

          const userDepositCycle: bigint = nextRebaseTimeStamp - now;

          const expectedFeeUnscaled2: bigint =
            (userDepositCycle *
              mgmtFeePerInterval *
              BigInt(amount.toString())) /
            BigInt(REBASE_INTERVAL);

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

      describe("Rebase", async function () {
        it("it can be triggered by any one apart from the deployer", async function () {
          const { tokenFactory, tester, orchestrator } = await loadFixture(
            deployTokenFixture
          );
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);

          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          await expect(
            orchestrator
              .connect(tester)
              .rebase(
                encodedNaturalRebase1.encodedData,
                encodedNaturalRebase1.signature
              )
          ).to.emit(tokenFactory, "Rebase");
        });

        it("it can be triggered by the deployer", async function () {
          const { tokenFactory, tester, orchestrator } = await loadFixture(
            deployTokenFixture
          );
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);
          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );
          await expect(
            orchestrator.rebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            )
          ).to.emit(tokenFactory, "Rebase");
        });

        it("it should confirm that user has correct balances of token x and y after rebase", async function () {
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

          // trigger a rebase
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);
          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );

          // confirm user balances when rebase has taken place
          assert.equal(
            await smartToken1.balanceOf(deployer.address),
            expectedBalanceX
          );
          assert.equal(
            await smartToken2.balanceOf(deployer.address),
            expectedBalanceY
          );

          // do a transaction to simulate the actual reflection of the rebase on chain
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebase has been applied on chain
          assert.equal(
            await smartToken1.balanceOf(deployer.address),
            expectedBalanceAfterTransferx
          );
          assert.equal(
            await smartToken2.balanceOf(deployer.address),
            expectedBalanceY
          );
        });

        it("it should confirm that user has correct balances of token x and y after missing double rebase period", async function () {
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

          const lastUserRebase: RebaseElements = {
            BalanceFactorXY: BigInt(1e18),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(0),
          };

          const rebase1: RebaseElements = {
            BalanceFactorXY: BigInt(
              (BigInt(1e18) * BigInt(2) * priceX) / priceU
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              (BigInt(1e18) * BigInt(priceY - priceX)) / priceU
            ),
          };
          const rebase2: RebaseElements = {
            BalanceFactorXY: BigInt(
              (BigInt(rebase1.BalanceFactorXY.toString()) *
                BigInt(2) *
                priceX2) /
                priceU2
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              BigInt(rebase1.BalanceFactorUy.toString()) +
                (BigInt(rebase1.BalanceFactorXY.toString()) *
                  (priceY2 - priceX2)) /
                  priceU2
            ),
          };

          const lastUserRebaseElements: UserRebaseElements = {
            netX: BigInt(1e19),
            netY: BigInt(9e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };

          //const firstRebase :any[]= callculateRolloverAmount(rebase1,lastUserRebase,lastUserRebaseElements);
          const secondRebase: any[] = callculateRolloverAmount(
            rebase2,
            lastUserRebase,
            lastUserRebaseElements
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

          // trigger a rebase
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);
          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );
          const lastTimeStamp = await tokenFactory.getLastTimeStamp();

          const nextNextRebaseTimeStamp =
            BigInt(lastTimeStamp) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextNextRebaseTimeStamp);
          const encodedNaturalRebase2 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 2,
              smartTokenXValue: priceX2.toString(),
            }
          );
          await orchestrator.rebase(
            encodedNaturalRebase2.encodedData,
            encodedNaturalRebase2.signature
          );
          // confirm user balances when rebase has taken place

          assert.equal(
            Number(await smartToken1.balanceOf(deployer.address)),
            Number(secondRebase[0])
          );
          assert.equal(
            Number(await smartToken2.balanceOf(deployer.address)),
            Number(secondRebase[1])
          );

          // do a transaction to simulate the actual reflection of the rebase on chain
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebase has been applied on chain
          assert.equal(
            Number(await smartToken1.balanceOf(deployer.address)),
            Number(secondRebase[0] - BigInt(1e18))
          );
          assert.equal(
            Number(await smartToken2.balanceOf(deployer.address)),
            Number(secondRebase[1])
          );
        });

        it("it should confirm that the receiver of a transfer transaction has correct balances of token x and y after rebase period", async function () {
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

          const lastUserRebase: RebaseElements = {
            BalanceFactorXY: BigInt(1e18),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(0),
          };

          const rebase1: RebaseElements = {
            BalanceFactorXY: BigInt(
              (BigInt(1e18) * BigInt(2) * priceX) / priceU
            ),
            BalanceFactorUx: BigInt(0),
            BalanceFactorUy: BigInt(
              (BigInt(1e18) * BigInt(priceY - priceX)) / priceU
            ),
          };

          const lastUserRebaseElementsTester: UserRebaseElements = {
            netX: BigInt(1e19),
            netY: BigInt(9e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };
          const lastUserRebaseElementsDeployer: UserRebaseElements = {
            netX: BigInt(1e19),
            netY: BigInt(11e18),
            Ux: BigInt(0),
            Uy: BigInt(0),
          };

          //const firstRebase :any[]= callculateRolloverAmount(rebase1,lastUserRebase,lastUserRebaseElements);
          const postRebaseTester: any[] = callculateRolloverAmount(
            rebase1,
            lastUserRebase,
            lastUserRebaseElementsTester
          );
          const postRebaseDeplyer: any[] = callculateRolloverAmount(
            rebase1,
            lastUserRebase,
            lastUserRebaseElementsDeployer
          );

          // trigger a rebase
          const now = await tokenFactory.getLastTimeStamp();

          const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebaseTimeStamp);
          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );

          // confirm user balances when rebase has taken place
          assert.equal(
            await smartToken1.balanceOf(tester.address),
            postRebaseTester[0]
          );
          assert.equal(
            await smartToken2.balanceOf(tester.address),
            postRebaseTester[1]
          );

          // do a transaction to simulate the actual reflection of the rebase on chain
          // now the tester account which is the receiver of this transaction should have 9.3335 balance after rebase
          // but after getting this transfer he should have in 10.3335 for x and 9.3335 for y
          await smartToken1.transfer(tester.address, transferAmount);

          // confirm user balances after rebase has been applied on chain
          assert.equal(
            Number(await smartToken1.balanceOf(tester.address)),
            Number(postRebaseTester[0] + BigInt(transferAmount.toString()))
          );
          assert.equal(
            await smartToken2.balanceOf(tester.address),
            postRebaseTester[1]
          );
        });
      });
    })
  : describe.skip;
