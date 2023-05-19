// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

// Link to Sanction List https://go.chainalysis.com/chainalysis-oracle-docs.html
interface SanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

error BaseContract__SanctionedAddress();

contract BaseContract {
    address private immutable sanctionsContract;

    modifier onlyNotSanctioned(address addressToCheck) {
        SanctionsList sanctionsList = SanctionsList(sanctionsContract);
        bool isSanctionedAddress = sanctionsList.isSanctioned(addressToCheck);
        if (isSanctionedAddress) revert BaseContract__SanctionedAddress();
        _;
    }

    constructor(address sanctionsContract_) {
        sanctionsContract = sanctionsContract_;
    }
}
