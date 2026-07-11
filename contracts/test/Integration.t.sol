// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {HolderRewards} from "src/HolderRewards.sol";
import {OuroToken} from "src/OuroToken.sol";

/// @notice End-to-end walk of the Ouroboros loop: launch -> trade -> fees become
///         liquidity + rewards -> holder stakes -> holder claims.
contract IntegrationTest is Test {
    Launchpad internal launchpad;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 30 ether,
            feeBps: 100,
            liqShareBps: 6000,
            graduationTarget: 400 ether
        });
        launchpad = new Launchpad(address(this), p);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function testFullLoop() public {
        (address t, address c, address r) = launchpad.createToken("Loop Coin", "LOOP", "ipfs://x");
        OuroToken token = OuroToken(t);
        BondingCurve curve = BondingCurve(payable(c));
        HolderRewards rewards = HolderRewards(payable(r));

        // 1. Alice buys and becomes a holder.
        vm.startPrank(alice);
        curve.buy{value: 50 ether}(0);
        uint256 aliceTokens = token.balanceOf(alice);
        assertGt(aliceTokens, 0);

        // 2. Alice stakes to join the rewards side of the loop.
        token.approve(address(rewards), aliceTokens);
        rewards.stake(aliceTokens);
        vm.stopPrank();

        // Liquidity deepened: real native retained by the curve exceeds the virtual seed.
        assertGt(curve.realNativeRaised(), 0);

        // 3. Bob trades; his fee streams to the rewards vault and accrues to Alice.
        uint256 rewardsBalBefore = address(rewards).balance;
        vm.prank(bob);
        curve.buy{value: 20 ether}(0);
        assertGt(address(rewards).balance, rewardsBalBefore);
        assertGt(rewards.earned(alice), 0);

        // 4. Alice claims her share of the fees in native coin.
        uint256 before = alice.balance;
        vm.prank(alice);
        rewards.claim();
        assertGt(alice.balance, before);
        assertEq(rewards.earned(alice), 0);
    }

    receive() external payable {}
}
