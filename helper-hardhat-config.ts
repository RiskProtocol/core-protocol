import { Signer, utils } from "ethers";

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
export const REBASE_INTERVAL = 1800; // 30 minutes
export const defaultOperators: string[] = [];
export const defaultRebaseData = {
  sequenceNumber: 1,
  isNaturalRebase: true,
  underlyingValue: INITIAL_PRICE,
  smartTokenXValue: SmartTokenXValue,
}
export const signRebase = async (signer: Signer, data: { sequenceNumber: number; isNaturalRebase: boolean; underlyingValue: string; smartTokenXValue: string;}) => {
  const types = ["uint256", "bool", "uint256", "uint256"];
  // Encode the data
  const encodedData = utils.defaultAbiCoder.encode(types, [
    data.sequenceNumber,
    data.isNaturalRebase,
    data.underlyingValue,
    data.smartTokenXValue,
  ]);
  // Hash the data
  const hashedData = utils.keccak256(encodedData);
  // Sign the data
  const signature = await signer.signMessage(utils.arrayify(hashedData));
  return { signature, encodedData };
}

export const feeCalculator = (assetBal1: bigint, mgmtFee: bigint) => {
  const depositCycle = REBASE_INTERVAL;
  const oneDay: bigint = BigInt(86400);
  const mgmtFeePerInterval: bigint =
    (BigInt(mgmtFee) * BigInt(REBASE_INTERVAL)) / oneDay;
  const scallingFactorMgmtFee = MULTIPLIER;
  return (
    (BigInt(depositCycle) * BigInt(mgmtFeePerInterval) * BigInt(assetBal1)) /
    BigInt(REBASE_INTERVAL) /
    BigInt(scallingFactorMgmtFee)
  );
};

export type RebaseElements = {
  BalanceFactorXY: BigInt;
  BalanceFactorUx: BigInt;
  BalanceFactorUy: BigInt;
};

export type UserRebaseElements = {
  netX: BigInt;
  netY: BigInt;
  Ux: BigInt;
  Uy: BigInt;
};

export const callculateRolloverAmount = (
  lastRebase: any,
  lastUserRebase: any,
  userLastRebaseInfo: any
) => {
  const netX =
    (BigInt(userLastRebaseInfo.netX) * BigInt(lastRebase.BalanceFactorXY)) /
    BigInt(lastUserRebase.BalanceFactorXY);
  const netY =
    (BigInt(userLastRebaseInfo.netY) * BigInt(lastRebase.BalanceFactorXY)) /
    BigInt(lastUserRebase.BalanceFactorXY);

  const uX =
    BigInt(
      BigInt(lastRebase.BalanceFactorUx - lastUserRebase.BalanceFactorUx) *
        BigInt(userLastRebaseInfo.netX)
    ) /
      BigInt(lastUserRebase.BalanceFactorXY) +
    BigInt(userLastRebaseInfo.Ux);
  const uY =
    BigInt(
      BigInt(lastRebase.BalanceFactorUy - lastUserRebase.BalanceFactorUy) *
        BigInt(userLastRebaseInfo.netY)
    ) /
      BigInt(lastUserRebase.BalanceFactorXY) +
    BigInt(userLastRebaseInfo.Uy);

  const newUserRebaseElements = {
    netX: netX,
    netY: netY,
    Ux: uX,
    Uy: uY,
  };

  return [netX + uX + uY, netY + uY + uX, newUserRebaseElements];
};
