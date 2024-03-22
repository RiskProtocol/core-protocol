import { ethers } from "ethers-v6";

export const verifyContract = async (
  address: any,
  constructorArguments: any,
  contract: any = null
) => {
  console.log(`Verifying contract...`);
  try {
    if (contract !== null) {
      //@ts-ignore
      await run(`verify:verify`, {
        address,
        constructorArguments,
        contract: `${contract}`,
      });
    } else {
      //@ts-ignore
      await run(`verify:verify`, {
        address,
        constructorArguments,
      });
    }

    console.log(`Contract verified!`);
  } catch (err) {
    console.error(err);
  }
};

export const getDeployedAddress2 = async (
  instanceOfFactory: any,
  wallet: any,
  salt: any
) => {
  return await instanceOfFactory.getDeployed(wallet.address, salt);
};

export const CREATE3Deploy2 = async (
  addressOfFactory: any,
  contractFactory: any,
  contractToDeployName: any,
  constructorArguments: any,
  salt: any,
  wallet: any
) => {
  try {
  } catch (error) {}
  const { ethers } = require(`hardhat`);

  const bytecodeWithArgs = (
    await contractFactory.getDeployTransaction(...constructorArguments)
  ).data;

  const instanceOfFactory = await ethers.getContractAt(
    "TRPCREATE3Factory",
    addressOfFactory
  );

  console.log(`salt: ${salt}`);

  const addressExpected = await getDeployedAddress2(
    instanceOfFactory,
    wallet,
    salt
  );
  console.log(
    `Expected address of ${contractToDeployName} using factory at ${addressOfFactory}: ${addressExpected}`
  );

  if ((await ethers.provider.getCode(addressExpected)) !== `0x`) {
    console.log(
      `The contract already exists at ${addressExpected}. Change the salt if you want to deploy your contract to a different address.`
    );
    return addressExpected;
  }

  // Call DEPLOY
  console.log(`now calling deploy() in the CREATE3 factory...`);
  const txResponse = await deploy2(instanceOfFactory, bytecodeWithArgs, salt);
  let tx = await txResponse.wait();
  console.log("transaction hash ::" + JSON.stringify(tx.transactionHash));

  const instanceOfDeployedContract = contractFactory.attach(addressExpected);
  console.log(
    `${contractToDeployName} was successfully deployed to ${instanceOfDeployedContract.address}`
  );
  if (instanceOfDeployedContract.address === addressExpected)
    console.log(`The actual deployment address matches the expected address`);

  return instanceOfDeployedContract;
};

const deploy2 = async (instanceOfFactory: any, bytecode: any, salt: any) => {
  return await instanceOfFactory.deploy(salt, bytecode);
};
