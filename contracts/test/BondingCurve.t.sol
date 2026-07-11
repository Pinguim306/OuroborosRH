// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {OuroToken} from "src/OuroToken.sol";
import {MockDexRouter, MockDexFactory, MockWETH} from "./mocks/MockDex.sol";

contract BondingCurveTest is Test {
    Launchpad internal launchpad;
    MockDexRouter internal router;

    address internal dev = address(0xDE0);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint256 internal constant VIRTUAL = 30 ether;
    uint256 internal constant DEV_BPS = 50; // 0.5%
    uint256 internal constant LIQ_BPS = 60; // 0.6%
    uint256 internal constant HOLDER_BPS = 40; // 0.4%
    uint256 internal constant TARGET = 400 ether;
    uint256 internal constant CREATION_FEE = 0.01 ether;

    function setUp() public {
        router = new MockDexRouter(address(new MockDexFactory()), address(new MockWETH()));
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            devFeeBps: DEV_BPS,
            liqFeeBps: LIQ_BPS,
            holderFeeBps: HOLDER_BPS,
            graduationTarget: TARGET
        });
        launchpad = new Launchpad(address(this), dev, address(router), CREATION_FEE, p);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _launch() internal returns (OuroToken token, BondingCurve curve) {
        (address t, address c) = launchpad.createToken{value: CREATION_FEE}("Doge Loop", "DLOOP", "ipfs://meta");
        return (OuroToken(payable(t)), BondingCurve(payable(c)));
    }

    function testLaunchWiring() public {
        (OuroToken token, BondingCurve curve) = _launch();
        assertEq(token.balanceOf(address(curve)), SUPPLY);
        assertTrue(token.isExcludedFromDividends(address(curve)));
        assertEq(token.dividendSupply(), 0);
        assertEq(token.authority(), address(curve)); // curve-scoped authority (M2)
        assertEq(curve.tokenReserve(), SUPPLY);
        assertEq(curve.nativeReserve(), VIRTUAL);
        assertEq(curve.totalFeeBps(), DEV_BPS + LIQ_BPS + HOLDER_BPS);
    }

    function testCreationFeeGoesToDev() public {
        uint256 before = dev.balance;
        _launch();
        assertEq(dev.balance - before, CREATION_FEE);
    }

    function testCreationFeeRefundsExcess() public {
        uint256 before = address(this).balance;
        launchpad.createToken{value: 1 ether}("X", "X", "");
        // Only the creation fee is kept; the rest is refunded.
        assertEq(before - address(this).balance, CREATION_FEE);
    }

    function testCreationFeeRequired() public {
        vm.expectRevert(Launchpad.InsufficientCreationFee.selector);
        launchpad.createToken{value: CREATION_FEE - 1}("X", "X", "");
    }

    function testBuyRoutesThreeWayFee() public {
        (OuroToken token, BondingCurve curve) = _launch();

        uint256 spend = 10 ether;
        uint256 devPart = (spend * DEV_BPS) / 10_000; // 0.05
        uint256 liqPart = (spend * LIQ_BPS) / 10_000; // 0.06
        uint256 holderPart = (spend * HOLDER_BPS) / 10_000; // 0.04
        uint256 netIn = spend - devPart - liqPart - holderPart;

        uint256 devBefore = dev.balance;
        vm.prank(alice);
        uint256 tokensOut = curve.buy{value: spend}(0);

        assertEq(token.balanceOf(alice), tokensOut);
        assertEq(dev.balance - devBefore, devPart); // dev fee paid
        assertEq(curve.realNativeRaised(), netIn + liqPart); // liquidity retained
        assertEq(token.totalRewardsDistributed(), holderPart); // streamed to holders
        // Alice is the only holder, so she can claim ~the holder fee — with no staking.
        assertApproxEqAbs(token.claimableRewardOf(alice), holderPart, 1e6);
    }

    function testHoldersClaimProportionallyNoStake() public {
        (OuroToken token, BondingCurve curve) = _launch();

        // Alice buys, then Bob buys. Bob's holder-fee is split between both by balance.
        vm.prank(alice);
        curve.buy{value: 10 ether}(0);
        uint256 aliceClaimAfterOwnBuy = token.claimableRewardOf(alice);

        vm.prank(bob);
        curve.buy{value: 10 ether}(0);

        // Both now have claimable native, no staking involved.
        assertGt(token.claimableRewardOf(alice), aliceClaimAfterOwnBuy);
        assertGt(token.claimableRewardOf(bob), 0);

        // Alice claims to her wallet.
        uint256 before = alice.balance;
        uint256 owed = token.claimableRewardOf(alice);
        vm.prank(alice);
        token.claim();
        assertApproxEqAbs(alice.balance - before, owed, 1e6);
        assertEq(token.claimableRewardOf(alice), 0);
    }

    function testPriceRisesAfterBuy() public {
        (, BondingCurve curve) = _launch();
        uint256 p0 = curve.currentPrice();
        vm.prank(alice);
        curve.buy{value: 5 ether}(0);
        assertGt(curve.currentPrice(), p0);
    }

    function testBuySellRoundTripLosesOnlyFees() public {
        (OuroToken token, BondingCurve curve) = _launch();
        uint256 spend = 20 ether;
        vm.startPrank(alice);
        uint256 tokensOut = curve.buy{value: spend}(0);
        uint256 balBefore = alice.balance;
        token.approve(address(curve), tokensOut);
        uint256 nativeOut = curve.sell(tokensOut, 0);
        vm.stopPrank();
        assertLt(nativeOut, spend);
        assertGt(nativeOut, (spend * 90) / 100);
        assertEq(alice.balance, balBefore + nativeOut);
    }

    function testSlippageGuard() public {
        (, BondingCurve curve) = _launch();
        vm.prank(alice);
        vm.expectRevert(BondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(type(uint256).max);
    }

    function testGraduationMigratesLiquidityToDex() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            devFeeBps: DEV_BPS,
            liqFeeBps: LIQ_BPS,
            holderFeeBps: HOLDER_BPS,
            graduationTarget: 5 ether
        });
        Launchpad lp = new Launchpad(address(this), dev, address(router), 0, p);
        (address t, address c) = lp.createToken("Grad", "GRAD", "");
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));

        assertFalse(curve.graduated());
        vm.prank(alice);
        curve.buy{value: 10 ether}(0); // crosses the 5 ETH target -> graduates

        assertTrue(curve.graduated());
        address pair = curve.pair();
        assertTrue(pair != address(0));
        assertTrue(token.isExcludedFromDividends(pair)); // pooled liquidity earns no dividends
        assertGt(token.balanceOf(pair), 0); // remaining tokens migrated to the pair
        assertEq(curve.tokenReserve(), 0);
        assertEq(curve.realNativeRaised(), 0);
        assertEq(address(curve).balance, 0); // all real ETH migrated
        assertEq(token.authority(), address(0)); // curve renounced after excluding the pair

        // Curve trading is locked; trading now happens on the DEX pair.
        vm.prank(alice);
        vm.expectRevert(BondingCurve.AlreadyGraduated.selector);
        curve.buy{value: 1 ether}(0);
    }

    receive() external payable {}
}
