import { ethers } from "hardhat";
import path from "path";
import fs from "fs";
import { deployConfig } from ".././deploy-config";
import { promptUser } from "../helper-hardhat-config";
import kleur from "kleur";

async function main() {
  const desiredNonce: number = deployConfig.walletNonce as number; //set the nonce to what is needed //todo:
  const FactoryName = "TRPCREATE3Factory";
  const jsonFilePath = path.join(__dirname, "vanityConfig.json");

  // Read the JSON file
  const data = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

  const [wallet] = await ethers.getSigners();

  //user checklist
  console.log(kleur.bgMagenta("Pre-deployment Checklist"));
  console.log(
    kleur.cyan("Has Base Token (Underlying) been updated in the config file?")
  );
  console.log(
    kleur.cyan("Has the Rebalance Interval been updated in the config file?")
  );
  console.log(
    kleur.cyan("Has the FF Interval been updated in the config file?")
  );
  console.log(
    kleur.cyan("Has the Sanctions Contract updated in the config file?")
  );
  console.log(kleur.cyan("Has the correct wallet been added in .env file?"));
  console.log(kleur.cyan("Has the vanity salt been generated?"));

  const preconfirmation = await promptUser(
    kleur.bgBlue("Are these values correct? (y/n): ")
  );

  if (preconfirmation.toLowerCase() !== "y") {
    console.log(kleur.bgRed("Aborting script."));
    return;
  }
  //user validation
  console.log(kleur.bgMagenta("Deploying the Vanity Factory"));
  console.log(kleur.bgBlue("Please verify the following values are correct:"));
  console.log(
    kleur.yellow(`Wallet Address:\t\t ${kleur.green(wallet.address)}`)
  );
  console.log(kleur.yellow(`Wallet Nonce:\t\t ${kleur.green(desiredNonce)}`));
  console.log(kleur.yellow(`Network Name:\t\t ${kleur.green(JSON.stringify(ethers.provider.network,null,2))}`));

  const confirmation = await promptUser(
    kleur.bgBlue("Are these values correct? (y/n): ")
  );

  if (confirmation.toLowerCase() !== "y") {
    console.log(kleur.bgRed("Aborting script."));
    return;
  }

  // Update the nonce to the desired value
  let currentNonce = await wallet.getTransactionCount();
  while (currentNonce < desiredNonce) {
    await sendEmptyTransaction(wallet);
    currentNonce++;
  }

  // Deploy the contract when the nonce matches the desired value
  const TRPCREATE3Factory = await ethers.getContractFactory(
    FactoryName,
    wallet
  );
  const trpCreate3 = await TRPCREATE3Factory.deploy();
  await trpCreate3.deployed();

  console.log("Factory deployed to:", trpCreate3.address);

  data.factoryAddress = trpCreate3.address;
  fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2));

  console.log("Updated JSON file with new factory address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function sendEmptyTransaction(wallet: any) {
  await wallet.sendTransaction({
    to: wallet.address, // empty tx
    value: 0,
  });
}
