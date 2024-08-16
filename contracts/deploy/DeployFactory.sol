// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {CREATE3} from "@trp/solady/src/utils/CREATE3.sol";

/// @title Factory for deploying contracts to deterministic addresses via CREATE3
/// @author zefram.eth, trp, haidarally
/// @notice Enables deploying contracts using CREATE3. Each deployer (msg.sender) has
/// its own namespace for deployed addresses.
// @note :copied from https://github.com/SKYBITDev3/SKYBIT-Keyless-Deployment
contract TRPCREATE3Factory is Ownable{
    /// @notice Deploy a contract to a deterministic address
    /// @param salt A unique identifier for the deployment, combined with deployer address
    /// @param creationCode The bytecode of the contract to be deployed
    /// @return deployed The address of the deployed contract
    function deploy(
        bytes32 salt,
        bytes memory creationCode
    ) external payable returns (address deployed) {
        // hash salt with the deployer address to give each deployer its own namespace
        salt = keccak256(abi.encodePacked(msg.sender, salt));
        return CREATE3.deploy(salt, creationCode, msg.value);
    }

    /// @notice Used by the WrapperFactory to deploy a contract with the caller address
    /// @param salt A unique identifier for the deployment, combined with deployer address
    /// @param creationCode The bytecode of the contract to be deployed
    /// @param caller The address of the caller
    function deploywCaller(
        bytes32 salt,
        bytes memory creationCode,
        address caller
    ) external payable returns (address deployed) {
        // hash salt with the deployer address to give each deployer its own namespace
        salt = keccak256(abi.encodePacked(caller, salt));
        return CREATE3.deploy(salt, creationCode, msg.value);
    }

    /// @notice Get the address of a deployed contract
    /// @param deployer The address of the deployer
    /// @param salt A unique identifier used during deployment, combined with deployer address
    /// @return deployed The address of the deployed contract, if any
    function getDeployed(
        address deployer,
        bytes32 salt
    ) external view returns (address deployed) {
        // hash salt with the deployer address to give each deployer its own namespace
        salt = keccak256(abi.encodePacked(deployer, salt));
        return CREATE3.getDeployed(salt);
    }

    function drain(address receiver) onlyOwner external {
        AddressUpgradeable.sendValue(payable(receiver), address(this).balance);

    }
}
