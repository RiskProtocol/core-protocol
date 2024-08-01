//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @title Interface for TRPCREATE3Factory
/// @notice Interface for deploying contracts to deterministic addresses via CREATE3
interface ITRPCREATE3Factory {
    /// @notice Deploy a contract to a deterministic address
    /// @param salt A unique identifier for the deployment, combined with deployer address
    /// @param creationCode The bytecode of the contract to be deployed
    /// @return deployed The address of the deployed contract
    function deploy(
        bytes32 salt,
        bytes memory creationCode
    ) external payable returns (address deployed);

    /// @notice Used by the WrapperFactory to deploy a contract with the caller address
    /// @param salt A unique identifier for the deployment, combined with deployer address
    /// @param creationCode The bytecode of the contract to be deployed
    /// @param caller The address of the caller
    function deploywCaller(
        bytes32 salt,
        bytes memory creationCode,
        address caller
    ) external payable returns (address deployed);

    /// @notice Get the address of a deployed contract
    /// @param deployer The address of the deployer
    /// @param salt A unique identifier used during deployment, combined with deployer address
    /// @return deployed The address of the deployed contract, if any
    function getDeployed(
        address deployer,
        bytes32 salt
    ) external view returns (address deployed);
}
