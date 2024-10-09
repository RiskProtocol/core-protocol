import { DeployFunction } from "hardhat-deploy/types";
import {
  BASE_TOKEN_ADDRESS,
  FF_INTERVAL,
  REBALANCE_INTERVAL,
  rateLimitsDefault,getEthereumAddress
} from "../helper-hardhat-config";
const { ethers, upgrades } = require("hardhat");

const func: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  let baseTokenAddress: string;

  if (["local", "development", "hardhat"].includes(process.env.ENVIRONMENT!)) {
    const mockERC20TokenWithPermit = await deployments.get(
      "MockERC20TokenWithPermit"
    );
    baseTokenAddress = mockERC20TokenWithPermit.address;
  } else {
    baseTokenAddress = BASE_TOKEN_ADDRESS;
  }

  let sanctionsContractAddress: string;
  let signersAddress:string;

  if (process.env.ENVIRONMENT === "local" || process.env.ENVIRONMENT === "hardhat") {
    const mockSanctionContract = await deployments.get("MockSanctionContract");
    sanctionsContractAddress = mockSanctionContract.address;
    signersAddress = deployer;
  } else {
    sanctionsContractAddress = process.env.SANCTIONS_CONTRACT_ADDRESS!;
    const awsConfig = {
      region: process.env.AWS_REGION || "eu-north-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    };
    signersAddress =await getEthereumAddress(process.env.KMS_KEY_ID as string,awsConfig);
  }

  // Deploying the contract as a UUPS upgradeable contract.
  const TokenFactoryContract = await ethers.getContractFactory("TokenFactory");
  const TokenFactory = await upgrades.deployProxy(
    TokenFactoryContract,
    [
      baseTokenAddress,
      REBALANCE_INTERVAL,
      FF_INTERVAL,
      sanctionsContractAddress,
      signersAddress,
      deployer,
      rateLimitsDefault.withdraw,
      rateLimitsDefault.deposit,
      rateLimitsDefault.period,
      false,
    ],
    { initializer: "initialize", kind: "uups" }
  );
  await deployments.save("TokenFactory", TokenFactory);
  log(`TokenFactory deployed at ${TokenFactory.address}`);
  await TokenFactory.deployed();
  log(
    `TokenFactory implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      TokenFactory.address
    )}`
  );

  log("TokenFactory Deployed!");
  log("----------------------------------");
};

export default func;
func.tags = ["all"];
