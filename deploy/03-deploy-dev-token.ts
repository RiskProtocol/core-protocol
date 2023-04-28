import { DeployFunction } from 'hardhat-deploy/types';
import { developmentChains, networkConfig, TOKEN1_NAME, TOKEN1_SYMBOL, TOKEN2_NAME, TOKEN2_SYMBOL } from '../helper-hardhat-config';
import { verify } from '../utils/verify';
import { ethers } from "hardhat"

const func: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()   
    const defaultOperators: string[] = []
    const tokenFactory = await ethers.getContract("TokenFactory", deployer)

    const orderBook = await ethers.getContract("OrderBook", deployer);
    log("OrderBook address: ", orderBook.address);

    log("Deploying DevToken 1...")
    const DevToken1 = await deploy("DevToken", {
        from: deployer,
        args: [TOKEN1_NAME, TOKEN1_SYMBOL, tokenFactory.address, defaultOperators, orderBook.address],
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })
    log("DevToken 1 Deployed")
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(DevToken1.address, [TOKEN1_NAME, TOKEN1_SYMBOL, tokenFactory.address, defaultOperators])
    }

    log("----------------------------------")

    log("Deploying DevToken 2...")
    const DevToken2 = await deploy("DevToken", {
        from: deployer,
        args: [TOKEN2_NAME, TOKEN2_SYMBOL, tokenFactory.address, defaultOperators, orderBook.address],
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })
    log("DevToken 2 Deployed") 
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(DevToken2.address, [TOKEN2_NAME, TOKEN2_SYMBOL, tokenFactory.address, defaultOperators, orderBook.address])
    }  
    log("----------------------------------")   

    log("Intializing Tokens in Token Factory...")
    // initialize tokens  
    await tokenFactory.initialize(DevToken1.address, DevToken2.address)
    log("Tokens Intializied!")
};
export default func;
func.tags = ["all"]; 