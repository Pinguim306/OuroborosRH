import type { Metadata } from "next";
import Link from "next/link";
import { NATIVE_SYMBOL } from "@/lib/chain";

export const metadata: Metadata = {
  title: "Docs — Ouroboros",
  description:
    "How the Ouroboros launchpad works: fair bonding-curve launches, the fee loop, holder rewards, graduation, and safety.",
};

/** Sidebar / on-page navigation. Each entry maps to a section id below. */
const sections = [
  { id: "intro", label: "Introduction" },
  { id: "loop", label: "The loop" },
  { id: "launch", label: "Launching a token" },
  { id: "dev-buy", label: "Dev buy" },
  { id: "curve", label: "The bonding curve" },
  { id: "fees", label: "Fees" },
  { id: "rewards", label: "Holder rewards" },
  { id: "graduation", label: "Graduation" },
  { id: "v3", label: "Instant V3 launch" },
  { id: "points", label: "Ouroboros Points" },
  { id: "safety", label: "Safety & anti-whale" },
  { id: "faq", label: "FAQ" },
] as const;

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="label mb-3">Documentation</div>
            <nav className="flex flex-col gap-1 text-sm">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="rounded-lg px-3 py-1.5 text-white/55 transition hover:bg-white/5 hover:text-white"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <article className="min-w-0 max-w-3xl">
          <header className="mb-10">
            <div className="label">Docs</div>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">
              How Ouroboros works
            </h1>
            <p className="mt-3 text-white/55">
              A fair-launch protocol where trading fees never leave the ecosystem — they become
              permanent liquidity and holder rewards. Everything below is enforced on-chain.
            </p>
          </header>

          <Section id="intro" title="Introduction">
            <p>
              Ouroboros is a pump.fun-style launchpad on Robinhood Chain. Anyone can launch a token
              on a transparent bonding curve, trade it instantly, and — once the curve fills — see it
              graduate to a DEX. The difference is <strong>the loop</strong>: every trade charges a
              small fee that is folded back into liquidity and streamed to holders, instead of being
              siphoned to a treasury.
            </p>
            <p>
              There are no presales, no team allocations, and no privileged mint. The full supply is
              sold through the curve, and the same rules apply to every participant — including the
              creator.
            </p>
          </Section>

          <Section id="loop" title="The loop">
            <p>Four steps, no leaks:</p>
            <ol className="my-4 space-y-3">
              <Step n={1} title="Trade">
                Buy and sell on a constant-product bonding curve. A flat {"1.5%"} fee applies to every
                trade.
              </Step>
              <Step n={2} title="Fees → Liquidity">
                Part of every fee is retained inside the curve as permanent, locked liquidity —
                deepening the market and lifting the price floor.
              </Step>
              <Step n={3} title="Liquidity → Rewards">
                Another slice streams straight into the token contract, pooled in {NATIVE_SYMBOL}.
              </Step>
              <Step n={4} title="Rewards → Holders">
                Just hold. Your share of the fees accrues automatically, proportional to your balance.
                Connect your wallet and claim anytime — no staking.
              </Step>
            </ol>
          </Section>

          <Section id="launch" title="Launching a token">
            <p>
              A single transaction on the <Link href="/create" className="lnk">Launch</Link> page
              deploys everything: the dividend token, its bonding curve, and the rewards vault, all
              wired into the loop. You provide a name, ticker, description, image, and optional
              socials.
            </p>
            <KeyVals
              rows={[
                ["Total supply", "1,000,000,000 tokens"],
                ["Creation fee", "none — you only pay network gas"],
                ["Graduation target", `4 ${NATIVE_SYMBOL} raised`],
                ["Max buy", "2% of supply per transaction"],
              ]}
            />
            <p>
              Launching is free — you pay only the network gas. Any excess {NATIVE_SYMBOL} you
              send is refunded in the same transaction. (A creation fee can be configured
              on-chain by the protocol; it is currently set to zero.)
            </p>
          </Section>

          <Section id="dev-buy" title="Dev buy">
            <p>
              Creators can optionally buy their own token in the very same launch transaction — a{" "}
              <strong>dev buy</strong> — so they can secure an initial position before anyone else
              trades. To keep launches fair, the dev buy is capped at the same{" "}
              <strong>2% of supply</strong> anti-whale limit that applies to every other buyer. It is
              executed on the curve at the launch price and pays the standard trade fee, exactly like
              any normal buy.
            </p>
          </Section>

          <Section id="curve" title="The bonding curve">
            <p>
              Price is set by a constant-product virtual-reserve curve. As tokens are bought the price
              rises along the curve; as they are sold it falls. There is no order book and no external
              market maker — the curve is always available and fully on-chain.
            </p>
            <p>
              A small virtual {NATIVE_SYMBOL} seed sets the starting price and is paired with the
              graduation target so that the price on the curve stays close to the price the token will
              have on the DEX after graduation.
            </p>
          </Section>

          <Section id="fees" title="Fees">
            <p>
              Every trade on the curve charges a flat <strong>1.5%</strong> fee, split three ways
              on-chain:
            </p>
            <KeyVals
              rows={[
                ["Protocol", "0.5% — supports the platform"],
                ["Liquidity", "0.6% — retained in the curve as permanent liquidity"],
                ["Holders", "0.4% — streamed to holders as rewards"],
              ]}
            />
            <p>
              The <strong>protocol</strong> is the platform&apos;s fee recipient — the wallet that
              runs Ouroboros. The fee split and recipient are configurable by the protocol owner, but
              the three destinations are fixed in the contract.
            </p>
            <p>
              After a curve token <strong>graduates</strong>, a <strong>1% trade tax</strong>{" "}
              (hard-capped at 2%) applies to swaps against its DEX pair and flows to the
              protocol vault — wallet-to-wallet transfers are never taxed. Instant-V3 tokens
              instead pay the pool&apos;s own 1% fee tier (see{" "}
              <a href="#v3" className="lnk">Instant V3 launch</a>).
            </p>
          </Section>

          <Section id="rewards" title="Holder rewards">
            <p>
              The token itself is a dividend token. Every time the holder-fee is streamed in, a
              dividend accumulator credits each holder&apos;s share proportional to their balance and
              keeps it correct as balances move. There are <strong>no snapshots</strong> to game and{" "}
              <strong>no staking</strong> to lock.
            </p>
            <p>
              Connect your wallet on the <Link href="/rewards" className="lnk">Rewards</Link> page to
              see everything you&apos;ve earned across the tokens you hold, and claim whenever you
              want. Hold longer and you are simply present for more inflows.
            </p>
            <p>
              At launch the creator picks one of two <strong>rewards modes</strong>, fixed forever:
            </p>
            <KeyVals
              rows={[
                ["🐍 Loop Rewards", "the fee share streams to every holder — the classic loop"],
                ["👑 Creator Rewards", "the same fee share is paid to the creator's wallet instead"],
              ]}
            />
            <p>
              Creator Rewards tokens are clearly badged on their token page, and their Rewards
              panel explains that holding them does not accrue {NATIVE_SYMBOL}.
            </p>
          </Section>

          <Section id="graduation" title="Graduation">
            <p>
              When cumulative real {NATIVE_SYMBOL} raised reaches the <strong>graduation target</strong>{" "}
              (4 {NATIVE_SYMBOL}), the curve graduates. It migrates all remaining tokens and the real{" "}
              {NATIVE_SYMBOL} it holds into a DEX pair as permanent liquidity, and the LP tokens are
              burned — so the liquidity can never be pulled.
            </p>
            <p>
              Graduated tokens keep trading — the market simply moves onto a deep, locked DEX pool,
              and the token&apos;s page switches to a live DEX chart.
            </p>
          </Section>

          <Section id="v3" title="Instant V3 launch">
            <p>
              Besides the bonding curve, the Launch page offers a second mode:{" "}
              <strong>Instant V3 pool</strong>. The token launches straight into a Uniswap V3
              pool — no curve, no graduation. It is tradable the second the launch transaction
              confirms, with full DexScreener history from the very first trade.
            </p>
            <KeyVals
              rows={[
                ["Liquidity", "entire supply, locked forever in the FeeLocker (un-ruggable)"],
                ["Pool fee", "1% on every swap — harvested for the protocol and holders"],
                ["Holder rewards", "40% of harvested ETH fees, claimable as usual (no staking)"],
                ["Max buy", "none (V3 has no hook for a cap)"],
                ["Dev buy", "executes as the pool's first swap — cannot be front-run"],
              ]}
            />
            <p>
              The 1% pool fee accrues inside the locked position and is released by a
              permissionless <strong>Harvest</strong> — anyone can trigger it from the token
              page; the split is enforced on-chain, so the caller receives nothing. Buys pay
              the fee in {NATIVE_SYMBOL}; sells pay it in the token, and that token side goes
              to the protocol. V3-mode tokens carry no transfer tax.
            </p>
          </Section>

          <Section id="points" title="Ouroboros Points">
            <p>
              <strong>Season 1 is live.</strong> Points are a reputation score computed entirely
              from public on-chain events — no signup, no snapshot, nothing to opt into. Using the
              loop is earning:
            </p>
            <KeyVals
              rows={[
                ["Trade", "1,000 pts per ETH of buy/sell volume (curve or V3)"],
                ["Launch", "500 pts per token launched"],
                ["Build volume", "100 pts per ETH of volume your tokens generate"],
                ["Ape early", "250 pts for being one of a token's first 10 buyers"],
                ["Graduate", "2,000 pts when a token you created graduates"],
              ]}
            />
            <p>
              Anti-wash rule: volume only counts on tokens at least 3 distinct wallets have traded.
              See the live board on the <Link href="/points" className="lnk">Points</Link> page.
              Points are a reputation metric only — they carry no guaranteed monetary value, yield,
              or future entitlement of any kind.
            </p>
          </Section>

          <Section id="safety" title="Safety & anti-whale">
            <ul className="my-3 space-y-2">
              <Bullet>
                <strong>Anti-whale cap.</strong> During the curve, no single buy can take more than 2%
                of supply — including the creator&apos;s dev buy.
              </Bullet>
              <Bullet>
                <strong>Permanent liquidity.</strong> The liquidity fee stays in the curve, and at
                graduation the migrated LP is burned. There is no rug lever.
              </Bullet>
              <Bullet>
                <strong>No frozen rewards.</strong> After graduation, dividend authority is renounced —
                no human can ever exclude a holder from rewards.
              </Bullet>
              <Bullet>
                <strong>Unaudited.</strong> Ouroboros is reference software. Nothing here is financial
                advice. Trade responsibly and only with what you can afford to lose.
              </Bullet>
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <Faq q="Do I need to stake to earn rewards?">
              No. Rewards accrue to your wallet automatically just for holding, proportional to your
              balance. Connect and claim anytime.
            </Faq>
            <Faq q="What happens to my token after it graduates?">
              It keeps trading. Liquidity is migrated to a DEX pair and locked (LP burned), and the
              token page shows a live DEX chart.
            </Faq>
            <Faq q="Can the creator dump on me?">
              The creator is subject to the same 2%-of-supply cap as everyone else, and buys on the
              same curve at the same price. There are no privileged allocations.
            </Faq>
            <Faq q="Who receives the fees?">
              The liquidity slice stays in the curve, the holder slice goes to holders, and the
              protocol slice goes to the protocol — the wallet that operates Ouroboros.
            </Faq>
          </Section>

          <div className="mt-12 flex flex-wrap gap-3 border-t border-white/5 pt-8">
            <Link href="/create" className="btn-primary">Launch a token</Link>
            <Link href="/discover" className="btn-ghost">Explore the market</Link>
          </div>
        </article>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/5 py-8 first:border-0 first:pt-0">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-white/65 [&_a.lnk]:text-venom-400 [&_a.lnk]:underline [&_a.lnk:hover]:text-venom-300 [&_strong]:font-semibold [&_strong]:text-white/85">
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-venom-500/15 text-xs font-bold text-venom-400">
        {n}
      </span>
      <span>
        <strong className="font-semibold text-white/85">{title}.</strong> {children}
      </span>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-venom-500/60" />
      <span>{children}</span>
    </li>
  );
}

function KeyVals({ rows }: { rows: [string, string][] }) {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/5">
      {rows.map(([k, v], i) => (
        <div
          key={k}
          className={`flex items-center justify-between px-4 py-2.5 text-sm ${
            i % 2 ? "bg-white/0" : "bg-white/[0.02]"
          }`}
        >
          <span className="text-white/50">{k}</span>
          <span className="font-medium text-white/80">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="font-semibold text-white/85">{q}</div>
      <div className="mt-1.5 text-sm text-white/60">{children}</div>
    </div>
  );
}
