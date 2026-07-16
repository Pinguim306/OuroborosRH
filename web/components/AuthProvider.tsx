"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { buildSignInMessage } from "@/lib/siwe";

type AuthCtx = {
  /** Lowercased address of the signed-in wallet, or null. */
  sessionAddress: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  sessionAddress: null,
  loading: true,
  signingIn: false,
  error: null,
  signIn: async () => false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the current session on mount.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setSessionAddress(j.address ?? null))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // A session for a different wallet than the one now connected is stale — drop it locally.
  useEffect(() => {
    if (sessionAddress && address && sessionAddress !== address.toLowerCase()) {
      setSessionAddress(null);
    }
  }, [address, sessionAddress]);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      setError("Connect a wallet first.");
      return false;
    }
    setSigningIn(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) throw new Error("Sign-in isn't enabled yet.");
      const { nonce } = await nonceRes.json();
      const issuedAt = new Date().toISOString();
      const message = buildSignInMessage({ address, nonce, issuedAt });
      const signature = await signMessageAsync({ message });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, issuedAt, signature }),
      });
      const j = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(j.error ?? "Sign-in failed.");
      setSessionAddress(j.address);
      return true;
    } catch (e) {
      setError((e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Sign-in failed.");
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [address, isConnected, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSessionAddress(null);
  }, []);

  return (
    <Ctx.Provider value={{ sessionAddress, loading, signingIn, error, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
