// The token radar's model: a fitted value model over the sealed snapshot, written from scratch.
//
// What the peers say, not what a fixed multiple assumes. The 128 live-token protocols (a market cap
// recorded, TVL above zero) anchor the fit, and every pre-token row is priced from them:
//
//   log(mcap) = a + b * log(TVL) + category_residual + gw * growth + ms * (age_share - 0.5)
//
//   size        a, b come from an ordinary least-squares fit of log market cap on log TVL over the
//               live peers. The slope lands near 0.5: the multiple falls with size, so a fixed
//               multiple overvalues the giants and undervalues the small. (A fixed multiple is the
//               baseline the walk-forward test beats.)
//   category    the median residual of a category's live peers, shrunk toward zero by n / (n + 5),
//               so a category with one or two peers barely moves a row. Unknown categories get 0.
//   growth      gw is grid-searched (0, 0.25, 0.5, 0.75, 1) to minimise the median absolute log
//               error on the dated live peers; growth is the 7-day TVL change clamped to [-60, 120]
//               per cent, in units of 100 per cent. The peers give last week's growth a small
//               positive weight: hot money counts for something, but not much.
//   maturity    ms is grid-searched the same way; age_share is the protocol's age over 1095 days,
//               unknown age counted as 365 days. Older pre-token rows price slightly higher: they
//               survived long enough to matter.
//
// The fit is validated walk-forward: the dated live peers are split by their listing date, the whole
// pipeline (size fit, category residuals, grid) is refit on the older half and tested on the newer
// half, and the test error is reported next to the fixed-multiple baseline. The shipped model is then
// refit on all live peers.
//
// Launch odds come from the peers' record too: the share of protocols that record a token, by
// category and age bucket (<1y, 1-3y, 3y+, unknown), shrunk toward the category share (k = 8) and
// the category share toward the global share (k = 8). The odds never enter the implied value — the
// value is what a token would be worth if issued — but they do enter the farm verdict, through the
// expected value (implied x odds) per farming dollar, ranked against the rest of the board.
//
// No protocol name is ever special-cased: the same functions score every row, and the board is
// deterministic — two runs write the same bytes.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The fitted model, everything the dashboard's model panel shows. */
export interface ModelFit {
  version: string;
  live_peers: number;
  dated_peers: number;
  size_intercept: number;
  size_slope: number;
  category_residual: Record<string, { n: number; residual: number }>;
  growth_weight: number;
  maturity_slope: number;
  growth_grid: number[];
  maturity_grid: number[];
  /** Median absolute log error of the fitted model on the dated live peers (in-sample). */
  fit_male: number;
  /** The same, with growth and maturity switched off. */
  fit_male_no_terms: number;
  /** The walk-forward test: fit on the older half of dated peers, tested on the newer half. */
  walk_forward: {
    train_n: number;
    test_n: number;
    cutoff: string;
    train_growth_weight: number;
    train_maturity_slope: number;
    model_male: number;
    baseline_male: number;
  };
  odds: {
    global: number;
    by_category: Record<string, number>;
    cells: Record<string, { n: number; with_token: number; odds: number }>;
  };
}

export const MODEL_VERSION = 'radar-2-size-elastic';

/** The grid the growth and maturity weights are searched over (median absolute log error). */
export const GROWTH_GRID = [0, 0.25, 0.5, 0.75, 1];
export const MATURITY_GRID = [0, 0.25, 0.5, 0.75, 1];

/** Shrinkage strength for a category's residual and for the odds (prior weight in protocols). */
export const SHRINK_K = 5;
export const ODDS_K = 8;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  farm_cost_usd: number;
  farm_verdict: 'Farm' | 'Thin' | 'Skip';
  model: {
    size_intercept: number;
    size_slope: number;
    category_residual: number;
    growth_pct: number;
    growth_weight: number;
    maturity_slope: number;
    age_share: number;
    log_prediction: number;
    implied_multiple: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its farm plan, verdict and live peers. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_odds: number;
  expected_value_usd: number;
  farm_cost_usd: number;
  farm_verdict: 'Farm' | 'Thin' | 'Skip';
  model: BoardRow['model'];
  farm_steps: string[];
  /** The live-token peers in the row's own category, by market cap: the anchors behind its residual. */
  comps: LiveRow[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelFit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The 7-day TVL change clamped to [-60, 120] per cent, in units of 100 per cent. */
export function growthUnits(p: SnapshotProtocol): number {
  return Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100;
}

/** The protocol's age as a share of 1095 days; unknown age counts as 365 days. */
export function ageShare(asOf: string, p: SnapshotProtocol): number {
  const age = ageDays(asOf, p.listed_at);
  return Math.min(age ?? 365, 1095) / 1095;
}

/** The age bucket the odds table uses. */
export function ageBucket(asOf: string, p: SnapshotProtocol): string {
  const age = ageDays(asOf, p.listed_at);
  if (age === null) return 'unknown';
  if (age < 365) return '<1y';
  if (age < 1095) return '1-3y';
  return '3y+';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Exchange names a protocol name must not begin with (the watchlist's rule). */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whole words that mark a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank as a future launch: pre-token, not an exchange, not a
 * versioned pool, and not a wrapped or staked product of a token that already trades.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !WRAPPED_WORD.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}

/** The live-token peers the size fit trains on: a market cap recorded, TVL above zero. */
export function livePeers(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The ordinary least-squares line of log market cap on log TVL over `train`. */
export function fitSizeLine(train: SnapshotProtocol[]): { intercept: number; slope: number } {
  const n = train.length;
  const xs = train.map((p) => Math.log(p.tvl_usd));
  const ys = train.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((t, v) => t + v, 0) / n;
  const my = ys.reduce((t, v) => t + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** A category's median residual off the size line, shrunk toward zero by n / (n + k). */
export function fitCategoryResiduals(train: SnapshotProtocol[], line: { intercept: number; slope: number }): Record<string, { n: number; residual: number }> {
  const byCategory = new Map<string, number[]>();
  for (const p of train) {
    const residual = Math.log(p.mcap_usd!) - (line.intercept + line.slope * Math.log(p.tvl_usd));
    const key = p.category ?? 'Unknown';
    const list = byCategory.get(key) ?? [];
    list.push(residual);
    byCategory.set(key, list);
  }
  const out: Record<string, { n: number; residual: number }> = {};
  for (const [key, values] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    out[key] = { n: values.length, residual: median(values) * (values.length / (values.length + SHRINK_K)) };
  }
  return out;
}

/** The log implied value of one protocol under a fitted size line, residuals and term weights. */
export function logPrediction(
  p: SnapshotProtocol,
  asOf: string,
  line: { intercept: number; slope: number },
  residuals: Record<string, { n: number; residual: number }>,
  growthWeight: number,
  maturitySlope: number,
): number {
  return (
    line.intercept +
    line.slope * Math.log(p.tvl_usd) +
    (residuals[p.category ?? 'Unknown']?.residual ?? 0) +
    growthWeight * growthUnits(p) +
    maturitySlope * (ageShare(asOf, p) - 0.5)
  );
}

/** The median absolute log error of a fitted model over `test` (dated peers only). */
export function maleOn(
  test: SnapshotProtocol[],
  asOf: string,
  line: { intercept: number; slope: number },
  residuals: Record<string, { n: number; residual: number }>,
  growthWeight: number,
  maturitySlope: number,
): number {
  return median(test.map((p) => Math.abs(Math.log(p.mcap_usd!) - logPrediction(p, asOf, line, residuals, growthWeight, maturitySlope))));
}

/** The growth and maturity weights that minimise the median absolute log error over `dated`. */
export function fitTermWeights(
  dated: SnapshotProtocol[],
  asOf: string,
  line: { intercept: number; slope: number },
  residuals: Record<string, { n: number; residual: number }>,
): { growth_weight: number; maturity_slope: number; male: number } {
  let best: { growth_weight: number; maturity_slope: number; male: number } | null = null;
  for (const gw of GROWTH_GRID) {
    for (const ms of MATURITY_GRID) {
      const male = maleOn(dated, asOf, line, residuals, gw, ms);
      if (best === null || male < best.male) best = { growth_weight: gw, maturity_slope: ms, male };
    }
  }
  return best!;
}

/** The peer token share by category and age bucket, shrunk toward the category and global shares. */
export function fitOdds(snapshot: Snapshot): ModelFit['odds'] {
  const eligible = snapshot.protocols.filter((p) => p.category !== 'CEX');
  const global = eligible.filter((p) => p.mcap_usd !== null).length / eligible.length;
  const byCategory = new Map<string, { withToken: number; n: number }>();
  for (const p of eligible) {
    const key = p.category ?? 'Unknown';
    const cell = byCategory.get(key) ?? { withToken: 0, n: 0 };
    cell.n += 1;
    if (p.mcap_usd !== null) cell.withToken += 1;
    byCategory.set(key, cell);
  }
  const categoryOdds: Record<string, number> = {};
  for (const [key, cell] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    categoryOdds[key] = (cell.withToken + ODDS_K * global) / (cell.n + ODDS_K);
  }
  const cells: Record<string, { n: number; with_token: number; odds: number }> = {};
  const byCell = new Map<string, { withToken: number; n: number }>();
  for (const p of eligible) {
    const key = `${p.category ?? 'Unknown'}|${ageBucket(snapshot.as_of, p)}`;
    const cell = byCell.get(key) ?? { withToken: 0, n: 0 };
    cell.n += 1;
    if (p.mcap_usd !== null) cell.withToken += 1;
    byCell.set(key, cell);
  }
  for (const [key, cell] of [...byCell.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const category = key.slice(0, key.lastIndexOf('|'));
    const prior = categoryOdds[category] ?? global;
    cells[key] = { n: cell.n, with_token: cell.withToken, odds: (cell.withToken + ODDS_K * prior) / (cell.n + ODDS_K) };
  }
  return { global, by_category: categoryOdds, cells };
}

/** One protocol's launch odds from the fitted odds table. */
export function launchOdds(p: SnapshotProtocol, asOf: string, odds: ModelFit['odds']): number {
  const key = `${p.category ?? 'Unknown'}|${ageBucket(asOf, p)}`;
  const cell = odds.cells[key];
  if (cell !== undefined && cell.n >= 5) return cell.odds;
  return odds.by_category[p.category ?? 'Unknown'] ?? odds.global;
}

/** The whole fit: size line, category residuals, term weights, walk-forward test and odds. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const peers = livePeers(snapshot);
  const dated = peers.filter((p) => p.listed_at !== null);
  const line = fitSizeLine(peers);
  const residuals = fitCategoryResiduals(peers, line);
  const terms = fitTermWeights(dated, snapshot.as_of, line, residuals);
  const fitMaleNoTerms = maleOn(dated, snapshot.as_of, line, residuals, 0, 0);

  // Walk-forward: older half of the dated peers trains the pipeline, the newer half tests it.
  const ordered = [...dated].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(ordered.length / 2);
  const train = ordered.slice(0, half);
  const test = ordered.slice(half);
  const trainLine = fitSizeLine(train);
  const trainResiduals = fitCategoryResiduals(train, trainLine);
  const trainTerms = fitTermWeights(train, snapshot.as_of, trainLine, trainResiduals);
  const modelMale = maleOn(test, snapshot.as_of, trainLine, trainResiduals, trainTerms.growth_weight, trainTerms.maturity_slope);
  const baselineMultiple = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const baselineMale = median(test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(p.tvl_usd * baselineMultiple))));

  return {
    version: MODEL_VERSION,
    live_peers: peers.length,
    dated_peers: dated.length,
    size_intercept: round4(line.intercept),
    size_slope: round4(line.slope),
    category_residual: residuals,
    growth_weight: terms.growth_weight,
    maturity_slope: terms.maturity_slope,
    growth_grid: GROWTH_GRID,
    maturity_grid: MATURITY_GRID,
    fit_male: round4(terms.male),
    fit_male_no_terms: round4(fitMaleNoTerms),
    walk_forward: {
      train_n: train.length,
      test_n: test.length,
      cutoff: train[train.length - 1]!.listed_at!,
      train_growth_weight: trainTerms.growth_weight,
      train_maturity_slope: trainTerms.maturity_slope,
      model_male: round4(modelMale),
      baseline_male: round4(baselineMale),
    },
    odds: fitOdds(snapshot),
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The gas a full farm run costs: setup plus one action a week for the hold. */
function gasFor(holdDays: number): number {
  return 8 + Math.ceil(holdDays / 7) * 2;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave it in range.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a ${name} market that settles after the hold.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the whole hold.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  if (c.includes('launchpad')) return `Commit $${capital} to the next ${name} sale on ${chain} and hold the allocation.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and compound the rewards weekly.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * The verdict compares the expected value (implied value x launch odds) per farming dollar with the
 * rest of the board: Farm is the top quarter, Thin the second quarter, Skip the bottom half.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, capital: number, hold: number, gas: number): FarmStep[] {
  const chain = chainOf(p);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet for this farm alone, fund it with $${capital + gas}, and keep its seed phrase offline.`,
      cost: 'about $8 of gas to set up',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital plus about $8 of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week — a deposit, a borrow, a swap or a vote — and save every transaction hash.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity lands in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before withdrawing, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelFit): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a
  // replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const line = { intercept: model.size_intercept, slope: model.size_slope };
  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const logPred = logPrediction(p, snapshot.as_of, line, model.category_residual, model.growth_weight, model.maturity_slope);
    const implied = Math.max(1, Math.round(Math.exp(logPred)));
    const odds = launchOdds(p, snapshot.as_of, model.odds);
    const expected = Math.max(1, Math.round(implied * odds));
    const hold = holdDaysFor(age);
    const capital = capitalFor(p);
    const gas = gasFor(hold);
    return {
      p,
      age,
      implied,
      odds,
      expected,
      hold,
      capital,
      gas,
      cost: capital + gas,
      logPred,
    };
  });
  // The verdict ranks expected value per farming dollar against the rest of the board:
  // the top quarter farms, the second quarter is thin, the bottom half is skipped.
  const byRatio = [...scored].sort((a, b) => b.expected / b.cost - a.expected / a.cost || (a.p.slug < b.p.slug ? -1 : 1));
  const verdictOf = new Map<string, 'Farm' | 'Thin' | 'Skip'>();
  byRatio.forEach((s, i) => verdictOf.set(s.p.slug, i < Math.floor(scored.length / 4) ? 'Farm' : i < Math.floor(scored.length / 2) ? 'Thin' : 'Skip'));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const verdict = verdictOf.get(s.p.slug)!;
    const growthPct = Math.min(120, Math.max(-60, finite(s.p.change_7d, 0)));
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      launch_odds: round4(s.odds),
      expected_value_usd: s.expected,
      farm_cost_usd: s.cost,
      farm_verdict: verdict,
      model: {
        size_intercept: model.size_intercept,
        size_slope: model.size_slope,
        category_residual: round4(model.category_residual[s.p.category ?? 'Unknown']?.residual ?? 0),
        growth_pct: growthPct,
        growth_weight: model.growth_weight,
        maturity_slope: model.maturity_slope,
        age_share: round4(ageShare(snapshot.as_of, s.p)),
        log_prediction: round4(s.logPred),
        implied_multiple: round4(s.implied / s.p.tvl_usd),
      },
      farm_steps: farmSteps(s.p, s.age, s.capital, s.hold, s.gas).map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with its farm plan, verdict and live peers. */
export function radarRow(row: BoardRow, comps: LiveRow[]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_odds: row.launch_odds,
    expected_value_usd: row.expected_value_usd,
    farm_cost_usd: row.farm_cost_usd,
    farm_verdict: row.farm_verdict,
    model: row.model,
    farm_steps: row.farm_steps,
    comps,
  };
}

/** The live-token peers in one category, by market cap: the anchors behind its residual. */
export function liveComps(snapshot: Snapshot, category: string | null): LiveRow[] {
  const key = category ?? 'Unknown';
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && (p.category ?? 'Unknown') === key)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 3)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const model = fitModel(snapshot);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const compsByCategory = new Map<string, LiveRow[]>();
  const rows = board.map((row) => {
    const key = row.category ?? 'Unknown';
    let comps = compsByCategory.get(key);
    if (comps === undefined) {
      comps = liveComps(snapshot, row.category);
      compsByCategory.set(key, comps);
    }
    return radarRow(row, comps);
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
