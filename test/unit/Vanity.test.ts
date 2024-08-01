import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  rateLimitsDefault,
  getEthereumAddress,
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
          expect(vanity.wX.proxyAddress.startsWith("0x66"));
          expect(vanity.wY.proxyAddress.startsWith("0x66"));
        });
        it("Should deploy the factory", async function () {
          expect(factoryAddress).to.not.equal(0);

          const [wallet] = await ethers.getSigners();

          // const sanctionsContractAddress =
          //   process.env.SANCTIONS_CONTRACT_ADDRESS;
          //deploying tokenFactory
          const TokenFactoryComplete = await deployUUPSviaCreate3(
            "TokenFactory",
            vanity.tokenFactory.saltStr, //salt
            [
              underlyingToken.address, //Base Token
              REBALANCE_INTERVAL,
              3600, //one hour
              sanctionsContract.address, //sanctions but just testing
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
              sanctionsContract.address,
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
              sanctionsContract.address,
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
              underlyingToken.address,
              wallet.address,
            ],
            factoryAddress,
            false,
            "contracts/vaults/AtomicTransaction.sol:AtomicTransaction"
          );

          expect(AtomicTxComplete).to.equal(vanity.AtomicTx.proxyAddress);

          //Wrapper X and Y
          //we first deploy the wrapperFactory
          //deploy wrapped template
          const RiskWrappedTokenContract = await ethers.getContractFactory(
            "wrappedSmartToken",
            wallet
          );
          //deploy the template
          const wrappedTemplate = await RiskWrappedTokenContract.deploy();

          //deploy the wrapper factory
          const WrapperFactoryContract = await ethers.getContractFactory(
            "WrapperFactory",
            wallet
          );
          const WrapperFactory = await upgrades.deployProxy(
            WrapperFactoryContract,
            [wallet.address, wrappedTemplate.address],
            { initializer: "initialize", kind: "uups" }
          );

          await WrapperFactory.deployed();

          //we now deposit some underlying tokens to the tokenFactory to get some SMARTs
          await underlyingToken.approve(
            tokenFactoryInstance.address,
            ethers.utils.parseEther("100")
          );

          expect(
            await underlyingToken.allowance(
              wallet.address,
              tokenFactoryInstance.address
            )
          ).to.equal(ethers.utils.parseEther("100"));
          //instance of SMArt X
          const smartXInstance = await ethers.getContractAt(
            "SmartToken",
            SmartXComplete,
            wallet
          );
          const smartYInstance = await ethers.getContractAt(
            "SmartToken",
            SmartYComplete,
            wallet
          );

          await smartXInstance.mint(
            ethers.utils.parseEther("1"),
            wallet.address
          );

          //deploy wrapped X
          await smartXInstance.approve(
            WrapperFactory.address,
            ethers.constants.MaxUint256
          );
          await smartYInstance.approve(
            WrapperFactory.address,
            ethers.constants.MaxUint256
          );

          //get KMS items
          /////////////////////////////
          ///KMS
          /////////////////////////////
          const awsConfig = {
            region: process.env.AWS_REGION || "eu-north-1",
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
            },
          };
          const keyId = process.env.KMS_KEY_ID as string;
          const kmsAddress = await getEthereumAddress(keyId, awsConfig);

          const timeout = 1000 * 60 * 5; // 5 minutes

          //deploy Wrapped X
          const wXAddress = await WrapperFactory.create(
            smartXInstance.address,
            smartYInstance.address,
            "Wrapped SmartToken X",
            "wX",
            1,
            true,
            wallet.address,
            kmsAddress,
            timeout,
            sanctionsContract.address,
            factoryAddress,
            ethers.utils.formatBytes32String(vanity.wX.saltStr)
          );
          const wYaddress = await WrapperFactory.create(
            smartYInstance.address,
            smartXInstance.address,
            "Wrapped SmartToken Y",
            "wY",
            1,
            false,
            wallet.address,
            kmsAddress,
            timeout,
            sanctionsContract.address,
            factoryAddress,
            ethers.utils.formatBytes32String(vanity.wY.saltStr)
          );

          expect(await WrapperFactory.getWrappedSmartTokens(true)).to.equal(
            vanity.wX.proxyAddress
          );
          expect(await WrapperFactory.getWrappedSmartTokens(false)).to.equal(
            vanity.wY.proxyAddress
          );

          const wX = await ethers.getContractAt(
            "wrappedSmartToken",
            vanity.wX.proxyAddress,
            wallet
          );
          const wY = await ethers.getContractAt(
            "wrappedSmartToken",
            vanity.wY.proxyAddress,
            wallet
          );
          expect(await wX.totalSupply()).to.equal(1000);
          expect(await wY.totalSupply()).to.equal(1000);
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

  const wX = await get(factoryAddress, wallet, desiredPrefix, 5);
  const wY = await get(factoryAddress, wallet, desiredPrefix, 6);

  return {
    tokenFactory: tokenFactoryPxAddress,
    SmartTokenX: SmartXPxAddress,
    SmartTokenY: SmartYPxAddress,
    Orchestator: OrchestratorPxAddress,
    AtomicTx: AtomicTx,
    wX: wX,
    wY: wY,
  };
}
