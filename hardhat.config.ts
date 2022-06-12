import * as dotenv from "dotenv";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy-ethers";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-ethers"
import { HardhatUserConfig } from "hardhat/types";

dotenv.config();
const {
    PRIVATE_KEY,
    INFURA_KEY,
    ETHERSCAN_API_KEY,
    ALCHEMY_API_KEY
} = process.env;


const config: HardhatUserConfig = {
    solidity: {
        compilers: [{ version: "0.8.12" }],
        settings: {
            optimizer: {
                enabled: true,
                runs: 800,
            },
            metadata: {
                // do not include the metadata hash, since this is machine dependent
                // and we want all generated code to be deterministic
                // https://docs.soliditylang.org/en/v0.7.6/metadata.html
                bytecodeHash: "none",
            },
        },
    },
    networks: {
        hardhat: {
            forking: {
                url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
                accounts: [`0x${PRIVATE_KEY}`],
                blockNumber: 14448329
            },
            gas: "auto",
            // timeout: 1800000,
            chainId: 1,
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${INFURA_KEY}` || "",
            accounts: [`0x${PRIVATE_KEY}`]
        },
        // TODO add prod
    },
    typechain: {
        outDir: "artifacts/types",
        target: "ethers-v5",
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    etherscan: {
        apiKey: `${ETHERSCAN_API_KEY || ""}`,
    },
};

export default config;
