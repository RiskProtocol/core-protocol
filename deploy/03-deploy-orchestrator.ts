import { DeployFunction } from "hardhat-deploy/types";
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
  log("----------------------------------");

  log("Deploying Orchestrator...");

  const OrchestratorContract = await ethers.getContractFactory("Orchestrator");
  const Orchestrator = await upgrades.deployProxy(
    OrchestratorContract,
    [tokenFactory.address],
    { initializer: "initialize", kind: "uups" }
  );

  log(`Orchestrator deployed at ${Orchestrator.address}`);
  await Orchestrator.deployed();
  log(
    `Orchestrator implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      Orchestrator.address
    )}`
  );
  log("SmartToken 1 Deployed");
  log("----------------------------------");

  log("Intializing Orchestrator in Token Factory...");
  // initialize tokens
  await tokenFactory.initializeOrchestrator(Orchestrator.address);
  log("Orchestrator Intializied!");
};
export default func;
func.tags = ["all"];
