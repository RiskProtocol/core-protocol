//import { ethers } from "ethers-v6";
import { ethers } from "hardhat";
import { getDeployedAddress2 } from "../lib/utils";

export async function get(
  factoryaddress: string,
  wallet: any,
  desiredPrefix: string,
  countNum: number
) {
  let count = 0;
  for (let salt = 0; ; salt++) {
    let saltEncoded = ethers.utils.formatBytes32String(`${salt}`);

    // const instanceOfFactory = await new ethers.Contract(
    //   factoryaddress,
    //   factoryJson.abi,
    //   wallet
    // );
    const instanceOfFactory = await ethers.getContractAt(
      "SKYBITCREATE3Factory", //@todo rename later
      factoryaddress
    );

    const proxyAddress = await getDeployedAddress2(
      instanceOfFactory,
      wallet,
      saltEncoded
    );

    console.log(`L77777::::proxyAddress:::${proxyAddress}`);

    if (proxyAddress.toLowerCase().startsWith(`0x${desiredPrefix}`)) {
      console.log(`L322222222222:::::${proxyAddress}:::::salt:${salt}`);

      if (count === countNum) {
        const saltStr = `${salt}`;
        return { proxyAddress, saltStr };
      }
      count++;
    }
  }
}
