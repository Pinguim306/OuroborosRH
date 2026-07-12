export const runtime = "nodejs";

/**
 * Uploads a token image to IPFS via Pinata. The secret lives server-side only —
 * set PINATA_JWT in Vercel (Project → Settings → Environment Variables). Get a
 * free JWT at app.pinata.cloud (API Keys). Returns { url: "ipfs://<cid>" }.
 */
export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return Response.json(
      { error: "Image uploads aren't configured. Add PINATA_JWT in Vercel to enable them." },
      { status: 501 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "No file provided." }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return Response.json({ error: "Image exceeds 4 MB." }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/gif"].includes(file.type)) {
    return Response.json({ error: "Use a .jpg, .png or .gif." }, { status: 400 });
  }

  try {
    const out = new FormData();
    out.append("file", file, file.name || "token-image");
    const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: out,
    });
    if (!r.ok) return Response.json({ error: "IPFS upload failed." }, { status: 502 });
    const j = (await r.json()) as { IpfsHash?: string };
    if (!j.IpfsHash) return Response.json({ error: "IPFS upload failed." }, { status: 502 });
    return Response.json({ url: `ipfs://${j.IpfsHash}` });
  } catch {
    return Response.json({ error: "IPFS upload failed." }, { status: 502 });
  }
}
