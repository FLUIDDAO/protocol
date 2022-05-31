import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { mineBlock, setAutomine } from "./utils/hardhatNode";
import { deploy, fromETHNumber } from "./utils/helpers";
import { FluidToken, StakingRewards } from "../artifacts/types";
