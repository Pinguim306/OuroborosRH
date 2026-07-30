// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @notice Prints the exact LaunchConfig tuple for a given range + supply — the same math
///   DeployCoilLaunchpad runs, exposed for retuning a live launchpad via setLaunchConfig.
contract PrintLaunchConfig is Script {
    function run() external view {
        int24 tickLower = int24(vm.envInt("TICK_LOWER"));
        int24 tickUpper = int24(vm.envInt("TICK_UPPER"));
        uint256 supply = vm.envUint("TOKEN_SUPPLY");
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtUpper, supply);
        console2.log("tickLower:", tickLower);
        console2.log("tickUpper:", tickUpper);
        console2.log("sqrtPriceX96:", sqrtUpper);
        console2.log("liquidity:", liquidity);
    }
}
