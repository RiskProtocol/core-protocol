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
    describe("TokenFactory", async function () {
        async function deployTokenFixture() {
            const [deployer, tester] = await ethers.getSigners();

            const MockV3Aggregator = await ethers.getContractFactory('MockV3Aggregator', deployer)
            const mockV3Aggregator = await MockV3Aggregator.deploy(DECIMALS, INITIAL_PRICE);
            await mockV3Aggregator.deployed();

            const MockERC20Token = await ethers.getContractFactory('MockERC20Token', deployer)
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

            // other instances to mock fake underlying token
            const TokenFactory2 = await ethers.getContractFactory('TokenFactory', tester)
            const tokenFactory2 = await TokenFactory2.deploy('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', mockV3Aggregator.address, REBASE_INTERVAL, sanctionsContract.address);
            await tokenFactory2.deployed();

            // Fixtures can return anything you consider useful for your tests
            return { devToken1, devToken2, mockV3Aggregator, underlyingToken, tokenFactory, deployer, tester, tokenFactory2, sanctionsContract };
        }

        describe("Constructor", async function () {
            it("sets the address of the underlying token correctly", async function () {
                const { tokenFactory, underlyingToken } = await loadFixture(deployTokenFixture);
                const result = await tokenFactory.asset();
                assert.equal(result, underlyingToken.address);
            })

            it("sets the address of the price aggregator correctly", async function () {
                const { tokenFactory, mockV3Aggregator } = await loadFixture(deployTokenFixture);
                const result = await tokenFactory.getPriceFeedAddress();
                assert.equal(result, mockV3Aggregator.address);
            })

            it("sets the rebase interval correctly", async function () {
                const { tokenFactory } = await loadFixture(deployTokenFixture);
                const result = await tokenFactory.getInterval();
                expect(result).to.equal(REBASE_INTERVAL);
            })
        })

        describe("Initialize dev tokens", async function () {
            it("it intializes the dev tokens with the correct adderesses", async function () {
                const { devToken1, devToken2, tokenFactory } = await loadFixture(deployTokenFixture);
                await tokenFactory.initialize(devToken1.address, devToken2.address);
                const devToken1address = await tokenFactory.getDevTokenAddress(0)
                const devToken2address = await tokenFactory.getDevTokenAddress(1)

                assert.equal(devToken1address, devToken1.address);
                assert.equal(devToken2address, devToken2.address);
            })

            it("it should ensure that unauthorized user cannot initialize devtokens", async function () {
                const { devToken1, devToken2, tokenFactory, tester } = await loadFixture(deployTokenFixture);
                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await expect(tokenFactory.connect(tester).initialize(devToken1.address, devToken2.address)).to.be.reverted              
            }) 
        })

        describe("Others", async function () {
            it("it returns the correct decimals for underlying token", async function () {
                const { underlyingToken, tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await tokenFactory.decimals(), await underlyingToken.decimals());
            })

            it("it returns the correct asset", async function () {
                const { underlyingToken, tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await tokenFactory.asset(), underlyingToken.address);
            })

            it("it returns the correct totalAssets in the token factory", async function () {
                const { underlyingToken, tokenFactory } = await loadFixture(deployTokenFixture);
                expect(await tokenFactory.totalAssets()).to.equal(await underlyingToken.balanceOf(tokenFactory.address));                
            })

            it("it returns the correct value for convertToShares function", async function () {
                const { tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await tokenFactory.convertToShares('5'), '5');
            })           

            it("it returns the correct value for convertToAssets function", async function () {
                const { tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await tokenFactory.convertToAssets('5'), '5');
            })           
        })

        describe("Deposit", async function () {
            it("it returns the correct value for maxDeposit function", async function () {
                const { tokenFactory, deployer } = await loadFixture(deployTokenFixture);
                expect(await tokenFactory.maxDeposit(deployer.address)).to.equal(ethers.constants.MaxUint256);
            })

            it("it returns the correct value for previewDeposit function", async function () {
                const { tokenFactory } = await loadFixture(deployTokenFixture);
                expect(await tokenFactory.previewDeposit('5')).to.equal('5');
            })

          it("it should revert when user wants to deposit 0 token", async function () {
            const { tokenFactory, deployer } = await loadFixture(
              deployTokenFixture
            );
            await expect(
              tokenFactory.deposit("0", deployer.address)
            ).to.be.revertedWithCustomError(
              tokenFactory,
              "TokenFactory__ZeroDeposit"
            );
          });

          it("it should allow user to deposit acceptable amount of the underlying token successfully", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");
            await tokenFactory.initialize(devToken1.address, devToken2.address);
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await expect(
              tokenFactory.deposit(depositAmount, deployer.address)
            ).to.emit(tokenFactory, "Deposit");
          });

          it("it should make sure that the user is assigned correct amount of token x and y after deposit", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");
            await tokenFactory.initialize(devToken1.address, devToken2.address);
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            expect(depositAmount).to.equal(
              await devToken1.balanceOf(deployer.address)
            );
            expect(depositAmount).to.equal(
              await devToken2.balanceOf(deployer.address)
            );
          });

          it("it should make sure that the user is debited correct amount of underlying token after making deposit", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");
            const userCurrentBalance = await underlyingToken.balanceOf(
              deployer.address
            );
            const expectedBalance = userCurrentBalance - +depositAmount;

            await tokenFactory.initialize(devToken1.address, devToken2.address);
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            assert.equal(
              await underlyingToken.balanceOf(deployer.address),
              expectedBalance
            );
          });

          it("it should revert if user trying to deposit is on sanction list", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              sanctionsContract,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");
            await tokenFactory.initialize(devToken1.address, devToken2.address);
            await underlyingToken.approve(tokenFactory.address, depositAmount);

            // add user to sanctions list
            await sanctionsContract.setSanction(deployer.address, true);
            const sanctioned = await sanctionsContract.isSanctioned(
              deployer.address
            );
            expect(sanctioned).to.equal(true);
            await expect(
              tokenFactory.deposit(depositAmount, deployer.address)
            ).to.be.revertedWithCustomError(
              tokenFactory,
              "BaseContract__SanctionedAddress"
            );

            // remove user from sanctions list
            await sanctionsContract.setSanction(deployer.address, false);
            const notSanctioned = await sanctionsContract.isSanctioned(
              deployer.address
            );
            expect(notSanctioned).to.equal(false);
          });
        });

        describe("Minting", async function () {
            it("it returns the correct value for maxMint function", async function () {
                const { tokenFactory, deployer } = await loadFixture(deployTokenFixture);
                expect(await tokenFactory.maxMint(deployer.address)).to.equal(ethers.constants.MaxUint256);
            })

          it("it returns the correct value for previewMint function", async function () {
            const { tokenFactory } = await loadFixture(deployTokenFixture);
            assert.equal(await tokenFactory.previewMint("5"), "5");
          });

            it("it should make sure that the user is assigned correct amount of token x and y after minting", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.mint(depositAmount, deployer.address);
                
                expect(depositAmount).to.equal(await devToken1.balanceOf(deployer.address));
                expect(depositAmount).to.equal(await devToken2.balanceOf(deployer.address));            
            })           
        })

        describe("Withdraw", async function () {
          it("it returns the correct value for maxWithdraw function", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");
            await tokenFactory.initialize(devToken1.address, devToken2.address);
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);
            await devToken1.transfer(tester.address, depositAmount);

            expect(await tokenFactory.maxWithdraw(deployer.address)).to.equal(
              await devToken1.balanceOf(deployer.address)
            );
          });

          it("it returns the correct value for previewWithdraw function", async function () {
            const { tokenFactory } = await loadFixture(deployTokenFixture);
            expect(await tokenFactory.previewWithdraw("5")).to.equal("5");
          });

          it("it should revert when user wants to withdraw more than maximum withdrawal amount", async function () {
            const { tokenFactory, deployer, devToken1, devToken2 } =
              await loadFixture(deployTokenFixture);

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            await expect(
              tokenFactory.withdraw(
                ethers.constants.MaxUint256,
                deployer.address,
                deployer.address
              )
            ).to.be.revertedWithCustomError(
              tokenFactory,
              "TokenFactory__WithdrawMoreThanMax"
            );
          });

          it("it should apply pending rebase if a user wants to withdraw", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);
            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            // trigger rebase
            await tokenFactory.rebase();

            await expect(
              tokenFactory.withdraw(
                depositAmount,
                deployer.address,
                deployer.address
              )
            ).to.emit(tokenFactory, "RebaseApplied");
          });

          it("it should confirm that user gets correct amount of underlying token back after withdrawal", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            // get user balance before withdrawal
            const initialBalance = await underlyingToken.balanceOf(
              deployer.address
            );
            const expectedBalance = +initialBalance + +depositAmount;

            // withdraw underlying token
            await tokenFactory.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            );

            assert.equal(
              await underlyingToken.balanceOf(deployer.address),
              expectedBalance
            );
          });

          it("it should confirm that users token x and y are reduced correctly after withdrawal", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            // get user token x and y balance before withdrawal
            const initialBalanceA = await devToken1.balanceOf(deployer.address);
            const initialBalanceB = await devToken2.balanceOf(deployer.address);

            const expectedBalanceA = +initialBalanceA - +depositAmount;
            const expectedBalanceB = +initialBalanceB - +depositAmount;

            // withdraw underlying token
            await tokenFactory.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            );

            assert.equal(
              await devToken1.balanceOf(deployer.address),
              expectedBalanceA
            );
            assert.equal(
              await devToken2.balanceOf(deployer.address),
              expectedBalanceB
            );
          });

          it("it should confirm that user cannot withdraw another persons fund", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              tester,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);

            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            // withdraw underlying token
            await expect(
              tokenFactory.withdraw(
                depositAmount,
                deployer.address,
                tester.address
              )
            ).to.be.revertedWithCustomError(
              tokenFactory,
              "TokenFactory__OnlyAssetOwner"
            );
          });

          it("it should test for nonReentrant in withdraw function", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);
            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);
            await tokenFactory.withdraw(
              depositAmount,
              deployer.address,
              deployer.address
            );
            await expect(
              tokenFactory.withdraw(
                depositAmount,
                deployer.address,
                deployer.address
              )
            ).to.be.reverted;
          });

          it("it not allow users on the sanction list to withdraw", async function () {
            const {
              tokenFactory,
              deployer,
              underlyingToken,
              devToken1,
              devToken2,
              sanctionsContract,
            } = await loadFixture(deployTokenFixture);
            const depositAmount = ethers.utils.parseEther("6");

            await tokenFactory.initialize(devToken1.address, devToken2.address);
            // deposit underlying token
            await underlyingToken.approve(tokenFactory.address, depositAmount);
            await tokenFactory.deposit(depositAmount, deployer.address);

            // add user to sanctions list
            await sanctionsContract.setSanction(deployer.address, true);
            const sanctioned = await sanctionsContract.isSanctioned(
              deployer.address
            );
            expect(sanctioned).to.equal(true);

            await expect(
              tokenFactory.withdraw(
                depositAmount,
                deployer.address,
                deployer.address
              )
            ).to.be.revertedWithCustomError(
              tokenFactory,
              "BaseContract__SanctionedAddress"
            );

            // remove user from sanctions list
            await sanctionsContract.setSanction(deployer.address, false);
            const notSanctioned = await sanctionsContract.isSanctioned(
              deployer.address
            );
            expect(notSanctioned).to.equal(false);
          });
        });

        describe("Redeem", async function () {
            it("it returns the correct value for maxRedeem function", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                await tokenFactory.initialize(devToken1.address, devToken2.address);
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);
                await devToken2.transfer(tester.address, depositAmount);

                expect(await tokenFactory.maxRedeem(deployer.address)).to.equal(await devToken2.balanceOf(deployer.address));
            })

            it("it returns the correct value for previewRedeem function", async function () {
                const { tokenFactory } = await loadFixture(deployTokenFixture);
                assert.equal(await tokenFactory.previewRedeem('5'), '5');
            })

            it("it should revert when user wants to redeem more than maximum withdrawal amount", async function () {
                const { tokenFactory, deployer, devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                
                await tokenFactory.initialize(devToken1.address, devToken2.address);
               
                await expect(tokenFactory.redeem(ethers.constants.MaxUint256, deployer.address, deployer.address)).to.be.revertedWithCustomError(tokenFactory, 'TokenFactory__RedeemMoreThanMax')
            })              
            
            it("it should confirm that user gets correct amount of underlying token back after redemption", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                
                await tokenFactory.initialize(devToken1.address, devToken2.address);

                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);
                
                // get user balance before redemption
                const initialBalance = await underlyingToken.balanceOf(deployer.address);
                const expectedBalance = +initialBalance + +depositAmount;

                // redeem underlying token
                await tokenFactory.redeem(depositAmount, deployer.address, deployer.address)

                assert.equal(await underlyingToken.balanceOf(deployer.address), expectedBalance);           
            })  
            
            it("it should apply pending rebase if a user wants to redeem tokens", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                
                await tokenFactory.initialize(devToken1.address, devToken2.address);
                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address)

                // trigger rebase
                await tokenFactory.rebase();

                await expect(tokenFactory.redeem(depositAmount, deployer.address, deployer.address)).to.emit(tokenFactory,'RebaseApplied')            
            })     

            it("it should confirm that user cannot redeem another persons fund", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                
                await tokenFactory.initialize(devToken1.address, devToken2.address);

                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);
                
                // withdraw underlying token
                await expect(tokenFactory.redeem(depositAmount, deployer.address, tester.address)).to.be.revertedWithCustomError(tokenFactory, 'TokenFactory__OnlyAssetOwner')
            })   

            it("it should test for nonReentrant in redeem function", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2 } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('6')
                const withdrawAmount = ethers.utils.parseEther('1')

                await tokenFactory.initialize(devToken1.address, devToken2.address);
                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address)               
                await tokenFactory.redeem(withdrawAmount, deployer.address, deployer.address);
                await tokenFactory.redeem(withdrawAmount, deployer.address, deployer.address);
                await tokenFactory.redeem(withdrawAmount, deployer.address, deployer.address);
                await expect(tokenFactory.redeem(depositAmount, deployer.address, deployer.address)).to.be.reverted           
            })   
            
        })

        describe("Rebase", async function () {
            it("it cannot be triggered by any one apart from the deployer", async function () {
                const { tokenFactory, tester } = await loadFixture(deployTokenFixture);
                await expect(tokenFactory.connect(tester).rebase()).to.be.reverted
            })

            it("it can be triggered by the deployer", async function () {
                const { tokenFactory, tester } = await loadFixture(deployTokenFixture);
                await expect(tokenFactory.rebase()).to.emit(tokenFactory,'Rebase')
            })

            it("it should confirm that user has correct balances of token x and y after rebase", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('10')
                const transferAmount = ethers.utils.parseEther('1')
                const expectedBalance = '9666500000000000000';
                const expectedBalanceAfterTransfer = '8666500000000000000';

                await tokenFactory.initialize(devToken1.address, devToken2.address);

                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);
                
                // to a transaction
                await devToken1.transfer(tester.address, transferAmount);
                
                // trigger a rebase
                await tokenFactory.rebase()

                // confirm user balances when rebase has taken place   
                assert.equal(await devToken1.balanceOf(deployer.address), expectedBalance);
                assert.equal(await devToken2.balanceOf(deployer.address), expectedBalance);

                // do a transaction to simulate the actual reflection of the rebase on chain
                await devToken1.transfer(tester.address, transferAmount);

                // confirm user balances after rebase has been applied on chain  
                assert.equal(await devToken1.balanceOf(deployer.address), expectedBalanceAfterTransfer);
                assert.equal(await devToken2.balanceOf(deployer.address), expectedBalance);
            })

            it("it should confirm that user has correct balances of token x and y after missing double rebase period", async function () {
                const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                const depositAmount = ethers.utils.parseEther('10')
                const transferAmount = ethers.utils.parseEther('1')
                const expectedBalance = '9333500000000000000';
                const expectedBalanceAfterTransfer = '8333500000000000000';

                await tokenFactory.initialize(devToken1.address, devToken2.address);

                // deposit underlying token
                await underlyingToken.approve(tokenFactory.address, depositAmount);
                await tokenFactory.deposit(depositAmount, deployer.address);
                
                // to a transaction
                await devToken2.transfer(tester.address, transferAmount);
                
                // trigger a rebase
                await tokenFactory.rebase()
                await tokenFactory.rebase()

                // confirm user balances when rebase has taken place   
                assert.equal(await devToken1.balanceOf(deployer.address), expectedBalance);
                assert.equal(await devToken2.balanceOf(deployer.address), expectedBalance);

                // do a transaction to simulate the actual reflection of the rebase on chain
                await devToken1.transfer(tester.address, transferAmount);

                // confirm user balances after rebase has been applied on chain  
                assert.equal(await devToken1.balanceOf(deployer.address), expectedBalanceAfterTransfer);
                assert.equal(await devToken2.balanceOf(deployer.address), expectedBalance);
            })

            it("it should confirm that the receiver of a transfer transaction has correct balances of token x and y after rebase period", async function () {
              const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
              const depositAmount = ethers.utils.parseEther('10')
              const transferAmount = ethers.utils.parseEther('1')
              const expectedBalance = '9333500000000000000';
              const expectedBalanceAfterTransfer = '10333500000000000000';
      
              await tokenFactory.initialize(devToken1.address, devToken2.address);
              
              // give the tester address some underlying asset
              await underlyingToken.transfer(tester.address, depositAmount)
      
              // deposit underlying token for the deployer(has 10 of x and 10 of y)
              await underlyingToken.approve(tokenFactory.address, depositAmount);
              await tokenFactory.deposit(depositAmount, deployer.address);
            
              // deposit underlying token for the tester(has 10 of x and 10 of y)
              await underlyingToken.connect(tester).approve(tokenFactory.address, depositAmount);
              await tokenFactory.connect(tester).deposit(depositAmount, tester.address);
      
              // to a transaction (has 10 of x and 9 of y)
              await devToken2.connect(tester).transfer(deployer.address, transferAmount);       
      
              // trigger a rebase
              await tokenFactory.rebase()
      
              // confirm user balances when rebase has taken place   
              assert.equal(await devToken1.balanceOf(tester.address), expectedBalance);
              assert.equal(await devToken2.balanceOf(tester.address), expectedBalance);
      
              // do a transaction to simulate the actual reflection of the rebase on chain
              // now the tester account which is the receiver of this transaction should have 9.3335 balance after rebase
              // but after getting this transfer he should have in 10.3335 for x and 9.3335 for y
              await devToken1.transfer(tester.address, transferAmount);
          
              // confirm user balances after rebase has been applied on chain  
              assert.equal(await devToken1.balanceOf(tester.address), expectedBalanceAfterTransfer);
              assert.equal(await devToken2.balanceOf(tester.address), expectedBalance);
            })
        })

        describe("Forbidden Functions", async function () {
            it("should not allow users to call ERC20 totalSupply function", async function () {
                const { tokenFactory, tester } = await loadFixture(deployTokenFixture);                  
                await expect(tokenFactory.connect(tester).totalSupply()).to.be.reverted  
            })

            it("should not allow users to call ERC20 balanceOf function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture);                  
                await expect(tokenFactory.connect(tester).balanceOf(deployer.address)).to.be.reverted
            }) 

            it("should not allow users to call ERC20 transfer function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture); 
                const amount = ethers.utils.parseEther('6')                 
                await expect(tokenFactory.connect(tester).transfer(deployer.address, amount)).to.be.reverted
            }) 

            it("should not allow users to call ERC20 allowance function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture);                          
                await expect(tokenFactory.connect(tester).allowance(deployer.address, tester.address)).to.be.reverted
            }) 

            it("should not allow users to call ERC20 approve function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture); 
                const amount = ethers.utils.parseEther('6')                 
                await expect(tokenFactory.connect(tester).approve(deployer.address, amount)).to.be.reverted           
            }) 

            it("should not allow users to call ERC20 transferFrom function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture); 
                const amount = ethers.utils.parseEther('6')                 
                await expect(tokenFactory.connect(tester).transferFrom(deployer.address, tester.address, amount)).to.be.reverted
            }) 
            
            it("should allow only deployer to call ERC20 allowance function", async function () {
                const { tokenFactory, deployer, tester } = await loadFixture(deployTokenFixture);                          
                await expect(tokenFactory.allowance(deployer.address, tester.address)).to.not.be.reverted
            }) 
        })        
    })
    : describe.skip