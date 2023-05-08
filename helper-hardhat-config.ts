export interface networkConfigItem {
    priceFeed?: string
    blockConfirmations?: number
}

export interface networkConfigInfo {
    [key: string]: networkConfigItem
}

export const networkConfig: networkConfigInfo = {
    goerli: {
        priceFeed: '0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e',
        blockConfirmations: 6
    },
    polygon: {
        priceFeed: '0xF9680D99D6C9589e2a93a78A04A279e509205945'
    },
    sepolia: {
        priceFeed: '0x5fb1616F78dA7aFC9FF79e0371741a747D2a7F22',
        blockConfirmations: 6
    },
    localhost: {},
    hardhat: {}
}

export const developmentChains = ['localhost', 'hardhat', 'sepolia']

export const DECIMALS = "18"
export const INITIAL_PRICE = "2000000000000000000000" // 2000, we then add the 18 decimals which is 18 zeros
export const BASE_TOKEN_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
export const BASE_TOKEN_DECIMALS = 18
export const TOKEN1_NAME = "RistP One"
export const TOKEN1_SYMBOL = "R1"
export const TOKEN2_NAME = "RistP Two"
export const TOKEN2_SYMBOL = "R2"
export const REBASE_INTERVAL = 1200 // 20mins in seconds
export const defaultOperators: string[] = []
export const CHAINLINK_TOKEN_ADDRESS = "0x779877A7B0D9E8603169DdbD7836e478b4624789"
export const CHAINLINK_ORACLE_ADDRESS = "0x6090149792dAAeE9D1D568c9f9a6F6B46AA29eFD"
export const CHAINLINK_JOB_ID = "0x3533663937353539323063643435316138666534366635303837343638333935" //53f9755920cd451a8fe46f5087468395
export const LINK_FEE = 10 
export const CURRENT_TIMESTAMP = Math.floor(Date.now() / 1000) // in seconds
