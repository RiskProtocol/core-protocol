import { ethers } from "hardhat";
import { deployUUPSviaCreate3 } from "./utils/deployer";
import vanityConfig from "./vanityConfig.json";
import pxSalt from "../ContractSalts.json";
import { deployConfig } from "../deploy-config";
import * as dotenv from "dotenv";
import kleur from "kleur";
import {promptUser} from "../helper-hardhat-config"
dotenv.config();

const BASE_TOKEN_ADDRESS = deployConfig.baseToken as string;
const FF_INTERVAL = deployConfig.FF_INTERVAL as number;
const REBALANCE_INTERVAL = deployConfig.REBALANCE_INTERVAL as number;
const TOKEN1_NAME = deployConfig.TOKEN1_NAME as string;
const TOKEN1_SYMBOL = deployConfig.TOKEN1_SYMBOL as string
const TOKEN2_NAME = deployConfig.TOKEN2_NAME as string;
const TOKEN2_SYMBOL = deployConfig.TOKEN2_SYMBOL as string;
const rateLimitsDefault = deployConfig.rateLimitsDefault;
const sanctionsContractAddress = deployConfig.sanctionsContract as string;

async function main() {
  const [wallet] = await ethers.getSigners();
  console.log(kleur.bgMagenta("Deploying the Core of Risk Protocol"));
  console.log(kleur.bgBlue("Please verify the following values are correct:"));
  console.log(kleur.yellow(`FF_INTERVAL:\t\t ${kleur.green(FF_INTERVAL)}`));
  console.log(kleur.yellow(`REBALANCE_INTERVAL:\t ${kleur.green(REBALANCE_INTERVAL)}`));
  console.log(kleur.yellow(`TOKEN1_NAME:\t\t ${kleur.green(TOKEN1_NAME)}`));
  console.log(kleur.yellow(`TOKEN1_SYMBOL:\t\t ${kleur.green(TOKEN1_SYMBOL)}`));
  console.log(kleur.yellow(`TOKEN2_NAME:\t\t ${kleur.green(TOKEN2_NAME)}`));
  console.log(kleur.yellow(`TOKEN2_SYMBOL:\t\t ${kleur.green(TOKEN2_SYMBOL)}`));
  console.log(kleur.yellow(`rateLimitsDefault:\t ${kleur.green(JSON.stringify(rateLimitsDefault, null, 2))}`));
  console.log(kleur.yellow(`sanctionsContractAddress: ${kleur.green(sanctionsContractAddress)}`));
  console.log(kleur.yellow(`Wallet Address:\t\t ${kleur.green(wallet.address)}`));

  const confirmation = await promptUser(kleur.bgBlue(("Are these values correct? (y/n): ")));

  if (confirmation.toLowerCase() !== "y") {
    console.log(kleur.bgRed("Aborting script."));
    return;
  }
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
      false
    ],
    vanityConfig.factoryAddress,
    true,
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
    true,
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
    true,
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
    true,
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
    true,
    "contracts/helper/AtomicTransaction.sol:AtomicTransaction"
  );

  console.log(
    `AtomicTransaction deployed at ProxyAddress:${AtomicTransaction}`
  );
}

main();


