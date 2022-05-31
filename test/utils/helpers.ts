import { BigNumber } from "ethers";
import { Decimal } from "decimal.js";
import { Contract } from "@ethersproject/contracts";
import { Libraries } from "@nomiclabs/hardhat-ethers/types";
import { ethers } from "hardhat";
import { expect } from "chai";

export async function deploy<Type>(
  typeName: string,
  libraries?: Libraries,
  ...args: any[]
): Promise<Type> {
  const ctrFactory = await ethers.getContractFactory(typeName, { libraries });

  const ctr = (await ctrFactory.deploy(...args)) as unknown as Type;
  await (ctr as unknown as Contract).deployed();
  return ctr;
}

export async function getContractAt<Type>(
  typeName: string,
  address: string
): Promise<Type> {
  const ctr = (await ethers.getContractAt(
    typeName,
    address
  )) as unknown as Type;
  return ctr;
}


export const toETHNumber = (num: BigNumber | string): number => {
  return typeof num == "string"
    ? Number.parseFloat(num as string)
    : Number.parseFloat(ethers.utils.formatEther(num));
};

export const fromETHNumber = (num: number): BigNumber => {
  return ethers.utils.parseEther(num.toString());
};


const one = new Decimal(1);

