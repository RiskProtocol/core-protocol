import { useState } from "react";
import { BigNumber, ethers } from "ethers";
import { Buffer } from "buffer";
import {
  tokenFactoryAddress,
  smartTokenXAddress,
  smartTokenYAddress,
  tokenFactoryAbi,
  smartTokenAbi,
  underlyingTokenAddress,
  uniswapV2RouterAddress,
  uniswapV2RouterABI,
  uniswapV2FactoryAddress,
  uniswapV2FactoryABI,
  uniswapV2PairABI,
  underlyingTokenAbi,
  underlyingTokenWithPermitAbi,
  erc20ABI,
  bpoolAbi,
  bpoolcoreABI,
  bpoolAddress,
  usdcAddress,
} from "../contants";

function App() {
  const testAccountAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const test1AccountAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const [depositAmount, setDepositAmount] = useState();
  const [approvalAmount, setApprovalAmount] = useState();
  const [swapAmount, setSwapAmount] = useState();
  const [withdrawalAmount, setWithdrawalAmount] = useState();
  const [transferAddress, setTransferAddress] = useState(
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  );
  const [tokenPairAddress, setTokenPairAddress] = useState();

  // permit function implementation starts here
  const domainName = "Risk"; // put your token name
  const domainVersion = "1"; // leave this to "1"
  const chainId = 31337;
  const permitDeadline = 100000000000000;
  const contractAddress = underlyingTokenAddress;
  //new

  const domain = {
    name: domainName,
    version: domainVersion,
    verifyingContract: contractAddress,
    chainId,
  };

  const domainType = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

  const splitSig = (sig) => {
    // splits the signature to r, s, and v values.
    const pureSig = sig.replace("0x", "");

    const r = new Buffer(pureSig.substring(0, 64), "hex");
    const s = new Buffer(pureSig.substring(64, 128), "hex");
    const v = new Buffer(parseInt(pureSig.substring(128, 130), 16).toString());

    return {
      r,
      s,
      v,
    };
  };
  async function requestAccounts() {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    return accounts;
  }
  const signTyped = (dataToSign) => {
    // call this method to sign EIP 712 data
    return new Promise((resolve, reject) => {
      web3.currentProvider.sendAsync(
        {
          method: "eth_signTypedData_v4",
          params: [testAccountAddress, dataToSign],
          from: testAccountAddress,
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result.result);
        }
      );
    });
  };

  async function createPermit(spender, value, nonce, deadline) {
    const permit = {
      owner: testAccountAddress,
      spender,
      value,
      nonce,
      deadline,
    };
    const Permit = [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];

    const dataToSign = JSON.stringify({
      types: {
        EIP712Domain: domainType,
        Permit: Permit,
      },
      domain: domain,
      primaryType: "Permit",
      message: permit,
    });

    const signature = await signTyped(dataToSign);
    const split = splitSig(signature);

    return {
      ...split,
      signature,
    };
  }
  // permit function implementation ends here

  async function requestAccounts() {
    return await window.ethereum.request({ method: "eth_requestAccounts" });
  }

  async function test() {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const accounts = await requestAccounts();
      contract = new ethers.Contract(
        smartTokenXAddress,
        smartTokenAbi,
        provider
      );
      try {
        const data = await contract.mint(
          smartTokenXAddress,
          smartTokenYAddress
        );
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function tokenBalance(smartToken = "x") {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const accounts = await requestAccounts();
      const testAccountAddress = accounts[0];
      if (smartToken == "x") {
        contract = new ethers.Contract(
          smartTokenXAddress,
          smartTokenAbi,
          provider
        );
      } else {
        contract = new ethers.Contract(
          smartTokenYAddress,
          smartTokenAbi,
          provider
        );
      }
      try {
        const data = await contract.balanceOf(testAccountAddress);
        console.log(
          `balance of ${
            smartToken == "x" ? "tokenX" : "tokenY"
          } is ${data.toString()}`
        );
        alert(
          `balance of ${
            smartToken == "x" ? "tokenX" : "tokenY"
          } is ${ethers.utils.formatEther(data)}`
        );
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }
  async function approve() {
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
        erc20ABI,
        signer
      );
      try {
        const allowance = await underlyingToken.allowance(
          testAccountAddress,
          tokenFactoryAddress
        );
        console.log(`allowance : ${allowance}`);

        const tx = await underlyingToken.approve(
          tokenFactoryAddress,
          ethers.utils.parseEther(approvalAmount)
        );
        console.log("Approval...");
        alert(`Approval : ${JSON.stringify(tx)}`);
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  async function approveToken(tokenContract, amount, spender) {
    if (typeof window.ethereum !== "undefined") {
      try {
        const tx = await tokenContract.approve(
          spender,
          ethers.utils.parseEther(amount)
        );
        await tx.wait();
        console.log("Approval successful for amount:", amount);
      } catch (err) {
        console.error("Error in approval:", err);
      }
    }
  }

  async function performSwap(
    fromTokenAddress,
    amountIn,
    toTokenAddress,
    minAmountOut,
    maxPrice
  ) {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const bpool = new ethers.Contract(bpoolAddress, bpoolAbi, signer);
      const bcorepoolAddr = await bpool.bPool();

      const bcorepool = new ethers.Contract(
        bcorepoolAddr,
        bpoolcoreABI,
        signer
      );

      const yOut = await bcorepool.swapExactAmountIn(
        fromTokenAddress,
        ethers.utils.parseEther(amountIn),
        toTokenAddress,
        ethers.utils.parseEther(minAmountOut),
        ethers.utils.parseEther(maxPrice)
      );
      await yOut.wait();
      alert("Swap successful:", yOut);
    } catch (err) {
      alert("Error in swap:", err);
    }
  }

  async function handleApproveUSDC() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const bpool = new ethers.Contract(bpoolAddress, bpoolAbi, signer);

      const bcorepoolAddr = await bpool.bPool();
      // const accounts = await requestAccounts();
      // const testAccountAddress = accounts[0];
      const contract = new ethers.Contract(usdcAddress, erc20ABI, signer);
      await approveToken(contract, approvalAmount, bcorepoolAddr);
    } catch (error) {
      console.log(error);
    }
  }

  async function handleApproveX() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const bpool = new ethers.Contract(bpoolAddress, bpoolAbi, signer);

      const bcorepoolAddr = await bpool.bPool();
      // const accounts = await requestAccounts();
      // const testAccountAddress = accounts[0];
      const contract = new ethers.Contract(
        smartTokenXAddress,
        erc20ABI,
        signer
      );
      await approveToken(contract, approvalAmount, bcorepoolAddr);
    } catch (error) {
      console.log(error);
    }
  }

  async function handleApproveY() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const bpool = new ethers.Contract(bpoolAddress, bpoolAbi, signer);

      const bcorepoolAddr = await bpool.bPool();
      // const accounts = await requestAccounts();
      // const testAccountAddress = accounts[0];
      const contract = new ethers.Contract(
        smartTokenYAddress,
        erc20ABI,
        signer
      );
      await approveToken(contract, approvalAmount, bcorepoolAddr);
    } catch (error) {
      console.log(error);
    }
  }

  async function handleApproveUn() {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const bpool = new ethers.Contract(bpoolAddress, bpoolAbi, signer);

      const bcorepoolAddr = await bpool.bPool();
      // const accounts = await requestAccounts();
      // const testAccountAddress = accounts[0];
      const contract = new ethers.Contract(
        underlyingTokenAddress,
        erc20ABI,
        signer
      );
      await approveToken(contract, approvalAmount, bcorepoolAddr);
    } catch (error) {
      console.log(error);
    }
  }

  async function handleSwapUSDCForSmartTokenX() {
    await performSwap(
      usdcAddress,
      swapAmount,
      smartTokenXAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapUSDCForSmartTokenY() {
    await performSwap(
      usdcAddress,
      swapAmount,
      smartTokenYAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapUSDCForUnderlying() {
    await performSwap(
      usdcAddress,
      swapAmount,
      underlyingTokenAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapXforUSDC() {
    await performSwap(
      smartTokenXAddress,
      swapAmount,
      usdcAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapXForSmartTokenY() {
    await performSwap(
      smartTokenXAddress,
      swapAmount,
      smartTokenYAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapXForUnderlying() {
    await performSwap(
      smartTokenXAddress,
      swapAmount,
      underlyingTokenAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapYforUSDC() {
    await performSwap(
      smartTokenYAddress,
      swapAmount,
      usdcAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapYForSmartTokenX() {
    await performSwap(
      smartTokenYAddress,
      swapAmount,
      smartTokenXAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapYForUnderlying() {
    await performSwap(
      smartTokenYAddress,
      swapAmount,
      underlyingTokenAddress,
      "0",
      "10000"
    );
  }
  async function handleSwapUnforUSDC() {
    await performSwap(
      underlyingTokenAddress,
      swapAmount,
      usdcAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapUnForSmartTokenX() {
    await performSwap(
      underlyingTokenAddress,
      swapAmount,
      smartTokenXAddress,
      "0",
      "10000"
    );
  }

  async function handleSwapUnForY() {
    await performSwap(
      underlyingTokenAddress,
      swapAmount,
      smartTokenYAddress,
      "0",
      "10000"
    );
  }

  async function buyWithoutPermit() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const accounts = await requestAccounts();
      const testAccountAddress = accounts[0];
      const contract = new ethers.Contract(
        smartTokenXAddress,
        smartTokenAbi,
        signer
      );
      try {
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

  async function buy() {
    if (typeof window.ethereum !== "undefined") {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const underlyingToken = new ethers.Contract(
        underlyingTokenAddress,
        underlyingTokenWithPermitAbi,
        signer
      );

      const smartTokenX = new ethers.Contract(
        smartTokenXAddress,
        smartTokenAbi,
        signer
      );
      try {
        const currentNounce = await underlyingToken.nonces(testAccountAddress);
        const allowance = await underlyingToken.allowance(
          testAccountAddress,
          tokenFactoryAddress
        );
        console.log(`allowance : ${allowance}`);

        const permit = await createPermit(
          tokenFactoryAddress,
          `${ethers.utils.parseEther(depositAmount)}`,
          +currentNounce.toString(),
          permitDeadline
        );
        console.log(
          `r: 0x${permit.r.toString("hex")}, s: 0x${permit.s.toString(
            "hex"
          )}, v: ${permit.v}, sig: ${permit.signature}`
        );
        await smartTokenX.depositWithPermit(
          `${ethers.utils.parseEther(depositAmount)}`,
          testAccountAddress,
          permitDeadline,
          `${permit.v}`,
          permit.r,
          permit.s
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
      const accounts = await requestAccounts();
      const testAccountAddress = accounts[0];
      try {
        const smartTokenX = new ethers.Contract(
          smartTokenXAddress,
          smartTokenAbi,
          signer
        );
        const data = await smartTokenX.withdraw(
          BigNumber.from(`${ethers.utils.parseEther(withdrawalAmount)}`),
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
        smartTokenXAddress,
        smartTokenAbi,
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

  async function tokenSupply(smartToken = "x") {
    if (typeof window.ethereum !== "undefined") {
      let contract;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      if (smartToken == "x") {
        contract = new ethers.Contract(
          smartTokenXAddress,
          smartTokenAbi,
          provider
        );
      } else {
        contract = new ethers.Contract(
          smartTokenYAddress,
          smartTokenAbi,
          provider
        );
      }
      try {
        const data = await contract.totalSupply();
        console.log(
          `total supply of ${
            smartToken == "x" ? "tokenX" : "tokenY"
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
          smartTokenXAddress,
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
          smartTokenXAddress,
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
      const smartTokenX = new ethers.Contract(
        smartTokenXAddress,
        smartTokenAbi,
        signer
      );
      const smartTokenY = new ethers.Contract(
        underlyingTokenAddress,
        smartTokenAbi,
        signer
      );

      try {
        const allowance1 = await smartTokenX.allowance(
          testAccountAddress,
          uniswapV2RouterAddress
        );
        const allowance2 = await smartTokenY.allowance(
          testAccountAddress,
          uniswapV2RouterAddress
        );
        console.log(`allowance1 : ${allowance1}`);
        console.log(`allowance2 : ${allowance2}`);
        if (+ethers.utils.formatEther(allowance1) < amount) {
          await smartTokenX.approve(uniswapV2RouterAddress, ethAmount);
        }

        if (+ethers.utils.formatEther(allowance2) < amount) {
          await smartTokenY.approve(uniswapV2RouterAddress, ethAmount);
        }

        const data = await contract.addLiquidity(
          smartTokenXAddress,
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
        const data = await contract.balanceOf(testAccountAddress);
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
        const fromTokenAddress = smartTokenXAddress; // Token X
        const toTokenAddress = underlyingTokenAddress; // Token Y
        const amountIn = ethers.utils.parseEther("1"); // 1 Token X
        const amountOutMin = "0"; // minimum acceptable amount of Token Y
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
        const path = [fromTokenAddress, toTokenAddress];
        const options = {
          gasPrice: ethers.utils.parseUnits("100", "gwei"),
          gasLimit: 200000,
        };

        const smartTokenX = new ethers.Contract(
          smartTokenXAddress,
          smartTokenAbi,
          signer
        );
        await smartTokenX.approve(uniswapV2RouterAddress, amountIn);

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
        {/* <button style={buttonStyle} onClick={createPair}>
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
        </button> */}
        <br />
        <br />
        <br />
        <button style={buttonStyle} onClick={tokenBalance.bind(this, "x")}>
          Balance of R1 - smartX
        </button>
        <button style={buttonStyle} onClick={tokenBalance.bind(this, "y")}>
          Balance of R2 -smartY
        </button>
        <input
          style={inputStyle}
          onChange={(e) => setApprovalAmount(e.target.value)}
          placeholder="Amount to Approve"
        />
        <button style={buttonStyle} onClick={approve}>
          Seek Approval
        </button>
        <input
          style={inputStyle}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Amount to Deposit"
        />
        <button style={buttonStyle} onClick={buyWithoutPermit}>
          Deposit underlyingToken (Get smartTokens)
        </button>
        {/* <input
          style={inputStyle}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="Amount to Deposit"
        />
        <button style={buttonStyle} onClick={buy}>
          Buy Tokens <small>using permit</small>
        </button> */}
        <input
          style={inputStyle}
          onChange={(e) => setWithdrawalAmount(e.target.value)}
          placeholder="Amount to Withdraw"
        />
        <button style={buttonStyle} onClick={withdraw}>
          Withdraw Token
        </button>
        {/* <input
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
        </button> */}
        <br />
        <br />
        <br />
        <label htmlFor="approveAmount">Approve Amount:</label>
        <input
          id="approveAmount"
          type="text"
          value={approvalAmount}
          onChange={(e) => setApprovalAmount(e.target.value)}
        />
        <label htmlFor="swapAmount">Swap Amount:</label>
        <input
          id="swapAmount"
          type="text"
          value={swapAmount}
          onChange={(e) => setSwapAmount(e.target.value)}
        />
        <br />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={buttonStyle} onClick={handleApproveUSDC}>
            Approve USDC for swap
          </button>
          <button style={buttonStyle} onClick={handleApproveX}>
            Approve R1 for swap
          </button>
          <button style={buttonStyle} onClick={handleApproveY}>
            Approve R2 for swap
          </button>
          <button style={buttonStyle} onClick={handleApproveUn}>
            Approve underlyingToken for swap
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={buttonStyle} onClick={handleSwapUSDCForSmartTokenX}>
            Perform Swap USDC for R1
          </button>
          <button style={buttonStyle} onClick={handleSwapUSDCForSmartTokenY}>
            Perform Swap USDC for R2
          </button>
          <button style={buttonStyle} onClick={handleSwapUSDCForUnderlying}>
            Perform Swap USDC for Underlying
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={buttonStyle} onClick={handleSwapXforUSDC}>
            Perform Swap R1 for USDC
          </button>
          <button style={buttonStyle} onClick={handleSwapXForSmartTokenY}>
            Perform Swap R1 for R2
          </button>
          <button style={buttonStyle} onClick={handleSwapXForUnderlying}>
            Perform Swap R1 for Underlying
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={buttonStyle} onClick={handleSwapYforUSDC}>
            Perform Swap R2 for USDC
          </button>
          <button style={buttonStyle} onClick={handleSwapYForSmartTokenX}>
            Perform Swap R2 for R1
          </button>
          <button style={buttonStyle} onClick={handleSwapYForUnderlying}>
            Perform Swap R2 for Underlying
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button style={buttonStyle} onClick={handleSwapUnforUSDC}>
            Perform Swap Underlying for USDC
          </button>
          <button style={buttonStyle} onClick={handleSwapUnForSmartTokenX}>
            Perform Swap Underlying for R1
          </button>
          <button style={buttonStyle} onClick={handleSwapUnForY}>
            Perform Swap underlying for R2
          </button>
        </div>
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
  margin: "15 15px",
};

export default App;
