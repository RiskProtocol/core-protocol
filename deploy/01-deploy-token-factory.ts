import { DeployFunction } from 'hardhat-deploy/types';
import { developmentChains, networkConfig, BASE_TOKEN_ADDRESS, REBASE_INTERVAL, CHAINLINK_TOKEN_ADDRESS, CHAINLINK_ORACLE_ADDRESS, CHAINLINK_JOB_ID} from '../helper-hardhat-config';
import { verify } from '../utils/verify';

const func: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    /* While deploying on localhost or hardhat, we would like to use a mock for Price feed
      because they don't exist on those chains, we would equally want to deploy the price feed
      with the correct contract address for different chains
    */
   
    let priceFeedAddress: string
    let baseTokenAddress: string

    if (developmentChains.includes(network.name)) {
        const ethUsdAggregator = await deployments.get('MockV3Aggregator');
        priceFeedAddress = ethUsdAggregator.address

        const mockERC20Token = await deployments.get('MockERC20Token');
        baseTokenAddress = mockERC20Token.address
    } else {
        priceFeedAddress = networkConfig[network.name].priceFeed!
        baseTokenAddress = BASE_TOKEN_ADDRESS
    }

    const TokenFactory = await deploy("TokenFactory", {
        from: deployer,
        args: [baseTokenAddress, priceFeedAddress, REBASE_INTERVAL, CHAINLINK_TOKEN_ADDRESS, CHAINLINK_ORACLE_ADDRESS, CHAINLINK_JOB_ID],
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: networkConfig[network.name].blockConfirmations || 1,
    })

    log("TokenFactory Deployed!")
    log("----------------------------------")    
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY || developmentChains.includes('sepolia')) {
        await verify(TokenFactory.address, [baseTokenAddress, priceFeedAddress, REBASE_INTERVAL, CHAINLINK_TOKEN_ADDRESS, CHAINLINK_ORACLE_ADDRESS, CHAINLINK_JOB_ID])
    }     
};
export default func;
func.tags = ["all"]; 