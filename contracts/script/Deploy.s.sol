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

        // ------------------------------------------------------------------ //
        //  Instant-V3 launch mode                                            //
        // ------------------------------------------------------------------ //
        // Uniswap V3 NonfungiblePositionManager + SwapRouter02 on Robinhood Chain.
        address positionManager = vm.envOr("V3_POSITION_MANAGER", 0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
        address swapRouter02 = vm.envOr("V3_SWAP_ROUTER", 0xCaf681a66D020601342297493863E78C959E5cb2);

        // Initial pool price: 1e-9 WETH per token => 1 ETH marketcap for the 1B
        // supply, matching the bonding curve's starting price. sqrtPriceX96 and the
        // single-sided full-range ticks depend on token/WETH sort order, so both
        // variants are configured (1% tier => tick spacing 200, max usable 887200).
        //   token = token0: P = 1e-9, tick -207244 -> range [-207200, 887200]
        //   token = token1: P = 1e9,  tick  207243 -> range [-887200, 207200]
        Launchpad.V3Params memory v3 = Launchpad.V3Params({
            feeTier: 10000, // 1% — the protocol's take on every swap, harvested via the FeeLocker
            sqrtPriceX96Token0: 2505414483750479311864138, // sqrt(1e-9) * 2^96
            sqrtPriceX96Token1: 2505414483750479311864138015696063, // sqrt(1e9) * 2^96
            tickLower0: -207200,
            tickUpper0: 887200,
            tickLower1: -887200,
            tickUpper1: 207200
        });

        // Share of collected ETH-side pool fees streamed to holders (rest -> protocol).
        uint256 holderShareBps = 4000; // 40%

        vm.startBroadcast(pk);
        Launchpad launchpad = new Launchpad(owner, feeRecipient, router, creationFee, params);
        launchpad.setV3Config(positionManager, swapRouter02, holderShareBps, v3);
        vm.stopBroadcast();

        console2.log("Launchpad deployed at:", address(launchpad));
        console2.log("FeeLocker deployed at:", address(launchpad.feeLocker()));
    }
}
