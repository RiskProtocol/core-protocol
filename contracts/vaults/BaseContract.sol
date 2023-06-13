// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Link to Sanction List https://go.chainalysis.com/chainalysis-oracle-docs.html
interface SanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

error BaseContract__SanctionedAddress();

contract BaseContract is Initializable {
    address private sanctionsContract;

    modifier onlyNotSanctioned(address addressToCheck) {
        SanctionsList sanctionsList = SanctionsList(sanctionsContract);
        bool isSanctionedAddress = sanctionsList.isSanctioned(addressToCheck);
        if (isSanctionedAddress) revert BaseContract__SanctionedAddress();
        _;
    }

    function __BaseContract_init(
        address sanctionsContract_
    ) public initializer {
        sanctionsContract = sanctionsContract_;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
}
