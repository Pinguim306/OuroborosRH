#!/usr/bin/env bash
# Verify a launched CoilHook token (or any Coil contract) on Blockscout, so it shows as a
# verified CA on the explorer and on aggregators that read it (GMGN, etc.).
#
# Every token the CoilLaunchpad deploys is the same CoilHook source, compiled with the settings
# in foundry.toml (solc 0.8.26, cancun, optimizer 800 runs, via-IR) — the launchpad embeds that
# creation code, so verifying against this repo matches. Once a few instances are verified,
# Blockscout's bytecode DB usually auto-verifies future identical deployments ("similar match");
# until then, run this once per launch.
#
# Usage:
#   RPC_URL=https://rpc.mainnet.chain.robinhood.com ./verify-token.sh 0xTOKEN
#
# Other Coil contracts (one-time):
#   ./verify-token.sh $COIL_LAUNCHPAD src/CoilLaunchpad.sol:CoilLaunchpad
#   ./verify-token.sh $COIL_SWAP_ROUTER src/CoilSwapRouter.sol:CoilSwapRouter
#   ./verify-token.sh $BURNER src/CoilBuybackBurner.sol:CoilBuybackBurner
#
# Requires a recent foundry (`foundryup`) for --guess-constructor-args, which pulls the creation
# tx and derives the constructor args automatically. If your forge lacks the flag, verify once
# through the Blockscout UI (Contract → Verify & Publish → via standard JSON input) — it also
# extracts constructor args by itself.
set -euo pipefail

ADDRESS=${1:?usage: ./verify-token.sh <address> [Contract:Path]}
CONTRACT=${2:-src/CoilHook.sol:CoilHook}
: "${RPC_URL:?set RPC_URL}"
VERIFIER_URL=${VERIFIER_URL:-https://robinhoodchain.blockscout.com/api}

forge verify-contract "$ADDRESS" "$CONTRACT" \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --rpc-url "$RPC_URL" \
  --guess-constructor-args \
  --watch

echo "Done — check https://robinhoodchain.blockscout.com/address/$ADDRESS?tab=contract"
