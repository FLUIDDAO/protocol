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
    address public fluidToken;
    IUniswapV2Router02 public router = IUniswapV2Router02(
        0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506
    );

    constructor(
        address _fluidToken,
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
        uint256 balance = IERC20(weth).balanceOf(address(this));
        uint256 functionCallReward = balance/100; // 1% reward to caller
        uint256 half = (balance - functionCallReward)/2;

        swapWethForTokens(half);
        IERC20(weth).transfer(dao, half);
        IERC20(weth).transfer(msg.sender, functionCallReward);
    }

    function swapWethForTokens(uint256 amount) private {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = fluidToken;

        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount,
            0,
            path,
            stakingPool,
            block.timestamp
        );
    }

    function recoverERC20(
        address token,
        uint256 amount,
        address recipient
        ) external onlyOwner {
        require(token != weth, "Cannot withdraw royalty token");
        IERC20(token).transfer(recipient, amount);
        emit Recovered(token, amount);
    }
}