import { assert, expect } from "chai";
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
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const rebalanceTable = [
  {
    depositValue: "10000000000000000000",
    beforeRebalance: {
      x: "9000000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "10000000000000000000",
    },
    afterRebalance: {
      x: "9333000000000000000",
      y: "10000000000000000000",
    },
  },
  {
    depositValue: "5000000000000000000",
    beforeRebalance: {
      x: "4000000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "5000000000000000000",
    },
    afterRebalance: {
      x: "4333000000000000000",
      y: "5000000000000000000",
    },
  },
  {
    depositValue: "4335000000000000000",
    beforeRebalance: {
      x: "3335000000000000000", // we simiulate that one of token X has been traded before rebalance
      y: "4335000000000000000",
    },
    afterRebalance: {
      x: "3668000000000000000",
      y: "4335000000000000000",
    },
  },
];

developmentChains.includes(network.name)
  ? describe("RebalanceTable", async function () {
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
          sanctionsContract.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
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
          REBALANCE_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
        ]);
        await tokenFactory2.deployed();

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

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          tokenFactory2,
          orchestrator,
        };
      }

      describe("Rebalance", async function () {
        rebalanceTable.forEach((item) => {
          it(`it should have correct balances for X and Y tokens after rebalance with initial token balance of X:${item.beforeRebalance.x}, Y:${item.beforeRebalance.y}`, async function () {
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

            await tokenFactory.initializeSMART(
              smartToken1.address,

              smartToken2.address
            );

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await smartToken1.deposit(depositAmount, deployer.address);

            // to a transaction
            await smartToken1.transfer(tester.address, transferAmount);
            const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;

            const nextRebalanceTimeStamp =
              BigInt(now) + BigInt(REBALANCE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

            const encodedNaturalRebalance1 = await signRebalance(
              tokenFactory.signer,
              defaultRebalanceData
            );

            // trigger a rebalance
            await orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            );

            const balanceOfX = await smartToken1.balanceOf(deployer.address);
            const balanceOfY = await smartToken2.balanceOf(deployer.address);

            // confirm user balances when rebalance has taken place
            assert.equal(balanceOfX.toString(), item.afterRebalance.x);
            assert.equal(balanceOfY.toString(), item.afterRebalance.y);
          });
        });
        it("Should throw an error if natural rebalance is triggered at the wrong time", async function () {
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

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // to a transaction
          await smartToken1.transfer(tester.address, transferAmount);
          const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;

          const nextRebalanceTimeStamp =
            BigInt(now) + BigInt((2 / 3) * REBALANCE_INTERVAL); // set rebalance interval to 2/3 of the actual interval hence the rebalance will be triggered at the wrong time
          await time.setNextBlockTimestamp(nextRebalanceTimeStamp);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          // trigger a rebalance
          await expect(
            orchestrator.rebalance(
              encodedNaturalRebalance1.encodedData,
              encodedNaturalRebalance1.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidNaturalRebalance"
          );
        });
      });

      describe("Natural Rebalance", async function () {
        it("It should revert if a natural rebalance is triggered before the interval time on the smart contract", async function () {
          const { tokenFactory, smartToken1, smartToken2, orchestrator } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;

          const currentRebalanceSequenceNumber =
            await tokenFactory.getRebalanceNumber();

          const nextRebalance = BigInt(now) + BigInt(REBALANCE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebalance);

          const encodedNaturalRebalance1 = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          // trigger a rebalance
          await orchestrator.rebalance(
            encodedNaturalRebalance1.encodedData,
            encodedNaturalRebalance1.signature
          );

          const firstRebalanceSequenceNumber =
            currentRebalanceSequenceNumber.toNumber() + 1;
          await expect(await tokenFactory.getRebalanceNumber()).to.equal(
            firstRebalanceSequenceNumber
          );

          await time.setNextBlockTimestamp(nextRebalance);

          const encodedNaturalRebalance3 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 3,
            }
          );

          // trigger a rebalance with the sequence number of 3 instead of 2
          await expect(
            orchestrator.rebalance(
              encodedNaturalRebalance3.encodedData,
              encodedNaturalRebalance3.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidNaturalRebalance"
          );

          await expect(await tokenFactory.getRebalanceNumber()).to.equal(
            firstRebalanceSequenceNumber
          );
        });
      });

      //rebalance sequences tests
      describe("Rebalance with Sequences", async function () {
        it(`it should rebalance calls in the correct sequence`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          const encodedEarlyRebalance1 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
            }
          );
          // trigger a rebalance
          await orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);

          const encodedEarlyRebalance2 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 2,
              isNaturalRebalance: false,
            }
          );
          await orchestrator.rebalance(
            encodedEarlyRebalance2.encodedData,
            encodedEarlyRebalance2.signature
          );
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(3);
        });

        it(`it should handle out of order rebalance calls`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          const encodedEarlyRebalance1 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
            }
          );
          // trigger a rebalance
          await orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          const encodedEarlyRebalance3 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 3,
              isNaturalRebalance: false,
            }
          );

          await orchestrator.rebalance(
            encodedEarlyRebalance3.encodedData,
            encodedEarlyRebalance3.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);

          const encodedEarlyRebalance2 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 2,
              isNaturalRebalance: false,
            }
          );
          await orchestrator.rebalance(
            encodedEarlyRebalance2.encodedData,
            encodedEarlyRebalance2.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(4);
        });

        it(`it should execute rebalances in the correct order`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          const encodedEarlyRebalance1 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
            }
          );
          // trigger a rebalance
          await orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          const encodedEarlyRebalance2 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 2,
              isNaturalRebalance: false,
            }
          );
          await orchestrator.rebalance(
            encodedEarlyRebalance2.encodedData,
            encodedEarlyRebalance2.signature
          );

          const encodedEarlyRebalance3 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 3,
              isNaturalRebalance: false,
            }
          );

          await orchestrator.rebalance(
            encodedEarlyRebalance3.encodedData,
            encodedEarlyRebalance3.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(4);
        });

        it(`it should handle rebalances with already executed sequence properly`, async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          const encodedEarlyRebalance1 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
            }
          );
          // trigger a rebalance
          await orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          const encodedEarlyRebalance2 = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              sequenceNumber: 2,
              isNaturalRebalance: false,
            }
          );

          await orchestrator.rebalance(
            encodedEarlyRebalance2.encodedData,
            encodedEarlyRebalance2.signature
          );

          await expect(
            orchestrator.rebalance(
              encodedEarlyRebalance1.encodedData,
              encodedEarlyRebalance1.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidSequenceNumber"
          );
        });
      });

      it(`it should revert if rebalance signature is not signed by API wallet`, async function () {
        const {
          tokenFactory,
          deployer,
          underlyingToken,
          smartToken1,
          smartToken2,
          orchestrator,
        } = await loadFixture(deployTokenFixture);

        const depositAmount = ethers.utils.parseEther("1");

        await tokenFactory.initializeSMART(
          smartToken1.address,

          smartToken2.address
        );

        // deposit underlying token
        await underlyingToken.approve(tokenFactory.address, depositAmount);
        await smartToken1.deposit(depositAmount, deployer.address);

        const encodedEarlyRebalance1 = await signRebalance(
          tokenFactory.signer,
          {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          }
        );
        const encodedEarlyRebalance2 = await signRebalance(
          tokenFactory.signer,
          {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          }
        );
        // trigger a rebalance
        await expect(
          orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance2.signature //invalid sig
          )
        ).to.be.revertedWithCustomError(
          tokenFactory,
          "TokenFactory__InvalidSignature"
        );
      });
    })
  : describe.skip;
