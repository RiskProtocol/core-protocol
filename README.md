# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a script that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts
```

# Deployment

`yarn hardhat deploy --network {desiredNetwork}`


## notes
The `Erc20Upgreadable` contract was updated in order to accomodate for 2 new functions, both related to the
Rebalance functionalities
--  TreasuryTransfer : Transfers the fee amount collected to the tokenFcatory contract so that the contract will hold it for 1 rebalance interval before crediting it to the treasury address
This function allows the transfer of the fee amount without using `mint`
-- BalanceAdjust: Adjusts the balance of a user after rebalance is applied according to the new numbers provided by Ding's formula after deducting possible mgmt fees. Again no minting/burning is
required

Hence both functions help to keep the totalSupply accurate.


## Vanity Deployment

- We first need to set a private key that would be used to deploy everything in hardhat configs (fresh PK is best)
- We deploy the Deployement Factory at the same address on every chains
`yarn hardhat run --network xxxx scripts/deployFactory.ts`, if the PK is not fresh, we might want to choose a higher nonce, we can edit the script itself
- We deploy the factory on localhost(Fork of mainnet), usings same nonce, therefore we have the same address on localhost as well.
- We set the Prefix that we want to match in `VanitySalt.ts`
- we run the script on localhost `yarn hardhat run --network localhost scripts/vanitySalt.ts `
- Then we deploy the contracts on localhost, just to test, followed by testnets/mainnets
` yarn hardhat run --network localhost scripts/deploymentScript.ts `
` yarn hardhat run --network sepolia scripts/deploymentScript.ts `/
yarn hardhat run --network localhost  scripts/deploymentScript-wrapped.ts

-- Wrappers should be deployed at last
1. Ensure that the wallet has 1000 wei of underlying
2. run `yarn hardhat run --network localhost scripts/deploymentScript-wrapped.ts 
### Contracts deployed on Sepolia 
{
  "tokenFactory": {
    "proxyAddress": "0xd3371c8cE3Bf5efd2777226071ed4f3b0655d33f",
    "saltStr": "264"
  },
  "SmartTokenX": {
    "proxyAddress": "0xD3CaD0B22ED0E5fdc05c5cb5f2533b113B29EDF3",
    "saltStr": "340"
  },
  "SmartTokenY": {
    "proxyAddress": "0xd3fEa8aa1075E11947427BE0f6BED1B57992F88D",
    "saltStr": "368"
  },
  "Orchestator": {
    "proxyAddress": "0xD34A536885c4Bf938E5cEc06d1e1F4Ab28a024c9",
    "saltStr": "607"
  }
}
