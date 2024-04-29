import { ethers } from "hardhat";
import { deployUUPSviaCreate3 } from "./utils/deployer";
import vanityConfig from "./vanityConfig.json";
import {
  BASE_TOKEN_ADDRESS,
  FF_INTERVAL,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  rateLimitsDefault,
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
      BASE_TOKEN_ADDRESS, //Base Token
      REBALANCE_INTERVAL,
      FF_INTERVAL,
      sanctionsContractAddress, //sanctions but just testing
      wallet.address,
      wallet.address,
      rateLimitsDefault.withdraw,
      rateLimitsDefault.deposit,
      rateLimitsDefault.period,
    ],
    vanityConfig.factoryAddress,
    false,
    "contracts/vaults/TokenFactory.sol:TokenFactory"
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
    false,
    "contracts/vaults/SmartToken.sol:SmartToken"
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
    false,
    "contracts/vaults/SmartToken.sol:SmartToken"
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
    false,
    "contracts/orchestrator/Orchestrator.sol:Orchestrator"
  );

  await tokenFactoryInstance.initializeOrchestrator(Orchestator);
  console.log("Orchestrator Intializied!");

  // deploy atomicSwap
  const AtomicTransaction = await deployUUPSviaCreate3(
    "AtomicTransaction",
    pxSalt.AtomicTx.saltStr, //salt
    [SmartXComplete, SmartYComplete, BASE_TOKEN_ADDRESS, wallet.address],
    vanityConfig.factoryAddress,
    false,
    "contracts/helper/AtomicTransaction.sol:AtomicTransaction"
  );

  console.log(
    `AtomicTransaction deployed at ProxyAddress:${AtomicTransaction}`
  );
}

main();
