// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {CoilHook} from "../src/CoilHook.sol";
import {CoilLaunchpad} from "../src/CoilLaunchpad.sol";

/// @notice Deploys the CoilLaunchpad (Phase B v4 factory). Pricing for the fixed supply + range is
///   computed here (off-chain relative to the launchpad) and stored as immutable launch config, so
///   the launchpad never pulls TickMath/LiquidityAmounts on-chain.
/// @dev Env:
///     POOL_MANAGER, POSITION_MANAGER, PERMIT2  — v4 infra
///     LAUNCHPAD_OWNER   — admin (can update fee recipient/treasury/fees; not per-token power)
///     FEE_RECIPIENT     — protocol wallet (protocol fee cut + creation fee)
///     PLATFORM_TREASURY — COIL buy&burn treasury (burn cut)
///     CREATION_FEE      — native fee per launch (wei), default 0. Denominated in the CHAIN'S
///                         gas coin, always 18 decimals here: Robinhood Chain 0.001 ETH = 1e15;
///                         Arc 2 USDC = 2e18, because Arc's native USDC is scaled to 18 decimals
///                         by the EVM (NOT the ERC-20's 6) — using 2e6 would charge 0.000000000002.
///     TOKEN_SUPPLY      — supply per launch (wei)
///     TICK_LOWER, TICK_UPPER — one-sided range (defaults -6000 / 0)
///     PROTOCOL_SHARE_AT_MIN_BPS / PROTOCOL_SHARE_AT_MAX_BPS — the protocol's share of the fee at
///                         a 1% and a 5% token respectively; linear in between. Default 4500 / 2500.
///                         Below ~5/9 of the min-end share the protocol's absolute take peaks
///                         mid-range and then FALLS — see the note on FeeCurve.
///                         Must be non-increasing (min-end >= max-end) or the deploy reverts.
///     BURN_SHARE_OF_REMAINDER_BPS — burn cut, as bps of what is left after the protocol's share.
///                         Default 2000. Set 0 on a chain with no $COIL to buy and burn.
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/DeployCoilLaunchpad.s.sol:DeployCoilLaunchpad \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract DeployCoilLaunchpad is Script {
    function run() external returns (CoilLaunchpad pad) {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address posm = vm.envAddress("POSITION_MANAGER");
        address permit2 = vm.envAddress("PERMIT2");
        address owner = vm.envAddress("LAUNCHPAD_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address treasury = vm.envAddress("PLATFORM_TREASURY");
        uint256 creationFee = vm.envOr("CREATION_FEE", uint256(0));
        uint256 supply = vm.envUint("TOKEN_SUPPLY");

        int24 tickLower = int24(vm.envOr("TICK_LOWER", int256(-6000)));
        int24 tickUpper = int24(vm.envOr("TICK_UPPER", int256(0)));

        // The creator picks the TOTAL rate at launch; this curve decides the split. The protocol's
        // share slides down as the chosen rate rises — 45% of a 1% fee, 25% of a 5% one by default.
        CoilLaunchpad.FeeCurve memory feeCurve = CoilLaunchpad.FeeCurve({
            protocolShareAtMinBps: vm.envOr("PROTOCOL_SHARE_AT_MIN_BPS", uint256(4500)),
            protocolShareAtMaxBps: vm.envOr("PROTOCOL_SHARE_AT_MAX_BPS", uint256(2500)),
            // Of what is left after the protocol cut. 0 on chains with no $COIL to buy and burn.
            burnShareOfRemainderBps: vm.envOr("BURN_SHARE_OF_REMAINDER_BPS", uint256(2000))
        });

        // Launch price = price at tickUpper (one-sided token1); liquidity for the whole supply.
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtUpper, supply);
        CoilLaunchpad.LaunchConfig memory launch = CoilLaunchpad.LaunchConfig({
            tickLower: tickLower, tickUpper: tickUpper, sqrtPriceX96: sqrtUpper, liquidity: liquidity
        });

        vm.startBroadcast();
        pad = new CoilLaunchpad(
            owner, IPoolManager(poolManager), posm, permit2, feeRecipient, treasury, creationFee,
            supply, feeCurve, launch
        );
        vm.stopBroadcast();

        console2.log("CoilLaunchpad deployed:", address(pad));
        console2.log("  supply / creationFee:", supply, creationFee);
        console2.log("  protocol share at 1% / at 5% (bps):", feeCurve.protocolShareAtMinBps, feeCurve.protocolShareAtMaxBps);
        console2.log("  burn share of remainder (bps):", feeCurve.burnShareOfRemainderBps);
    }
}
