import type { Metadata } from "next";
import { fetchMarket, normalizeAddress } from "@/lib/server/launchpad";
import { resolveTokenMeta } from "@/lib/metadata";

/**
 * Per-coin share metadata.
 *
 * The page itself is a client component, so it can't export `generateMetadata` — which meant every
 * coin ever shared on X, Telegram or Discord unfurled as the generic site card: same title, same
 * description, no artwork, for all of them. On a launchpad whose growth *is* people posting their
 * coin, that is the most-seen surface in the product.
 *
 * This server layout wraps the page purely to attach that metadata. It reads the market from the
 * chain the same way the public API does, and falls back to the site defaults whenever the read
 * fails — a share card is never worth failing a page render over.
 */

type Props = { params: { address: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const address = normalizeAddress(params.address);
  if (!address) return {};

  try {
    const market = await fetchMarket(address);
    if (!market) return {};

    const meta = await resolveTokenMeta(market.metadataURI);
    const title = `${market.name} ($${market.symbol}) — Coil`;
    const description =
      meta.description?.trim() ||
      `${market.name} trades on a Uniswap v4 pool with its liquidity locked forever. Every swap pays a native fee split on-chain between holders, the protocol and the $COIL buy & burn.`;

    // The coin's own artwork when it has some, the site card otherwise. `resolveTokenMeta` also
    // returns emoji/short strings for older tokens, so only take it when it is really a URL.
    const image = meta.image?.startsWith("http") ? meta.image : "/og.png";

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        url: `/token/${address}`,
        images: [{ url: image, alt: `${market.name} on Coil` }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
      },
    };
  } catch {
    return {};
  }
}

export default function TokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
