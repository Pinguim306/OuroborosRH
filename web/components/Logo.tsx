export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  // Coil: an outward spiral — a wound spring storing energy (the locked-liquidity flywheel),
  // ending in a bright spark.
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
        <linearGradient id="coil" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b7a6ff" />
          <stop offset="0.5" stopColor="#8b5cff" />
          <stop offset="1" stopColor="#37e8ff" />
        </linearGradient>
      </defs>
      {/* outward spiral, ~2.25 turns */}
      <path
        d="M24 24
           C 25.6 24, 26.4 22.2, 25.4 20.9
           C 23.9 18.8, 20.5 19.6, 19.9 22.3
           C 19.0 26.2, 22.4 29.6, 26.4 29.3
           C 31.8 28.9, 35 23.7, 33.8 18.4
           C 32.3 11.6, 24.9 8.0, 18.4 10.5
           C 10.5 13.5, 7 22.4, 10.4 30"
        stroke="url(#coil)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* spark at the outer tip */}
      <circle cx="10.4" cy="30" r="2.6" fill="#37e8ff" />
      {/* core */}
      <circle cx="24" cy="24" r="1.7" fill="#b7a6ff" />
    </svg>
  );
}
