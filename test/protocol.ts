import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Signer } from "ethers";
import { impersonate, mineBlock, setAutomine } from "./utils/hardhatNode";
import { deploy, fromETHNumber, getContractAt } from "./utils/helpers";
import { 
    FluidToken,
    // StakingRewards,
    FluidDAONFT,
    AuctionHouse,
    RoyaltyReceiver,
    ERC20,
    IUniswapV2Router02
} from "../artifacts/types";

const setup = async () => {

    const initialMintAmount = ethers.utils.parseEther("80");
    const DAO = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // args specific to auctionHouse
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETHWhale = "0x57757E3D981446D585Af0D9Ae4d7DF6D64647806";
    const ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    const timeBuffer = 300;
    const reservePrice = 10**17; // 0.1 ETH
    const minBidIncrementPercentage = 2;
    const duration = 60*60*12; // 12 hrs

    let account0: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let wethWhale: Signer;
    let fluidERC20: FluidToken;
    let fluidERC721: FluidDAONFT;
    // let stakingRewards: StakingRewards;
    let auctionHouse: AuctionHouse;
    let royaltyReceiver: RoyaltyReceiver;
    let weth: ERC20;
    let router: IUniswapV2Router02;

    describe("FLUID DAO Protocol", () => {

        before(async () => {
            [account0, account1, account2] = await ethers.getSigners();
            fluidERC20 = await deploy<FluidToken>(
                "FluidToken",
                undefined,
                account0.address, // DAO
                account0.address,
                initialMintAmount
            );
            const stakingRewards = ethers.constants.AddressZero; // TODO
            royaltyReceiver = await deploy<RoyaltyReceiver>(
                "RoyaltyReceiver",
                undefined,
                DAO,
                stakingRewards
            );
            // fluidERC721 = await deploy<FluidDAONFT>(
            //     "FluidDAONFT",
            //     undefined,
            //     royaltyReceiver.address,
            //     DAO,
            //     initialMintAmount
            // );
            // auctionHouse = await deploy<AuctionHouse>(
            //     "AuctionHouse",
            //     undefined,
            //     fluidERC20,
            //     fluidERC721,
            //     DAO,
            //     WETH,
            //     timeBuffer,
            //     reservePrice,
            //     minBidIncrementPercentage,
            //     duration
            // );

            // // now that auction house is deployed, set to the erc721
            // await fluidERC721.setAuctionHouse(auctionHouse.address);
            
            // const routerAddr = await fluidERC20.router();
            // router = await getContractAt<IUniswapV2Router02>("IUniswapV2Router02", routerAddr);
            // // pre-load addresses with ETH for future use
            // weth = await getContractAt<ERC20>("ERC20", WETH);
            // wethWhale = await impersonate(WETHWhale);
            // await weth.connect(wethWhale).transfer(account0.address, ethers.utils.parseEther("1000"));
            // // unwrap WETH -> ETH
            // await weth.withdraw(1000);
        });

        describe("Fluid Token", () => {
            it("Should have created token", async () => {
                console.log(fluidERC20.address);
            })
            it("Should mint initial amount", async () => {
                const balance = await fluidERC20.balanceOf(account0.address, {gasLimit: 100000});
                expect(balance).to.equal(initialMintAmount);
            });
            // it("Should have created the sushi pair", async () => {
            //     const sushiPair = await fluidERC20.sushiPair();
            //     expect(sushiPair).to.not.equal(ethers.constants.AddressZero);
            // });
            it("Should accrue fees on transfers", async () => {
                const halfMinted = initialMintAmount.div(2);
                await fluidERC20.transfer(account1.address, halfMinted);
                let fee1 = halfMinted.mul(996).div(1000);
                let receivedAmt1 = halfMinted.sub(fee1);
                let balance0 = await fluidERC20.balanceOf(account0.address);
                let balance1 = await fluidERC20.balanceOf(account1.address);
                expect(balance0).to.equal(halfMinted);
                expect(balance1).to.equal(receivedAmt1);
                await fluidERC20.connect(account1).transfer(account2.address, receivedAmt1);
                let fee2 = receivedAmt1.mul(996).div(1000);
                let receivedAmt2 = receivedAmt1.sub(fee2);
                balance1 = await fluidERC20.balanceOf(account1.address);
                let balance2 = await fluidERC20.balanceOf(account2.address);
                expect(balance1).to.equal(0);
                expect(balance2).to.equal(receivedAmt2);
            });
            it("Should distribute fees accordingly", async () => {
                // We'll first need to add liquidity to the pool so distributing fees can trade
                // Let's say 1 FLUID = 3 WETH
                const amountDepositWETH = 120;
                const amountDepositFLUID = 40;
                const block = await ethers.provider.getBlock("latest");

                await router.addLiquidityETH(
                    fluidERC20.address,
                    amountDepositFLUID,
                    amountDepositWETH,
                    0, // slippage is unavoidable
                    0, // slippage is unavoidable
                    account0.address,
                    block.timestamp,
                    {value: 1000}
                );
            });
        });

    });
};

setup().then(() => {
    run();
});