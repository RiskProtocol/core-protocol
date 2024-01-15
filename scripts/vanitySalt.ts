import vanityConfig from "./vanityConfig.json";
import { get } from "./utils/getVanityAddressSalt";
import { ethers } from "hardhat";
import fs from "fs";

async function run(prefix: string) {
  //getting vanity address for tokenFactory, using privatekey in hardhat
  //config
  //run using hardhat
  const [wallet] = await ethers.getSigners();
  console.log(`wallet address : ${wallet.address}`);

  const tokenFactoryPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    prefix,
    0
  );
  const SmartXPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    prefix,
    1
  );
  const SmartYPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    prefix,
    2
  );
  const OrchestratorPxAddress = await get(
    vanityConfig.factoryAddress,
    wallet,
    prefix,
    3
  );

  console.log(
    `tokenFactoryPxAddress address: ${JSON.stringify(tokenFactoryPxAddress)}`
  );
  console.log(`SmartXPxAddress address: ${JSON.stringify(SmartXPxAddress)}`);
  console.log(`SmartYPxAddress address: ${JSON.stringify(SmartYPxAddress)}`);
  console.log(
    `OrchestratorPxAddress address: ${JSON.stringify(OrchestratorPxAddress)}`
  );

  const ContractSalts = {
    tokenFactory: tokenFactoryPxAddress,
    SmartTokenX: SmartXPxAddress,
    SmartTokenY: SmartYPxAddress,
    Orchestator: OrchestratorPxAddress,
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
run("d3");
