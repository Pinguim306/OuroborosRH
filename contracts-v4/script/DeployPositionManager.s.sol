// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

// NOTE: PositionManager is deliberately NOT imported here. It cannot be.
//
// It does not fit EIP-170 at a normal optimizer setting, so it is pinned to 500 runs by a
// `compilation_restrictions` entry (see foundry.toml — upstream's own foundry.toml does the same).
// A file that imports it therefore has to compile at 500 runs too, and this script compiles at the
// profile's setting, so importing it fails the build outright with "incompatible settings
// restrictions". Upstream hits the same wall and answers it the same way: reach the contract through
// its artifact instead. `src/vendor/PositionManagerArtifact.sol` exists to get that artifact built.
//
// Consequence: run `forge build` before this script, or run it with a warm `out-*` dir. The script
// says so if the artifact is missing.

/// @notice Deploys Uniswap's own v4 PositionManager on a chain that has the v4 PoolManager but no
///   periphery.
///
/// @dev WHY THIS EXISTS. Uniswap deploys v4 chain by chain, and the periphery contracts whose
///   constructors need a WETH9 don't land on chains that have no WETH9. Arc (5042) is exactly that:
///   native USDC gas, PoolManager + StateView + Quoter present at Robinhood Chain's addresses with
///   byte-identical code, PositionManager and UniversalRouter absent. See
///   `../README.md` → "Infra Uniswap v4 por chain".
///
///   `CoilHook.seed()` mints the permanently-locked launch position through
///   `IPositionManager(POSM).multicall(...)`, so no POSM means no launches. v4-periphery is
///   permissionless and immutable, so the fix is to deploy the standard contract ourselves. This is
///   Uniswap's audited source, vendored and unmodified — not a Coil reimplementation.
///
///   TWO CONSTRUCTOR ARGUMENTS ARE DELIBERATELY THE ZERO ADDRESS.
///
///   `weth9` reaches PositionManager only through `NativeWrapper`, which is touched exclusively by
///   the `WRAP`/`UNWRAP` actions; `seed()` uses `MINT_POSITION` + `SETTLE_PAIR` and nothing else.
///   Override with `WRAPPED_NATIVE` if a wrapped USDC ever ships on Arc and you want those actions to
///   work for other integrators.
///
///   `tokenDescriptor` is only ever read by `tokenURI()`, so a zero here means `tokenURI` reverts and
///   nothing else changes. That is a deliberate trade: the descriptor is a 26 KB contract of pure
///   NFT-artwork string building that upstream has to pin to ONE optimizer run to squeeze under
///   EIP-170, and the only position this POSM will ever hold is the launch position, owned by the
///   hook forever and rendered by nobody. Deploy one later and pass `TOKEN_DESCRIPTOR` if that
///   changes — the argument is a constructor parameter, so it needs a fresh POSM.
///
/// @dev Env:
///     POOL_MANAGER        — the v4 PoolManager on this chain (required)
///     PERMIT2             — canonical 0x000000000022D473030F116dDEE9F6B43aC78BA3 (required)
///     WRAPPED_NATIVE      — WETH9-equivalent, default 0 (see above)
///     TOKEN_DESCRIPTOR    — NFT metadata renderer, default 0 (see above)
///     UNSUBSCRIBE_GAS_LIMIT — gas budget for subscriber callbacks, default 300000 (Uniswap's value)
///   Run (note the `forge build` — see the note above the contract):
///     FOUNDRY_PROFILE=e2e forge build
///     FOUNDRY_PROFILE=e2e forge script script/DeployPositionManager.s.sol:DeployPositionManager \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract DeployPositionManager is Script {
    /// @dev CREATE2 salt. The deployer is this script contract, whose address varies per run, so this
    ///   does not make the result predictable — it is just a fixed input.
    bytes32 constant POSM_SALT = bytes32(uint256(0x03));

    function run() external returns (address posm) {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address permit2 = vm.envAddress("PERMIT2");
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", address(0));
        address tokenDescriptor = vm.envOr("TOKEN_DESCRIPTOR", address(0));
        uint256 unsubscribeGasLimit = vm.envOr("UNSUBSCRIBE_GAS_LIMIT", uint256(300_000));

        require(poolManager.code.length > 0, "POOL_MANAGER has no code on this chain");
        require(permit2.code.length > 0, "PERMIT2 has no code on this chain");
        // Only a PoolManager answers this. Deploying a POSM bound to something else would produce a
        // contract that looks fine and mints into a singleton nobody trades on.
        (bool okPm,) = poolManager.staticcall(abi.encodeWithSignature("protocolFeeController()"));
        require(okPm, "POOL_MANAGER is not a v4 PoolManager (protocolFeeController() failed)");

        bytes memory creationCode = vm.getCode("PositionManager.sol:PositionManager");
        require(creationCode.length > 0, "PositionManager artifact missing - run `forge build` first");

        vm.startBroadcast();
        posm = _create2(
            creationCode,
            abi.encode(poolManager, permit2, unsubscribeGasLimit, tokenDescriptor, wrappedNative),
            POSM_SALT
        );
        vm.stopBroadcast();

        // Fail here rather than on-chain if the optimizer pin ever gets lost: over this and the
        // deployment is rejected by the EVM, which is a confusing place to learn about it.
        require(posm.code.length <= 24_576, "deployed PositionManager exceeds EIP-170");

        // Close the loop: the whole point is a POSM bound to THIS PoolManager, so assert it rather
        // than trust the constructor args we just passed.
        (bool ok, bytes memory ret) = posm.staticcall(abi.encodeWithSignature("poolManager()"));
        require(ok && ret.length == 32, "deployed PositionManager does not answer poolManager()");
        require(abi.decode(ret, (address)) == poolManager, "deployed PositionManager bound elsewhere");

        console2.log("PositionManager deployed:   ", posm);
        console2.log("  runtime size (bytes):     ", posm.code.length);
        console2.log("  bound to PoolManager:     ", poolManager);
        console2.log("  permit2:                  ", permit2);
        console2.log("  wrappedNative (0 = none): ", wrappedNative);
        console2.log("  tokenDescriptor (0 = none):", tokenDescriptor);
        console2.log("");
        console2.log("Next: pass this as POSITION_MANAGER to DeployCoilLaunchpad.");
    }

    function _create2(bytes memory creationCode, bytes memory args, bytes32 salt)
        internal
        returns (address addr)
    {
        bytes memory initcode = abi.encodePacked(creationCode, args);
        assembly {
            addr := create2(0, add(initcode, 0x20), mload(initcode), salt)
        }
        require(addr != address(0), "CREATE2 failed");
    }
}
