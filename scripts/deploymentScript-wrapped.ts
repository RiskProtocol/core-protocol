import { ethers, upgrades, network } from "hardhat";
import { deployUUPSviaCreate3 } from "./utils/deployer";
import vanityConfig from "./vanityConfig.json";
import {
  BASE_TOKEN_ADDRESS,
  FF_INTERVAL,
  REBALANCE_INTERVAL,
  W_TOKEN1_NAME,
  W_TOKEN1_SYMBOL,
  W_TOKEN2_NAME,
  W_TOKEN2_SYMBOL,
  getEthereumAddress,
  rateLimitsDefault,
} from "../helper-hardhat-config";
import pxSalt from "../ContractSalts.json";
import * as dotenv from "dotenv";
import { verifyContract } from "./lib/utils";
dotenv.config();

async function main() {
  const [wallet] = await ethers.getSigners();

  const sanctionsContractAddress = process.env.SANCTIONS_CONTRACT_ADDRESS;

  /////deploy the wrapperFactory
  ///////////////////////////////
  const RiskWrappedTokenContract = await ethers.getContractFactory(
    "wrappedSmartToken",
    wallet
  );
  //deploy the template
  const wrappedTemplate = await RiskWrappedTokenContract.deploy();

  //deploy the wrapper factory
  const WrapperFactoryContract = await ethers.getContractFactory(
    "WrapperFactory",
    wallet
  );
  const WrapperFactory = await upgrades.deployProxy(
    WrapperFactoryContract,
    [wallet.address, wrappedTemplate.address],
    { initializer: "initialize", kind: "uups" }
  );

  await WrapperFactory.deployed();

  console.log(`WrapperFactory deployed at: ${WrapperFactory.address}`);

  // const WrapperFactory = await ethers.getContractAt("WrapperFactory", "0xD04cdeB1206aA33f7ebb063F84FBcf1E6693B89c", wallet);
  // let wrappedTemplate = { address: await WrapperFactory.getTemplate() };

  //get token instances
  const underlyingTokenInstance = await ethers.getContractAt(
    "ERC20",
    BASE_TOKEN_ADDRESS,
    wallet
  );
  const smartXInstance = await ethers.getContractAt(
    "SmartToken",
    pxSalt.SmartTokenX.proxyAddress,
    wallet
  );
  const smartYInstance = await ethers.getContractAt(
    "SmartToken",
    pxSalt.SmartTokenY.proxyAddress,
    wallet
  );

  // we deposit 1000 (wei) tokens of underlying token to the vault
  await underlyingTokenInstance.approve(pxSalt.tokenFactory.proxyAddress, 1000);
  const { setTimeout } = require(`timers/promises`);
  await setTimeout(50000);
  await smartXInstance.deposit("1000", wallet.address);
 console.log(`smartXInstance deposited`);
  // now we approve wrapper factory to spend the smart tokens
  await smartXInstance.approve(WrapperFactory.address, 1000);
  await smartYInstance.approve(WrapperFactory.address, 1000);
  await setTimeout(100000);
  
  /////////////////////////////
  ///KMS
  /////////////////////////////
  const awsConfig = {
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  };
  const keyId = process.env.KMS_KEY_ID as string;
  const kmsAddress = await getEthereumAddress(keyId, awsConfig);
  console.log(`kmsAddress: ${kmsAddress}`);
  // now we deploy the wrapped tokens

  const timeout = 1000 * 60 * 5; // 5 minutes

  try {
     //deploy Wrapped X
  await WrapperFactory.create(
    smartXInstance.address,
    smartYInstance.address,
    W_TOKEN1_NAME,
    W_TOKEN1_SYMBOL,
    1,
    true,
    wallet.address,
    kmsAddress,
    timeout,
    sanctionsContractAddress,
    vanityConfig.factoryAddress,
    ethers.utils.formatBytes32String(pxSalt.wX.saltStr)
  );
  } catch (error) {
    console.log(`error at line 94`)
    console.error(error);
  }
 
  await WrapperFactory.create(
    smartYInstance.address,
    smartXInstance.address,
    W_TOKEN2_NAME,
    W_TOKEN2_SYMBOL,
    1,
    false,
    wallet.address,
    kmsAddress,
    timeout,
    sanctionsContractAddress,
    vanityConfig.factoryAddress,
    ethers.utils.formatBytes32String(pxSalt.wY.saltStr)
  );

  console.log(`Wrapped tokens deployed`);
  const WrappedX = await WrapperFactory.getWrappedSmartTokens(true);

  if (![`hardhat`, `localhost`].includes(network.name)) {
    console.log(
      `Waiting to ensure that it will be ready for verification on etherscan...`
    );
    const { setTimeout } = require(`timers/promises`);
    await setTimeout(20000);

    await verifyContract(
      wrappedTemplate.address,
      [],
      "contracts/vaults/wrapped/WrappedSmartToken.sol:wrappedSmartToken"
    ); //  verifies implementation
    await setTimeout(20000);
    //wX
    await verifyContract(pxSalt.wX.proxyAddress, [wrappedTemplate.address, ""]);
    //wY
    await verifyContract(pxSalt.wY.proxyAddress, [wrappedTemplate.address, ""]);
  }
}

main();
