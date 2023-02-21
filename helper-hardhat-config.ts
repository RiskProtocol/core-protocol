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