import { ethers, getNamedAccounts } from "hardhat"

async function main() {
    const { deployer, tester } = await getNamedAccounts();
    const tokenFactory = await ethers.getContract("TokenFactory", tester)
    console.log(`Base address token: ${await tokenFactory.getBaseTokenAddress()}`)

    console.log(`balance of token0 before funding: ${await tokenFactory.getBalance(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of token1 before funding: ${await tokenFactory.getBalance(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    console.log('Funding Contract...')
    const transactionResponse = await tokenFactory.buyAsset({ value: ethers.utils.parseEther('1') })
    await transactionResponse.wait(1)
    console.log('Funded')
   
    console.log(`balance of token0 after funding: ${await tokenFactory.getBalance(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of token1 after funding: ${await tokenFactory.getBalance(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    
    console.log('Withdrawing Contract...')
    const transactionResponse1 = await tokenFactory.withdrawAsset(ethers.utils.parseEther('1'))
    await transactionResponse1.wait(1)
    console.log('withdrawn')
  
    console.log(`balance of token0 after withdrawal: ${await tokenFactory.getBalance(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of token1 after withdrawal: ${await tokenFactory.getBalance(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    console.log(`address that bought asset: ${await tokenFactory.getFunderAddressByIndex(0)}`)

    console.log(`calling rebase function:`)
    await tokenFactory.rebase()

    console.log(`balance of token0 after rebase: ${await tokenFactory.getBalance(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of token1 after rebase: ${await tokenFactory.getBalance(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
 // to run this script use yarn hardhat run scripts/testContract.ts --network localhost