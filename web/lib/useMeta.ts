"use client";

import { useEffect, useState } from "react";
import { resolveTokenMeta, type TokenMeta } from "./metadata";

/** Resolve a token's metadataURI (JSON or image) to { image, socials }. */
export function useTokenMeta(uri?: string): TokenMeta | undefined {
  const [meta, setMeta] = useState<TokenMeta | undefined>();

  useEffect(() => {
    let alive = true;
    if (!uri) {
      setMeta(undefined);
      return;
    }
    resolveTokenMeta(uri).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [uri]);

  return meta;
}
