// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @notice Prints the ArcLaunchpad V3Params for the Arc instant-V3 launches (Uniswap
///   V3 pools against the 6-decimal native-USDC facade). Tick math is identical
///   between v3 and v4, so this reuses the v4 libraries.
///
///   The launched token can sort as token0 or token1 against the facade, so both
///   orientations are computed from one symmetric range description:
///     - token1 orientation: range [U-SPAN, U], launch price at tick U (position all
///       token1 = all launched token; buys move the tick down into the range);
///     - token0 orientation: the mirror image [-U, -U+SPAN], launch at tick -U
///       (position all token0; buys move the tick up into the range).
///
///   TICK_UPPER1 picks the opening market cap: raw price 1.0001^U is launched-token
///   wei per USDC facade unit, so with an 18-decimal token, a 6-decimal quote and
///   supply S tokens, opening mcap ≈ S / (1.0001^U × 1e-12) USD. 400600 ≈ $4,009 for
///   a 1B supply. SPAN = 69000 mirrors the ~991.9× price span used on Robinhood.
contract PrintArcV3Config is Script {
    function run() external view {
        int24 upper1 = int24(vm.envInt("TICK_UPPER1")); // e.g. 400600
        int24 span = int24(vm.envInt("SPAN")); // e.g. 69000 (multiple of 200)
        uint256 supply = vm.envUint("TOKEN_SUPPLY"); // e.g. 1000000000000000000000000000

        int24 lower1 = upper1 - span;
        int24 lower0 = -upper1;
        int24 upper0 = -upper1 + span;

        uint160 sqrtPrice1 = TickMath.getSqrtPriceAtTick(upper1);
        uint160 sqrtPrice0 = TickMath.getSqrtPriceAtTick(lower0);
        uint128 liquidity1 = LiquidityAmounts.getLiquidityForAmount1(
            TickMath.getSqrtPriceAtTick(lower1), sqrtPrice1, supply
        );
        uint128 liquidity0 = LiquidityAmounts.getLiquidityForAmount0(
            sqrtPrice0, TickMath.getSqrtPriceAtTick(upper0), supply
        );

        console2.log("--- token is token0 (token address < facade) ---");
        console2.log("tickLower0:", lower0);
        console2.log("tickUpper0:", upper0);
        console2.log("sqrtPriceX96Token0:", sqrtPrice0);
        console2.log("liquidity0:", liquidity0);
        console2.log("--- token is token1 (the common case) ---");
        console2.log("tickLower1:", lower1);
        console2.log("tickUpper1:", upper1);
        console2.log("sqrtPriceX96Token1:", sqrtPrice1);
        console2.log("liquidity1:", liquidity1);
    }
}
