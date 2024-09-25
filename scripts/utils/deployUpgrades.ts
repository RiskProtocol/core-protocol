import { ethers, network } from "hardhat";
import path from "path";
import fs from "fs";
import { promptUser } from "../../helper-hardhat-config";
import kleur from "kleur";
import { verifyContract } from "../lib/utils";

async function main() {
  try {
    const [wallet] = await ethers.getSigners();

    //user checklist
    console.log(kleur.bgMagenta("Upgrade A Contract"));
    const contractToDeploy = await promptUser(
      kleur.bgBlue("What contract would you like to upgrade ?")
    );

    const deployableContracts = [
      "TokenFactory",
      "SmartToken",
      "Orchestrator",
      "AtomicTransaction",
      "wrappedSmartToken",
    ];
    const contractsPath: contractsPath = {
      TokenFactory: "contracts/vaults/TokenFactory.sol:TokenFactory",
      SmartToken: "contracts/vaults/SmartToken.sol:SmartToken",
      Orchestrator: "contracts/orchestrator/Orchestrator.sol:Orchestrator",
      AtomicTransaction:
        "contracts/helper/AtomicTransaction.sol:AtomicTransaction",
      wrappedSmartToken:
        "contracts/vaults/wrapped/WrappedSmartToken.sol:wrappedSmartToken",
    };

    if (!deployableContracts.includes(contractToDeploy)) {
      console.log(
        kleur.bgRed(
          `Invalid contract name. Please use one of the following: ${deployableContracts}`
        )
      );
      return;
    }

    const proxyContractAddress = await promptUser(
      kleur.bgBlue("What is the contract address?")
    );

    console.log(kleur.green(`Contract to upgrade: ${contractToDeploy}`));
    console.log(kleur.green(`Contract address: ${proxyContractAddress}`));

    const preconfirmation = await promptUser(
      kleur.bgBlue("Are these values correct? (y/n): ")
    );

    if (preconfirmation.toLowerCase() !== "y") {
      console.log(kleur.bgRed("Aborting script."));
      return;
    }
    //user validation
    console.log(kleur.bgMagenta("Deploying the Vanity Factory"));
    console.log(
      kleur.bgBlue("Please verify the following values are correct:")
    );
    console.log(
      kleur.yellow(`Wallet Address:\t\t ${kleur.green(wallet.address)}`)
    );
    console.log(
      kleur.yellow(
        `Network Name:\t\t ${kleur.green(
          JSON.stringify(ethers.provider.network, null, 2)
        )}`
      )
    );

    const confirmation = await promptUser(
      kleur.bgBlue("Are these values correct? (y/n): ")
    );

    if (confirmation.toLowerCase() !== "y") {
      console.log(kleur.bgRed("Aborting script."));
      return;
    }

    const contractFactory = await ethers.getContractFactory(contractToDeploy);
    const contractDeployed = await contractFactory.deploy();

    //verfiy the contract is deployed
    await contractDeployed.deployed();

    if (![`hardhat`, `localhost`].includes(network.name)) {
      //verify the contract code
      await verifyContract(
        contractDeployed.address,
        [],
        contractsPath[contractToDeploy]
      ); //  verifies implementation
    }

    console.log(
      kleur.bgGreen(
        `Contract Implementation deployed to: ${contractDeployed.address}`
      )
    );

    const ContractToUpgrade = await ethers.getContractFactory(contractToDeploy);
    const contractToUpgrade = ContractToUpgrade.attach(proxyContractAddress);

    //upgrade the contract
    const upgradeTx = await contractToUpgrade.upgradeTo(
      contractDeployed.address
    );
    await upgradeTx.wait();
    console.log(
      kleur.bgGreen(`Contract Upgraded to: ${contractDeployed.address}`)
    );
  } catch (error) {
    console.error(kleur.bgRed(error as string));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


type contractsPath = {
  [key: string]: string;
};
