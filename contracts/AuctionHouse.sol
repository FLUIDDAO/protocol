// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IAuctionHouse} from "./interfaces/IAuctionHouse.sol";
import {IFLUIDtoken} from "./interfaces/IFLUIDtoken.sol";
import {IFLUIDnft} from "./interfaces/IFLUIDnft.sol";

// Fork of nouns auction house: 0xF15a943787014461d94da08aD4040f79Cd7c124e

/// @title FLUID DAO Auction House
/// @author @cartercarlson
/// @notice FLUID DAO auction contract to sell the FLUID DAO NFT.
contract AuctionHouse is
    Pausable,
    ReentrancyGuard,
    Ownable,
    IAuctionHouse,
    IERC721Receiver
{

    // The ERC721 token contract
    IFLUIDnft public FLUIDnft;

    // The address of the WETH contract
    address public weth;

    // The minimum amount of time left in an auction after a new bid is created
    uint256 public timeBuffer;

    // The minimum price accepted in an auction
    uint256 public reservePrice;

    // The minimum percentage difference between the last bid amount and the current bid
    uint8 public minBidIncrementPercentage;

    // The duration of a single auction
    uint256 public duration;

    // The active auction
    IAuctionHouse.Auction public auction;

    // Fluidtoken address
    IFLUIDtoken public FLUIDtoken;

    // DAO to receive every 10th nft
    address public dao;

    // FLUID erc20 amount rewarded to a winner
    uint256 public rewardAmount = 1e18;

    constructor(
        IFLUIDnft _FLUIDnft,
        IFLUIDtoken _FLUIDtoken,
        address _dao,
        address _weth,
        uint256 _timeBuffer,
        uint256 _reservePrice,
        uint8 _minBidIncrementPercentage,
        uint256 _duration
    ) {
        FLUIDnft = _FLUIDnft;
        FLUIDtoken = _FLUIDtoken;
        dao = _dao;
        weth = _weth;
        timeBuffer = _timeBuffer;
        reservePrice = _reservePrice;
        minBidIncrementPercentage = _minBidIncrementPercentage;
        duration = _duration;

        _pause();
    }

    /// @notice Set the auction time buffer.
    /// @dev Only callable by the owner.
    function setTimeBuffer(uint256 _timeBuffer) external override onlyOwner {
        timeBuffer = _timeBuffer;

        emit AuctionTimeBufferUpdated(_timeBuffer);
    }


    /// @notice Set the auction reserve price.
    /// @dev Only callable by the owner.
    function setReservePrice(uint256 _reservePrice) external override onlyOwner {
        reservePrice = _reservePrice;

        emit AuctionReservePriceUpdated(_reservePrice);
    }

    /// @notice Set the auction minimum bid increment percentage.
    /// @dev Only callable by the owner.
    function setMinBidIncrementPercentage(uint8 _minBidIncrementPercentage) external override onlyOwner {
        minBidIncrementPercentage = _minBidIncrementPercentage;

        emit AuctionMinBidIncrementPercentageUpdated(_minBidIncrementPercentage);
    }

    /// @notice Settle the current auction, mint a new Noun, and put it up for auction.
    function settleCurrentAndCreateNewAuction()
        external
        override
        nonReentrant
        whenNotPaused
    {
        _settleAuction();
        _createAuction();
    }


    /// @notice Settle the current auction.
    /// @dev This function can only be called when the contract is paused.
    function settleAuction() external override whenPaused nonReentrant {
        _settleAuction();
    }

    /// @notice Create a bid for a FluidDAONFT, with a given amount.
    /// @dev This contract only accepts payment in ETH.
    function createBid(uint256 FLUIDnftId)
        external
        payable
        override
        nonReentrant
    {
        IAuctionHouse.Auction memory _auction = auction;
        require(
            _auction.FLUIDnftId == FLUIDnftId,
            "Fluid not up for auction"
        );
        require(block.timestamp < _auction.endTime, "Auction expired");
        uint256 amount = msg.value;
        require(amount >= reservePrice, "Must send at least reservePrice");
        require(
            amount >=
                _auction.amount +
                    ((_auction.amount * minBidIncrementPercentage) / 100),
            "Must send more than last bid by minBidIncrementPercentage amount"
        );

        address payable lastBidder = _auction.bidder;
        uint256 lastBidAmount = _auction.amount;

        // Refund the last bidder, if applicable
        if (lastBidder != address(0)) {
            _safeTransferETHWithFallback(lastBidder, lastBidAmount);
        }

        auction.amount = amount;
        auction.bidder = payable(msg.sender);

        // Extend the auction if the bid was received within `timeBuffer` of the auction end time
        bool extended = _auction.endTime - block.timestamp < timeBuffer;
        if (extended) {
            auction.endTime = _auction.endTime = block.timestamp + timeBuffer;
        }

        emit AuctionBid(_auction.FLUIDnftId, msg.sender, amount, extended);

        if (extended) {
            emit AuctionExtended(_auction.FLUIDnftId, _auction.endTime);
        }
    }

    
    /// @notice Pause the auction house.
    /// @dev This function can only be called by the owner when the
    /// contract is unpaused. While no new auctions can be started when paused,
    /// anyone can settle an ongoing auction.
    function pause() external override onlyOwner {
        _pause();
    }


    /// @notice Unpause the auction house.
    /// @dev This function can only be called by the owner when the
    /// contract is paused. If required, this function will start a new auction.
    function unpause() external override onlyOwner {
        _unpause();

        if (auction.startTime == 0 || auction.settled) {
            _createAuction();
        }
    }


    /// @notice Create an auction.
    /// @dev Store the auction details in the `auction` state variable and emit an AuctionCreated event.
    /// If the mint reverts, the minter was updated without pausing this contract first. To remedy this,
    /// catch the revert and pause this contract.

    function _createAuction() internal {
        // mint every 10th to dao
        uint256 nextTokenId = FLUIDnft.totalSupply() + 1;
        if (nextTokenId % 10 == 0) {
            FLUIDnft.mint(dao);

            // lower rewards every two hundred minted by 10%
            if (nextTokenId % 200 == 0) {
                rewardAmount -= (rewardAmount / 10);
            }
            // send FLUID rewards to dao
            FLUIDtoken.mint(dao, rewardAmount);
        }

        try FLUIDnft.mint(address(this)) returns (uint256 FLUIDnftId) {
            uint256 startTime = block.timestamp;
            uint256 endTime = startTime + duration;

            auction = Auction({
                FLUIDnftId: FLUIDnftId,
                amount: 0,
                startTime: startTime,
                endTime: endTime,
                bidder: payable(0),
                settled: false
            });

            emit AuctionCreated(FLUIDnftId, startTime, endTime);
        } catch Error(string memory /* err */) {
            _pause();
        }
    }


    /// @notice Settle an auction, finalizing the bid and paying out to the owner.
    /// @dev If there are no bids, the Noun is burned.
    function _settleAuction() internal {
        IAuctionHouse.Auction memory _auction = auction;
        require(_auction.startTime != 0, "Auction hasn't begun");
        require(!_auction.settled, "Auction has already been settled");
        require(
            block.timestamp >= _auction.endTime,
            "Auction hasn't completed"
        );

        auction.settled = true;

        if (_auction.bidder == address(0)) {
            FLUIDnft.burn(_auction.FLUIDnftId);
        } else {
            FLUIDnft.transferFrom(
                address(this),
                _auction.bidder,
                _auction.FLUIDnftId
            );
            FLUIDtoken.mint(_auction.bidder, rewardAmount);
        }
        if (_auction.amount > 0) {
            _safeTransferETHWithFallback(owner(), _auction.amount);
        }

        emit AuctionSettled(
            _auction.FLUIDnftId,
            _auction.bidder,
            _auction.amount
        );
    }

    /// @notice Transfer ETH. If the ETH transfer fails, wrap the ETH and try send it as WETH.
    function _safeTransferETHWithFallback(address to, uint256 amount) internal {
        if (!_safeTransferETH(to, amount)) {
            IWETH(weth).deposit{value: amount}();
            IERC20(weth).transfer(to, amount);
        }
    }


    /// @notice Transfer ETH and return the success status.
    /// @dev This function only forwards 30,000 gas to the callee.
    function _safeTransferETH(address to, uint256 value)
        internal
        returns (bool)
    {
        (bool success, ) = to.call{value: value, gas: 30_000}(new bytes(0));
        return success;
    }

    // https://github.com/nibbstack/erc721/blob/master/src/tests/mocks/nf-token-receiver-test-mock.sol
    function onERC721Received(
        address _operator,
        address _from,
        uint256 _tokenId,
        bytes calldata _data
    )
        external
        override
        returns(bytes4)
    {
        _operator;
        _from;
        _tokenId;
        _data;
        return 0x150b7a02;
    }
}
