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
  encodedEarlyRebase3,
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

        //initialize the orchestrator
        await tokenFactory.initializeOrchestrator(Orchestrator.address);

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
          expect(await Orchestrator.getTokenFactory()).to.equal(
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

        it(`it should add a Operation properly`, async function () {
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

          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = SmartToken1.interface.encodeFunctionData("deposit", [
            ethers.utils.parseEther("1"),
            deployer.address,
          ]);
          await expect(Orchestrator.addOperation(0, SmartToken1.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, SmartToken1.address, data);
          expect(await Orchestrator.operationsSize()).to.equal(1);
        });

        it(`it should remove a Operation properly`, async function () {
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
          await Orchestrator.addOperation(0, SmartToken1.address, data);
          await expect(Orchestrator.removeOperation(0))
            .to.emit(Orchestrator, "OperationRemoved")
            .withArgs(0);
          expect(await Orchestrator.operationsSize()).to.equal(0);
        });

        it(`should revert if index is out of bounds`, async function () {
          let { Orchestrator, deployer, SmartToken1 } = await loadFixture(
            deployTokenFixture
          );
          await expect(
            Orchestrator.removeOperation(0)
          ).to.be.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_Index_Out_Bounds"
          );

          await expect(
            Orchestrator.addOperation(
              10,
              ethers.constants.AddressZero,
              SmartToken1.interface.encodeFunctionData("deposit", [
                ethers.utils.parseEther("1"),
                deployer.address,
              ])
            )
          ).to.be.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_Index_Out_Bounds"
          );
        });
        it(`should revert if rebase is executed on token factory directly`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2 } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );
          await expect(
            tokenFactory.executeRebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.be.revertedWithCustomError(
            tokenFactory,
            "TokenFactory__MethodNotAllowed"
          );
        });
        it(`it should test setOperationEnabled`, async function () {
          let { deployer, SmartToken1, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = SmartToken1.interface.encodeFunctionData("deposit", [
            ethers.utils.parseEther("1"),
            deployer.address,
          ]);
          await Orchestrator.addOperation(0, SmartToken1.address, data);
          await expect(
            Orchestrator.setOperationEnabled(
              0,
              ethers.constants.AddressZero,
              false
            )
          ).to.be.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_Wrong_Dest_Addr"
          );
          await expect(
            Orchestrator.setOperationEnabled(0, SmartToken1.address, false)
          )
            .to.emit(Orchestrator, "OperationStatusChanged")
            .withArgs(0, false);
          const ops = await Orchestrator.operations(0);
          expect(ops.enabled).to.equal(false);
        });
        it(`should revert if index is out of bounds`, async function () {
          let { Orchestrator } = await loadFixture(deployTokenFixture);

          await expect(
            Orchestrator.setOperationEnabled(
              0,
              ethers.constants.AddressZero,
              false
            )
          ).to.be.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_Index_Out_Bounds"
          );
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
        it(`it should rebase + execute the added Operation(another rebase)`, async function () {
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

          //add a deposit ops on the smart token
          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase2.signature]
          );
          await expect(Orchestrator.addOperation(0, tokenFactory.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.operationsSize()).to.equal(1);

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

          //add a deposit ops on the smart token
          await underlyingToken.approve(
            tokenFactory.address,
            ethers.utils.parseEther("1")
          );
          //await SmartToken1.deposit(ethers.utils.parseEther('1'), tokenFactory.address);

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase1.signature]
          );
          await expect(Orchestrator.addOperation(0, tokenFactory.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.operationsSize()).to.equal(1);

          //rebase
          await expect(
            Orchestrator.rebase(
              encodedEarlyRebase1.encodedData,
              encodedEarlyRebase1.signature
            )
          ).to.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_FailedOperation"
          );
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
            Orchestrator.connect(tester).addOperation(
              0,
              tokenFactory.address,
              data
            )
          ).to.revertedWith("Ownable: caller is not the owner");

          await expect(Orchestrator.addOperation(0, tokenFactory.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, tokenFactory.address, data);

          await expect(
            Orchestrator.connect(tester).removeOperation(0)
          ).to.be.revertedWith("Ownable: caller is not the owner");

          await expect(
            Orchestrator.connect(tester).setOperationEnabled(
              0,
              ethers.constants.AddressZero,
              false
            )
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should add a operations to list", async function () {
          let { tokenFactory, tester, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase1.encodedData, encodedEarlyRebase1.signature]
          );
          const destination = ethers.constants.AddressZero;

          await Orchestrator.addOperation(0, destination, data);

          const operation = await Orchestrator.operations(0);
          expect(operation.enabled).to.be.true;
          expect(operation.destination).to.equal(destination);
          expect(operation.data).to.equal(data);

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase2.signature]
          );
          const destination2 = ethers.constants.AddressZero;

          await Orchestrator.addOperation(1, destination, data2);

          const operation2 = await Orchestrator.operations(1);
          expect(operation2.enabled).to.be.true;
          expect(operation2.destination).to.equal(destination2);
          expect(operation2.data).to.equal(data2);

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase3.encodedData, encodedEarlyRebase3.signature]
          );
          const destination3 = tokenFactory.address;

          await Orchestrator.addOperation(2, destination3, data3);

          const operation3 = await Orchestrator.operations(2);
          expect(operation3.enabled).to.be.true;
          expect(operation3.destination).to.equal(destination3);
          expect(operation3.data).to.equal(data3);
        });

        it("should add a new operation at index 1", async function () {
          let { tokenFactory, tester, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase1.encodedData, encodedEarlyRebase1.signature]
          );
          const destination = ethers.constants.AddressZero;
          await Orchestrator.addOperation(0, destination, data);

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase2.signature]
          );
          const destination2 = ethers.constants.AddressZero;
          await Orchestrator.addOperation(1, destination2, data2);

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase3.encodedData, encodedEarlyRebase3.signature]
          );
          const destination3 = tokenFactory.address;
          await Orchestrator.addOperation(2, destination3, data3);

          // add new operation at index 1
          const dataNewOPs = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase3.encodedData, encodedEarlyRebase3.signature]
          );
          const destinationNewOPs = ethers.constants.AddressZero;
          await Orchestrator.addOperation(1, destinationNewOPs, dataNewOPs);

          const newOperation = await Orchestrator.operations(1);
          expect(newOperation.enabled).to.be.true;
          expect(newOperation.destination).to.equal(destinationNewOPs);
          expect(newOperation.data).to.equal(dataNewOPs);

          //operation which was at index 1 should be at index 2 now

          const operation2 = await Orchestrator.operations(2);
          expect(operation2.enabled).to.be.true;
          expect(operation2.destination).to.equal(destination2);
          expect(operation2.data).to.equal(data2);

          const operation3 = await Orchestrator.operations(3);
          expect(operation3.enabled).to.be.true;
          expect(operation3.destination).to.equal(destination3);
          expect(operation3.data).to.equal(data3);
        });
        it("should  remove an operation(s) from the middle", async function () {
          let { tokenFactory, tester, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase1.encodedData, encodedEarlyRebase1.signature]
          );
          const destination = ethers.constants.AddressZero;
          await Orchestrator.addOperation(0, destination, data);

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase2.encodedData, encodedEarlyRebase2.signature]
          );
          const destination2 = ethers.constants.AddressZero;
          await Orchestrator.addOperation(1, destination2, data2);

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebase",
            [encodedEarlyRebase3.encodedData, encodedEarlyRebase3.signature]
          );
          const destination3 = tokenFactory.address;
          await Orchestrator.addOperation(2, destination3, data3);

          await Orchestrator.removeOperation(1);
          //operation 2 should be at index 1 now
          const newOperation = await Orchestrator.operations(1);
          expect(newOperation.enabled).to.be.true;
          expect(newOperation.destination).to.equal(destination3);
          expect(newOperation.data).to.equal(data3);

          await Orchestrator.removeOperation(1);

          await expect(Orchestrator.operations(1)).to.be.revertedWithoutReason;

          //expect operation at index 0 to remain unchanged
          const Operation = await Orchestrator.operations(0);
          expect(Operation.enabled).to.be.true;
          expect(Operation.destination).to.equal(destination);
          expect(Operation.data).to.equal(data);
        });
      });
    })
  : describe.skip;
