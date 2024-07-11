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

  //deploy the oracle contract
  log("Deploying Oracle contract...");
  const PriceFeedOracleContract = await ethers.getContractFactory(
    "PriceFeedOracle"
  );
  const PriceFeed = await upgrades.deployProxy(
    PriceFeedOracleContract,
    [deployer, smarttoken1Address, smarttoken2Address],
    { initializer: "initialize", kind: "uups" }
  );

  log(`PriceFeed deployed at ${PriceFeed.address}`);
  await PriceFeed.deployed();
  log(
    `PriceFeed implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      PriceFeed.address
    )}`
  );

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
    [RiskWrappedToken.address, deployer],
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

  //wrapped X
  await WrapperFactory.create(
    smartToken1.address,
    smartToken2.address,
    "Wrapped SmartToken X",
    "wX",
    1,
    true,
    deployer,
    PriceFeed.address
  );
  await WrapperFactory.create(
    smartToken2.address,
    smartToken1.address,
    "Wrapped SmartToken Y",
    "wY",
    1,
    false,
    deployer,
    PriceFeed.address
  );

  log("wX deployed to:", await WrapperFactory.getWrappedSmartTokens(true));
  log("wY deployed to:", await WrapperFactory.getWrappedSmartTokens(false));
};
export default func;
func.tags = ["all"];
