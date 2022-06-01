import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { mineBlock, setAutomine } from "./utils/hardhatNode";
import { deploy, fromETHNumber } from "./utils/helpers";
import { 
    FluidToken,
    StakingRewards,
    FluidDAONFT,
    AuctionHouse,
    RoyaltyReceiver
} from "../artifacts/types";

const setup = async () => {

    const initialMintAmount = 80;
    const DAO = "0x0";
    // args specific to auctionHouse
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const timeBuffer = 300;
    const reservePrice = 10**17; // 0.1 ETH
    const minBidIncrementPercentage = 2;
    const duration = 60*60*12; // 12 hrs

    let deployer: SignerWithAddress;
    let fluidERC20: FluidToken;
    let fluidERC721: FluidDAONFT;
    let stakingRewards: StakingRewards;
    let auctionHouse: AuctionHouse;
    let royaltyReceiver: RoyaltyReceiver;

    before(async () => {
        [deployer] = await ethers.getSigners();
        fluidERC20 = await deploy<FluidToken>(
            "FluidToken",
            undefined,
            DAO,
            deployer.address,
            initialMintAmount
        );
        stakingRewards = ""; // TODO
        royaltyReceiver = await deploy<RoyaltyReceiver>(
            "RoyaltyReceiver",
            undefined,
            DAO,
            stakingRewards
        );
        fluidERC721 = await deploy<FluidDAONFT>(
            "FluidDAONFT",
            undefined,
            royaltyReceiver.address,
            DAO,
            initialMintAmount
        );
        auctionHouse = await deploy<AuctionHouse>(
            "AuctionHouse",
            undefined,
            fluidERC20,
            fluidERC721,
            DAO,
            WETH,
            timeBuffer,
            reservePrice,
            minBidIncrementPercentage,
            duration
        );

        // now that auction house is deployed, set to the erc721
        await fluidERC721.setAuctionHouse(auctionHouse.address);
    });
};

setup().then(() => {
    run();
});