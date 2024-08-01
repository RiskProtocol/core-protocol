// // SPDX-License-Identifier: GPL-3.0

// pragma solidity ^0.8.9;

// import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
// import "contracts/vaults/wrapped/WrappedSmartToken.sol";
// import "contracts/interfaces/IWrappedSmartToken.sol";
// import "contracts/interfaces/IDeployFactory.sol";

// contract WrapperFactory13 is UUPSUpgradeable, OwnableUpgradeable {
//     using SafeERC20Upgradeable for IERC20Upgradeable;

//     address private template;
//     address[2] private wrappedSmartTokens;

//     /// @custom:oz-upgrades-unsafe-allow constructor
//     constructor() {
//         _disableInitializers();
//     }

//     function initialize(address owner_) public initializer {
//         template = address(new wrappedSmartToken());
//         __Ownable_init();
//         transferOwnership(owner_);
//         __UUPSUpgradeable_init();
//     }

//     /// @dev Create and initialize an instance of the Wrapped Risk Token

//     function create(
//         address underlying,
//         address sellingToken_, //alternate SMARTTOKEN
//         string memory name,
//         string memory symbol,
//         uint256 initialRate,
//         bool isWrappedX,
//         address owner_,
//         address signer_,
//         uint256 timeout_,
//         address sanctionsContract_,
//         address create3Factory_,
//         bytes32 salt
//     ) external onlyOwner returns (address) {
//         return
//             _create(
//                 underlying,
//                 sellingToken_,
//                 name,
//                 symbol,
//                 initialRate,
//                 isWrappedX,
//                 owner_,
//                 signer_,
//                 timeout_,
//                 sanctionsContract_,
//                 create3Factory_,
//                 salt
//             );
//     }

//     /// @dev Create and initialize an instance of the unbutton token
//     function _create(
//         address underlying,
//         address sellingToken_, //alternate SMARTTOKEN
//         string memory name,
//         string memory symbol,
//         uint256 initialRate,
//         bool isWrappedX,
//         address owner_,
//         address signer_,
//         uint256 timeout_,
//         address sanctionsContract_,
//         address create3Factory_,
//         bytes32 salt
//     ) private returns (address) {
//         address proxy;
//         if (address(create3Factory_) == address(0)) {
//             // Create instance
//             proxy = address(new ERC1967Proxy(template, ""));
//         } else {
//             ITRPCREATE3Factory deployFactory = ITRPCREATE3Factory(
//                 create3Factory_
//             );

//             // Deploy instance using create3
//             bytes memory bytecode = type(ERC1967Proxy).creationCode;
//             // Encode constructor arguments according to ABI
//             bytes memory constructorArgs = abi.encode(address(template), "");
//             bytes memory deployCode = abi.encodePacked(
//                 bytecode,
//                 constructorArgs
//             );

//             proxy = deployFactory.deploy(salt, deployCode);
//         }
//         // Approve transfer of initial deposit to instance
//         uint256 inititalDeposit = IWrappedSmartToken(proxy).INITIAL_DEPOSIT();
//         IERC20Upgradeable(underlying).safeTransferFrom(
//             msg.sender,
//             address(this),
//             inititalDeposit
//         );
//         IERC20Upgradeable(underlying).approve(proxy, inititalDeposit);
//         // Initialize instance
//         IWrappedSmartToken(proxy).riskInitialize(
//             underlying,
//             sellingToken_,
//             name,
//             symbol,
//             initialRate,
//             isWrappedX,
//             owner_,
//             signer_,
//             timeout_,
//             sanctionsContract_
//         );

//         // Register instance
//         if (isWrappedX) {
//             wrappedSmartTokens[0] = proxy;
//         } else {
//             wrappedSmartTokens[1] = proxy;
//         }
//         // Return instance
//         return proxy;
//     }

//     function _authorizeUpgrade(
//         address newImplementation
//     ) internal virtual override onlyOwner {}

//     function getWrappedSmartTokens(
//         bool isWrappedX
//     ) external view returns (address) {
//         if (isWrappedX) {
//             return wrappedSmartTokens[0];
//         } else {
//             return wrappedSmartTokens[1];
//         }
//     }

//     function getTemplate() external view returns (address) {
//         return template;
//     }
// }
