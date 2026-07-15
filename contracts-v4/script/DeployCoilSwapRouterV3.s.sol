// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {CoilSwapRouterV3, ISwapRouter02} from "../src/CoilSwapRouterV3.sol";

/// @notice Deploys the CoilSwapRouterV3 (interface-fee wrapper over Uniswap SwapRouter02 for v3
///   tokens). Get WETH with: `cast call $SWAP_ROUTER_02 "WETH9()(address)"` (or "WETH()").
/// @dev Env:
///     SWAP_ROUTER_02          — Uniswap SwapRouter02 on Robinhood Chain
///     WETH_ADDRESS            — the chain's WETH
///     ROUTER_OWNER            — admin
///     INTERFACE_FEE_RECIPIENT — where the interface fee lands (your protocol wallet)
///     INTERFACE_FEE_BPS       — default 20 (0.20%), capped at 100 (1%)
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/DeployCoilSwapRouterV3.s.sol:DeployCoilSwapRouterV3 \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract DeployCoilSwapRouterV3 is Script {
    function run() external returns (CoilSwapRouterV3 router) {
        address swap02 = vm.envAddress("SWAP_ROUTER_02");
        address weth = vm.envAddress("WETH_ADDRESS");
        address owner = vm.envAddress("ROUTER_OWNER");
        address feeRecipient = vm.envAddress("INTERFACE_FEE_RECIPIENT");
        uint256 feeBps = vm.envOr("INTERFACE_FEE_BPS", uint256(20));

        vm.startBroadcast();
        router = new CoilSwapRouterV3(ISwapRouter02(swap02), weth, owner, feeRecipient, feeBps);
        vm.stopBroadcast();

        console2.log("CoilSwapRouterV3 deployed:", address(router));
        console2.log("  interface fee bps:", feeBps);
    }
}
