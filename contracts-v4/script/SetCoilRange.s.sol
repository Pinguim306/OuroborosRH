// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {CoilLaunchpad} from "../src/CoilLaunchpad.sol";

/// @notice Re-price FUTURE launches by updating the CoilLaunchpad's one-sided launch range.
///   The pool is (currency0 = native ETH, currency1 = token), seeded one-sided as token1 with the
///   opening price at `tickUpper`. Because price = token1/token0 = TOKEN per ETH, a HIGHER
///   `tickUpper` means more tokens per ETH → a cheaper token → a lower opening market cap. The old
///   default `tickUpper = 0` opens at 1 token = 1 ETH, which is why launches showed an absurd cap.
///
///   Opening cap (in ETH) = tokenSupply / 1.0001^tickUpper. Ceiling cap (all supply bought, price
///   at `tickLower`) = tokenSupply / 1.0001^tickLower, so `tickUpper - tickLower` sets how far price
///   can climb (≈ e^((tickUpper-tickLower)/10000)×).
///
///   This mirrors DeployCoilLaunchpad's exact pricing math; it only calls `setLaunchConfig` instead
///   of the constructor, so it is safe to reuse the same TICK_LOWER / TICK_UPPER you'd deploy with.
///   Ticks must be multiples of the pool tickSpacing (200) and within TickMath bounds. Existing
///   tokens are immutable — this only affects launches created AFTER it is sent.
///
/// @dev Env:
///     COIL_LAUNCHPAD  — deployed CoilLaunchpad address (your NEXT_PUBLIC_COIL_LAUNCHPAD)
///     TICK_LOWER      — lower tick (ceiling price); must be a multiple of 200
///     TICK_UPPER      — upper tick (opening price); must be a multiple of 200
///   Run (dry-run first — WITHOUT --broadcast — to print the computed values, then add --broadcast):
///     FOUNDRY_PROFILE=e2e forge script script/SetCoilRange.s.sol:SetCoilRange \
///       --rpc-url $RPC_URL --private-key $PK        # add --broadcast to send
contract SetCoilRange is Script {
    int24 constant TICK_SPACING = 200; // CoilHook.TICK_SPACING

    function run() external {
        CoilLaunchpad pad = CoilLaunchpad(vm.envAddress("COIL_LAUNCHPAD"));
        int24 tickLower = int24(vm.envInt("TICK_LOWER"));
        int24 tickUpper = int24(vm.envInt("TICK_UPPER"));

        require(tickLower < tickUpper, "tickLower must be < tickUpper");
        require(tickLower % TICK_SPACING == 0, "tickLower not aligned to 200");
        require(tickUpper % TICK_SPACING == 0, "tickUpper not aligned to 200");
        require(tickLower >= TickMath.MIN_TICK && tickUpper <= TickMath.MAX_TICK, "tick out of range");

        uint256 supply = pad.tokenSupply();

        // Identical pricing to DeployCoilLaunchpad: opening price at tickUpper, one-sided token1.
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtUpper, supply);

        console2.log("CoilLaunchpad:", address(pad));
        console2.log("supply (wei):", supply);
        console2.log("tickLower:");
        console2.logInt(int256(tickLower));
        console2.log("tickUpper:");
        console2.logInt(int256(tickUpper));
        console2.log("sqrtPriceX96 (opening):", uint256(sqrtUpper));
        console2.log("liquidity:", uint256(liquidity));

        CoilLaunchpad.LaunchConfig memory cfg = CoilLaunchpad.LaunchConfig({
            tickLower: tickLower,
            tickUpper: tickUpper,
            sqrtPriceX96: sqrtUpper,
            liquidity: liquidity
        });

        vm.startBroadcast();
        pad.setLaunchConfig(cfg);
        vm.stopBroadcast();

        console2.log("setLaunchConfig sent. New launches use this range; existing tokens are unchanged.");
    }
}
