// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {OuroToken} from "src/OuroToken.sol";
import {MockDexRouter, MockDexFactory, MockWETH} from "./mocks/MockDex.sol";

/// @notice End-to-end walk of the reworked loop: launch (creation fee → dev) →
///         trade (dev fee + fees become liquidity + fees stream to holders) →
///         holder claims by just holding, no staking.
contract IntegrationTest is Test {
    Launchpad internal launchpad;

    address internal dev = address(0xDE0);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant CREATION_FEE = 0.01 ether;
    uint256 internal constant DEV_BPS = 50;

    function setUp() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 30 ether,
            devFeeBps: DEV_BPS,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 400 ether,
            maxBuyBps: 0,
            postGradTaxBps: 0
        });
        MockDexRouter router = new MockDexRouter(address(new MockDexFactory()), address(new MockWETH()));
        launchpad = new Launchpad(address(this), dev, address(router), CREATION_FEE, p);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function testFullLoop() public {
        uint256 devStart = dev.balance;

        // 1. Launch — creation fee goes to the developer wallet.
        (address t, address c) = launchpad.createToken{value: CREATION_FEE}("Loop Coin", "LOOP", "ipfs://x", 0);
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));
        assertEq(dev.balance - devStart, CREATION_FEE);

        // 2. Alice buys and becomes a holder (no staking needed to earn).
        vm.prank(alice);
        curve.buy{value: 50 ether}(0);
        assertGt(token.balanceOf(alice), 0);
        assertGt(curve.realNativeRaised(), 0); // liquidity deepened

        uint256 devAfterAlice = dev.balance;
        assertEq(devAfterAlice - devStart, CREATION_FEE + (50 ether * DEV_BPS) / 10_000);

        // 3. Bob trades; his dev fee goes to the dev, his holder fee accrues to holders.
        vm.prank(bob);
        curve.buy{value: 20 ether}(0);
        assertEq(dev.balance - devAfterAlice, (20 ether * DEV_BPS) / 10_000);
        assertGt(token.claimableRewardOf(alice), 0);

        // 4. Alice claims her fee share in native coin — just by holding.
        uint256 before = alice.balance;
        vm.prank(alice);
        token.claim();
        assertGt(alice.balance, before);
        assertEq(token.claimableRewardOf(alice), 0);
    }

    receive() external payable {}
}
