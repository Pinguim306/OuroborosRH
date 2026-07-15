// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {CoilSwapRouter} from "../src/CoilSwapRouter.sol";

/// @notice Deploys the CoilSwapRouter (the on-chain half of the Swap tab).
/// @dev Env:
///     POOL_MANAGER      — v4 PoolManager
///     ROUTER_OWNER      — admin (can tune the interface fee within the cap + change recipient)
///     INTERFACE_FEE_RECIPIENT — where the interface fee lands (your protocol wallet)
///     INTERFACE_FEE_BPS — interface fee in bps (default 20 = 0.20%), capped at 100 (1%)
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/DeployCoilSwapRouter.s.sol:DeployCoilSwapRouter \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract DeployCoilSwapRouter is Script {
    function run() external returns (CoilSwapRouter router) {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address owner = vm.envAddress("ROUTER_OWNER");
        address feeRecipient = vm.envAddress("INTERFACE_FEE_RECIPIENT");
        uint256 feeBps = vm.envOr("INTERFACE_FEE_BPS", uint256(20));

        vm.startBroadcast();
        router = new CoilSwapRouter(IPoolManager(poolManager), owner, feeRecipient, feeBps);
        vm.stopBroadcast();

        console2.log("CoilSwapRouter deployed:", address(router));
        console2.log("  interface fee bps:", feeBps);
    }
}
