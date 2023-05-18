// import { assert } from "chai";
// import { ethers, network } from "hardhat";
// import {
//   developmentChains,
//   REBASE_INTERVAL,
//   TOKEN1_NAME,
//   TOKEN1_SYMBOL,
//   defaultOperators,
//   TOKEN2_NAME,
//   TOKEN2_SYMBOL,
//   DECIMALS,
//   INITIAL_PRICE,
// } from "../../helper-hardhat-config";
// import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// const rebaseTable = [
//   {
//     depositValue: "10000000000000000000",
//     beforeRebase: {
//       x: "9000000000000000000", // we simiulate that one of token X has been traded before rebase
//       y: "10000000000000000000",
//     },
//     beforeRebaseafterMgmtFees: {
//       x: "8820000000000000000", // we simiulate that one of token X has been traded before rebase
//       y: "9800000000000000000",
//     },
//     afterRebase: "9473170000000000000",
//   },
//   {
//     depositValue: "5000000000000000000",
//     beforeRebase: {
//       x: "4000000000000000000", // we simiulate that one of token X has been traded before rebase
//       y: "5000000000000000000",
//     },
//     beforeRebaseafterMgmtFees: {
//       x: "3920000000000000000", // we simiulate that one of token X has been traded before rebase
//       y: "4900000000000000000",
//     },
//     afterRebase: "4573170000000000000",
//   },
//   //   },
//   //   {
//   //     depositValue: "4335000000000000000",
//   //     beforeRebase: {
//   //       x: "3335000000000000000", // we simiulate that one of token X has been traded before rebase
//   //       y: "4335000000000000000",
//   //     },
//   //     afterRebase: "4001500000000000000",
//   //   },
// ];

// developmentChains.includes(network.name)
//   ? describe("RebaseTableWithMgmtFees", async function () {
//       async function deployTokenFixture() {
//         const [deployer, tester] = await ethers.getSigners();

//         const MockV3Aggregator = await ethers.getContractFactory(
//           "MockV3Aggregator",
//           deployer
//         );
//         const mockV3Aggregator = await MockV3Aggregator.deploy(
//           DECIMALS,
//           INITIAL_PRICE
//         );
//         await mockV3Aggregator.deployed();

//         const MockERC20Token = await ethers.getContractFactory(
//           "MockERC20Token",
//           deployer
//         );
//         const underlyingToken = await MockERC20Token.deploy();
//         await underlyingToken.deployed();

//         const TokenFactory = await ethers.getContractFactory(
//           "TokenFactory",
//           deployer
//         );
//         const tokenFactory = await TokenFactory.deploy(
//           underlyingToken.address,
//           mockV3Aggregator.address,
//           REBASE_INTERVAL
//         );
//         await tokenFactory.deployed();

//         // deploy devtoken 1
//         const DevToken1 = await ethers.getContractFactory("DevToken", deployer);
//         const devToken1 = await DevToken1.deploy(
//           TOKEN1_NAME,
//           TOKEN1_SYMBOL,
//           tokenFactory.address,
//           defaultOperators
//         );
//         await devToken1.deployed();

//         // deploy devtoken 2
//         const DevToken2 = await ethers.getContractFactory("DevToken", deployer);
//         const devToken2 = await DevToken2.deploy(
//           TOKEN2_NAME,
//           TOKEN2_SYMBOL,
//           tokenFactory.address,
//           defaultOperators
//         );
//         await devToken2.deployed();

//         // other instances to mock fake underlying token
//         const TokenFactory2 = await ethers.getContractFactory(
//           "TokenFactory",
//           tester
//         );
//         const tokenFactory2 = await TokenFactory2.deploy(
//           "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
//           mockV3Aggregator.address,
//           REBASE_INTERVAL
//         );
//         await tokenFactory2.deployed();

//         // Fixtures can return anything you consider useful for your tests
//         return {
//           devToken1,
//           devToken2,
//           mockV3Aggregator,
//           underlyingToken,
//           tokenFactory,
//           deployer,
//           tester,
//           tokenFactory2,
//         };
//       }

//       describe("Rebase, deposit and withdraw with MgmtFees", async function () {
//         rebaseTable.forEach((item) => {
//           it(`It should deposit correct amount with respect to fees.`, async function () {
//             const {
//               tokenFactory,
//               deployer,
//               underlyingToken,
//               devToken1,
//               devToken2,
//               tester,
//             } = await loadFixture(deployTokenFixture);
//             const depositAmount = item.depositValue;
//             //const transferAmount = ethers.utils.parseEther("1");

//             await tokenFactory.initialize(devToken1.address, devToken2.address);

//             // set the management fee to 2% and activating fees
//             await tokenFactory.setManagementFeeRate(200);
//             await tokenFactory.setManagementFeeState(true);

//             // deposit underlying token
//             await underlyingToken.approve(tokenFactory.address, depositAmount);
//             await tokenFactory.mint(depositAmount, deployer.address);

//             const userBal = await devToken1.balanceOf(deployer.address);
//             const factBal = await devToken1.balanceOf(tokenFactory.address);

//             console.log(`user: ${userBal}`);
//             console.log(`fact:${factBal}`);

//             // confirm user balances when rebase has taken place
//             assert.equal(factBal + userBal, item.depositValue);
//           });

//           //   it(`it should have correct balances for X and Y tokens after rebase with initial token balance of X:${item.beforeRebase.x}, Y:${item.beforeRebase.y}`, async function () {
//           //     const {
//           //       tokenFactory,
//           //       deployer,
//           //       underlyingToken,
//           //       devToken1,
//           //       devToken2,
//           //       tester,
//           //     } = await loadFixture(deployTokenFixture);
//           //     const depositAmount = item.depositValue;
//           //     const transferAmount = ethers.utils.parseEther("1");

//           //     await tokenFactory.initialize(devToken1.address, devToken2.address);

//           //     // deposit underlying token
//           //     await underlyingToken.approve(tokenFactory.address, depositAmount);
//           //     await tokenFactory.deposit(depositAmount, deployer.address);

//           //     // to a transaction
//           //     await devToken1.transfer(tester.address, transferAmount);

//           //     // set the management fee to 2% and activating fees
//           //     await tokenFactory.setManagementFeeRate(200);
//           //     await tokenFactory.setManagementFeeState(true);

//           //     // Get the current block
//           //     let block = await ethers.provider.getBlock("latest");
//           //     console.log("Current block timestamp: ", block.timestamp);

//           //     // Increase time
//           //     // await network.provider.send("evm_increaseTime", [REBASE_INTERVAL]); // Increase time by 3600 seconds (1 hour)
//           //     // await network.provider.send("evm_mine"); // Mine the next block
//           //     await time.increase(REBASE_INTERVAL);
//           //     block = await ethers.provider.getBlock("latest");
//           //     console.log(
//           //       "Current block timestamp after increase: ",
//           //       block.timestamp
//           //     );
//           //     // trigger a rebase
//           //     await tokenFactory.rebase();
//           //     console.log(
//           //       `Actual balance ${await devToken1.balanceOf(deployer.address)}`
//           //     );
//           //     // confirm user balances when rebase has taken place
//           //     assert.equal(
//           //       await devToken1.balanceOf(deployer.address),
//           //       item.afterRebase
//           //     );
//           //     assert.equal(
//           //       await devToken2.balanceOf(deployer.address),
//           //       item.afterRebase
//           //     );
//           //   });
//         });
//       });
//     })
//   : describe.skip;
