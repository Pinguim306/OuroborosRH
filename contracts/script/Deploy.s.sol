// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Launchpad} from "src/Launchpad.sol";

/// @notice Deploys the Ouroboros Launchpad with default params.
///         Run: forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);

        // Developer wallet that receives the creation fee and per-trade dev fee.
        address feeRecipient = 0x1c06a7dE6951d62CbaD36FC449770BEE2d8c2b23;

        // Total per-trade fee 1.5%: 0.5% dev + 0.6% liquidity + 0.4% holders.
        // 1B supply, 30 native virtual seed, graduate at 400 native raised.
        Launchpad.CurveParams memory params = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 30 ether,
            devFeeBps: 50,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 400 ether
        });

        // Creation fee charged on every launch (native coin = ETH on Robinhood Chain).
        // Adjustable later via setCreationFee.
        uint256 creationFee = 0.01 ether;

        vm.startBroadcast(pk);
        Launchpad launchpad = new Launchpad(owner, feeRecipient, creationFee, params);
        vm.stopBroadcast();

        console2.log("Launchpad deployed at:", address(launchpad));
    }
}
