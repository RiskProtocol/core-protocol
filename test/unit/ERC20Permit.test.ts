import { assert, expect } from "chai";
import { ethers, network, upgrades } from "hardhat";
import {
  developmentChains,
  FF_INTERVAL,
  rateLimitsDefault,
  REBALANCE_INTERVAL,
  TOKEN1_NAME,
  TOKEN1_SYMBOL,
  TOKEN2_NAME,
  TOKEN2_SYMBOL,
} from "../../helper-hardhat-config";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getPermitDigest, sign } from "../../utils/signatures";
import "dotenv/config";

developmentChains.includes(network.name)
  ? describe("ERC20Permit", async function () {
      async function deployTokenFixture() {
        const chainId = 31337;
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

        const tokenFactory = await upgrades.deployProxy(TokenFactory, [
          underlyingToken.address,
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
        ]);
        await tokenFactory.deployed();

        // Underlying Asset without permit function
        const MockERC20TokenWithoutPermit = await ethers.getContractFactory(
          "MockERC20TokenWithoutPermit",
          deployer
        );
        const underlyingTokenWithoutPermit =
          await MockERC20TokenWithoutPermit.deploy();
        await underlyingTokenWithoutPermit.deployed();

        const TokenFactory1Factory = await ethers.getContractFactory(
          "TokenFactory",
          deployer
        );

        const tokenFactory1 = await upgrades.deployProxy(TokenFactory1Factory, [
          underlyingTokenWithoutPermit.address,
          REBALANCE_INTERVAL,
          FF_INTERVAL,
          sanctionsContract.address,
          deployer.address,
          deployer.address,
          rateLimitsDefault.withdraw,
          rateLimitsDefault.deposit,
          rateLimitsDefault.period,
        ]);
        await tokenFactory1.deployed();

        // deploy smartToken 1
        const SmartToken1Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken1 = await upgrades.deployProxy(SmartToken1Factory, [
          TOKEN1_NAME,
          TOKEN1_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          true,
          deployer.address,
        ]);
        await smartToken1.deployed();

        // deploy smartToken 2
        const SmartToken2Factory = await ethers.getContractFactory(
          "SmartToken",
          deployer
        );

        const smartToken2 = await upgrades.deployProxy(SmartToken2Factory, [
          TOKEN2_NAME,
          TOKEN2_SYMBOL,
          tokenFactory.address,
          sanctionsContract.address,
          false,
          deployer.address,
        ]);
        await smartToken2.deployed();

        // Fixtures can return anything you consider useful for your tests
        return {
          smartToken1,
          smartToken2,
          underlyingToken,
          tokenFactory,
          deployer,
          tester,
          chainId,
          tokenFactory1,
          underlyingTokenWithoutPermit,
        };
      }

      describe("ERC20Permit", async function () {
        it("permits and emits Approval (replay safe)", async () => {
          const { smartToken1, chainId, deployer, tester } = await loadFixture(
            deployTokenFixture
          );
          // Create the approval request
          const approve = {
            owner: deployer.address,
            spender: tester.address,
            value: 100,
          };

          // deadline as much as you want in the future
          const deadline = 100000000000000;

          // deadline as much as you want in the future
          const invalidDeadline = 0;

          // Get the user's nonce
          const nonce = await smartToken1.nonces(deployer.address);

          // Get the EIP712 digest
          const digest = getPermitDigest(
            await smartToken1.name(),
            smartToken1.address,
            chainId,
            approve,
            nonce,
            deadline
          );

          // Sign it
          // NOTE: Using web3.eth.sign will hash the message internally again which
          // we do not want, so we're manually signing here
          const ownerPrivateKey = process.env.TEST_PRIVATE_KEY!;
          const privateKey1Buffer = Buffer.from(ownerPrivateKey, "hex");
          const { v, r, s } = sign(digest, privateKey1Buffer);

          // Approve it
          const receipt = await smartToken1.permit(
            approve.owner,
            approve.spender,
            approve.value,
            deadline,
            v,
            r,
            s
          );

          // It worked!
          // assert.equal(event.event, 'Approval')
          assert.equal(await smartToken1.nonces(deployer.address), 1);
          assert.equal(
            await smartToken1.allowance(approve.owner, approve.spender),
            approve.value
          );

          // Re-using the same sig doesn't work since the nonce has been incremented
          // on the contract level for replay-protection
          await expect(
            smartToken1.permit(
              approve.owner,
              approve.spender,
              approve.value,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith("ERC20Permit: invalid signature");

          // It should revert if the deadline has occured
          await expect(
            smartToken1.permit(
              approve.owner,
              approve.spender,
              approve.value,
              invalidDeadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith("ERC20Permit: expired deadline");

          // invalid ecrecover's return address(0x0), so we must also guarantee that
          // this case fails
          await expect(
            smartToken1.permit(
              "0x0000000000000000000000000000000000000000",
              approve.spender,
              approve.value,
              deadline,
              "0x99",
              r,
              s
            )
          ).to.be.revertedWith("ECDSA: invalid signature");
        });

        it("it should revert when using depositWithPermit with a regular ERC20 token without permit", async function () {
          const {
            tokenFactory1,
            deployer,
            tester,
            smartToken1,
            smartToken2,
            chainId,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory1.initializeSMART(
            smartToken1.address,

            smartToken2.address
          );

          // Create the approval request
          const approve = {
            owner: deployer.address,
            spender: tester.address,
            value: 100,
          };

          // deadline as much as you want in the future
          const deadline = 100000000000000;

          // Get the user's nonce
          const nonce = await smartToken1.nonces(deployer.address);

          // Get the EIP712 digest
          const digest = getPermitDigest(
            await smartToken1.name(),
            smartToken1.address,
            chainId,
            approve,
            nonce,
            deadline
          );

          // Sign it
          // NOTE: Using web3.eth.sign will hash the message internally again which
          // we do not want, so we're manually signing here
          const ownerPrivateKey = process.env.TEST_PRIVATE_KEY!;
          const privateKey1Buffer = Buffer.from(ownerPrivateKey, "hex");
          const { v, r, s } = sign(digest, privateKey1Buffer);

          await expect(
            smartToken1.depositWithPermit(
              depositAmount,
              deployer.address,
              deadline,
              v,
              r,
              s
            )
          ).to.be.reverted;
        });

        it("it should call depositWithPermit for an ERC20 token with permit successfully", async function () {
          const {
            tokenFactory,
            deployer,
            smartToken1,
            smartToken2,
            chainId,
            underlyingToken,
          } = await loadFixture(deployTokenFixture);
          const depositAmount = ethers.utils.parseEther("6");
          await tokenFactory.initializeSMART(
            smartToken1.address,
            smartToken2.address
          );

          // Create the approval request
          const approve = {
            owner: deployer.address,
            spender: tokenFactory.address,
            value: depositAmount,
          };

          // deadline as much as you want in the future
          const deadline = 100000000000000;

          // Get the user's nonce
          const nonce = await smartToken1.nonces(deployer.address);

          // Get the EIP712 digest
          const digest = getPermitDigest(
            await underlyingToken.name(),
            underlyingToken.address,
            chainId,
            approve,
            nonce,
            deadline
          );

          // Sign it
          // NOTE: Using web3.eth.sign will hash the message internally again which
          // we do not want, so we're manually signing here
          const ownerPrivateKey = process.env.TEST_PRIVATE_KEY!;
          const privateKey1Buffer = Buffer.from(ownerPrivateKey, "hex");
          const { v, r, s } = sign(digest, privateKey1Buffer);

          await expect(
            await smartToken1.depositWithPermit(
              approve.value,
              approve.owner,
              deadline,
              v,
              r,
              s
            )
          ).to.haveOwnProperty("hash");
        });
      });
    })
  : describe.skip;
