import "@nomiclabs/hardhat-waffle";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-abi-exporter";

dotenv.config();
const {
    PRIVATE_KEY,
    POLYGONSCAN_API_KEY,
} = process.env;

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
        },
        mumbai: {
            url: "https://rpc-mumbai.maticvigil.com",
            accounts: [`0x${PRIVATE_KEY}`]
        },
        matic: {
            url: "https://rpc-mainnet.maticvigil.com",
            accounts: [`0x${PRIVATE_KEY}`]
        }
    },
    etherscan: {
        apiKey: POLYGONSCAN_API_KEY
    },
    solidity: {
        version: "0.8.12",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
}

export default config;