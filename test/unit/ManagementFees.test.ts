import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  DECIMALS,
  INITIAL_PRICE,
  signersAddress,
  encodedEarlyRebase1,
  encodedNaturalRebase1,
  encodedEarlyRebase2,
  encodedNaturalRebase2,
  encodedNaturalRebase3,
  SmartTokenXValue,
  feeCalculator,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { token } from "../../typechain-types/@openzeppelin/contracts";

const rebaseTable = [
  // {
  //   depositValue: "10000000000000000000",
  //   beforeRebase: {
  //     x: "9000000000000000000", // we simiulate that one of token X has been traded before rebase
  //     y: "10000000000000000000",
  //   },
  //   beforeRebaseafterMgmtFees: {
  //     x: "8820000000000000000", // we simiulate that one of token X has been traded before rebase
  //     y: "9800000000000000000",
  //   },
  //   afterRebase: "9473170000000000000",
  // },
  {
    depositValue: "5000000000000000000",
    beforeRebase: {
      x: "4000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "5000000000000000000",
    },
    beforeRebaseafterMgmtFees: {
      x: "3920000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "4900000000000000000",
    },
    afterRebase: "4573170000000000000",
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

        // other instances to mock fake underlying token
        const TokenFactory2 = await ethers.getContractFactory(
          "TokenFactory",
          tester
        );

        const tokenFactory2 = await upgrades.deployProxy(TokenFactory2, [
          "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          REBASE_INTERVAL,
          sanctionsContract.address,
          signersAddress,
        ]);

        await tokenFactory2.deployed();

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
        };
      }

      describe("Rebase, deposit and withdraw with MgmtFees", async function () {
        rebaseTable.forEach((item) => {
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

            // confirm user balances when rebase has taken place

            assert.equal(
              BigInt(factBal) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });

          it(`It should apply rebase with mgmt fee`, async function () {
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
            await tokenFactory.setManagementFeeRate(200); //0.2% per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.mint(depositAmount, deployer.address);

            const userBal: bigint = await smartToken1.balanceOf(
              deployer.address
            );
            const factBal = await smartToken1.balanceOf(tokenFactory.address);

            const now = await tokenFactory.getLastTimeStamp();

            const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebaseTimeStamp);
            await tokenFactory.executeRebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            );

            let block2 = await ethers.provider.getBlock("latest");
            const now2 = block2.timestamp;

            await time.setNextBlockTimestamp(now2);
            const fee = await tokenFactory.calculateManagementFee(
              userBal,
              true,
              0
            );

            //assume that user made tx, apply rebase
            await time.setNextBlockTimestamp(now2);
            await tokenFactory.applyRebase(deployer.address);

            const userBal2: bigint = await smartToken1.balanceOf(
              deployer.address
            );
            console.log(
              `L233 : User Bal: ${userBal}\nUserBal2:${userBal2}\nfees:${fee}`
            );
            assert.equal(userBal, BigInt(userBal2) + BigInt(fee));
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

          it(`it should have correct balances for X and Y tokens after rebase with initial token balance of X:${item.beforeRebase.x}, Y:${item.beforeRebase.y} and when management Fees are set.`, async function () {
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
              (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;
            const lastRebase = await tokenFactory.getLastTimeStamp();
            //contract call
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);

            let block = await ethers.provider.getBlock("latest");

            const scallingFactorMgmtFee = 100000;
            const depositCycle = nextRebase - BigInt(block.timestamp);

            const expectedFee2: bigint =
              (BigInt(depositCycle) *
                BigInt(mgmtFeePerInterval) *
                BigInt(assetBal2)) /
              BigInt(REBASE_INTERVAL) /
              BigInt(scallingFactorMgmtFee);
            const expectedFee1: bigint =
              (BigInt(depositCycle) *
                BigInt(mgmtFeePerInterval) *
                BigInt(assetBal1)) /
              BigInt(REBASE_INTERVAL) /
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

          it(`it should not charge additional fees in case of an early rebase`, async function () {
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

            const initialManagementFeeHistory =
              await tokenFactory.getMgmtFeeFactorLength();
            await tokenFactory.executeRebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            );

            const finalManagementFeeHistory =
              await tokenFactory.getMgmtFeeFactorLength();

            //check the fees history
            expect(initialManagementFeeHistory).to.equal(
              finalManagementFeeHistory
            );
          });
          it(`It should not apply rebase to a new user`, async function () {
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

            const lastRebase = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebase
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            );

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await time.setNextBlockTimestamp(nextRebase);
            await smartToken1.mint(depositAmount, tester.address);

            //calculate fees for that interval only
            await time.setNextBlockTimestamp(nextRebase);
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
          it(`It should charge the user for all pending rebases, not just for the one he is depositing`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              smartToken1,
              smartToken2,
              tester,
              treasury,
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
            const lastRebase = await tokenFactory.getLastTimeStamp();
            //assume 10000 seconds have passed
            const newTimeValue = BigInt(lastRebase) + BigInt(10000);

            // deposit underlying token
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

            //contract call and make 3 rebase
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            );

            const secondRebase = BigInt(nextRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebase);
            await tokenFactory.executeRebase(
              encodedNaturalRebase2.encodedData,
              encodedNaturalRebase2.signature
            );

            const thirdRebase = BigInt(secondRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebase);
            await tokenFactory.executeRebase(
              encodedNaturalRebase3.encodedData,
              encodedNaturalRebase3.signature
            );

            const userBal = await smartToken1.balanceOf(tester.address);

            // confirm user paid for more than one interval (3+1) in this case
            assert.notEqual(
              BigInt(fee) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });

          // it(`New tests`, async function () {
          //   const {
          //     tokenFactory,
          //     deployer,
          //     underlyingToken,
          //     smartToken1,
          //     smartToken2,
          //     tester,
          //     treasury,
          //   } = await loadFixture(deployTokenFixture);
          //   const depositAmount = item.depositValue;

          //   await tokenFactory.initializeSMART(
          //     smartToken1.address,

          //     smartToken2.address
          //   );
          //   await tokenFactory.setTreasuryWallet(treasury.address);

          //   // set the management fee to 0.2% and activating fees
          //   await tokenFactory.setManagementFeeRate(200); //0.2 % per day
          //   await tokenFactory.setManagementFeeState(true);
          //   const lastRebase = await tokenFactory.getLastTimeStamp();

          //   // deposit underlying token
          //   //await time.setNextBlockTimestamp(lastRebase);
          //   //calculate fees for that interval only
          //   // const fee = await tokenFactory.calculateManagementFee(
          //   //   depositAmount,
          //   //   true,
          //   //   0
          //   // );
          //   await underlyingToken.transfer(tester.address, depositAmount);
          //   await underlyingToken.approve(tokenFactory.address, depositAmount); //deployer
          //   await underlyingToken
          //     .connect(tester)
          //     .approve(tokenFactory.address, depositAmount); //tester

          //   //await time.setNextBlockTimestamp(lastRebase);
          //   await smartToken1.mint(depositAmount, deployer.address);
          //   await smartToken1
          //     .connect(tester)
          //     .mint(depositAmount, tester.address);

          //   const deployerBalanceAfter0 = await smartToken1.balanceOf(
          //     deployer.address
          //   );
          //   const testerBalanceAfterFirstFee = await smartToken1.balanceOf(
          //     tester.address
          //   );

          //   //contract call and make 3 rebase
          //   const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
          //   await time.setNextBlockTimestamp(nextRebase);
          //   await tokenFactory.executeRebase(
          //     encodedNaturalRebase1.encodedData,
          //     encodedNaturalRebase1.signature
          //   );
          //   const deployerFee = feeCalculator(
          //     deployerBalanceAfter0,
          //     BigInt(200)
          //   );
          //   expect(
          //     BigInt(await smartToken1.balanceOf(deployer.address))
          //   ).equals(BigInt(deployerBalanceAfter0) - BigInt(deployerFee));

          //   const deployerBalanceAfter1 = await smartToken1.balanceOf(
          //     deployer.address
          //   );

          //   const secondRebase = BigInt(nextRebase) + BigInt(REBASE_INTERVAL);
          //   await time.setNextBlockTimestamp(secondRebase);
          //   await tokenFactory.executeRebase(
          //     encodedNaturalRebase2.encodedData,
          //     encodedNaturalRebase2.signature
          //   );

          //   const deployerFee1 = feeCalculator(
          //     deployerBalanceAfter0,
          //     BigInt(200)
          //   );
          //   expect(
          //     BigInt(await smartToken1.balanceOf(deployer.address))
          //   ).equals(BigInt(deployerBalanceAfter1) - BigInt(deployerFee1));

          //   const deployerBalanceAfter2 = await smartToken1.balanceOf(
          //     deployer.address
          //   );

          //   const thirdRebase = BigInt(secondRebase) + BigInt(REBASE_INTERVAL);
          //   await time.setNextBlockTimestamp(thirdRebase);
          //   await tokenFactory.executeRebase(
          //     encodedNaturalRebase3.encodedData,
          //     encodedNaturalRebase3.signature
          //   );

          //   const userBal = await smartToken1.balanceOf(tester.address);

          //   // confirm user paid for more than one interval (3+1) in this case
          //   // assert.notEqual(
          //   //   BigInt(fee) + BigInt(userBal),
          //   //   BigInt(item.depositValue)
          //   // );
          // });
        });
      });
    })
  : describe.skip;
