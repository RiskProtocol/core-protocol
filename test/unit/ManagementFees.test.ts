import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  feeCalculator,
  MULTIPLIER,
  signRebalance,
  defaultRebalanceData,
  rateLimitsDefault,
  feeCalculator2,
  feeScalar,
  FF_INTERVAL,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { token } from "../../typechain-types/@openzeppelin/contracts";
import exp from "constants";
const rebalanceTable = [
  {
    depositValue: "10000000000000000000",
    beforeRebalance: {
      x: "9000000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "10000000000000000000",
    },
    beforeRebalanceafterMgmtFees: {
      x: "8820000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "9800000000000000000",
    },
    afterRebalance: "9473170000000000000",
  },
  {
    depositValue: "5000000000000000000",
    beforeRebalance: {
      x: "4000000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "5000000000000000000",
    },
    beforeRebalanceafterMgmtFees: {
      x: "3920000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "4900000000000000000",
    },
    afterRebalance: "4573170000000000000",
  },
];

developmentChains.includes(network.name)
  ? describe("Management Fees", async function () {
      async function deployTokenFixture() {
        const [deployer, tester, treasury] = await ethers.getSigners();
        const rebaseSigner = ethers.Wallet.createRandom();

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
          FF_INTERVAL,
          sanctionsContract.address,
          rebaseSigner.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
          false,
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
          rebaseSigner.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
          false,
        ]);

        await tokenFactory2.deployed();

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

        const tokenFactoryFF = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          REBALANCE_INTERVAL,
          3600, //one hour
          sanctionsContract.address,
          rebaseSigner.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
          false,
        ]);
        await tokenFactory.deployed();

        // deploy smartToken 1
        const SmartToken1FF = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken1FF = await upgrades.deployProxy(SmartToken1FF, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactoryFF.address,
          sanctionsContract.address,
          true,
          deployer.address,
        ]);
        await smartToken1FF.deployed();

        // deploy smartToken 2
        const SmartToken2FF = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken2FF = await upgrades.deployProxy(SmartToken2FF, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactoryFF.address,
          sanctionsContract.address,
          false,
          deployer.address,
        ]);
        await smartToken2FF.deployed();

        const OrchestratorFactoryFF = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const orchestratorFF = await upgrades.deployProxy(
          OrchestratorFactoryFF,
          [tokenFactoryFF.address, deployer.address]
        );
        await orchestratorFF.deployed();

        //initialize the orchestrator
        await tokenFactoryFF.initializeOrchestrator(orchestratorFF.address);

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          tokenFactory2,
          treasury,
          orchestrator,
          tokenFactoryFF,
          smartToken1FF,
          smartToken2FF,
          orchestratorFF,
          rebaseSigner,
        };
      }

      describe("Rebalance, deposit and withdraw with MgmtFees", async function () {
        rebalanceTable.forEach((item) => {
          it(`It should deposit correct amount with respect to fees.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.002, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            ); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token

            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.mint(depositAmount, deployer.address);

            const userBal = await smartToken1.balanceOf(deployer.address);
            const factBal = await smartToken1.balanceOf(tokenFactory.address);

            // confirm user balances when rebalance has taken place

            assert.equal(
              BigInt(factBal) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });

          it(`It should apply rebalance with mgmt fee`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              treasury,
              orchestrator,
              rebaseSigner,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,
              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setTreasuryWallet(treasury.address);
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const test = 200 / MULTIPLIER;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.mint(depositAmount, deployer.address);

            const userBal: bigint = await smartToken1.balanceOf(
              deployer.address
            );

            const now = await tokenFactory.getLastTimeStamp();

            const nextRebalanceTimeStamp =
              BigInt(now) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

            const { signature, encodedData } = await signRebalance(
              rebaseSigner,
              defaultRebalanceData
            );
            let count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(encodedData, signature);

            let block2 = await ethers.provider.getBlock("latest");
            const now2 = block2.timestamp;

            await time.setNextBlockTimestamp(now2);

            const fee = BigInt(
              feeCalculator(userBal, BigInt(feeDetails.RebaseFee))
            );
            const diff = BigInt(userBal) - fee;

            expect(Number(diff).toPrecision(13)).equals(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                13
              )
            );
            //assume that user made tx, apply rebalance
            await tokenFactory.applyRebalance(deployer.address);
            expect(Number(diff).toPrecision(13)).equals(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                13
              )
            );
          });

          it(`It should withdraw correct amount with respect to fees.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount: bigint = BigInt(item.depositValue);

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            //await tokenFactory.setManagementFeeRate(200); //0.2% per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken2.mint(depositAmount, deployer.address);

            const withdrawAmount: bigint =
              (await smartToken1.balanceOf(deployer.address)) >
              (await smartToken2.balanceOf(deployer.address))
                ? smartToken1.balanceOf(deployer.address)
                : await smartToken2.balanceOf(deployer.address);

            let block = await ethers.provider.getBlock("latest");
            const now: bigint = BigInt(block.timestamp);
            //contract call
            await time.setNextBlockTimestamp(now);
            const fee = await tokenFactory.calculateManagementFee(
              withdrawAmount,
              0
            );
            const userBalance1: bigint = await underlyingToken.balanceOf(
              deployer.address
            );

            await time.setNextBlockTimestamp(now);

            // withdraw underlying token
            await smartToken1.withdraw(
              withdrawAmount,
              deployer.address,
              deployer.address
            );

            const expectedWithdraw: bigint =
              BigInt(withdrawAmount) + BigInt(fee);

            const userBalance2: bigint = await underlyingToken.balanceOf(
              deployer.address
            );

            const userWithdrawNet: bigint =
              BigInt(userBalance2) - BigInt(userBalance1);

            assert.equal(userWithdrawNet, expectedWithdraw);
          });
          it(`It should withdraw correct amount with respect to fees (Also redemption fee).`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount: bigint = BigInt(item.depositValue);

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken2.mint(depositAmount, deployer.address);

            const withdrawAmount: bigint =
              (await smartToken1.balanceOf(deployer.address)) >
              (await smartToken2.balanceOf(deployer.address))
                ? smartToken1.balanceOf(deployer.address)
                : await smartToken2.balanceOf(deployer.address);

            let block = await ethers.provider.getBlock("latest");
            const now: bigint = BigInt(block.timestamp);
            //contract call
            await time.setNextBlockTimestamp(now);
            const fee = await tokenFactory.calculateManagementFee(
              withdrawAmount,
              0
            );
            const userBalance1: bigint = await underlyingToken.balanceOf(
              deployer.address
            );
            //redemption fee

            await tokenFactory.setRedemptionFee((10 ** 16).toString()); //0.1%
            expect((await tokenFactory.getRedemptionFee()).toString()).to.equal(
              (10 ** 16).toString()
            );

            await tokenFactory.setTreasuryWallet(tester.address);

            const redemptionFee =
              ((Number(withdrawAmount) + Number(fee)) * 10 ** 16) / 10 ** 18;

            await time.setNextBlockTimestamp(now);


            // withdraw underlying token
            await smartToken1.withdraw(
              withdrawAmount,
              deployer.address,
              deployer.address
            );

            const expectedWithdraw: bigint =
              BigInt(withdrawAmount) + BigInt(fee) - BigInt(redemptionFee);

            const userBalance2: bigint = await underlyingToken.balanceOf(
              deployer.address
            );

            expect(
              Number(
                await underlyingToken.balanceOf(tester.address)
              ).toPrecision(10)
            ).to.equal(redemptionFee.toPrecision(10));
            const userWithdrawNet: bigint =
              BigInt(userBalance2) - BigInt(userBalance1);

            assert.equal(
              Number(userWithdrawNet).toPrecision(10),
              Number(expectedWithdraw).toPrecision(10)
            );
          });

          it(`it should have correct balances for X and Y tokens after rebalance with initial token balance of X:${item.beforeRebalance.x}, Y:${item.beforeRebalance.y} and when management Fees are set.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
              orchestrator,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");
            const FFinterval = 86400;
            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.deposit(depositAmount, deployer.address);
            await tokenFactory.setTreasuryWallet(tester.address);
            // to a transaction
            await smartToken1.transfer(tester.address, transferAmount);
            const userBalBeofre = await smartToken1.balanceOf(deployer.address);
            expect(Number(depositAmount) - Number(transferAmount)).to.equal(
              Number(await smartToken1.balanceOf(deployer.address))
            );
            //set the management fee to 2% and activating fees
            //const mgmtFee = MGMTFEEDAILY2P; //0.2 per day
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);
            const lastRebalance = await tokenFactory.getLastTimeStamp();
            let block = await ethers.provider.getBlock("latest");

            expect(block.timestamp < lastRebalance + FFinterval).to.be.true;
            let count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FFinterval);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FFinterval;
            }

            const fees = feeCalculator(
              userBalBeofre,
              BigInt(feeDetails.RebaseFee)
            );

            expect(
              (await smartToken1.balanceOf(deployer.address)) < userBalBeofre
            ).to.be.true;

            //precision is 10e14/10e18
            expect(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                14
              )
            ).to.equal(
              Number(Number(userBalBeofre) - Number(fees)).toPrecision(14)
            );
          });

          it(`it should not charge additional fees in case of an early rebalance`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              orchestrator,
              rebaseSigner,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );
            // set the management fee to 2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);
            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.deposit(depositAmount, deployer.address);

            const userbalPreRebalance = await smartToken1.balanceOf(
              deployer.address
            );

            const encodedEarlyRebalance1 = await signRebalance(rebaseSigner, {
              ...defaultRebalanceData,
              sequenceNumber: 1,
              isNaturalRebalance: false,
            });

            await orchestrator.rebalance(
              encodedEarlyRebalance1.encodedData,
              encodedEarlyRebalance1.signature
            );

            //check the fees history
            expect(Number(userbalPreRebalance)).to.equal(
              Number(await smartToken1.balanceOf(deployer.address))
            );
          });
          it(`It should not apply rebalance to a new user`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
              orchestrator,
              rebaseSigner,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.2, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);

            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);

            const { signature, encodedData } = await signRebalance(
              rebaseSigner,
              defaultRebalanceData
            );
            let count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(encodedData, signature);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            //await time.setNextBlockTimestamp(nextRebalance);
            await smartToken1.mint(depositAmount, tester.address);

            //calculate fees for that interval only
            //await time.setNextBlockTimestamp(nextRebalance);
            const fee = await tokenFactory.calculateManagementFee(
              depositAmount,
              0
            );

            const userBal = await smartToken1.balanceOf(tester.address);

            // confirm user paid for only one interval
            assert.equal(
              BigInt(fee) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });
          it(`It should set the treasury address correctly`, async function () {
            const { tokenFactory, treasury } = await loadFixture(
              deployTokenFixture
            );

            await tokenFactory.setTreasuryWallet(treasury.address);

            expect(await tokenFactory.getTreasuryAddress()).equals(
              treasury.address
            );
          });
          it(`It should charge the user for all pending rebalances, not just for the one he is depositing`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
              treasury,
              orchestrator,
              rebaseSigner,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            await tokenFactory.setTreasuryWallet(treasury.address);

            // set the management fee to 0.2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.2, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );

            await tokenFactory.setManagementFeeState(true);
            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //assume 1700 seconds have passed
            const newTimeValue = BigInt(lastRebalance) + BigInt(1700);

            await time.setNextBlockTimestamp(newTimeValue);
            //calculate fees for that interval only
            const fee = await tokenFactory.calculateManagementFee(
              depositAmount,
              0
            );
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await time.setNextBlockTimestamp(newTimeValue);
            await smartToken1.mint(depositAmount, tester.address);

            // contract call and make 3 rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);
            let count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            const encodedNaturalRebalance1 = await signRebalance(
              rebaseSigner,
              defaultRebalanceData
            );

            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );

            const secondRebalance =
              BigInt(nextRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebalance);

            const encodedNaturalRebalance2 = await signRebalance(rebaseSigner, {
              ...defaultRebalanceData,
              sequenceNumber: 2,
            });
            count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }

            await orchestrator.rebalance(
              encodedNaturalRebalance2.encodedData,
              encodedNaturalRebalance2.signature
            );

            const thirdRebalance =
              BigInt(secondRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebalance);

            const encodedNaturalRebalance3 = await signRebalance(rebaseSigner, {
              ...defaultRebalanceData,
              sequenceNumber: 3,
            });
            count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(
              encodedNaturalRebalance3.encodedData,
              encodedNaturalRebalance3.signature
            );

            const userBal = await smartToken1.balanceOf(tester.address);

            // confirm user paid for more than one interval (3+1) in this case
            assert.notEqual(
              BigInt(fee) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });

          it(`Should correctly charge the required fees after each rebalance(multiple rebalances sim)`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
              treasury,
              orchestrator,
              rebaseSigner,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );
            await tokenFactory.setTreasuryWallet(treasury.address);

            // set the management fee to 0.2% and activating fees
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            await tokenFactory.setManagementFeeState(true);
            const lastRebalance = await tokenFactory.getLastTimeStamp();

            await underlyingToken.transfer(tester.address, depositAmount);
            await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
            await underlyingToken
              .connect(tester)
              .approve(tokenFactory.address, depositAmount); //tester

            //await time.setNextBlockTimestamp(lastRebalance);
            await smartToken1.mint(depositAmount, deployer.address);
            await smartToken1
              .connect(tester)
              .mint(depositAmount, tester.address);

            const deployerBalanceAfter0 = await smartToken1.balanceOf(
              deployer.address
            );
            const testerBalanceAfterFirstFee = await smartToken1.balanceOf(
              tester.address
            );

            //contract call and make 3 rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);

            const encodedNaturalRebalance1 = await signRebalance(
              rebaseSigner,
              defaultRebalanceData
            );
            let count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );
            const deployerFee = feeCalculator(
              deployerBalanceAfter0,
              BigInt(feeDetails.RebaseFee)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                13
              )
            ).equals(
              Number(
                Number(deployerBalanceAfter0) - Number(deployerFee)
              ).toPrecision(13)
            );

            const deployerBalanceAfter1 = await smartToken1.balanceOf(
              deployer.address
            );

            const secondRebalance =
              BigInt(nextRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebalance);

            const encodedNaturalRebalance2 = await signRebalance(rebaseSigner, {
              ...defaultRebalanceData,
              sequenceNumber: 2,
            });
            count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(
              encodedNaturalRebalance2.encodedData,
              encodedNaturalRebalance2.signature
            );

            const deployerFee1 = feeCalculator(
              deployerBalanceAfter0,
              BigInt(feeDetails.RebaseFee)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                2
              )
            ).equals(
              Number(
                BigInt(deployerBalanceAfter1) - BigInt(deployerFee1)
              ).toPrecision(2)
            );

            const deployerBalanceAfter2 = await smartToken1.balanceOf(
              deployer.address
            );

            const thirdRebalance =
              BigInt(secondRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebalance);

            const encodedNaturalRebalance3 = await signRebalance(rebaseSigner, {
              ...defaultRebalanceData,
              sequenceNumber: 3,
            });
            count = 0;
            while (count < REBALANCE_INTERVAL) {
              await time.increase(FF_INTERVAL);
              await tokenFactory.dailyFeeFactorsUpdate();
              count += FF_INTERVAL;
            }
            await orchestrator.rebalance(
              encodedNaturalRebalance3.encodedData,
              encodedNaturalRebalance3.signature
            );
            const deployerFee2 = feeCalculator(
              deployerBalanceAfter2,
              BigInt(feeDetails.RebaseFee)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address)).toPrecision(
                12
              )
            ).equals(
              Number(
                BigInt(deployerBalanceAfter2) - BigInt(deployerFee2)
              ).toPrecision(12)
            );
          });
          it(`It charge fees correctly for the whole universe`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              treasury,
              orchestrator,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setTreasuryWallet(treasury.address);
            const days = REBALANCE_INTERVAL / FF_INTERVAL;
            const feeDetails = feeScalar(0.02, days);
            await tokenFactory.setManagementFeeRate(
              feeDetails.dailyFee,
              feeDetails.RebaseFee
            );
            const feeRate = feeDetails.dailyFee;

            //await tokenFactory.setManagementFeeRate(MGMTFEEDAILY2P); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);
            await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
            await smartToken1.deposit(depositAmount, deployer.address);

            const totalSupply = await smartToken1.totalSupply();

            //await tokenFactory.applyRebalance(tokenFactory.address);
            const collectedBeforeRebalance = await smartToken2.balanceOf(
              tokenFactory.address
            );
            const userBal = await smartToken1.balanceOf(deployer.address);

            const LastFFTimeStamp = await tokenFactory.getLastFFTimeStamp();
            const nextFFTimeStamp = BigInt(LastFFTimeStamp) + BigInt(86400);
            await time.setNextBlockTimestamp(nextFFTimeStamp);
            await tokenFactory.dailyFeeFactorsUpdate();
            //we are now in the next fee factor period

            expect((await smartToken1.balanceOf(deployer.address)) < userBal).to
              .be.true;

            const FeeRebalance = feeCalculator2(totalSupply, BigInt(feeRate));

            const TheTreasuryWallet = await smartToken1.balanceOf(
              treasury.address
            );

            //apply AUM fees on the collections
            const netFeeBeforeCollectedRebalance =
              BigInt(collectedBeforeRebalance) -
              feeCalculator2(collectedBeforeRebalance, BigInt(feeRate));

            const tolerance = 2; //weis lost in divisions

            expect(
              Math.abs(
                Number(netFeeBeforeCollectedRebalance) - TheTreasuryWallet
              ) <= tolerance
            );
            expect(Number(FeeRebalance).toPrecision(2)).equals(
              Number(
                await smartToken1.balanceOf(tokenFactory.address)
              ).toPrecision(2)
            );

            const FeeRebalance2 = feeCalculator2(totalSupply, BigInt(feeRate));

            const lastRebalance2 = await tokenFactory.getLastTimeStamp();
            const LastFFTimeStamp2 = await tokenFactory.getLastFFTimeStamp();
            const nextFFTimeStamp2 = BigInt(LastFFTimeStamp2) + BigInt(86400);
            await time.setNextBlockTimestamp(nextFFTimeStamp2);
            await tokenFactory.dailyFeeFactorsUpdate();

            //@note : We have to deduct the fees for the treasury wallet for the next REBALANCE
            // We also have to consider that fees we held on tokenFactory has also to pay fees for the next rebalance
            const newTreasuryBalance =
              BigInt(TheTreasuryWallet) -
              (BigInt(feeRate) * BigInt(TheTreasuryWallet)) /
                BigInt(MULTIPLIER) +
              (BigInt(FeeRebalance2) -
                feeCalculator(FeeRebalance2, BigInt(feeRate)));

            //if the difference between the expected and the real value is more than 0.01%, it should fail

            expect(Number(newTreasuryBalance).toPrecision(3)).equals(
              Number(await smartToken1.balanceOf(treasury.address)).toPrecision(
                3
              )
            );

            expect(Number(FeeRebalance2).toPrecision(2)).equals(
              Number(
                await smartToken1.balanceOf(tokenFactory.address)
              ).toPrecision(2)
            );
          });

          //*/
          //});
        });
        it(`should update FF when a user do an interaction with contract`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            treasury,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // set the management fee to 0.2% and activating fees
          await tokenFactory.setTreasuryWallet(treasury.address);
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);
          await tokenFactory.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          const feeRate = feeDetails.dailyFee;

          //await tokenFactory.setManagementFeeRate(MGMTFEEDAILY2P); //0.2 % per day
          await tokenFactory.setManagementFeeState(true);
          await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
          const previousFF = await tokenFactory.getLastFFTimeStamp();
          //move time to the next FF
          await time.increase(FF_INTERVAL);

          await smartToken1.deposit(depositAmount, deployer.address);
          expect(
            (await tokenFactory.getLastFFTimeStamp()) ==
              +previousFF + +FF_INTERVAL
          ).to.be.true;

          expect(await tokenFactory.getDailyFeeFactorNumber()).equals(1);
          expect(
            await tokenFactory.getUserLastFFCount(deployer.address)
          ).equals(1);
        });
        it(`should update FF of the receiver when doing a transfer, and only once per FF interval`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            treasury,
            orchestrator,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("1");
          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // set the management fee to 0.2% and activating fees
          await tokenFactory.setTreasuryWallet(treasury.address);
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);
          await tokenFactory.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          const feeRate = feeDetails.dailyFee;

          //await tokenFactory.setManagementFeeRate(MGMTFEEDAILY2P); //0.2 % per day
          await tokenFactory.setManagementFeeState(true);
          await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
          const previousFF = await tokenFactory.getLastFFTimeStamp();
          //move time to the next FF
          await time.increase(FF_INTERVAL);

          await smartToken1.deposit(depositAmount, deployer.address);
          await smartToken1.transfer(
            tester.address,
            ethers.utils.parseEther("0.001")
          );
          await smartToken1.transfer(
            tester.address,
            ethers.utils.parseEther("0.001")
          );
          expect(
            (await tokenFactory.getLastFFTimeStamp()) ==
              +previousFF + +FF_INTERVAL
          ).to.be.true;

          expect(await tokenFactory.getDailyFeeFactorNumber()).equals(1);
          expect(
            await tokenFactory.getUserLastFFCount(deployer.address)
          ).equals(1);
          expect(await tokenFactory.getUserLastFFCount(tester.address)).equals(
            1
          );
        });
        it(`should correctly update a new user FF`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            treasury,
            orchestrator,
            tester,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // set the management fee to 0.2% and activating fees
          await tokenFactory.setTreasuryWallet(treasury.address);
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);
          await tokenFactory.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          const feeRate = feeDetails.dailyFee;

          //await tokenFactory.setManagementFeeRate(MGMTFEEDAILY2P); //0.2 % per day
          await tokenFactory.setManagementFeeState(true);
          await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
          const previousFF = await tokenFactory.getLastFFTimeStamp();
          let count = 0;
          //move time to the next FF
          await time.increase(FF_INTERVAL);
          await tokenFactory.dailyFeeFactorsUpdate();
          count++;

          await time.increase(FF_INTERVAL);
          await tokenFactory.dailyFeeFactorsUpdate();
          count++;

          await time.increase(FF_INTERVAL);
          await tokenFactory.dailyFeeFactorsUpdate();
          count++;

          await smartToken1.deposit(depositAmount, deployer.address);
          expect(
            await tokenFactory.getUserLastFFCount(deployer.address)
          ).equals(count);

          await time.increase(FF_INTERVAL);
          await tokenFactory.dailyFeeFactorsUpdate();
          count++;

          await smartToken1.transfer(
            tester.address,
            ethers.utils.parseEther("0.001")
          );

          expect(await tokenFactory.getUserLastFFCount(tester.address)).equals(
            count
          );
        });
        it(`It charge fees correctly for hourly FFintervals`, async function () {
          const {
            tokenFactoryFF,
            deployer,
            underlyingToken,
            smartToken1FF,
            smartToken2FF,
            treasury,
            orchestratorFF,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactoryFF.initializeSMART(
            smartToken1FF.address,

            smartToken2FF.address
          );

          // set the management fee to 0.2% and activating fees
          await tokenFactoryFF.setTreasuryWallet(treasury.address);
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);
          // feeDetails.dailyFee = Math.round(
          //   Number(feeDetails.dailyFee) / 24
          // ).toString();
          await tokenFactoryFF.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          const feeRate = feeDetails.dailyFee;
          const nInterval = FF_INTERVAL / 24;
          await tokenFactoryFF.setManagementFeeState(true);
          await underlyingToken.approve(tokenFactoryFF.address, depositAmount); //deployer
          await smartToken1FF.deposit(depositAmount, deployer.address);

          const userBal = await smartToken1FF.balanceOf(deployer.address);

          await time.increase(nInterval);
          await tokenFactoryFF.dailyFeeFactorsUpdate();
          //we are now in the next fee factor period
          expect((await smartToken1FF.balanceOf(deployer.address)) < userBal).to
            .be.true;

          const fees = await tokenFactoryFF.calculateManagementFee(userBal, 0);
          const feesCal = feeCalculator2(userBal, BigInt(feeRate), true);
          expect(Number(fees).toPrecision(1)).equals(
            Number(feesCal).toPrecision(1)
          );

          expect(
            Number(await smartToken1FF.balanceOf(deployer.address)).toPrecision(
              5
            )
          ).equals((Number(userBal) - Number(fees)).toPrecision(5));
        });
        it(`It should apply rebalance fees correctly when the FF interval is hourly`, async function () {
          const {
            tokenFactoryFF,
            deployer,
            underlyingToken,
            smartToken1FF,
            smartToken2FF,
            treasury,
            orchestratorFF,
            rebaseSigner,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactoryFF.initializeSMART(
            smartToken1FF.address,
            smartToken2FF.address
          );

          expect(await tokenFactoryFF.getSmartTokenAddress(0)).equals(
            smartToken1FF.address
          );
          expect(await tokenFactoryFF.getSmartTokenAddress(1)).equals(
            smartToken2FF.address
          );

          // set the management fee to 0.2% and activating fees
          await tokenFactoryFF.setTreasuryWallet(treasury.address);
          const days = REBALANCE_INTERVAL / FF_INTERVAL;
          const feeDetails = feeScalar(0.02, days);

          await tokenFactoryFF.setManagementFeeRate(
            feeDetails.dailyFee,
            feeDetails.RebaseFee
          );
          await tokenFactoryFF.setManagementFeeState(true);

          // deposit underlying token
          await underlyingToken.approve(tokenFactoryFF.address, depositAmount);
          await smartToken2FF.mint(depositAmount, deployer.address);

          const userBal: bigint = await smartToken1FF.balanceOf(
            deployer.address
          );

          const now = await tokenFactoryFF.getLastTimeStamp();

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const { signature, encodedData } = await signRebalance(
            rebaseSigner,
            defaultRebalanceData
          );
          let ninterval = FF_INTERVAL / 24;
          let count = 0;
          while (count < REBALANCE_INTERVAL) {
            await time.increase(ninterval);
            await tokenFactoryFF.dailyFeeFactorsUpdate();
            count += ninterval;
          }
          await orchestratorFF.rebalance(encodedData, signature);

          let block2 = await ethers.provider.getBlock("latest");
          const now2 = block2.timestamp;

          await time.setNextBlockTimestamp(now2);

          const fee = BigInt(
            feeCalculator(userBal, BigInt(feeDetails.RebaseFee))
          );
          const diff = BigInt(userBal) - fee;

          expect(Number(diff).toPrecision(5)).equals(
            Number(await smartToken1FF.balanceOf(deployer.address)).toPrecision(
              5
            )
          );
        });
      });
    })
  : describe.skip;
