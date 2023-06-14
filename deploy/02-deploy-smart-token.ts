import { DeployFunction } from 'hardhat-deploy/types';
import {
    developmentChains,
    networkConfig,
    TOKEN1_NAME,
    TOKEN1_SYMBOL,
    TOKEN2_NAME,
    TOKEN2_SYMBOL,
    sanctionsContractAddress
} from '../helper-hardhat-config';
import { verify } from '../utils/verify';
import { ethers } from "hardhat"

const func: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()   
    const tokenFactory = await ethers.getContract("TokenFactory", deployer)
    
    log("Deploying SmartToken 1...");
    const SmartToken1 = await deploy("SmartToken", {
      from: deployer,
      args: [
        TOKEN1_NAME,
        TOKEN1_SYMBOL,
        tokenFactory.address,
        sanctionsContractAddress,
      ],
      log: true,
      // we need to wait if on a live network so we can verify properly
      waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    });
    log("SmartToken 1 Deployed");
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(SmartToken1.address, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContractAddress,
        ]);
    }  

    log("----------------------------------")

    log("Deploying SmartToken 2...");
    const SmartToken2 = await deploy("SmartToken", {
      from: deployer,
      args: [
        TOKEN2_NAME,
        TOKEN2_SYMBOL,
        tokenFactory.address,
        sanctionsContractAddress,
      ],
      log: true,
      // we need to wait if on a live network so we can verify properly
      waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    });
    log("SmartToken 2 Deployed"); 
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(SmartToken2.address, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContractAddress,
        ]);
    }  
    log("----------------------------------")

    log("Intializing Tokens in Token Factory...")
    // initialize tokens  
    await tokenFactory.initialize(SmartToken1.address, SmartToken2.address);
    log("Tokens Intializied!")
};
export default func;
func.tags = ["all"]; 