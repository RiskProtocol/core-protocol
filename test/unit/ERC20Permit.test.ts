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
import { PERMIT_TYPEHASH, getPermitDigest, getDomainSeparator, sign } from '../../utils/signatures'
import "dotenv/config";

developmentChains.includes(network.name) ?
    describe("ERC20Permit", async function () {
        async function deployTokenFixture() {
            const chainId = 31337
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

            // Fixtures can return anything you consider useful for your tests
            return { devToken1, devToken2, mockV3Aggregator, underlyingToken, tokenFactory, deployer, tester, chainId };
        }

        describe("ERC20Permit", async function () {
            it('initializes DOMAIN_SEPARATOR and PERMIT_TYPEHASH correctly', async () => {
                const { devToken1, chainId } = await loadFixture(deployTokenFixture);

                assert.equal(await devToken1._PERMIT_TYPEHASH(), PERMIT_TYPEHASH)
                assert.equal(await devToken1.DOMAIN_SEPARATOR(), getDomainSeparator(await devToken1.name(), devToken1.address, chainId))
            })

            it('permits and emits Approval (replay safe)', async () => {
                const { devToken1, chainId, deployer, tester } = await loadFixture(deployTokenFixture);
                // Create the approval request
                const approve = {
                  owner: deployer.address,
                  spender: tester.address,
                  value: 100,
                }
            
                // deadline as much as you want in the future
                const deadline = 100000000000000

                 // deadline as much as you want in the future
                 const invalidDeadline = 0
            
                // Get the user's nonce
                const nonce = await devToken1.nonces(deployer.address)
            
                // Get the EIP712 digest
                const digest = getPermitDigest(await devToken1.name(), devToken1.address, chainId, approve, nonce, deadline)
            
                // Sign it
                // NOTE: Using web3.eth.sign will hash the message internally again which
                // we do not want, so we're manually signing here
                const ownerPrivateKey = process.env.TEST_PRIVATE_KEY!
                const privateKey1Buffer = Buffer.from(ownerPrivateKey, 'hex')
                const { v, r, s } = sign(digest, privateKey1Buffer)
            
                // Approve it
                const receipt = await devToken1.permit(approve.owner, approve.spender, approve.value, deadline, v, r, s)
                           
                // It worked!
                // assert.equal(event.event, 'Approval')
                assert.equal(await devToken1.nonces(deployer.address), 1)
                assert.equal(await devToken1.allowance(approve.owner, approve.spender), approve.value)
            
                // Re-using the same sig doesn't work since the nonce has been incremented
                // on the contract level for replay-protection
                await expect(devToken1.permit(approve.owner, approve.spender, approve.value, deadline, v, r, s)).to.be.reverted
                
                // It should revert if the deadline has occured
                await expect(devToken1.permit(approve.owner, approve.spender, approve.value, invalidDeadline, v, r, s)).to.be.reverted

                // invalid ecrecover's return address(0x0), so we must also guarantee that
                // this case fails
                await expect(devToken1.permit('0x0000000000000000000000000000000000000000', approve.spender, approve.value, deadline, '0x99', r, s)).to.be.reverted                
              })


        })

    })
    : describe.skip