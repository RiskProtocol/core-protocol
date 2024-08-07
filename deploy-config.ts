import { ethers } from "ethers";

export const deployConfig = {
    "walletNonce": 23,
    "baseToken": "0xbC4dc723F66f196F6c2eef7cE7802890862CdEA8",//@note The UNDERLYING token address
    "sanctionsContract": "0x492D365E08c6C9431acD49F41a3Ff8c12C880500", //@note The sanctions contract address
    "FF_INTERVAL": 86400, //@note The FEE Factor interval
    "REBALANCE_INTERVAL": 86400, //@note The rebalance interval
    "TOKEN1_NAME": "BTC-Risk-ON", //@note The name of the SMarttoken
    "TOKEN1_SYMBOL": "BTCrX", //@note The symbol of the SMarttoken
    "TOKEN2_NAME": "BTC-Risk-OFF", //@note The name of the SMarttoken
    "TOKEN2_SYMBOL": "BTCrY", //@note The symbol of the SMarttoken
    "rateLimitsDefault": { //@note The rate limits for the contract
        "withdraw": ethers.constants.MaxUint256,
        "deposit": ethers.constants.MaxUint256,
        "period": 1
    },
    "W_TOKEN1_NAME": "wBTC-Risk-ON", //@note The name of the wrapped token
    "W_TOKEN1_SYMBOL": "wBTCrX", //@note The symbol of the wrapped token
    "W_TOKEN2_NAME": "wBTC-Risk-OFF", //@note The name of the wrapped token
    "W_TOKEN2_SYMBOL": "wBTCrY", //@note The symbol of the wrapped token
    "DATA_TIMEOUT": 300, //@note The data timeout
}