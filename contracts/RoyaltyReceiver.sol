// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router02} from  "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from  "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";

/// @title Fluid DAO Royalties Receiver
/// @author @cartercarlson
/// @notice Fluid DAO contract to distribute the royalties earned
///     from secondary sales of the Fluid DAO NFT.
contract RoyaltyReceiver is Ownable {

    event ClaimRoyalties(
        uint256 amountFluidToStaking,
        uint256 amountWethToDao,
        uint256 amountWethToCaller
    );
    event SetSlippageAllowance(uint256 _slippageAllowance);

    uint256 public slippageAllowance;
    uint256 public constant SLIPPAGE_MAX = 10000;
    address public stakingRewards;
    address public dao;
    address public weth;
    address public fluidToken;
    // https://dev.sushi.com/docs/Developers/Deployment%20Addresses
    IUniswapV2Router02 public router = IUniswapV2Router02(
        0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    );
    IUniswapV2Pair public sushiPair;

    constructor(
        address _fluidToken,
        address _dao,
        address _stakingRewards,
        IUniswapV2Pair _sushiPair
    ) {

        weth = router.WETH();

        fluidToken = _fluidToken;
        dao = _dao;
        stakingRewards = _stakingRewards;
        sushiPair = _sushiPair;
        slippageAllowance = 500;
    }

    /// @notice Claim royalties earned from FLUID NFT market sales
    /// @dev Swaps half the royalties to FLUID and sends to stakers
    function claimRoyalties() external {
        // divide rewards by two - distribute 
        uint256 balance = IERC20(weth).balanceOf(address(this));
        uint256 functionCallReward = balance/100; // 1% reward to caller
        uint256 half = (balance - functionCallReward)/2;

        IERC20(weth).transfer(dao, half);
        IERC20(weth).transfer(msg.sender, functionCallReward);
        uint256 fluidReturned = swapWethForTokens(half);
        emit ClaimRoyalties(fluidReturned, half, functionCallReward);
    }

    function swapWethForTokens(uint256 amount) private returns (uint256 fluidReturned) {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = fluidToken;

        IERC20(weth).approve(address(router), amount);

        (uint256 reserveFluid, uint256 reserveWeth, ) = sushiPair.getReserves();
        uint256 spotPrice = router.quote(amount, reserveWeth, reserveFluid);
        uint256 minToReturn = spotPrice * (SLIPPAGE_MAX - slippageAllowance) / SLIPPAGE_MAX;

        (, fluidReturned) = router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount,
            minToReturn,
            path,
            stakingRewards,
            block.timestamp
        );
    }

    function setSlippageAllowance(uint256 _slippageAllowance) external onlyOwner {
        require(_slippageAllowance != slippageAllowance, "_slippageAllowance == slippageAllowance");
        require(_slippageAllowance <= SLIPPAGE_MAX, "Cannot set slippage above 100%");
        slippageAllowance = _slippageAllowance;
        emit SetSlippageAllowance(_slippageAllowance);
    }

    function recoverERC20(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        require(token != weth, "Cannot withdraw royalty token");
        IERC20(token).transfer(recipient, amount);
    }
}