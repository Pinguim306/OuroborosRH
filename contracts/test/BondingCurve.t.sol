// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {HolderRewards} from "src/HolderRewards.sol";
import {OuroToken} from "src/OuroToken.sol";
import {IERC20} from "src/interfaces/IERC20.sol";

contract BondingCurveTest is Test {
    Launchpad internal launchpad;

    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint256 internal constant VIRTUAL = 30 ether;
    uint256 internal constant FEE_BPS = 100; // 1%
    uint256 internal constant LIQ_BPS = 6000; // 60% of fee -> liquidity
    uint256 internal constant TARGET = 400 ether;

    function setUp() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            feeBps: FEE_BPS,
            liqShareBps: LIQ_BPS,
            graduationTarget: TARGET
        });
        launchpad = new Launchpad(address(this), p);
    }

    function _launch() internal returns (OuroToken token, BondingCurve curve, HolderRewards rewards) {
        (address t, address c, address r) = launchpad.createToken("Doge Loop", "DLOOP", "ipfs://meta");
        return (OuroToken(t), BondingCurve(payable(c)), HolderRewards(payable(r)));
    }

    function testLaunchWiring() public {
        (OuroToken token, BondingCurve curve, HolderRewards rewards) = _launch();
        // Entire supply sits on the curve, ready to sell.
        assertEq(token.balanceOf(address(curve)), SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(address(curve.rewards()), address(rewards));
        assertEq(curve.tokenReserve(), SUPPLY);
        assertEq(curve.nativeReserve(), VIRTUAL);
        assertEq(curve.realNativeRaised(), 0);
    }

    function testBuySplitsFeeIntoLiquidityAndRewards() public {
        (OuroToken token, BondingCurve curve, HolderRewards rewards) = _launch();

        uint256 spend = 10 ether;
        uint256 fee = (spend * FEE_BPS) / 10_000; // 0.1
        uint256 liqPart = (fee * LIQ_BPS) / 10_000; // 0.06
        uint256 rewardPart = fee - liqPart; // 0.04
        uint256 netIn = spend - fee; // 9.9

        uint256 tokensOut = curve.buy{value: spend}(0);

        assertEq(token.balanceOf(address(this)), tokensOut);
        // Real native retained = swap input + liquidity share of the fee.
        assertEq(curve.realNativeRaised(), netIn + liqPart);
        assertEq(curve.nativeReserve(), VIRTUAL + netIn + liqPart);
        // Reward share was streamed to the rewards vault (pending, no stakers yet).
        assertEq(address(rewards).balance, rewardPart);
        assertEq(rewards.pendingRewards(), rewardPart);
        // The curve holds exactly the real native it accounts for.
        assertEq(address(curve).balance, curve.realNativeRaised());
    }

    function testPriceRisesAfterBuy() public {
        (, BondingCurve curve,) = _launch();
        uint256 p0 = curve.currentPrice();
        curve.buy{value: 5 ether}(0);
        uint256 p1 = curve.currentPrice();
        assertGt(p1, p0);
    }

    function testBuySellRoundTripLosesOnlyFees() public {
        (OuroToken token, BondingCurve curve,) = _launch();

        uint256 spend = 20 ether;
        uint256 tokensOut = curve.buy{value: spend}(0);

        uint256 balBefore = address(this).balance;
        token.approve(address(curve), tokensOut);
        uint256 nativeOut = curve.sell(tokensOut, 0);

        // Selling everything back returns less than spent (two fees + curve rounding),
        // but a meaningful majority of it.
        assertLt(nativeOut, spend);
        assertGt(nativeOut, (spend * 90) / 100);
        assertEq(address(this).balance, balBefore + nativeOut);
    }

    function testSlippageGuards() public {
        (, BondingCurve curve,) = _launch();
        vm.expectRevert(BondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(type(uint256).max);
    }

    function testGraduationLocksTrading() public {
        // Fresh launchpad with a tiny target so one buy graduates it.
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: VIRTUAL,
            feeBps: FEE_BPS,
            liqShareBps: LIQ_BPS,
            graduationTarget: 5 ether
        });
        Launchpad lp = new Launchpad(address(this), p);
        (, address c,) = lp.createToken("Grad", "GRAD", "");
        BondingCurve curve = BondingCurve(payable(c));

        assertFalse(curve.graduated());
        curve.buy{value: 10 ether}(0);
        assertTrue(curve.graduated());

        vm.expectRevert(BondingCurve.AlreadyGraduated.selector);
        curve.buy{value: 1 ether}(0);
    }

    receive() external payable {}
}
