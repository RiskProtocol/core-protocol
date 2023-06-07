import { assert, expect } from "chai";
import { ethers, network } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  defaultOperators,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  DECIMALS,
  INITIAL_PRICE,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { token } from "../../typechain-types/@openzeppelin/contracts";

const rebaseTable = [
  {
    depositValue: "10000000000000000000",
    beforeRebase: {
      x: "9000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "10000000000000000000",
    },
    beforeRebaseafterMgmtFees: {
      x: "8820000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "9800000000000000000",
    },
    afterRebase: "9473170000000000000",
  },
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
        const [deployer, tester] = await ethers.getSigners();

        const MockV3Aggregator = await ethers.getContractFactory(
          "MockV3Aggregator",
          deployer
        );
        const mockV3Aggregator = await MockV3Aggregator.deploy(
          DECIMALS,
          INITIAL_PRICE
        );
        await mockV3Aggregator.deployed();

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
        const tokenFactory = await TokenFactory.deploy(
          underlyingToken.address,
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address
        );
        await tokenFactory.deployed();

        // deploy devtoken 1
        const DevToken1 = await ethers.getContractFactory("DevToken", deployer);
        const devToken1 = await DevToken1.deploy(
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          defaultOperators,
          sanctionsContract.address
        );
        await devToken1.deployed();

        // deploy devtoken 2
        const DevToken2 = await ethers.getContractFactory("DevToken", deployer);
        const devToken2 = await DevToken2.deploy(
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          defaultOperators,
          sanctionsContract.address
        );
        await devToken2.deployed();

        // other instances to mock fake underlying token
        const TokenFactory2 = await ethers.getContractFactory(
          "TokenFactory",
          tester
        );
        const tokenFactory2 = await TokenFactory2.deploy(
          "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          mockV3Aggregator.address,
          REBASE_INTERVAL,
          sanctionsContract.address
        );
        await tokenFactory2.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          devToken1,
          devToken2,
          mockV3Aggregator,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          tokenFactory2,
        };
      }

      describe("Rebase, deposit and withdraw with MgmtFees", async function () {
        rebaseTable.forEach((item) => {
          it(`It should deposit correct amount with respect to fees.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await devToken1.mint(depositAmount, deployer.address);

            const userBal = await devToken1.balanceOf(deployer.address);
            const factBal = await devToken1.balanceOf(tokenFactory.address);

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
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            //const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2% per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await devToken1.mint(depositAmount, deployer.address);

            const userBal: bigint = await devToken1.balanceOf(deployer.address);
            const factBal = await devToken1.balanceOf(tokenFactory.address);

            let block = await ethers.provider.getBlock("latest");
            const now = block.timestamp;

            const nextRebaseTimeStamp = now + REBASE_INTERVAL;
            await time.setNextBlockTimestamp(nextRebaseTimeStamp);
            await tokenFactory.executeRebase(1, true);

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

            const userBal2: bigint = await devToken1.balanceOf(
              deployer.address
            );

            assert.equal(userBal, BigInt(userBal2) - BigInt(fee));
          });

          it(`It should withdraw correct amount with respect to fees.`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount: bigint = BigInt(item.depositValue);

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2% per day
            await tokenFactory.setManagementFeeState(true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await devToken2.mint(depositAmount, deployer.address);

            const withdrawAmount: bigint =
              (await devToken1.balanceOf(deployer.address)) >
              (await devToken2.balanceOf(deployer.address))
                ? devToken1.balanceOf(deployer.address)
                : await devToken2.balanceOf(deployer.address);

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
            await devToken1.withdraw(
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
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await devToken1.deposit(depositAmount, deployer.address);

            // to a transaction
            await devToken1.transfer(tester.address, transferAmount);

            // set the management fee to 2% and activating fees
            const mgmtFee = 200; //0.2 per day
            await tokenFactory.setManagementFeeRate(mgmtFee);
            await tokenFactory.setManagementFeeState(true);

            //get user balance
            const assetBal1: bigint = await devToken1.balanceOf(
              deployer.address
            );
            const assetBal2: bigint = await devToken2.balanceOf(
              deployer.address
            );

            //variables to be used for caluculations
            const oneDay: bigint = BigInt(86400);
            // const numberOfRebase: bigint = oneYear / BigInt(REBASE_INTERVAL);
            const mgmtFeePerInterval: bigint =
              (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;
            const scallingFactorX_: bigint = BigInt(333500000000000000);
            const scallingFactorY: bigint = BigInt(666500000000000000);
            const denominator: bigint = BigInt(1000000000000000000);
            //balance fees
            const expectedFeeUnscaled1: bigint =
              mgmtFeePerInterval * BigInt(assetBal1);
            const expectedFeeUnscaled2: bigint =
              mgmtFeePerInterval * BigInt(assetBal2);

            const scallingFactorMgmtFee = 100000;
            const expectedFee1: bigint =
              expectedFeeUnscaled1 / BigInt(scallingFactorMgmtFee);
            const expectedFee2: bigint =
              expectedFeeUnscaled2 / BigInt(scallingFactorMgmtFee);

            const asset1BalV2: bigint =
              BigInt(assetBal1) - BigInt(expectedFee1);

            const asset2BalV2: bigint =
              BigInt(assetBal2) - BigInt(expectedFee2);

            //the get balance formula after rebase
            const rollOverValue: bigint =
              (asset1BalV2 * scallingFactorX_ + asset2BalV2 * scallingFactorY) /
              denominator;
            const lastRebase = await tokenFactory.getLastTimeStamp();
            //contract call
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(1, true);

            expect(rollOverValue).to.equal(
              await devToken1.balanceOf(deployer.address)
            );
            expect(rollOverValue).to.equal(
              await devToken2.balanceOf(deployer.address)
            );
          });

          it(`it should not charge additional fees in case of an early rebase`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;
            const transferAmount = ethers.utils.parseEther("1");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await devToken1.deposit(depositAmount, deployer.address);

            // to a transaction
            await devToken1.transfer(tester.address, transferAmount);

            // set the management fee to 2% and activating fees
            const mgmtFee = 200; //0.2 per day
            await tokenFactory.setManagementFeeRate(mgmtFee);
            await tokenFactory.setManagementFeeState(true);

            //get user balance
            const assetBal1: bigint = await devToken1.balanceOf(
              deployer.address
            );
            const assetBal2: bigint = await devToken2.balanceOf(
              deployer.address
            );

            //variables to be used for caluculations
            const oneDay: bigint = BigInt(86400);
            // const numberOfRebase: bigint = oneYear / BigInt(REBASE_INTERVAL);
            const mgmtFeePerInterval: bigint =
              (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;
            const scallingFactorX_: bigint = BigInt(333500000000000000);
            const scallingFactorY: bigint = BigInt(666500000000000000);
            const denominator: bigint = BigInt(1000000000000000000);
            //balance fees
            const expectedFeeUnscaled1: bigint =
              mgmtFeePerInterval * BigInt(assetBal1);
            const expectedFeeUnscaled2: bigint =
              mgmtFeePerInterval * BigInt(assetBal2);

            const scallingFactorMgmtFee = 100000;
            const expectedFee1: bigint =
              expectedFeeUnscaled1 / BigInt(scallingFactorMgmtFee);
            const expectedFee2: bigint =
              expectedFeeUnscaled2 / BigInt(scallingFactorMgmtFee);

            const asset1BalV2: bigint =
              BigInt(assetBal1) - BigInt(expectedFee1);

            const asset2BalV2: bigint =
              BigInt(assetBal2) - BigInt(expectedFee2);

            //the get balance formula after rebase
            const rollOverValue: bigint =
              (asset1BalV2 * scallingFactorX_ + asset2BalV2 * scallingFactorY) /
              denominator;

            //contract call
            const lastRebase = await tokenFactory.getLastTimeStamp();
            //contract call
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);

            //early rebase
            const earlyRebase: bigint = BigInt(lastRebase) + BigInt(1000);
            await time.setNextBlockTimestamp(BigNumber.from(earlyRebase));
            await tokenFactory.executeRebase(1, false);

            //normal rebase
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(2, true);
            //check the fees
            expect(rollOverValue).to.equal(
              await devToken1.balanceOf(deployer.address)
            );
            expect(rollOverValue).to.equal(
              await devToken2.balanceOf(deployer.address)
            );
          });
          it(`It should not apply rebase to a new user`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // set the management fee to 0.2% and activating fees
            await tokenFactory.setManagementFeeRate(200); //0.2 % per day
            await tokenFactory.setManagementFeeState(true);

            const lastRebase = await tokenFactory.getLastTimeStamp();
            //contract call and make a rebase
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(1, true);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await time.setNextBlockTimestamp(nextRebase);
            await devToken1.mint(depositAmount, tester.address);

            //calculate fees for that interval only
            await time.setNextBlockTimestamp(nextRebase);
            const fee = await tokenFactory.calculateManagementFee(
              depositAmount,
              true,
              0
            );

            const userBal = await devToken1.balanceOf(tester.address);

            // confirm user paid for only one interval
            assert.equal(
              BigInt(fee) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });
          it(`It should charge the user for all pending rebases, not just for the one he is depositing`, async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = item.depositValue;

            await tokenFactory.initialize(devToken1.address, devToken2.address);

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
            await devToken1.mint(depositAmount, tester.address);

            //contract call and make 3 rebase
            const nextRebase = BigInt(lastRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebase);
            await tokenFactory.executeRebase(1, true);

            const secondRebase = BigInt(nextRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(secondRebase);
            await tokenFactory.executeRebase(2, true);

            const thirdRebase = BigInt(secondRebase) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(thirdRebase);
            await tokenFactory.executeRebase(3, true);

            const userBal = await devToken1.balanceOf(tester.address);

            // confirm user paid for more than one interval (3+1) in this case
            assert.notEqual(
              BigInt(fee) + BigInt(userBal),
              BigInt(item.depositValue)
            );
          });
        });
      });
    })
  : describe.skip;
