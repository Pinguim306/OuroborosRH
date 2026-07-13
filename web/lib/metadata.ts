/**
 * Token metadata resolution.
 *
 * A token's on-chain `metadataURI` points at either:
 *   - a JSON metadata file (new tokens): { name, symbol, description, image, website,
 *     twitter, telegram } — the standard shape external platforms read; or
 *   - an image directly (older tokens) or a short emoji/string.
 *
 * `resolveTokenMeta` normalizes all of those into { image, socials }.
 */

export interface TokenMeta {
  image: string; // http(s) url, or an emoji/short string to render as text
  name?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export function ipfsToHttp(uri: string): string {
  return uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
}

const cache = new Map<string, TokenMeta>();

function isUrl(s: string): boolean {
  return s.startsWith("http") || s.startsWith("ipfs://");
}

/** Turn a loosely-typed social value into a full URL (or undefined). */
export function normalizeSocial(kind: "website" | "twitter" | "telegram", value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (kind === "twitter") return `https://x.com/${v.replace(/^@/, "")}`;
  if (kind === "telegram") return `https://t.me/${v.replace(/^@/, "").replace(/^t\.me\//, "")}`;
  return `https://${v}`;
}

export async function resolveTokenMeta(uri?: string): Promise<TokenMeta> {
  if (!uri) return { image: "" };
  if (cache.has(uri)) return cache.get(uri)!;

  // Default: treat the URI itself as the image (or an emoji/short string).
  const fallback: TokenMeta = { image: isUrl(uri) ? ipfsToHttp(uri) : uri };
  let meta = fallback;

  if (isUrl(uri)) {
    try {
      const r = await fetch(ipfsToHttp(uri));
      const ct = r.headers.get("content-type") || "";
      // Only parse JSON metadata; for an image response we keep the fallback and
      // avoid draining the body (the <img> tag will load it from cache).
      if (ct.includes("json") || ct.includes("text/plain")) {
        const j = (await r.json()) as Record<string, unknown>;
        if (j && typeof j === "object") {
          const img = typeof j.image === "string" && j.image ? ipfsToHttp(j.image) : fallback.image;
          meta = {
            image: img,
            name: typeof j.name === "string" ? j.name : undefined,
            description: typeof j.description === "string" ? j.description : undefined,
            website: normalizeSocial("website", (j.website ?? j.external_url) as string | undefined),
            twitter: normalizeSocial("twitter", (j.twitter ?? j.x) as string | undefined),
            telegram: normalizeSocial("telegram", j.telegram as string | undefined),
          };
        }
      }
    } catch {
      /* keep fallback */
    }
  }

  cache.set(uri, meta);
  return meta;
}
