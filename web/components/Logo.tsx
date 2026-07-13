export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  // An ouroboros: a ring with a proper snake head about to bite its tail.
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
      {/* body: open ring, tail tip at the top, head chasing it */}
      <path
        d="M24 6a18 18 0 1 1-12.7 5.3"
        stroke="url(#ouro)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* snake head: rounded skull, tapered snout pointing at the tail */}
      <path
        d="M18.2 7.4
           C 16.9 5.5, 13.4 5.0, 10.9 6.5
           C 8.4 8.0, 7.4 11.0, 8.5 13.3
           C 9.6 15.6, 12.6 16.4, 14.9 15.1
           C 16.7 14.0, 17.9 11.3, 18.2 7.4 Z"
        fill="url(#ouro)"
      />
      {/* eye */}
      <circle cx="12.1" cy="9.6" r="1.25" fill="#05070a" />
      {/* forked tongue flicking toward the tail */}
      <path
        d="M18 7.3 L20.2 6.4 M20.2 6.4 L21.6 5.5 M20.2 6.4 L21.8 6.8"
        stroke="url(#ouro)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
