// contracts/MyToken.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TestToken is Initializable, ERC20Upgradeable, UUPSUpgradeable {
    address private _admin;
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address deployer) public initializer {
        __ERC20_init("TestToken", "TEST");
        __UUPSUpgradeable_init();
        _mint(deployer, 1000 * 10 ** 18);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyAdmin {}

    modifier onlyAdmin() {
        require(msg.sender == _admin, "MyToken: caller is not the admin");
        _;
    }
}
