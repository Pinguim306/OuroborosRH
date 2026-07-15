import { encodePacked, getAddress, keccak256, pad, toHex, type Address, type Hex } from "viem";
import { COIL_HOOK_FLAGS, HOOK_FLAG_MASK } from "./contracts";

/**
 * Mine a CREATE2 salt so the CoilHook lands on an address whose low 14 bits encode the required
 * hook flags (BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA = 0x88). Runs in the browser: the address is
 * keccak256(0xff ++ deployer ++ salt ++ initCodeHash)[12:], and `deployer` is the launchpad (it
 * deploys the hook via `new CoilHook{salt}`), `initCodeHash` comes from
 * `launchpad.hookInitCodeHash(name, symbol, creator)`.
 *
 * Expected ~16k tries (a 14-bit target); yields to the event loop periodically so the tab stays
 * responsive and can report progress.
 */
export async function mineSalt(
  deployer: Address,
  initCodeHash: Hex,
  onProgress?: (tried: number) => void,
  maxTries = 1_000_000,
): Promise<{ salt: Hex; address: Address }> {
  for (let i = 0; i < maxTries; i++) {
    const salt = pad(toHex(BigInt(i)), { size: 32 });
    const hash = keccak256(
      encodePacked(["bytes1", "address", "bytes32", "bytes32"], ["0xff", deployer, salt, initCodeHash]),
    );
    const addr = `0x${hash.slice(26)}` as Address; // last 20 bytes
    if ((BigInt(addr) & HOOK_FLAG_MASK) === COIL_HOOK_FLAGS) {
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
