// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ITokenFactory.sol";

contract Orchestrator is UUPSUpgradeable, OwnableUpgradeable {
    struct Operation {
        bool enabled;
        address destination;
        bytes data;
    }

    Operation[] public operations;
    ITokenFactory private tokenFactory;

    event OperationAdded(bool enabled, address destination, bytes data);
    event OperationRemoved(uint256 index);
    event OperationStatusChanged(uint256 index, bool enabled);
    event RebaseExecuted(bytes data);
    event OperationExecuted(bytes data, address destination);

    error Orchestrator_FailedOperation();
    error Orchestrator_Index_Out_Bounds();
    error Orchestrator_Wrong_Dest_Addr();

    modifier lessThanLength(uint256 index) {
        if (!(index < operations.length)) {
            revert Orchestrator_Index_Out_Bounds();
        }
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _tokenFactory) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        tokenFactory = ITokenFactory(_tokenFactory);
    }

    function _authorizeUpgrade(
        address
    ) internal override(UUPSUpgradeable) onlyOwner {}

    function rebase(bytes memory encodedData, bytes memory signature) external {
        tokenFactory.executeRebase(encodedData, signature);
        emit RebaseExecuted(encodedData);
        if (operations.length > 0) {
            for (uint256 i = 0; i < operations.length; i++) {
                Operation storage t = operations[i];
                if (t.enabled) {
                    (bool result, ) = t.destination.call(t.data);
                    if (!result) {
                        revert Orchestrator_FailedOperation();
                    } else {
                        emit OperationExecuted(t.data, t.destination);
                    }
                }
            }
        }
    }

    /**
     * @notice Adds a ops that gets called for a downstream receiver of rebases
     * @param index The position at which the new ops should be added
     * @param destination Address of contract destination
     * @param data ops data payload
     */
    function addOperation(
        uint256 index,
        address destination,
        bytes memory data
    ) external onlyOwner {
        if (!(index <= operations.length)) {
            revert Orchestrator_Index_Out_Bounds();
        }

        // Expanding the ops array
        operations.push(
            Operation({enabled: false, destination: address(0), data: ""})
        );

        // Shift ops from the end of the array to the target index to the right
        for (uint256 i = operations.length - 1; i > index; i--) {
            operations[i] = operations[i - 1];
        }

        // Insert the new ops at the desired position
        operations[index] = Operation({
            enabled: true,
            destination: destination,
            data: data
        });

        emit OperationAdded(true, destination, data);
    }

    /**
     * @param index Index of ops to remove.
     */
    function removeOperation(
        uint256 index
    ) external onlyOwner lessThanLength(index) {
        for (uint256 i = index; i < operations.length - 1; i++) {
            operations[i] = operations[i + 1];
        }

        operations.pop();
        emit OperationRemoved(index);
    }

    /**
     * @param index Index of ops.
     * @param enabled True for enabled, false for disabled.
     */
    function setOperationEnabled(
        uint256 index,
        address destinationAddress,
        bool enabled
    ) external onlyOwner lessThanLength(index) {
        if (operations[index].destination != destinationAddress) {
            revert Orchestrator_Wrong_Dest_Addr();
        }

        operations[index].enabled = enabled;
        emit OperationStatusChanged(index, enabled);
    }

    /**
     * @return Number of ops, both enabled and disabled, in ops list.
     */
    function operationsSize() external view returns (uint256) {
        return operations.length;
    }

    function getTokenFactory() external view returns (address) {
        return address(tokenFactory);
    }
}
