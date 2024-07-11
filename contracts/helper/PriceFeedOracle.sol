// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract PriceFeedOracle is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    struct Price {
        uint256 smartTokenXPrice;
        uint256 smartTokenYPrice;
        uint256 timestamp;
    }

    Price[] private prices;
    address private smartTokenX;
    address private smartTokenY;
    uint256 private constant PRICE_SCALE = 1e18;

    // event PriceUpdated(address token, uint256 price);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _admin,
        address smartTokenX_,
        address smartTokenY_
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        transferOwnership(_admin);
        smartTokenX = smartTokenX_;
        smartTokenY = smartTokenY_;
    }

    /// @notice Updates the USD price of a token
    /// @param smartXPrice The price of the token in USD, scaled by 1e18
    /// @param smartYPrice The price of the token in USD, scaled by 1e18
    /// @param timestamp The timestamp of the price
    function updatePrice(
        uint256 smartXPrice,
        uint256 smartYPrice,
        uint256 timestamp
    ) external onlyOwner {
        prices.push(Price(smartXPrice, smartYPrice, timestamp));
    }

    /// @notice Retrieves the price of a token in USD
    /// @param token The address of the token
    /// @return price The USD price of the token, scaled by 1e18
    // function getPrice(address token) external view returns (uint256) {
    //     // require(prices[token] != 0, "Price is not available");
    //     // return prices[token];
    //     return prices[prices.length - 1].smartTokenXPrice;
    // }

    /// @notice Calculates the conversion rate from one token to another
    /// @param from The token being converted from
    /// @param to The token being converted to
    /// @return rate The conversion rate, scaled by 1e18
    function getConversionRate(
        address from,
        address to
    ) external view returns (uint256, uint256) {
        require(from == smartTokenX || from == smartTokenY, "Invalid token");
        require(to == smartTokenX || to == smartTokenY, "Invalid token");
        // require(
        //     prices[from] != 0 && prices[to] != 0,
        //     "Prices not set for one of the tokens"
        // );
        // uint256 fromPrice = prices[from];
        // uint256 toPrice = prices[to];
        // return (fromPrice * 1e18) / toPrice;
        if (from == smartTokenX) {
            return (
                ((prices[prices.length - 1].smartTokenXPrice * PRICE_SCALE) /
                    prices[prices.length - 1].smartTokenYPrice),
                prices[prices.length - 1].timestamp
            );
        } else {
            return (
                ((prices[prices.length - 1].smartTokenYPrice * PRICE_SCALE) /
                    prices[prices.length - 1].smartTokenXPrice),
                prices[prices.length - 1].timestamp
            );
        }
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override {}

    function getConstant() external pure returns(uint256){
        return PRICE_SCALE;
    }
}
