export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  // A minimal ouroboros: a ring with a snake head meeting its tail.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="ouro" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dffb2" />
          <stop offset="0.5" stopColor="#22e584" />
          <stop offset="1" stopColor="#c8ff4d" />
        </linearGradient>
      </defs>
      <path
        d="M24 6a18 18 0 1 1-12.7 5.3"
        stroke="url(#ouro)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* snake head */}
      <path d="M9 10.5 L15 8 L14 15 Z" fill="url(#ouro)" />
      {/* eye */}
      <circle cx="13" cy="11" r="1.1" fill="#05070a" />
    </svg>
  );
}
