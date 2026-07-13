"use client";

import { useTokenMeta } from "@/lib/useMeta";
import { ipfsToHttp } from "@/lib/metadata";

/**
 * Token avatar that resolves the metadataURI (JSON metadata or a direct image) to
 * the actual image, falling back to an emoji/short string rendered as text. Pass
 * the box styles via `className`.
 */
export function TokenAvatar({
  uri,
  symbol,
  className,
  imgClassName = "h-full w-full object-cover",
}: {
  uri: string;
  symbol?: string;
  className?: string;
  imgClassName?: string;
}) {
  const meta = useTokenMeta(uri);
  // Before resolution, show the URI directly (instant for image-URI tokens).
  const image = meta?.image ?? (uri && (uri.startsWith("http") || uri.startsWith("ipfs")) ? ipfsToHttp(uri) : uri);
  const isImg = !!image && (image.startsWith("http") || image.startsWith("ipfs"));
  return (
    <div className={className}>
      {isImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={symbol ?? ""} className={imgClassName} />
      ) : (
        image || "🪙"
      )}
    </div>
  );
}
