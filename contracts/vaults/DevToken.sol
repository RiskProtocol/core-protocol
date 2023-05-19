// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

import "./TokenFactory.sol";
import "../external/ERC20Permit.sol";
import "./BaseContract.sol";

error DevToken__NotTokenFactory();
error DevToken__MethodNotAllowed();

contract DevToken is ERC20Permit, BaseContract {
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
        address[] memory defaultOperators,
        address sanctionsContract_
    )
        ERC777(tokenName, tokenSymbol, defaultOperators)
        ERC20Permit(tokenName)
        BaseContract(sanctionsContract_)
    {
        tokenFactory = TokenFactory(factoryAddress);
    }

    function mint(address receiver, uint256 amount) public onlyTokenFactory {
        _mint(receiver, amount, "", "");
    }

    /** @dev See {IERC777-burn}. */
    function burn(
        uint256 /* amount */,
        bytes memory /* data */
    ) public pure override(ERC777) {
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

    function devBurn(address account, uint256 amount) public onlyTokenFactory {
        _burn(account, amount, "", "");
    }

    /** @dev See {IERC777-transfer}. */
    function transfer(
        address to,
        uint256 amount
    )
        public
        override
        onlyNotSanctioned(to)
        onlyNotSanctioned(msg.sender)
        returns (bool)
    {
        address caller = msg.sender;
        if (hasPendingRebase(caller)) {
            tokenFactory.applyRebase(caller);
        }
        tokenFactory.updateUserLastRebaseCount(to);
        if (hasPendingRebase(to)) {
            tokenFactory.applyRebase(to);
        }
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
    )
        public
        override
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(msg.sender)
    {
        handlePendingRebase(msg.sender, recipient);
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

    function getTokenFactory() public view returns (address) {
        return address(tokenFactory);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        override
        onlyNotSanctioned(recipient)
        onlyNotSanctioned(sender)
        returns (bool)
    {
        handlePendingRebase(sender, recipient);
        return super.transferFrom(sender, recipient, amount);
    }

    function handlePendingRebase(address sender, address receiver) public {
        if (hasPendingRebase(sender)) {
            tokenFactory.applyRebase(sender);
        }
        tokenFactory.updateUserLastRebaseCount(receiver);
        if (hasPendingRebase(receiver)) {
            tokenFactory.applyRebase(receiver);
        }
    }
}
