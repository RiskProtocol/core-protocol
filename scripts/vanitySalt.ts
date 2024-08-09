import vanityConfig from "./vanityConfig.json";
import { get } from "./utils/getVanityAddressSalt";
import { ethers } from "hardhat";
import fs from "fs";

async function run() {
  //getting vanity address for tokenFactory, using privatekey in hardhat
  //config
  //run using hardhat
  const [wallet] = await ethers.getSigners();
  console.log(`wallet address : ${wallet.address}`);

  const tokenFactoryPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.tokenFactory.desiredPrefix,
    0
  );
  const SmartXPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.smartTokenX.desiredPrefix,
    1
  );
  const SmartYPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.smartTokenY.desiredPrefix,
    2
  );
  const OrchestratorPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.orchestrator.desiredPrefix,
    3
  );
  const AtomicSwapPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.atomicTx.desiredPrefix,
    4
  );
  const WxPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.wX.desiredPrefix,
    5
  );
  const WyPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    vanityConfig.wY.desiredPrefix,
    6
  );

  console.log(
    `tokenFactoryPxAddress address: ${JSON.stringify(tokenFactoryPxAddress)}\n`
  );
  console.log(`SmartXPxAddress address: ${JSON.stringify(SmartXPxAddress)}\n`);
  console.log(`SmartYPxAddress address: ${JSON.stringify(SmartYPxAddress)}\n`);
  console.log(
    `OrchestratorPxAddress address: ${JSON.stringify(OrchestratorPxAddress)}\n`
  );
  console.log(
    `AtomicSwapPxAddress address: ${JSON.stringify(AtomicSwapPxAddress)}\n`
  );
  console.log(
    `WxPxAddress address: ${JSON.stringify(WxPxAddress)}\n`
  );

  console.log(
    `WyPxAddress address: ${JSON.stringify(WyPxAddress)}\n`
  );


  const ContractSalts = {
    tokenFactory: tokenFactoryPxAddress,
    SmartTokenX: SmartXPxAddress,
    SmartTokenY: SmartYPxAddress,
    Orchestator: OrchestratorPxAddress,
    AtomicTx: AtomicSwapPxAddress,
    wX: WxPxAddress,
    wY: WyPxAddress,
  };

  const jsonContent = JSON.stringify(ContractSalts, null, 2);
  const filename = "ContractSalts.json";
  // Write the JSON string to a file
  fs.writeFile(filename, jsonContent, "utf8", function (err) {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }

    console.log(`JSON file has been saved as ${filename}`);
  });
}
run();
