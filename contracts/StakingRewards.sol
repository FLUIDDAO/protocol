// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IFLUIDtoken, IERC20} from "./interfaces/IFLUIDtoken.sol";

// Fork of https://solidity-by-example.org/defi/staking-rewards/

/// @title FLUID DAO Staking Rewards
/// @author @cartercarlson
/// @notice Staking contract for FLUID token.
contract StakingRewards is Ownable, ReentrancyGuard {
    IFLUIDtoken public FLUIDtoken;

    uint public rewardRate = 100;
    uint public lastUpdateTime;
    uint public rewardPerTokenStored;

    mapping(address => uint) public userRewardPerTokenPaid;
    mapping(address => uint) public rewards;

    uint private _totalSupply;
    mapping(address => uint) private _balances;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardRateUpdated(uint256 rate);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;

        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        _;
    }

    constructor(address _FLUIDtoken) {
        FLUIDtoken = IFLUIDtoken(_FLUIDtoken);
    }

    /// @notice Update the reward rate per second given to stakers
    /// @param _rewardRate new reward rate
    /// @dev Only callable by owner
    function updateRewardRate(uint256 _rewardRate) public onlyOwner {
        require(_rewardRate != rewardRate, "_rewardRate == rewardRate");
        rewardRate = _rewardRate;
        emit RewardRateUpdated(_rewardRate);
    }

    function stake(uint _amount) public updateReward(msg.sender) nonReentrant {
        require(_amount > 0, "Cannot deposit 0");
        require(FLUIDtoken.balanceOf(msg.sender) >= _amount, "Not enough");
        uint256 amountAfterFee = _amount;
        // If the account has to pay a transfer fee, ensure correct accounting
        if (!FLUIDtoken.noFeeOnTransfer(msg.sender)) {
            amountAfterFee -= amountAfterFee/250;
        }
        _totalSupply += amountAfterFee;
        _balances[msg.sender] += amountAfterFee;
        FLUIDtoken.transferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, amountAfterFee);
    }

    function withdraw(uint _amount) public updateReward(msg.sender) nonReentrant {
        require(_amount > 0, "Cannot withdraw 0");
        _totalSupply -= _amount;
        _balances[msg.sender] -= _amount;
        FLUIDtoken.transfer(msg.sender, _amount);
        uint256 amountAfterFee = _amount;
        // If the acccount has to pay a transfer fee, emit correct withdrawal
        if(!FLUIDtoken.noFeeOnTransfer(msg.sender)) {
            amountAfterFee -= amountAfterFee/250;
        }
        emit Withdrawn(msg.sender, amountAfterFee);
    }

    function getReward() public updateReward(msg.sender) {
        uint reward = rewards[msg.sender];
        require(
            FLUIDtoken.balanceOf(address(this)) - reward > _totalSupply,
            "reward would draw from locked supply"
        );
        if (reward > 0) {
            rewards[msg.sender] = 0;
            FLUIDtoken.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(FLUIDtoken), "Cannot withdraw the staking FLUIDtoken");
        IERC20(tokenAddress).transfer(owner(), tokenAmount);
    }

    function rewardPerToken() public view returns (uint) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTime) * rewardRate * 1e18) / _totalSupply);
    }

    function earned(address account) public view returns (uint) {
        return
            ((_balances[account] *
                (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18) +
            rewards[account];
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }    
}