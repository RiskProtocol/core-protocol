import { DeployFunction } from 'hardhat-deploy/types';
import { DECIMALS, developmentChains, INITIAL_PRICE } from '../helper-hardhat-config';


const deployMocks: DeployFunction = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    /* We deploy this only for local development, remember if you are deploying to a localhost,
     you'll need a local network running to interact eg yarn hardhat node
    */
    if (developmentChains.includes(network.name)) {
        log('Local network detected! Deploying mocks...')
        log('Deploying MockV3Aggregator...')
        await deploy("MockV3Aggregator", {
            contract: "MockV3Aggregator",
            from: deployer,
            args: [DECIMALS, INITIAL_PRICE], // from github MockV3Aggragator has 2 argument for the contructors
            log: true
        })
        log("MockV3Aggregator Deployed!")
        log("----------------------------------")

        log('Deploying MockERC20TokenWithPermit...')
        const mockToken = await deploy("MockERC20TokenWithPermit", {
            contract: "MockERC20TokenWithPermit",
            from: deployer,
            args: [], // from github MockV3Aggragator has 2 argument for the contructors
            log: true
        })       
        log("MockERC20Token Deployed!")
        log("----------------------------------")
    }
};
export default deployMocks;
deployMocks.tags = ["mocks", "all"]; 
// the tags will help us deploy the contract in categories eg yarn hardhat deploy --tags mocks
