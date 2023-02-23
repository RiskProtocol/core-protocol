export interface networkConfigItem {
    ethUsdPriceFeed?: string
    blockConfirmations?: number
}

export interface networkConfigInfo {
    [key: string]: networkConfigItem
}

export const networkConfig:networkConfigInfo = {
    goerli:{      
        ethUsdPriceFeed:'0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e',
        blockConfirmations:6
    },
    polygon:{       
        ethUsdPriceFeed:'0xF9680D99D6C9589e2a93a78A04A279e509205945'
    },
    localhost:{},
    hardhat:{}
}

export const developmentChains = ['localhost','hardhat']

export const DECIMALS = "18"
export const INITIAL_PRICE = "2000000000000000000000" // 2000, we then add the 18 decimals which is 18 zeros
export const BASE_TOKEN_ADDRESS ="0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"
export const TOKEN1_NAME ="RistP One"
export const TOKEN1_SYMBOL ="R1"
export const TOKEN2_NAME ="RistP Two"
export const TOKEN2_SYMBOL ="R2"
