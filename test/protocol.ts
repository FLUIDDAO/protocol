import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Signer } from "ethers";
import { impersonate, mineBlock, passHours, setAutomine, setNextBlockTimestamp } from "./utils/hardhatNode";
import { deploy, fromETHNumber, toETHNumber, getContractAt } from "./utils/helpers";
import {
  FLUIDtoken,
  StakingRewards,
  FLUIDnft,
  AuctionHouse,
  RoyaltyReceiver,
  IWETH,
  IUniswapV2Pair,
  IUniswapV2Router02
} from "../artifacts/types";

const setup = async () => {

  const initialMintAmount = 80;
  const initialMintAmountInEth = fromETHNumber(initialMintAmount);
  const DAO = "0xB17ca1BC1e9a00850B0b2436e41A055403512387";
  // args specific to auctionHouse
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const WETHWhale = "0x57757E3D981446D585Af0D9Ae4d7DF6D64647806";
  const ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
  const RESERVE_PRICE = fromETHNumber(0.1); // 0.1 ETH
  const TIME_BUFFER = 300;
  const MIN_BID_INCREMENT_PERCENTAGE = 2;
  const DURATION = 60 * 60 * 12; // 12 hrs
  const overrides = {gasLimit: 1000000}
  // Amounts for providing initial liquidity
  // Let's say 1 FLUID = 3 ETH
  const amountDepositETH = 120;
  const amountDepositFLUID = 40;

  let deployer: SignerWithAddress;
  let account1: SignerWithAddress;
  let account2: SignerWithAddress;
  let dao: SignerWithAddress;
  let wethWhale: Signer;
  let fluidtoken: FLUIDtoken;
  let fluidnft: FLUIDnft;
  let stakingRewards: StakingRewards;
  let auctionHouse: AuctionHouse;
  let royaltyReceiver: RoyaltyReceiver;
  let weth: IWETH;
  let sushiPair: IUniswapV2Pair;
  let router: IUniswapV2Router02;
  let snapshotId: number;

  describe("FLUID DAO Protocol", () => {

    before(async () => {
      [deployer, account1, account2, dao] = await ethers.getSigners();
      fluidtoken = await deploy<FLUIDtoken>(
        "FLUIDtoken",
        undefined,
        dao.address, // DAO
        dao.address,
        initialMintAmountInEth
      );
      sushiPair = await getContractAt<IUniswapV2Pair>("IUniswapV2Pair", await fluidtoken.sushiPair());

      stakingRewards = await deploy<StakingRewards>(
        "StakingRewards",
        undefined,
        fluidtoken.address
      );
      royaltyReceiver = await deploy<RoyaltyReceiver>(
        "RoyaltyReceiver",
        undefined,
        fluidtoken.address,
        dao.address,
        stakingRewards.address,
        sushiPair.address
      );
      fluidnft = await deploy<FLUIDnft>(
        "FLUIDnft",
        undefined,
        royaltyReceiver.address,
        dao.address,
        initialMintAmount
      );
      auctionHouse = await deploy<AuctionHouse>(
        "AuctionHouse",
        undefined,
        fluidnft.address,
        fluidtoken.address,
        dao.address,
        WETH,
        TIME_BUFFER,
        RESERVE_PRICE,
        MIN_BID_INCREMENT_PERCENTAGE,
        DURATION
      );

      // now that auction house is deployed, set to the erc721
      await fluidnft.setAuctionHouse(auctionHouse.address, overrides);
      await fluidtoken.setAuctionHouse(auctionHouse.address, overrides);
      await fluidtoken.setStakingRewards(stakingRewards.address, overrides);

      const routerAddr = await fluidtoken.router();
      router = await getContractAt<IUniswapV2Router02>("IUniswapV2Router02", routerAddr);
      // // pre-load addresses with ETH for future use
      weth = await getContractAt<IWETH>("IWETH", WETH);
      wethWhale = await impersonate(WETHWhale);
      await weth.connect(wethWhale).transfer(deployer.address, fromETHNumber(1000), overrides);
      // await weth.connect(wethWhale).transfer(royaltyReceiver.address, fromETHNumber(1000), overrides);
      // unwrap WETH -> ETH
      await weth.withdraw(500, overrides);

      // approval
      await fluidtoken.connect(dao).approve(router.address, ethers.constants.MaxUint256);
      await fluidtoken.connect(dao).approve(sushiPair.address, ethers.constants.MaxInt256)
      await fluidtoken.connect(dao).approve(stakingRewards.address, ethers.constants.MaxInt256)
      await weth.connect(dao).approve(router.address, ethers.constants.MaxUint256);
      await weth.connect(dao).approve(sushiPair.address, ethers.constants.MaxUint256);
    });

    beforeEach(async () => {
      snapshotId = await ethers.provider.send('evm_snapshot', []);
    });

    afterEach(async () => {
      await ethers.provider.send('evm_revert', [snapshotId]);
    });

    describe("Fluid Token", () => {
      it("Should have created token", async () => {
        expect(fluidtoken.address).to.not.equal(ethers.constants.AddressZero);
      })
      it("Should mint initial amount", async () => {
        const balance = await fluidtoken.balanceOf(dao.address, overrides);
        expect(balance).to.equal(initialMintAmountInEth);
      });
      it("Should have created the sushi pair", async () => {
        expect(sushiPair.address).to.not.equal(ethers.constants.AddressZero);
      });
      it("Should accrue fees on transfers", async () => {
        // unapprove fee transfers for dao
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);

        const halfMinted = initialMintAmountInEth.div(2);
        await fluidtoken.connect(dao).transfer(account1.address, halfMinted, overrides);
        let fee1 = halfMinted.div(250);
        let receivedAmt1 = halfMinted.sub(fee1);
        let balance0 = await fluidtoken.balanceOf(dao.address);
        let balance1 = await fluidtoken.balanceOf(account1.address);
        expect(balance0).to.equal(halfMinted);
        expect(balance1).to.equal(receivedAmt1);
        await fluidtoken.connect(account1).transfer(account2.address, receivedAmt1, overrides);
        let fee2 = receivedAmt1.div(250);
        let receivedAmt2 = receivedAmt1.sub(fee2);
        balance1 = await fluidtoken.balanceOf(account1.address);
        let balance2 = await fluidtoken.balanceOf(account2.address);
        expect(balance1).to.equal(0);
        expect(balance2).to.equal(receivedAmt2);
      });
      it("Should not accrue fees if sender/recipient is approved for noFeeOnTransfers", async () => {
        await fluidtoken.connect(dao).transfer(account1.address, initialMintAmountInEth, overrides);
        await fluidtoken.connect(account1).transfer(dao.address, initialMintAmountInEth, overrides);
        const feeBalance = await fluidtoken.balanceOf(fluidtoken.address);
        expect(feeBalance).to.equal(0);
      });
      it("Should revert if setting slippage above 100%", async () => {
        const tx = fluidtoken.connect(deployer).setSlippageAllowance(10001);
        await expect(tx).to.be.revertedWith("Cannot set slippage above 100%");
      });
      it("Should revert if setting reward rate above 10%", async () => {
        const tx = fluidtoken.connect(deployer).setRewardRate(11);
        await expect(tx).to.be.revertedWith("Cannot set rewardRate above 10%");
      })
      it("Should revert if non-owner tries to set reward rate", async () => {
        const tx = fluidtoken.connect(account1).setRewardRate(9, overrides);
        await expect(tx).to.be.revertedWith("Ownable: caller is not the owner")
      })
      it("Should revert if non-owner tries to set slippage allowance", async () => {
        const tx = fluidtoken.connect(account1).setSlippageAllowance(5);
        await expect(tx).to.be.revertedWith("Ownable: caller is not the owner")
      });
      it("Should revert on distributeFees() if slippage exceeds allowance", async () => {
        // unapprove fee transfers for dao
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);

        const block = await ethers.provider.getBlock("latest");
        await router.connect(dao).addLiquidityETH(
          fluidtoken.address,
          fromETHNumber(amountDepositFLUID),
          0,
          0,
          dao.address,
          block.timestamp + 100,
          { value: fromETHNumber(amountDepositETH), gasLimit: 1000000 }
        );
        await fluidtoken.setSlippageAllowance(0, overrides);
        const tx = fluidtoken.connect(account1).distributeFees(overrides);
        await expect(tx).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
      });
      it("Should succeed in distributeFees()", async () => {
        // unapprove fee transfers for dao
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);

        const block = await ethers.provider.getBlock("latest");
        await router.connect(dao).addLiquidityETH(
          fluidtoken.address,
          fromETHNumber(amountDepositFLUID),
          0,
          0,
          dao.address,
          block.timestamp + 100,
          { value: fromETHNumber(amountDepositETH), gasLimit: 1000000 }
        );

        // Fees should have accrued on LP
        const totalSupplyBefore = await fluidtoken.totalSupply();
        const fluidFluidBalanceBefore = await fluidtoken.balanceOf(fluidtoken.address);
        const daoFluidBalanceBefore = await fluidtoken.balanceOf(dao.address);
        expect(fluidFluidBalanceBefore).to.equal(fromETHNumber(amountDepositFLUID / 250));
        expect(await sushiPair.balanceOf(fluidtoken.address)).to.equal(0);
        
        let reward = fluidFluidBalanceBefore.div(10);
        let amount = fluidFluidBalanceBefore.sub(reward).div(4);

        await fluidtoken.connect(account1).distributeFees(overrides);

        expect((await fluidtoken.totalSupply()).add(amount)).to.equal(totalSupplyBefore);
        expect(await fluidtoken.balanceOf(account1.address)).to.equal(reward);
        expect(
          (await fluidtoken.balanceOf(dao.address)).sub(daoFluidBalanceBefore)
        ).to.equal(amount);
        expect(await fluidtoken.balanceOf(stakingRewards.address)).to.equal(amount);
        expect(await sushiPair.balanceOf(fluidtoken.address)).to.be.gt(0);
      });
    });

    describe("RoyaltyReceiver", () => {
      it("Should distribute royalties accordingly", async () => {

        // Let's say we have 1 WETH in royalties accrued
        await weth.connect(wethWhale).transfer(royaltyReceiver.address, fromETHNumber(1), overrides);

        // unapprove fee transfers for dao
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);

        // We'll first need to add liquidity to the pool so distributing fees can trade
        const block = await ethers.provider.getBlock("latest");
        await router.connect(dao).addLiquidityETH(
          fluidtoken.address,
          fromETHNumber(amountDepositFLUID),
          0,
          0,
          dao.address,
          block.timestamp + 100,
          { value: fromETHNumber(amountDepositETH), gasLimit: 1000000 }
        );
    
        const rrWethBalanceBefore = await weth.balanceOf(royaltyReceiver.address);
        const daoWethBalanceBefore = await weth.balanceOf(dao.address);
        const callerWethBalanceBefore = await weth.balanceOf(account1.address);
        const srFluidBalanceBefore = await fluidtoken.balanceOf(stakingRewards.address);

        const functionCallReward = rrWethBalanceBefore.div(10);
        const halfAfterReward = rrWethBalanceBefore.sub(functionCallReward).div(2);

        await royaltyReceiver.connect(account1).claimRoyalties(overrides);

        const rrWethBalanceAfter = await weth.balanceOf(royaltyReceiver.address);
        const daoWethBalanceAfter = await weth.balanceOf(dao.address);
        const callerWethBalanceAfter = await weth.balanceOf(account1.address);
        const srFluidBalanceAfter = await fluidtoken.balanceOf(stakingRewards.address);

        expect(rrWethBalanceAfter).to.equal(0);
        expect(daoWethBalanceAfter).to.equal(daoWethBalanceBefore.add(halfAfterReward));
        expect(callerWethBalanceAfter).to.equal(callerWethBalanceBefore.add(functionCallReward));
        expect(srFluidBalanceAfter).to.be.gt(srFluidBalanceBefore);
      });
    });

    describe("Fluid NFT", () => {
      it("Should have created NFT", async () => {
        expect(fluidnft.address).to.not.equal(ethers.constants.AddressZero);
      });
      it("Should mint initial amount", async () => {
        const balance = await fluidnft.balanceOf(dao.address);
        expect(balance).to.equal(initialMintAmount);
        const supply = await fluidnft.totalSupply();
        expect(supply).to.equal(balance);
      });
    });

    describe("Auction House", () => {
      it("Should create auction when unpaused", async () => {
        const tx = await auctionHouse.unpause(overrides);
        const receipt = await tx.wait();
        const block = await ethers.provider.getBlock(receipt.blockNumber);

        const balance = await fluidnft.balanceOf(auctionHouse.address);
        expect(balance).to.equal(1);

        const auction = await auctionHouse.auction();
        expect(auction.FLUIDnftId).to.equal(initialMintAmount + 1);
        expect(auction.startTime).to.equal(block.timestamp);
        expect(auction.endTime).to.equal(block.timestamp + DURATION);

        await expect(tx)
          .to.emit(auctionHouse, "AuctionCreated")
          .withArgs(initialMintAmount + 1, auction.startTime, auction.endTime)
      });

      it("Should revert if a user creates a bid for an inactive auction", async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        const tx = auctionHouse.createBid(
          FLUIDnftId.add(1),
          {value: RESERVE_PRICE, gasLimit: 100000}
        );
        await expect(tx).to.be.revertedWith("Fluid not up for auction")
      });

      it('Should revert if a user creates a bid for an expired auction', async () => {
        await (await auctionHouse.unpause()).wait();

        await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

        const { FLUIDnftId } = await auctionHouse.auction();
        const tx = auctionHouse.connect(account1).createBid(FLUIDnftId, {
          value: RESERVE_PRICE,
        });

        await expect(tx).to.be.revertedWith('Auction expired');
      });

      it('Should revert if a user creates a bid with an amount below the reserve price', async () => {
        await (await auctionHouse.unpause()).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        const tx = auctionHouse.connect(account1).createBid(FLUIDnftId, {
          value: RESERVE_PRICE.sub(1),
        });

        await expect(tx).to.be.revertedWith('Must send at least reservePrice');
      });

      it('Should revert if a user creates a bid less than the min bid increment percentage', async () => {
        await (await auctionHouse.unpause()).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        await auctionHouse.connect(account1).createBid(FLUIDnftId, {
          value: RESERVE_PRICE.mul(100),
        });
        const tx = auctionHouse.connect(account2).createBid(FLUIDnftId, {
          value: RESERVE_PRICE.mul(101),
        });

        await expect(tx).to.be.revertedWith(
          'Must send more than last bid by minBidIncrementPercentage amount',
        );
      });

      it('Should refund the previous bidder when the following user creates a bid', async () => {
        await (await auctionHouse.unpause()).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        await auctionHouse.connect(account1).createBid(FLUIDnftId, {
          value: RESERVE_PRICE,
        });

        const account1PostBidBalance = await account1.getBalance();
        await auctionHouse.connect(account2).createBid(FLUIDnftId, {
          value: RESERVE_PRICE.mul(2),
        });
        const account1PostRefundBalance = await account1.getBalance();

        expect(account1PostRefundBalance).to.equal(account1PostBidBalance.add(RESERVE_PRICE));
      });

      it('Should burn a fluidDAONFT on auction settlement if no bids are received', async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId } = await auctionHouse.auction();

        await ethers.provider.send('evm_increaseTime', [60 * 60 * 25]); // Add 25 hours

        const tx = auctionHouse.settleCurrentAndCreateNewAuction(overrides);

        await expect(tx)
          .to.emit(auctionHouse, 'AuctionSettled')
          .withArgs(FLUIDnftId, '0x0000000000000000000000000000000000000000', 0);
      });

      it('Should emit an `AuctionBid` event on a successful bid', async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        const tx = auctionHouse.connect(account1).createBid(
          FLUIDnftId,
          {value: RESERVE_PRICE, gasLimit: 1000000}
        );

        await expect(tx)
          .to.emit(auctionHouse, 'AuctionBid')
          .withArgs(FLUIDnftId, account1.address, RESERVE_PRICE, false);
      });
      it('Should emit an `AuctionExtended` event if the auction end time is within the time buffer', async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId, endTime } = await auctionHouse.auction();

        await ethers.provider.send('evm_setNextBlockTimestamp', [endTime.sub(60 * 1).toNumber()]); // Subtract 5 mins from current end time

        const tx = auctionHouse.connect(account1).createBid(
          FLUIDnftId,
          {value: RESERVE_PRICE, gasLimit: 1000000}
        );

        await expect(tx)
          .to.emit(auctionHouse, 'AuctionExtended')
          .withArgs(FLUIDnftId, endTime.add(TIME_BUFFER - 60)); // -60 as there was 1 minute left in auction and we extended by 5
      });
      it('Should emit `AuctionSettled` and `AuctionCreated` events if all conditions are met', async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        await auctionHouse.connect(account1).createBid(
          FLUIDnftId,
          {value: RESERVE_PRICE, gasLimit: 1000000}
        );

        await ethers.provider.send('evm_increaseTime', [60 * 60 * 13]); // Add 13 hrs, auction is now over
        const tx = await auctionHouse.connect(account1).settleCurrentAndCreateNewAuction(overrides);

        const receipt = await tx.wait();
        const { timestamp } = await ethers.provider.getBlock(receipt.blockHash);

        const settledEvent = receipt.events?.find(e => e.event === 'AuctionSettled');
        const createdEvent = receipt.events?.find(e => e.event === 'AuctionCreated');

        expect(settledEvent?.args?.FLUIDnftId).to.equal(FLUIDnftId);
        expect(settledEvent?.args?.winner).to.equal(account1.address);
        expect(settledEvent?.args?.amount).to.equal(RESERVE_PRICE);

        expect(createdEvent?.args?.FLUIDnftId).to.equal(FLUIDnftId.add(1));
        expect(createdEvent?.args?.startTime).to.equal(timestamp);
        expect(createdEvent?.args?.endTime).to.equal(timestamp + DURATION);
      });
      it("Should correctly transfer ERC20 & 721 on auction close", async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        const { FLUIDnftId } = await auctionHouse.auction();
        await auctionHouse.connect(account1).createBid(
          FLUIDnftId,
          {value: RESERVE_PRICE, gasLimit: 1000000}
        );

        await ethers.provider.send('evm_increaseTime', [60 * 60 * 13]); // Add 13 hrs, auction is now over
        const tx = await auctionHouse.connect(account1).settleCurrentAndCreateNewAuction(overrides);

        const acc1TokenBalance = await fluidtoken.balanceOf(account1.address);
        const acc1NFTBalance = await fluidnft.balanceOf(account1.address);
        const nftOwner = await fluidnft.ownerOf(FLUIDnftId);
        expect(acc1TokenBalance).to.equal(fromETHNumber(1));
        expect(acc1NFTBalance).to.equal(1);
        expect(nftOwner).to.equal(account1.address);
      });
      it("Should mint every 10th to DAO and auction the 11th", async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        // Auction off 9 
        for (let i=0; i<9; i++) {
          let { FLUIDnftId } = await auctionHouse.auction();
          await auctionHouse.connect(account1).createBid(
            FLUIDnftId,
            {value: RESERVE_PRICE, gasLimit: 1000000}
          );
          await ethers.provider.send('evm_increaseTime', [60 * 60 * 13]); // Add 13 hrs, auction is now over
          const tx = await auctionHouse.connect(account1).settleCurrentAndCreateNewAuction(overrides);
        }

        // we should now be on tokenId 91 with DAO holding #90
        const supply = await fluidnft.totalSupply();
        const nftOwner = await fluidnft.ownerOf(89);
        const nftOwnedByDao = await fluidnft.ownerOf(90);
        const acc1TokenBalance = await fluidtoken.balanceOf(account1.address);
        const daoTokenBalance = await fluidtoken.balanceOf(dao.address);
        const daoNFTBalance = await fluidnft.balanceOf(dao.address);
        // Mints 11 as 9 minted to acc1, 1 to dao, and 1 to auctionHouse for the new auction
        expect(supply).to.equal(initialMintAmount + 11);
        expect(nftOwner).to.equal(account1.address);
        expect(nftOwnedByDao).to.equal(dao.address);
        expect(daoNFTBalance).to.equal(initialMintAmount + 1);
        expect(acc1TokenBalance).to.equal(fromETHNumber(9));
        expect(daoTokenBalance).to.equal(fromETHNumber(initialMintAmount + 1));
      });
      it("Should decrease FLUID every 200th token", async () => {
        await (await auctionHouse.unpause(overrides)).wait();

        // As supply is already 80 and we're going to 200, we only need to mint 120
        // Which means if we auction 12 * 9 = 108, we'll actually mint 120
        for (let i = 0; i < 108; i++) {
          let { FLUIDnftId } = await auctionHouse.auction();
          await auctionHouse.connect(account1).createBid(
            FLUIDnftId,
            { value: RESERVE_PRICE, gasLimit: 1000000 }
          );
          await ethers.provider.send('evm_increaseTime', [60 * 60 * 13]); // Add 13 hrs, auction is now over
          await auctionHouse.connect(account1).settleCurrentAndCreateNewAuction(overrides);
        }

        // now acc2 will bid and win a fluid NFT with the new reward rate
        let { FLUIDnftId } = await auctionHouse.auction();
        await auctionHouse.connect(account2).createBid(
          FLUIDnftId,
          { value: RESERVE_PRICE, gasLimit: 1000000 }
        );
        await ethers.provider.send('evm_increaseTime', [60 * 60 * 13]); // Add 13 hrs, auction is now over
        await auctionHouse.connect(account2).settleCurrentAndCreateNewAuction(overrides);

        const supply = await fluidnft.totalSupply();
        const acc1TokenBalance = await fluidtoken.balanceOf(account1.address);
        const acc2TokenBalance = await fluidtoken.balanceOf(account2.address);
        const daoTokenBalance = await fluidtoken.balanceOf(dao.address);
        expect(supply).to.equal(202); // on 201 as we are auctioning off token 202, 201 won by acc2
        // Dao will hold 80 initial fluid + 11 fluid from 90,100, ... 190 + 0.9 fluid from 200
        expect(daoTokenBalance).to.equal(fromETHNumber(80 + 11 + 0.9));
        // acc1 will hold 108 fluid (1 from each auction)
        expect(acc1TokenBalance).to.equal(fromETHNumber(108));
        expect(acc2TokenBalance).to.equal(fromETHNumber(0.9));
      });
    });

    describe("Staking Rewards", () => {
      it("Should be able to update reward rate", async () =>  {
        expect(await stakingRewards.rewardRate()).to.equal(100);
        await expect(
          stakingRewards.connect(deployer).updateRewardRate(100, overrides)
        ).to.be.reverted;
        await stakingRewards.connect(deployer).updateRewardRate(69, overrides);
        expect(await stakingRewards.rewardRate()).to.equal(69);
        await expect(
          stakingRewards.connect(dao).updateRewardRate(500, overrides)
        ).to.be.reverted;
      });
      it("Should accurately update balances on stake/withdraw for no fee transfer address", async () => {
        const amount = initialMintAmountInEth.div(4);
        
        // stake 1/4 of balance at start
        await stakingRewards.connect(dao).stake(amount, overrides);
        expect(await (await fluidtoken.balanceOf(dao.address))).to.equal(initialMintAmountInEth.sub(amount));
        expect(await stakingRewards.balanceOf(dao.address)).to.equal(amount);

        // stake remaining balance
        await stakingRewards.connect(dao).stake(amount.mul(3), overrides);
        const stakedBalance = await stakingRewards.balanceOf(dao.address);
        expect(stakedBalance).to.equal(amount.mul(4));
        expect(await fluidtoken.balanceOf(stakingRewards.address)).to.equal(amount.mul(4));
        expect(await fluidtoken.balanceOf(dao.address)).to.equal(0);
        
        await stakingRewards.connect(dao).withdraw(stakedBalance, overrides);
        expect(await fluidtoken.balanceOf(stakingRewards.address)).to.equal(0);
        expect(await fluidtoken.balanceOf(dao.address)).to.equal(stakedBalance);
      });
      it("Should accurately update balances on stake/withdraw for fee transfer address", async () => {
        const amount = initialMintAmountInEth.div(4);
        const fee = amount.div(250);
        const amountAfterFee = amount.sub(fee);

        // First unapprove dao so that it pays for transfer fees
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);

        // stake 1/4 of balance at start
        await stakingRewards.connect(dao).stake(amount, overrides);
        expect(await (await fluidtoken.balanceOf(dao.address))).to.equal(initialMintAmountInEth.sub(amount));
        expect(await stakingRewards.balanceOf(dao.address)).to.equal(amountAfterFee);

        // stake remaining balance
        await stakingRewards.connect(dao).stake(amount.mul(3), overrides);
        const stakedBalance = await stakingRewards.balanceOf(dao.address);
        expect(stakedBalance).to.equal(amountAfterFee.mul(4));
        expect(await fluidtoken.balanceOf(stakingRewards.address)).to.equal(amountAfterFee.mul(4));
        expect(await fluidtoken.balanceOf(dao.address)).to.equal(0);

        const feeForWithdrawal = stakedBalance.div(250);
        const amountAfterWithdrawalfee = stakedBalance.sub(feeForWithdrawal);

        await stakingRewards.connect(dao).withdraw(stakedBalance, overrides);
        expect(await fluidtoken.balanceOf(stakingRewards.address)).to.equal(0);
        expect(await fluidtoken.balanceOf(dao.address)).to.equal(amountAfterWithdrawalfee);
      });

      it("Should revert if rewards exceed locked supply", async () => {
        await stakingRewards.connect(dao).stake(initialMintAmountInEth, overrides);
        // fast-fwd a little bit
        await passHours(1);
        await expect(
          stakingRewards.connect(dao).getReward(overrides)
        ).to.be.revertedWith("reward would draw from locked supply");
      });
      it("Should succeed in getReward()", async () => {
        const dayInSeconds = 60*60 * 24;
        const rewardInDay = dayInSeconds * 100; // as rewardRate is 100
        const rewardAfterFee = rewardInDay - (rewardInDay / 250);
        const amount = initialMintAmountInEth.div(4);
        const amountAfterFee = amount.sub(amount.div(250));
        // unapprove dao so it pays fee on transfer
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);
        
        // pre-fund staking contract to give rewards
        await fluidtoken.connect(dao).transfer(stakingRewards.address, amount, overrides);

        let tx = await stakingRewards.connect(dao).stake(amount, overrides);
        let txBlockTime = (
          await ethers.provider.getBlock((await tx.wait()).blockNumber)
        ).timestamp;
        
        await setNextBlockTimestamp(txBlockTime + dayInSeconds);
        
        tx = await stakingRewards.connect(dao).getReward(overrides);
        let newTxBlockTime = (
          await ethers.provider.getBlock((await tx.wait()).blockNumber)
        ).timestamp;
        expect(newTxBlockTime).to.equal(txBlockTime + dayInSeconds);

        // balance of pool should be staked + prefund (amount*2) - reward claimed
        expect(
          toETHNumber(await fluidtoken.balanceOf(stakingRewards.address))
        ).to.equal(
          toETHNumber(amountAfterFee.mul(2).sub(rewardInDay))
        );

        // dao has sent half of fluid to rewards contract (25% as stake, 25% as rewards)
        expect(
          toETHNumber(initialMintAmountInEth.div(2).add(rewardAfterFee))
          ).to.equal(
          toETHNumber(await fluidtoken.balanceOf(dao.address))
        );
      });
      it("Should succeed in exit()", async () => {
        const dayInSeconds = 60 * 60 * 24;
        const rewardInDay = dayInSeconds * 100; // as rewardRate is 100
        const rewardAfterFee = rewardInDay - (rewardInDay / 250);
        const amount = initialMintAmountInEth.div(4);
        const amountAfterFee = amount.sub(amount.div(250));
        // unapprove dao so it pays fee on transfer
        await fluidtoken.setNoFeeOnTransfer(dao.address, false, overrides);
        // pre-fund staking contract to give rewards
        await fluidtoken.connect(dao).transfer(stakingRewards.address, amount, overrides);

        let tx = await stakingRewards.connect(dao).stake(amount, overrides);
        let txBlockTime = (
          await ethers.provider.getBlock((await tx.wait()).blockNumber)
        ).timestamp;

        await setNextBlockTimestamp(txBlockTime + dayInSeconds);

        tx = await stakingRewards.connect(dao).exit(overrides);

        // balance of pool should be prefund amount - reward claimed
        // NOTE: need to round from 10**18 precision
        expect(
          toETHNumber(await fluidtoken.balanceOf(stakingRewards.address))
        ).to.be.closeTo(
          toETHNumber(amountAfterFee.sub(rewardInDay)),
          1e-18
        );

        // dao has claimed back their stake, which accrues a fee on amountAfterFee
        // Since they deposited 50% of total balance, add back amount deposited but include another fee
        const amountAfterFeeWithdrawal = amountAfterFee.sub(amountAfterFee.div(250));
        expect(
          toETHNumber(initialMintAmountInEth.div(2).add(rewardAfterFee).add(amountAfterFeeWithdrawal))
          ).to.equal(
          toETHNumber(await fluidtoken.balanceOf(dao.address))
        );
      });
    });
  });
};

setup().then(() => {
  run();
});