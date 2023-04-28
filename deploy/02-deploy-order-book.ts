import { DeployFunction } from 'hardhat-deploy/types';
import { developmentChains, networkConfig} from '../helper-hardhat-config';
import { verify } from '../utils/verify';

const func: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const orderBook = await deploy("OrderBook", {
        from: deployer,
        args: [],
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })

    log("OrderBook Deployed!")
    log("----------------------------------")

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        await verify(orderBook.address, [])
    }     
};
export default func;
func.tags = ["all"];