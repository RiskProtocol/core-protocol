export interface networkConfigItem {
  priceFeed?: string;
  blockConfirmations?: number;
}

export interface networkConfigInfo {
  [key: string]: networkConfigItem;
}

export const networkConfig: networkConfigInfo = {
  goerli: {
    priceFeed: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    blockConfirmations: 6,
  },
  polygon: {
    priceFeed: "0xF9680D99D6C9589e2a93a78A04A279e509205945",
  },
  localhost: {},
  hardhat: {},
};

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
export const REBASE_INTERVAL = 7890000; // 3months in seconds
export const defaultOperators: string[] = [];
export const sanctionsContractAddress =
  "0x40C57923924B5c5c5455c48D93317139ADDaC8fb"; //polygon network
export const signersAddress = "0x786d956DBc070815F9b53a6dd03D38EDf33EE2C7"; //signer address on the webservice
export const encodedNaturalRebase1 = {
  signature:
    "0xe652346bfaac91a1e9c44f688f7ce773ff6e7e8739105bd8d31e3940e8f160b9479af0843926ae430d6964c31dcc386e34a140ab3ad020ad34e20c2660c64b851c",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000006c6b935b8bbd400000000000000000000000000000000000000000000000000024287c0615218c0000",
};
export const encodedNaturalRebase2 = {
  signature:
    "0xe40bc41bb552044e68b9da2a43d72389c99449106e3462537dc2f1a44c934c9f62d1db9e5f67df84f7dcdecf55247ae49ae8a0141fbba2822c88a5f4e9be22ab1b",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000002423dbc92e946aaaaa",
};

export const encodedNaturalRebase3 = {
  signature:
    "0x98ea77115dd6265c753ccde9648557a2b425dbd702d0cbb3e738970aa0544af3635dd7c7e33bd56102be22967651f7f89b82c752518b4fa0fb53913c9e3f42181c",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000002423dbc92e946aaaaa",
};
export const encodedEarlyRebase1 = {
  signature:
    "0xd4b4486376b04941f72556e3148edaf8d44c806a972fdc2257df51d553f3d7a20e9152e65b52fa963e6d464ef2e3f429201529b2676bb336e3b4af96cc9e57851c",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000002423dbc92e946aaaaa",
};

export const encodedEarlyRebase2 = {
  signature:
    "0x7dd6d5341c26e53ab85e1675be0d402c6241ca8f809101e831ef94307f06aafb695d146e88bebb9b224ba3c170b2fe6bb438204af8e3891a119fff455d10f0e21c",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000002423dbc92e946aaaaa",
};
export const encodedEarlyRebase3 = {
  signature:
    "0x68511d0bb601f492ef6d5cee19446f774a8f4d4147930f1a1abd8b9527fd2ed6490696b59dbb662c09baa8fc8c517c1d6a561b1801a159e790e9ce8dd2ef2e321b",
  encodedData:
    "0x0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000002423dbc92e946aaaaa",
};
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
