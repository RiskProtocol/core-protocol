// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.9;

import "../interfaces/flashloan/IFlashLoanReceiverAlt.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

contract MockFlashLoanReceiver_UnwantedTokens is IFlashLoanReceiverAlt {
    using SafeMathUpgradeable for uint256;
    using SafeERC20 for IERC20;
    uint256 _amountToApprove;
    bool isApproved;
    bool mockReturn;
    address public immutable LENDING_POOL;

    event ExecutedWithSuccess(
        address[] _assets,
        uint256[] _amounts,
        uint256[] _premiums
    );

    constructor(address _LENDING_POOL) {
        LENDING_POOL = _LENDING_POOL;
        mockReturn = true;
    }

    function isApprovedMeth(bool _appr) public {
        isApproved = _appr;
    }

    function updateMockReturn(bool return_) public {
        mockReturn = return_;
    }

 

    function executeOperation(
        uint256 loanAmount,
        address repayToken,
        uint256 repayAmount,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
            //@note we expect user to do some magic and get the REPAY tokens back

            if (isApproved) {
                IERC20(repayToken).approve(
                    address(LENDING_POOL),
                    loanAmount.add(repayAmount)
                );
            }
        

        // emit ExecutedWithSuccess(assets, amounts, premiums);

        return mockReturn;
    }
}
