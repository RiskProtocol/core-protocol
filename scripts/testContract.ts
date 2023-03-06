import { ethers, getNamedAccounts } from "hardhat"

async function main() {
    const { deployer, tester } = await getNamedAccounts();

    const tokenFactory1 = await ethers.getContract("TokenFactory", deployer)
    const tokenFactory = await ethers.getContract("TokenFactory", tester)
    // console.log(`Base address token: ${await tokenFactory.getBaseTokenAddress()}`)

    // console.log(`balance of Atoken0 before funding: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // console.log(`balance of Atoken1 before funding: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    // console.log(`balance of Btoken0 before funding: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`balance of Btoken1 before funding: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    console.log('Funding Contract...')
    const transactionResponse = await tokenFactory.buyAsset({ value: ethers.utils.parseEther('2') })
    await transactionResponse.wait(1)
    console.log('Funded')

    // console.log('Funding Contract2...')
    // const transactionResponse1 = await tokenFactory1.buyAsset({ value: ethers.utils.parseEther('2') })
    // await transactionResponse1.wait(1)
    // console.log('Funded2')
   
    console.log(`balance of Atoken0 after funding: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of Atoken1 after funding: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    // console.log(`balance of Btoken0 after funding: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`balance of Btoken1 after funding: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    
    // console.log('Withdrawing Contract...')
    // const transactionResponse1 = await tokenFactory.withdrawAsset(ethers.utils.parseEther('1'))
    // await transactionResponse1.wait(1)
    // console.log('withdrawn')
  
    // console.log(`balance of token0 after withdrawal: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // console.log(`balance of token1 after withdrawal: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    // console.log(`address1 that bought asset: ${await tokenFactory.getFunderAddressByIndex(0)}`)

    // console.log(`address2 that bought asset: ${await tokenFactory.getFunderAddressByIndex(1)}`)

    console.log(`calling rebase function:`)
    await tokenFactory.rebase()
    await tokenFactory.rebase1()
    await tokenFactory.rebase2()  


    console.log(`scaling factor length: ${await tokenFactory.getScallingFactorLength()}`)
    console.log(`get first scalling factor: ${await tokenFactory.getScallingFactor(0)}`)
    console.log(`get second scalling factor: ${await tokenFactory.getScallingFactor(1)}`)
    console.log(`get third scalling factor: ${await tokenFactory.getScallingFactor(2)}`)

    console.log(`balance of Atoken0 after skipping rebase period: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of Atoken1 after skipping rebase period: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)

    console.log(`calling transfer function:`)
    await tokenFactory.transfer(0,'0xb0d4afd8879ed9f52b28595d31b441d079b2ca07',ethers.utils.parseEther('1'))
    console.log(`balance of token0 after rebase function has been called: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log(`balance of token1 after rebase: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // // console.log(`balance of Btoken0 after rebase: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // // console.log(`balance of Btoken1 after rebase: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
 // to run this script use yarn hardhat run scripts/testContract.ts --network localhost