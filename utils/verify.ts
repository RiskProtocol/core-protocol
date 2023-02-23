import { run } from "hardhat"
// to verify the contract on etherscan
export const verify = async (contractAddress: string, args: any[]) => {
    console.log('verifying contract')
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args
        })
    } catch (error: any) {
        if (error.message.toLowerCase().includes("already verified")) {
            console.log('Already Verified')
        } else {
            console.log(error)
        }
    }

}