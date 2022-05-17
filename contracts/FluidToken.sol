// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20VotesComp.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import {IFluidToken} from "./interfaces/IFluidToken.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IUniswapV2Factory.sol";

interface ITreasury {
    function validatePayout() external;
}

contract FluidToken is
    IFluidToken,
    ERC20Permit,
    ERC20Votes,
    ERC20VotesComp,
    Ownable,
    Pausable
{
    address public treasury;
    address public constant DEAD_ADDRESS =
        0x000000000000000000000000000000000000dEaD;
    mapping(address => bool) public whitelistedAddress;

    IUniswapV2Router02 public uniswapV2Router;
    address public uniswapV2Pair;

    bool inSwapAndLiquify;
    bool public swapAndLiquifyEnabled = true;

    uint256 private numTokensSellToAddToLiquidity = 500 * 10**18;

    event TreasuryAddressUpdated(address newTreasury);
    event WhitelistAddressUpdated(address whitelistAccount, bool value);
    event SwapAndLiquifyEnabledUpdated(bool enabled);
    event SwapAndLiquify(
        uint256 tokensSwapped,
        uint256 ethReceived,
        uint256 tokensIntoLiqudity
    );

    modifier lockTheSwap() {
        inSwapAndLiquify = true;
        _;
        inSwapAndLiquify = false;
    }

    constructor(
        address initialHolder,
        uint256 initialSupply
    ) ERC20("Fluid DAO", "FLD") ERC20Permit("fluid")
    {
        // SushiV2Router02 address. It comes from https://dev.sushi.com/sushiswap/contracts
        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(
            0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506
            // 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F
        );
        // Create a uniswap pair for this new token
        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());

        // set the rest of the contract variables
        uniswapV2Router = _uniswapV2Router;

        _mint(initialHolder, initialSupply);
    }

    function mint(address _to, uint256 amount) external override {
        _mint(_to, amount);
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

    function setTreasuryAddress(address _treasury) external onlyOwner {
        require(_treasury != address(0), "setTreasuryAddress: Zero address");
        treasury = _treasury;
        whitelistedAddress[_treasury] = true;
        emit TreasuryAddressUpdated(_treasury);
    }

    function setWhitelistAddress(address _whitelist, bool _status)
        external
        onlyOwner
    {
        require(_whitelist != address(0), "setWhitelistAddress: Zero address");
        whitelistedAddress[_whitelist] = _status;
        emit WhitelistAddressUpdated(_whitelist, _status);
    }

    function setSwapAndLiquifyEnabled(bool _enabled) public onlyOwner {
        swapAndLiquifyEnabled = _enabled;
        emit SwapAndLiquifyEnabledUpdated(_enabled);
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

    //to recieve ETH from uniswapV2Router when swaping
    receive() external payable {}


    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        if (whitelistedAddress[sender] || whitelistedAddress[recipient]) {
            super._transfer(sender, recipient, amount);
        } else {
            // 0.1% will be sent to a burn address
            uint256 burnAmount = amount / 1000;
            super._transfer(sender, DEAD_ADDRESS, burnAmount);
            // 0.1% will be sent to the DAO treasury
            uint256 taxAmount = amount / 1000;
            super._transfer(sender, treasury, taxAmount);
            ITreasury(treasury).validatePayout();
            // 0.1% will be sent to the $FLUID/$ETH liquidity pool
            uint256 liquidityAmount = amount / 1000;
            super._transfer(sender, address(this), liquidityAmount);
            _swapAndLiquify(sender);
            // 0.1% will be sent to all $FLUID stakers to reward loyal holders.
            uint256 rewardAmount = amount / 1000;
            super._transfer(sender, address(this), rewardAmount);

            // The other amount will be sent to the receipient
            super._transfer(
                sender,
                recipient,
                amount - taxAmount - burnAmount - liquidityAmount - rewardAmount
            );
        }
    }

    function _swapAndLiquify(address from) internal {
        uint256 contractTokenBalance = balanceOf(address(this));
        bool overMinTokenBalance = contractTokenBalance >=
            numTokensSellToAddToLiquidity;
        if (
            overMinTokenBalance &&
            !inSwapAndLiquify &&
            from != uniswapV2Pair &&
            swapAndLiquifyEnabled
        ) {
            contractTokenBalance = numTokensSellToAddToLiquidity;
            //add liquidity
            swapAndLiquify(contractTokenBalance);
        }
    }

    function swapAndLiquify(uint256 contractTokenBalance) private lockTheSwap {
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
        path[1] = uniswapV2Router.WETH();

        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // make the swap
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0, // accept any amount of ETH
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // approve token transfer to cover all possible scenarios
        _approve(address(this), address(uniswapV2Router), tokenAmount);

        // add the liquidity
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            owner(),
            block.timestamp
        );
    }
}
