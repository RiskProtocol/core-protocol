import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  BASE_TOKEN_ADDRESS,
  getEthereumAddress,
} from "../helper-hardhat-config";
import { sign } from "crypto";

const func: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const tokenFactoryDeployment = await deployments.get("TokenFactory");
  // const orchestratorDeployment = await deployments.get("Orchestrator");

  //const tokenFactory = await ethers.getContract("TokenFactory", deployer);
  const tokenFactory = await ethers.getContractAt(
    "TokenFactory",
    tokenFactoryDeployment.address
  );

  // const orchestrator = await ethers.getContractAt("Orchestrator", orchestratorDeployment.address);

  let smarttoken1Address = await tokenFactory.getSmartTokenAddress(0);
  let smarttoken2Address = await tokenFactory.getSmartTokenAddress(1);

  log("----------------------------------");

  log("smarttoken1Address", smarttoken1Address);
  log("smarttoken2Address", smarttoken2Address);

  //deploying the template(unbuttonToken)
  log("Deploying UnbuttonToken template...");
  const RiskWrappedTokenContract = await ethers.getContractFactory(
    "wrappedSmartToken"
  );
  const RiskWrappedToken = await RiskWrappedTokenContract.deploy();

  //deploy the wrapper factory
  log("Deploying WrapperFactory...");
  const WrapperFactoryContract = await ethers.getContractFactory(
    "WrapperFactory"
  );
  const WrapperFactory = await upgrades.deployProxy(
    WrapperFactoryContract,
    [deployer],
    { initializer: "initialize", kind: "uups" }
  );

  await WrapperFactory.deployed();
  log("WrapperFactory deployed to:", WrapperFactory.address);

  const smartToken1 = await ethers.getContractAt(
    "SmartToken",
    smarttoken1Address
  );
  const smartToken2 = await ethers.getContractAt(
    "SmartToken",
    smarttoken2Address
  );

  await smartToken1.approve(
    WrapperFactory.address,
    ethers.constants.MaxUint256
  );
  await smartToken2.approve(
    WrapperFactory.address,
    ethers.constants.MaxUint256
  );

  log(`allowance as are follows:`);
  log(
    `smartToken1 allowance: ${await smartToken1.allowance(
      deployer,
      WrapperFactory.address
    )}`
  );
  log(
    `smartToken2 allowance: ${await smartToken2.allowance(
      deployer,
      WrapperFactory.address
    )}`
  );

  log("balances of the deployer are as follows:");
  log(`smartToken1 balance: ${await smartToken1.balanceOf(deployer)}`);
  log(`smartToken2 balance: ${await smartToken2.balanceOf(deployer)}`);
  let sanctionsContractAddress: string;
  let signersAddress: string;

  if (process.env.ENVIRONMENT === "local") {
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
    signersAddress = await getEthereumAddress(
      process.env.KMS_KEY_ID as string,
      awsConfig
    );
  }
  //wrapped X
  await WrapperFactory.create(
    smartToken1.address,
    smartToken2.address,
    "Wrapped SmartToken X",
    "wX",
    1,
    true,
    deployer,
    signersAddress,
    300,
    sanctionsContractAddress
  );
  await WrapperFactory.create(
    smartToken2.address,
    smartToken1.address,
    "Wrapped SmartToken Y",
    "wY",
    1,
    false,
    deployer,
    signersAddress,
    300,
    sanctionsContractAddress
  );

  log("wX deployed to:", await WrapperFactory.getWrappedSmartTokens(true));
  log("wY deployed to:", await WrapperFactory.getWrappedSmartTokens(false));
};
export default func;
func.tags = ["all"];
