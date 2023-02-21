import { DeployFunction } from 'hardhat-deploy/types';
import { developmentChains, networkConfig } from '../helper-hardhat-config';
import { verify } from '../utils/verify';
import { BASE_TOKEN_ADDRESS, TOKEN1_NAME, TOKEN1_SYMBOL, TOKEN2_NAME, TOKEN2_SYMBOL } from '../helper-hardhat-config';

const func: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    /* While deploying on localhost or hardhat, we would like to use a mock for Price feed
      because they don't exist on those chains, we would equally want to deploy the price feed
      with the correct contract address for different chains
    */

    let ethUsdPriceFeedAddress: string

    if (developmentChains.includes(network.name)) {
        const ethUsdAggregator = await deployments.get('MockV3Aggregator');
        ethUsdPriceFeedAddress = ethUsdAggregator.address
    } else {
        ethUsdPriceFeedAddress = networkConfig[network.name].ethUsdPriceFeed!
    }

    const TokenFactory = await deploy("TokenFactory", {
        from: deployer,
        args: [BASE_TOKEN_ADDRESS, TOKEN1_NAME, TOKEN1_SYMBOL, TOKEN2_NAME, TOKEN2_SYMBOL], 
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })

    log("TokenFactory Deployed!")
    log("----------------------------------")

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(TokenFactory.address, [BASE_TOKEN_ADDRESS, TOKEN1_NAME, TOKEN1_SYMBOL, TOKEN2_NAME, TOKEN2_SYMBOL])
    }
};
export default func;
func.tags = ["all"]; 