import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  BASE_TOKEN_ADDRESS,
  rateLimitsDefault,
} from "../../helper-hardhat-config";
import { deployUUPSviaCreate3 } from "../../scripts/utils/deployer";
import { get } from "../../scripts/utils/getVanityAddressSalt";

developmentChains.includes(network.name)
  ? describe("Vanity Address Tests", async function () {
      let factoryAddress: string;
      let sanctionsContract: any;
      let underlyingToken: any;
      let vanity: any;

      describe("SmartToken Deployment", async function () {
        before(async function () {
          //deploy the factory contract
          const desired_nonce = 950;

          const FactoryName = "TRPCREATE3Factory";

          const [deployer] = await ethers.getSigners();

          const MockERC20TokenWithPermit = await ethers.getContractFactory(
            "MockERC20TokenWithPermit",
            deployer
          );
          underlyingToken = await MockERC20TokenWithPermit.deploy();
          await underlyingToken.deployed();

          // deploy sanctions list mock
          const SanctionsList = await ethers.getContractFactory(
            "MockSanctionContract",
            deployer
          );
          sanctionsContract = await SanctionsList.deploy();
          await sanctionsContract.deployed();
          let currentNonce = await deployer.getTransactionCount();
          while (currentNonce < desired_nonce) {
            await deployer.sendTransaction({
              to: deployer.address,
              value: 0,
            });
            currentNonce++;
          }
          console.log("Deployer nonce: ", currentNonce);
          const TRPCREATE3Factory = await ethers.getContractFactory(
            FactoryName,
            deployer
          );
          const trpCreate3 = await TRPCREATE3Factory.deploy();
          await trpCreate3.deployed();
          factoryAddress = trpCreate3.address;
          console.log("Factory deployed to:", trpCreate3.address);
        });
        it("Should get the vanity address salt", async function () {
          vanity = await getVanityAddressSalt(factoryAddress, "66");
          expect(vanity.tokenFactory.proxyAddress.startsWith("0x66"));
          expect(vanity.SmartTokenX.proxyAddress.startsWith("0x66"));
          expect(vanity.SmartTokenY.proxyAddress.startsWith("0x66"));
          expect(vanity.Orchestator.proxyAddress.startsWith("0x66"));
          expect(vanity.AtomicTx.proxyAddress.startsWith("0x66"));
        });
        it("Should deploy the factory", async function () {
          expect(factoryAddress).to.not.equal(0);

          const [wallet] = await ethers.getSigners();

          const sanctionsContractAddress =
            process.env.SANCTIONS_CONTRACT_ADDRESS;
          //deploying tokenFactory
          const TokenFactoryComplete = await deployUUPSviaCreate3(
            "TokenFactory",
            vanity.tokenFactory.saltStr, //salt
            [
              BASE_TOKEN_ADDRESS, //Base Token
              REBALANCE_INTERVAL,
              3600, //one hour
              sanctionsContractAddress, //sanctions but just testing
              wallet.address,
              wallet.address,
              rateLimitsDefault.withdraw,
              rateLimitsDefault.deposit,
              rateLimitsDefault.period,
              false,
            ],
            factoryAddress,
            false,
            "contracts/vaults/TokenFactory.sol:TokenFactory"
          );
          expect(TokenFactoryComplete).to.equal(
            vanity.tokenFactory.proxyAddress
          );
          //deploying SmartX
          const SmartXComplete = await deployUUPSviaCreate3(
            "SmartToken",
            vanity.SmartTokenX.saltStr, //salt
            [
              TOKEN1_NAME,
              TOKEN1_SYMBOL,
              TokenFactoryComplete,
              sanctionsContractAddress,
              true,
              wallet.address,
            ],
            factoryAddress,
            false,
            "contracts/vaults/SmartToken.sol:SmartToken"
          );
          expect(SmartXComplete).to.equal(vanity.SmartTokenX.proxyAddress);
          //deploying SmartY
          const SmartYComplete = await deployUUPSviaCreate3(
            "SmartToken",
            vanity.SmartTokenY.saltStr, //salt
            [
              TOKEN2_NAME,
              TOKEN2_SYMBOL,
              TokenFactoryComplete,
              sanctionsContractAddress,
              false,
              wallet.address,
            ],
            factoryAddress,
            false,
            "contracts/vaults/SmartToken.sol:SmartToken"
          );
          console.log(`Smart Y deployed at ProxyAddress:${SmartYComplete}`);
          expect(SmartYComplete).to.equal(vanity.SmartTokenY.proxyAddress);
          //initializeSMART
          const tokenFactoryInstance = await ethers.getContractAt(
            "TokenFactory",
            TokenFactoryComplete,
            wallet
          );

          await tokenFactoryInstance.initializeSMART(
            SmartXComplete,
            SmartYComplete
          );

          expect(await tokenFactoryInstance.getSmartTokenAddress(0)).to.equal(
            SmartXComplete
          );
          // deploy orchestrator
          const Orchestator = await deployUUPSviaCreate3(
            "Orchestrator",
            vanity.Orchestator.saltStr, //salt
            [TokenFactoryComplete, wallet.address],
            factoryAddress,
            false,
            "contracts/orchestrator/Orchestrator.sol:Orchestrator"
          );

          expect(Orchestator).to.equal(vanity.Orchestator.proxyAddress);
          await tokenFactoryInstance.initializeOrchestrator(Orchestator);

          //deploy AtomicTx

          const AtomicTxComplete = await deployUUPSviaCreate3(
            "AtomicTransaction",
            vanity.AtomicTx.saltStr,
            [
              SmartXComplete,
              SmartYComplete,
              BASE_TOKEN_ADDRESS,
              wallet.address,
            ],
            factoryAddress,
            false,
            "contracts/vaults/AtomicTransaction.sol:AtomicTransaction"
          );

          expect(AtomicTxComplete).to.equal(vanity.AtomicTx.proxyAddress);
        });
      });
    })
  : describe.skip;

async function getVanityAddressSalt(
  factoryAddress: any,
  desiredPrefix: string
) {
  const [wallet] = await ethers.getSigners();
  console.log(`wallet address : ${wallet.address}`);

  const tokenFactoryPxAddress = await get(
    factoryAddress,
    wallet,
    desiredPrefix,
    0
  );
  const SmartXPxAddress = await get(factoryAddress, wallet, desiredPrefix, 1);
  const SmartYPxAddress = await get(factoryAddress, wallet, desiredPrefix, 2);
  const OrchestratorPxAddress = await get(
    factoryAddress,
    wallet,
    desiredPrefix,
    3
  );

  const AtomicTx = await get(factoryAddress, wallet, desiredPrefix, 4);

  return {
    tokenFactory: tokenFactoryPxAddress,
    SmartTokenX: SmartXPxAddress,
    SmartTokenY: SmartYPxAddress,
    Orchestator: OrchestratorPxAddress,
    AtomicTx: AtomicTx,
  };
}
