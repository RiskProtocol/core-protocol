// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./DevToken.sol";

error TokenFactory__NotEnough();
error TokenFactory__ConversionError();

contract TokenFactory {  
    DevToken[] public s_devTokenArray;
    address[] public s_funders;
    uint256 private constant INITIAL_USD_ETH_PRICE = 100;
    uint256 private constant FINAL_USD_ETH_PRICE = 173;
    uint256 private constant AMOUNT = 1 * 1e18;

    constructor() {
        DevToken devToken1 = new DevToken("DevToken1", "DVT1");
        s_devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken("DevToken2", "DVT2");
        s_devTokenArray.push(devToken2);
    }

    function sendToken(
        uint256 _devTokenIndex,
        address _receiver,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].issueToken(_receiver, _amount);
    }

    function getBalance(
        uint256 _devTokenIndex,
        address _owner
    ) public view returns (uint256) {
        return s_devTokenArray[_devTokenIndex].tokenBalance(_owner);
    }

    function burnToken(
        uint256 _devTokenIndex,
        address _owner,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].burnToken(_owner, _amount);
    }

    function buyAssets() public payable {
        if (msg.value < AMOUNT) revert TokenFactory__NotEnough();
        s_funders.push(msg.sender);
        sendToken(0, msg.sender, 1 * 1e18);
        sendToken(1, msg.sender, 1 * 1e18);
    }

    function rebase() public {
        address[] memory funders = s_funders;
        uint256 dvt1Balance;
        uint256 dvt2Balance;
        uint256 accountValue;
        uint256 rollOverValueInUSD;
        uint256 rollOverDivisor;
        for (
            uint256 funderIndex = 0;
            funderIndex < funders.length;
            funderIndex++
        ) {
            address funder = funders[funderIndex];
            dvt1Balance = getBalance(0, funder) / 1e18;
            dvt2Balance = getBalance(1, funder) / 1e18;
            accountValue =
                (dvt1Balance * (INITIAL_USD_ETH_PRICE / 2)) +
                (dvt2Balance * (INITIAL_USD_ETH_PRICE / 2));
            rollOverValueInUSD = accountValue / 2;
            rollOverDivisor = FINAL_USD_ETH_PRICE / 2;

            burnToken(0, funder, getBalance(0, funder));
            burnToken(1, funder, getBalance(1, funder));

            sendToken(
                0,
                funder,
                (((rollOverValueInUSD * 1e18) / rollOverDivisor) * 1e18) / 1e18
            );
            sendToken(
                1,
                funder,
                (((rollOverValueInUSD * 1e18) / rollOverDivisor) * 1e18) / 1e18
            );
        }
    }
}
