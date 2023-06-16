import { DeployFunction } from "hardhat-deploy/types";
import {
  developmentChains,
  networkConfig,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  sanctionsContractAddress,
} from "../helper-hardhat-config";
import { verify } from "../utils/verify";
import { ethers, upgrades } from "hardhat";

const func: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const tokenFactoryDeployment = await deployments.get("TokenFactory");

  //const tokenFactory = await ethers.getContract("TokenFactory", deployer);
  const tokenFactory = await ethers.getContractAt(
    "TokenFactory",
    tokenFactoryDeployment.address
  );

  log("Deploying SmartToken 1...");

  const SmartFactoryContract = await ethers.getContractFactory("SmartToken");
  const SmartToken1 = await upgrades.deployProxy(
    SmartFactoryContract,
    [
      TOKEN1_NAME,
      TOKEN1_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddress,
    ],
    { initializer: "initialize", kind: "uups" }
  );

  log(`SmartToken1 deployed at ${SmartToken1.address}`);
  log(
    `SmartToken1 implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      SmartToken1.address
    )}`
  );
  log("SmartToken 1 Deployed");
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    await verify(SmartToken1.address, [
      TOKEN1_NAME,
      TOKEN1_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddress,
    ]);
  }

  log("----------------------------------");

  log("Deploying SmartToken 2...");
  const SmartToken2 = await upgrades.deployProxy(
    SmartFactoryContract,
    [
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddress,
    ],
    { initializer: "initialize", kind: "uups" }
  );

  log(`SmartToken2 deployed at ${SmartToken2.address}`);
  log(
    `SmartToken2 implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      SmartToken2.address
    )}`
  );

  log("SmartToken 2 Deployed");
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    await verify(SmartToken2.address, [
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddress,
    ]);
  }
  log("----------------------------------");

  log("Intializing Tokens in Token Factory...");
  // initialize tokens
  await tokenFactory.initializeSMART(SmartToken1.address, SmartToken2.address);
  log("Tokens Intializied!");
};
export default func;
func.tags = ["all"];
