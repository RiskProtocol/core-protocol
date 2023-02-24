import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert, expect } from "chai";
import { deployments, ethers, network } from "hardhat"
import { developmentChains } from "../../helper-hardhat-config";
import { TokenFactory, MockV3Aggregator } from "../../typechain-types";
import {BASE_TOKEN_ADDRESS} from "../../helper-hardhat-config";

developmentChains.includes(network.name) ?
    describe("TokenFactory", async function () {

        let tokenFactory: TokenFactory;
        let deployer: SignerWithAddress;
        let mockV3Aggregator: MockV3Aggregator;
        const valueSent = ethers.utils.parseEther("1")        

        beforeEach(async function () {
            const accounts = await ethers.getSigners()
            deployer = accounts[0]

            await deployments.fixture(["all"])
            tokenFactory = await ethers.getContract('TokenFactory', deployer)
            mockV3Aggregator = await ethers.getContract('MockV3Aggregator', deployer)
        })

        describe("Constructor", async function () {
            it("sets the address of the price aggregator correctly", async function () {
                const result = await tokenFactory.getPriceFeedAddress();
                assert.equal(result, mockV3Aggregator.address);
            })

            it("sets the address of the contract for the underlying erc20 token correctly", async function () {
                const result = await tokenFactory.getBaseTokenAddress();
                assert.equal(result, BASE_TOKEN_ADDRESS);
            })
        })

        // describe("Funding", async function () {
        //     it("fails if you don't send enough ETH", async function () {
        //         await expect(fundMe.fund({ value: lowEther })).to.be.revertedWithCustomError(fundMe, 'GoFundMe__AmountNotEnough')
        //     })

        //     it("updated amount funded data structure", async function () {
        //         await fundMe.fund({ value: valueSent });
        //         const response = await fundMe.s_addressToAmountFunded(deployer.address)
        //         assert.equal(response.toString(), valueSent.toString())
        //     })

        //     it("adds s_funders to the s_funders array", async function () {
        //         await fundMe.fund({ value: valueSent });
        //         const response = await fundMe.s_funders(0)
        //         assert.equal(response, deployer.address)
        //     })
        // })

        // describe("Withdraw", async function () {
        //     // before we perform withdrawal, we want the contract to have some values
        //     beforeEach(async function () {
        //         await fundMe.fund({ value: valueSent });
        //     })

        //     it("can withdraw Eth from a single funder", async function () {
        //         // arrange
        //         const startingFundMeBalance = await fundMe.provider.getBalance(fundMe.address)
        //         const startingDeployerBalance = await fundMe.provider.getBalance(deployer.address) // balance of contract owner

        //         // act
        //         const transactionResponse = await fundMe.withdraw()
        //         const transactionReceipt = await transactionResponse.wait(1)

        //         // during withdrawal, the deployer will spend some money on gas, so we need to factor this in
        //         const { gasUsed, effectiveGasPrice } = transactionReceipt
        //         const gasCost = gasUsed.mul(effectiveGasPrice)

        //         const endingFundMeBalance = await fundMe.provider.getBalance(fundMe.address)
        //         const endingDeployerBalance = await fundMe.provider.getBalance(deployer.address)

        //         // assert
        //         assert.equal(endingFundMeBalance.toString(), '0')
        //         assert.equal(startingFundMeBalance.add(startingDeployerBalance).toString(), endingDeployerBalance.add(gasCost).toString())
        //     })

        //     it("can withdraw Eth from a multiple s_funders", async function () {
        //         // arrange
        //         const accounts = await ethers.getSigners()
        //         // we start with 1 index because the account with 0 index is the deployer 
        //         for (let i = 1; i < 6; i++) {
        //             // we have to connect each of the account to use them
        //             const fundMeConnectedContract = fundMe.connect(accounts[i])
        //             await fundMeConnectedContract.fund({ value: valueSent })
        //         }
        //         const startingFundMeBalance = await fundMe.provider.getBalance(fundMe.address)
        //         const startingDeployerBalance = await fundMe.provider.getBalance(deployer.address) // balance of contract owner

        //         // act
        //         const transactionResponse = await fundMe.withdraw()
        //         const transactionReceipt = await transactionResponse.wait(1)

        //         // during withdrawal, the deployer will spend some money on gas, so we need to factor this in
        //         const { gasUsed, effectiveGasPrice } = transactionReceipt
        //         const gasCost = gasUsed.mul(effectiveGasPrice)

        //         const endingFundMeBalance = await fundMe.provider.getBalance(fundMe.address)
        //         const endingDeployerBalance = await fundMe.provider.getBalance(deployer.address)

        //         // assert
        //         assert.equal(endingFundMeBalance.toString(), '0')
        //         assert.equal(startingFundMeBalance.add(startingDeployerBalance).toString(), endingDeployerBalance.add(gasCost).toString())

        //         // make sure s_funders array is reset properly, it should be empty
        //         await expect(fundMe.s_funders(0)).to.be.reverted
        //         // make sure s_addressToAmountFunded mapping is reset properly
        //         for (let i = 1; i < 6; i++) {
        //             assert.equal((await fundMe.s_addressToAmountFunded(accounts[i].address)).toString(), '0')
        //         }
        //     })

        //     it("only allows owner to withdraw", async function () {
        //         const accounts = await ethers.getSigners()
        //         const attacker = accounts[1]
        //         const connectedAttackerContract = fundMe.connect(attacker)

        //         await expect(connectedAttackerContract.withdraw()).to.be.revertedWithCustomError(fundMe, 'GoFundMe__NotOwner')
        //     })
        // })
    })
    : describe.skip