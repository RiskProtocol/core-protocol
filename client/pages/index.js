import { useState } from "react";
import { ethers } from "ethers";
import {
  tokenFactoryAddress,
  devTokenXAddress,
  devTokenYAddress,
  tokenFactoryAbi,
  devTokenAbi,
  underlyingTokenAddress,
  uniswapV2RouterAddress,
  uniswapV2RouterABI,
  uniswapV2FactoryAddress,
  uniswapV2FactoryABI,
  uniswapV2PairABI,
} from "./../contants";

function App() {

  const testAccountAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  const test1AccountAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  const [depositAmount, setDepositAmount] = useState();
  const [withdrawalAmount, setWithdrawalAmount] = useState();
  const [transferAddress, setTransferAddress] = useState('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  const [tokenPairAddress, setTokenPairAddress] = useState();

  
  async function requestAccounts() {
    return await window.ethereum.request({ method: "eth_requestAccounts" });
  }

  async function test() {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const accounts = await requestAccounts();
      contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, signer);
      try {
        const data = await contract.mint(devTokenXAddress, devTokenYAddress);        
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function tokenBalance(devToken = "x") {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await requestAccounts();
      if (devToken == "x") {
        contract = new ethers.Contract(devTokenXAddress, devTokenAbi, provider);
      } else {
        contract = new ethers.Contract(devTokenYAddress, devTokenAbi, provider);
      }
      try {
        const data = await contract.balanceOf(testAccountAddress);
        console.log(
          `balance of ${
            devToken == "x" ? "tokenX" : "tokenY"
          } is ${data.toString()}`
        );
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function buy() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenFactoryAddress,
        tokenFactoryAbi,
        signer
      );
      const underlyingToken = new ethers.Contract(
        underlyingTokenAddress,
        devTokenAbi,
        signer
      );
      try {
        const allowance = await underlyingToken.allowance(
          testAccountAddress,
          tokenFactoryAddress
        );        
        console.log(`allowance : ${allowance}`);

        await underlyingToken.approve(
          tokenFactoryAddress,
          ethers.utils.parseEther(depositAmount)
        );

        await contract.deposit(
          `${ethers.utils.parseEther(depositAmount)}`,
          testAccountAddress
        );
        console.log("Buying asset...");
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function withdraw() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenFactoryAddress,
        tokenFactoryAbi,
        signer
      );
      try {
        const data = await contract.withdraw(
          `${ethers.utils.parseEther(withdrawalAmount)}`,
          testAccountAddress,
          testAccountAddress
        );
        console.log("withdrawing asset...");
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function rebase() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenFactoryAddress,
        tokenFactoryAbi,
        signer
      );
      try {
        await contract.rebase();
        console.log("Rebasing...");
        // console.log(`Rebase Count is ${contract1.getScallingFactorLength()}`)
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function rebaseCount() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(
        tokenFactoryAddress,
        tokenFactoryAbi,
        provider
      );

      try {
        const data = await contract.getScallingFactorLength();
        console.log(`Current system rebase count is ${data}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function userLastRebase() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await requestAccounts();
      const contract = new ethers.Contract(
        tokenFactoryAddress,
        tokenFactoryAbi,
        provider
      );

      try {
        const data = await contract.getUserLastRebaseCount(accounts[0]);
        console.log(`User last rebase count is ${data}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function transfer() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        devTokenXAddress,
        devTokenAbi,
        signer
      );
      try {
        await contract.transfer(transferAddress, ethers.utils.parseEther("1"));
        console.log("transfering...");
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function tokenSupply(devToken = "x") {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      if (devToken == "x") {
        contract = new ethers.Contract(devTokenXAddress, devTokenAbi, provider);
      } else {
        contract = new ethers.Contract(devTokenYAddress, devTokenAbi, provider);
      }
      try {
        const data = await contract.totalSupply();
        console.log(
          `total supply of ${
            devToken == "x" ? "tokenX" : "tokenY"
          } is ${data.toString()}`
        );
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function createPair() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        uniswapV2FactoryAddress,
        uniswapV2FactoryABI,
        signer
      );
      try {
        const data = await contract.createPair(
          devTokenXAddress,
          underlyingTokenAddress
        );
        const receipt = await data.wait();
        console.log(`Response block number is  ${receipt.blockNumber}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function getPair() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const contract = new ethers.Contract(
        uniswapV2FactoryAddress,
        uniswapV2FactoryABI,
        provider
      );
      try {
        const data = await contract.getPair(
          devTokenXAddress,
          underlyingTokenAddress
        );
        console.log(`tradingPair address is  ${data}`);
        setTokenPairAddress(data);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function addLiquidity() {
    if (typeof window.ethereum !== "undefined") {
      const amount = 20;
      const ethAmount = `${ethers.utils.parseEther("20")}`;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        uniswapV2RouterAddress,
        uniswapV2RouterABI,
        signer
      );
      const devTokenX = new ethers.Contract(
        devTokenXAddress,
        devTokenAbi,
        signer
      );
      const devTokenY = new ethers.Contract(
        underlyingTokenAddress,
        devTokenAbi,
        signer
      );

      try {
        const allowance1 = await devTokenX.allowance(
          testAccountAddress,
          uniswapV2RouterAddress
        );
        const allowance2 = await devTokenY.allowance(
          testAccountAddress,
          uniswapV2RouterAddress
        );
        console.log(`allowance1 : ${allowance1}`);
        console.log(`allowance2 : ${allowance2}`);
        if (+ethers.utils.formatEther(allowance1) < amount) {
          await devTokenX.approve(uniswapV2RouterAddress, ethAmount);
        }

        if (+ethers.utils.formatEther(allowance2) < amount) {
          await devTokenY.approve(uniswapV2RouterAddress, ethAmount);
        }

        const data = await contract.addLiquidity(
          devTokenXAddress,
          underlyingTokenAddress,
          ethAmount,
          ethAmount,
          0,
          0,
          testAccountAddress,
          Math.floor(Date.now() / 1000) + 300
        );
        const receipt = await data.wait();
        console.log(`Response block number is  ${receipt.blockNumber}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function checkTokenPairBalance() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenPairAddress,
        uniswapV2PairABI,
        provider
      );
      try {
        const data = await contract.getReserves();
        console.log(`tradingPair reserve is  ${data}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function checkUserTokenPairBalance() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenPairAddress,
        uniswapV2PairABI,
        provider
      );
      try {
        const data = await contract.balanceOf(
          testAccountAddress
        );
        console.log(`user tradingPair balance is  ${data}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function performTrade() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const uniswapRouterContract = new ethers.Contract(
        uniswapV2RouterAddress,
        uniswapV2RouterABI,
        signer
      );
      try {
        const fromTokenAddress = devTokenXAddress; // Token X
        const toTokenAddress = underlyingTokenAddress; // Token Y
        const amountIn = ethers.utils.parseEther("1"); // 1 Token X
        const amountOutMin = "0"; // minimum acceptable amount of Token Y
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        const path = [fromTokenAddress, toTokenAddress];
        const options = {
          gasPrice: ethers.utils.parseUnits("100", "gwei"),
          gasLimit: 200000,
        };

        const devTokenX = new ethers.Contract(
          devTokenXAddress,
          devTokenAbi,
          signer
        );
        await devTokenX.approve(uniswapV2RouterAddress, amountIn);

        const tx = await uniswapRouterContract.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          path,
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          deadline,
          options
        );
        console.log("Transaction sent:", tx.hash);
        console.log(tx);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function callSync() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        tokenPairAddress,
        uniswapV2PairABI,
        signer
      );
      try {
        const data = await contract.sync();
        const receipt = await data.wait();
        console.log(`Response block number is  ${receipt.blockNumber}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  return (
    <div className="App">
      <div style={containerStyle}>
        <button style={buttonStyle} onClick={createPair}>
          Create Trading Pair
        </button>
        <button style={buttonStyle} onClick={getPair}>
          Get Trading Pair Address
        </button>
        <button style={buttonStyle} onClick={addLiquidity}>
          Add Liquidity
        </button>
        <button style={buttonStyle} onClick={checkTokenPairBalance}>
          Check Trading pair reserve
        </button>
        <button style={buttonStyle} onClick={checkUserTokenPairBalance}>
          Check User Balance in Trading Pair
        </button>
        <button style={buttonStyle} onClick={performTrade}>
          Perform a Trade
        </button>
        <button style={buttonStyle} onClick={callSync}>
          Trigger the Sync function
        </button>

        <br />
        <br />
        <br />
        <button style={buttonStyle} onClick={tokenBalance.bind(this, "x")}>
          Balance of Token X
        </button>
        <button style={buttonStyle} onClick={tokenBalance.bind(this, "y")}>
          Balance of Token Y
        </button>
        <input
          style={inputStyle}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Amount to Deposit"
        />
        <button style={buttonStyle} onClick={buy}>
          Buy Tokens
        </button>
        <input
          style={inputStyle}
          onChange={(e) => setWithdrawalAmount(e.target.value)}
          placeholder="Amount to Withdraw"
        />
        <button style={buttonStyle} onClick={withdraw}>
          Withdraw Token
        </button>
        <input
          style={inputStyle}
          value={transferAddress}
          onChange={(e) => setTransferAddress(e.target.value)}
          placeholder="Address to transfer to"
        />
        <button style={buttonStyle} onClick={transfer}>
          Trade 1 of Token X to abv address
        </button>
        <button style={buttonStyle} onClick={rebaseCount}>
          Current System Rebase Count
        </button>
        <button style={buttonStyle} onClick={rebase}>
          Trigger Rebase
        </button>
        <button style={buttonStyle} onClick={userLastRebase}>
          Last User Rebase Participation
        </button>
        <button style={buttonStyle} onClick={tokenSupply.bind(this, "x")}>
          Total Supply of Token X
        </button>
        <button style={buttonStyle} onClick={tokenSupply.bind(this, "y")}>
          Total Supply of Token Y
        </button>
        <button style={buttonStyle} onClick={test}>
          Test
        </button>
        
      </div>
    </div>
  );
}

const containerStyle = {
  width: "900px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  paddingTop: 100,
};

const inputStyle = {
  width: "100%",
  padding: "8px",
};

const buttonStyle = {
  width: "100%",
  marginBottom: 15,
  height: "30px",
};

export default App;
