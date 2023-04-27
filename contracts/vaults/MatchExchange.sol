// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "hardhat/console.sol";

contract OrderBook {
    struct Order {
        address trader;
        uint256 amount;
        bool isBuy;
        bool isMatched;
    }

    address public riskOnToken;
    address public riskOffToken;
    uint256[] private rebaseNonce;

    mapping(uint256 => mapping(bytes32 => Order)) private orders;
    bytes32[] private orderQueue;
    mapping(uint256 => mapping(bytes32 => bytes32)) public matchedOrders;

    event OrderSubmitted(address indexed trader, uint256 amount, bool isBuy, bytes32 orderId);
    event OrderMatched(bytes32 indexed buyOrderId, bytes32 indexed sellOrderId, uint256 amount);
    event MatchedOrderDeleted(bytes32 indexed orderId, bytes32 indexed partnerOrderId);

    // constructor (address tokenA, address tokenB) {
    //     require(tokenA != tokenB, "Tokens must be different");
    //     riskOnToken = tokenA;
    //     riskOffToken = tokenB;
    // }

   function submitOrder(uint256 amount) external {

        // this makes every rebase cycle unique
        require(rebaseNonce.length > 0, "No rebase cycles set yet");
        uint256 currentRebaseNonce = rebaseNonce[rebaseNonce.length - 1];

        bytes32 orderId = keccak256(abi.encodePacked(msg.sender, currentRebaseNonce));
        Order storage order;

        order = orders[currentRebaseNonce][orderId];

        // stop user from submitting same order twice
        require(amount != order.amount, "Order already exists");

        if (order.trader != address(0)) {
          // check if it's matched and if so, remove it from the matched orders add it back to the queue
          // update the amount information
          if (order.isMatched) {
            (bytes32 selectedOrderId, bytes32 partnerOrderId) =  deleteMatchedOrder(orderId, currentRebaseNonce);
            orderQueue.push(selectedOrderId);
            orderQueue.push(partnerOrderId);
          }
          order.amount = amount;
          emit OrderSubmitted(msg.sender, amount, order.isBuy, orderId);
          return;
        }

        order.trader = msg.sender;
        order.amount = amount;

        if (orderQueue.length == 0) {
            orderQueue.push(orderId);
            order.isBuy = false;
            emit OrderSubmitted(msg.sender, amount, true, orderId);
            return;
        }

        bool isMatched = false;
        // check if order can be filled by any items in the Queue (Buy Order)
        for (uint256 i = 0; i < orderQueue.length; i++) {
            bytes32 queuedOrderId = orderQueue[i];
            Order storage queuedOrder = orders[currentRebaseNonce][queuedOrderId];

            // TO-DO: Implement this to support partial matching
            // protect against user order matching itself - not sure this is an edge case yet
            if (queuedOrder.amount == order.amount && queuedOrder.trader != order.trader) {
                // Match the order
                queuedOrder.isMatched = true;
                order.isMatched = true;
                order.isBuy = true;

                matchedOrders[currentRebaseNonce][queuedOrderId] = orderId;
                matchedOrders[currentRebaseNonce][orderId] = queuedOrderId;

                emit OrderMatched(queuedOrderId, orderId, order.amount);

                // Remove the order from the queue
                getIndexAndPopItemFromQueue(queuedOrderId);

                isMatched = true;

                break;
            }
        }

        if (!isMatched) {
            orderQueue.push(orderId);
            order.isBuy = false;
        }

        emit OrderSubmitted(msg.sender, amount, true, orderId);
    }

    function getQueuedOrders() public view returns (bytes32[] memory) {
        return orderQueue;
    }

    function getIndexAndPopItemFromQueue(bytes32 orderId) private returns (uint256) {
        require(orderQueue.length > 0, "No orders in queue");

        uint256 index;
        uint256 maxValue = ~uint256(0);

        for (uint256 i = 0; i < orderQueue.length; i++) {
            if (orderQueue[i] == orderId) {
                index = i;
                break;
            } else {
                index = maxValue;
            }
        }

        require(index != maxValue, "Order not found in queue");

        orderQueue[index] = orderQueue[orderQueue.length - 1];
        orderQueue.pop();

        return index;
    }

    function deleteMatchedOrder(bytes32 orderId, uint256 orderRebaseNonce)
      private returns (bytes32 selectedOrderId, bytes32 partnerOrderId) {
        bytes32 partner = matchedOrders[orderRebaseNonce][orderId];
        delete matchedOrders[orderRebaseNonce][orderId];
        delete matchedOrders[orderRebaseNonce][partner];
        emit MatchedOrderDeleted(orderId, partner);
        return (orderId, partner);
    }

    function setRebaseNonce(uint256 nonce) external {
        rebaseNonce.push(nonce);
    }
}
