import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBASE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  signersAddress,
  encodedEarlyRebase1,
  encodedEarlyRebase2,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

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
          REBASE_INTERVAL,
          sanctionsContract.address,
          signersAddress,
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
        ]);
        await SmartToken2.deployed();

        //deploy orchestrator

        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const Orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
        ]);
        await Orchestrator.deployed();

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
        };
      }

      describe("Orchestrator Tests", async function () {
        it(`it should allow OWNER upgrade to newer implementations while state should be unchanged`, async function () {
          let {
            tokenFactory,
            deployer,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          const newOrchestrator = await ethers.getContractFactory(
            "Orchestrator",
            deployer
          );
          Orchestrator = await upgrades.upgradeProxy(
            Orchestrator.address,
            newOrchestrator
          );
          expect(await Orchestrator.tokenFactory()).to.equal(
            tokenFactory.address
          );
          expect(await Orchestrator.owner()).to.equal(deployer.address);
        });
        it(`it not allow non owners to upgrade`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2, tester, Orchestrator } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          const newOrchestrator = await ethers.getContractFactory(
            "Orchestrator",
            tester
          );

          await expect(
            upgrades.upgradeProxy(Orchestrator.address, newOrchestrator)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it(`it should add a transaction properly`, async function () {
          let {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          //add a deposit transaction on the smart token
          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = SmartToken1.interface.encodeFunctionData("deposit", [
            ethers.utils.parseEther("1"),
            deployer.address,
          ]);
          await expect(Orchestrator.addTransaction(SmartToken1.address, data))
            .to.emit(Orchestrator, "TransactionAdded")
            .withArgs(true, SmartToken1.address, data);
          expect(await Orchestrator.transactionsSize()).to.equal(1);
        });

        it(`it should remove a transaction properly`, async function () {
          let {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          const data = SmartToken1.interface.encodeFunctionData("deposit", [
            ethers.utils.parseEther("1"),
            deployer.address,
          ]);
          await Orchestrator.addTransaction(SmartToken1.address, data);
          await expect(Orchestrator.removeTransaction(0))
            .to.emit(Orchestrator, "TransactionRemoved")
            .withArgs(0);
          expect(await Orchestrator.transactionsSize()).to.equal(0);
        });

        it(`should revert if index is out of bounds`, async function () {
          let { Orchestrator } = await loadFixture(deployTokenFixture);
          await expect(Orchestrator.removeTransaction(0)).to.be.revertedWith(
            "index out of bounds"
          );
        });
        it(`it should test setTransactionEnabled`, async function () {
          let { deployer, SmartToken1, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = SmartToken1.interface.encodeFunctionData("deposit", [
            ethers.utils.parseEther("1"),
            deployer.address,
          ]);
          await Orchestrator.addTransaction(SmartToken1.address, data);
          await expect(Orchestrator.setTransactionEnabled(0, false))
            .to.emit(Orchestrator, "TransactionStatusChanged")
            .withArgs(0, false);
          const transaction = await Orchestrator.transactions(0);
          expect(transaction.enabled).to.equal(false);
        });
        it(`should revert if index is out of bounds`, async function () {
          let { Orchestrator } = await loadFixture(deployTokenFixture);

          await expect(
            Orchestrator.setTransactionEnabled(0, false)
          ).to.be.revertedWith("index must be in range of stored tx list");
        });
        it(`it should rebase properly`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2, Orchestrator } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          //rebase
          await expect(
            Orchestrator.rebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.emit(tokenFactory, "Rebase");
        });
        it(`it should rebase + execute the added transaction(another rebase)`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          //add a deposit transaction on the smart token
          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase2.signature]
          );
          await expect(Orchestrator.addTransaction(tokenFactory.address, data))
            .to.emit(Orchestrator, "TransactionAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.transactionsSize()).to.equal(1);

          //rebase
          await expect(
            Orchestrator.rebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.emit(tokenFactory, "Rebase");
          expect(await tokenFactory.getScallingFactorLength()).to.equal(2);
        });
        it(`it should revert everything if added tx fails`, async function () {
          let {
            tokenFactory,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          //add a deposit transaction on the smart token
          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase1.signature]
          );
          await expect(Orchestrator.addTransaction(tokenFactory.address, data))
            .to.emit(Orchestrator, "TransactionAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.transactionsSize()).to.equal(1);

          //rebase
          await expect(
            Orchestrator.rebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.revertedWith("Transaction Failed");
          expect(await tokenFactory.getScallingFactorLength()).to.equal(0);
        });
        it(`should be access controlled`, async function () {
          let { tokenFactory, tester, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase1.encodedData, encodedEarlyRebase1.signature]
          );
          await expect(
            Orchestrator.connect(tester).addTransaction(
              tokenFactory.address,
              data
            )
          ).to.revertedWith("Ownable: caller is not the owner");

          await expect(Orchestrator.addTransaction(tokenFactory.address, data))
            .to.emit(Orchestrator, "TransactionAdded")
            .withArgs(true, tokenFactory.address, data);

          await expect(
            Orchestrator.connect(tester).removeTransaction(0)
          ).to.be.revertedWith("Ownable: caller is not the owner");

          await expect(
            Orchestrator.connect(tester).setTransactionEnabled(0, false)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    })
  : describe.skip;
