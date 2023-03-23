import { ethers, getNamedAccounts } from "hardhat"
import { TOKEN1_NAME, TOKEN2_NAME, TOKEN1_SYMBOL, TOKEN2_SYMBOL } from '../helper-hardhat-config';

async function main() {
    const { deployer, tester } = await getNamedAccounts();

    const tokenFactory = await ethers.getContract("TokenFactory", deployer)
    const tokenFactory1 = await ethers.getContract("TokenFactory", tester)

    console.log(`DevToken Address 1: ${await tokenFactory.getDevTokenAddress(0)}`)
    console.log(`DevToken Address 2: ${await tokenFactory.getDevTokenAddress(1)}`)


    // console.log(`Deploying tokens: ${await tokenFactory.initialize(TOKEN1_NAME, TOKEN1_SYMBOL, TOKEN2_NAME, TOKEN2_SYMBOL, require('../deployments/localhost/TokenFactory.json').address)}`)
    
    // console.log(`Base address token: ${await tokenFactory.getBaseTokenAddress()}`)

    console.log(`balance of Atoken0 before funding: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`balance of Atoken1 before funding: ${await tokenFactory.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    // console.log(`balance of Btoken0 before funding: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`balance of Btoken1 before funding: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    console.log('Funding Contract...')
    const transactionResponse = await tokenFactory.buyAsset({ value: ethers.utils.parseEther('6') })
    await transactionResponse.wait(1)
    console.log('Funded')

    // console.log('Funding Contract2...')
    // const transactionResponse1 = await tokenFactory1.buyAsset({ value: ethers.utils.parseEther('7') })
    // await transactionResponse1.wait(1)
    // console.log('Funded2')
   
    console.log(`balance of Atoken0 after funding: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`balance of Atoken1 after funding: ${await tokenFactory.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    // console.log(`balance of Btoken0 after funding: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`balance of Btoken1 after funding: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    
    // console.log('Withdrawing Contract...')
    // const transactionResponse1 = await tokenFactory.withdrawAsset(ethers.utils.parseEther('1'))
    // await transactionResponse1.wait(1)
    // console.log('withdrawn')
  
    // console.log(`balance of token0 after withdrawal: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // console.log(`balance of token1 after withdrawal: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    console.log('trade one token x before rebase')
    await tokenFactory.transfer(0,'0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',ethers.utils.parseEther('1'))
    console.log(`balance of token after the trade: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    console.log(`calling rebase function:`)
    await tokenFactory.rebase()
    // await tokenFactory.rebase()
    // await tokenFactory.rebase()  


    console.log(`scaling factor length: ${await tokenFactory.getScallingFactorLength()}`)
    console.log(`get first scalling factor: ${await tokenFactory.getScallingFactor(0)}`)
    // console.log(`get second scalling factor: ${await tokenFactory.getScallingFactor(1)}`)
    // console.log(`get third scalling factor: ${await tokenFactory.getScallingFactor(2)}`)

    console.log(`balance of Atoken0 after skipping rebase period: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`balance of Atoken1 after skipping rebase period: ${await tokenFactory.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)

    // console.log(`calling transfer function:`)
    await tokenFactory.transfer(0,'0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',ethers.utils.parseEther('1'))
    console.log(`balance of Atoken0 after actual rebase period: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`balance of Atoken1 after actual rebase period: ${await tokenFactory.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`user rebase count: ${await tokenFactory.getUserLastRebaseCount('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // console.log(`balance of token0 after transfer function has been called: ${await tokenFactory.balanceOf(0,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // console.log(`balance of token1 after transfer: ${await tokenFactory.balanceOf(1,'0x70997970C51812dc3A010C7d01b50e0d17dc79C8')}`)
    // // console.log(`balance of Btoken0 after rebase: ${await tokenFactory1.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    // // console.log(`balance of Btoken1 after rebase: ${await tokenFactory1.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`calling 2nd rebase:`)
    await tokenFactory.rebase()
    console.log(`balance of Atoken0 after second rebase period: ${await tokenFactory.balanceOf(0,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    console.log(`balance of Atoken1 after second rebase period: ${await tokenFactory.balanceOf(1,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')}`)
    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
 // to run this script use yarn hardhat run scripts/testContract.ts --network localhost