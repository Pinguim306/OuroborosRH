import type { Metadata } from "next";
import { fetchMarket, normalizeAddress } from "@/lib/server/launchpad";
import { resolveTokenMeta } from "@/lib/metadata";
import { chainParam, CHAIN_PARAM, parseChainParam } from "@/lib/chain";
import { TokenView } from "./TokenView";

/**
 * Per-coin share metadata.
 *
 * The view itself is a client component (wallet, live reads, local state), so this thin server
 * wrapper exists purely to own `generateMetadata`. Without it every coin ever shared on X,
 * Telegram or Discord unfurled as the generic site card — same title, same description, no
 * artwork, for all of them. On a launchpad whose growth *is* people posting their coin, that is
 * the most-seen surface in the product.
 *
 * It has to be the *page* rather than a layout: `?chain=` is what identifies which network's coin
 * this is, and Next only passes `searchParams` to pages. Read from a layout, an Arc link would be
 * described using Robinhood Chain's market data.
 */

type Props = {
  params: { address: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const address = normalizeAddress(params.address);
  if (!address) return {};

  const raw = searchParams?.[CHAIN_PARAM];
  const chainId = parseChainParam(Array.isArray(raw) ? raw[0] : raw);

  try {
    const market = await fetchMarket(address, chainId);
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
        url: `/token/${address}${chainParam(chainId)}`,
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
    // A share card is never worth failing a page render over — fall back to the site defaults.
    return {};
  }
}

export default function TokenPage() {
  return <TokenView />;
}
