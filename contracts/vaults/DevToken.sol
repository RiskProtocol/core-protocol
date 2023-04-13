// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "./TokenFactory.sol";
import "../external/ERC20Permit.sol";

error DevToken__NotTokenFactory();
error DevToken__MethodNotAllowed();

contract DevToken is ERC777, ERC20Permit {
    TokenFactory private immutable tokenFactory;

    modifier onlyTokenFactory() {
        if (msg.sender != address(tokenFactory))
            revert DevToken__NotTokenFactory();
        _;
    }

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address factoryAddress,
        address[] memory defaultOperators
    ) ERC777(tokenName, tokenSymbol, defaultOperators) ERC20Permit(tokenName) {
        tokenFactory = TokenFactory(factoryAddress);
    }

    function mint(address receiver, uint256 amount) public onlyTokenFactory {
        _mint(receiver, amount, "", "");
    }

    /** @dev See {IERC777-burn}. */
    function burn(
        uint256 /* amount */,
        bytes memory /* data */
    ) public pure override {
        revert DevToken__MethodNotAllowed();
    }

    /** @dev See {IERC777-operatorBurn}. */
    function operatorBurn(
        address /* account */,
        uint256 /* amount */,
        bytes memory /* data */,
        bytes memory /* operatorData */
    ) public pure override {
        revert DevToken__MethodNotAllowed();
    }

    function burn(address account, uint256 amount) public onlyTokenFactory {
        _burn(account, amount, "", "");
    }

    /** @dev See {IERC777-transfer}. */
    function transfer(
        address to,
        uint256 amount
    ) public override returns (bool) {
        address owner_ = msg.sender;
        if (hasPendingRebase(owner_)) {
            tokenFactory.applyRebase(owner_);
        }
        tokenFactory.updateUserLastRebaseCount(to);
        super.transfer(to, amount);
        return true;
    }

    /**
     * @dev See {IERC777-send}.
     *
     * Also emits a {IERC20-Transfer} event for ERC20 compatibility.
     */
    function send(
        address recipient,
        uint256 amount,
        bytes memory data
    ) public override {
        address owner_ = msg.sender;
        if (hasPendingRebase(owner_)) {
            tokenFactory.applyRebase(owner_);
        }
        tokenFactory.updateUserLastRebaseCount(recipient);
        super.send(recipient, amount, data);
    }

    /** @dev See {IERC777-balanceOf}. */
    function balanceOf(address account) public view override returns (uint256) {
        if (hasPendingRebase(account)) {
            return tokenFactory.calculateRollOverValue(account);
        } else {
            return unScaledbalanceOf(account);
        }
    }

    function unScaledbalanceOf(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    function hasPendingRebase(address account) public view returns (bool) {
        return
            tokenFactory.getUserLastRebaseCount(account) !=
            tokenFactory.getScallingFactorLength();
    }
}
