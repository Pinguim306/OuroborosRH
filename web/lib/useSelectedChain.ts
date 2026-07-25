"use client";

import { useEffect, useState } from "react";
import { CHAIN_PARAM, DEFAULT_CHAIN_ID, parseChainParam, type SupportedChainId } from "./chain";

/**
 * The chain the UI is currently pointed at — the app's ONE producer of a chain id, so every
 * chain-aware read, link and cache key can agree on where it is.
 *
 * Source of truth is the `?chain=<id>` URL param (see chain.ts for the convention). Absent or
 * unknown = the default chain, so every link ever shared keeps resolving to Robinhood Chain and
 * SSR/first paint are unchanged. Read from `window.location` rather than `useSearchParams` to
 * match how the rest of the app reads query params (and to avoid forcing Suspense boundaries).
 */
export function useSelectedChainId(): SupportedChainId {
  const [chainId, setChainId] = useState<SupportedChainId>(DEFAULT_CHAIN_ID);

  useEffect(() => {
    const read = () =>
      setChainId(parseChainParam(new URLSearchParams(window.location.search).get(CHAIN_PARAM)));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  return chainId;
}
