import fs from "fs";
import {ethers } from "hardhat";
import { deploy, verifyContract } from "./utils";
import { FluidToken } from "../artifacts/types/FluidToken";

async function main() {
    const initialMintAmount = 80;
    let [deployer] = await ethers.getSigners();

    const fluidToken = await deploy<FluidToken>(
        "Fluid Token",
        undefined,
        deployer.address,
        initialMintAmount
    );

    console.log("FLUID erc20 contract deployed at: ", fluidToken.address);

    console.log("Wait 2 minutes before bytecodes are uploaded to verify contract");
    await new Promise(r => setTimeout(r, 120 * 1000));
    await verifyContract(
        "FluidToken",
        fluidToken.address,
        [deployer.address, initialMintAmount]
    );
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
