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

        // Wallet that collects the creation fee and per-trade platform fee.
        // Set FEE_RECIPIENT in the environment; falls back to the deployer.
        address feeRecipient = vm.envOr("FEE_RECIPIENT", owner);

        // Uniswap V2 Router02 on Robinhood Chain (from @uniswap/sdk-core) — curves
        // migrate liquidity here at graduation. Override with DEX_ROUTER if needed.
        address router = vm.envOr("DEX_ROUTER", 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba);

        // Total per-trade fee 1.5%: 0.5% dev + 0.6% liquidity + 0.4% holders.
        // 1B supply; 1 ETH virtual seed paired with the 4 ETH graduation target so the
        // DEX price at graduation stays close to the curve's final price (a large
        // virtual seed relative to the target would crash the price on migration).
        // Anti-whale cap of 2% of supply per buy during the curve.
        Launchpad.CurveParams memory params = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 1 ether,
            devFeeBps: 50,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 4 ether,
            maxBuyBps: 200,
            // Post-graduation trade tax of 1% (fee-on-transfer on the DEX pair) → the
            // protocol vault (feeRecipient). Capped at 2% in the token.
            postGradTaxBps: 100
        });

        // Creation fee charged on every launch (native coin = ETH on Robinhood Chain).
        // Adjustable later via setCreationFee.
        uint256 creationFee = 0.01 ether;

        vm.startBroadcast(pk);
        Launchpad launchpad = new Launchpad(owner, feeRecipient, router, creationFee, params);
        vm.stopBroadcast();

        console2.log("Launchpad deployed at:", address(launchpad));
    }
}
