// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArcLaunchpad} from "src/ArcLaunchpad.sol";
import {ArcPoolLocker} from "src/ArcPoolLocker.sol";
import {ArcSwapRouter} from "src/ArcSwapRouter.sol";
import {OuroToken} from "src/OuroToken.sol";
import {MockUSDCFacade} from "./mocks/MockUSDCFacade.sol";
import {IUniswapV3Factory} from "src/interfaces/IUniswapV3.sol";
import {IUniswapV3PoolDirect, IUniswapV3SwapCallback} from "src/interfaces/IUniswapV3Direct.sol";

/// @notice The Arc V3 stack against the REAL DEX factory on a fork of Arc mainnet —
///         the factory (and every pool it deploys) runs the live bytecode our
///         launches will actually hit. Only the native-USDC facade is replaced
///         (vm.etch) with a storage-backed mock: the real facade is a system contract
///         whose native-moving transfers plain EVM cannot execute; the mock mirrors
///         credits into native pushes so harvest flows behave like the real chain.
///
///         Skips (passes vacuously) when ARC_RPC_URL is unset, so the default test
///         run stays offline. Run with:
///           ARC_RPC_URL=https://rpc.blockdaemon.mainnet.arc.io forge test -mc ArcV3Fork
contract ArcV3ForkTest is Test {
    // Live Arc addresses.
    address internal constant FACTORY = 0xf0db7b58379503491d857dB50AC9ece64c653918;
    address internal constant FACADE = 0x3600000000000000000000000000000000000000;

    // Launch economics (mirrors the live v4 deployment's choices).
    uint256 internal constant SUPPLY = 1_000_000_000 ether;
    uint256 internal constant CREATION_FEE = 1e6; // 1 USDC (facade units)
    uint256 internal constant HOLDER_SHARE_BPS = 6000; // 60% creator/holders, 40% protocol
    uint256 internal constant INTERFACE_FEE_BPS = 20; // 0.2% on the site's router
    uint24 internal constant FEE_TIER = 10000; // 1% — the protocol's take per swap

    ArcLaunchpad internal launchpad;
    ArcPoolLocker internal locker;
    ArcSwapRouter internal router;
    MockUSDCFacade internal usdc;

    address internal protocol;
    address internal creator;
    address internal buyer;

    bool internal hasFork;

    function setUp() public {
        protocol = makeAddr("protocol");
        creator = makeAddr("creator");
        buyer = makeAddr("buyer");

        string memory rpc = vm.envOr("ARC_RPC_URL", string(""));
        hasFork = bytes(rpc).length > 0;
        if (!hasFork) return;
        vm.createSelectFork(rpc);

        // Replace the facade system contract with the storage-backed mock and fund
        // its native reservoir for credit mirroring.
        vm.etch(FACADE, address(new MockUSDCFacade()).code);
        vm.deal(FACADE, 1e30);
        usdc = MockUSDCFacade(payable(FACADE));

        (launchpad, locker, router) = _deployStack();

        usdc.mint(creator, 1_000e6);
        usdc.mint(buyer, 1_000e6);
    }

    function _deployStack() internal returns (ArcLaunchpad lp, ArcPoolLocker lk, ArcSwapRouter rt) {
        lp = new ArcLaunchpad(address(this), FACTORY, FACADE, protocol, CREATION_FEE, SUPPLY);
        lk = new ArcPoolLocker(address(lp), FACADE, HOLDER_SHARE_BPS);
        rt = new ArcSwapRouter(address(this), FACTORY, FACADE, protocol, INTERFACE_FEE_BPS);
        lp.setV3Config(address(lk), _params());
    }

    /// @dev PrintArcV3Config output for TICK_UPPER1=400600 SPAN=69000 SUPPLY=1e27:
    ///      ~$4,009 opening mcap, 991.9x price span, both orientations.
    function _params() internal pure returns (ArcLaunchpad.V3Params memory) {
        return ArcLaunchpad.V3Params({
            feeTier: FEE_TIER,
            sqrtPriceX96Token0: 158633909751014158088,
            sqrtPriceX96Token1: 39569734776372747109332364130380419359,
            tickLower0: -400600,
            tickUpper0: -331600,
            tickLower1: 331600,
            tickUpper1: 400600,
            liquidity0: 2067899545654038417,
            liquidity1: 2067899545654152224
        });
    }

    function _launch(bool creatorFees) internal returns (address token, address pool) {
        vm.startPrank(creator);
        usdc.approve(address(launchpad), CREATION_FEE);
        (token, pool) = launchpad.createTokenV3("Fork Coil", "FORK", "ipfs://fork", 0, creatorFees);
        vm.stopPrank();
    }

    function _buy(address who, address token, uint256 usdcIn) internal returns (uint256 out) {
        vm.startPrank(who);
        usdc.approve(address(router), usdcIn);
        out = router.swapExactIn(token, FEE_TIER, true, usdcIn, 0, who, block.timestamp + 600);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ //
    //  Launch                                                            //
    // ------------------------------------------------------------------ //

    function test_LaunchOpensAtConfiguredPrice() public {
        if (!hasFork) return;
        (address token, address pool) = _launch(false);

        assertEq(IUniswapV3Factory(FACTORY).getPool(token, FACADE, FEE_TIER), pool, "pool from real factory");
        bool tokenIs0 = token < FACADE;
        (uint160 sqrtP, int24 tick,,,,,) = IUniswapV3PoolDirect(pool).slot0();
        ArcLaunchpad.V3Params memory p = _params();
        assertEq(sqrtP, tokenIs0 ? p.sqrtPriceX96Token0 : p.sqrtPriceX96Token1, "opening price");
        assertEq(tick, tokenIs0 ? p.tickLower0 : p.tickUpper1, "opening tick");
        // token1 orientation opens ON the range's upper boundary (out of range until
        // the first buy); token0 opens on the lower boundary, which IS in range.
        assertEq(
            IUniswapV3PoolDirect(pool).liquidity(),
            tokenIs0 ? p.liquidity0 : 0,
            "in-range liquidity at launch"
        );

        // The protocol got the creation fee; the launchpad kept nothing.
        assertEq(usdc.balanceOf(protocol), CREATION_FEE, "creation fee");
        assertEq(OuroToken(payable(token)).balanceOf(address(launchpad)), 0, "no supply left behind");

        // Market recorded for the frontend.
        assertEq(launchpad.marketsCount(), 1);
        assertTrue(launchpad.isV3Token(token));
    }

    /// @dev Opening market cap ≈ $4,009: supply divided by tokens-per-USDC at the
    ///      launch price. Asserted in the common token1 orientation (the dedicated
    ///      orientation test covers token0 via its buy-output check).
    function test_OpeningMcapIsFourK() public {
        if (!hasFork) return;
        (address token, address pool) = _launch(false);
        if (token < FACADE) return; // token0 roll — covered elsewhere
        (uint160 sqrtP,,,,,,) = IUniswapV3PoolDirect(pool).slot0();
        // (sqrtP / 2^96)^2 = token wei per facade unit; truncation is negligible at
        // this magnitude (~5e8 before squaring).
        uint256 root = uint256(sqrtP) >> 96;
        uint256 tokenWeiPerUsdcUnit = root * root;
        uint256 mcapUsd = SUPPLY / tokenWeiPerUsdcUnit / 1e6;
        assertApproxEqRel(mcapUsd, 4009, 0.01e18, "opening mcap (USD)");
    }

    // ------------------------------------------------------------------ //
    //  Trading                                                           //
    // ------------------------------------------------------------------ //

    function test_BuyAndSellThroughSiteRouter() public {
        if (!hasFork) return;
        (address token,) = _launch(false);

        uint256 out = _buy(buyer, token, 10e6); // $10
        // $10 minus 0.2% interface fee and 1% pool fee at ~$4.009e-6/token ≈ 2.46M tokens.
        assertApproxEqRel(out, 2_464_000 ether, 0.01e18, "buy output");
        assertEq(OuroToken(payable(token)).balanceOf(buyer), out, "tokens delivered");

        // Sell half back: USDC returns to the buyer, minus both fees again.
        vm.startPrank(buyer);
        OuroToken(payable(token)).approve(address(router), out / 2);
        uint256 usdcOut =
            router.swapExactIn(token, FEE_TIER, false, out / 2, 0, buyer, block.timestamp + 600);
        vm.stopPrank();
        assertApproxEqRel(usdcOut, 4.89e6, 0.02e18, "sell output (~$4.89)");
    }

    /// @dev External terminals need nothing from us: a raw pool.swap with a standard
    ///      v3 callback (the pattern Arc's terminals/routers already use) trades the
    ///      pool directly.
    function test_ExternalRouterCanTradeWithoutUs() public {
        if (!hasFork) return;
        (address token, address pool) = _launch(false);
        RawV3Trader ext = new RawV3Trader(FACADE);
        usdc.mint(address(ext), 10e6);
        uint256 out = ext.buy(pool, token, 10e6);
        assertGt(out, 0, "external buy filled");
        assertEq(OuroToken(payable(token)).balanceOf(address(ext)), out);
    }

    // ------------------------------------------------------------------ //
    //  Fees                                                              //
    // ------------------------------------------------------------------ //

    function test_CollectSplitsCreatorMode() public {
        if (!hasFork) return;
        (address token,) = _launch(true); // Creator Rewards

        _buy(buyer, token, 100e6); // $100 of volume
        uint256 protoUsdcBefore = usdc.balanceOf(protocol);
        uint256 creatorNativeBefore = creator.balance;
        uint256 protoNativeBefore = protocol.balance;

        (uint256 usdcSide, uint256 tokenSide) = locker.collect(token);

        // Pool fee = 1% of the swapped input (100e6 minus the 0.2% interface skim).
        assertApproxEqRel(usdcSide, 998_000, 0.001e18, "harvested pool fee (~0.998 USDC)");
        assertEq(tokenSide, 0, "no token-side fees from buys");

        // 60% to the creator, 40% to the protocol — paid in native (18d).
        assertEq(creator.balance - creatorNativeBefore, (usdcSide * 6000 / 10000) * 1e12, "creator share");
        assertEq(protocol.balance - protoNativeBefore, (usdcSide - usdcSide * 6000 / 10000) * 1e12, "protocol share");
        assertEq(usdc.balanceOf(protocol), protoUsdcBefore, "no facade-side protocol change");
    }

    function test_CollectLoopModeStreamsToHolders() public {
        if (!hasFork) return;
        (address token,) = _launch(false); // Loop Rewards

        _buy(buyer, token, 100e6); // buyer now holds tokens and is the only holder
        locker.collect(token);

        OuroToken t = OuroToken(payable(token));
        uint256 claimable = t.claimableRewardOf(buyer);
        // Holder share = 60% of the ~0.998 USDC fee, in native wei.
        assertApproxEqRel(claimable, uint256(598_800) * 1e12, 0.01e18, "holder claimable");

        uint256 before = buyer.balance;
        vm.prank(buyer);
        t.claim();
        assertEq(buyer.balance - before, claimable, "claim pays native");
    }

    function test_SellSideFeesGoToProtocolAsTokens() public {
        if (!hasFork) return;
        (address token,) = _launch(true);
        uint256 out = _buy(buyer, token, 100e6);

        vm.startPrank(buyer);
        OuroToken(payable(token)).approve(address(router), out);
        router.swapExactIn(token, FEE_TIER, false, out, 0, buyer, block.timestamp + 600);
        vm.stopPrank();

        // The router's 0.2% input skim also lands on the protocol in tokens, so
        // assert the COLLECT's contribution as a delta.
        uint256 before = OuroToken(payable(token)).balanceOf(protocol);
        (, uint256 tokenSide) = locker.collect(token);
        assertGt(tokenSide, 0, "sell fees accrue on the token side");
        assertEq(
            OuroToken(payable(token)).balanceOf(protocol) - before, tokenSide, "token side to protocol"
        );
    }

    // ------------------------------------------------------------------ //
    //  Locking & griefing                                                //
    // ------------------------------------------------------------------ //

    function test_PrincipalStaysLocked() public {
        if (!hasFork) return;
        (address token, address pool) = _launch(false);
        _buy(buyer, token, 50e6);

        (uint160 sqrtBefore,,,,,,) = IUniswapV3PoolDirect(pool).slot0();
        uint128 liqBefore = IUniswapV3PoolDirect(pool).liquidity();
        locker.collect(token);
        (uint160 sqrtAfter,,,,,,) = IUniswapV3PoolDirect(pool).slot0();
        assertEq(IUniswapV3PoolDirect(pool).liquidity(), liqBefore, "collect moves no principal");
        assertEq(sqrtAfter, sqrtBefore, "collect moves no price");
    }

    function test_HostilePreInitializedPoolFailsTheLaunchHarmlessly() public {
        if (!hasFork) return;
        // Token addresses are predictable (CREATE from the launchpad), so a griefer
        // can pre-create the pool at a hostile price. The launch must revert.
        (ArcLaunchpad lp,,) = _deployStack();
        address predicted = computeCreateAddress(address(lp), 1);
        address pool = IUniswapV3Factory(FACTORY).createPool(predicted, FACADE, FEE_TIER);
        IUniswapV3PoolDirect(pool).initialize(79228162514264337593543950336); // price 1:1 — hostile

        vm.startPrank(creator);
        usdc.approve(address(lp), CREATION_FEE);
        vm.expectRevert(ArcLaunchpad.PoolPriceMismatch.selector);
        lp.createTokenV3("Griefed", "GRF", "ipfs://g", 0, false);
        vm.stopPrank();
        // Nothing left the creator's wallet.
        assertEq(usdc.balanceOf(creator), 1_000e6, "creator kept their USDC");
    }

    // ------------------------------------------------------------------ //
    //  Dev buy & orientations                                            //
    // ------------------------------------------------------------------ //

    function test_DevBuyIsTheFirstSwap() public {
        if (!hasFork) return;
        vm.startPrank(creator);
        usdc.approve(address(launchpad), CREATION_FEE + 5e6);
        (address token,) = launchpad.createTokenV3("Dev", "DEV", "ipfs://d", 5e6, false);
        vm.stopPrank();

        // ~$5 at the opening price, only the 1% pool fee applies (no router).
        assertApproxEqRel(
            OuroToken(payable(token)).balanceOf(creator), 1_234_000 ether, 0.01e18, "dev buy tokens"
        );
    }

    function test_Token0OrientationLaunches() public {
        if (!hasFork) return;
        // Roll fresh launchpads until the predicted token address sorts BELOW the
        // facade (~21% per roll) to hit the token0 orientation.
        for (uint256 i = 0; i < 64; i++) {
            (ArcLaunchpad lp,,) = _deployStack();
            if (computeCreateAddress(address(lp), 1) >= FACADE) continue;

            vm.startPrank(creator);
            usdc.approve(address(lp), CREATION_FEE);
            (address token, address pool) = lp.createTokenV3("Zero", "ZRO", "ipfs://0", 0, false);
            vm.stopPrank();

            assertTrue(token < FACADE, "token really is token0");
            (uint160 sqrtP, int24 tick,,,,,) = IUniswapV3PoolDirect(pool).slot0();
            assertEq(sqrtP, _params().sqrtPriceX96Token0, "token0 opening price");
            assertEq(tick, _params().tickLower0, "token0 opening tick");

            // And it trades: a buy moves the tick UP into the range in this orientation.
            RawV3Trader ext = new RawV3Trader(FACADE);
            usdc.mint(address(ext), 10e6);
            uint256 out = ext.buy(pool, token, 10e6);
            assertApproxEqRel(out, 2_469_000 ether, 0.01e18, "token0 buy output");
            (, int24 tickAfter,,,,,) = IUniswapV3PoolDirect(pool).slot0();
            assertGt(tickAfter, tick, "buys move up-tick in token0 orientation");
            return;
        }
        revert("no token0-orientation address rolled in 64 tries");
    }
}

/// @dev Stand-in for an external terminal's router: raw pool.swap + the standard v3
///      callback, paying the pool straight from its own facade balance.
contract RawV3Trader is IUniswapV3SwapCallback {
    address internal immutable usdc;
    address internal pendingPool;

    constructor(address _usdc) {
        usdc = _usdc;
    }

    function buy(address pool, address token, uint256 usdcIn) external returns (uint256 out) {
        bool zeroForOne = usdc < token;
        pendingPool = pool;
        (int256 a0, int256 a1) = IUniswapV3PoolDirect(pool).swap(
            address(this),
            zeroForOne,
            int256(usdcIn),
            zeroForOne ? uint160(4295128739 + 1) : uint160(1461446703485210103287273052203988822378723970342 - 1),
            ""
        );
        pendingPool = address(0);
        out = uint256(-(zeroForOne ? a1 : a0));
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        require(msg.sender == pendingPool && pendingPool != address(0), "bad callback");
        int256 owed = amount0Delta > 0 ? amount0Delta : amount1Delta;
        MockUSDCFacade(payable(usdc)).transfer(msg.sender, uint256(owed));
    }
}
