import { ethers, upgrades, network } from "hardhat";
import { deployUUPSviaCreate3 } from "./utils/deployer";
import vanityConfig from "./vanityConfig.json";
import {

  getEthereumAddress,
} from "../helper-hardhat-config";
import * as dotenv from "dotenv";
import { verifyContract } from "./lib/utils";
import { deployConfig } from "../deploy-config";
import kleur from "kleur";
import { promptUser } from "../helper-hardhat-config";
dotenv.config();

const BASE_TOKEN_ADDRESS = deployConfig.baseToken as string;
const sanctionsContractAddress = deployConfig.sanctionsContract as string;
const W_TOKEN1_NAME = deployConfig.W_TOKEN1_NAME as string;
const W_TOKEN1_SYMBOL = deployConfig.W_TOKEN1_SYMBOL as string;
const W_TOKEN2_NAME = deployConfig.W_TOKEN2_NAME as string;
const W_TOKEN2_SYMBOL = deployConfig.W_TOKEN2_SYMBOL as string;
const timeout = deployConfig.DATA_TIMEOUT as number;

async function main() {
  try {
    const [wallet] = await ethers.getSigners();
  let underlying = null;

  //user validation
  console.log(kleur.bgMagenta("Deploying the Wrapped Smart Tokens"));

  const input = await promptUser(kleur.bgBlue(("What is the symbol of the underlying you want to deploy(e.g. ETH): ")));
  if (input) {
    underlying = input.toLocaleLowerCase();
  }
  if (underlying?.length === 0) {
    console.log(kleur.bgRed("Aborting script."));
    return;
  }

  const pxSalt = require(`../${underlying}.ContractSalts.json`);
  if (!pxSalt) {
    console.log(kleur.bgRed("Contract Salts not found for the underlying."));
    return;
  }

  console.log(JSON.stringify(pxSalt, null, 2));

  console.log(kleur.bgBlue("Please verify the following values are correct:"));
  console.log(kleur.yellow(`BASE_TOKEN_ADDRESS:\t\t ${kleur.green(BASE_TOKEN_ADDRESS)}`));
  console.log(kleur.yellow(`W_TOKEN1_NAME:\t\t ${kleur.green(W_TOKEN1_NAME)}`));
  console.log(kleur.yellow(`W_TOKEN1_SYMBOL:\t\t ${kleur.green(W_TOKEN1_SYMBOL)}`));
  console.log(kleur.yellow(`W_TOKEN2_NAME:\t\t ${kleur.green(W_TOKEN2_NAME)}`));
  console.log(kleur.yellow(`W_TOKEN2_SYMBOL:\t\t ${kleur.green(W_TOKEN2_SYMBOL)}`));
  console.log(kleur.yellow(`timeout:\t\t ${kleur.green(timeout)}`));
  console.log(kleur.yellow(`sanctionsContractAddress:\t\t ${kleur.green(sanctionsContractAddress)}`));
  console.log(kleur.yellow(`Vanity Factory Address:\t\t ${kleur.green(vanityConfig.factoryAddress)}`));
  console.log(kleur.yellow(`Wallet Address:\t\t ${kleur.green(wallet.address)}`));

  const confirmation = await promptUser(kleur.bgBlue(("Are these values correct? (y/n): ")));

  if (confirmation.toLowerCase() !== "y") {
    console.log(kleur.bgRed("Aborting script."));
    return;
  }
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

  console.log(kleur.bgGreen(`WrapperFactory deployed at: ${WrapperFactory.address}`));

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
 console.log(kleur.bgGreen(`smartXInstance deposited`));
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
  console.log(kleur.bgCyan(`kmsAddress: ${kmsAddress}`));
  // now we deploy the wrapped tokens



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

  console.log(kleur.bgGreen(`Wrapped tokens deployed`));
  const WrappedX = await WrapperFactory.getWrappedSmartTokens(true);

  if (![`hardhat`, `localhost`].includes(network.name)) {
    console.log(
      kleur.bgCyan(`Waiting to ensure that it will be ready for verification on etherscan...`)
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
  } catch (error) {
    console.error(kleur.bgRed(error as string));

  }
  
}

main();
