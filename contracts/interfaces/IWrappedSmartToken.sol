// SPDX-License-Identifier: GPL-3.0-or-later

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
        address priceFeedOracle_
    ) external;

    function initialize(
        address underlying_,
        string memory name_,
        string memory symbol_,
        uint256 initialRate
    ) external ;
}
