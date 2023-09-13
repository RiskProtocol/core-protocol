// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Link to Sanction List https://go.chainalysis.com/chainalysis-oracle-docs.html
interface SanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

error BaseContract__SanctionedAddress();
error BaseContract__DepositCircuitBreaker();
error BaseContract__WithdrawCircuitBreaker();
error BaseContract__TransferCircuitBreaker();
error BaseContract__RebaseCircuitBreaker();


contract BaseContract is Initializable, OwnableUpgradeable {
    address private sanctionsContract;

    bool private depositCircuitBreaker;
    bool private withdrawCircuitBreaker;
    bool private transferCircuitBreaker;
    bool private rebaseCircuitBreaker;

    modifier onlyNotSanctioned(address addressToCheck) {
        SanctionsList sanctionsList = SanctionsList(sanctionsContract);
        bool isSanctionedAddress = sanctionsList.isSanctioned(addressToCheck);
        if (isSanctionedAddress) revert BaseContract__SanctionedAddress();
        _;
    }


    // circuit breaker modifiers
    modifier stopDeposit() {
        if (depositCircuitBreaker) revert BaseContract__DepositCircuitBreaker();
        _;
    }

    modifier stopWithdraw() {
        if (withdrawCircuitBreaker) revert BaseContract__WithdrawCircuitBreaker();
        _;
    }

    modifier stopTransfer() {
        if (transferCircuitBreaker) revert BaseContract__TransferCircuitBreaker();
        _;
    }

    modifier stopRebase() {
        if (rebaseCircuitBreaker) revert BaseContract__RebaseCircuitBreaker();
        _;
    }

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
    function toggleDepositCircuitBreaker() external onlyOwner {
        depositCircuitBreaker = !depositCircuitBreaker;
    }

    function toggleWithdrawCircuitBreaker() external onlyOwner {
        withdrawCircuitBreaker = !withdrawCircuitBreaker;
    }

    function toggleTransferCircuitBreaker() external onlyOwner {
        transferCircuitBreaker = !transferCircuitBreaker;
    }

    function toggleRebaseCircuitBreaker() external onlyOwner {
        rebaseCircuitBreaker = !rebaseCircuitBreaker;
    }

    function stopAllCircuitBreakers() external onlyOwner {
        depositCircuitBreaker = true;
        withdrawCircuitBreaker = true;
        transferCircuitBreaker = true;
        rebaseCircuitBreaker = true;
    }

    function resumeAllCircuitBreakers() external onlyOwner {
        depositCircuitBreaker = false;
        withdrawCircuitBreaker = false;
        transferCircuitBreaker = false;
        rebaseCircuitBreaker = false;
    }

    function isDepositCircuitBreaker() external view returns (bool) {
        return depositCircuitBreaker;
    }

    function isWithdrawCircuitBreaker() external view returns (bool) {
        return withdrawCircuitBreaker;
    }

    function isTransferCircuitBreaker() external view returns (bool) {
        return transferCircuitBreaker;
    }

    function isRebaseCircuitBreaker() external view returns (bool) {
        return rebaseCircuitBreaker;
    }
}
