import { encodePacked, getAddress, keccak256, pad, toHex, type Address, type Hex } from "viem";
import { coilContracts, HOOK_FLAG_MASK } from "./contracts";

/**
 * Mine a CREATE2 salt so the CoilHook lands on an address whose low 14 bits encode the required
 * hook flags. Runs in the browser: the address is keccak256(0xff ++ deployer ++ salt ++
 * initCodeHash)[12:], `deployer` is the launchpad (it deploys the hook via `new CoilHook{salt}`)
 * and `initCodeHash` comes from `launchpad.hookInitCodeHash(name, symbol, creator)`.
 *
 * The target comes from the chain the launch is pinned to, because it's the DEPLOYED launchpad's
 * hook version that decides it: CoilHook's constructor compares its own address against
 * `getHookPermissions()` bit for bit, so mining v2 flags (0x2088) against a v1 launchpad reverts
 * `createTokenV4` — after the user has already sat through the mining wait.
 *
 * Expected ~16k tries (a 14-bit target); yields to the event loop periodically so the tab stays
 * responsive and can report progress.
 */
export async function mineSalt(
  deployer: Address,
  initCodeHash: Hex,
  chainId?: number,
  onProgress?: (tried: number) => void,
  maxTries = 1_000_000,
): Promise<{ salt: Hex; address: Address }> {
  const target = coilContracts(chainId).hookFlagsMine;
  for (let i = 0; i < maxTries; i++) {
    const salt = pad(toHex(BigInt(i)), { size: 32 });
    const hash = keccak256(
      encodePacked(["bytes1", "address", "bytes32", "bytes32"], ["0xff", deployer, salt, initCodeHash]),
    );
    const addr = `0x${hash.slice(26)}` as Address; // last 20 bytes
    if ((BigInt(addr) & HOOK_FLAG_MASK) === target) {
      return { salt, address: getAddress(addr) };
    }
    if (i % 3000 === 0) {
      onProgress?.(i);
      // Yield so the UI can paint the progress and stay interactive.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  throw new Error("Could not mine a valid hook address — try a different name/symbol.");
}
