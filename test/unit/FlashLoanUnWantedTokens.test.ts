import { expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
  signRebalance,
  defaultRebalanceData,
  rateLimitsDefault,
  FF_INTERVAL,
  signFlashloan,
  getEthereumAddress,
  signFLashloanAwsKMS,
} from "../../helper-hardhat-config";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import { isAddress } from "ethers-v6";
import { get } from "../../scripts/utils/getVanityAddressSalt";

developmentChains.includes(network.name)
  ? describe("WrappedSmartTokens", async function () {
      async function deployTokenFixture() {
        const [deployer, tester] = await ethers.getSigners();

        const MockERC20TokenWithPermit = await ethers.getContractFactory(
          "MockERC20TokenWithPermit",
          deployer
        );
        const underlyingToken = await MockERC20TokenWithPermit.deploy();
        await underlyingToken.deployed();

        // deploy sanctions list mock
        const SanctionsList = await ethers.getContractFactory(
          "MockSanctionContract",
          deployer
        );
        const sanctionsContract = await SanctionsList.deploy();
        await sanctionsContract.deployed();

        const TokenFactory = await ethers.getContractFactory(
          "TokenFactory",
          deployer
        );

        let tokenFactory = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
          false,
        ]);
        await tokenFactory.deployed();

        // deploy devtoken 1
        const SmartToken1Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartToken1 = await upgrades.deployProxy(SmartToken1Factory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          true,
          deployer.address,
        ]);
        await SmartToken1.deployed();

        // deploy Smarttoken 2
        const SmartToken2Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const SmartToken2 = await upgrades.deployProxy(SmartToken2Factory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          false,
          deployer.address,
        ]);
        await SmartToken2.deployed();

        //deploy orchestrator
        const OrchestratorFactory = await ethers.getContractFactory(
          "Orchestrator",
          deployer
        );

        const Orchestrator = await upgrades.deployProxy(OrchestratorFactory, [
          tokenFactory.address,
          deployer.address,
        ]);
        await Orchestrator.deployed();

        //initialize smartz
        await tokenFactory.initializeSMART(
          SmartToken1.address,
          SmartToken2.address
        );

        await underlyingToken.approve(
          tokenFactory.address,
          ethers.utils.parseEther("100")
        );

        await SmartToken1.deposit(
          ethers.utils.parseEther("100"),
          deployer.address
        );

        //deploy wrapped template
        const RiskWrappedTokenContract = await ethers.getContractFactory(
          "wrappedSmartToken",
          deployer
        );
        //deploy the template
        const wrappedTemplate = await RiskWrappedTokenContract.deploy();

        //deploy the wrapper factory
        const WrapperFactoryContract = await ethers.getContractFactory(
          "WrapperFactory",
          deployer
        );
        const WrapperFactory = await upgrades.deployProxy(
          WrapperFactoryContract,
          [deployer.address, wrappedTemplate.address],
          { initializer: "initialize", kind: "uups" }
        );

        await WrapperFactory.deployed();

        //approve the factory to spend the underlying token

        await SmartToken1.approve(
          WrapperFactory.address,
          ethers.constants.MaxUint256
        );
        await SmartToken2.approve(
          WrapperFactory.address,
          ethers.constants.MaxUint256
        );

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

        //create3 factory
        const FactoryName = "TRPCREATE3Factory";
        const TRPCREATE3Factory = await ethers.getContractFactory(
          FactoryName,
          deployer
        );
        const trpCreate3 = await TRPCREATE3Factory.deploy();
        await trpCreate3.deployed();
        const factoryAddress = trpCreate3.address;

        const timeout = 1000 * 60 * 5; // 5 minutes

        const salt = await getVanityAddressSalt(factoryAddress, "00");
        // const  = ethers.utils.formatBytes32String("1");
        await WrapperFactory.create(
          SmartToken1.address,
          SmartToken2.address,
          "Wrapped SmartToken X",
          "wX",
          1,
          true,
          deployer.address,
          kmsAddress,
          timeout,
          sanctionsContract.address,
          ethers.constants.AddressZero,//factoryAddress,
          ethers.utils.formatBytes32String((salt).wX.saltStr)
        );
        await WrapperFactory.create(
          SmartToken2.address,
          SmartToken1.address,
          "Wrapped SmartToken Y",
          "wY",
          1,
          false,
          deployer.address,
          kmsAddress,
          timeout,
          sanctionsContract.address,
          ethers.constants.AddressZero,//factoryAddress,
          ethers.utils.formatBytes32String(((salt).wY.saltStr))
        );

        const wXAddr = await WrapperFactory.getWrappedSmartTokens(true);
        const wYAddr = await WrapperFactory.getWrappedSmartTokens(false);

        const wX = await ethers.getContractAt("wrappedSmartToken", wXAddr);
        const wY = await ethers.getContractAt("wrappedSmartToken", wYAddr);

        //flashloan receiver
        const mockFlashLoanReceiverFactory = await ethers.getContractFactory(
          "MockFlashLoanReceiver_UnwantedTokens",
          deployer
        );
        const flashloanReceiverX = await mockFlashLoanReceiverFactory.deploy(
          wX.address
        );
        await flashloanReceiverX.deployed();

        const flashloanReceiverY = await mockFlashLoanReceiverFactory.deploy(
          wY.address
        );
        await flashloanReceiverY.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          SmartToken1,
          SmartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          sanctionsContract,
          Orchestrator,
          flashloanReceiverX,
          flashloanReceiverY,
          wX,
          wY,
          RiskWrappedTokenContract,
          kmsAddress,
          awsConfig,
          keyId,
          WrapperFactory,
        };
      }

      describe("Wrapped Flash Loans Tests", async function () {
        it(`it should properly get the flashloan`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(flashloanReceiverX.address, repayAmt);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              loanAmt,
              signed.encodedData,
              signed.signature,
              "0x"
            )
          )
            .to.emit(wX, "FlashLoanExecuted")
            .withArgs(
              flashloanReceiverX.address,
              deployer.address,
              loanAmt,
              repayAmt,
              "0x"
            );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(repayAmt)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const repayAmtY = ethers.utils.parseEther("7");
          const loanAmtY = ethers.utils.parseEther("7");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(flashloanReceiverY.address, repayAmtY);
          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          // //price is assumed to be 50/50 -- no discounts

          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              loanAmtY,
              signed.encodedData,
              signed.signature,
              "0x"
            )
          )
            .to.emit(wY, "FlashLoanExecuted")
            .withArgs(
              flashloanReceiverY.address,
              deployer.address,
              loanAmtY,
              repayAmtY,
              "0x"
            );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(repayAmtY)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should properly get the flashloan, X is more expensive than Y- NO DISCOUNTS`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          // const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);

          const XValue = "100";
          const YValue = "50";

          const expectedRepayAmount = loanAmt
            .mul(ethers.utils.parseEther(XValue))
            .div(ethers.utils.parseEther(YValue));

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            expectedRepayAmount
          );
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: ethers.utils.parseEther(XValue),
              smartTokenYValue: ethers.utils.parseEther(YValue),
              timestamp: block.timestamp,
            },
            awsConfig
          );

          await wX.flashLoan(
            flashloanReceiverX.address,
            loanAmt,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(expectedRepayAmount)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const loanAmtY = ethers.utils.parseEther("7");
          const expectedRepayAmount2 = loanAmtY
            .mul(ethers.utils.parseEther(YValue))
            .div(ethers.utils.parseEther(XValue));
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(
            flashloanReceiverY.address,
            expectedRepayAmount2
          );
          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          // //price is assumed to be 50/50 -- no discounts

          await wY.flashLoan(
            flashloanReceiverY.address,
            loanAmtY,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(expectedRepayAmount2)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should properly get the flashloan, y is more expensive than x- NO DISCOUNTS`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          // const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);

          const XValue = "55";
          const YValue = "110";

          const expectedRepayAmount = loanAmt
            .mul(ethers.utils.parseEther(XValue))
            .div(ethers.utils.parseEther(YValue));

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            expectedRepayAmount
          );
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: ethers.utils.parseEther(XValue),
              smartTokenYValue: ethers.utils.parseEther(YValue),
              timestamp: block.timestamp,
            },
            awsConfig
          );

          await wX.flashLoan(
            flashloanReceiverX.address,
            loanAmt,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(expectedRepayAmount)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const loanAmtY = ethers.utils.parseEther("7");
          const expectedRepayAmount2 = loanAmtY
            .mul(ethers.utils.parseEther(YValue))
            .div(ethers.utils.parseEther(XValue));
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(
            flashloanReceiverY.address,
            expectedRepayAmount2
          );
          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          // //price is assumed to be 50/50 -- no discounts

          await wY.flashLoan(
            flashloanReceiverY.address,
            loanAmtY,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(expectedRepayAmount2)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should properly get the flashloan with discounts - Y is more expensive than X`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);

          const XValue = "55";
          const YValue = "110";
          const scaleFactor = ethers.utils.parseEther("1");

          const conversionRate = scaleFactor
            .mul(ethers.utils.parseEther(XValue))
            .div(ethers.utils.parseEther(YValue));

          const expectedRepayAmount = loanAmt
            .mul(conversionRate)
            .div(scaleFactor);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          // discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: ethers.utils.parseEther(XValue),
              smartTokenYValue: ethers.utils.parseEther(YValue),
              timestamp: block.timestamp,
            },
            awsConfig
          );
          //setting the discount rate

          const maxDiscountRate = ethers.utils.parseEther("0.5");

          await wX.setDiscountRate(
            block.timestamp,
            block.timestamp + 300,
            0,
            maxDiscountRate
          ); //upto 50% discount

          const getDiscountRate = await wX.getDiscountRate();
          expect(getDiscountRate.startTime).to.be.equal(block.timestamp);
          expect(getDiscountRate.endTime).to.be.equal(block.timestamp + 300);
          expect(getDiscountRate.discountMin).to.be.equal(0);
          expect(getDiscountRate.discountMax).to.be.equal(maxDiscountRate);

          //AT half time through the discount, the user should pay 50% of the 50% discount
          const discountRate = maxDiscountRate.div(2);

          const expectedRepayAmountWithDiscount = expectedRepayAmount
            .mul(scaleFactor.sub(discountRate))
            .div(ethers.utils.parseEther("1"));

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            expectedRepayAmountWithDiscount
          );

          //set the time to 50% discount
          // await time.increase(147);
          await time.setNextBlockTimestamp(block.timestamp + 150);

          await wX.flashLoan(
            flashloanReceiverX.address,
            loanAmt,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(expectedRepayAmountWithDiscount)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const loanAmtY = ethers.utils.parseEther("7");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);

          const conversionRateY = scaleFactor
            .mul(ethers.utils.parseEther(YValue))
            .div(ethers.utils.parseEther(XValue));
          const expectedRepayAmountY = loanAmtY
            .mul(conversionRateY)
            .div(scaleFactor);

          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          //setting the discount rate
          const maxDiscountRateY = ethers.utils.parseEther("0.3");
          await wY.setDiscountRate(
            block1.timestamp,
            block1.timestamp + 300,
            0,
            maxDiscountRateY
          ); //upto 30% discount

          const getDiscountRateY = await wY.getDiscountRate();
          expect(getDiscountRateY.startTime).to.be.equal(block1.timestamp);
          expect(getDiscountRateY.endTime).to.be.equal(block1.timestamp + 300);
          expect(getDiscountRateY.discountMin).to.be.equal(0);
          expect(getDiscountRateY.discountMax).to.be.equal(maxDiscountRateY);

          const discountRateY = maxDiscountRateY.div(3);
          const expectedRepayAmountYWithDiscount = expectedRepayAmountY
            .mul(scaleFactor.sub(discountRateY))
            .div(scaleFactor);

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(
            flashloanReceiverY.address,
            expectedRepayAmountYWithDiscount
          );

          //set the time to 10% discount
          await time.setNextBlockTimestamp(block1.timestamp + 100);
          await wY.flashLoan(
            flashloanReceiverY.address,
            loanAmtY,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(expectedRepayAmountYWithDiscount)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0")); //receiever already pockets the 10% discount
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should properly get the flashloan with discounts - X is more expensive than Y`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);

          const XValue = "220";
          const YValue = "110";
          const scaleFactor = ethers.utils.parseEther("1");

          const conversionRate = scaleFactor
            .mul(ethers.utils.parseEther(XValue))
            .div(ethers.utils.parseEther(YValue));

          const expectedRepayAmount = loanAmt
            .mul(conversionRate)
            .div(scaleFactor);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          // discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: ethers.utils.parseEther(XValue),
              smartTokenYValue: ethers.utils.parseEther(YValue),
              timestamp: block.timestamp,
            },
            awsConfig
          );
          //setting the discount rate

          const maxDiscountRate = ethers.utils.parseEther("0.5");

          await wX.setDiscountRate(
            block.timestamp,
            block.timestamp + 300,
            0,
            maxDiscountRate
          ); //upto 50% discount

          //AT half time through the discount, the user should pay 50% of the 50% discount
          const discountRate = maxDiscountRate.div(2);

          const expectedRepayAmountWithDiscount = expectedRepayAmount
            .mul(scaleFactor.sub(discountRate))
            .div(ethers.utils.parseEther("1"));

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            expectedRepayAmountWithDiscount
          );

          //set the time to 50% discount
          // await time.increase(147);
          await time.setNextBlockTimestamp(block.timestamp + 150);

          await wX.flashLoan(
            flashloanReceiverX.address,
            loanAmt,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(expectedRepayAmountWithDiscount)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const loanAmtY = ethers.utils.parseEther("7");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);

          const conversionRateY = scaleFactor
            .mul(ethers.utils.parseEther(YValue))
            .div(ethers.utils.parseEther(XValue));
          const expectedRepayAmountY = loanAmtY
            .mul(conversionRateY)
            .div(scaleFactor);

          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);

          //setting the discount rate
          const maxDiscountRateY = ethers.utils.parseEther("0.3");
          await wY.setDiscountRate(
            block1.timestamp,
            block1.timestamp + 300,
            0,
            maxDiscountRateY
          ); //upto 30% discount

          const discountRateY = maxDiscountRateY.div(3);
          const expectedRepayAmountYWithDiscount = expectedRepayAmountY
            .mul(scaleFactor.sub(discountRateY))
            .div(scaleFactor);

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(
            flashloanReceiverY.address,
            expectedRepayAmountYWithDiscount
          );

          //set the time to 10% discount
          await time.setNextBlockTimestamp(block1.timestamp + 100);
          await wY.flashLoan(
            flashloanReceiverY.address,
            loanAmtY,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(expectedRepayAmountYWithDiscount)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0")); //receiever already pockets the 10% discount
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should properly get the flashloan with discounts - Different start discounts`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const intialWxBal = await SmartToken1.balanceOf(wX.address);

          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);

          const XValue = "220";
          const YValue = "110";
          const scaleFactor = ethers.utils.parseEther("1");

          const conversionRate = scaleFactor
            .mul(ethers.utils.parseEther(XValue))
            .div(ethers.utils.parseEther(YValue));

          const expectedRepayAmount = loanAmt
            .mul(conversionRate)
            .div(scaleFactor);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          // discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: ethers.utils.parseEther(XValue),
              smartTokenYValue: ethers.utils.parseEther(YValue),
              timestamp: block.timestamp,
            },
            awsConfig
          );
          //setting the discount rate

          const maxDiscountRate = ethers.utils.parseEther("0.6");
          const minDiscountRate = ethers.utils.parseEther("0.1");

          await wX.setDiscountRate(
            block.timestamp,
            block.timestamp + 300,
            minDiscountRate,
            maxDiscountRate
          ); //upto 50% discount

          //AT half time through the discount, the user should pay 50% of the 50% discount
          const discountRate = minDiscountRate.add(
            maxDiscountRate.sub(minDiscountRate).div(2)
          );

          const expectedRepayAmountWithDiscount = expectedRepayAmount
            .mul(scaleFactor.sub(discountRate))
            .div(ethers.utils.parseEther("1"));

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            expectedRepayAmountWithDiscount
          );

          //set the time to 50% discount
          await time.setNextBlockTimestamp(block.timestamp + 150);

          await wX.flashLoan(
            flashloanReceiverX.address,
            loanAmt,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialWxBal.add(expectedRepayAmountWithDiscount)
          );
          expect(
            await SmartToken1.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(ethers.utils.parseEther("0"));
          expect(
            await SmartToken2.balanceOf(flashloanReceiverX.address)
          ).to.be.equal(loanAmt);

          // @note flash loan using wY
          await SmartToken2.approve(wY.address, ethers.constants.MaxUint256);

          await wY.deposit(ethers.utils.parseEther("10"));

          const intialWyBal = await SmartToken2.balanceOf(wY.address);

          const loanAmtY = ethers.utils.parseEther("7");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("7"));

          await flashloanReceiverY.isApprovedMeth(true);

          const conversionRateY = scaleFactor
            .mul(ethers.utils.parseEther(YValue))
            .div(ethers.utils.parseEther(XValue));
          const expectedRepayAmountY = loanAmtY
            .mul(conversionRateY)
            .div(scaleFactor);

          const blockNumber1 = await ethers.provider.getBlockNumber();
          const block1 = await ethers.provider.getBlock(blockNumber1);
          const minDiscountRateY = ethers.utils.parseEther("0.1");
          //setting the discount rate
          const maxDiscountRateY = ethers.utils.parseEther("0.5");
          await wY.setDiscountRate(
            block1.timestamp,
            block1.timestamp + 300,
            minDiscountRateY,
            maxDiscountRateY
          ); //upto 30% discount

          const discountRateY = minDiscountRateY.add(
            maxDiscountRateY.sub(minDiscountRate).div(4)
          );

          const expectedRepayAmountYWithDiscount = expectedRepayAmountY
            .mul(scaleFactor.sub(discountRateY))
            .div(scaleFactor);

          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken2.transfer(
            flashloanReceiverY.address,
            expectedRepayAmountYWithDiscount
          );

          //set the time to 10% discount
          await time.setNextBlockTimestamp(block1.timestamp + 75);
          await wY.flashLoan(
            flashloanReceiverY.address,
            loanAmtY,
            signed.encodedData,
            signed.signature,
            "0x"
          );

          expect(await SmartToken2.balanceOf(wY.address)).to.be.equal(
            intialWyBal.add(expectedRepayAmountYWithDiscount)
          );
          expect(
            await SmartToken2.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(ethers.utils.parseEther("0")); //receiever already pockets the 10% discount
          expect(
            await SmartToken1.balanceOf(flashloanReceiverY.address)
          ).to.be.equal(loanAmtY);
        });

        it(`it should revert if reciever has not approved the funds transfer`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));
          await wX.deposit(ethers.utils.parseEther("10"));

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );
          await SmartToken2.approve(wY.address, ethers.utils.parseEther("10"));
          await wY.deposit(ethers.utils.parseEther("10"));

          await flashloanReceiverX.isApprovedMeth(false);
          await flashloanReceiverY.isApprovedMeth(false);
          await SmartToken2.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("1")
          );
          await SmartToken1.transfer(
            flashloanReceiverY.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("10"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "FlashLoan__InsufficientUnderlying"
          );

          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("10"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wY,
            "FlashLoan__InsufficientUnderlying"
          );

          // Asume rebase has happened and the pool has some unwanted tokens
          //wX
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));
          await SmartToken1.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("15")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("15"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });
        it(`it should revert if reciever was  not able to get enough funds to pay back`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));
          await wX.deposit(ethers.utils.parseEther("10"));

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );
          await SmartToken2.approve(wY.address, ethers.utils.parseEther("10"));
          await wY.deposit(ethers.utils.parseEther("10"));

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverY.isApprovedMeth(true);

          // Asume rebase has happened and the pool has some unwanted tokens
          //wX
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("15"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

          //wY
          await SmartToken1.transfer(wY.address, ethers.utils.parseEther("15"));

          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("15"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

          expect(await SmartToken2.balanceOf(wX.address)).to.be.equal(
            ethers.utils.parseEther("15")
          );
          expect(await SmartToken1.balanceOf(wY.address)).to.be.equal(
            ethers.utils.parseEther("15")
          );
        });

        it(`it should revert if POOL doesnot have enough selling token`, async function () {
          let {
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);
          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );
          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("10"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "FlashLoan__InsufficientUnderlying"
          );
          await expect(
            wY.flashLoan(
              flashloanReceiverY.address,
              ethers.utils.parseEther("10"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wY,
            "FlashLoan__InsufficientUnderlying"
          );
        });

        it(`it should revert if reciever's execute operation returned false'`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);
          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );
          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));

          await wX.deposit(ethers.utils.parseEther("10"));
          const intialBal = await SmartToken1.balanceOf(wX.address);

          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverX.updateMockReturn(false);

          await SmartToken2.transfer(
            flashloanReceiverX.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              ethers.utils.parseEther("1"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(wX, "FlashLoan__FailedExecOps");
          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialBal
          );
        });
        it(`it should revert if reciever is EOA`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            deployer,
            flashloanReceiverX,
            tester,
            wX,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);
          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp,
            },
            awsConfig
          );
          await SmartToken1.approve(wX.address, ethers.utils.parseEther("10"));

          await wX.deposit(ethers.utils.parseEther("10"));
          const intialBal = await SmartToken1.balanceOf(wX.address);

          await flashloanReceiverX.isApprovedMeth(true);
          await flashloanReceiverX.updateMockReturn(false);
          await SmartToken2.transfer(
            tester.address,
            ethers.utils.parseEther("1")
          );

          await expect(
            wX.flashLoan(
              tester.address,
              ethers.utils.parseEther("10"),
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.reverted;
          expect(await SmartToken1.balanceOf(wX.address)).to.be.equal(
            intialBal
          );
        });
      });

      describe("Wrapped Smart Token Misc Tests", async function () {
        it(`it should properly set the timeout`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          await wX.setTimeout(1000);
          expect(await wX.getTimeout()).to.be.equal(1000);

          await wY.setTimeout(1000);
          expect(await wY.getTimeout()).to.be.equal(1000);

          await expect(wX.connect(tester).setTimeout(10000)).to.be.revertedWith(
            "Ownable: caller is not the owner"
          );
        });

        it(`it should properly set the signers`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          await wX.setSigners(tester.address, true);
          expect(await wX.getSigners(tester.address)).to.be.equal(true);

          await wY.setSigners(tester.address, true);
          expect(await wY.getSigners(tester.address)).to.be.equal(true);

          await expect(
            wX.connect(tester).setSigners(tester.address, false)
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it(`it should properly verify the signer`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          const wallet = ethers.Wallet.createRandom();

          const failedSigned = await signFlashloan(wallet, {
            smartTokenXValue: 10,
            smartTokenYValue: 10,
            timestamp: 1000,
          });

          await expect(
            wX.flashLoan(
              tester.address,
              ethers.utils.parseEther("1"),
              failedSigned.encodedData,
              failedSigned.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidSigner"
          );
        });

        it(`it should properly revert if discount is not proper`, async function () {
          let { wX } = await loadFixture(deployTokenFixture);

          // discount Max == discount Min
          await expect(
            wX.setDiscountRate(1000, 1000, 0, 50)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidDiscount"
          );

          // discount Min > discount Max
          await expect(
            wX.setDiscountRate(1000, 500, 0, 50)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidDiscount"
          );

          // discount max Scalefactor (1e18)
          await expect(
            wX.setDiscountRate(1000, 1500, 0, ethers.utils.parseEther("1.1"))
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidDiscount"
          );
          // start time > end time
          await expect(
            wX.setDiscountRate(1000, ethers.utils.parseEther("0.95"), 1000, 50)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidDiscount"
          );

          // start time == end time
          await expect(
            wX.setDiscountRate(1000, 1000, 50, 50)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__InvalidDiscount"
          );
        });

        it(`it should properly get if Wrapped is X or Y`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          expect(await wX.connect(tester).getIsWrappedX()).to.be.true;
          expect(await wY.connect(tester).getIsWrappedX()).to.be.false;
        });

        it(`it should not allow INITIALIZE Method`, async function () {
          let { wX, wY, tester } = await loadFixture(deployTokenFixture);

          await expect(
            wX.connect(tester).initialize(tester.address, "test", "TEST", 1)
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__Not_Implemented"
          );
        });

        it(`it should revert if the flashloan has timeout`, async function () {
          let {
            SmartToken1,
            SmartToken2,
            flashloanReceiverX,
            flashloanReceiverY,
            wX,
            wY,
            keyId,
            awsConfig,
          } = await loadFixture(deployTokenFixture);

          // @note flash loan using wX
          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));

          const repayAmt = ethers.utils.parseEther("1");
          const loanAmt = ethers.utils.parseEther("1");
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          await flashloanReceiverX.isApprovedMeth(true);
          // we simulate that  the flashloan receiver will get some wanted tokens somehow
          await SmartToken1.transfer(flashloanReceiverX.address, repayAmt);
          const blockNumber = await ethers.provider.getBlockNumber();
          const block = await ethers.provider.getBlock(blockNumber);

          await wX.setTimeout(1000);
          expect(await wX.getTimeout()).to.be.equal(1000);

          //price is assumed to be 50/50 -- no discounts
          const signed = await signFLashloanAwsKMS(
            keyId,
            {
              smartTokenXValue: 10,
              smartTokenYValue: 10,
              timestamp: block.timestamp - 1001,
            },
            awsConfig
          );
          await expect(
            wX.flashLoan(
              flashloanReceiverX.address,
              loanAmt,
              signed.encodedData,
              signed.signature,
              "0x"
            )
          ).to.be.revertedWithCustomError(
            wX,
            "WrappedSmartToken__PriceFeedOutdated"
          );
        });
      });

      describe("Wrapped Token Overidden Method tests/ Refund unwanted tokens", async function () {
        it(`it should properly refund unwanted tokens in the pool if user wants to get out early`, async function () {
          let { SmartToken1, SmartToken2, deployer, wX, tester } =
            await loadFixture(deployTokenFixture);

          await SmartToken1.approve(wX.address, ethers.constants.MaxUint256);

          await wX.deposit(ethers.utils.parseEther("10"));
          //we assume that rebase has happened and the wX pool is gifted some unwanted smart token Y
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("5"));

          //user wants to get out before the flashloan sells all unwanted tokens

          const userBalanceSM1 = await SmartToken1.balanceOf(deployer.address);
          const userBalanceSM2 = await SmartToken2.balanceOf(deployer.address);

          const wXtotalSupply = await wX.totalSupply();
          const userBalWX = await wX.balanceOf(deployer.address);

          const expectedSM2Unwanted = userBalWX
            .mul(ethers.utils.parseEther("5"))
            .div(wXtotalSupply);

          await wX.burn(userBalWX);

          //user is refunded the correct unwanted token amounts
          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2.add(expectedSM2Unwanted)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1.add(ethers.utils.parseEther("10"))
          );

          const userBalanceSM1After = await SmartToken1.balanceOf(
            deployer.address
          );
          const userBalanceSM2After = await SmartToken2.balanceOf(
            deployer.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter = userBalWX
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          const userBalWXAfter = await wX.balanceOf(deployer.address);

          await wX.burn(userBalWXAfter);

          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2After.add(expectedSM2UnwantedAfter)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1After
          );

          // user wants to burn all the tokens
          const userBalanceSM1After2 = await SmartToken1.balanceOf(
            deployer.address
          );
          const userBalanceSM2After2 = await SmartToken2.balanceOf(
            deployer.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter2 = userBalWXAfter
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          const userBalWXAfter2 = await wX.balanceOf(deployer.address);

          await wX.burnAll();

          expect(await SmartToken2.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM2After2.add(expectedSM2UnwantedAfter2)
          );
          expect(await SmartToken1.balanceOf(deployer.address)).to.be.equal(
            userBalanceSM1After2
          );

          // if user wants to burn to
          const userBalanceSM1After3 = await SmartToken1.balanceOf(
            tester.address
          );
          const userBalanceSM2After3 = await SmartToken2.balanceOf(
            tester.address
          );
          //if user user deposits again
          await wX.deposit(ethers.utils.parseEther("10"));
          //rebase happens and wX receives some unwanted tokens
          await SmartToken2.transfer(wX.address, ethers.utils.parseEther("15"));

          const userBalTestwX = await wX.balanceOf(deployer.address);
          //user wants to get out before the flashloan sells all unwanted tokens
          // but before any rebase, there is little SM2 because of the initial 1000 fixed deposit
          const expectedSM2UnwantedAfter3 = userBalTestwX
            .mul(await SmartToken2.balanceOf(wX.address))
            .div(wXtotalSupply);

          await wX.burnAllTo(tester.address);

          expect(
            Number(await SmartToken2.balanceOf(tester.address))
          ).to.be.equal(
            Number(userBalanceSM2After3.add(expectedSM2UnwantedAfter3))
          );
          expect(await SmartToken1.balanceOf(tester.address)).to.be.equal(
            userBalanceSM1After3.add(ethers.utils.parseEther("10"))
          );
        });
        it(`Should allow upgrades`, async function () {
          let {
            tokenFactory,
            SmartToken1,
            SmartToken2,
            deployer,
            wX,
            tester,
            RiskWrappedTokenContract,
          } = await loadFixture(deployTokenFixture);

          const newWrappedSmartTokenFactory = await ethers.getContractFactory(
            "wrappedSmartToken",
            tester
          );

          const existingProxyAddress = wX.address;

          await upgrades.forceImport(
            existingProxyAddress,
            RiskWrappedTokenContract
          );
          await wX.transferOwnership(tester.address);

          expect(
            await upgrades.upgradeProxy(
              existingProxyAddress,
              newWrappedSmartTokenFactory
            )
          ).to.be.ok;
        });
      });

      describe("Wrapper Factory", async function () {
        it(`Should fetch tokens props properly`, async function () {
          let {
            wX,
            wY,

            WrapperFactory,
          } = await loadFixture(deployTokenFixture);
          expect(await WrapperFactory.getWrappedSmartTokens(true)).to.be.equal(
            wX.address
          );
          expect(await WrapperFactory.getWrappedSmartTokens(false)).to.be.equal(
            wY.address
          );
          expect(isAddress(await WrapperFactory.getTemplate())).to.be.equal(
            true
          );
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

  const wX = await get(factoryAddress, wallet, desiredPrefix, 0);
  const wY = await get(factoryAddress, wallet, desiredPrefix, 1);

  return {
    wX,
    wY,
  };
}
