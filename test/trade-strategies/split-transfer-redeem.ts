import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  rateLimitsDefault,
  FF_INTERVAL,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

developmentChains.includes(network.name)
  ? describe("Trade Strategies", async function () {
      async function deployTokenFixture() {
        const [
          deployer,
          tester,
          user1,
          user2,
          user3,
          user4,
          user5,
        ] = await ethers.getSigners();
        const rebaseSigner = ethers.Wallet.createRandom();
        const MockERC20TokenWithPermit = await ethers.getContractFactory(
          "MockERC20TokenWithPermit",
          deployer
        );

        const underlyingToken = await MockERC20TokenWithPermit.deploy();
        await underlyingToken.deployed();

        const underlyingFaucetAmount = ethers.utils.parseEther("1000");
        // Transfer underlying tokens to users
        await underlyingToken.transfer(tester.address, underlyingFaucetAmount);
        await underlyingToken.transfer(user1.address, underlyingFaucetAmount);
        await underlyingToken.transfer(user2.address, underlyingFaucetAmount);
        await underlyingToken.transfer(user3.address, underlyingFaucetAmount);
        await underlyingToken.transfer(user4.address, underlyingFaucetAmount);
        await underlyingToken.transfer(user5.address, underlyingFaucetAmount);

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
        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
          deployer.address,
        ]);
        await orchestrator.deployed();

        await tokenFactory.initializeOrchestrator(orchestrator.address);


        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          sanctionsContract,
          orchestrator,
          rebaseSigner,
          user1,
          user2,
          user3,
          user4,
          user5,
        };
      }

      describe("Split-Transfer-Redeem", async function () {
        it("Should split transfer and redeem between test accounts", async function () {
          const {
            smartToken1,
            tokenFactory,
            smartToken2,
            underlyingToken,
            tester,
            user1,
            user2,
            user3,
            user4,
            user5,
          } = await loadFixture(deployTokenFixture);

          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );


          const iter = 10; // You can set this to a higher number to stress test

          const testAccounts = [tester, user1, user2, user3, user4, user5];

          // Stress test
          for (let epoch = 0; epoch < iter; epoch++) {
            const depositAmount = ethers.utils.parseEther("100");

            for (let i = 0; i < testAccounts.length; i++) {
              await underlyingToken.approve(
                tokenFactory.address,
                depositAmount
              );
              await smartToken1.deposit(
                depositAmount,
                testAccounts[i].address
              );

              // const balance = await smartToken1.balanceOf(testAccounts[i].address);
              // expect(balance).to.eq(depositAmount);
            }

            const transferAmount = ethers.utils.parseEther("2");

            // Transfer the transferAmount multiplied by the index to the next account
            for (let i = 0; i < testAccounts.length-1; i++) {
              await smartToken1
                .connect(testAccounts[i])
                .transfer(testAccounts[i + 1].address, transferAmount.mul(i+1));
            }

            // verify balances
            for (let i = 0; i < testAccounts.length-1; i++) {
              expect(await smartToken1.balanceOf(testAccounts[i].address)).to.eq(
                ethers.utils.parseEther("98").add(depositAmount.mul(epoch)).sub(transferAmount.mul(epoch))
              )
            }


          }

          // Redeem some tokens
          for (let i = 0; i < testAccounts.length; i++) {
            const address = testAccounts[i].address;
            const balance = await smartToken1.balanceOf(address);
            await smartToken1.connect(testAccounts[i]).withdraw(
              ethers.utils.parseEther("100"),
              address,
              address
            );
            const newBalance = await smartToken1.balanceOf(address);
            expect(newBalance).to.eq(balance.sub(ethers.utils.parseEther("100")));
          }
        });

      });
    })
  : describe.skip;
