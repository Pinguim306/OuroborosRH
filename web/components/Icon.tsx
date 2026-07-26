/**
 * The app's icon set. Drawn on a 24-grid with a 1.75 stroke so they sit at the same optical weight
 * as the UI type — emoji were doing this job before, and they render differently on every OS,
 * carry their own colour and can't inherit state (active/hover). These are currentColor.
 */

type IconProps = { size?: number; className?: string };

function Svg({ size = 18, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconHome(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </Svg>
  );
}

export function IconSwap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </Svg>
  );
}

export function IconTrophy(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11" />
      <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 14v3.5" />
      <path d="M8.5 20h7" />
      <path d="M10 17.5h4L15 20H9l1-2.5Z" />
    </Svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function IconRewards(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 12h18" />
      <circle cx="12" cy="16" r="1.6" />
      <path d="M7 8V6.5A2.5 2.5 0 0 1 9.5 4c1.7 0 2.5 1.4 2.5 4 0-2.6.8-4 2.5-4A2.5 2.5 0 0 1 17 6.5V8" />
    </Svg>
  );
}

export function IconSparkle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.8L12 18l-1.7-5.5L4.8 10.7 10.3 9 12 3.5Z" />
      <path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18l.5-1.5Z" />
    </Svg>
  );
}

export function IconBook(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
      <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
      <path d="M8 8h7M8 11.5h5" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/* ── Market / listing ─────────────────────────────────────────────────────────────────────────
 * The set below replaced the emoji that were labelling the sort tabs, badges and the loop
 * diagram. Emoji looked fine on one machine and wrong on the next: a different drawing per OS,
 * a fixed colour that ignores the active/hover state around it, and a vertical rhythm of their
 * own. These inherit `currentColor` and the surrounding size, so a tab can simply go violet when
 * it is selected. */

/** Hot / trending. */
export function IconFlame(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3s4.5 3.6 4.5 8.2A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.8C7.5 8.4 9.6 6.6 12 3Z" />
      <path d="M12 21a5.5 5.5 0 0 0 5.5-5.5c0-1-.2-1.9-.6-2.7M6.5 12.8c-.3.8-.5 1.7-.5 2.7A5.5 5.5 0 0 0 12 21" />
    </Svg>
  );
}

/** Market cap — a stack of value. */
export function IconCoins(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </Svg>
  );
}

/** Volume — traded size over the period. */
export function IconVolume(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V13M9.3 20V8M14.7 20v-9M20 20V4" />
    </Svg>
  );
}

/** Age / oldest. */
export function IconClock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </Svg>
  );
}

/** Most recent trade — instant settlement. */
export function IconBolt(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.5 3 5.8 13.2h5L10.5 21l7.7-10.2h-5L13.5 3Z" />
    </Svg>
  );
}

/* ── Protocol concepts ──────────────────────────────────────────────────────────────────────── */

/** Locked liquidity — the position that can never be withdrawn. */
export function IconLock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" />
    </Svg>
  );
}

/** The fee split — one inflow, three destinations. */
export function IconSplit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12h4" />
      <path d="M8 12c4 0 4-6 8-6h4" />
      <path d="M8 12c4 0 4 6 8 6h4" />
      <path d="M17.5 3.5 20 6l-2.5 2.5M17.5 15.5 20 18l-2.5 2.5" />
    </Svg>
  );
}

/** Creator-rewards tokens: the fee share goes to the creator, not to holders. */
export function IconCrown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 8.5 6.8 14h10.4L20 8.5l-4.2 2.6L12 5.5l-3.8 5.6L4 8.5Z" />
      <path d="M7 17.5h10" />
    </Svg>
  );
}

/** Buy & burn. */
export function IconBurn(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c.4 3 2 3.9 3.4 5.5A6.6 6.6 0 0 1 17.2 14 5.2 5.2 0 0 1 12 20.5 5.2 5.2 0 0 1 6.8 14c0-2.6 1.8-4 2.4-6.2.9 1 1.6 1.4 2 2.2.5-2.3.4-4.5.8-6.5Z" />
    </Svg>
  );
}

/* ── Chrome ─────────────────────────────────────────────────────────────────────────────────── */

export function IconGlobe(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.6 2.4 14.4 0 17M12 3.5c-2.4 2.6-2.4 14.4 0 17" />
    </Svg>
  );
}

export function IconShare(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.5 15.5 15 9M15 9H9.8M15 9v5.2" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    </Svg>
  );
}

export function IconExternal(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.5" />
    </Svg>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.5" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11.5A1.5 1.5 0 0 1 19 6.5V8" />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
      <circle cx="16" cy="13.5" r="1.4" />
    </Svg>
  );
}

export function IconWarning(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v3.6M12 16.6v.4" />
    </Svg>
  );
}

export function IconTelegram(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 4.5 3.8 11c-.7.3-.7 1.3 0 1.5l4.2 1.3 1.6 4.6c.2.6 1 .8 1.4.3l2.2-2.4 4 3c.6.4 1.4.1 1.5-.6l2.5-13c.2-.7-.5-1.3-1.2-1.1Z" />
      <path d="m8 13.8 9.6-6.6-6.3 7.3" />
    </Svg>
  );
}

/** Slippage / preferences. */
export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" />
    </Svg>
  );
}

/** Fallback for a token with no artwork. */
export function IconCoin(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.4 9.6c-.5-.7-1.4-1.1-2.4-1.1-1.4 0-2.4.8-2.4 1.9 0 2.6 5 1.4 5 4 0 1.2-1.1 2-2.6 2-1.1 0-2-.4-2.5-1.1" />
    </Svg>
  );
}

export function IconImage(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4.5 17 4.7-4.5 3.3 3 2.8-2.4 4.2 3.9" />
    </Svg>
  );
}
