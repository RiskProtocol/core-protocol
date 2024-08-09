// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title SanctionsList Interface
/// @dev This interface defines a method for checking if an address is on a sanctions list.
/// Implementing contracts should return true if the address is sanctioned, false otherwise.
interface SanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

/// @title BaseContract
/// @dev It is utilized by TokenFactory and SmartTokens
/// to manage interactions with potentially sanctioned addresses and to handle
/// emergency situations by halting certain operations.
/// @notice Please refer to Chainalysis documentation (https://go.chainalysis.com/chainalysis-oracle-docs.html)
/// for the sanctions list.
contract BaseContract is Initializable, OwnableUpgradeable {
    //errors
    error BaseContract__SanctionedAddress();
    error BaseContract__DepositCircuitBreaker();
    error BaseContract__WithdrawCircuitBreaker();
    error BaseContract__TransferCircuitBreaker();
    error BaseContract__RebalanceCircuitBreaker();
    error BaseContract__FlashLoanCircuitBreaker();

    address private sanctionsContract;

    bool private depositCircuitBreaker;
    bool private withdrawCircuitBreaker;
    bool private transferCircuitBreaker;
    bool private rebalanceCircuitBreaker;
    bool private flashLoanCircuitBreaker;

    /// @dev Checks if the address is sanctioned.
    /// @param addressToCheck The address to be checked.
    modifier onlyNotSanctioned(address addressToCheck) {
        SanctionsList sanctionsList = SanctionsList(sanctionsContract);
        bool isSanctionedAddress = sanctionsList.isSanctioned(addressToCheck);
        if (isSanctionedAddress) revert BaseContract__SanctionedAddress();
        _;
    }

    // circuit breaker modifiers
    /// @dev Reverts if the deposit circuit breaker is active.
    /// This modifier is used to halt user deposits in emergency situations.
    modifier stopDeposit() {
        if (depositCircuitBreaker) revert BaseContract__DepositCircuitBreaker();
        _;
    }
    /// @dev Reverts if the withdraw circuit breaker is active.
    /// This modifier is used to halt user withdrawals in emergency situations.
    modifier stopWithdraw() {
        if (withdrawCircuitBreaker)
            revert BaseContract__WithdrawCircuitBreaker();
        _;
    }
    /// @dev Reverts if the transfer circuit breaker is active.
    /// This modifier is used to halt smart token transfers in emergency situations.
    modifier stopTransfer() {
        if (transferCircuitBreaker)
            revert BaseContract__TransferCircuitBreaker();
        _;
    }
    /// @dev Reverts if the rebalance circuit breaker is active.
    /// This modifier is used to halt rebalance operations in emergency situations.
    modifier stopRebalance() {
        if (rebalanceCircuitBreaker)
            revert BaseContract__RebalanceCircuitBreaker();
        _;
    }

    /// @dev Reverts if the stopFlashLoan circuit breaker is active.
    /// This modifier is used to halt flashloans operations in emergency situations.
    modifier stopFlashLoan() {
        if (flashLoanCircuitBreaker)
            revert BaseContract__FlashLoanCircuitBreaker();
        _;
    }

    /// @dev Initializes the BaseContract with a sanctions contract address.
    /// @param sanctionsContract_ The address of the sanctions contract.
    function __BaseContract_init(
        address sanctionsContract_
    ) internal onlyInitializing {
        sanctionsContract = sanctionsContract_;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // circuit breaker functions
    /// @notice Toggles the deposit circuit breaker on or off.
    /// @dev This function allows the contract owner to halt or resume deposit operations in case of emergency.
    /// Only the owner can call this function.
    function toggleDepositCircuitBreaker() external onlyOwner {
        depositCircuitBreaker = !depositCircuitBreaker;
    }

    /// @notice Toggles the withdraw circuit breaker on or off.
    /// @dev This function allows the contract owner to halt or resume withdraw operations in case of emergency.
    /// Only the owner can call this function.
    function toggleWithdrawCircuitBreaker() external onlyOwner {
        withdrawCircuitBreaker = !withdrawCircuitBreaker;
    }

    /// @notice Toggles the transfer circuit breaker on or off.
    /// @dev This function allows the contract owner to halt or resume smart token transfers in case of emergency.
    /// Only the owner can call this function.
    function toggleTransferCircuitBreaker() external onlyOwner {
        transferCircuitBreaker = !transferCircuitBreaker;
    }

    /// @notice Toggles the rebalance circuit breaker on or off.
    /// @dev This function allows the contract owner to halt or resume rebalance operations in case of emergency.
    /// Only the owner can call this function.
    function toggleRebalanceCircuitBreaker() external onlyOwner {
        rebalanceCircuitBreaker = !rebalanceCircuitBreaker;
    }

    /// @notice Toggles the rebalance circuit breaker on or off.
    /// @dev This function allows the contract owner to halt or resume rebalance operations in case of emergency.
    /// Only the owner can call this function.
    function toggleFlashLoanCircuitBreaker() external onlyOwner {
        flashLoanCircuitBreaker = !flashLoanCircuitBreaker;
    }

    /// @notice Activates all circuit breakers, halting deposit, withdraw, transfer, and rebalance operations.
    /// @dev This function allows the contract owner to halt critical operations in case of emergency.
    /// Only the owner can call this function.
    function stopAllCircuitBreakers() external onlyOwner {
        depositCircuitBreaker = true;
        withdrawCircuitBreaker = true;
        transferCircuitBreaker = true;
        rebalanceCircuitBreaker = true;
        flashLoanCircuitBreaker = true;
    }

    /// @notice Deactivates all circuit breakers, resuming deposit, withdraw, transfer, and rebalance operations.
    /// @dev This function allows the contract owner to resume critical operations after an emergency halt.
    /// Only the owner can call this function.
    function resumeAllCircuitBreakers() external onlyOwner {
        depositCircuitBreaker = false;
        withdrawCircuitBreaker = false;
        transferCircuitBreaker = false;
        rebalanceCircuitBreaker = false;
        flashLoanCircuitBreaker = false;
    }

    /// @notice Checks if the deposit circuit breaker is active.
    /// @return A boolean value indicating whether the deposit circuit breaker is active or not
    function isDepositCircuitBreaker() external view returns (bool) {
        return depositCircuitBreaker;
    }

    /// @notice Checks if the withdraw circuit breaker is active.
    /// @return A boolean value indicating whether the withdraw circuit breaker is active or not.
    function isWithdrawCircuitBreaker() external view returns (bool) {
        return withdrawCircuitBreaker;
    }

    /// @notice Checks if the transfer circuit breaker is active.
    /// @return A boolean value indicating whether the transfer circuit breaker is active or not.
    function isTransferCircuitBreaker() external view returns (bool) {
        return transferCircuitBreaker;
    }

    /// @notice Checks if the rebalance circuit breaker is active.
    /// @return A boolean value indicating whether the rebalance circuit breaker is active or not.
    function isRebalanceCircuitBreaker() external view returns (bool) {
        return rebalanceCircuitBreaker;
    }

    /// @notice Checks if the flasloan circuit breaker is active.
    /// @return A boolean value indicating whether the rebalance circuit breaker is active or not.
    function isFlashloanCircuitBreaker() external view returns (bool) {
        return flashLoanCircuitBreaker;
    }
}
