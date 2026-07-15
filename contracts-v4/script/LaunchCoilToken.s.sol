// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";

import {CoilHook} from "../src/CoilHook.sol";
import {CoilLaunchpad} from "../src/CoilLaunchpad.sol";

/// @notice Launch one Coil (v4) token through an already-deployed CoilLaunchpad. Mines the CREATE2
///   salt off-chain (the hook must land on a BEFORE_SWAP-flagged address), then calls
///   `createTokenV4`. This is the same flow the frontend will run — reproduced as a script so a
///   token can be launched from the CLI before the v4 launch UI exists.
/// @dev Env:
///     COIL_LAUNCHPAD      — the deployed CoilLaunchpad address
///     LAUNCHER            — the wallet that broadcasts this tx (MUST equal the --private-key
///                           wallet); used as the creator in Creator-Rewards mode so the mined
///                           salt matches the on-chain deploy
///     TOKEN_NAME, TOKEN_SYMBOL
///     TOKEN_METADATA_URI  — optional (default "")
///     CREATOR_REWARDS     — optional bool (default false = Loop Rewards)
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/LaunchCoilToken.s.sol:LaunchCoilToken \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract LaunchCoilToken is Script {
    function run() external returns (address token) {
        address padAddr = vm.envAddress("COIL_LAUNCHPAD");
        address launcher = vm.envAddress("LAUNCHER");
        string memory name = vm.envString("TOKEN_NAME");
        string memory symbol = vm.envString("TOKEN_SYMBOL");
        string memory uri = vm.envOr("TOKEN_METADATA_URI", string(""));
        bool creatorRewards = vm.envOr("CREATOR_REWARDS", false);

        CoilLaunchpad pad = CoilLaunchpad(payable(padAddr));
        address creator = creatorRewards ? launcher : address(0);

        // Reproduce the launchpad's exact constructor args so the mined salt lands the hook on the
        // same address `createTokenV4` will deploy it to.
        bytes memory ctorArgs = _ctorArgs(pad, padAddr, name, symbol, creator);
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        (address predicted, bytes32 salt) =
            HookMiner.find(padAddr, flags, type(CoilHook).creationCode, ctorArgs);
        console2.log("Mined token address:", predicted);
        console2.logBytes32(salt);

        uint256 fee = pad.creationFee();
        vm.startBroadcast();
        (token,) = pad.createTokenV4{value: fee}(name, symbol, uri, salt, creatorRewards);
        vm.stopBroadcast();

        require(token == predicted, "launched address != mined address");
        console2.log("Coil token launched:", token);
        console2.log("  name / symbol:", name, symbol);
    }

    function _ctorArgs(
        CoilLaunchpad pad,
        address padAddr,
        string memory name,
        string memory symbol,
        address creator
    ) internal view returns (bytes memory) {
        (uint256 p, uint256 h, uint256 b) = pad.fees();
        return abi.encode(
            pad.poolManager(),
            padAddr, // owner = the launchpad (matches CoilLaunchpad._ctorArgs)
            pad.posm(),
            pad.permit2(),
            pad.feeRecipient(),
            pad.platformTreasury(),
            creator,
            pad.tokenSupply(),
            name,
            symbol,
            CoilHook.FeeConfig({protocolBps: p, holderBps: h, burnBps: b})
        );
    }
}
