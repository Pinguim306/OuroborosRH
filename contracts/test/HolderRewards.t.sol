// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HolderRewards} from "src/HolderRewards.sol";
import {OuroToken} from "src/OuroToken.sol";

contract HolderRewardsTest is Test {
    OuroToken internal token;
    HolderRewards internal rewards;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant WAD = 1e18;

    function setUp() public {
        // Mint a supply to this test contract, then hand tokens to stakers.
        token = new OuroToken("Loop", "LOOP", 1_000_000 ether, address(this), "");
        rewards = new HolderRewards(address(token));
        token.transfer(alice, 1000 ether);
        token.transfer(bob, 1000 ether);
    }

    function _stake(address who, uint256 amount) internal {
        vm.startPrank(who);
        token.approve(address(rewards), amount);
        rewards.stake(amount);
        vm.stopPrank();
    }

    function testEqualStakersSplitEqually() public {
        _stake(alice, 100 ether);
        _stake(bob, 100 ether);

        rewards.fund{value: 90 ether}();

        assertApproxEqAbs(rewards.earned(alice), 45 ether, 1e6);
        assertApproxEqAbs(rewards.earned(bob), 45 ether, 1e6);
    }

    function testPendingRewardsFlushToFirstStaker() public {
        // Fees arrive before anyone stakes -> held as pending.
        rewards.fund{value: 50 ether}();
        assertEq(rewards.pendingRewards(), 50 ether);

        _stake(alice, 100 ether);
        // On the first stake, pending is flushed to the (only) staker.
        assertApproxEqAbs(rewards.earned(alice), 50 ether, 1e6);
        assertEq(rewards.pendingRewards(), 0);
    }

    function testLoyaltyMultiplierRamps() public {
        _stake(alice, 100 ether);
        assertEq(rewards.loyaltyMultiplier(alice), 1e18); // 1.0x at t0

        vm.warp(block.timestamp + 45 days);
        assertApproxEqAbs(rewards.loyaltyMultiplier(alice), 2e18, 1e12); // ~2.0x at half ramp

        vm.warp(block.timestamp + 45 days);
        assertEq(rewards.loyaltyMultiplier(alice), 3e18); // 3.0x at full ramp

        vm.warp(block.timestamp + 365 days);
        assertEq(rewards.loyaltyMultiplier(alice), 3e18); // capped
    }

    function testLoyaltyBoostIncreasesShareOfRewards() public {
        _stake(alice, 100 ether); // alice at t0

        vm.warp(block.timestamp + 90 days); // alice's loyalty ramps to 3.0x
        _stake(bob, 100 ether); // bob just joined -> 1.0x

        // Alice pokes to realize her grown multiplier (Curve-gauge style checkpoint).
        rewards.poke(alice);

        rewards.fund{value: 100 ether}();

        // boosted: alice 300, bob 100 -> alice takes 3/4, bob 1/4.
        assertApproxEqAbs(rewards.earned(alice), 75 ether, 1e9);
        assertApproxEqAbs(rewards.earned(bob), 25 ether, 1e9);
    }

    function testWithdrawResetsLoyalty() public {
        _stake(alice, 100 ether);
        vm.warp(block.timestamp + 90 days);
        rewards.poke(alice);
        assertEq(rewards.loyaltyMultiplier(alice), 3e18);

        vm.startPrank(alice);
        rewards.withdraw(50 ether);
        vm.stopPrank();

        // Loyalty streak reset -> multiplier back to 1.0x, boost recomputed at 1x.
        assertEq(rewards.loyaltyMultiplier(alice), 1e18);
        (, uint256 boosted,,,) = rewards.accounts(alice);
        assertEq(boosted, 50 ether); // 50 remaining * 1.0x
    }

    function testClaimPaysNative() public {
        _stake(alice, 100 ether);
        rewards.fund{value: 30 ether}();

        uint256 before = alice.balance;
        vm.prank(alice);
        rewards.claim();
        assertApproxEqAbs(alice.balance - before, 30 ether, 1e6);
        assertEq(rewards.earned(alice), 0);
    }

    function testTimeWeightingAcrossInflows() public {
        // Alice present for two inflows, bob only the second -> alice earns more.
        _stake(alice, 100 ether);
        rewards.fund{value: 40 ether}(); // alice alone: +40

        _stake(bob, 100 ether);
        rewards.fund{value: 40 ether}(); // split: +20 each

        assertApproxEqAbs(rewards.earned(alice), 60 ether, 1e6);
        assertApproxEqAbs(rewards.earned(bob), 20 ether, 1e6);
    }

    receive() external payable {}
}
