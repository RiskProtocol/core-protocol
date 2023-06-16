import { DeployFunction } from "hardhat-deploy/types";
import {
  developmentChains,
  networkConfig,
  BASE_TOKEN_ADDRESS,
  REBASE_INTERVAL,
  sanctionsContractAddress,
} from "../helper-hardhat-config";
import { verify } from "../utils/verify";
const { ethers, upgrades } = require("hardhat");

const func: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

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
  await deployments.save("TokenFactory", TokenFactory);
  log(`TokenFactory deployed at ${TokenFactory.address}`);
  log(
    `TokenFactory implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      TokenFactory.address
    )}`
  );

  log("TokenFactory Deployed!");
  log("----------------------------------");

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    await verify(TokenFactory.address, [
      baseTokenAddress,
      priceFeedAddress,
      REBASE_INTERVAL,
      sanctionsContractAddress,
    ]);
  }
};
export default func;
func.tags = ["all"];
