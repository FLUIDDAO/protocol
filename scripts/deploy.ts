import fs from "fs";
import { ethers } from "hardhat";
import { deploy, getContractAt, verifyContract } from "./utils";
import { fromETHNumber } from "../test/utils/helpers";
import {
    TestFLUIDtoken,
    StakingRewards,
    TestFLUIDnft,
    AuctionHouse,
    RoyaltyReceiver,
    IWETH,
    IUniswapV2Pair,
    IUniswapV2Router02
} from "../artifacts/types";

async function main() {
    const initialMintAmount = 80;
    const initialMintAmountInEth = fromETHNumber(initialMintAmount);
    const IMAGE = "https://fluiddao.mypinata.cloud/ipfs/QmVUiZFL26TkwinCzkoJg72sWdiQgooVt45JPoje9iDcYu";
    const DAO = "0xB17ca1BC1e9a00850B0b2436e41A055403512387";
    // args specific to auctionHouse
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    const RESERVE_PRICE = fromETHNumber(0.1); // 0.1 ETH
    const TIME_BUFFER = 300;
    const MIN_BID_INCREMENT_PERCENTAGE = 2;
    const DURATION = 60 * 60 * 12; // 12 hrs

    const fluidtoken = await deploy<TestFLUIDtoken>(
        "TestFLUIDtoken",
        undefined,
        DAO,
        initialMintAmountInEth
    );
    console.log("TestFLUIDtoken deployed at: ", fluidtoken.address);

    const sushiPair = await getContractAt<IUniswapV2Pair>("IUniswapV2Pair", await fluidtoken.sushiPair());

    const stakingRewards = await deploy<StakingRewards>(
        "StakingRewards",
        undefined,
        fluidtoken.address
    );
    console.log("StakingRewards deployed at: ", fluidtoken.address);

    const royaltyReceiver = await deploy<RoyaltyReceiver>(
        "RoyaltyReceiver",
        undefined,
        fluidtoken.address,
        DAO,
        stakingRewards.address,
        sushiPair.address
    );
    console.log("RoyaltyReceiver deployed at: ", royaltyReceiver.address);

    const fluidnft = await deploy<TestFLUIDnft>(
        "TestFLUIDnft",
        undefined,
        IMAGE,
        royaltyReceiver.address,
        DAO,
        initialMintAmount
    );
    console.log("TestFLUIDnft deployed at: ", fluidnft.address);

    const auctionHouse = await deploy<AuctionHouse>(
        "AuctionHouse",
        undefined,
        fluidnft.address,
        fluidtoken.address,
        DAO,
        WETH,
        TIME_BUFFER,
        RESERVE_PRICE,
        MIN_BID_INCREMENT_PERCENTAGE,
        DURATION
        );
    console.log("AuctionHouse deployed at: ", auctionHouse.address);

    console.log("Set auctionHouse and stakingRewards addresses within contracts");
    await fluidnft.setAuctionHouse(auctionHouse.address);
    await fluidtoken.setAuctionHouse(auctionHouse.address);
    await fluidtoken.setStakingRewards(stakingRewards.address);

    console.log("Wait 2 minutes before bytecodes are uploaded to verify contract");
    await new Promise(r => setTimeout(r, 120 * 1000));
    await verifyContract(
        "TestFLUIDtoken",
        fluidtoken.address,
        [DAO, initialMintAmountInEth]
    );
    await verifyContract(
        "StakingRewards",
        stakingRewards.address,
        [fluidtoken.address]
    );
    await verifyContract(
        "RoyaltyReceiver",
        royaltyReceiver.address,
        [fluidtoken.address, DAO, stakingRewards.address, sushiPair.address]
    );
    await verifyContract(
        "TestFLUIDnft",
        fluidnft.address,
        [IMAGE, royaltyReceiver.address, DAO, initialMintAmount]
    );
    await verifyContract(
        "AuctionHouse",
        auctionHouse.address,
        [
            fluidnft.address,
            fluidtoken.address,
            DAO,
            WETH,
            TIME_BUFFER,
            RESERVE_PRICE,
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
