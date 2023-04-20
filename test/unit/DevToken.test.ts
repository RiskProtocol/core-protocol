import { assert, expect } from "chai";
import { ethers, network } from "hardhat"
import { developmentChains, REBASE_INTERVAL, TOKEN1_NAME, TOKEN1_SYMBOL, defaultOperators, TOKEN2_NAME, TOKEN2_SYMBOL, DECIMALS, INITIAL_PRICE } from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { DevToken } from "../../typechain-types";

developmentChains.includes(network.name) ?
    describe("DevToken", async function () {
        async function deployTokenFixture() {
            const [deployer, tester] = await ethers.getSigners();

            const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator', deployer)
            const mockV3Aggregator = await MockV3Aggregator.deploy(DECIMALS, INITIAL_PRICE);
            await mockV3Aggregator.deployed();

            const MockERC20Token = await ethers.getContractFactory('MockERC20Token', deployer)
            const underlyingToken = await MockERC20Token.deploy();
            await underlyingToken.deployed();

            const TokenFactory = await ethers.getContractFactory('TokenFactory', deployer)
            const tokenFactory = await TokenFactory.deploy(underlyingToken.address, mockV3Aggregator.address, REBASE_INTERVAL);
            await tokenFactory.deployed();

            // deploy devtoken 1     
            const DevToken1 = await ethers.getContractFactory("DevToken", deployer);
            const devToken1 = await DevToken1.deploy(TOKEN1_NAME, TOKEN1_SYMBOL, tokenFactory.address, defaultOperators);
            await devToken1.deployed();

            // deploy devtoken 2 
            const DevToken2 = await ethers.getContractFactory("DevToken", deployer);
            const devToken2 = await DevToken2.deploy(TOKEN2_NAME, TOKEN2_SYMBOL, tokenFactory.address, defaultOperators);
            await devToken2.deployed();

            // Fixtures can return anything you consider useful for your tests
            return { devToken1, devToken2, mockV3Aggregator, underlyingToken, tokenFactory, deployer, tester };
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
                const { devToken1, devToken2, deployer } = await loadFixture(deployTokenFixture);
                const amount = ethers.utils.parseEther('1')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await expect(devToken1.burn(amount, bytes)).to.be.revertedWithCustomError(devToken1, 'DevToken__MethodNotAllowed')
                await expect(devToken2.burn(amount, bytes)).to.be.revertedWithCustomError(devToken2, 'DevToken__MethodNotAllowed')
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
                assert.equal(expectedBalance.toString(), await devToken1.balanceOf(deployer.address));
                assert.equal(transferAmount.toString(), await devToken1.balanceOf(tester.address));
            })

            it("should apply pending rebase when a user wants to transfer tokens using send function", async function () {
                const { devToken1, devToken2, deployer, tokenFactory, underlyingToken, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                const transferAmount = ethers.utils.parseEther('1')
                const expectedBalance = ethers.utils.parseEther('5')
                const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);

                // trigger rebase
                await tokenFactory.rebase()

                // confirm that pending rebase was applied
                await expect(devToken1.send(tester.address, transferAmount, bytes)).to.emit(tokenFactory,'RebaseApplied') 
            })
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