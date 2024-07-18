import { Signer, Wallet, utils } from "ethers";
import { ethers } from "hardhat";
import { KMSWallets } from "@web3-kms-signer/kms-wallets";
import * as core from "@web3-kms-signer/core";
import { KMSProviderAWS } from "@web3-kms-signer/kms-provider-aws";

export const developmentChains = ["localhost", "hardhat"];
export const MULTIPLIER = 1e18;
export const DECIMALS = "18";
export const INITIAL_PRICE = "2000000000000000000000"; // 2000, we then add the 18 decimals which is 18 zeros
export const SmartTokenXValue = "667000000000000000000"; // 667, we then add the 18 decimals which is 18 zeros
export const BASE_TOKEN_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const BASE_TOKEN_DECIMALS = 18;
export const TOKEN1_NAME = "RistP One";
export const TOKEN1_SYMBOL = "R1";
export const TOKEN2_NAME = "RistP Two";
export const TOKEN2_SYMBOL = "R2";
export const REBALANCE_INTERVAL = 7776000; // 90 days
export const FF_INTERVAL = 86400;
export const defaultOperators: string[] = [];
export const rateLimitsDefault = {
  deposit: ethers.constants.MaxUint256,
  withdraw: ethers.constants.MaxUint256,
  period: 1,
};
export const defaultRebalanceData = {
  sequenceNumber: 1,
  isNaturalRebalance: true,
  underlyingValue: INITIAL_PRICE,
  smartTokenXValue: SmartTokenXValue,
};
export const signRebalance = async (
  signer: Wallet,
  data: {
    sequenceNumber: number;
    isNaturalRebalance: boolean;
    underlyingValue: string;
    smartTokenXValue: string;
  }
) => {
  const types = ["uint256", "bool", "uint256", "uint256"];
  // Encode the data
  const encodedData = utils.defaultAbiCoder.encode(types, [
    data.sequenceNumber,
    data.isNaturalRebalance,
    data.underlyingValue,
    data.smartTokenXValue,
  ]);
  // Hash the data
  const hashedData = utils.keccak256(encodedData);

  const signKey = new ethers.utils.SigningKey(signer.privateKey);
  const sig = signKey.signDigest(hashedData);
  // Sign the data
  const signature = ethers.utils.joinSignature(sig); // await signer.signMessage(utils.arrayify(hashedData));
  return { signature, encodedData };
};

export const signFlashloan = async (
  signer: Wallet,
  data: {
    smartTokenXValue: number;
    smartTokenYValue: number;
    timestamp: number;
  }
) => {
  const types = ["uint256", "uint256", "uint256"];
  // Encode the data
  const encodedData = utils.defaultAbiCoder.encode(types, [
    data.smartTokenXValue,
    data.smartTokenYValue,
    data.timestamp,
  ]);
  // Hash the data
  const hashedData = utils.keccak256(encodedData);

  const signKey = new ethers.utils.SigningKey(signer.privateKey);
  const sig = signKey.signDigest(hashedData);
  // Sign the data
  const signature = ethers.utils.joinSignature(sig); // await signer.signMessage(utils.arrayify(hashedData));
  return { signature, encodedData };
};

export const feeCalculator = (assetBal1: bigint, mgmtFee: bigint) => {
  const depositCycle = REBALANCE_INTERVAL;
  const scallingFactorMgmtFee = MULTIPLIER;
  return (
    (BigInt(depositCycle) * BigInt(mgmtFee) * BigInt(assetBal1)) /
    BigInt(REBALANCE_INTERVAL) /
    BigInt(scallingFactorMgmtFee)
  );
};

export const feeCalculator2 = (
  assetBal1: bigint,
  mgmtFee: bigint,
  hourly = false
) => {
  if (hourly)
    return (
      (BigInt(mgmtFee / BigInt(24)) * BigInt(assetBal1)) / BigInt(MULTIPLIER)
    );
  return (BigInt(mgmtFee) * BigInt(assetBal1)) / BigInt(MULTIPLIER);
};

export const feeScalar = (mgmtFee: number, daysInRebalanceInterval: number) => {
  const dailyFee = 1 - (1 - mgmtFee) ** (1 / daysInRebalanceInterval);
  return {
    dailyFee: Math.round(dailyFee * MULTIPLIER).toString(),
    RebaseFee: Math.round(mgmtFee * MULTIPLIER).toString(),
  };
};
export type RebalanceElements = {
  BalanceFactorXY: BigInt;
  BalanceFactorUx: BigInt;
  BalanceFactorUy: BigInt;
};

export type UserRebalanceElements = {
  netX: BigInt;
  netY: BigInt;
  Ux: BigInt;
  Uy: BigInt;
};

export const callculateRolloverAmount = (
  lastRebalance: any,
  lastUserRebalance: any,
  userLastRebalanceInfo: any
) => {
  const netX =
    (BigInt(userLastRebalanceInfo.netX) *
      BigInt(lastRebalance.BalanceFactorXY)) /
    BigInt(lastUserRebalance.BalanceFactorXY);
  const netY =
    (BigInt(userLastRebalanceInfo.netY) *
      BigInt(lastRebalance.BalanceFactorXY)) /
    BigInt(lastUserRebalance.BalanceFactorXY);

  const uX =
    BigInt(
      BigInt(
        lastRebalance.BalanceFactorUx - lastUserRebalance.BalanceFactorUx
      ) * BigInt(userLastRebalanceInfo.netX)
    ) /
      BigInt(lastUserRebalance.BalanceFactorXY) +
    BigInt(userLastRebalanceInfo.Ux);
  const uY =
    BigInt(
      BigInt(
        lastRebalance.BalanceFactorUy - lastUserRebalance.BalanceFactorUy
      ) * BigInt(userLastRebalanceInfo.netY)
    ) /
      BigInt(lastUserRebalance.BalanceFactorXY) +
    BigInt(userLastRebalanceInfo.Uy);

  const newUserRebalanceElements = {
    netX: netX,
    netY: netY,
    Ux: uX,
    Uy: uY,
  };

  return [netX + uX + uY, netY + uY + uX, newUserRebalanceElements];
};

export async function signAwsKMS(keyId: string, data: any, awsConfig: any) {
  const provider = new KMSProviderAWS(awsConfig);

  const types = ["uint256", "bool", "uint256", "uint256"];

  const encodedData = ethers.utils.defaultAbiCoder.encode(types, [
    data.sequenceNumber,
    data.isNaturalRebase,
    data.underlyingValue,
    data.smartTokenXValue,
  ]);

  const digestData = ethers.utils.keccak256(encodedData);
  const sign = new core.Signer(new KMSWallets(provider));
  const signature = await sign.signDigest({ keyId: keyId }, digestData);

  return { signature, digestData, encodedData };
}

export async function signFLashloanAwsKMS(keyId: string, data: any, awsConfig: any) {
  const provider = new KMSProviderAWS(awsConfig);

  const types = ["uint256", "uint256", "uint256"];
  // Encode the data
  const encodedData =  ethers.utils.defaultAbiCoder.encode(types, [
    data.smartTokenXValue,
    data.smartTokenYValue,
    data.timestamp,
  ]);

  const digestData = ethers.utils.keccak256(encodedData);
  const sign = new core.Signer(new KMSWallets(provider));
  const signature = await sign.signDigest({ keyId: keyId }, digestData);

  return { signature, digestData, encodedData };
}

export async function getEthereumAddress(keyId: string, awsConfig: any) {
  const provider = new KMSProviderAWS(awsConfig);
  return await new KMSWallets(provider).getAddressHex(keyId);
}
