import { useState } from 'react';
import { ethers } from 'ethers'
import { Biconomy } from "@biconomy/mexa";
import {tokenFactoryAddress, devTokenXAddress, devTokenYAddress, tokenFactoryAbi, devTokenAbi, underlyingTokenAddress} from './../contants'

function App() {
  const [depositAmount, setDepositAmount] = useState()
  const [withdrawalAmount, setWithdrawalAmount] = useState()
  const [transferAddress, setTransferAddress] = useState('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')

  async function requestAccounts() {
    return await window.ethereum.request({ method: 'eth_requestAccounts' });
  }

  async function tokenBalance(devToken = 'x') {
    if (typeof window.ethereum !== 'undefined') {
      let contract
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const accounts = await requestAccounts()
      if(devToken == 'x'){
        contract = new ethers.Contract(devTokenXAddress, devTokenAbi, provider)
      }else{
        contract = new ethers.Contract(devTokenYAddress, devTokenAbi, provider)
      }      
      try {
        const data = await contract.balanceOf(accounts[0])
        console.log(`balance of ${ devToken=='x'? 'tokenX':'tokenY'} is ${data.toString()}`)
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  async function buy() {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner();
      const contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, signer)
      const underlyingToken = new ethers.Contract(underlyingTokenAddress, devTokenAbi, signer)
      try {       
        const allowance = await underlyingToken.allowance('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', tokenFactoryAddress)  
        console.log(`allowance : ${allowance}`) 
        if(allowance<+ethers.utils.parseEther(depositAmount)){
          await underlyingToken.approve(tokenFactoryAddress,ethers.constants.MaxUint256) 
        }    
        await contract.deposit(`${ethers.utils.parseEther(depositAmount)}`,'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')
        console.log('Buying asset...')
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  async function withdraw() {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner();
      const contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, signer)
      try {
        const data = await contract.withdraw(`${ethers.utils.parseEther(withdrawalAmount)}`,'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266','0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')
        console.log('withdrawing asset...')
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  async function rebase() {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner();
      const contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, signer)      
      try {
        await contract.rebase()
        console.log('Rebasing...')
        // console.log(`Rebase Count is ${contract1.getScallingFactorLength()}`)
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  async function rebaseCount() {
    if (typeof window.ethereum !== 'undefined') {      
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, provider)
     
      try {
        const data = await contract.getScallingFactorLength()
        console.log(`Current system rebase count is ${data}`)
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  async function userLastRebase() {
    if (typeof window.ethereum !== 'undefined') {      
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const accounts = await requestAccounts()
      const contract = new ethers.Contract(tokenFactoryAddress, tokenFactoryAbi, provider)
     
      try {
        const data = await contract.getUserLastRebaseCount(accounts[0])
        console.log(`User last rebase count is ${data}`)
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }  

  async function transfer() {
    if (typeof window.ethereum !== 'undefined') {
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner();
      const contract = new ethers.Contract(devTokenXAddress, devTokenAbi, signer)      
      try {
        await contract.transfer(transferAddress, ethers.utils.parseEther('1'))
        console.log('transfering...')        
      } catch (err) {
        console.log("Error: ", err)
      }
    }    
  }

  return (
    <div className="App">
      <div style={containerStyle}>      
        <button style={buttonStyle} onClick={tokenBalance.bind(this, 'x')}>Balance of Token X</button>
        <button style={buttonStyle} onClick={tokenBalance.bind(this, 'y')}>Balance of Token Y</button>
        <input style={inputStyle} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount to Deposit" />
        <button style={buttonStyle} onClick={buy}>Buy Tokens</button>
        <input style={inputStyle} onChange={e => setWithdrawalAmount(e.target.value)} placeholder="Amount to Withdraw" />
        <button style={buttonStyle} onClick={withdraw}>Withdraw Token</button>
        <input style={inputStyle} value = {transferAddress} onChange={e => setTransferAddress(e.target.value)} placeholder="Address to transfer to" />
        <button style={buttonStyle} onClick={transfer}>Trade 1 of Token X to abv address</button>
        <button style={buttonStyle} onClick={rebaseCount}>Current System Rebase Count</button>
        <button style={buttonStyle} onClick={rebase}>Trigger Rebase</button>
        <button style={buttonStyle} onClick={userLastRebase}>Last User Rebase Participation</button>
      </div>
    </div>
  );
}

const containerStyle = {
  width: '900px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 100
}

const inputStyle = {
  width: '100%',
  padding: '8px'

}

const buttonStyle = {
  width: '100%',
  marginBottom: 15,
  height: '30px',
}

export default App;