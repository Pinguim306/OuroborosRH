// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {CoilBuybackBurner, ICoilSwapRouter} from "../src/CoilBuybackBurner.sol";

/// @notice Deploys the CoilBuybackBurner (the $COIL buy&burn treasury).
/// @dev Env:
///     COIL_SWAP_ROUTER — the deployed v4 CoilSwapRouter (used to buy COIL with ETH)
///     BURNER_OWNER     — admin (can setCoil + rescue dust); the buyback itself is permissionless
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/DeployCoilBuybackBurner.s.sol:DeployCoilBuybackBurner \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
///
///   After deploy, wire it up (owner txs on the launchpad, then point the burner at COIL):
///     1. cast send $LAUNCHPAD "setPlatformTreasury(address)" $BURNER      // new tokens fund it
///     2. launch the official $COIL via the platform, note its address
///     3. cast send $BURNER "setCoil(address)" $COIL                       // enable the buyback
///     4. optionally cast send $LAUNCHPAD "setFees((uint256,uint256,uint256))" "(35,30,35)"
///        to make the burn slice 50% of the protocol take (protocol/holder/burn bps).
contract DeployCoilBuybackBurner is Script {
    function run() external returns (CoilBuybackBurner burner) {
        address router = vm.envAddress("COIL_SWAP_ROUTER");
        address owner = vm.envAddress("BURNER_OWNER");

        vm.startBroadcast();
        burner = new CoilBuybackBurner(ICoilSwapRouter(router), owner);
        vm.stopBroadcast();

        console2.log("CoilBuybackBurner deployed:", address(burner));
        console2.log("Owner:", owner);
        console2.log("Next: launchpad.setPlatformTreasury(this), launch $COIL, then setCoil($COIL).");
    }
}
