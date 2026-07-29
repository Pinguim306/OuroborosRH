// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys Uniswap's own v4 PositionManager (+ its PositionDescriptor) on a chain that has
///   the v4 PoolManager but no periphery.
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
///   WETH9 IS DELIBERATELY THE ZERO ADDRESS. It reaches PositionManager only through
///   `NativeWrapper`, which is touched exclusively by the `WRAP`/`UNWRAP` actions; `seed()` uses
///   `MINT_POSITION` + `SETTLE_PAIR` and nothing else. Override with `WRAPPED_NATIVE` if a wrapped
///   USDC ever ships on Arc and you want those actions to work for other integrators.
///
/// @dev Env:
///     POOL_MANAGER        — the v4 PoolManager on this chain (required)
///     PERMIT2             — canonical 0x000000000022D473030F116dDEE9F6B43aC78BA3 (required)
///     WRAPPED_NATIVE      — WETH9-equivalent, default 0 (see above)
///     NATIVE_LABEL        — the native coin's ticker for NFT metadata, default "USDC"
///     UNSUBSCRIBE_GAS_LIMIT — gas budget for subscriber callbacks, default 300000 (Uniswap's value)
///   Run:
///     FOUNDRY_PROFILE=e2e forge script script/DeployPositionManager.s.sol:DeployPositionManager \
///       --rpc-url $RPC_URL --broadcast --private-key $PK
contract DeployPositionManager is Script {
    /// @dev CREATE2 salts. The deployer here is this script contract, so these do not make the
    ///   address predictable across runs — they only keep the two creations distinct.
    bytes32 constant DESCRIPTOR_SALT = bytes32(uint256(0x00));
    bytes32 constant POSM_SALT = bytes32(uint256(0x03));

    function run() external returns (address descriptor, address posm) {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address permit2 = vm.envAddress("PERMIT2");
        address wrappedNative = vm.envOr("WRAPPED_NATIVE", address(0));
        uint256 unsubscribeGasLimit = vm.envOr("UNSUBSCRIBE_GAS_LIMIT", uint256(300_000));
        bytes32 nativeLabel = bytes32(bytes(vm.envOr("NATIVE_LABEL", string("USDC"))));

        require(poolManager.code.length > 0, "POOL_MANAGER has no code on this chain");
        require(permit2.code.length > 0, "PERMIT2 has no code on this chain");
        // Only a PoolManager answers this. Deploying a POSM bound to something else would produce a
        // contract that looks fine and mints into a singleton nobody trades on.
        (bool okPm,) = poolManager.staticcall(abi.encodeWithSignature("protocolFeeController()"));
        require(okPm, "POOL_MANAGER is not a v4 PoolManager (protocolFeeController() failed)");

        vm.startBroadcast();
        descriptor = _create2(
            vm.getCode("PositionDescriptor.sol:PositionDescriptor"),
            abi.encode(poolManager, wrappedNative, nativeLabel),
            DESCRIPTOR_SALT
        );
        posm = _create2(
            vm.getCode("PositionManager.sol:PositionManager"),
            abi.encode(poolManager, permit2, unsubscribeGasLimit, descriptor, wrappedNative),
            POSM_SALT
        );
        vm.stopBroadcast();

        // Close the loop: the whole point is a POSM bound to THIS PoolManager, so assert it rather
        // than trust the constructor args we just passed.
        (bool ok, bytes memory ret) = posm.staticcall(abi.encodeWithSignature("poolManager()"));
        require(ok && ret.length == 32, "deployed PositionManager does not answer poolManager()");
        require(abi.decode(ret, (address)) == poolManager, "deployed PositionManager bound elsewhere");

        console2.log("PositionDescriptor deployed:", descriptor);
        console2.log("PositionManager deployed:   ", posm);
        console2.log("  bound to PoolManager:     ", poolManager);
        console2.log("  permit2:                  ", permit2);
        console2.log("  wrappedNative (0 = none): ", wrappedNative);
        console2.log("");
        console2.log("Next: pass this as POSITION_MANAGER to DeployCoilLaunchpad, and set");
        console2.log("NEXT_PUBLIC_<CHAIN>_V4_POSITION_MANAGER in the web env if the site needs it.");
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
