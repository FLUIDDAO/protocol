// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20VotesComp} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IFluidToken} from "./interfaces/IFluidToken.sol";
import {IUniswapV2Router02} from  "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from  "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";

contract FluidToken is
    IFluidToken,
    ERC20Permit,
    ERC20Votes,
    ERC20VotesComp,
    Ownable,
    ReentrancyGuard
{
    bool public swapAndLiquifyEnabled = true;
    uint256 public slippageAllowance;
    uint256 public constant SLIPPAGE_MAX = 10000;
    address public stakingRewards;
    address public auctionHouse;
    address public dao;
    IUniswapV2Pair public sushiPair;
    // https://dev.sushi.com/docs/Developers/Deployment%20Addresses
    IUniswapV2Router02 public router = IUniswapV2Router02(
        0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
    );

    mapping(address => bool) public noFeeOnTransfer;

    event SetNoFeeOnTransfer(address whitelistAccount, bool value);
    event SetSwapAndLiquifyEnabled(bool enabled);
    event SetStakingRewards(address _stakingRewards);
    event SetAuctionHouse(address _auctionHouse);
    event SetSlippageAllowance(uint256 _slippageAllowance);
    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiquidity
    );

    constructor(
        address _dao,
        uint256 initialSupply
    ) ERC20("Fluid DAO", "FLD") ERC20Permit("Fluid DAO")
    {
        // approve router spending
        IERC20(router.WETH()).approve(address(router), type(uint256).max);

        // Create a uniswap pair for this new token
        address pair = IUniswapV2Factory(router.factory())
            .createPair(address(this), router.WETH());
        sushiPair = IUniswapV2Pair(pair);

        // set the rest of the contract variables
        dao = _dao;
        slippageAllowance = 500;
        noFeeOnTransfer[_dao] = true;

        _mint(_dao, initialSupply);
    }

    function mint(address _to, uint256 amount) external override {
        require(msg.sender == auctionHouse, "!auctionHouse");
        _mint(_to, amount);
    }

    function setNoFeeOnTransfer(address _address, bool _status)
        external
        onlyOwner
    {
        require(_address != address(0), "setNoFeeOnTransfer: Zero address");
        noFeeOnTransfer[_address] = _status;
        emit SetNoFeeOnTransfer(_address, _status);
    }

    function setSwapAndLiquifyEnabled(bool _enabled) external onlyOwner {
        swapAndLiquifyEnabled = _enabled;
        emit SetSwapAndLiquifyEnabled(_enabled);
    }

    function setAuctionHouse(address _auctionHouse) external onlyOwner {
        auctionHouse = _auctionHouse;
        emit SetAuctionHouse(_auctionHouse);
    }

    function setStakingRewards(address _stakingRewards) external onlyOwner {
        stakingRewards = _stakingRewards;
        emit SetStakingRewards(_stakingRewards);
    }

    function setSlippageAllowance(uint256 _slippageAllowance) external onlyOwner {
        require(_slippageAllowance != slippageAllowance, "_slippageAllowance == slippageAllowance");
        require(_slippageAllowance <= SLIPPAGE_MAX, "Cannot set slippage above 100%");
        slippageAllowance = _slippageAllowance;
        emit SetSlippageAllowance(_slippageAllowance);
    }

    /// @notice Rewardable function to distrubute fees
    /// @dev .1% of all transfer fees are sent to burn, dao, stakers, and add LP
    
    function distributeFees() external {
        uint256 balance = balanceOf(address(this));
        // Give caller 1% of fees accrued
        uint256 reward = balance / 100;
        // Break up the accrued fees four ways equally for distribution
        uint256 amount = (balance - reward) / 4;

        // Reward the caller
        super._transfer(address(this), msg.sender, reward);
        // Transfer fees and provide LP
        _burn(address(this), amount);
        super._transfer(address(this), dao, amount);
        super._transfer(address(this), stakingRewards, amount);
        if (swapAndLiquifyEnabled) {
            swapAndLiquify(amount);
        }
    }


    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        if (noFeeOnTransfer[sender] || noFeeOnTransfer[recipient]) {
            super._transfer(sender, recipient, amount);
        } else {
            // accrue 0.4% for fees to be later distributed
            uint256 transferFee = amount / 250;
            super._transfer(sender, address(this), transferFee);
            // Send remaining amount to recipient
            super._transfer(sender, recipient, amount - transferFee);
        }
    }


    function swapAndLiquify(uint256 contractTokenBalance) private nonReentrant {
    
        // split the contract balance into halves
        uint256 half = contractTokenBalance / 2;
        uint256 otherHalf = contractTokenBalance - half;

        // capture the contract's current ETH balance.
        // this is so that we can capture exactly the amount of ETH that the
        // swap creates, and not make the liquidity event include any ETH that
        // has been manually sent to the contract
        uint256 initialBalance = address(this).balance;

        // swap tokens for ETH
        swapTokensForEth(half); // <- this breaks the ETH -> HATE swap when swap+liquify is triggered

        // how much ETH did we just swap into?
        uint256 newBalance = address(this).balance - initialBalance;

        // add liquidity to uniswap
        addLiquidity(otherHalf, newBalance);

        emit SwapAndLiquify(half, newBalance, otherHalf);
    }

    function swapTokensForEth(uint256 tokenAmount) private {
        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = router.WETH();

        _approve(address(this), address(router), tokenAmount);

        (uint256 reserveFluid, uint256 reserveWeth, ) = sushiPair.getReserves();
        uint256 spotPrice = router.quote(tokenAmount, reserveFluid, reserveWeth);
        uint256 minToReturn = spotPrice * (SLIPPAGE_MAX - slippageAllowance) / SLIPPAGE_MAX;
        
        // make the swap
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            minToReturn,
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        _approve(address(this), address(router), tokenAmount);

        // add the liquidity
        router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0,
            0,
            address(this),
            block.timestamp
        );
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        return super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        return super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        return super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        return super._burn(account, amount);
    }

    function _maxSupply()
        internal
        view
        virtual
        override(ERC20VotesComp, ERC20Votes)
        returns (uint224)
    {
        return type(uint224).max;
    }

    //to recieve ETH from router when swapping
    receive() external payable {}

}
