// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFLUIDtoken is IERC20 {
    function mint(address to, uint256 amount) external;
    function noFeeOnTransfer(address _address) external returns (bool);
}
