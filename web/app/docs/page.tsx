import type { Metadata } from "next";
import Link from "next/link";
import { NATIVE_SYMBOL } from "@/lib/chain";

export const metadata: Metadata = {
  title: "Docs — Coil",
  description:
    "How the Coil launchpad works: instant Uniswap v4 launches, locked liquidity, the native per-swap fee, holder rewards, the $COIL buy&burn, and safety.",
};

/** Sidebar / on-page navigation. Each entry maps to a section id below. */
const sections = [
  { id: "intro", label: "Introduction" },
  { id: "loop", label: "The loop" },
  { id: "launch", label: "Launching a token" },
  { id: "dev-buy", label: "Dev buy" },
  { id: "fees", label: "Fees & the split" },
  { id: "rewards", label: "Holder rewards" },
  { id: "points", label: "Coil Points" },
  { id: "legacy", label: "Legacy curve tokens" },
  { id: "safety", label: "Safety" },
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
              How Coil works
            </h1>
            <p className="mt-3 text-white/55">
              A fair-launch protocol where every token is born on a live Uniswap v4 pool with its
              liquidity locked forever. A native per-swap fee flows back to holders and buys &amp;
              burns $COIL. Everything below is enforced on-chain.
            </p>
          </header>

          <Section id="intro" title="Introduction">
            <p>
              Coil is a launchpad on Robinhood Chain. Every launch goes{" "}
              <strong>straight into a Uniswap v4 pool</strong>: the token is tradable the second the
              launch transaction confirms. The difference is <strong>the loop</strong>: a small fee
              is taken on every swap by the pool&apos;s hook and split on-chain the instant it&apos;s
              taken — a share streams to holders, and a slice buys and burns $COIL.
            </p>
            <p>
              There are no presales, no team allocations, and no privileged mint. The entire supply
              is minted as pool liquidity and <strong>locked forever</strong> — the same rules apply
              to every participant, including the creator.
            </p>
          </Section>

          <Section id="loop" title="The loop">
            <p>Four steps, no leaks:</p>
            <ol className="my-4 space-y-3">
              <Step n={1} title="Trade">
                Buy and sell on a live Uniswap v4 pool from second one. Every swap pays a small
                native fee, taken by the hook inside the trade — not a fee-on-transfer, so
                aggregators and bots route it fine.
              </Step>
              <Step n={2} title="Locked liquidity">
                The whole supply is minted as the pool&apos;s liquidity, owned by the hook itself,
                which renounces ownership at launch. There is no withdraw function — the position is
                locked by construction.
              </Step>
              <Step n={3} title="Fees → Split">
                The per-swap fee is split on-chain the instant it&apos;s taken: holders, the
                protocol, and a burn slice that buys and burns $COIL. No harvest button — it happens
                on every trade.
              </Step>
              <Step n={4} title="Rewards → Holders">
                Just hold. Your share of the fees accrues automatically, proportional to your
                balance. Connect your wallet and claim anytime — no staking.
              </Step>
            </ol>
          </Section>

          <Section id="launch" title="Launching a token">
            <p>
              A single transaction on the <Link href="/create" className="lnk">Launch</Link> page
              does everything: deploys the token and its hook, creates and initializes the Uniswap
              v4 pool, mints the entire supply as liquidity, and renounces ownership so the position
              is locked forever. You provide a name, ticker, description, image, and optional socials.
            </p>
            <KeyVals
              rows={[
                ["Total supply", "1,000,000,000 tokens"],
                ["Creation fee", "none — you only pay network gas"],
                ["Liquidity", "entire supply, locked forever (un-ruggable)"],
                ["Tradable", "instantly on Coil Swap"],
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
              Creators can optionally buy their own token right after launch — a{" "}
              <strong>dev buy</strong> — fired as a follow-up swap through Coil Swap in a second
              transaction, moments after the pool goes live. It pays the same per-swap fee as any
              other trade.
            </p>
          </Section>

          <Section id="fees" title="Fees & the split">
            <p>
              The only trading fee is a <strong>native per-swap fee</strong> — 1% by default — taken
              by the pool&apos;s hook inside every swap (the pool&apos;s own Uniswap LP fee is 0%, so
              the trader is never charged twice). It is split on-chain the instant it is taken, with
              no harvest step and nothing left for a caller to skim. The default split (the protocol
              can retune it on-chain, capped at 5% total):
            </p>
            <KeyVals
              rows={[
                ["Holders", "30% of the fee — streamed as rewards, no staking"],
                ["Protocol", "50% of the fee — the wallet that operates Coil"],
                ["Buy & burn $COIL", "20% of the fee — buys $COIL on-market and burns it"],
              ]}
            />
            <p>
              Buys pay the fee in {NATIVE_SYMBOL}; sells pay it in the token — each side is split the
              same three ways. Tokens carry <strong>no transfer tax</strong> — wallet-to-wallet
              transfers are always free.
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

          <Section id="points" title="Coil Points">
            <p>
              <strong>Season 1 is live.</strong> Points are a reputation score computed entirely
              from public on-chain events — no signup, no snapshot, nothing to opt into. Using the
              loop is earning:
            </p>
            <KeyVals
              rows={[
                ["Trade", "1,000 pts per ETH of buy/sell volume"],
                ["Launch", "500 pts per token launched"],
                ["Build volume", "100 pts per ETH of volume your tokens generate"],
                ["Ape early", "250 pts for being one of a token's first 10 buyers"],
              ]}
            />
            <p>
              Anti-wash rule: volume only counts on tokens at least 3 distinct wallets have traded.
              See the live board on the <Link href="/points" className="lnk">Points</Link> page.
              Points are a reputation metric only — they carry no guaranteed monetary value, yield,
              or future entitlement of any kind.
            </p>
          </Section>

          <Section id="legacy" title="Legacy tokens">
            <p>
              Earlier versions of Coil launched tokens two other ways: on a bonding curve that
              migrated to a DEX pair once filled, and, more recently, straight into a Uniswap V3 pool
              (whose 1% fee tier was harvested and split to holders). New launches use neither path —
              every token now launches on Uniswap v4 — but every legacy token keeps working exactly
              as before: its page, trading, rewards, and fee harvest remain fully functional.
            </p>
          </Section>

          <Section id="safety" title="Safety">
            <ul className="my-3 space-y-2">
              <Bullet>
                <strong>Liquidity locked forever.</strong> The pool position is owned by the token&apos;s
                own hook, which renounces ownership at launch. There is no withdraw function, no
                admin, no rug lever — the principal can never leave.
              </Bullet>
              <Bullet>
                <strong>No privileged supply.</strong> The entire supply is minted into the pool. The
                creator&apos;s only way to get tokens is buying them, like everyone else.
              </Bullet>
              <Bullet>
                <strong>No frozen rewards.</strong> Dividend authority is renounced at launch — no
                human can ever exclude a holder from rewards.
              </Bullet>
              <Bullet>
                <strong>Unaudited.</strong> Coil is reference software. Nothing here is financial
                advice. Trade responsibly and only with what you can afford to lose.
              </Bullet>
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <Faq q="Do I need to stake to earn rewards?">
              No. Rewards accrue to your wallet automatically just for holding, proportional to your
              balance. Connect and claim anytime.
            </Faq>
            <Faq q="When does my token become tradable?">
              The second the launch transaction confirms — the pool is created, priced, and funded in
              that same transaction, and it&apos;s live on Coil Swap from the first trade.
            </Faq>
            <Faq q="Can the creator pull the liquidity?">
              No. The pool position is owned by the token&apos;s own hook, which renounces ownership at
              launch, and there is no withdraw function. Not even the protocol can touch the
              principal — only the per-swap fees are ever distributed.
            </Faq>
            <Faq q="Who receives the fees?">
              The 1% native per-swap fee is split on-chain the instant it&apos;s taken: by default 30%
              to holders (or to the creator, on Creator Rewards tokens), 50% to the protocol — the
              wallet that operates Coil — and 20% to buy and burn $COIL.
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
