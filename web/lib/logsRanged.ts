import type {
  Abi,
  ContractEventName,
  GetContractEventsParameters,
  GetContractEventsReturnType,
  PublicClient,
} from "viem";

/**
 * `getContractEvents`, surviving RPCs that can't serve "everything since genesis".
 *
 * The site's log readers ask for `fromBlock: 0`, and on Robinhood Chain's RPC that simply works.
 * Arc's (Blockdaemon) does two things this module exists to absorb, both measured against the
 * live endpoint rather than assumed:
 *
 *   - it PRUNES history: blocks older than a retention window (between 200k and 1M blocks when
 *     probed — roughly a day to four, at Arc's ~2.8 blocks/s) answer `pruned history unavailable`
 *     for log queries. Not slow — gone;
 *   - it CAPS the span of one query: `query exceeds max block range 100000`. Even a 24-hour
 *     window (~240k Arc blocks) is over it.
 *
 * Either error made the caller's single `getContractEvents` throw, and every consumer catches and
 * renders empty — which is how a token page showed "No trades yet" over a market that had trades:
 * silence, not failure.
 *
 * Strategy: try the plain call first, so chains with capable RPCs (and local forks) keep their
 * one-request fast path untouched. Only when the error is recognizably a range/pruning complaint
 * does the fallback engage: find the oldest queryable block (binary search, ~24 one-block probes,
 * cached per chain), clamp the start there, and walk the remainder in chunks under the cap.
 *
 * Honest limitation, on purpose: on a pruning RPC the result covers the RETAINED window, not all
 * of history. For fresh launches that is everything; for older tokens it means recent activity
 * (and holder tallies reconstructed from partial Transfer history undercount early wallets).
 * Complete history on Arc needs an archive endpoint or an indexer — a data-source decision, not
 * something to fake here.
 */

type EventArgs = Parameters<PublicClient["getContractEvents"]>[0];
type EventLogs = Awaited<ReturnType<PublicClient["getContractEvents"]>>;

/** Per-chain discovered constraints; probing is idempotent so races at worst repeat work. */
const BOUNDS = new Map<number, { earliest: bigint; maxRange: bigint }>();

/** Chunk span used when the RPC's own error message doesn't state its cap. */
const FALLBACK_RANGE = 50_000n;

function errText(e: unknown): string {
  const parts: string[] = [];
  let cur = e as { message?: string; details?: string; cause?: unknown } | undefined;
  for (let i = 0; cur && i < 5; i++) {
    if (cur.message) parts.push(cur.message);
    if (cur.details) parts.push(cur.details);
    cur = cur.cause as typeof cur;
  }
  return parts.join(" | ");
}

function isRangeError(e: unknown): boolean {
  return /pruned|history unavailable|max block range|block range|range is too|exceeds.*range|too many blocks/i.test(
    errText(e),
  );
}

/** The cap, when the RPC is polite enough to say it ("query exceeds max block range 100000"). */
function statedMaxRange(e: unknown): bigint | null {
  const m = errText(e).match(/max block range (\d+)/i);
  return m ? BigInt(m[1]) : null;
}

/** One-block probe: does the RPC serve logs at this height? Raw `getLogs`, deliberately — it
 *  needs no ABI, and probing through `getContractEvents` without one throws synchronously, which
 *  read as "unavailable" at every height and drove the search to the tip (found the hard way:
 *  every scan came back empty in exactly the time 24 local throws take). Address-scoped so a
 *  positive probe stays cheap. */
async function canQueryAt(client: PublicClient, address: EventArgs["address"], block: bigint): Promise<boolean> {
  try {
    await client.getLogs({
      address: Array.isArray(address) ? address[0] : address,
      fromBlock: block,
      toBlock: block,
    });
    return true;
  } catch {
    // Range errors mean pruned; anything else (rate limit, transient) also counts as unavailable —
    // conservative: the boundary lands later, never earlier, and the cache keeps probes rare.
    return false;
  }
}

/** Binary-search the oldest block the RPC still answers for. ~log2(height) probes, cached. */
async function earliestQueryable(
  client: PublicClient,
  chainId: number,
  address: EventArgs["address"],
  latest: bigint,
): Promise<bigint> {
  const cached = BOUNDS.get(chainId)?.earliest;
  if (cached !== undefined) return cached;
  let lo = 1n;
  let hi = latest;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (await canQueryAt(client, address, mid)) hi = mid;
    else lo = mid + 1n;
  }
  BOUNDS.set(chainId, {
    earliest: lo,
    maxRange: BOUNDS.get(chainId)?.maxRange ?? FALLBACK_RANGE,
  });
  return lo;
}

/**
 * Drop-in for `client.getContractEvents` on unbounded scans. Generic over the ABI exactly like
 * viem's own action, so `log.args` keeps its inferred shape at every call site.
 */
export async function getEventsRanged<
  const TAbi extends Abi | readonly unknown[],
  TEventName extends ContractEventName<TAbi> | undefined = undefined,
>(
  client: PublicClient,
  args: GetContractEventsParameters<TAbi, TEventName>,
): Promise<GetContractEventsReturnType<TAbi, TEventName>> {
  try {
    return (await client.getContractEvents(args as EventArgs)) as GetContractEventsReturnType<
      TAbi,
      TEventName
    >;
  } catch (e) {
    if (!isRangeError(e)) throw e;

    const a = args as EventArgs;
    const chainId = client.chain?.id ?? 0;
    const latest = typeof a.toBlock === "bigint" ? a.toBlock : await client.getBlockNumber();

    const stated = statedMaxRange(e);
    if (stated) {
      const prev = BOUNDS.get(chainId);
      BOUNDS.set(chainId, { earliest: prev?.earliest ?? 0n, maxRange: stated });
    }

    const earliest = await earliestQueryable(client, chainId, a.address, latest);
    const maxRange = BOUNDS.get(chainId)?.maxRange ?? FALLBACK_RANGE;
    // Stay a hair under the stated cap — providers count boundaries inclusively and off-by-one
    // rejections at exactly the cap were observed while probing.
    const step = maxRange > 2n ? maxRange - 1n : 1n;

    const requested = typeof a.fromBlock === "bigint" ? a.fromBlock : 0n;
    let from = requested > earliest ? requested : earliest;

    // Split off blockHash so TypeScript narrows the rebuilt args to the from/to-block variant —
    // a blockHash query has no range and never lands in this fallback anyway.
    const { blockHash: _ignored, fromBlock: _f, toBlock: _t, ...rest } = a as EventArgs & {
      blockHash?: unknown;
    };

    const out: EventLogs = [];
    while (from <= latest) {
      const to = from + step > latest ? latest : from + step;
      const chunk = await client.getContractEvents({
        ...rest,
        fromBlock: from,
        toBlock: to,
      } as EventArgs);
      out.push(...(chunk as never[]));
      from = to + 1n;
    }
    return out as GetContractEventsReturnType<TAbi, TEventName>;
  }
}
