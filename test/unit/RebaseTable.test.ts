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
  encodedNaturalRebase1,
  encodedEarlyRebase1,
  encodedEarlyRebase2,
  encodedEarlyRebase3,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const rebaseTable = [
  {
    depositValue: "10000000000000000000",
    beforeRebase: {
      x: "9000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "10000000000000000000",
    },
    afterRebase: "9666500000000000000",
  },
  {
    depositValue: "5000000000000000000",
    beforeRebase: {
      x: "4000000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "5000000000000000000",
    },
    afterRebase: "4666500000000000000",
  },
  {
    depositValue: "4335000000000000000",
    beforeRebase: {
      x: "3335000000000000000", // we simiulate that one of token X has been traded before rebase
      y: "4335000000000000000",
    },
    afterRebase: "4001500000000000000",
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

            // trigger a rebase
            await tokenFactory.executeRebase(
              encodedNaturalRebase1.encodedData,
              encodedNaturalRebase1.signature
            );

            // confirm user balances when rebase has taken place
            assert.equal(
              await smartToken1.balanceOf(deployer.address),
              item.afterRebase
            );
            assert.equal(
              await smartToken2.balanceOf(deployer.address),
              item.afterRebase
            );
          });
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
            tester,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // trigger a rebase
          await tokenFactory.executeRebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);

          await tokenFactory.executeRebase(
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
            tester,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // trigger a rebase
          await tokenFactory.executeRebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );

          await tokenFactory.executeRebase(
            encodedEarlyRebase3.encodedData,
            encodedEarlyRebase3.signature
          );

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(2);
          await tokenFactory.executeRebase(
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
            tester,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // trigger a rebase
          await tokenFactory.executeRebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );
          await tokenFactory.executeRebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );
          await tokenFactory.executeRebase(
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
            tester,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await smartToken1.deposit(depositAmount, deployer.address);

          // trigger a rebase
          await tokenFactory.executeRebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase1.signature
          );
          await tokenFactory.executeRebase(
            encodedEarlyRebase2.encodedData,
            encodedEarlyRebase2.signature
          );

          await expect(
            tokenFactory.executeRebase(
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
          tester,
        } = await loadFixture(deployTokenFixture);

        const depositAmount = ethers.utils.parseEther("1");

        await tokenFactory.initializeSMART(
          smartToken1.address,

          smartToken2.address
        );

        // deposit underlying token
        await underlyingToken.approve(tokenFactory.address, depositAmount);
        await smartToken1.deposit(depositAmount, deployer.address);

        // trigger a rebase

        await expect(
          tokenFactory.executeRebase(
            encodedEarlyRebase1.encodedData,
            encodedEarlyRebase2.signature //invalid sig
          )
        ).to.be.revertedWith("Invalid Signature");
      });
    })
  : describe.skip;
