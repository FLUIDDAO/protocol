// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;

import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {ERC721A} from "erc721a/contracts/ERC721A.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title FLUID DAO ERC721
/// @author @cartercarlson
/// @notice NFT contract for FLUID DAO membership.
contract TestFLUIDnft is ERC721A, ERC2981, Ownable, ReentrancyGuard {

    event Minted(uint256 indexed tokenId, address receiver);
    event Burned(uint256 indexed tokenId);

    bool public isAuctionHouseLocked;
    address public royaltyReceiver;
    address public auctionHouse;
    string private _tokenURI;

    constructor(
        string memory __tokenURI,
        address _royaltyReceiver,
        address initialMintRecipient,
        uint256 initialMintAmount
    ) ERC721A("FLUID DAO NFT", "FLUIDid") {
        _tokenURI = __tokenURI;
        royaltyReceiver = _royaltyReceiver;

        _setDefaultRoyalty(_royaltyReceiver, 1000); // 10%
        _safeMint(initialMintRecipient, initialMintAmount);
    }

    modifier onlyAuctionHouse() {
        require(msg.sender == auctionHouse, "caller is not the auctionHouse");
        _;
    }

    modifier whenAuctionHouseNotLocked() {
        require(!isAuctionHouseLocked, "AuctionHouse is locked");
        _;
    }

    /// @notice Function to set the auction house contract address
    /// @param _auctionHouse Address of auction house contract
    /// @dev Only callable by owner, once
    function setAuctionHouse(address _auctionHouse) external onlyOwner {
        require(auctionHouse == address(0), "Already set");
        auctionHouse = _auctionHouse;
    }

    function lockAuctionHouse() external onlyOwner {
        isAuctionHouseLocked = true;
    }

    function unlockAuctionHouse() external onlyOwner {
        isAuctionHouseLocked = false;
    }


    function mint(address receiver)
        external
        onlyAuctionHouse
        whenAuctionHouseNotLocked
        nonReentrant
        returns (uint256 totalSupply_)
    {
        _safeMint(receiver, 1);
        totalSupply_ = totalSupply();
        emit Minted(totalSupply_, receiver);
    }

    function burn(uint256 tokenId) external onlyAuctionHouse nonReentrant {
        _burn(tokenId);
        emit Burned(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );
        return _tokenURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721A, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {ERC721-_burn}. This override additionally clears the royalty information for the token.
     */
    function _burn(uint256 tokenId) internal override {
        super._burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    // https://github.com/chiru-labs/ERC721A/blob/534dd35c733b749b2888d28af24defccc7b45e6f/contracts/ERC721A.sol#L122
    function _startTokenId() internal pure override returns (uint256) {
        return 1;
    }
}
