import { assert, expect } from "chai";
import { ethers, network } from "hardhat"
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
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

developmentChains.includes(network.name) ?
    describe("DevToken", async function () {
        async function deployTokenFixture() {
            const [deployer, tester] = await ethers.getSigners();

            const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator', deployer)
            const mockV3Aggregator = await MockV3Aggregator.deploy(DECIMALS, INITIAL_PRICE);
            await mockV3Aggregator.deployed();

            const MockERC20Token = await ethers.getContractFactory('MockERC20TokenWithPermit', deployer)
            const underlyingToken = await MockERC20Token.deploy();
            await underlyingToken.deployed();

            // deploy sanctions list mock
            const SanctionsList = await ethers.getContractFactory('MockSanctionContract', deployer)
            const sanctionsContract = await SanctionsList.deploy();
            await sanctionsContract.deployed();

            const TokenFactory = await ethers.getContractFactory('TokenFactory', deployer)
            const tokenFactory = await TokenFactory.deploy(underlyingToken.address, mockV3Aggregator.address, REBASE_INTERVAL, sanctionsContract.address);
            await tokenFactory.deployed();

            // deploy devtoken 1     
            const DevToken1 = await ethers.getContractFactory("DevToken", deployer);
            const devToken1 = await DevToken1.deploy(TOKEN1_NAME, TOKEN1_SYMBOL, tokenFactory.address, defaultOperators, sanctionsContract.address);
            await devToken1.deployed();

            // deploy devtoken 2 
            const DevToken2 = await ethers.getContractFactory("DevToken", deployer);
            const devToken2 = await DevToken2.deploy(TOKEN2_NAME, TOKEN2_SYMBOL, tokenFactory.address, defaultOperators, sanctionsContract.address);
            await devToken2.deployed();

            // Fixtures can return anything you consider useful for your tests
            return { devToken1, devToken2, mockV3Aggregator, underlyingToken, tokenFactory, deployer, tester, sanctionsContract };
        }

        describe("Constructor", async function () {
            it("sets the name of the dev tokens correctly", async function () {
                const { devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                assert.equal(await devToken1.name(), TOKEN1_NAME);
                assert.equal(await devToken2.name(), TOKEN2_NAME);
            })

            it("sets the symbol of the dev tokens correctly", async function () {
                const { devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                assert.equal(await devToken1.symbol(), TOKEN1_SYMBOL);
                assert.equal(await devToken2.symbol(), TOKEN2_SYMBOL);
            })

            it("sets the correct address for the token factory", async function () {
                const { devToken1, devToken2, tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await devToken1.getTokenFactory(), tokenFactory.address);
                assert.equal(await devToken2.getTokenFactory(), tokenFactory.address);
            })
        })

        describe("Burn", async function () {
            it("should not allow users to call the operatorBurn function", async function () {
                const { devToken1, devToken2, deployer } = await loadFixture(deployTokenFixture);
                const amount = ethers.utils.parseEther('1')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await expect(devToken1.operatorBurn(deployer.address, amount, bytes, bytes)).to.be.revertedWithCustomError(devToken1, 'DevToken__MethodNotAllowed')
                await expect(devToken2.operatorBurn(deployer.address, amount, bytes, bytes)).to.be.revertedWithCustomError(devToken2, 'DevToken__MethodNotAllowed')
            })
            
            it("should not allow users to call the burn function", async function () {
                const { devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                const amount = ethers.utils.parseEther('1')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await expect(devToken1.burn(amount, bytes)).to.be.revertedWithCustomError(devToken1, 'DevToken__MethodNotAllowed')
                await expect(devToken2.burn(amount, bytes)).to.be.revertedWithCustomError(devToken2, 'DevToken__MethodNotAllowed')
            })  

            it("should not allow unauthorized users to call the devBurn function", async function () {
                const { devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                const amount = ethers.utils.parseEther('1')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await expect(devToken1.connect(tester).devBurn(tester.address, amount)).to.be.revertedWithCustomError(devToken1, 'DevToken__NotTokenFactory')
                await expect(devToken2.connect(tester).devBurn(tester.address, amount)).to.be.revertedWithCustomError(devToken2, 'DevToken__NotTokenFactory')
            })  
        })

        describe("Send", async function () {
            it("should allow users to transfer tokens using send function", async function () {
                const { devToken1, devToken2, deployer, tokenFactory, underlyingToken, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                const transferAmount = ethers.utils.parseEther('1')
                const expectedBalance = ethers.utils.parseEther('5')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);

                // transfer token using send function
                await devToken1.send(tester.address, transferAmount, bytes);

                // confirm that the transfer was successful
                expect(expectedBalance).to.equal(await devToken1.balanceOf(deployer.address));
                expect(transferAmount).to.equal(await devToken1.balanceOf(tester.address));
            })

            it("should apply pending rebase when a user wants to transfer tokens using send function", async function () {
                const { devToken1, devToken2, deployer, tokenFactory, underlyingToken, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                const transferAmount = ethers.utils.parseEther('1')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);

                // trigger rebase
                await tokenFactory.rebase()

                // confirm that pending rebase was applied
                await expect(devToken1.send(tester.address, transferAmount, bytes)).to.emit(tokenFactory,'RebaseApplied') 
            })

            it("should not allow users to send tokens to addresses in sanctions list", async function () {
              const {
                devToken1,
                devToken2,
                deployer,
                tokenFactory,
                underlyingToken,
                tester,
                sanctionsContract,
              } = await loadFixture(deployTokenFixture);
              const depositAmount = ethers.utils.parseEther("6");
              const transferAmount = ethers.utils.parseEther("1");
              const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

              await tokenFactory.initialize(
                devToken1.address,
                devToken2.address
              );
              await underlyingToken.approve(
                tokenFactory.address,
                depositAmount
              );
              await tokenFactory.deposit(depositAmount, deployer.address);

              // add tester to sanctions list
              await sanctionsContract.setSanction(tester.address, true);
              const sanctioned = await sanctionsContract.isSanctioned(
                tester.address
              );
              expect(sanctioned).to.equal(true);
              // transfer token using send function
              await expect(
                devToken1.send(tester.address, transferAmount, bytes)
              ).to.be.revertedWithCustomError(
                devToken1,
                "BaseContract__SanctionedAddress"
              );

              // remove tester from sanctions list
              await sanctionsContract.setSanction(tester.address, false);
              const notSanctioned = await sanctionsContract.isSanctioned(
                tester.address
              );
              expect(notSanctioned).to.equal(false);
            });

            it("should not allow transfer of tokens to addresses in sanctions list", async function () {
              const {
                tokenFactory,
                deployer,
                underlyingToken,
                devToken1,
                devToken2,
                tester,
                sanctionsContract,
              } = await loadFixture(deployTokenFixture);
              const depositAmount = ethers.utils.parseEther("6");
              await tokenFactory.initialize(
                devToken1.address,
                devToken2.address
              );
              await underlyingToken.approve(
                tokenFactory.address,
                depositAmount
              );
              await tokenFactory.deposit(depositAmount, deployer.address);

              // add tester to sanctions list
              await sanctionsContract.setSanction(tester.address, true);
              const sanctioned = await sanctionsContract.isSanctioned(
                tester.address
              );
              expect(sanctioned).to.equal(true);

              await expect(
                devToken1.transfer(tester.address, depositAmount)
              ).to.be.revertedWithCustomError(
                devToken1,
                "BaseContract__SanctionedAddress"
              );

              // remove tester from sanctions list
              await sanctionsContract.setSanction(tester.address, false);
              const notSanctioned = await sanctionsContract.isSanctioned(
                tester.address
              );
              expect(notSanctioned).to.equal(false);
            });
        })

        describe("Mint", async function () {
            it("should not allow other users to perform mint function except Token Factory", async function () {
                const { devToken1, deployer, tester } = await loadFixture(deployTokenFixture);
                const amount = ethers.utils.parseEther('1')
                await expect(devToken1.connect(tester).mint(deployer.address, amount)).to.be.revertedWithCustomError(devToken1, 'DevToken__NotTokenFactory')
            })              
        })
    })
    : describe.skip