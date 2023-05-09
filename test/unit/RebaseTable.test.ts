import { assert } from "chai";
import { ethers, network } from "hardhat"
import { developmentChains, REBASE_INTERVAL, TOKEN1_NAME, TOKEN1_SYMBOL, defaultOperators, TOKEN2_NAME, TOKEN2_SYMBOL, CHAINLINK_TOKEN_ADDRESS, CHAINLINK_ORACLE_ADDRESS, CHAINLINK_UINT_JOB_ID, LINK_FEE, CURRENT_TIMESTAMP, EXTERNAL_API_URL, CHAINLINK_BYTES_JOB_ID } from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const rebaseTable = [
    {   
        depositValue: '10000000000000000000',
        beforeRebase: {
            x: '9000000000000000000', // we simiulate that one of token X has been traded before rebase
            y: '10000000000000000000'
        },
        afterRebase: '9666500000000000000'
    },
    {   
        depositValue: '5000000000000000000',
        beforeRebase: {
            x: '4000000000000000000', // we simiulate that one of token X has been traded before rebase
            y: '5000000000000000000'
        },
        afterRebase: '4666500000000000000'
    },
    {   
        depositValue: '4335000000000000000',
        beforeRebase: {
            x: '3335000000000000000', // we simiulate that one of token X has been traded before rebase
            y: '4335000000000000000'
        },
        afterRebase: '4001500000000000000'
    }      
]

developmentChains.includes(network.name) ?
    describe("RebaseTable", async function () {
        async function deployTokenFixture() {
            const [deployer, tester] = await ethers.getSigners();

            const MockERC20Token = await ethers.getContractFactory('MockERC20Token', deployer)
            const underlyingToken = await MockERC20Token.deploy();
            await underlyingToken.deployed();

            const TokenFactory = await ethers.getContractFactory('TokenFactory', deployer)
            const tokenFactory = await TokenFactory.deploy(underlyingToken.address, EXTERNAL_API_URL, REBASE_INTERVAL, CHAINLINK_TOKEN_ADDRESS, CHAINLINK_ORACLE_ADDRESS, CHAINLINK_UINT_JOB_ID,CHAINLINK_BYTES_JOB_ID, LINK_FEE, CURRENT_TIMESTAMP);
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
            return { devToken1, devToken2, EXTERNAL_API_URL, underlyingToken, tokenFactory, deployer, tester };
        }

        describe("Rebase", async function () {
            rebaseTable.forEach((item)=>{
                it(`it should have correct balances for X and Y tokens after rebase with initial token balance of X:${item.beforeRebase.x}, Y:${item.beforeRebase.y}`, async function () {
                    const { tokenFactory, deployer, underlyingToken, devToken1, devToken2, tester } = await loadFixture(deployTokenFixture);
                    const depositAmount = item.depositValue
                    const transferAmount = ethers.utils.parseEther('1')
                                           
                    await tokenFactory.initialize(devToken1.address, devToken2.address);
    
                    // deposit underlying token
                    await underlyingToken.approve(tokenFactory.address, depositAmount);
                    await tokenFactory.deposit(depositAmount, deployer.address);
    
                    // to a transaction
                    await devToken1.transfer(tester.address, transferAmount);
                    const sig = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
                    // trigger a rebase
                    await tokenFactory.rebaseManualTrigger(200000000,66700000,20000000000000, sig)
    
                    // confirm user balances when rebase has taken place                   
                    assert.equal(await devToken1.balanceOf(deployer.address), item.afterRebase);
                    assert.equal(await devToken2.balanceOf(deployer.address), item.afterRebase);  
                })
            })            
        })
    })
    : describe.skip