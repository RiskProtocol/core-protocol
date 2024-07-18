// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import "@trp/buttonwood-wrapper/contracts/interfaces/IUnbuttonToken.sol";

// Interface definition for the UnbuttonToken ERC20 wrapper contract
interface IWrappedSmartToken is IUnbuttonToken {
    
    function riskInitialize(
        address underlying_,
        address sellingToken_, //alternate SMARTTOKEN
        string memory name_,
        string memory symbol_,
        uint256 initialRate,
        bool isWrappedX_,
        address owner_,
        address signer_,
        uint256 timeout_, address sanctionsContract_
    ) external;

    function initialize(
        address underlying_,
        string memory name_,
        string memory symbol_,
        uint256 initialRate
    ) external ;
}
