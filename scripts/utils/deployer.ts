import { ethers, upgrades, network } from "hardhat";
import { CREATE3Deploy2, verifyContract } from "../lib/utils";

const proxyName = "UUPSProxy";
export async function deployUUPSviaCreate3(
  implementationContractName: string,
  saltStr: string,
  initializerArgs: any,
  factoryAddress: string,
  isVerifyEnabled: boolean
) {
  const salt = ethers.utils.formatBytes32String(saltStr);
  const [wallet] = await ethers.getSigners();

  //first we deploy implementation
  const ImplementationContract = await ethers.getContractFactory(
    implementationContractName
  );
  const implementationContract = await ImplementationContract.deploy();
  await implementationContract.deployed();
  const implementationAddress = implementationContract.address;
  console.log(
    `${implementationContractName} Implementation deployed to ${implementationAddress}\n`
  );

  //intance of proxy contract
  const ProxyContract = await ethers.getContractFactory(proxyName);

  const fragment = ImplementationContract.interface.getFunction(`initialize`);
  const initializerData = ImplementationContract.interface.encodeFunctionData(
    fragment,
    initializerArgs
  );
  const proxyConstructorArgs = [implementationAddress, initializerData];

  //deploy the proxy
  const proxy = await CREATE3Deploy2(
    factoryAddress,
    ProxyContract,
    proxyName,
    proxyConstructorArgs,
    salt,
    wallet
  );
  if (typeof proxy === "string") return proxy;
  const proxyAddress = proxy.address;

  const implAddress = await upgrades.erc1967.getImplementationAddress(
    proxyAddress
  );

  if (implementationAddress != implAddress) {
    console.log(
      `${implementationContractName}::For some reasons implementation address are not matching\n`
    );
  }
  if (isVerifyEnabled) {
    if (![`hardhat`, `localhost`].includes(network.name)) {
      console.log(
        `Waiting to ensure that it will be ready for verification on etherscan...`
      );
      const { setTimeout } = require(`timers/promises`);
      await setTimeout(20000);

      //
      await verifyContract(proxyAddress, proxyConstructorArgs); // also verifies implementation
    }
  }
  return proxyAddress;
}
