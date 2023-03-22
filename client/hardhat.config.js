require("@nomicfoundation/hardhat-toolbox");
require ("dotenv/config");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  defaultNetwork:"hardhat",
  networks:{
    goerli:{
      url:process.env.GOERLI_RPC_URL,
      accounts:[process.env.PRIVATE_KEY],
      chainId:5      
    },
    localhost:{
      url: 'http://127.0.0.1:8545/',  
      /* you get the url abv when you run "yarn hardhat node" it comes with several address
       and private key, you don't need to specify accounts. The terminal needs to be active
        before you use localhost  to deploy, the terminal will be showing logs as you work */
      chainId:31337
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9"
      }
    ]
  }
};
