import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage"
import "@typechain/hardhat"
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers"
import "hardhat-contract-sizer";
import "hardhat-ignore-warnings"

const config: HardhatUserConfig = {  
  solidity: {
    compilers: [
      {
        version: "0.8.17",
      },
      {
        version: "0.6.6",
      },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  defaultNetwork:"hardhat",
  networks:{
    hardhat: {
      chainId: 31337,
      forking: {
        url: process.env.MAINNET_RPC_URL! // https://eth-mainnet.g.alchemy.com/v2/MY_KEY
      },
    },
    goerli:{
      url:process.env.GOERLI_RPC_URL,
      accounts:[process.env.PRIVATE_KEY!],
      chainId:5,
      allowUnlimitedContractSize: true      
    },
    localhost:{
      url: 'http://127.0.0.1:8545/',  
      /* you get the url abv when you run "yarn hardhat node" it comes with several address
       and private key, you don't need to specify accounts. The terminal needs to be active
        before you use localhost  to deploy, the terminal will be showing logs as you work */
      chainId:31337,
      allowUnlimitedContractSize: true
    },
    sepolia:{
      url:process.env.SEPOLIA_RPC_URL,
      accounts:[process.env.PRIVATE_KEY!],
      chainId:11155111,
      allowUnlimitedContractSize: true      
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter:{
    enabled:true,
    outputFile:'gas-report.txt',
    noColors:true,
    currency:'USD',
    coinmarketcap:process.env.COINMARKERCAP_API
  },
  namedAccounts: {
    deployer: {
        default: 0, // here this will by default take the first account as deployer
        1: 0, // similarly on mainnet it will take the first account as deployer.
        5: 0, // on goerli it will take first account
    },
    tester:{
      default: 1, // here this will by default take the second account as tester
      1: 1, // similarly on mainnet it will take the second account as tester.
      5: 1, // on goerli it will take second account
    }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true   
  },
  warnings: {
    '*': {
      unreachable: 'off',
    }
  } 
};

export default config;
