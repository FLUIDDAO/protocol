pragma solidity ^0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Fork of https://solidity-by-example.org/defi/staking-rewards/

contract StakingRewards is Ownable, ReentrancyGuard {
    IERC20 public token;

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

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;

        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
        _;
    }

    constructor(address _token) {
        token = IERC20(_token);
    }

    function updateRewardRate(uint256 _rewardRate) public onlyOwner {
        // TODO: require reward rate only changes by X % at a time?
        require(_rewardRate != rewardRate, "_rewardRate == rewardRate");
        rewardRate = _rewardRate;
    }

    function stake(uint _amount) public updateReward(msg.sender) nonReentrant {
        require(_amount > 0, "Cannot deposit 0");
        _totalSupply += _amount;
        _balances[msg.sender] += _amount;
        token.transferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint _amount) public updateReward(msg.sender) nonReentrant {
        require(_amount > 0, "Cannot withdraw 0");
        _totalSupply -= _amount;
        _balances[msg.sender] -= _amount;
        token.transfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    function getReward() public updateReward(msg.sender) {
        uint reward = rewards[msg.sender];
        require(
            token.balanceOf(address(this)) - reward > _totalSupply,
            "reward would draw from locked supply"
        );
        if (reward > 0) {
            rewards[msg.sender] = 0;
            token.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(token), "Cannot withdraw the staking token");
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