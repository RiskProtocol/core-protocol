import { DeployFunction } from 'hardhat-deploy/types';
import { developmentChains, networkConfig } from '../helper-hardhat-config';
import { verify } from '../utils/verify';

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

    const GoFundMe = await deploy("GoFundMe", {
        from: deployer,
        args: [ethUsdPriceFeedAddress], // put price feed address here
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })

    log("GoFundMe Deployed!")
    log("----------------------------------")

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(GoFundMe.address, [ethUsdPriceFeedAddress])
    }
};
export default func;
func.tags = ["all"]; 