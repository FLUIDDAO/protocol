// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router02} from  "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from  "./interfaces/IUniswapV2Factory.sol";

/// @title Fluid DAO Royalties Receiver
/// @author @cartercarlson
/// @notice Fluid DAO contract to distribute the royalties earned
///     from secondary sales of the Fluid DAO NFT.
contract RoyaltyReceiver is Ownable {

    address public stakingPool;
    address public dao;
    address public weth;
    IERC20 public fluidToken;
    IUniswapV2Router02 public router = IUniswapV2Router02(
        0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506
    );

    constructor(
        IERC20 _fluidToken,
        address _dao,
        address _stakingPool
    ) {

        weth = router.WETH();

        fluidToken = _fluidToken;
        dao = _dao;
        stakingPool = _stakingPool;

        // pre-approve router spending weth
        IERC20(weth).approve(address(router), type(uint256).max);
    }

    /// @notice Claim royalties earned from FLUID NFT market sales
    /// @dev Swaps half the royalties to FLUID and sends to stakers
    function claimRoyalties() external {
        // divide rewards by two - distribute 
        uint256 balance = IERC20(fluidToken).balanceOf(address(this));
        uint256 functionCallReward = balance/100; // 1% reward to caller
        uint256 half = (balance - functionCallReward)/2;

        swapWethForTokens(half);
        fluidToken.transfer(dao, half);
        fluidToken.transfer(msg.sender, functionCallReward);
    }

    function swapWethForTokens(uint256 amount) private {
        address[] memory path = new address[](2);
        path[0] = address(fluidToken);
        path[1] = weth;

        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount,
            0,
            path,
            stakingPool,
            block.timestamp
        );
    }
}