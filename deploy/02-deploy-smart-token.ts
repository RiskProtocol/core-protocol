import { DeployFunction } from "hardhat-deploy/types";
import {
  developmentChains,
  networkConfig,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  sanctionsContractAddress,
  sanctionsContractAddressGoerli,
  sanctionsContractAddressSepolia,
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
  const mockERC20TokenWithPermit = await deployments.get(
    "MockERC20TokenWithPermit"
  );

  //const tokenFactory = await ethers.getContract("TokenFactory", deployer);
  const tokenFactory = await ethers.getContractAt(
    "TokenFactory",
    tokenFactoryDeployment.address
  );
  const mockTok = await ethers.getContractAt(
    "MockERC20TokenWithPermit",
    mockERC20TokenWithPermit.address
  );

  log("Deploying SmartToken 1...");

  const SmartFactoryContract = await ethers.getContractFactory("SmartToken");
  const SmartToken1 = await upgrades.deployProxy(
    SmartFactoryContract,
    [
      TOKEN1_NAME,
      TOKEN1_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddressSepolia,
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
  // if (
  //   !developmentChains.includes(network.name) &&
  //   process.env.ETHERSCAN_API_KEY
  // ) {
  //   await verify(SmartToken1.address, []);
  // }

  log("----------------------------------");

  log("Deploying SmartToken 2...");
  const SmartToken2 = await upgrades.deployProxy(
    SmartFactoryContract,
    [
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      tokenFactory.address,
      sanctionsContractAddressSepolia,
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
  // if (
  //   !developmentChains.includes(network.name) &&
  //   process.env.ETHERSCAN_API_KEY
  // ) {
  //   await verify(SmartToken2.address, []);
  // }
  log("----------------------------------");

  log("Intializing Tokens in Token Factory...");
  // initialize tokens
  await tokenFactory.initializeSMART(SmartToken1.address, SmartToken2.address);
  const smT = await ethers.getContractAt("SmartToken", SmartToken1.address);

  const stat1 = await mockTok.approve(
    tokenFactory.address,
    `${ethers.utils.parseEther("10000000")}`
  );
  const stat2 = await mockTok.approve(
    smT.address,
    `${ethers.utils.parseEther("10000000")}`
  );
  log(JSON.stringify(stat1));
  log(JSON.stringify(stat2));
  log("Approved done, now depositing");
  let tx = await smT.deposit(
    `${ethers.utils.parseEther("10000000")}`,
    "0x786d956DBc070815F9b53a6dd03D38EDf33EE2C7",
    {
      gasLimit: 7000000,
    }
  );
  log(JSON.stringify(tx));
  log("Tokens Intializied!");
};
export default func;
func.tags = ["all"];
