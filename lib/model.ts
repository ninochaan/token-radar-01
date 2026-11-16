// token-radar-01 model: turn the sealed DefiLlama snapshot into a ranked
// board of pre-token protocols, an implied token value for each, and a
// concrete farm plan. Pure and deterministic: the same snapshot bytes
// always produce the same board, byte for byte.
//
// The value model in one paragraph. Protocols that already trade give the
// snapshot its own yardstick: for each category, the median ratio of
// market cap to TVL across the tokenised protocols in that category.
// A pre-token protocol is priced as if its token traded at that same
// ratio — TVL times the category multiple — then adjusted by three
// bounded factors the snapshot itself supplies: seven-day TVL momentum,
// how long the protocol has run at scale with no token, and how many
// chains it spans. Nothing is looked up by name; a protocol the snapshot
// has never seen would be priced by the same rules.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  multiple: number;
  momentum_factor: number;
  age_factor: number;
  breadth_factor: number;
  implied_value_usd: number;
  airdrop_pct: number;
  airdrop_pool_usd: number;
  per_farmer_usd: number;
  farm_steps: string[];
  rank: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  multiple: number;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  protocol_count: number;
  pretoken_count: number;
  live_count: number;
  watchlist_count: number;
  total_implied_usd: number;
  total_airdrop_pool_usd: number;
  global_multiple: number;
  category_multiples: { category: string; multiple: number; comps: number }[];
  categories: string[];
  chains: string[];
  rows: RadarRow[];
  live: LiveRow[];
  screened_count: number;
  screened: { slug: string; name: string; category: string | null; tvl_usd: number; reason: string }[];
}

/** Parse and lightly validate the snapshot JSON the house sealed. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Whole days from one YYYY-MM-DD date to another, both read as UTC. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** A protocol records no token when both token fields are null. */
function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

// ---- The derivative screen ---------------------------------------------
// Recording no token is not the same as awaiting a launch. A bridge's
// vaults hold another chain's asset, a liquid staking token is a traded
// asset in a wrapper, and a wrapped product's launch already happened —
// it is the underlying's. Ranking WBTC as a pre-token protocol would rank
// Bitcoin. The board therefore screens out, with the reason kept for the
// dashboard: derivative categories, versioned re-launches of a protocol
// that already has its token, wrapped/staked products by name, and
// exchange wrappers that carry an exchange's own name. The same screen
// the snapshot's watchlist describes, applied to the whole board.

const DERIVATIVE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Cross Chain Bridge',
  'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Why this protocol is not a launch candidate, or null when it is one. */
function screenReason(p: Protocol): string | null {
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) {
    return `${p.category} — a derivative of assets that already trade, not a launch of its own`;
  }
  if (VERSION_SUFFIX.test(p.name)) return 'a versioned deployment of a protocol line, not a first launch';
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product of a token that already trades';
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return 'an exchange wrapper carrying the exchange\'s name';
  }
  return null;
}

/**
 * The category yardstick: median market-cap/TVL over the snapshot's own
 * tokenised protocols in the category, shrunk toward the global median
 * when a category has few traded peers to learn from.
 */
function categoryMultiples(snapshot: Snapshot): { map: Map<string, number>; global: number; table: Radar['category_multiples'] } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      all.push(ratio);
      const key = p.category ?? 'Uncategorised';
      const list = byCategory.get(key) ?? [];
      list.push(ratio);
      byCategory.set(key, list);
    }
  }
  const global = median(all);
  const map = new Map<string, number>();
  const table: Radar['category_multiples'] = [];
  for (const key of [...byCategory.keys()].sort()) {
    const ratios = byCategory.get(key)!;
    const own = median(ratios);
    // Shrinkage: trust the category's own median fully at 8+ peers,
    // blend toward the global median below that.
    const weight = Math.min(1, ratios.length / 8);
    // The cap is the model's stated discipline: no category's traded
    // peers support pricing a launch above 3x TVL, and one small
    // category's outliers must not price the whole board.
    const blended = clamp(own * weight + global * (1 - weight), 0.02, 3);
    map.set(key, blended);
    table.push({ category: key, multiple: blended, comps: ratios.length });
  }
  table.sort((a, b) => b.multiple - a.multiple);
  return { map, global, table };
}

function multipleFor(map: Map<string, number>, global: number, category: string | null): number {
  if (category === null) return global;
  return map.get(category) ?? global;
}

/** Seven-day TVL momentum as a bounded multiplier: -30% or worse costs
 * 15%, +60% or better adds 30%, a missing figure is neutral. */
function momentumFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return 1 + clamp(change7d, -30, 60) / 100 * 0.5;
}

/** A protocol that has held scale for years with no token carries more
 * pent-up launch value than one listed last month: +4% a year, capped. */
function ageFactor(ageDays: number | null): number {
  if (ageDays === null || ageDays < 0) return 1;
  return 1 + Math.min(ageDays / 365.25, 6) * 0.04;
}

/** Each extra chain is another surface a launch can reward: +2%, capped. */
function breadthFactor(chainCount: number): number {
  return 1 + Math.min(Math.max(chainCount - 1, 0), 5) * 0.02;
}

// ---- Farm plans ------------------------------------------------------
// Steps are generated from the protocol's own record: its category picks
// the playbook, its chains pick the gas figures, its TVL picks the size
// tier. Every step names a cost and a time, because a plan without either
// is a slogan. Figures are planning estimates in plain dollars, from the
// chain's usual fee level, and the dashboard labels them as estimates.

/** Usual cost of one meaningful on-chain action, in dollars, by chain. */
const GAS_USD: Record<string, number> = {
  Ethereum: 8, Solana: 0.03, Base: 0.15, Arbitrum: 0.2, Optimism: 0.2,
  BSC: 0.25, Polygon: 0.05, Avalanche: 0.35, zkSync: 0.15, Linea: 0.15,
  Scroll: 0.2, Mantle: 0.1, Blast: 0.15, Berachain: 0.1, Sonic: 0.05,
  Sui: 0.02, Aptos: 0.02, Tron: 0.5, Bitcoin: 1.5, Cosmos: 0.05,
};

function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 1;
}

function cheapestChain(chains: string[]): string {
  let best = chains[0] ?? 'Ethereum';
  for (const chain of chains) if (gasFor(chain) < gasFor(best)) best = chain;
  return best;
}

function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

type Playbook = 'dex' | 'lending' | 'bridge' | 'staking' | 'vault' | 'cex' | 'rwa' | 'generic';

function playbookFor(category: string | null): Playbook {
  switch (category) {
    case 'Dexs': return 'dex';
    case 'Lending': return 'lending';
    case 'Bridge': case 'Canonical Bridge': case 'Cross Chain Bridge': return 'bridge';
    case 'Liquid Staking': case 'Liquid Restaking': case 'Restaked BTC': return 'staking';
    case 'Yield': case 'Risk Curators': case 'Onchain Capital Allocator': return 'vault';
    case 'CEX': return 'cex';
    case 'RWA': return 'rwa';
    default: return 'generic';
  }
}

/** The share of a launch typically reserved for the community airdrop,
 * by playbook — the model's stated assumption, shown on the dashboard. */
const AIRDROP_PCT: Record<Playbook, number> = {
  dex: 0.1, lending: 0.08, bridge: 0.07, staking: 0.05,
  vault: 0.06, cex: 0.04, rwa: 0.05, generic: 0.06,
};

function farmSteps(p: Protocol): string[] {
  const book = playbookFor(p.category);
  const cheap = cheapestChain(p.chains);
  const gas = gasFor(cheap);
  const gasText = gas < 1 ? `about $${gas.toFixed(2)}` : `about $${gas.toFixed(0)}`;
  const tier = p.tvl_usd >= 500_000_000 ? 3 : p.tvl_usd >= 50_000_000 ? 2 : 1;
  const size = tier === 3 ? '$2,500–$10,000' : tier === 2 ? '$1,000–$2,500' : '$250–$1,000';
  const chainList = p.chains.slice(0, 3).join(', ');
  const steps: string[] = [];

  steps.push(
    `Set up one wallet for ${p.name} and fund it on ${cheap}, its cheapest chain in the snapshot (${gasText} a transaction there). Keep this wallet separate from your main funds; setup takes about 20 minutes and under $5 in first gas.`,
  );

  if (book === 'dex') {
    steps.push(
      `Trade on ${p.name} every week: 6–10 swaps of $100–$500 each way, favouring its main pairs. Budget ${gasText} a swap in gas and about 0.3% in fees and slippage, so a ${size} float costs roughly $15–$40 a month to keep active.`,
    );
    steps.push(
      `Add liquidity to one of its top pools with ${size} split across both sides, and leave it in place rather than hopping pools. Pool fees offset part of the cost; check the position weekly, 10 minutes, and rebalance only when it drifts out of range.`,
    );
  } else if (book === 'lending') {
    steps.push(
      `Supply ${size} of a major asset (ETH or a main stablecoin) on ${p.name} and keep it supplied. Cost is one deposit at ${gasText} plus the opportunity cost of the capital; supplied balances are the record most lending launches reward.`,
    );
    steps.push(
      `Borrow 30–40% against the position and re-supply the borrowed asset, looping once, then hold the loop for weeks at a time. Keep the health factor above 2.0, spend 10 minutes a week checking it, and never let liquidation be the way the position ends.`,
    );
  } else if (book === 'bridge') {
    steps.push(
      `Bridge through ${p.name} on a route you actually use, $200–$1,000 a crossing, at least twice a month and in both directions where it allows. Each crossing costs ${gasText} in gas plus the bridge's own fee, shown before you sign.`,
    );
    steps.push(
      `Spread crossings across the chains it serves (${chainList}) instead of repeating one route: route and chain variety is the visible record a bridge launch can measure. About 15 minutes a route, including the wait for finality.`,
    );
  } else if (book === 'staking') {
    steps.push(
      `Stake ${size} through ${p.name} and hold the receipt token rather than trading it. Entry costs one transaction at ${gasText}; the real cost is the lock-up, so size it as money you can leave for 3–6 months.`,
    );
    steps.push(
      `Put the receipt token to work in one integrated vault or pool the protocol lists, so the same capital earns a second record. Review monthly, 10 minutes, and keep the staking position itself untouched between reviews.`,
    );
  } else if (book === 'vault') {
    steps.push(
      `Deposit ${size} into ${p.name}'s flagship vault or strategy and stay deposited across weekly snapshots. Entry is one deposit at ${gasText}; vault launches measure time-weighted balances, so steady weeks beat one large day.`,
    );
    steps.push(
      `Rotate a smaller second deposit, about a quarter of the first, into its newer strategies as they open. Newer strategies usually carry fewer farmers per dollar, and the pair of positions takes 15 minutes a week to review.`,
    );
  } else if (book === 'cex') {
    steps.push(
      `Complete ${p.name}'s full KYC and keep one verified account in good standing; an exchange launch can only reward accounts it can pay. Setup takes about 30 minutes including document checks and costs nothing.`,
    );
    steps.push(
      `Trade spot weekly, $100–$500 a session, and hold a working balance on the exchange rather than sweeping it out after every trade. Fees run about 0.1% a trade; 20 minutes a week keeps the activity record continuous.`,
    );
  } else if (book === 'rwa') {
    steps.push(
      `Complete ${p.name}'s onboarding and eligibility checks first — real-world-asset platforms gate deposits by jurisdiction. Allow an hour for the paperwork; there is no way to farm this category anonymously.`,
    );
    steps.push(
      `Deposit ${size} into its shortest-duration product and roll it at maturity instead of withdrawing. Yields are stated per product; the launch record is a held balance across several maturities, reviewed 15 minutes a month.`,
    );
  } else {
    steps.push(
      `Use ${p.name}'s core product on ${cheap} with ${size} of working capital, at least once a week, so the wallet builds a long, ordinary usage record. Each session costs about ${gasText} in gas and 15 minutes.`,
    );
    steps.push(
      `Cover its other chains too (${chainList}): one genuine transaction a month on each. A launch can only reward activity its own record shows, and multi-chain users are the cheapest record to stand out in.`,
    );
  }

  steps.push(
    `Join its points, quests or season program if it runs one, and its governance forum or Discord with the same wallet linked. Fifteen minutes a week; off-chain activity is free to keep and is often the tie-breaker between equal on-chain records.`,
  );
  steps.push(
    `Keep a simple log — date, action, amount, transaction hash — in a spreadsheet as you go, 5 minutes a session. If a snapshot or claim ever asks you to prove the record, the log is the proof, and it costs nothing to keep from day one.`,
  );
  steps.push(
    `Review the position monthly: stop adding if the protocol announces a token with terms that exclude your region, if its TVL falls by half in a month, or if a contract incident is disclosed. Farming is a cost you choose weekly, never a sunk cost you must defend.`,
  );
  return steps;
}

// ---- The board ---------------------------------------------------------

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const { map, global, table } = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const preTokenAll = snapshot.protocols.filter(isPreToken);
  const screened = preTokenAll
    .map((p) => ({ p, reason: screenReason(p) }))
    .filter((s) => s.reason !== null)
    .map((s) => ({ slug: s.p.slug, name: s.p.name, category: s.p.category, tvl_usd: s.p.tvl_usd, reason: s.reason! }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
  const preToken = preTokenAll.filter((p) => screenReason(p) === null);
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .map((p) => ({
      slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!, multiple: p.tvl_usd > 0 ? p.mcap_usd! / p.tvl_usd : 0,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  const scored = preToken.map((p) => {
    const multiple = multipleFor(map, global, p.category);
    const ageDays = p.listed_at === null ? null : daysBetween(p.listed_at, snapshot.as_of);
    const momentum = momentumFactor(p.change_7d);
    const age = ageFactor(ageDays);
    const breadth = breadthFactor(p.chains.length);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * age * breadth));
    const pct = AIRDROP_PCT[playbookFor(p.category)];
    const pool = Math.round(implied * pct);
    // An illustrative farmer count that scales with the protocol's size:
    // one farmer per $25k of TVL, held between 2,000 and 200,000.
    const farmers = clamp(Math.round(p.tvl_usd / 25_000), 2_000, 200_000);
    return {
      p, multiple, ageDays, momentum, age, breadth, implied, pct, pool,
      perFarmer: Math.round(pool / farmers),
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: RadarRow[] = scored.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.ageDays,
    watchlist: watch.has(s.p.slug),
    multiple: s.multiple,
    momentum_factor: s.momentum,
    age_factor: s.age,
    breadth_factor: s.breadth,
    implied_value_usd: s.implied,
    airdrop_pct: s.pct,
    airdrop_pool_usd: s.pool,
    per_farmer_usd: s.perFarmer,
    farm_steps: farmSteps(s.p),
    rank: i + 1,
  }));

  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));

  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    protocol_count: snapshot.protocols.length,
    pretoken_count: preToken.length,
    live_count: live.length,
    watchlist_count: snapshot.watchlist.length,
    total_implied_usd: rows.reduce((sum, r) => sum + r.implied_value_usd, 0),
    total_airdrop_pool_usd: rows.reduce((sum, r) => sum + r.airdrop_pool_usd, 0),
    global_multiple: global,
    category_multiples: table,
    categories: [...new Set(rows.map((r) => r.category ?? 'Uncategorised'))].sort(),
    chains: [...new Set(rows.flatMap((r) => r.chains))].sort(),
    rows,
    live,
    screened_count: screened.length,
    screened,
  };
  return { board, radar };
}

/** The gate's shape, checked before anything is written: a refusal here
 * is cheaper than a refused entry. Returns the first problem, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    const row = byRank[i]!;
    if (row.rank !== i + 1) return `rank ${row.rank} breaks the 1..N sequence`;
    if (!slugs.has(row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!(row.implied_value_usd >= 1) || row.implied_value_usd > 100_000_000_000_000) return `${row.slug}: implied value out of range`;
    if (row.implied_value_usd > previous) return `${row.slug}: implied value rises as rank ascends`;
    previous = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug}: ${row.farm_steps.length} farm steps, outside 3..12`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug}: a farm step of ${len} characters, outside 20..600`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data as a script the static page loads beside itself. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
