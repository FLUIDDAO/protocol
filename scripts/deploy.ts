import fs from "fs";
import { ethers } from "hardhat";
import { deploy, getContractAt, verifyContract } from "./utils";
import { fromETHNumber } from "../test/utils/helpers";
import {
    FluidToken,
    StakingRewards,
    FluidDAONFT,
    AuctionHouse,
    RoyaltyReceiver,
    IWETH,
    IUniswapV2Pair,
    IUniswapV2Router02
} from "../artifacts/types";

async function main() {
    const DAO = "0x000"; // TODO
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const RESERVE_PRICE = fromETHNumber(0.1); // 0.1 ETH
    const TIME_BUFFER = 300;
    const MIN_BID_INCREMENT_PERCENTAGE = 2;
    const DURATION = 60 * 60 * 12; // 12 hrs
    const initialMintAmount = 80;

    const fluidToken = await deploy<FluidToken>(
        "Fluid Token",
        undefined,
        DAO,
        initialMintAmount
    );
    console.log("FluidToken deployed at: ", fluidToken.address);

    const sushiPair = await getContractAt<IUniswapV2Pair>("IUniswapV2Pair", await fluidToken.sushiPair());

    const stakingRewards = await deploy<StakingRewards>(
        "StakingRewards",
        undefined,
        fluidToken.address
    );
    console.log("Fluid Token contract deployed at: ", fluidToken.address);

    const royaltyReceiver = await deploy<RoyaltyReceiver>(
        "RoyaltyReceiver",
        undefined,
        fluidToken.address,
        DAO,
        stakingRewards.address,
        sushiPair.address
    );
    console.log("RoyaltyReceiver deployed at: ", royaltyReceiver.address);

    const fluidNFT = await deploy<FluidDAONFT>(
        "FluidDAONFT",
        undefined,
        royaltyReceiver.address,
        DAO,
        initialMintAmount
    );
    console.log("FluidNFT deployed at: ", fluidNFT.address);

    const auctionHouse = await deploy<AuctionHouse>(
        "AuctionHouse",
        undefined,
        fluidNFT.address,
        fluidToken.address,
        DAO,
        WETH,
        TIME_BUFFER,
        RESERVE_PRICE,
        MIN_BID_INCREMENT_PERCENTAGE,
        DURATION
        );
    console.log("AuctionHouse deployed at: ", auctionHouse.address);

    console.log("Set auctionHouse and stakingRewards addresses within contracts");
    await fluidNFT.setAuctionHouse(auctionHouse.address);
    await fluidToken.setAuctionHouse(auctionHouse.address);
    await fluidToken.setStakingRewards(stakingRewards.address);

    console.log("Wait 2 minutes before bytecodes are uploaded to verify contract");
    await new Promise(r => setTimeout(r, 120 * 1000));
    await verifyContract(
        "FluidToken",
        fluidToken.address,
        [DAO, initialMintAmount]
    );
    await verifyContract(
        "StakingRewards",
        stakingRewards.address,
        [fluidToken.address]
    );
    await verifyContract(
        "RoyaltyReceiver",
        royaltyReceiver.address,
        [fluidToken.address, DAO, stakingRewards.address, sushiPair.address]
    );
    await verifyContract(
        "FluidDAONFT",
        fluidNFT.address,
        [royaltyReceiver.address, DAO, initialMintAmount]
    );
    await verifyContract(
        "AuctionHouse",
        auctionHouse.address,
        [
            fluidNFT.address,
            fluidToken.address,
            DAO,
            WETH,
            TIME_BUFFER,RESERVE_PRICE,
            MIN_BID_INCREMENT_PERCENTAGE,
            DURATION
        ]
    );


}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
