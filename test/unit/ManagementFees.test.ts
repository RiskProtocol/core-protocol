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
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";

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
          sanctionsContract.address,
          deployer.address,
          deployer.address,
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
            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2 % per day
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
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,
              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setTreasuryWallet(treasury.address);

            await tokenFactory.setManagementFeeRate(200); //0.2% per day
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
              deployer,
              defaultRebalanceData
            );

            await orchestrator.rebalance(encodedData, signature);

            let block2 = await ethers.provider.getBlock("latest");
            const now2 = block2.timestamp;

            await time.setNextBlockTimestamp(now2);
            const fee = await tokenFactory.calculateManagementFee(
              userBal,
              true,
              0
            );

            expect(Number(userBal - fee)).equals(
              Number(await smartToken1.balanceOf(deployer.address))
            );
            //assume that user made tx, apply rebalance
            await tokenFactory.applyRebalance(deployer.address);

            expect(Number(userBal - fee)).equals(
              Number(await smartToken1.balanceOf(deployer.address))
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
            await tokenFactory.setManagementFeeRate(200); //0.2% per day
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
              true,
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

          it(`it should have correct balances for X and Y tokens after rebalance with initial token balance of X:${item.beforeRebalance.x}, Y:${item.beforeRebalance.y} and when management Fees are set.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.deposit(depositAmount, deployer.address);

            // to a transaction
            await smartToken1.transfer(tester.address, transferAmount);

            // set the management fee to 2% and activating fees
            const mgmtFee = 200; //0.2 per day
            await tokenFactory.setManagementFeeRate(mgmtFee);
            await tokenFactory.setManagementFeeState(true);

            //get user balance
            const assetBal1: bigint = await smartToken1.balanceOf(
              deployer.address
            );
            const assetBal2: bigint = await smartToken2.balanceOf(
              deployer.address
            );
            //variables to be used for caluculations
            const oneDay: bigint = BigInt(86400);
            const mgmtFeePerInterval: bigint =
              (BigInt(mgmtFee) * BigInt(REBALANCE_INTERVAL)) / oneDay;
            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //contract call
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);

            let block = await ethers.provider.getBlock("latest");

            const scallingFactorMgmtFee = 1e18;
            const depositCycle = nextRebalance - BigInt(block.timestamp);

            const expectedFee2: bigint =
              (BigInt(depositCycle) *
                BigInt(mgmtFeePerInterval) *
                BigInt(assetBal2)) /
              BigInt(REBALANCE_INTERVAL) /
              BigInt(scallingFactorMgmtFee);
            const expectedFee1: bigint =
              (BigInt(depositCycle) *
                BigInt(mgmtFeePerInterval) *
                BigInt(assetBal1)) /
              BigInt(REBALANCE_INTERVAL) /
              BigInt(scallingFactorMgmtFee);

            const fee1 = await tokenFactory.calculateManagementFee(
              assetBal1,
              true,
              0
            );

            const fee2 = await tokenFactory.calculateManagementFee(
              assetBal2,
              true,
              0
            );

            expect(fee1).to.equal(expectedFee1);
            expect(fee2).to.equal(expectedFee2);
          });

          it(`it should not charge additional fees in case of an early rebalance`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              orchestrator,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );
            // set the management fee to 2% and activating fees
            const mgmtFee = 200; //0.2 per day
            await tokenFactory.setManagementFeeRate(mgmtFee);
            await tokenFactory.setManagementFeeState(true);
            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.deposit(depositAmount, deployer.address);

            const userbalPreRebalance = await smartToken1.balanceOf(
              deployer.address
            );

            const encodedEarlyRebalance1 = await signRebalance(deployer, {
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
              Number(await smartToken1.balanceOf(deployer.address)) // @todo : FIX THIS WEI Rounding
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
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(BigInt(2e17)); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);

            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);

            const { signature, encodedData } = await signRebalance(
              deployer,
              defaultRebalanceData
            );

            await orchestrator.rebalance(encodedData, signature);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await time.setNextBlockTimestamp(nextRebalance);
            await smartToken1.mint(depositAmount, tester.address);

            //calculate fees for that interval only
            await time.setNextBlockTimestamp(nextRebalance);
            const fee = await tokenFactory.calculateManagementFee(
              depositAmount,
              true,
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
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            await tokenFactory.setTreasuryWallet(treasury.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(BigInt(2e17)); //0.2 % per day

            await tokenFactory.setManagementFeeState(true);
            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //assume 1700 seconds have passed
            const newTimeValue = BigInt(lastRebalance) + BigInt(1700);

            await time.setNextBlockTimestamp(newTimeValue);
            //calculate fees for that interval only
            const fee = await tokenFactory.calculateManagementFee(
              depositAmount,
              true,
              0
            );
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await time.setNextBlockTimestamp(newTimeValue);
            await smartToken1.mint(depositAmount, tester.address);

            // contract call and make 3 rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);

            const encodedNaturalRebalance1 = await signRebalance(
              deployer,
              defaultRebalanceData
            );

            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );

            const secondRebalance =
              BigInt(nextRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebalance);

            const encodedNaturalRebalance2 = await signRebalance(deployer, {
              ...defaultRebalanceData,
              sequenceNumber: 2,
            });

            await orchestrator.rebalance(
              encodedNaturalRebalance2.encodedData,
              encodedNaturalRebalance2.signature
            );

            const thirdRebalance =
              BigInt(secondRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebalance);

            const encodedNaturalRebalance3 = await signRebalance(deployer, {
              ...defaultRebalanceData,
              sequenceNumber: 3,
            });

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
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );
            await tokenFactory.setTreasuryWallet(treasury.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2 % per day
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
              deployer,
              defaultRebalanceData
            );

            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );
            const deployerFee = feeCalculator(
              deployerBalanceAfter0,
              BigInt(200)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address))
            ).equals(Number(deployerBalanceAfter0) - Number(deployerFee));

            const deployerBalanceAfter1 = await smartToken1.balanceOf(
              deployer.address
            );

            const secondRebalance =
              BigInt(nextRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebalance);

            const encodedNaturalRebalance2 = await signRebalance(deployer, {
              ...defaultRebalanceData,
              sequenceNumber: 2,
            });

            await orchestrator.rebalance(
              encodedNaturalRebalance2.encodedData,
              encodedNaturalRebalance2.signature
            );

            const deployerFee1 = feeCalculator(
              deployerBalanceAfter0,
              BigInt(200)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address))
            ).equals(
              Number(BigInt(deployerBalanceAfter1) - BigInt(deployerFee1))
            );

            const deployerBalanceAfter2 = await smartToken1.balanceOf(
              deployer.address
            );

            const thirdRebalance =
              BigInt(secondRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebalance);

            const encodedNaturalRebalance3 = await signRebalance(deployer, {
              ...defaultRebalanceData,
              sequenceNumber: 3,
            });

            await orchestrator.rebalance(
              encodedNaturalRebalance3.encodedData,
              encodedNaturalRebalance3.signature
            );
            const deployerFee2 = feeCalculator(
              deployerBalanceAfter2,
              BigInt(200)
            );
            expect(
              Number(await smartToken1.balanceOf(deployer.address))
            ).equals(
              Number(BigInt(deployerBalanceAfter2) - BigInt(deployerFee2))
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
            const feeRate = 2e15;
            // set the management fee to 0.2% and activating fees
            await tokenFactory.setTreasuryWallet(treasury.address);

            await tokenFactory.setManagementFeeRate(feeRate.toString()); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);
            await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
            await smartToken1.deposit(depositAmount, deployer.address);

            const totalSupply = await smartToken1.totalSupply();

            //await tokenFactory.applyRebalance(tokenFactory.address);
            const collectedBeforeRebalance = await smartToken2.balanceOf(
              tokenFactory.address
            );

            const lastRebalance = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebalance
            const nextRebalance =
              BigInt(lastRebalance) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance);

            const encodedNaturalRebalance1 = await signRebalance(
              deployer,
              defaultRebalanceData
            );
            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );

            const FeeRebalance = feeCalculator(totalSupply, BigInt(feeRate));

            const TheTreasuryWallet = await smartToken1.balanceOf(
              treasury.address
            );

            //apply AUM fees on the collections
            const netFeeBeforeCollectedRebalance =
              BigInt(collectedBeforeRebalance) -
              feeCalculator(collectedBeforeRebalance, BigInt(feeRate));

            const tolerance = 2; //weis lost in divisions

            expect(
              Math.abs(
                Number(netFeeBeforeCollectedRebalance) - TheTreasuryWallet
              ) <= tolerance
            );
            expect(FeeRebalance).equals(
              await smartToken1.balanceOf(tokenFactory.address)
            );

            const walletTokenFactory = await smartToken1.balanceOf(
              tokenFactory.address
            );
            const FeeRebalance2 = feeCalculator(totalSupply, BigInt(feeRate));

            const lastRebalance2 = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebalance
            const nextRebalance2 =
              BigInt(lastRebalance2) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalance2);

            const encodedNaturalRebalance2 = await signRebalance(deployer, {
              ...defaultRebalanceData,
              sequenceNumber: 2,
            });

            await orchestrator.rebalance(
              encodedNaturalRebalance2.encodedData,
              encodedNaturalRebalance2.signature
            );

            //@note : We have to deduct the fees for the treasury wallet for the next REBALANCE
            // We also have to consider that fees we held on tokenFactory has also to pay fees for the next rebalance
            const newTreasuryBalance =
              BigInt(TheTreasuryWallet) -
              (BigInt(feeRate * REBALANCE_INTERVAL) *
                BigInt(TheTreasuryWallet)) /
                (BigInt(MULTIPLIER) * BigInt(86400)) +
              (BigInt(FeeRebalance2) -
                feeCalculator(FeeRebalance2, BigInt(feeRate)));

            const threashold = Number(0.01 / 100) * Number(newTreasuryBalance);
            //if the difference between the expected and the real value is more than 0.01%, it should fail
            expect(
              Math.abs(
                Number(newTreasuryBalance) -
                  Number(await smartToken1.balanceOf(treasury.address))
              ) <= threashold
            ).to.be.true;

            expect(FeeRebalance2).equals(
              BigInt(await smartToken1.balanceOf(tokenFactory.address))
            );
          });
          //
        });
      });
    })
  : describe.skip;
