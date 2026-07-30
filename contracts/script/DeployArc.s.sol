// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ArcLaunchpad} from "src/ArcLaunchpad.sol";
import {ArcPoolLocker} from "src/ArcPoolLocker.sol";
import {ArcSwapRouter} from "src/ArcSwapRouter.sol";

/// @notice Deploys the Arc instant-V3 stack (launchpad + locker + site router) wired
///         to the DEX factory that Arc's trading terminals index and route — so
///         launched tokens are tradable there from block one.
///
///         Run (from contracts/):
///           forge script script/DeployArc.s.sol \
///             --rpc-url https://rpc.blockdaemon.mainnet.arc.io --broadcast
///         with PRIVATE_KEY (and optionally FEE_RECIPIENT) in the environment.
contract DeployArc is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", owner);

        // Live Arc (5042) addresses: the DYOR-deployed Uniswap V3 factory the
        // terminals route (verified: permissionless createPool, 1% tier enabled),
        // and the canonical native-USDC ERC20 facade every pool pairs against.
        address v3Factory = vm.envOr("V3_FACTORY", 0xf0db7b58379503491d857dB50AC9ece64c653918);
        address usdcFacade = vm.envOr("USDC_FACADE", 0x3600000000000000000000000000000000000000);

        // Launch economics — mirrors the retired v4 launchpad's live settings:
        // 1 USDC creation fee (facade units: 6 decimals), 1B supply per token,
        // 60% of harvested fees to the creator-or-holders / 40% to the protocol,
        // 0.2% site-router interface fee. The pool's 1% tier is the per-swap take.
        uint256 creationFee = 1e6;
        uint256 tokenSupply = 1_000_000_000 ether;
        uint256 holderShareBps = 6000;
        uint256 interfaceFeeBps = 20;

        // PrintArcV3Config (contracts-v4) output for TICK_UPPER1=400600, SPAN=69000,
        // TOKEN_SUPPLY=1e27: ~$4,009 opening market cap, 991.9x price span, both
        // token/facade sort orders.
        ArcLaunchpad.V3Params memory v3 = ArcLaunchpad.V3Params({
            feeTier: 10000,
            sqrtPriceX96Token0: 158633909751014158088,
            sqrtPriceX96Token1: 39569734776372747109332364130380419359,
            tickLower0: -400600,
            tickUpper0: -331600,
            tickLower1: 331600,
            tickUpper1: 400600,
            liquidity0: 2067899545654038417,
            liquidity1: 2067899545654152224
        });

        vm.startBroadcast(pk);
        ArcLaunchpad launchpad =
            new ArcLaunchpad(owner, v3Factory, usdcFacade, feeRecipient, creationFee, tokenSupply);
        ArcPoolLocker locker = new ArcPoolLocker(address(launchpad), usdcFacade, holderShareBps);
        ArcSwapRouter router =
            new ArcSwapRouter(owner, v3Factory, usdcFacade, feeRecipient, interfaceFeeBps);
        launchpad.setV3Config(address(locker), v3);
        vm.stopBroadcast();

        console2.log("ArcLaunchpad deployed at:", address(launchpad));
        console2.log("ArcPoolLocker deployed at:", address(locker));
        console2.log("ArcSwapRouter deployed at:", address(router));
    }
}
