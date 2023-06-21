import { DeployFunction } from "hardhat-deploy/types";
import {
  developmentChains,
  networkConfig,
  BASE_TOKEN_ADDRESS,
  REBASE_INTERVAL,
  sanctionsContractAddress,
} from "../helper-hardhat-config";
import { verify, delay } from "../utils";
const { ethers, upgrades } = require("hardhat");

const func: DeployFunction = async ({
  deployments,
  network,
}) => {
  const { log } = deployments;

  /* While deploying on localhost or hardhat, we would like to use a mock for Price feed
      because they don't exist on those chains, we would equally want to deploy the price feed
      with the correct contract address for different chains
    */

  let priceFeedAddress: string;
  let baseTokenAddress: string;

  if (developmentChains.includes(network.name)) {
    const ethUsdAggregator = await deployments.get("MockV3Aggregator");
    priceFeedAddress = ethUsdAggregator.address;

    const mockERC20TokenWithPermit = await deployments.get(
      "MockERC20TokenWithPermit"
    );
    baseTokenAddress = mockERC20TokenWithPermit.address;
  } else {
    priceFeedAddress = networkConfig[network.name].priceFeed!;
    baseTokenAddress = BASE_TOKEN_ADDRESS;
  }

  // Deploying the contract as a UUPS upgradeable contract.
  const TokenFactoryContract = await ethers.getContractFactory("TokenFactory");
  const TokenFactory = await upgrades.deployProxy(
    TokenFactoryContract,
    [
      baseTokenAddress,
      priceFeedAddress,
      REBASE_INTERVAL,
      sanctionsContractAddress,
    ],
    { initializer: "initialize", kind: "uups" }
  );

  await TokenFactory.deployed();
  await deployments.save("TokenFactory", TokenFactory);


  log(`TokenFactory deployed at ${TokenFactory.address}`);
  const tokenFactoryImplementationAddress = await upgrades.erc1967.getImplementationAddress(
    TokenFactory.address
  );
  log(
    `TokenFactory implementation deployed at ${tokenFactoryImplementationAddress}`
  );

  log("TokenFactory Deployed!");
  log("----------------------------------");

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Wait to verify TokenFactory on Etherscan...");
    await delay(10000); // wait for 20 seconds to allow etherscan get contract ready for verification
    log("TokenFactory Verification Delay Complete!");
    await verify(TokenFactory.address, []);
  }
};
export default func;
func.tags = ["all"];
