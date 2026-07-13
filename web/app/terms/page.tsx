import type { Metadata } from "next";
import Link from "next/link";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: "Terms of Use — Ouroboros",
  description:
    "Terms of Use for the Ouroboros launchpad — eligibility, risks, no financial advice, prohibited uses, and disclaimers.",
};

const LAST_UPDATED = "July 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <div className="label">Legal</div>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">Terms of Use</h1>
        <p className="mt-3 text-sm text-white/45">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="space-y-8">
        <Clause n={1} title="Acceptance of these terms">
          <p>
            Ouroboros (the &quot;Protocol&quot;) is a set of smart contracts and a web interface that
            let anyone launch and trade tokens on Robinhood Chain. By accessing or using the interface
            or the Protocol, you agree to these Terms of Use. If you do not agree, do not use the
            interface or the Protocol.
          </p>
        </Clause>

        <Clause n={2} title="Eligibility">
          <p>
            You must be of legal age in your jurisdiction and legally permitted to use decentralized
            protocols and digital assets. You are responsible for ensuring that your use of the
            Protocol complies with all laws and regulations that apply to you. The interface is not
            offered to any person in a jurisdiction where its use would be unlawful.
          </p>
        </Clause>

        <Clause n={3} title="Non-custodial, decentralized software">
          <p>
            The Protocol is non-custodial. We never take custody of your assets, private keys, or
            tokens. All transactions are executed by autonomous smart contracts and signed by your
            own wallet. You are solely responsible for your wallet, your keys, and every transaction
            you authorize.
          </p>
        </Clause>

        <Clause n={4} title="No financial advice">
          <p>
            Nothing on this interface is financial, investment, legal, or tax advice. Information is
            provided for general purposes only and may be incomplete or out of date. You are solely
            responsible for your own decisions and should consult qualified professionals before
            making any transaction.
          </p>
        </Clause>

        <Clause n={5} title="Assumption of risk">
          <p>
            Digital assets are highly volatile and speculative. Tokens launched through the Protocol
            may lose all value, may have no liquidity, and may be created by anonymous parties. You
            acknowledge and accept that:
          </p>
          <ul className="mt-3 space-y-2">
            <Bullet>You may lose the entire value of any assets you commit.</Bullet>
            <Bullet>
              The Protocol is unaudited reference software and may contain bugs or vulnerabilities.
            </Bullet>
            <Bullet>
              Token prices are determined by open-market trading on automated market makers and can
              move sharply.
            </Bullet>
            <Bullet>
              Blockchain transactions are irreversible; mistaken or fraudulent transactions cannot be
              undone.
            </Bullet>
          </ul>
        </Clause>

        <Clause n={6} title="Tokens are user-generated">
          <p>
            Anyone can launch a token. The Protocol and its operators do not create, endorse, vet, or
            guarantee any token, and the appearance of a token on the interface is not an endorsement.
            Token names, tickers, images, and descriptions are supplied by their creators and may be
            inaccurate or misleading. Do your own research before trading.
          </p>
        </Clause>

        <Clause n={7} title="Fees">
          <p>
            Launching and trading incur fees that are described in the{" "}
            <Link href="/docs" className="text-venom-400 underline hover:text-venom-300">
              documentation
            </Link>{" "}
            and enforced on-chain, including a one-time creation fee and a per-trade fee. A portion of
            each fee is directed to the protocol. Fees may be updated by the protocol owner; the
            current values are always readable on-chain.
          </p>
        </Clause>

        <Clause n={8} title="Ouroboros Points">
          <p>
            The interface may display &quot;points&quot; or similar scores derived from public
            on-chain activity. Points are a reputation metric only: they are not money, securities,
            tokens, or property; they have no guaranteed monetary value; and they confer no right,
            claim, or entitlement to any current or future asset, distribution, or benefit. Scoring
            rules may be changed, reset, or discontinued at any time. Activity intended to game the
            scoring (including wash trading) may be excluded.
          </p>
        </Clause>

        <Clause n={9} title="Prohibited uses">
          <p>You agree not to use the Protocol or interface to:</p>
          <ul className="mt-3 space-y-2">
            <Bullet>Violate any applicable law, regulation, or sanctions program.</Bullet>
            <Bullet>
              Engage in fraud, market manipulation, money laundering, or financing of illegal
              activity.
            </Bullet>
            <Bullet>Infringe the intellectual property or other rights of any third party.</Bullet>
            <Bullet>
              Interfere with, attack, or attempt to gain unauthorized access to the interface or
              contracts.
            </Bullet>
          </ul>
        </Clause>

        <Clause n={10} title="No warranties">
          <p>
            The interface and the Protocol are provided &quot;as is&quot; and &quot;as available,&quot;
            without warranties of any kind, whether express or implied, including merchantability,
            fitness for a particular purpose, and non-infringement. We do not warrant that the
            interface will be uninterrupted, secure, or error-free.
          </p>
        </Clause>

        <Clause n={11} title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, the operators of Ouroboros and their contributors
            will not be liable for any indirect, incidental, special, consequential, or exemplary
            damages, or for any loss of profits, assets, or data, arising out of or relating to your
            use of the interface or the Protocol — even if advised of the possibility of such damages.
          </p>
        </Clause>

        <Clause n={12} title="Changes to these terms">
          <p>
            We may update these Terms from time to time. Changes are effective when posted. Your
            continued use of the interface after changes are posted constitutes acceptance of the
            updated Terms.
          </p>
        </Clause>
      </div>

      <p className="mt-10 border-t border-white/5 pt-6 text-xs leading-relaxed text-white/40">
        {copy.footer.disclaimer}
      </p>
    </div>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <h2 className="font-display text-lg font-bold tracking-tight">
        <span className="mr-2 text-venom-400/70">{n}.</span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-white/60">{children}</div>
    </section>
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
