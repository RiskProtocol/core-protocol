// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract RateLimitUtility is Initializable, OwnableUpgradeable {
    function __RateLimitUtility_init(
        uint256 withdrawLimit_,
        uint256 depositLimit_,
        uint256 limitPeriod_
    ) internal onlyInitializing {
        withdrawLimit = withdrawLimit_;
        depositLimit = depositLimit_;
        period = limitPeriod_;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    uint256 private period; //should this really be 256?
    uint256 private withdrawLimit;
    uint256 private depositLimit;
    bool private hasWithdrawLimit;
    bool private hasDepositLimit;
    mapping(address => uint256) private currentWithdrawPeriodEnd;
    mapping(address => uint256) private currentWithdrawPeriodAmount;
    mapping(address => uint256) private currentDepositPeriodEnd;
    mapping(address => uint256) private currentDepositPeriodAmount;
    event WithdrawLimitToggled(bool enabled);
    event DepositLimitToggled(bool enabled);
    modifier withdrawLimitMod(uint256 amount) {
        if (hasWithdrawLimit) {
            updatePeriod(
                _msgSender(),
                currentWithdrawPeriodEnd,
                currentWithdrawPeriodAmount
            );
            uint totalAmount = currentWithdrawPeriodAmount[_msgSender()] +
                amount;

            // Disallow withdraws that exceed current rate limit for the user
            require(
                currentWithdrawPeriodAmount[_msgSender()] + amount <=
                    withdrawLimit,
                "Exceeds period limit"
            );
            currentWithdrawPeriodAmount[_msgSender()] += amount;
        }
        _;
    }

    modifier depositLimitMod(uint256 amount) {
        if (hasDepositLimit) {
            updatePeriod(
                _msgSender(),
                currentDepositPeriodEnd,
                currentDepositPeriodAmount
            );
            uint totalAmount = currentDepositPeriodAmount[_msgSender()] +
                amount;

            // Disallow withdraws that exceed current rate limit for the user
            require(
                currentDepositPeriodAmount[_msgSender()] + amount <=
                    depositLimit,
                "Exceeds period limit"
            );
            currentDepositPeriodAmount[_msgSender()] += amount;
        }
        _;
    }

    function updatePeriod(
        address user,
        mapping(address => uint256) storage currentPeriodEnd,
        mapping(address => uint256) storage currentPeriodAmount
    ) internal {
        if (currentPeriodEnd[user] < block.number) {
            currentPeriodEnd[user] = block.number + period;
            currentPeriodAmount[user] = 0;
        }
    }

    function updateWithdrawLimit(uint newLimit) external onlyOwner {
        require(newLimit > 0, "Deposit limit must be positive");
        withdrawLimit = newLimit;
    }

    function updateDepositLimit(uint newLimit) external onlyOwner {
        require(newLimit > 0, "Deposit limit must be positive");
        depositLimit = newLimit;
    }

    function updateLimitPeriod(uint newPeriod) external onlyOwner {
        require(newPeriod > 0, "Period must be positive");
        period = newPeriod;
    }

    function toggleWithdrawLimit() external onlyOwner {
        hasWithdrawLimit = !hasWithdrawLimit;
        emit WithdrawLimitToggled(hasWithdrawLimit);
    }

    function toggleDepositLimit() external onlyOwner {
        hasDepositLimit = !hasDepositLimit;
        emit DepositLimitToggled(hasDepositLimit);
    }
}
