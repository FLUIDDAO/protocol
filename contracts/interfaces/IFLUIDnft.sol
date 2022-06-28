// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.12;
import {IERC721A} from "erc721a/contracts/IERC721A.sol";

interface IFLUIDnft is IERC721A {
    function mint(address receiver) external returns (uint256 tokenId);

    function burn(uint256 tokenId) external;
}
