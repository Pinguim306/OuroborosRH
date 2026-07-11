// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Launchpad} from "src/Launchpad.sol";

/// @notice Deploys the Ouroboros Launchpad with sensible default curve params.
///         Run: forge script script/Deploy.s.sol --rpc-url $RPC --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);

        // Defaults: 1B supply, 30 native virtual seed, 1% fee, 60% of fee -> liquidity,
        // graduate once 400 native has been raised into real liquidity.
        Launchpad.CurveParams memory params = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 30 ether,
            feeBps: 100,
            liqShareBps: 6000,
            graduationTarget: 400 ether
        });

        vm.startBroadcast(pk);
        Launchpad launchpad = new Launchpad(owner, params);
        vm.stopBroadcast();

        console2.log("Launchpad deployed at:", address(launchpad));
    }
}
