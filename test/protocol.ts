import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Signer } from "ethers";
import { impersonate, mineBlock, setAutomine } from "./utils/hardhatNode";
import { deploy, fromETHNumber, getContractAt } from "./utils/helpers";
import {
    FluidToken,
    StakingRewards,
    FluidDAONFT,
    AuctionHouse,
    RoyaltyReceiver,
    ERC20,
    IWETH,
    IUniswapV2Router02
} from "../artifacts/types";

const setup = async () => {

    const initialMintAmount = 80;
    const initialMintAmountInEth = fromETHNumber(initialMintAmount);
    // const DAO = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // args specific to auctionHouse
    const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const WETHWhale = "0x57757E3D981446D585Af0D9Ae4d7DF6D64647806";
    const ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
    const timeBuffer = 300;
    const reservePrice = fromETHNumber(0.1); // 0.1 ETH
    const minBidIncrementPercentage = 2;
    const duration = 60 * 60 * 12; // 12 hrs
    const overrides = {gasLimit: 1000000}

    let account0: SignerWithAddress;
    let account1: SignerWithAddress;
    let account2: SignerWithAddress;
    let dao: SignerWithAddress;
    let wethWhale: Signer;
    let fluidERC20: FluidToken;
    let fluidERC721: FluidDAONFT;
    let stakingRewards: StakingRewards;
    let auctionHouse: AuctionHouse;
    let royaltyReceiver: RoyaltyReceiver;
    let weth: IWETH;
    let router: IUniswapV2Router02;

    describe("FLUID DAO Protocol", () => {

        before(async () => {
            [account0, account1, account2, dao] = await ethers.getSigners();
            fluidERC20 = await deploy<FluidToken>(
                "FluidToken",
                undefined,
                dao.address, // DAO
                account0.address,
                initialMintAmountInEth
            );
            stakingRewards = await deploy<StakingRewards>(
                "StakingRewards",
                undefined,
                fluidERC20.address
            );
            royaltyReceiver = await deploy<RoyaltyReceiver>(
                "RoyaltyReceiver",
                undefined,
                fluidERC20.address,
                dao.address,
                stakingRewards.address
            );
            fluidERC721 = await deploy<FluidDAONFT>(
                "FluidDAONFT",
                undefined,
                royaltyReceiver.address,
                dao.address,
                initialMintAmount
            );
            auctionHouse = await deploy<AuctionHouse>(
                "AuctionHouse",
                undefined,
                fluidERC20.address,
                fluidERC721.address,
                dao.address,
                WETH,
                timeBuffer,
                reservePrice,
                minBidIncrementPercentage,
                duration
            );

            // now that auction house is deployed, set to the erc721
            await fluidERC721.setAuctionHouse(auctionHouse.address, overrides);

            const routerAddr = await fluidERC20.router();
            router = await getContractAt<IUniswapV2Router02>("IUniswapV2Router02", routerAddr);
            // // pre-load addresses with ETH for future use
            weth = await getContractAt<IWETH>("IWETH", WETH);
            wethWhale = await impersonate(WETHWhale);
            await weth.connect(wethWhale).transfer(account0.address, fromETHNumber(1000), overrides);
            await weth.connect(wethWhale).transfer(royaltyReceiver.address, fromETHNumber(1000), overrides);
            // unwrap WETH -> ETH
            await weth.withdraw(1000, overrides);

            // approval
            await fluidERC20.approve(router.address, ethers.constants.MaxUint256);
        });

        describe("Fluid Token", () => {
            it("Should have created token", async () => {
                expect(fluidERC20.address).to.not.equal(ethers.constants.AddressZero);
            })
            it("Should mint initial amount", async () => {
                const balance = await fluidERC20.balanceOf(account0.address, overrides);
                expect(balance).to.equal(initialMintAmountInEth);
            });
            it("Should have created the sushi pair", async () => {
                const sushiPair = await fluidERC20.sushiPair();
                expect(sushiPair).to.not.equal(ethers.constants.AddressZero);
            });
            it("Should accrue fees on transfers", async () => {
                const halfMinted = initialMintAmountInEth.div(2);
                await fluidERC20.transfer(account1.address, halfMinted, overrides);
                let fee1 = halfMinted.mul(996).div(1000);
                let receivedAmt1 = halfMinted.sub(fee1);
                let balance0 = await fluidERC20.balanceOf(account0.address);
                let balance1 = await fluidERC20.balanceOf(account1.address);
                expect(balance0).to.equal(halfMinted);
                expect(balance1).to.equal(receivedAmt1);
                await fluidERC20.connect(account1).transfer(account2.address, receivedAmt1, overrides);
                let fee2 = receivedAmt1.mul(996).div(1000);
                let receivedAmt2 = receivedAmt1.sub(fee2);
                balance1 = await fluidERC20.balanceOf(account1.address);
                let balance2 = await fluidERC20.balanceOf(account2.address);
                expect(balance1).to.equal(0);
                expect(balance2).to.equal(receivedAmt2);
            });
            it("Should distribute fees accordingly", async () => {
                // We'll first need to add liquidity to the pool so distributing fees can trade
                // Let's say 1 FLUID = 3 ETH
                const amountDepositETH = 120;
                const amountDepositFLUID = 40;
                const block = await ethers.provider.getBlock("latest");

                await router.addLiquidityETH(
                    fluidERC20.address,
                    amountDepositFLUID,
                    0, // slippage is unavoidable
                    0, // slippage is unavoidable
                    account0.address,
                    block.timestamp + 100,
                    { value: amountDepositETH, gasLimit: 1000000 }
                );

                //
            });
        });
        describe("RoyaltyReceiver", () => {
            it("Should distribute royalties accordingly", async () => {
                const rrWethBalanceBefore = await weth.balanceOf(royaltyReceiver.address);
                const daoWethBalanceBefore = await weth.balanceOf(dao.address);
                const callerWethBalanceBefore = await weth.balanceOf(account0.address);
                const srFluidBalanceBefore = await fluidERC20.balanceOf(stakingRewards.address);

                console.log(rrWethBalanceBefore);
                // const functionCallReward = rrWethBalanceBefore.div(100);
                // const halfAfterReward = rrWethBalanceBefore.sub(functionCallReward).div(2);

                await royaltyReceiver.claimRoyalties(overrides);

                const rrWethBalanceAfter = await weth.balanceOf(royaltyReceiver.address);
                const daoWethBalanceAfter = await weth.balanceOf(dao.address);
                const callerWethBalanceAfter = await weth.balanceOf(account0.address);
                const srFluidBalanceAfter = await fluidERC20.balanceOf(stakingRewards.address);

                expect(rrWethBalanceAfter).to.equal(0);
                // expect(daoWethBalanceAfter).to.equal(daoWethBalanceBefore.add(halfAfterReward));
                // expect(callerWethBalanceAfter).to.equal(callerWethBalanceBefore.add(functionCallReward));
                // expect(srFluidBalanceAfter).to.be.greaterThan(srFluidBalanceBefore);
            });
        });
        describe("Fluid NFT", () => {
            it("Should have created NFT", async () => {
                expect(fluidERC721.address).to.not.equal(ethers.constants.AddressZero);
            });
            it("Should mint initial amount", async () => {
                const balance = await fluidERC721.balanceOf(dao.address);
                expect(balance).to.equal(initialMintAmount);
            });
        });
        describe("Auction House", () => {
            it("Should create auction when unpaused", async () => {
                const tx = await auctionHouse.unpause(overrides);
                const receipt = await tx.wait();
                const block = await ethers.provider.getBlock(receipt.blockNumber);

                // Expect auction house to now hold one Fluid NFT
                const balance = await fluidERC721.balanceOf(auctionHouse.address);
                expect(balance).to.equal(1);

                // Check auction state
                const auction = await auctionHouse.auction();
                expect(auction.fluidDAONFTId).to.equal(initialMintAmount + 1);
                expect(auction.startTime).to.equal(block.timestamp);
                expect(auction.endTime).to.equal(block.timestamp + duration);

                // Ensure auction event emitted
                await expect(tx)
                    .to.emit(auctionHouse, "AuctionCreated")
                    .withArgs(initialMintAmount + 1, auction.startTime, auction.endTime)
            });
        });
        describe("Staking", () => {

        });
    });
};

setup().then(() => {
    run();
});