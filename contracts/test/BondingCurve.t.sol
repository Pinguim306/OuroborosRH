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
            graduationTarget: TARGET,
            maxBuyBps: 0,
            postGradTaxBps: 0
        });
        launchpad = new Launchpad(address(this), dev, address(router), CREATION_FEE, p);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _launch() internal returns (OuroToken token, BondingCurve curve) {
        (address t, address c) = launchpad.createToken{value: CREATION_FEE}("Doge Loop", "DLOOP", "ipfs://meta", 0);
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
        launchpad.createToken{value: 1 ether}("X", "X", "", 0);
        // Only the creation fee is kept; the rest is refunded.
        assertEq(before - address(this).balance, CREATION_FEE);
    }

    function testCreationFeeRequired() public {
        vm.expectRevert(Launchpad.InsufficientCreationFee.selector);
        launchpad.createToken{value: CREATION_FEE - 1}("X", "X", "", 0);
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
            graduationTarget: 5 ether,
            maxBuyBps: 0,
            postGradTaxBps: 0
        });
        Launchpad lp = new Launchpad(address(this), dev, address(router), 0, p);
        (address t, address c) = lp.createToken("Grad", "GRAD", "", 0);
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

    function testGraduationSurvivesRouterRefund() public {
        // Simulates the griefing scenario: the pair pre-exists at a skewed ratio, so
        // the real router only uses part of the amounts and refunds excess ETH.
        // Graduation must succeed, and leftovers must be swept (ETH -> holders as
        // rewards, tokens -> burned to DEAD and excluded from dividends).
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            devFeeBps: DEV_BPS,
            liqFeeBps: LIQ_BPS,
            holderFeeBps: HOLDER_BPS,
            graduationTarget: 5 ether,
            maxBuyBps: 0,
            postGradTaxBps: 0
        });
        Launchpad lp = new Launchpad(address(this), dev, address(router), 0, p);
        (address t, address c) = lp.createToken("Grief", "GRF", "", 0);
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));

        router.setRefundBps(2000); // router uses only 80%, refunds 20% of the ETH

        uint256 rewardsBefore = token.totalRewardsDistributed() + token.pendingRewards();
        vm.prank(alice);
        curve.buy{value: 10 ether}(0); // crosses the target -> graduates

        assertTrue(curve.graduated());
        assertEq(address(curve).balance, 0); // refund swept, nothing stranded
        assertEq(token.balanceOf(address(curve)), 0); // leftover tokens swept
        address dead = 0x000000000000000000000000000000000000dEaD;
        assertGt(token.balanceOf(dead), 0); // burned
        assertTrue(token.isExcludedFromDividends(dead)); // never dilutes holders
        // The refunded ETH became holder rewards instead of bricking the launch.
        assertGt(token.totalRewardsDistributed() + token.pendingRewards(), rewardsBefore);
        assertEq(token.authority(), address(0)); // still renounced at the end
    }

    function testCurveRejectsStrayNative() public {
        (, BondingCurve curve) = _launch();
        vm.prank(alice);
        (bool ok,) = address(curve).call{value: 1 ether}("");
        assertFalse(ok); // only the router may send plain ETH to the curve
    }

    function testMaxBuyCapEnforced() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            devFeeBps: DEV_BPS,
            liqFeeBps: LIQ_BPS,
            holderFeeBps: HOLDER_BPS,
            graduationTarget: TARGET,
            maxBuyBps: 200, // 2%
            postGradTaxBps: 0
        });
        Launchpad lp = new Launchpad(address(this), dev, address(router), 0, p);
        (address t, address c) = lp.createToken("Cap", "CAP", "", 0);
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));

        assertEq(curve.maxBuyTokens(), (SUPPLY * 200) / 10_000); // 2% of supply

        // A large buy would receive more than 2% of supply -> reverts.
        vm.prank(alice);
        vm.expectRevert(BondingCurve.MaxBuyExceeded.selector);
        curve.buy{value: 5 ether}(0);

        // A small buy stays under the cap and succeeds.
        vm.prank(alice);
        uint256 out = curve.buy{value: 0.1 ether}(0);
        assertLe(out, curve.maxBuyTokens());
        assertGt(out, 0);
        assertEq(token.balanceOf(alice), out);
    }

    // --------------------------------------------------------------------- //
    //  Dev buy                                                              //
    // --------------------------------------------------------------------- //

    function testDevBuyDeliversToCreatorAndPaysFee() public {
        uint256 devBuy = 5 ether;
        uint256 devBalBefore = dev.balance;

        (address t, address c) =
            launchpad.createToken{value: CREATION_FEE + devBuy}("Dev", "DEV", "", devBuy);
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));

        // Creator (this test contract) received the dev-bought tokens straight away.
        uint256 bal = token.balanceOf(address(this));
        assertGt(bal, 0);
        assertEq(curve.tokenReserve(), SUPPLY - bal);

        // Fee split applied on the dev buy, exactly like a normal buy.
        uint256 devPart = (devBuy * DEV_BPS) / 10_000;
        uint256 liqPart = (devBuy * LIQ_BPS) / 10_000;
        uint256 holderPart = (devBuy * HOLDER_BPS) / 10_000;
        uint256 netIn = devBuy - devPart - liqPart - holderPart;

        // Dev wallet got the creation fee plus the dev portion of the buy.
        assertEq(dev.balance - devBalBefore, CREATION_FEE + devPart);
        assertEq(curve.realNativeRaised(), netIn + liqPart);
        // The creator, as the only holder, accrued the holder-fee slice.
        assertApproxEqAbs(token.claimableRewardOf(address(this)), holderPart, 1e6);
    }

    function testDevBuyRespectsMaxBuyCap() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            devFeeBps: DEV_BPS,
            liqFeeBps: LIQ_BPS,
            holderFeeBps: HOLDER_BPS,
            graduationTarget: TARGET,
            maxBuyBps: 200, // 2%
            postGradTaxBps: 0
        });
        Launchpad lp = new Launchpad(address(this), dev, address(router), 0, p);

        // A dev buy large enough to exceed 2% of supply reverts the whole launch.
        vm.expectRevert(BondingCurve.MaxBuyExceeded.selector);
        lp.createToken{value: 5 ether}("Cap", "CAP", "", 5 ether);
    }

    function testDevBuyRequiresCreationFeePlusBuy() public {
        // msg.value must cover creationFee + devBuy.
        vm.expectRevert(Launchpad.InsufficientCreationFee.selector);
        launchpad.createToken{value: CREATION_FEE + 1 ether}("X", "X", "", 2 ether);
    }

    function testZeroDevBuyBehavesLikePlainLaunch() public {
        (address t, address c) = launchpad.createToken{value: CREATION_FEE}("Z", "Z", "", 0);
        OuroToken token = OuroToken(payable(t));
        BondingCurve curve = BondingCurve(payable(c));
        assertEq(curve.tokenReserve(), SUPPLY); // nothing bought
        assertEq(token.balanceOf(address(this)), 0);
    }

    receive() external payable {}
}

