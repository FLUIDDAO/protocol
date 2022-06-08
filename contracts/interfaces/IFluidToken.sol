// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFluidToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function pair() external returns (address);
}
