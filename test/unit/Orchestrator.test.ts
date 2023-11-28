import { expect } from "chai";
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
  SmartTokenXValue,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

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
          REBALANCE_INTERVAL,
          sanctionsContract.address,
          deployer.address,
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
          true,
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
          false,
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

        //deploy mock balancer pools
        const balancerPoolFactory = await ethers.getContractFactory(
          "MockElasticSupplyPool",
          deployer
        );
        const balancerPool1 = await balancerPoolFactory.deploy();
        await balancerPool1.deployed();

        const balancerPool2 = await balancerPoolFactory.deploy();
        await balancerPool2.deployed();

        const balancerPool3 = await balancerPoolFactory.deploy();
        await balancerPool3.deployed();

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
          balancerPool1,
          balancerPool2,
          balancerPool3,
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
        it(`should revert if rebalance is executed on token factory directly`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2 } = await loadFixture(
            deployTokenFixture
          );
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          const { signature, encodedData } = await signRebalance(
            tokenFactory.signer,
            defaultRebalanceData
          );

          await expect(
            tokenFactory.executeRebalance(encodedData, signature)
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
        it(`it should rebalance properly`, async function () {
          let { tokenFactory, SmartToken1, SmartToken2, Orchestrator } =
            await loadFixture(deployTokenFixture);
          await tokenFactory.initializeSMART(
            SmartToken1.address,
            SmartToken2.address
          );

          const { signature, encodedData } = await signRebalance(
            tokenFactory.signer,
            {
              ...defaultRebalanceData,
              isNaturalRebalance: false,
            }
          );

          //rebalance
          await expect(Orchestrator.rebalance(encodedData, signature)).to.emit(
            tokenFactory,
            "Rebalance"
          );
        });
        it(`it should rebalance + execute the added Operation(another rebalance)`, async function () {
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

          const encodedEarlyRebalance2 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance2.encodedData, encodedEarlyRebalance2.signature]
          );
          await expect(Orchestrator.addOperation(0, tokenFactory.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.operationsSize()).to.equal(1);

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          //rebalance
          await expect(
            Orchestrator.rebalance(
              encodedEarlyRebalance1.encodedData,
              encodedEarlyRebalance1.signature
            )
          ).to.emit(tokenFactory, "Rebalance");

          await tokenFactory.getScheduledRebalances(1);

          expect(await tokenFactory.getRebalanceNumber()).to.equal(2);
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

          const encodedEarlyRebalance2 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance2.encodedData, encodedEarlyRebalance1.signature]
          );
          await expect(Orchestrator.addOperation(0, tokenFactory.address, data))
            .to.emit(Orchestrator, "OperationAdded")
            .withArgs(true, tokenFactory.address, data);
          expect(await Orchestrator.operationsSize()).to.equal(1);

          //rebalance
          await expect(
            Orchestrator.rebalance(
              encodedEarlyRebalance1.encodedData,
              encodedEarlyRebalance1.signature
            )
          ).to.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_FailedOperation"
          );
          expect(await tokenFactory.getRebalanceNumber()).to.equal(0);
        });
        it(`should be access controlled`, async function () {
          let { tokenFactory, tester, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance1.encodedData, encodedEarlyRebalance1.signature]
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
          let { tokenFactory, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance1.encodedData, encodedEarlyRebalance1.signature]
          );
          const destination = ethers.constants.AddressZero;

          await Orchestrator.addOperation(0, destination, data);

          const operation = await Orchestrator.operations(0);
          expect(operation.enabled).to.be.true;
          expect(operation.destination).to.equal(destination);
          expect(operation.data).to.equal(data);

          const encodedEarlyRebalance2 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance2.encodedData, encodedEarlyRebalance2.signature]
          );
          const destination2 = ethers.constants.AddressZero;

          await Orchestrator.addOperation(1, destination, data2);

          const operation2 = await Orchestrator.operations(1);
          expect(operation2.enabled).to.be.true;
          expect(operation2.destination).to.equal(destination2);
          expect(operation2.data).to.equal(data2);

          const encodedEarlyRebalance3 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance3.encodedData, encodedEarlyRebalance3.signature]
          );
          const destination3 = tokenFactory.address;

          await Orchestrator.addOperation(2, destination3, data3);

          const operation3 = await Orchestrator.operations(2);
          expect(operation3.enabled).to.be.true;
          expect(operation3.destination).to.equal(destination3);
          expect(operation3.data).to.equal(data3);
        });

        it("should add a new operation at index 1", async function () {
          let { tokenFactory, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance1.encodedData, encodedEarlyRebalance1.signature]
          );
          const destination = ethers.constants.AddressZero;
          await Orchestrator.addOperation(0, destination, data);

          const encodedEarlyRebalance2 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance2.encodedData, encodedEarlyRebalance2.signature]
          );
          const destination2 = ethers.constants.AddressZero;
          await Orchestrator.addOperation(1, destination2, data2);

          const encodedEarlyRebalance3 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance3.encodedData, encodedEarlyRebalance3.signature]
          );
          const destination3 = tokenFactory.address;
          await Orchestrator.addOperation(2, destination3, data3);

          // add new operation at index 1
          const dataNewOPs = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance3.encodedData, encodedEarlyRebalance3.signature]
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
          let { tokenFactory, Orchestrator } = await loadFixture(
            deployTokenFixture
          );

          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });

          const data = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance1.encodedData, encodedEarlyRebalance1.signature]
          );
          const destination = ethers.constants.AddressZero;
          await Orchestrator.addOperation(0, destination, data);

          const encodedEarlyRebalance2 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data2 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance2.encodedData, encodedEarlyRebalance2.signature]
          );
          const destination2 = ethers.constants.AddressZero;
          await Orchestrator.addOperation(1, destination2, data2);

          const encodedEarlyRebalance3 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 2,
            isNaturalRebalance: false,
          });

          const data3 = tokenFactory.interface.encodeFunctionData(
            "executeRebalance",
            [encodedEarlyRebalance3.encodedData, encodedEarlyRebalance3.signature]
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

        it("It should call executeScheduledRebalances to execute all the rebalances left in the queue", async function () {
          const {
            tokenFactory,
            deployer,
            underlyingToken,
            SmartToken1,
            SmartToken2,
            Orchestrator,
          } = await loadFixture(deployTokenFixture);

          const depositAmount = ethers.utils.parseEther("1");

          await tokenFactory.initializeSMART(
            SmartToken1.address,

            SmartToken2.address
          );

          // deposit underlying token
          await underlyingToken.approve(tokenFactory.address, depositAmount);
          await SmartToken1.deposit(depositAmount, deployer.address);

          // Queue up to 10 rebalances missing rebalance with sequence number 1
          for (let i = 1; i < 10; i++) {
            const encodedEarlyRebalance = await signRebalance(tokenFactory.signer, {
              ...defaultRebalanceData,
              sequenceNumber: i + 1,
              isNaturalRebalance: false,
            });
            await Orchestrator.rebalance(
              encodedEarlyRebalance.encodedData,
              encodedEarlyRebalance.signature
            );
          }

          expect(await tokenFactory.getNextSequenceNumber()).to.equal(1);

          const emptyRebalance1 = await tokenFactory.getScheduledRebalances(1);
          const rebalance2 = await tokenFactory.getScheduledRebalances(2);
          const rebalance9 = await tokenFactory.getScheduledRebalances(9);

          expect(emptyRebalance1.sequenceNumber).to.equal(0);
          expect(rebalance2.sequenceNumber).to.equal(2);
          expect(rebalance9.sequenceNumber).to.equal(9);

          // trigger rebalance with sequence number 1

          const encodedEarlyRebalance = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            isNaturalRebalance: false,
          });
          await Orchestrator.rebalance(
            encodedEarlyRebalance.encodedData,
            encodedEarlyRebalance.signature
          );

          // adding sequence number 1 rebalance executes 5 rebalances
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(6);

          const rebalance7 = await tokenFactory.getScheduledRebalances(7);

          // check that rebalance 7 is still in the queue
          expect(rebalance7.sequenceNumber).to.equal(7);

          // call executeScheduledRebalances to execute all the rebalances left in the queue

          await Orchestrator.executeScheduledRebalances();

          // executeScheduledRebalances should execute the remaining 5 rebalances as part of a batch of 5
          expect(await tokenFactory.getNextSequenceNumber()).to.equal(11);
        });
        it("should add a new balancer pool", async function () {
          const { Orchestrator } = await loadFixture(deployTokenFixture);
          const poolAddress = ethers.Wallet.createRandom().address;
          await Orchestrator.addBalancerPool(0, poolAddress);
          expect(await Orchestrator.balancerPools(0)).to.equal(poolAddress);
        });
        it("should not add a duplicate Balancer pool", async function () {
          const { Orchestrator } = await loadFixture(deployTokenFixture);
          const poolAddress = ethers.Wallet.createRandom().address;
          await Orchestrator.addBalancerPool(0, poolAddress);
          await expect(
            Orchestrator.addBalancerPool(1, poolAddress)
          ).to.be.revertedWith("Pool already added");
        });
        it("should add a new balancer pool according to their indexes", async function () {
          const { Orchestrator } = await loadFixture(deployTokenFixture);
          const poolAddress = ethers.Wallet.createRandom().address;
          await Orchestrator.addBalancerPool(0, poolAddress);
          expect(await Orchestrator.balancerPools(0)).to.equal(poolAddress);

          await Orchestrator.addBalancerPool(1, ethers.constants.AddressZero);
          expect(await Orchestrator.balancerPools(1)).to.equal(
            ethers.constants.AddressZero
          );

          const thirdAdd = ethers.Wallet.createRandom(["15661"]);
          await Orchestrator.addBalancerPool(0, thirdAdd.address);
          expect(await Orchestrator.balancerPools(0)).to.equal(
            thirdAdd.address
          );
          expect(await Orchestrator.balancerPools(1)).to.equal(poolAddress);
        });
        it("should remove a Balancer pool", async function () {
          const { Orchestrator } = await loadFixture(deployTokenFixture);
          const poolAddress = ethers.Wallet.createRandom().address;
          await Orchestrator.addBalancerPool(0, poolAddress);
          await Orchestrator.removeBalancerPool(0);
          expect(await Orchestrator.balancerPools.length).equals(0);
        });
        it("should revert when trying to remove a non-existent pool", async function () {
          const { Orchestrator } = await loadFixture(deployTokenFixture);
          await expect(
            Orchestrator.removeBalancerPool(0)
          ).to.be.revertedWithCustomError(
            Orchestrator,
            "Orchestrator_Index_Out_Bounds"
          );
        });

        it("should resync weight in a balancer pool (Mock)", async function () {
          const { Orchestrator, balancerPool1, tokenFactory } =
            await loadFixture(deployTokenFixture);
          await Orchestrator.addBalancerPool(0, balancerPool1.address);

          //rebalance and resync
          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 1,
            isNaturalRebalance: false,
          });

          const tx = await Orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          const receipt = await tx.wait();
          const event = receipt.events?.find(
            (e: any) => e.event === "BalancerResynced"
          );
          expect(event).to.not.be.undefined;
          expect(event?.args?.data).to.equal(balancerPool1.address);
        });
        it("should resync weight in multiple balancer pool (Mock)", async function () {
          const {
            Orchestrator,
            balancerPool1,
            balancerPool2,
            balancerPool3,
            tokenFactory,
          } = await loadFixture(deployTokenFixture);
          await Orchestrator.addBalancerPool(0, balancerPool1.address);
          await Orchestrator.addBalancerPool(1, balancerPool2.address);
          await Orchestrator.addBalancerPool(2, balancerPool3.address);
          const mockPools = [
            balancerPool1.address,
            balancerPool2.address,
            balancerPool3.address,
          ];
          //rebalance and resync
          const encodedEarlyRebalance1 = await signRebalance(tokenFactory.signer, {
            ...defaultRebalanceData,
            sequenceNumber: 1,
            isNaturalRebalance: false,
          });

          const tx = await Orchestrator.rebalance(
            encodedEarlyRebalance1.encodedData,
            encodedEarlyRebalance1.signature
          );

          const receipt = await tx.wait();

          const resyncEvents = receipt.events?.filter(
            (e: any) => e.event === "BalancerResynced"
          );

          expect(resyncEvents).to.have.lengthOf(mockPools.length);

          for (let i = 0; i < mockPools.length; i++) {
            expect(resyncEvents[i].args.data).to.equal(mockPools[i]);
          }
        });
      });
    })
  : describe.skip;
