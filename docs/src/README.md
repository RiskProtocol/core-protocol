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

