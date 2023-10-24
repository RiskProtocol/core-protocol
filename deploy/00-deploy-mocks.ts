import { DeployFunction } from "hardhat-deploy/types";
import {
  DECIMALS,
  developmentChains,
  INITIAL_PRICE,
} from "../helper-hardhat-config";

const deployMocks: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  /* We deploy this only for local development, remember if you are deploying to a localhost,
     you'll need a local network running to interact eg yarn hardhat node
    */
  if (true) {
    log("Local network detected! Deploying mocks...");

    log("Deploying MockERC20TokenWithPermit...");
    const mockToken = await deploy("MockERC20TokenWithPermit", {
      contract: "MockERC20TokenWithPermit",
      from: deployer,
      args: [], // from github MockV3Aggragator has 2 argument for the contructors
      log: true,
    });
    log("MockERC20Token Deployed!");
    log(`MockERC20Token deployed at ${mockToken.address}`);
    log("----------------------------------");

    log("Deploying MockERC20TokenUSDC...");
    const usdc = await deploy("MockERC20TokenUSDC", {
      contract: "MockERC20TokenUSDC",
      from: deployer,
      args: [], // from github MockV3Aggragator has 2 argument for the contructors
      log: true,
    });
    log("usdc Deployed!");
    log(`usdc deployed at ${usdc.address}`);
    log("----------------------------------");
  }
};
export default deployMocks;
deployMocks.tags = ["mocks", "all"];
// the tags will help us deploy the contract in categories eg yarn hardhat deploy --tags mocks
