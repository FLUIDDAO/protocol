import fs from "fs";
import {ethers } from "hardhat";
import { deploy, verifyContract } from "./utils";
import { FLUIDtoken } from "../artifacts/types/FLUIDtoken";

async function main() {
    const initialMintAmount = 80;
    let [deployer] = await ethers.getSigners();

    const fluidtoken = await deploy<FLUIDtoken>(
        "FLUIDtoken",
        undefined,
        deployer.address,
        initialMintAmount
    );

    console.log("FLUID erc20 contract deployed at: ", fluidtoken.address);

    console.log("Wait 2 minutes before bytecodes are uploaded to verify contract");
    await new Promise(r => setTimeout(r, 120 * 1000));
    await verifyContract(
        "FLUIDtoken",
        fluidtoken.address,
        [deployer.address, initialMintAmount]
    );
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
