export const runtime = "nodejs";

/**
 * Pins a token's metadata JSON (name, symbol, description, image, socials) to IPFS
 * via Pinata and returns { url: "ipfs://<cid>" } to use as the on-chain metadataURI.
 * This is what makes the website/socials entered at launch persist and be readable
 * by the token page and external platforms. Secret (PINATA_JWT) stays server-side.
 */
export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return Response.json(
      { error: "Metadata uploads aren't configured. Add PINATA_JWT in Vercel to enable them." },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const str = (v: unknown, max = 500) =>
    typeof v === "string" ? v.slice(0, max) : undefined;

  // Only persist a known, bounded set of fields.
  const meta = {
    name: str(body.name, 100) ?? "",
    symbol: str(body.symbol, 16) ?? "",
    description: str(body.description, 2000) ?? "",
    image: str(body.image, 400) ?? "",
    website: str(body.website, 300) ?? "",
    twitter: str(body.twitter, 300) ?? "",
    telegram: str(body.telegram, 300) ?? "",
    createdOn: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ouroborosrh.fun").replace(/\/$/, ""),
  };

  try {
    const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pinataContent: meta,
        pinataMetadata: { name: `${meta.symbol || "token"}-metadata.json` },
      }),
    });
    if (!r.ok) return Response.json({ error: "IPFS metadata upload failed." }, { status: 502 });
    const j = (await r.json()) as { IpfsHash?: string };
    if (!j.IpfsHash) return Response.json({ error: "IPFS metadata upload failed." }, { status: 502 });
    return Response.json({ url: `ipfs://${j.IpfsHash}` });
  } catch {
    return Response.json({ error: "IPFS metadata upload failed." }, { status: 502 });
  }
}
