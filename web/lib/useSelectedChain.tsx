"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CHAIN_PARAM, DEFAULT_CHAIN_ID, parseChainParam, type SupportedChainId } from "./chain";

/**
 * The chain the UI is pointed at — the app's ONE producer of a chain id, so every chain-aware
 * read, link and cache key agrees on where it is.
 *
 * The URL (`?chain=<id>`) stays the shareable source of truth, but React state is what the app
 * renders from. Deriving the value by reading `window.location` on a navigation event does NOT
 * work: `router.push` updates the history entry asynchronously, so a listener fires while the URL
 * is still the old one and the UI silently keeps the previous chain. Switching therefore sets
 * state and the URL together, and popstate (back/forward, or a pasted link) syncs state back.
 */
type Ctx = { chainId: SupportedChainId; setChainId: (id: SupportedChainId) => void };

const ChainCtx = createContext<Ctx>({ chainId: DEFAULT_CHAIN_ID, setChainId: () => {} });

export function SelectedChainProvider({ children }: { children: React.ReactNode }) {
  // SSR and first paint render the default chain; a `?chain=` link corrects on mount. Reading
  // during render would mismatch the server HTML and trip hydration.
  const [chainId, setChain] = useState<SupportedChainId>(DEFAULT_CHAIN_ID);

  useEffect(() => {
    const read = () =>
      setChain(parseChainParam(new URLSearchParams(window.location.search).get(CHAIN_PARAM)));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const setChainId = useCallback((id: SupportedChainId) => {
    setChain(id);
    const url = new URL(window.location.href);
    if (id === DEFAULT_CHAIN_ID) url.searchParams.delete(CHAIN_PARAM);
    else url.searchParams.set(CHAIN_PARAM, String(id));
    // history.replaceState rather than router.push: the chain is a view filter, not a destination,
    // so it shouldn't add a back-button step per toggle — and it updates the URL synchronously.
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const value = useMemo(() => ({ chainId, setChainId }), [chainId, setChainId]);
  return <ChainCtx.Provider value={value}>{children}</ChainCtx.Provider>;
}

/** The currently selected chain id. */
export function useSelectedChainId(): SupportedChainId {
  return useContext(ChainCtx).chainId;
}

/** Setter for the network picker. */
export function useSetSelectedChain(): (id: SupportedChainId) => void {
  return useContext(ChainCtx).setChainId;
}
