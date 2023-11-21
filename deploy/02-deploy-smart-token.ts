import { DeployFunction } from "hardhat-deploy/types";
import {
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  BASE_TOKEN_ADDRESS,
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

  let baseTokenAddress: string;

  if (['local', 'development'].includes(process.env.ENVIRONMENT!)) {
    const mockERC20TokenWithPermit = await deployments.get(
      "MockERC20TokenWithPermit"
    );
    baseTokenAddress = mockERC20TokenWithPermit.address;
  } else {
    baseTokenAddress = BASE_TOKEN_ADDRESS;
  }

  let sanctionsContractAddress: string;

  if (process.env.ENVIRONMENT === "local") {
    const mockSanctionContract = await deployments.get("MockSanctionContract");
    sanctionsContractAddress = mockSanctionContract.address;
  } else {
    sanctionsContractAddress = process.env.SANCTIONS_CONTRACT_ADDRESS!;
  }


  const tokenFactory = await ethers.getContractAt(
    "TokenFactory",
    tokenFactoryDeployment.address
  );
  const mockERC20TokenWithPermit = await ethers.getContractAt(
    "MockERC20TokenWithPermit",
    baseTokenAddress
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
      true,
    ],
    { initializer: "initialize", kind: "uups" }
  );

  log(`SmartToken1 deployed at ${SmartToken1.address}`);
  await SmartToken1.deployed();
  log(
    `SmartToken1 implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      SmartToken1.address
    )}`
  );
  log("SmartToken 1 Deployed");
  log("----------------------------------");

  log("Deploying SmartToken 2...");
  const SmartToken2 = await upgrades.deployProxy(
    SmartFactoryContract,
    [
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddress,
      false,
    ],
    { initializer: "initialize", kind: "uups" }
  );

  log(`SmartToken2 deployed at ${SmartToken2.address}`);
  await SmartToken2.deployed();
  log(
    `SmartToken2 implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      SmartToken2.address
    )}`
  );

  log("SmartToken 2 Deployed");
  log("----------------------------------");

  log("Intializing Tokens in Token Factory...");
  // initialize tokens
  await tokenFactory.initializeSMART(SmartToken1.address, SmartToken2.address);
  const smartToken1 = await ethers.getContractAt("SmartToken", SmartToken1.address);

  const approveERC20Spender = await mockERC20TokenWithPermit.approve(
    tokenFactory.address,
    `${ethers.utils.parseEther("10000000")}`
  );

  log(JSON.stringify(approveERC20Spender));
  log("Approved done, now depositing");
  let tx = await smartToken1.deposit(
    `${ethers.utils.parseEther("10000000")}`,
    deployer,
    {
      gasLimit: 7000000,
    }
  );
  log(JSON.stringify(tx));
  log("Tokens Intializied!");
};
export default func;
func.tags = ["all"];
