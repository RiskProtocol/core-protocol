import { DeployFunction } from "hardhat-deploy/types";
import {
  BASE_TOKEN_ADDRESS,
  REBASE_INTERVAL,
} from "../helper-hardhat-config";
const { ethers, upgrades } = require("hardhat");

const func: DeployFunction = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  let baseTokenAddress: string;

  if (['local', 'development'].includes(process.env.ENVIRONMENT!)) {
    const mockERC20TokenWithPermit = await deployments.get(
      "MockERC20TokenWithPermit"
    );
    baseTokenAddress = mockERC20TokenWithPermit.address;
  } else {
    baseTokenAddress = BASE_TOKEN_ADDRESS;
  }

  let sanctionsContractAddress: string;

  if (process.env.ENVIRONMENT === "local") {
    const mockSanctionContract = await deployments.get("MockSanctionContract");
    sanctionsContractAddress = mockSanctionContract.address;
  } else {
    sanctionsContractAddress = process.env.SANCTIONS_CONTRACT_ADDRESS!;
  }

  // Deploying the contract as a UUPS upgradeable contract.
  const TokenFactoryContract = await ethers.getContractFactory("TokenFactory");
  const TokenFactory = await upgrades.deployProxy(
    TokenFactoryContract,
    [
      baseTokenAddress,
      REBASE_INTERVAL,
      sanctionsContractAddress,
      deployer,
    ],
    { initializer: "initialize", kind: "uups" }
  );
  await deployments.save("TokenFactory", TokenFactory);
  log(`TokenFactory deployed at ${TokenFactory.address}`);
  await TokenFactory.deployed();
  log(
    `TokenFactory implementation deployed at ${await upgrades.erc1967.getImplementationAddress(
      TokenFactory.address
    )}`
  );

  log("TokenFactory Deployed!");
  log("----------------------------------");
};
export default func;
func.tags = ["all"];
