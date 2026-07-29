// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @dev Compiles the vendored v4-periphery contracts into `out/` so the deploy script can reach them
 *   with `vm.getCode`.
 *
 * They cannot simply be imported by the script and `new`ed: PositionManager is ~24 KB, and a script
 * that embeds it in its own creation code blows the EIP-170 limit when Forge deploys the script to
 * simulate it. Upstream hits the same wall and solves it the same way — `vm.getCode` + CREATE2 — but
 * `vm.getCode` only finds artifacts that were actually built, and Forge builds `src/`, `test/` and
 * `script/`, never `lib/` except as a dependency of those.
 *
 * So this file exists purely to BE that dependency. It has no code of its own.
 */

// solhint-disable no-unused-import
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
import {PositionDescriptor} from "@uniswap/v4-periphery/src/PositionDescriptor.sol";
