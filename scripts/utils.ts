import { Contract } from "ethers";
import { ethers } from "hardhat";
import { Libraries } from "hardhat/types";

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

import { run } from "hardhat";

export const verify = async (
  address: string,
  constructorArguments?: any[] | undefined
) => {
  console.log(
    `verify  ${address} with arguments ${
      constructorArguments && constructorArguments.join(",")
    }`
  );
  await run("verify:verify", {
    address,
    constructorArguments,
  });
};

export const verifyContract = async (
  contractName: string,
  contractAddress: string,
  args: any = undefined
) => {
  try {
    console.log(`Verifying ${contractName}`);
    if (args) {
      await verify(contractAddress, args);
    } else await verify(contractAddress);
  } catch (e) {
    console.log(e);
  }
};
