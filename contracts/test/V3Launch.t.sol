// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {FeeLocker} from "src/FeeLocker.sol";
import {OuroToken} from "src/OuroToken.sol";
import {MockDexRouter, MockDexFactory, MockWETH} from "./mocks/MockDex.sol";
import {MockWETH9, MockV3Factory, MockV3Pool, MockPositionManager, MockSwapRouter02} from "./mocks/MockV3.sol";

/// @notice Wiring tests for the instant-V3 launch mode against V3 mocks. The real
///         tick/price math MUST additionally be validated with fork tests against the
///         live Uniswap V3 before deploying.
contract V3LaunchTest is Test {
    Launchpad internal launchpad;
    MockWETH9 internal weth;
    MockV3Factory internal v3factory;
    MockPositionManager internal npm;
    MockSwapRouter02 internal swapRouter;

    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address internal dev = address(0xDE0);
    address internal alice = address(0xA11CE);

    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint256 internal constant CREATION_FEE = 0.01 ether;
    uint24 internal constant FEE_TIER = 10000;

    receive() external payable {} // accept refunds

    function setUp() public {
        weth = new MockWETH9();
        v3factory = new MockV3Factory();
        npm = new MockPositionManager(address(v3factory), address(weth));
        swapRouter = new MockSwapRouter02();

        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: 1 ether,
            devFeeBps: 50,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 4 ether,
            maxBuyBps: 0,
            postGradTaxBps: 100
        });
        MockDexRouter v2router = new MockDexRouter(address(new MockDexFactory()), address(new MockWETH()));
        launchpad = new Launchpad(address(this), dev, address(v2router), CREATION_FEE, p);
        FeeLocker locker = new FeeLocker(address(npm), address(launchpad), address(weth), 4000);
        launchpad.setV3Config(address(npm), address(swapRouter), address(locker), _v3Params());

        vm.deal(alice, 100 ether);
    }

    function _v3Params() internal pure returns (Launchpad.V3Params memory) {
        return Launchpad.V3Params({
            feeTier: FEE_TIER,
            sqrtPriceX96Token0: 2505414483750479311864138,
            sqrtPriceX96Token1: 2505414483750479311864138015696063,
            tickLower0: -207200,
            tickUpper0: 887200,
            tickLower1: -887200,
            tickUpper1: 207200
        });
    }

    function _launchV3(uint256 devBuy) internal returns (OuroToken t, address pool) {
        (address tk, address pl) =
            launchpad.createTokenV3{value: CREATION_FEE + devBuy}("Viper", "VPR", "ipfs://v", devBuy, false);
        return (OuroToken(payable(tk)), pl);
    }

    function testV3LaunchWiring() public {
        (OuroToken t, address pool) = _launchV3(0);

        // Pool created + initialized at the configured price for the sort order.
        bool tokenIs0 = address(t) < address(weth);
        assertEq(v3factory.getPool(address(t), address(weth), FEE_TIER), pool);
        assertTrue(MockV3Pool(pool).initialized());
        assertEq(
            MockV3Pool(pool).sqrtPriceX96(),
            tokenIs0 ? _v3Params().sqrtPriceX96Token0 : _v3Params().sqrtPriceX96Token1
        );

        // Position minted single-sided to the FeeLocker with the right range.
        FeeLocker locker = launchpad.feeLocker();
        (address t0, address t1, int24 lo, int24 hi, uint256 a0, uint256 a1, address rcpt) = npm.minted(1);
        assertEq(rcpt, address(locker));
        assertEq(tokenIs0 ? t0 : t1, address(t));
        assertEq(tokenIs0 ? t1 : t0, address(weth));
        assertEq(lo, tokenIs0 ? int24(-207200) : int24(-887200));
        assertEq(hi, tokenIs0 ? int24(887200) : int24(207200));
        assertEq(tokenIs0 ? a0 : a1, SUPPLY - 1e18); // mock leaves 1e18 dust behind
        assertEq(tokenIs0 ? a1 : a0, 0); // single-sided: no ETH side

        // Locker registered the position.
        (address regToken, bool regIs0,) = locker.positions(1);
        assertEq(regToken, address(t));
        assertEq(regIs0, tokenIs0);

        // Dust burned to DEAD (excluded), pool + locker excluded, authority renounced.
        assertEq(t.balanceOf(DEAD), 1e18);
        assertTrue(t.isExcludedFromDividends(DEAD));
        assertTrue(t.isExcludedFromDividends(pool));
        assertTrue(t.isExcludedFromDividends(address(locker)));
        assertEq(t.authority(), address(0));
        assertEq(t.tradeTaxBps(), 0); // V3 mode: no fee-on-transfer (V3-incompatible)

        // Market recorded with the pool in the curve slot and flagged as V3.
        (, address curveSlot,,,,,) = launchpad.markets(0);
        assertEq(curveSlot, pool);
        assertTrue(launchpad.isV3Token(address(t)));
    }

    function testV3CreationFeeAndRefund() public {
        uint256 devBefore = dev.balance;
        uint256 meBefore = address(this).balance;
        launchpad.createTokenV3{value: CREATION_FEE + 1 ether}("X", "X", "", 0, false); // 1 ETH excess
        assertEq(dev.balance - devBefore, CREATION_FEE);
        assertEq(meBefore - address(this).balance, CREATION_FEE); // excess refunded
    }

    function testV3DevBuyIsFirstSwap() public {
        vm.prank(alice);
        (address tk,) = launchpad.createTokenV3{value: CREATION_FEE + 2 ether}("Y", "Y", "", 2 ether, false);

        assertEq(swapRouter.swapCount(), 1);
        assertEq(swapRouter.lastValue(), 2 ether);
        (address tokenIn, address tokenOut, uint24 fee, address rcpt, uint256 amountIn,,) = swapRouter.lastSwap();
        assertEq(tokenIn, address(weth));
        assertEq(tokenOut, tk);
        assertEq(fee, FEE_TIER);
        assertEq(rcpt, alice); // tokens land on the creator
        assertEq(amountIn, 2 ether);
    }

    function testV3RevertsWhenUnconfigured() public {
        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: SUPPLY,
            virtualNative: 1 ether,
            devFeeBps: 50,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 4 ether,
            maxBuyBps: 0,
            postGradTaxBps: 100
        });
        Launchpad fresh = new Launchpad(address(this), dev, address(1), CREATION_FEE, p);
        vm.expectRevert(Launchpad.V3NotConfigured.selector);
        fresh.createTokenV3{value: CREATION_FEE}("Z", "Z", "", 0, false);
    }

    function testCurveModeStillWorks() public {
        // Regression: the V2 bonding-curve path is untouched by the V3 config.
        (address tk, address curve) = launchpad.createToken{value: CREATION_FEE}("Loop", "LOOP", "", 0, false);
        assertFalse(launchpad.isV3Token(tk));
        assertEq(OuroToken(payable(tk)).balanceOf(curve), SUPPLY);
    }
}
