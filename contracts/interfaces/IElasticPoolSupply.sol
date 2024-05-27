// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.9;

interface IElasticPoolSupply {
    //used to execute resync weights in balancer
    function resyncWeight() external;
}
