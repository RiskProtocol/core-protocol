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
    })
    : describe.skip