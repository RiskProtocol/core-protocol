// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "./../interfaces/IERC20Update.sol";

// Link to Sanction List https://go.chainalysis.com/chainalysis-oracle-docs.html
interface SanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

error BaseContract__SanctionedAddress();

contract BaseContract is Initializable {
    address private sanctionsContract;
    IERC20Update private baseToken;
    uint8 private baseTokenDecimals;

    modifier onlyNotSanctioned(address addressToCheck) {
        SanctionsList sanctionsList = SanctionsList(sanctionsContract);
        bool isSanctionedAddress = sanctionsList.isSanctioned(addressToCheck);
        if (isSanctionedAddress) revert BaseContract__SanctionedAddress();
        _;
    }

    function __BaseContract_init(
        address sanctionsContract_,
        IERC20Update baseTokenAddress
    ) internal onlyInitializing {
        sanctionsContract = sanctionsContract_;
        baseToken = IERC20Update(baseTokenAddress);
        (bool success, uint8 assetDecimals) = _tryGetAssetDecimals(baseToken);
        baseTokenDecimals = success ? assetDecimals : 18;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Attempts to fetch the asset decimals. A return value of false indicates that the attempt failed in some way.
     */
    function _tryGetAssetDecimals(
        IERC20 asset_
    ) private view returns (bool, uint8) {
        (bool success, bytes memory encodedDecimals) = address(asset_)
            .staticcall(
                abi.encodeWithSelector(
                    IERC20MetadataUpgradeable.decimals.selector
                )
            );
        if (
            success &&
            encodedDecimals.length >= 32 &&
            abi.decode(encodedDecimals, (uint256)) <= type(uint8).max
        ) {
            uint256 returnedDecimals = abi.decode(encodedDecimals, (uint256));
            return (true, uint8(returnedDecimals));
        }
        return (false, 0);
    }

    /**
     * @dev Decimals are read from the underlying asset in the constructor and cached. If this fails (e.g., the asset
     * has not been created yet), the cached value is set to a default obtained by `super.decimals()` (which depends on
     * inheritance but is most likely 18). Override this function in order to set a guaranteed hardcoded value.
     * See {IERC20Metadata-decimals}.
     */
    function decimals() public view virtual returns (uint8) {
        return baseTokenDecimals;
    }

    function getBaseToken() public view returns (IERC20Update) {
        return baseToken;
    }
}
