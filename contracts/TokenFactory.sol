// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./DevToken.sol";
import "./library/PriceFeed.sol";
import "hardhat/console.sol";

error TokenFactory__InsufficientFund();

/**
 * @title ERC-20 Rebase Tokens
 * @author Okwuosa Chijioke
 * @notice Still under development
 * @dev This implements 2 ERC-20 tokens that will be minted in exactly the same proportion as the
 * underlying ERC-20 token transferred into the Factory contract.
 * The asset will be burned in exactly the same proportion when asked to redeem/withdrawal the underlying asset.
 * The contract will implement periodic rebalancing
 */
contract TokenFactory is ReentrancyGuard{
    using PriceFeed for AggregatorV3Interface;
    using Math for uint256;

    // State variables
    DevToken[] private s_devTokenArray;
    address private immutable i_baseTokenAddress;
    address[] private s_funders;
    AggregatorV3Interface private immutable i_priceFeed;
    mapping (address => bool) inserted;

    // Events
    event AssetBought(address indexed recipient, uint256 amount);
    event AssetWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address baseTokenAddress,
        address priceFeedAddress,
        string memory token1Name,
        string memory token1Symbol,
        string memory token2Name,
        string memory token2Symbol
    ) {
        i_baseTokenAddress = baseTokenAddress;
        i_priceFeed = AggregatorV3Interface(priceFeedAddress);

        DevToken devToken1 = new DevToken(token1Name, token1Symbol);
        s_devTokenArray.push(devToken1);

        DevToken devToken2 = new DevToken(token2Name, token2Symbol);
        s_devTokenArray.push(devToken2);
    }

    function sendToken(
        uint256 _devTokenIndex,
        address _receiver,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].issueToken(_receiver, _amount);
    }

    function getBalance(
        uint256 _devTokenIndex,
        address _owner
    ) public view returns (uint256) {
        return s_devTokenArray[_devTokenIndex].tokenBalance(_owner);
    }

    function burnToken(
        uint256 _devTokenIndex,
        address _owner,
        uint256 _amount
    ) private {
        s_devTokenArray[_devTokenIndex].burnToken(_owner, _amount);
    }

    function buyAsset() public payable nonReentrant {
        sendToken(0, msg.sender, msg.value);
        sendToken(1, msg.sender, msg.value);
        if(!inserted[msg.sender]){
            inserted[msg.sender] = true;
            s_funders.push(msg.sender);
        }  
        emit AssetBought(msg.sender, msg.value);
    }

    function withdrawAsset(uint256 _amount) public nonReentrant{
        if (_amount > getBalance(0, msg.sender))
            revert TokenFactory__InsufficientFund();
        burnToken(0, msg.sender, _amount);
        burnToken(1, msg.sender, _amount);
        payable(msg.sender).transfer(_amount);
        emit AssetWithdrawn(msg.sender, _amount);
    }

    function rebase() public  {        
        address[] memory funders = s_funders; 
        uint256 rebasePrice = i_priceFeed.getPrice()/1e18;       
        uint256 asset1Price = rebasePrice.ceilDiv(3); // this should be gotten from the oracle
        uint256 asset2Price = rebasePrice - asset1Price;    
        uint256 asset1Balance;
        uint256 asset2Balance;
        uint256 accountValue;
        uint256 rollOverValueInUSD;
        uint256 rollOverDivisor; 
        uint256 length = funders.length;    
        uint256 rollOverValue;   
        uint256 asset1ValueEth;
        uint256 asset2ValueEth;
       
        for (
            uint256 funderIndex = 0;
            funderIndex < length; 
            funderIndex++                     
        ) {  
            address funder = funders[funderIndex];
            asset1Balance = getBalance(0, funder) / 1e18;
            asset2Balance = getBalance(1, funder) / 1e18;            
            accountValue =
                (asset1Balance * asset1Price) +
                (asset2Balance * asset2Price);
            rollOverValueInUSD = accountValue / 2;
            rollOverDivisor = rebasePrice/2; 
            rollOverValue = (rollOverValueInUSD *1e18/rollOverDivisor* 1e18)/1e18;
            asset1ValueEth = asset1Balance*1e18;
            asset2ValueEth = asset2Balance*1e18;        

            if(rollOverValue > asset1ValueEth){
                sendToken(0, funder, (rollOverValue - asset1ValueEth));
            }else{
                burnToken(0, funder, (asset1ValueEth - rollOverValue));
            }
            
            if(rollOverValue > asset2ValueEth){
                sendToken(1, funder, (rollOverValue - asset2ValueEth));
            }else{
                burnToken(1, funder, (asset2ValueEth - rollOverValue));
            }

        }
    }
    
    function getBaseTokenAddress() public view returns (address) {
        return i_baseTokenAddress;
    }

    function getFunderAddressByIndex(uint index) public view returns (address) {
        return s_funders[index];
    }
}
