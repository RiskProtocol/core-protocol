// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ITokenFactory.sol";

contract Orchestrator is UUPSUpgradeable, OwnableUpgradeable {
    struct Transaction {
        bool enabled;
        address destination;
        bytes data;
    }

    // Stable ordering is not guaranteed.
    Transaction[] public transactions;
    ITokenFactory public tokenFactory;

    event TransactionAdded(bool enabled, address destination, bytes data);
    event TransactionRemoved(uint256 index);
    event TransactionStatusChanged(uint256 index, bool enabled);
    event RebaseExecuted(bytes data);
    event TransactionExecuted(bytes data, address destination);

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
        if (transactions.length > 0) {
            for (uint256 i = 0; i < transactions.length; i++) {
                Transaction storage t = transactions[i];
                if (t.enabled) {
                    (bool result, ) = t.destination.call(t.data);
                    if (!result) {
                        revert("Transaction Failed");
                    } else {
                        emit TransactionExecuted(t.data, t.destination);
                    }
                }
            }
        }
    }

    /**
     * @notice Adds a transaction that gets called for a downstream receiver of rebases
     * @param destination Address of contract destination
     * @param data Transaction data payload
     */
    function addTransaction(
        address destination,
        bytes memory data
    ) external onlyOwner {
        transactions.push(
            Transaction({enabled: true, destination: destination, data: data})
        );
        emit TransactionAdded(true, destination, data);
    }

    /**
     * @param index Index of transaction to remove.
     *              Transaction ordering may have changed since adding.
     */
    function removeTransaction(uint256 index) external onlyOwner {
        require(index < transactions.length, "index out of bounds");

        if (index < transactions.length - 1) {
            transactions[index] = transactions[transactions.length - 1];
        }

        transactions.pop();
        emit TransactionRemoved(index);
    }

    /**
     * @param index Index of transaction. Transaction ordering may have changed since adding.
     * @param enabled True for enabled, false for disabled.
     */
    function setTransactionEnabled(
        uint256 index,
        bool enabled
    ) external onlyOwner {
        require(
            index < transactions.length,
            "index must be in range of stored tx list"
        );
        transactions[index].enabled = enabled;
        emit TransactionStatusChanged(index, enabled);
    }

    /**
     * @return Number of transactions, both enabled and disabled, in transactions list.
     */
    function transactionsSize() external view returns (uint256) {
        return transactions.length;
    }
}
