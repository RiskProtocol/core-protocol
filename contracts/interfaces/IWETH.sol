// SPDX-License-Identifier: GPL-3.0
interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint value) external returns (bool);
    function withdraw(uint) external;
}
