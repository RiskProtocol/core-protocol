import { ethers } from "ethers-v6";

export const rootRequire = (name: string) => {
  const path = require(`path`);
  const rootPath = path.resolve(__dirname, `..`);
  return require(`${rootPath}/${name}`);
};

export const deriveAddressOfSignerFromSig = async (
  txData: any,
  splitSig: any
) => {
  const txWithResolvedProperties = await ethers.resolveProperties(txData);
  const txUnsignedSerialized = ethers.Transaction.from(
    //@ts-ignore
    txWithResolvedProperties
  ).unsignedSerialized; // returns RLP encoded tx
  const txUnsignedSerializedHashed = ethers.keccak256(txUnsignedSerialized); // as specified by ECDSA
  const txUnsignedSerializedHashedBytes = ethers.getBytes(
    txUnsignedSerializedHashed
  ); // create binary hash
  const signatureSerialized = ethers.Signature.from(splitSig).serialized;
  const recoveredAddressOfSigner = ethers.recoverAddress(
    txUnsignedSerializedHashedBytes,
    signatureSerialized
  );
  return recoveredAddressOfSigner;
};

export const getContractAbi = async (contractAddress: string) => {
  const axios = require(`axios`);
  const httpResponse = await axios.get(
    `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${process.env.ETHERSCAN_API_KEY}`
  );
  // const httpResponse = await axios.get(`https://api-alfajores.celoscan.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${process.env.CELOSCAN_API_KEY}`)
  // const httpResponse = await axios.get(`https://testnet.snowtrace.io/api?module=contract&action=getabi&address=${contractAddress}&apikey=${process.env.SNOWTRACE_API_KEY}`)
  // console.log(`httpResponse.data: ${JSON.stringify(httpResponse.data, null, 2)}`)
  return httpResponse.data.result;
};

export const verifyContract = async (
  address: any,
  constructorArguments: any
) => {
  console.log(`Verifying contract...`);
  try {
    //@ts-ignore
    await run(`verify:verify`, {
      address,
      constructorArguments,
    });

    console.log(`Contract verified!`);
  } catch (err) {
    console.error(err);
  }
};

// const printNativeCurrencyBalance = async (
//   walletAddress: string,
//   decimals = `ether`
// ) =>
//   ethers.formatUnits(await ethers.provider.getBalance(walletAddress), decimals);

export const printContractBalanceOf = async (
  tokenContract: any,
  holderAddress: string,
  decimals = `ether`
) => ethers.formatUnits(await tokenContract.balanceOf(holderAddress), decimals);

export const getCreate3Address = async (
  addressOfFactory: string,
  callerAddress: string,
  salt: string
) => {
  //@ts-ignore
  const { evmVersion } = "shanghai"; //hre.config.solidity.compilers[0].settings

  const bytecodeOfCreateFactory =
    evmVersion === `shanghai`
      ? `0x601180600a5f395ff3fe365f6020373660205ff05f526014600cf3`
      : `0x601480600c6000396000f3fe3660006020373660206000f06000526014600cf3`; // This needs to be updated if CREATEFactory object in contracts/SKYBITCREATE3FactoryLite.yul is changed

  const keccak256Calculated = ethers.solidityPackedKeccak256(
    [`address`, `bytes32`],
    [callerAddress, salt]
  ); // same as ethers.keccak256(callerAddress + salt.slice(2)) //. Inputs must not be 0-padded.

  const addressOfCreateFactory = ethers.getCreate2Address(
    addressOfFactory,
    keccak256Calculated,
    ethers.keccak256(bytecodeOfCreateFactory)
  );

  return ethers.getCreateAddress({
    from: addressOfCreateFactory,
    nonce: 1, // nonce starts at 1 in contracts. Don't use getTransactionCount to get nonce because if a deployment is repeated with same inputs getCreate2Address would fail before it gets here.
  });
};

// module.exports = {
//   rootRequire,
//   deriveAddressOfSignerFromSig,
//   getContractAbi,
//   verifyContract,
//   // printNativeCurrencyBalance,
//   printContractBalanceOf,
//   getCreate3Address,
// };

export const getDeployedAddress = async (
  factoryToUse: any,
  instanceOfFactory: any,
  bytecode: any,
  wallet: any,
  salt: any
) => {
  switch (factoryToUse) {
    case `axelarnetwork`:
      return await instanceOfFactory.deployedAddress(
        bytecode,
        wallet.address,
        salt
      );
      break;
    case `SKYBITSolady`:
    case `ZeframLou`:
      return await instanceOfFactory.getDeployed(wallet.address, salt);
      break;
    case `SKYBITLite`:
    default:
      // const txData = {
      //   to: instanceOfFactory.target,
      //   data: bytecode.replace(`0x`, salt),
      // }
      // return await wallet.call(txData)

      const { getCreate3Address } = require(`./utils`);
      return await getCreate3Address(
        instanceOfFactory.address,
        wallet.address,
        salt
      );
  }
};
export const getDeployedAddress2 = async (
  instanceOfFactory: any,
  wallet: any,
  salt: any
) => {
  return await instanceOfFactory.getDeployed(wallet.address, salt);
};

export const CREATE3Deploy = async (
  factoryToUse: any,
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
  console.log(`bytecodeWithArgs: ${bytecodeWithArgs}`);

  const artifactOfFactory = {
    abi: [
      {
        inputs: [
          {
            internalType: "bytes32",
            name: "salt",
            type: "bytes32",
          },
          {
            internalType: "bytes",
            name: "creationCode",
            type: "bytes",
          },
        ],
        name: "deploy",
        outputs: [
          {
            internalType: "address",
            name: "deployed",
            type: "address",
          },
        ],
        stateMutability: "payable",
        type: "function",
      },
      {
        inputs: [
          {
            internalType: "address",
            name: "deployer",
            type: "address",
          },
          {
            internalType: "bytes32",
            name: "salt",
            type: "bytes32",
          },
        ],
        name: "getDeployed",
        outputs: [
          {
            internalType: "address",
            name: "deployed",
            type: "address",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ],
  };
  const instanceOfFactory = await ethers.getContractAt(
    artifactOfFactory.abi,
    addressOfFactory
  );

  console.log(`salt: ${salt}`);

  const addressExpected = await getDeployedAddress(
    factoryToUse,
    instanceOfFactory,
    bytecodeWithArgs,
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
    return;
  }

  // const functionCallGasCost = await getGasEstimate(
  //   factoryToUse,
  //   instanceOfFactory,
  //   bytecodeWithArgs,
  //   wallet,
  //   salt
  // );
  // console.log(`functionCallGasCost: ${functionCallGasCost}`);
  const feeData = await ethers.provider.getFeeData();
  // console.log(`feeData: ${JSON.stringify(feeData)}`);
  // const gasFeeEstimate = feeData.gasPrice * functionCallGasCost;
  // console.log(
  //   `gasFeeEstimate: ${ethers.utils.(
  //     gasFeeEstimate,
  //     `ether`
  //   )} of native currency`
  // );

  // Call DEPLOY
  console.log(`now calling deploy() in the CREATE3 factory...`);
  const txResponse = await deploy(
    factoryToUse,
    instanceOfFactory,
    bytecodeWithArgs,
    wallet,
    salt,
    feeData
  );

  console.log(JSON.stringify(await txResponse.wait()));

  const instanceOfDeployedContract = contractFactory.attach(addressExpected);
  console.log(
    `${contractToDeployName} was successfully deployed to ${instanceOfDeployedContract.address}`
  );
  if (instanceOfDeployedContract.address === addressExpected)
    console.log(`The actual deployment address matches the expected address`);

  return instanceOfDeployedContract;
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
    "SKYBITCREATE3Factory",
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

  console.log(JSON.stringify(await txResponse.wait()));

  const instanceOfDeployedContract = contractFactory.attach(addressExpected);
  console.log(
    `${contractToDeployName} was successfully deployed to ${instanceOfDeployedContract.address}`
  );
  if (instanceOfDeployedContract.address === addressExpected)
    console.log(`The actual deployment address matches the expected address`);

  return instanceOfDeployedContract;
};
// const getArtifactOfFactory = (factoryToUse) => {
//   let savedArtifactFilePath
//   switch (factoryToUse) {
//     case `ZeframLou`:
//       savedArtifactFilePath = `artifacts-saved/@SKYBITDev3/ZeframLou-create3-factory/src/CREATE3Factory.sol/CREATE3Factory.json`
//       break
//     case `axelarnetwork`:
//       savedArtifactFilePath = `artifacts-saved/@axelar-network/axelar-gmp-sdk-solidity/contracts/deploy/Create3Deployer.sol/Create3Deployer.json`
//       break
//     case `SKYBITSolady`:
//       savedArtifactFilePath = `artifacts-saved/contracts/SKYBITCREATE3Factory.sol/SKYBITCREATE3Factory.json`
//       break
//     case `SKYBITLite`:
//     default:
//       return { abi: [] }
//   }
//   const { rootRequire } = require(`./utils`) // using saved artifact instead of the automatically created one}
//   return rootRequire(savedArtifactFilePath)
// }
const getGasEstimate = async (
  factoryToUs: any,
  instanceOfFactory: any,
  bytecode: any,
  wallet: any,
  salt: any
) => {
  const txData = {
    to: instanceOfFactory.address,
    data: bytecode.replace(`0x`, salt),
  };
  return await wallet.estimateGas(txData);
};

const deploy = async (
  factoryToUse: any,
  instanceOfFactory: any,
  bytecode: any,
  wallet: any,
  salt: any,
  feeData: any
) => {
  delete feeData.gasPrice;

  switch (factoryToUse) {
    case `axelarnetwork`:
      return await instanceOfFactory.deploy(bytecode, salt, {
        gaslimit: "30000000",
      });
      break;
    case `SKYBITSolady`:
    case `ZeframLou`:
      return await instanceOfFactory.deploy(salt, bytecode);
      break;
    case `SKYBITLite`:
    default:
      const txData = {
        to: instanceOfFactory.address,
        data: bytecode.replace(`0x`, salt),
      };
      return await wallet.sendTransaction(txData, { gaslimit: "30000000" });
  }
};
const deploy2 = async (instanceOfFactory: any, bytecode: any, salt: any) => {
  return await instanceOfFactory.deploy(salt, bytecode);
};
