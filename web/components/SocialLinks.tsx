/** Small row of social/website links for a token. Renders nothing if none are set. */
export function SocialLinks({
  website,
  twitter,
  telegram,
  className = "",
}: {
  website?: string;
  twitter?: string;
  telegram?: string;
  className?: string;
}) {
  const links = [
    twitter && { href: twitter, label: "X", icon: <XIcon /> },
    telegram && { href: telegram, label: "Telegram", icon: <span className="text-sm">✈</span> },
    website && { href: website, label: "Website", icon: <span className="text-sm">🌐</span> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];

  if (links.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70 transition hover:border-venom-500/40 hover:text-venom-400"
        >
          {l.icon}
          <span>{l.label}</span>
        </a>
      ))}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}
