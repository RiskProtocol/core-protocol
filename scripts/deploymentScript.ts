import { ethers } from "hardhat";
import { deployUUPSviaCreate3 } from "./utils/deployer";
import vanityConfig from "./vanityConfig.json";
import {
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
} from "../helper-hardhat-config";
import pxSalt from "../ContractSalts.json";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [wallet] = await ethers.getSigners();

  const sanctionsContractAddress = process.env.SANCTIONS_CONTRACT_ADDRESS;
  //deploying tokenFactory
  const TokenFactoryComplete = await deployUUPSviaCreate3(
    "TokenFactory",
    pxSalt.tokenFactory.saltStr, //salt
    [
      "0x6031339bf7A13743b4bcDAFC45CB59B7ff4D99C1", //Base Token
      REBALANCE_INTERVAL,
      sanctionsContractAddress, //sanctions but just testing
      wallet.address,
      wallet.address,
    ],
    vanityConfig.factoryAddress,
    false
  );
  console.log(`Token Factory deployed at ProxyAddress:${TokenFactoryComplete}`);
  //deploying SmartX
  const SmartXComplete = await deployUUPSviaCreate3(
    "SmartToken",
    pxSalt.SmartTokenX.saltStr, //salt
    [
      TOKEN1_NAME,
      TOKEN1_SYMBOL,
      TokenFactoryComplete,
      sanctionsContractAddress,
      true,
      wallet.address,
    ],
    vanityConfig.factoryAddress,
    false
  );
  console.log(`Smart X deployed at ProxyAddress:${SmartXComplete}`);

  //deploying SmartY
  const SmartYComplete = await deployUUPSviaCreate3(
    "SmartToken",
    pxSalt.SmartTokenY.saltStr, //salt
    [
      TOKEN2_NAME,
      TOKEN2_SYMBOL,
      TokenFactoryComplete,
      sanctionsContractAddress,
      false,
      wallet.address,
    ],
    vanityConfig.factoryAddress,
    false
  );
  console.log(`Smart Y deployed at ProxyAddress:${SmartYComplete}`);

  //initializeSMART
  const tokenFactoryInstance = await ethers.getContractAt(
    "TokenFactory",
    TokenFactoryComplete,
    wallet
  );
  console.log(`\nTokenFactory Owner:${await tokenFactoryInstance.owner()}`);

  await tokenFactoryInstance.initializeSMART(SmartXComplete, SmartYComplete);

  // deploy orchestrator
  const Orchestator = await deployUUPSviaCreate3(
    "Orchestrator",
    pxSalt.Orchestator.saltStr, //salt
    [TokenFactoryComplete, wallet.address],
    vanityConfig.factoryAddress,
    false
  );

  await tokenFactoryInstance.initializeOrchestrator(Orchestator);
  console.log("Orchestrator Intializied!");
}

main();
