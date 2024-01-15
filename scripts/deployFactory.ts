import { ethers } from "hardhat";
import path from "path";
import fs from "fs";

async function main() {
  const desiredNonce: number = 950; //set the nonce to what is needed
  const FactoryName = "SKYBITCREATE3Factory";
  const jsonFilePath = path.join(__dirname, "vanityConfig.json");

  // Read the JSON file
  const data = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

  const [wallet] = await ethers.getSigners();

  // Update the nonce to the desired value
  let currentNonce = await wallet.getTransactionCount();
  while (currentNonce < desiredNonce) {
    await sendEmptyTransaction(wallet);
    currentNonce++;
  }

  // Deploy the contract when the nonce matches the desired value
  const SKYBITCREATE3Factory = await ethers.getContractFactory(
    FactoryName,
    wallet
  );
  const skybitCreate3 = await SKYBITCREATE3Factory.deploy();
  await skybitCreate3.deployed();

  console.log("Factory deployed to:", skybitCreate3.address);

  data.factoryAddress = skybitCreate3.address;
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
