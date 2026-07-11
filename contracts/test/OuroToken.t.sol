// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OuroToken} from "src/OuroToken.sol";

/// @notice Unit tests for the dividend token: holders earn by holding (no staking)
///         and claim native rewards proportional to balance.
contract OuroTokenTest is Test {
    OuroToken internal token;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        // Mint to this contract (auto-excluded), authority = this contract.
        token = new OuroToken("Loop", "LOOP", 1_000_000 ether, address(this), address(this), "");
    }

    function testEqualHoldersSplitEqually() public {
        token.transfer(alice, 100 ether);
        token.transfer(bob, 100 ether);
        token.distributeRewards{value: 90 ether}();
        assertApproxEqAbs(token.claimableRewardOf(alice), 45 ether, 1e6);
        assertApproxEqAbs(token.claimableRewardOf(bob), 45 ether, 1e6);
    }

    function testRewardsProportionalToBalance() public {
        token.transfer(alice, 100 ether);
        token.transfer(bob, 300 ether);
        token.distributeRewards{value: 100 ether}();
        assertApproxEqAbs(token.claimableRewardOf(alice), 25 ether, 1e6);
        assertApproxEqAbs(token.claimableRewardOf(bob), 75 ether, 1e6);
    }

    function testTransferMovesFutureRewardsNotPast() public {
        token.transfer(alice, 100 ether);
        token.distributeRewards{value: 50 ether}(); // alice earns 50
        assertApproxEqAbs(token.claimableRewardOf(alice), 50 ether, 1e6);

        vm.prank(alice);
        token.transfer(bob, 100 ether); // alice's past rewards stay with her

        token.distributeRewards{value: 50 ether}(); // now bob earns the new 50
        assertApproxEqAbs(token.claimableRewardOf(alice), 50 ether, 1e6);
        assertApproxEqAbs(token.claimableRewardOf(bob), 50 ether, 1e6);
    }

    function testClaimPaysNativeAndZeroesOut() public {
        token.transfer(alice, 100 ether);
        token.distributeRewards{value: 30 ether}();
        uint256 before = alice.balance;
        vm.prank(alice);
        token.claim();
        assertApproxEqAbs(alice.balance - before, 30 ether, 1e6);
        assertEq(token.claimableRewardOf(alice), 0);
    }

    function testExcludedAddressEarnsNothing() public {
        token.transfer(alice, 100 ether);
        token.transfer(bob, 100 ether);
        token.setExcludedFromDividends(bob, true); // bob removed from the base
        token.distributeRewards{value: 100 ether}();
        assertEq(token.claimableRewardOf(bob), 0);
        assertApproxEqAbs(token.claimableRewardOf(alice), 100 ether, 1e6);
    }

    function testPendingFlushesToFirstHolder() public {
        // No non-excluded holders yet -> rewards held as pending.
        token.distributeRewards{value: 40 ether}();
        assertEq(token.pendingRewards(), 40 ether);
        token.transfer(alice, 100 ether); // first holder enters -> pending flushes
        assertApproxEqAbs(token.claimableRewardOf(alice), 40 ether, 1e6);
        assertEq(token.pendingRewards(), 0);
    }

    function testCannotClaimWithNothing() public {
        vm.prank(alice);
        vm.expectRevert(OuroToken.NothingToClaim.selector);
        token.claim();
    }

    function testOnlyAuthorityCanExclude() public {
        vm.prank(alice);
        vm.expectRevert(OuroToken.NotAuthority.selector);
        token.setExcludedFromDividends(bob, true);
    }

    function testRenounceAuthorityLocksExclusions() public {
        token.renounceAuthority(); // this contract is the authority
        assertEq(token.authority(), address(0));
        vm.expectRevert(OuroToken.NotAuthority.selector);
        token.setExcludedFromDividends(alice, true);
    }

    function testClaimableClampsAfterReinclude() public {
        // L1: re-including a previously-withdrawn account must not underflow.
        token.transfer(alice, 100 ether);
        token.distributeRewards{value: 30 ether}();
        vm.prank(alice);
        token.claim(); // withdrawnRewards[alice] = 30

        token.setExcludedFromDividends(alice, true);
        token.setExcludedFromDividends(alice, false); // accumulative reset below withdrawn
        assertEq(token.claimableRewardOf(alice), 0); // clamped, no revert
    }

    receive() external payable {}
}
