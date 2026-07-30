// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @dev Gets Uniswap's `PositionManager` compiled into the profile's artifact directory so
 *   `script/DeployPositionManager.s.sol` can deploy it through `vm.getCode`. It has no code of its
 *   own and is never deployed.
 *
 * Three constraints collide here, and this file is the only shape that satisfies all of them:
 *
 *   1. PositionManager does not fit EIP-170 at an ordinary optimizer setting. Upstream pins it to 500
 *      runs in their foundry.toml; `compilation_restrictions` here mirrors that. At this project's
 *      800 the sibling PositionDescriptor comes out 26,069 bytes and is simply undeployable.
 *   2. A pinned file can only be imported by files compiled at the SAME setting — otherwise Forge
 *      refuses the build with "incompatible settings restrictions". So the deploy script cannot
 *      import it, and neither can a test. Hence `vm.getCode`, and hence this file, which IS pinned to
 *      500 (see foundry.toml) and so may import it.
 *   3. `vm.getCode` only finds artifacts that were built, and Forge builds `src/` — but prunes to the
 *      script's own dependency graph when running `forge script`. A forcing file under `script/`
 *      therefore does NOT get built by `forge script`, which is exactly how this was first shipped
 *      broken ("vm.getCode: no matching artifact found"). Under `src/`, a plain `forge build`
 *      produces the artifact and the script finds it.
 */

// solhint-disable-next-line no-unused-import
import {PositionManager} from "@uniswap/v4-periphery/src/PositionManager.sol";
