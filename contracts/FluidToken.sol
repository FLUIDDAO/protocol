// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20VotesComp} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IFluidToken} from "./interfaces/IFluidToken.sol";
import {IUniswapV2Router02} from  "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from  "./interfaces/IUniswapV2Factory.sol";

// TODO: will dao ever expected to be changed
// TODO: Do we need the whitelist of addresses that can transfer w/o fees?
contract FluidToken is
    IFluidToken,
    ERC20Permit,
    ERC20Votes,
    ERC20VotesComp,
    Ownable,
    Pausable,
    ReentrancyGuard
{
    address public constant DAO = 
        0xB17ca1BC1e9a00850B0b2436e41A055403512387;
    address public constant DEAD_ADDRESS =
        0x000000000000000000000000000000000000dEaD;
    mapping(address => bool) public whitelistedAddress;

    IUniswapV2Router02 public router;
    address public sushiPair;
    address public stakingPool;
    address public auctionHouse;

    bool public swapAndLiquifyEnabled = true;

    event SetWhitelistAddress(address whitelistAccount, bool value);
    event SetSwapAndLiquifyEnabled(bool enabled);
    event SetStakingPool(address _stakingPool);
    event SetAuctionHouse(address _auctionHouse);
    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiqudity
    );

    constructor(
        address initialHolder,
        uint256 initialSupply
    ) ERC20("Fluid DAO", "FLD") ERC20Permit("fluid")
    {
        // SushiV2Router02 address. It comes from https://dev.sushi.com/sushiswap/contracts
        IUniswapV2Router02 _router = IUniswapV2Router02(
            0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506
        );
        // Create a uniswap pair for this new token
        sushiPair = IUniswapV2Factory(_router.factory())
            .createPair(address(this), _router.WETH());

        // set the rest of the contract variables
        router = _router;

        _mint(initialHolder, initialSupply);
    }

    function mint(address _to, uint256 amount) external override {
        require(msg.sender == auctionHouse, "!auctionHouse");
        _mint(_to, amount);
    }

    function setWhitelistAddress(address _whitelist, bool _status)
        external
        onlyOwner
    {
        require(_whitelist != address(0), "setWhitelistAddress: Zero address");
        whitelistedAddress[_whitelist] = _status;
        emit SetWhitelistAddress(_whitelist, _status);
    }

    function setSwapAndLiquifyEnabled(bool _enabled) external onlyOwner {
        swapAndLiquifyEnabled = _enabled;
        emit SetSwapAndLiquifyEnabled(_enabled);
    }

    function setAuctionHouse(address _auctionHouse) external onlyOwner {
        auctionHouse = _auctionHouse;
        emit SetAuctionHouse(_auctionHouse);
    }

    function setStakingPool(address _stakingPool) external onlyOwner {
        stakingPool = _stakingPool;
        emit SetStakingPool(_stakingPool);
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
        super._transfer(address(this), DEAD_ADDRESS, amount);
        super._transfer(address(this), DAO, amount);
        // TODO: this transfer should be addToAllocation func for staking pool
        super._transfer(address(this), stakingPool, amount);
        if (swapAndLiquifyEnabled) {
            swapAndLiquify(amount);
        }

    }


    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        if (whitelistedAddress[sender] || whitelistedAddress[recipient]) {
            super._transfer(sender, recipient, amount);
        } else {
            // accrue 0.4% for fees to be later distributed
            uint256 transferFee = amount / 250;
            super_.transfer(sender, address(this), transferFee);
            // Send remaining amount to recipient
            super_.transfer(sender, recipient, amount - transferFee);
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

        // make the swap
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(router), tokenAmount);

        // add the liquidity
        router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            owner(),
            block.timestamp
        );
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        require(!paused(), "ERC20Pausable: token transfer while paused");
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        ERC20Votes._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount)
        internal
        override(ERC20, ERC20Votes)
    {
        super._burn(account, amount);
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
