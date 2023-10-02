// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ERC20 Token with Permit Extension Interface
/// @dev This interface extends the standard ERC20 interface with a permit function
interface IERC20Update is IERC20 {
    /// @notice Allows for gasless approvals by using off-chain generated signatures.
    /// @param owner The owner of the tokens.
    /// @param spender The address which will spend the tokens.
    /// @param value The amount of tokens to be spent.
    /// @param deadline The time after which the permit signature is invalid.
    /// @param v The recovery id of the ECDSA signature.
    /// @param r Output value r of the ECDSA signature.
    /// @param s Output value s of the ECDSA signature.
    function permit(
        address owner,
        address spender,
        uint value,
        uint deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
