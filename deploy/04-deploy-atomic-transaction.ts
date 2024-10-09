import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import { BASE_TOKEN_ADDRESS } from "../helper-hardhat-config";

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
  //underlying token
  let baseTokenAddress: string;
  if (["local", "development", "hardhat"].includes(process.env.ENVIRONMENT!)) {
    const mockERC20TokenWithPermit = await deployments.get(
      "MockERC20TokenWithPermit"
    );
    baseTokenAddress = mockERC20TokenWithPermit.address;
  } else {
    baseTokenAddress = BASE_TOKEN_ADDRESS;
  }

  let smarttoken1Address = await tokenFactory.getSmartTokenAddress(0);
  let smarttoken2Address = await tokenFactory.getSmartTokenAddress(1);

  log("----------------------------------");

  log("Deploying Atomic Transaction...");

  const AtomicTxContract = await ethers.getContractFactory("AtomicTransaction");
  const AtomicTx = await upgrades.deployProxy(
    AtomicTxContract,
    [smarttoken1Address, smarttoken2Address, baseTokenAddress, deployer],
    { initializer: "initialize", kind: "uups" }
  );

  log(`AtomicTx deployed at ${AtomicTx.address}`);
  await AtomicTx.deployed();
  log(
    `AtomicTx implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      AtomicTx.address
    )}`
  );
  log("Atomic Transaction Deployed");
};
export default func;
func.tags = ["all"];
