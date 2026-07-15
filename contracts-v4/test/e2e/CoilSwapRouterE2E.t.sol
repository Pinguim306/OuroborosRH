// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PosmTestSetup} from "@uniswap/v4-periphery/test/shared/PosmTestSetup.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {CoilHook} from "../../src/CoilHook.sol";
import {CoilSwapRouter} from "../../src/CoilSwapRouter.sol";

/// @dev End-to-end proof of the CoilSwapRouter against a live local v4 stack: a real swap through
///   the router skims the interface fee to the protocol wallet and delivers the output to the
///   trader. On a Coil token it also triggers the coil's own protocol fee — double revenue.
contract CoilSwapRouterE2ETest is PosmTestSetup {
    CoilHook coil;
    CoilSwapRouter router;

    address constant HOOK_ADDR = address(uint160(0xCAfE000000000000000000000000000000000088));

    int24 constant TICK_LOWER = -6000;
    int24 constant TICK_UPPER = 0;
    uint256 constant SUPPLY = 1_000_000 ether;
    uint256 constant P_BPS = 50;
    uint256 constant H_BPS = 30;
    uint256 constant B_BPS = 20;
    uint256 constant IFEE_BPS = 20; // 0.20% interface fee

    address protocolWallet = makeAddr("protocolWallet");
    address treasury = makeAddr("treasury");
    address ifaceWallet = makeAddr("ifaceWallet"); // interface-fee recipient
    address alice = makeAddr("alice");

    uint160 sqrtPriceX96;
    uint128 seedLiquidity;

    function setUp() public {
        deployFreshManagerAndRouters();
        deployPosm(manager);

        deployCodeTo(
            "CoilHook.sol:CoilHook",
            abi.encode(
                IPoolManager(address(manager)), address(this), address(lpm), address(permit2),
                protocolWallet, treasury, address(0), SUPPLY, "Coil Token", "COIL-T",
                CoilHook.FeeConfig({protocolBps: P_BPS, holderBps: H_BPS, burnBps: B_BPS})
            ),
            HOOK_ADDR
        );
        coil = CoilHook(payable(HOOK_ADDR));

        sqrtPriceX96 = TickMath.getSqrtPriceAtTick(TICK_UPPER);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(TICK_LOWER);
        seedLiquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtPriceX96, SUPPLY);
        coil.seed(sqrtPriceX96, TICK_LOWER, TICK_UPPER, seedLiquidity);

        router = new CoilSwapRouter(IPoolManager(address(manager)), address(this), ifaceWallet, IFEE_BPS);
    }

    function _key() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(coil)),
            fee: coil.POOL_FEE(),
            tickSpacing: coil.TICK_SPACING(),
            hooks: IHooks(address(coil))
        });
    }

    /// @dev Buy a Coil token through the router: interface fee lands, trader gets tokens, and the
    ///   coil's protocol fee also accrues — both cuts to the protocol side.
    function test_Swap_TakesInterfaceFee_AndHookFee() public {
        uint256 ethIn = 5 ether;
        vm.deal(alice, ethIn);

        uint256 ifaceBefore = ifaceWallet.balance;
        vm.prank(alice);
        uint256 out = router.swapExactInSingle{value: ethIn}(
            _key(), true, ethIn, 0, alice, block.timestamp + 1
        );

        // Interface fee skimmed to the interface wallet.
        assertEq(ifaceWallet.balance - ifaceBefore, ethIn * IFEE_BPS / 10_000, "interface fee taken");
        // Trader received the output.
        assertEq(coil.balanceOf(alice), out, "alice received output");
        assertGt(out, 0);
        // The coil's own protocol fee accrued on the swapped (post-interface-fee) amount.
        uint256 swapAmount = ethIn - (ethIn * IFEE_BPS / 10_000);
        uint256 hookFee = swapAmount * (P_BPS + H_BPS + B_BPS) / 10_000;
        assertEq(coil.protocolAccruedETH(), hookFee * P_BPS / (P_BPS + H_BPS + B_BPS), "coil protocol fee too");
    }

    /// @dev Selling the token back routes the interface fee on the token side.
    function test_Swap_SellSide_InterfaceFeeInToken() public {
        // First buy so alice holds tokens.
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 bought = router.swapExactInSingle{value: 5 ether}(_key(), true, 5 ether, 0, alice, block.timestamp + 1);

        // Now sell half back through the router (token in → interface fee in token).
        uint256 sellAmount = bought / 2;
        vm.prank(alice);
        coil.approve(address(router), sellAmount);

        uint256 ifaceTokBefore = coil.balanceOf(ifaceWallet);
        uint256 ethBefore = alice.balance;
        vm.prank(alice);
        uint256 ethOut = router.swapExactInSingle(_key(), false, sellAmount, 0, alice, block.timestamp + 1);

        assertEq(coil.balanceOf(ifaceWallet) - ifaceTokBefore, sellAmount * IFEE_BPS / 10_000, "token-side interface fee");
        assertEq(alice.balance - ethBefore, ethOut, "alice got ETH out");
        assertGt(ethOut, 0);
    }

    function test_Swap_SlippageFloor_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(CoilSwapRouter.TooLittleReceived.selector);
        router.swapExactInSingle{value: 1 ether}(_key(), true, 1 ether, type(uint256).max, alice, block.timestamp + 1);
    }

    function test_Swap_Deadline_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(CoilSwapRouter.DeadlinePassed.selector);
        router.swapExactInSingle{value: 1 ether}(_key(), true, 1 ether, 0, alice, 999);
    }
}
