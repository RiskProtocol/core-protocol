export interface networkConfigItem {
    priceFeed?: string
    blockConfirmations?: number
}

export interface networkConfigInfo {
    [key: string]: networkConfigItem
}

export const networkConfig: networkConfigInfo = {
    goerli: {      
        blockConfirmations: 6
    },
    sepolia: {       
        blockConfirmations: 6
    },
    localhost: {},
    hardhat: {}
}

export const developmentChains = ['localhost', 'hardhat', 'sepolia']

export const BASE_TOKEN_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
export const TOKEN1_NAME = "RistP One"
export const TOKEN1_SYMBOL = "R1"
export const TOKEN2_NAME = "RistP Two"
export const TOKEN2_SYMBOL = "R2"
export const REBASE_INTERVAL = 300 // 20mins in seconds
export const defaultOperators: string[] = []
export const CHAINLINK_TOKEN_ADDRESS = "0x779877A7B0D9E8603169DdbD7836e478b4624789"
export const CHAINLINK_ORACLE_ADDRESS = "0x6090149792dAAeE9D1D568c9f9a6F6B46AA29eFD"
export const CHAINLINK_UINT_JOB_ID = "0x3533663937353539323063643435316138666534366635303837343638333935" //53f9755920cd451a8fe46f5087468395
export const CHAINLINK_BYTES_JOB_ID = "0x3764613237303266333766643438653562316239613537313565333530396236" //7da2702f37fd48e5b1b9a5715e3509b6
export const LINK_FEE = 10 
export const CURRENT_TIMESTAMP = Math.floor(Date.now() / 1000) // in seconds
export const EXTERNAL_API_URL = 'https://jiokeokwuosa.github.io/risk-page/response.json'
