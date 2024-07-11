// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "contracts/vaults/wrapped/WrappedSmartToken.sol";
import "contracts/interfaces/IWrappedSmartToken.sol";

contract WrapperFactory is UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address private template;
    address[2] private wrappedSmartTokens;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _template, address owner_) public initializer {
        template = address(new wrappedSmartToken());
        __Ownable_init();
        transferOwnership(owner_);
        __UUPSUpgradeable_init();
    }

    /// @dev Create and initialize an instance of the Wrapped Risk Token

    function create(
        address underlying,
        address sellingToken_, //alternate SMARTTOKEN
        string memory name,
        string memory symbol,
        uint256 initialRate,
        bool isWrappedX,
        address owner_,
        address oracle_
    ) external onlyOwner returns (address) {
        return
            _create(
                underlying,
                sellingToken_,
                name,
                symbol,
                initialRate,
                isWrappedX,
                owner_,
                oracle_
            );
    }

    /// @dev Create and initialize an instance of the unbutton token
    function _create(
        address underlying,
        address sellingToken_, //alternate SMARTTOKEN
        string memory name,
        string memory symbol,
        uint256 initialRate,
        bool isWrappedX,
        address owner_,
        address oracle_
    ) private returns (address) {
        // Create instance
        // address wrappedSmartToken_ = ClonesUpgradeable.clone(template);


        ERC1967Proxy proxy = new ERC1967Proxy(template, "");
                // Approve transfer of initial deposit to instance
        uint256 inititalDeposit = IWrappedSmartToken(address(proxy))
            .INITIAL_DEPOSIT();
        IERC20Upgradeable(underlying).safeTransferFrom(
            msg.sender,
            address(this),
            inititalDeposit
        );
        IERC20Upgradeable(underlying).approve(
            address(proxy),
            inititalDeposit
        );
        // Initialize instance
        IWrappedSmartToken(address(proxy)).riskInitialize(
            underlying,
            sellingToken_,
            name,
            symbol,
            initialRate,
            isWrappedX,
            owner_,
            oracle_
        );

        // Register instance
        if (isWrappedX) {
            wrappedSmartTokens[0] = address(proxy);
        } else {
            wrappedSmartTokens[1] = address(proxy);
        }
        // Return instance
        return address(proxy);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}

    function getWrappedSmartTokens(
        bool isWrappedX
    ) external view returns (address) {
        if (isWrappedX) {
            return wrappedSmartTokens[0];
        } else {
            return wrappedSmartTokens[1];
        }
    }
}
