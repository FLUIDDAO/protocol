// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Fluid DAO Royalties Receiver
/// @author @cartercarlson
/// @notice Fluid DAO contract to distribute the royalties earned
///     from secondary sales of the Fluid DAO NFT.
contract RoyaltyReceiver is Ownable {
    address public stakingPool;
    address public dao;

    constructor(address _dao, address _stakingPool) {
        dao = _dao;
        stakingPool = _stakingPool;
    }

    function claimRoyalties(address token) external {
        // divide rewards by two - distribute 
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 functionCallReward = balance/100; // 1% reward to caller
        uint256 half = (balance - functionCallReward)/2;
        IERC20(token).transfer(stakingPool, half);
        IERC20(token).transfer(dao, half);
        IERC20(token).transfer(msg.sender, functionCallReward);
    }
}