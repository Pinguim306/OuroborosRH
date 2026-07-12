import { NATIVE_SYMBOL } from "./chain";

export function compact(n: number, digits = 2): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + "K";
  if (abs > 0 && abs < 0.001) return n.toExponential(1);
  return n.toFixed(digits);
}

export function rh(n: number, digits = 2): string {
  return `${compact(n, digits)} ${NATIVE_SYMBOL}`;
}

export function usd(n: number): string {
  return `$${compact(n)}`;
}

/** Format an ETH amount as USD using the live ETH price; falls back to ETH. */
export function usdFromEth(eth: number, ethUsd: number, digits = 2): string {
  if (!ethUsd || !isFinite(ethUsd)) return rh(eth, digits);
  const v = eth * ethUsd;
  if (v > 0 && v < 0.01) return "<$0.01";
  return `$${compact(v, digits)}`;
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function timeAgo(unixSeconds: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - unixSeconds));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
