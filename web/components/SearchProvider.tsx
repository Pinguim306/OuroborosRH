"use client";

import { createContext, useContext, useState } from "react";

type SearchCtx = { query: string; setQuery: (q: string) => void };

const Ctx = createContext<SearchCtx>({ query: "", setQuery: () => {} });

/** Shares the top-bar search text with the home coin grid. Kept in memory (not the URL) so it
 *  survives client navigation without a Suspense boundary. */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return <Ctx.Provider value={{ query, setQuery }}>{children}</Ctx.Provider>;
}

export function useSearch() {
  return useContext(Ctx);
}
