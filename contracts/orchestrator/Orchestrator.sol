// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ITokenFactory.sol";
import "../interfaces/IElasticPoolSupply.sol";
import "../lib/Shared.sol";

contract Orchestrator is UUPSUpgradeable, OwnableUpgradeable {
    struct Operation {
        bool enabled;
        address destination;
        bytes data;
    }

    Operation[] public operations;
    ITokenFactory private tokenFactory;
    address[] public balancerPools;
    mapping(address => bool) private poolExists;

    event OperationAdded(bool enabled, address destination, bytes data);
    event OperationRemoved(uint256 index);
    event BalancerPoolAdded(uint256 index, address addr);
    event BalancerPoolRemoved(uint256 index);
    event OperationStatusChanged(uint256 index, bool enabled);
    event RebalanceExecuted(bytes data);
    event BalancerResynced(address data);
    event OperationExecuted(bytes data, address destination);

    error Orchestrator_FailedOperation();
    error Orchestrator_Index_Out_Bounds();
    error Orchestrator_Wrong_Dest_Addr();

    modifier lessThanLength(uint256 index, uint256 arrayLength) {
        if (!(index < arrayLength)) {
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

    function rebalance(bytes memory encodedData, bytes memory signature) external {
        tokenFactory.executeRebalance(encodedData, signature);
        if (balancerPools.length != 0) {
            //get price
            Shared.ScheduledRebalance memory rebalanceCall = tokenFactory
                .verifyAndDecode(signature, encodedData);
            //resync
            for (uint256 i = 0; i < balancerPools.length; i++) {
                IElasticPoolSupply(balancerPools[i]).resyncWeight(
                    uint256(rebalanceCall.smartTokenXprice)
                );
                emit BalancerResynced(balancerPools[i]);
            }
        }
        emit RebalanceExecuted(encodedData);
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
     * @notice Executes scheduled rebalances pending in the queue
     * @dev This function is called when the scheduled rebalance queue had more than 5 entries
     * only 5 will be executed and the rest will be left in the queue
     */
    function executeScheduledRebalances() external {
        tokenFactory.executeScheduledRebalances();
    }

    /**
     * @notice Adds a ops that gets called for a downstream receiver of rebalances
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
    ) external onlyOwner lessThanLength(index, operations.length) {
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
    ) external onlyOwner lessThanLength(index, operations.length) {
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

    /// Add a new balancer pool to Orchestrator
    /// @param _pool : the address of the new balancer pool
    /// @param index : the index of pool which we want to remove
    function addBalancerPool(uint256 index, address _pool) external onlyOwner {
        require(!poolExists[_pool], "Pool already added");
        //expand the array
        balancerPools.push(address(0));

        //shift every element after i by 1
        for (uint256 i = balancerPools.length - 1; i > index; i--) {
            balancerPools[i] = balancerPools[i - 1];
        }

        balancerPools[index] = _pool;

        poolExists[_pool] = true;
        emit BalancerPoolAdded(index, _pool);
    }

    // Remove a Balancer pool address
    /// @param index : the address of the new balancer pool
    function removeBalancerPool(
        uint index
    ) external onlyOwner lessThanLength(index, balancerPools.length) {
        require(poolExists[balancerPools[index]], "Pool does not exist");
        poolExists[balancerPools[index]] = false;

        // Shift all elements after index one position to the left
        for (uint i = index; i < balancerPools.length - 1; i++) {
            balancerPools[i] = balancerPools[i + 1];
        }
        //remove the last duplicated pool now
        balancerPools.pop();
        emit BalancerPoolRemoved(index);
    }
}
