import fs from "fs";
import {ethers } from "hardhat";
import { deploy, verifyContract } from "./utils";


async function main() {
    let [deployer] = await ethers.getSigners();

    const fluidERC20 = await deploy<ERC20>(
        "ERC20",
        undefined,
        "FLUID",
        "FLN"
    );

    console.log("KanakyTribe contract deployed at: ", fluidERC20.address);

    console.log("Wait 2 minutes before bytecodes are uploaded to verify contract");
    await new Promise(r => setTimeout(r, 120 * 1000));
    await verifyContract(
        "ERC20",
        fluidERC20.address,
        ["FLUID", "FLN"]
    );
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
