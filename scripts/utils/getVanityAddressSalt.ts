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

    const instanceOfFactory = await ethers.getContractAt(
      "TRPCREATE3Factory",
      factoryaddress
    );

    const proxyAddress = await getDeployedAddress2(
      instanceOfFactory,
      wallet,
      saltEncoded
    );

    console.log(`::::proxyAddress:::${proxyAddress}`);

    if (proxyAddress.toLowerCase().startsWith(`0x${desiredPrefix}`)) {
      console.log(`:::::${proxyAddress}:::::salt:${salt}\n`);

      if (count === countNum) {
        const saltStr = `${salt}`;
        return { proxyAddress, saltStr };
      }
      count++;
    }
  }
}
