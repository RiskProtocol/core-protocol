import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  signRebase,
  defaultRebaseData,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const rebaseTable = [
  {
    depositValue: "10000000000000000000",
    beforeRebase: {
      x: "9000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "10000000000000000000",
    },
    afterRebase: {
      x: "9333000000000000000",
      y: "10000000000000000000",
    },
  },
  {
    depositValue: "5000000000000000000",
    beforeRebase: {
      x: "4000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "5000000000000000000",
    },
    afterRebase: {
      x: "4333000000000000000",
      y: "5000000000000000000",
    },
  },
  {
    depositValue: "4335000000000000000",
    beforeRebase: {
      x: "3335000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "4335000000000000000",
    },
    afterRebase: {
      x: "3668000000000000000",
      y: "4335000000000000000",
    },
  },
];

developmentChains.includes(network.name)
  ? describe("RebaseTable", async function () {
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

      describe("Rebase", async function () {
        rebaseTable.forEach((item) => {
          it(`it should have correct balances for X and Y tokens after rebase with initial token balance of X:${item.beforeRebase.x}, Y:${item.beforeRebase.y}`, async function () {
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

            const nextRebaseTimeStamp = BigInt(now) + BigInt(REBASE_INTERVAL);
            await time.setNextBlockTimestamp(nextRebaseTimeStamp);

            const encodedNaturalRebase1 = await signRebase(
              tokenFactory.signer,
              defaultRebaseData
            );

            // trigger a rebase
            await orchestrator.rebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            );

            const balanceOfX = await smartToken1.balanceOf(deployer.address);
            const balanceOfY = await smartToken2.balanceOf(deployer.address);

            // confirm user balances when rebase has taken place
            assert.equal(
              balanceOfX.toString(),
              item.afterRebase.x
            );
            assert.equal(
              balanceOfY.toString(),
              item.afterRebase.y
            );
          });
        });
      });

      describe("Natural Rebase", async function () {
        it("It should revert if a natural rebase is triggered before the interval time on the smart contract", async function () {
          const {
            tokenFactory,
            smartToken1,
            smartToken2,
            orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          const now = await tokenFactory.getLastTimeStamp(); //block.timestamp;

          const currentRebaseSequenceNumber = await tokenFactory.getRebaseNumber();

          const nextRebase = BigInt(now) + BigInt(REBASE_INTERVAL);
          await time.setNextBlockTimestamp(nextRebase);

          const encodedNaturalRebase1 = await signRebase(
            tokenFactory.signer,
            defaultRebaseData
          );

          // trigger a rebase
          await orchestrator.rebase(
            encodedNaturalRebase1.encodedData,
            encodedNaturalRebase1.signature
          );

          const firstRebaseSequenceNumber = currentRebaseSequenceNumber.toNumber() + 1;
          await expect(
            await tokenFactory.getRebaseNumber()
          ).to.equal(firstRebaseSequenceNumber);

          await time.setNextBlockTimestamp(nextRebase);

          const encodedNaturalRebase3 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 3,
            }
          );

          // trigger a rebase with the sequence number of 3 instead of 2
          await expect(
            orchestrator.rebase(
              encodedNaturalRebase3.encodedData,
              encodedNaturalRebase3.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidNaturalRebase"
          );

          await expect(
            await tokenFactory.getRebaseNumber()
          ).to.equal(firstRebaseSequenceNumber);
        });
      });

      //rebase sequences tests
      describe("Rebase with Sequences", async function () {
        it(`it should rebase calls in the correct sequence`, async function () {
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

          const encodedEarlyRebase1 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              isNaturalRebase: false,
            }
          );
          // trigger a rebase
          await orchestrator.rebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);

          const encodedEarlyRebase2 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 2,
              isNaturalRebase: false,
            }
          );
          await orchestrator.rebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(3);
        });

        it(`it should handle out of order rebase calls`, async function () {
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

          const encodedEarlyRebase1 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              isNaturalRebase: false,
            }
          );
          // trigger a rebase
          await orchestrator.rebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );

          const encodedEarlyRebase3 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 3,
              isNaturalRebase: false,
            }
          );

          await orchestrator.rebase(
            encodedEarlyRebase3.encodedData,
            encodedEarlyRebase3.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);

          const encodedEarlyRebase2 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 2,
              isNaturalRebase: false,
            }
          );
          await orchestrator.rebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(4);
        });

        it(`it should execute rebases in the correct order`, async function () {
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

          const encodedEarlyRebase1 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              isNaturalRebase: false,
            }
          );
          // trigger a rebase
          await orchestrator.rebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );

          const encodedEarlyRebase2 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 2,
              isNaturalRebase: false,
            }
          );
          await orchestrator.rebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );

          const encodedEarlyRebase3 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 3,
              isNaturalRebase: false,
            }
          );

          await orchestrator.rebase(
            encodedEarlyRebase3.encodedData,
            encodedEarlyRebase3.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(4);
        });

        it(`it should handle rebases with already executed sequence properly`, async function () {
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

          const encodedEarlyRebase1 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              isNaturalRebase: false,
            }
          );
          // trigger a rebase
          await orchestrator.rebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );

          const encodedEarlyRebase2 = await signRebase(
            tokenFactory.signer,
            {
              ...defaultRebaseData,
              sequenceNumber: 2,
              isNaturalRebase: false,
            }
          );

          await orchestrator.rebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );

          await expect(
            orchestrator.rebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__InvalidSequenceNumber"
          );
        });
      });

      it(`it should revert if rebase signature is not signed by API wallet`, async function () {
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

        const encodedEarlyRebase1 = await signRebase(
          tokenFactory.signer,
          {
            ...defaultRebaseData,
            isNaturalRebase: false,
          }
        );
        const encodedEarlyRebase2 = await signRebase(
          tokenFactory.signer,
          {
            ...defaultRebaseData,
            sequenceNumber: 2,
            isNaturalRebase: false,
          }
        );
        // trigger a rebase
        await expect(
          orchestrator.rebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase2.signature //invalid sig
          )
        ).to.be.revertedWithCustomError(
          tokenFactory,
          "TokenFactory__InvalidSignature"
        );
      });
    })
  : describe.skip;
