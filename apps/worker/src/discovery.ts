import type { EtsyRuntimeEnv } from "./etsy.js";
import { inferTrendGroup, normalizeKeyword, scanTrend, TREND_NICHES, type TrendGroup, type TrendResult, type TrendStore } from "./etsy-trends.js";
import { upcomingSeasons } from "./seasonal.js";

type Fetcher = typeof fetch;

export interface DiscoverySummary {
  score: number;
  verdict: string;
  activeListings: number;
  favoritesPerMonth: number;
  medianPriceUsd?: number;
  scannedAt: string;
}

export interface DiscoveredPhrase {
  keyword: string;
  group: TrendGroup;
  from: string;
  rising: boolean;
  discoveredAt: string;
  summary?: DiscoverySummary;
}

interface AutopilotState {
  lastScanned: Record<string, string>;
  lastRunAt?: string;
  lastKeyword?: string;
  lastError?: string;
  runs: number;
}

const DISCOVERY_KEY = "etsy:discovered";
const AUTOPILOT_KEY = "etsy:autopilot:state";
const MAX_DISCOVERIES = 80;
const PER_SCAN_LIMIT = 4;
const GENERIC = new Set(["digital download", "instant download", "pdf pattern", "digital pattern", "printable pattern", "gift for her", "gift for him", "gift for mom", "gift idea", "handmade gift", "christmas gift", "birthday gift", "pattern pdf"]);
const CRAFT_WORDS = /\b(crochet|knit|knitting|cross stitch|embroidery|sewing|macrame|punch needle|amigurumi|granny square|quilt|quilting|needlepoint|tunisian|tatting|doily)\b/;
const TESBIH_WORDS = /\b(prayer|beads|tasbih|tesbih|misbaha|worry|islamic|muslim|eid|ramadan|dhikr|subha|rosary|mala)\b/;
const STOP = new Set(["pattern", "pdf", "pattern pdf", "vintage", "for", "and", "the", "with", "gift"]);

function summarize(result: TrendResult): DiscoverySummary {
  return {
    score: result.score,
    verdict: result.verdict,
    activeListings: result.metrics.activeListings,
    favoritesPerMonth: result.metrics.favoritesPerMonth,
    medianPriceUsd: result.metrics.medianPriceUsd,
    scannedAt: result.scannedAt
  };
}

export function extractDiscoveries(result: TrendResult): Array<Omit<DiscoveredPhrase, "discoveredAt">> {
  const group = result.group || inferTrendGroup(result.keyword);
  const seedWords = new Set(result.keyword.split(" ").filter((word) => !STOP.has(word)));
  const rising = new Set((result.risingTags || []).map((item) => item.tag));
  const pool = [...(result.risingTags || []).map((item) => item.tag), ...result.topTags.map((item) => item.tag)];
  const found: Array<Omit<DiscoveredPhrase, "discoveredAt">> = [];
  const seen = new Set<string>([result.keyword]);
  for (const raw of pool) {
    const tag = normalizeKeyword(raw);
    const words = tag.split(" ");
    if (words.length < 2 || tag.length > 40 || GENERIC.has(tag)) continue;
    let phrase = tag;
    if (group === "patterns") {
      if (!CRAFT_WORDS.test(tag) && !words.some((word) => seedWords.has(word))) continue;
      if (!/\b(pattern|pdf|chart|template)\b/.test(tag)) phrase = `${tag} pattern`;
    } else if (group === "tesbih") {
      if (!TESBIH_WORDS.test(tag)) continue;
    } else if (group === "vintage") {
      if (!/\b(vintage|antique|retro)\b/.test(tag) && !words.some((word) => seedWords.has(word))) continue;
    } else if (!words.some((word) => seedWords.has(word))) {
      continue;
    }
    phrase = normalizeKeyword(phrase);
    if (seen.has(phrase) || phrase.length > 45) continue;
    seen.add(phrase);
    found.push({ keyword: phrase, group, from: result.keyword, rising: rising.has(raw) });
    if (found.length >= PER_SCAN_LIMIT) break;
  }
  return found;
}

async function readJson<T>(store: TrendStore, key: string, fallback: T): Promise<T> {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function listDiscoveries(store: TrendStore | undefined): Promise<DiscoveredPhrase[]> {
  if (!store) return [];
  return await readJson<DiscoveredPhrase[]>(store, DISCOVERY_KEY, []);
}

// Her tarama sonrası: keşfedilen ifadenin özetini günceller ve sonuçtan yeni ifadeler çıkarır.
// track: kullanıcının elle taradığı ifade (ör. Google Trends'te gördüğü) otopilot listesine de eklenir.
export async function recordScan(store: TrendStore | undefined, result: TrendResult, now = Date.now(), options: { track?: boolean } = {}): Promise<DiscoveredPhrase[]> {
  if (!store) return [];
  const list = await listDiscoveries(store);
  const seeds = new Set(TREND_NICHES.map((niche) => niche.keyword));
  const existing = new Map(list.map((item) => [item.keyword, item]));
  const current = existing.get(result.keyword);
  if (current) current.summary = summarize(result);
  const added: DiscoveredPhrase[] = [];
  if (options.track && !current && !seeds.has(result.keyword)) {
    const entry: DiscoveredPhrase = { keyword: result.keyword, group: result.group || inferTrendGroup(result.keyword), from: "elle arandı", rising: false, discoveredAt: new Date(now).toISOString(), summary: summarize(result) };
    existing.set(result.keyword, entry);
  }
  for (const item of extractDiscoveries(result)) {
    if (seeds.has(item.keyword) || existing.has(item.keyword)) continue;
    const entry = { ...item, discoveredAt: new Date(now).toISOString() };
    existing.set(item.keyword, entry);
    added.push(entry);
  }
  const ranked = [...existing.values()]
    .sort((a, b) => (b.summary?.score ?? 40) - (a.summary?.score ?? 40) || b.discoveredAt.localeCompare(a.discoveredAt))
    .slice(0, MAX_DISCOVERIES);
  await store.put(DISCOVERY_KEY, JSON.stringify(ranked));
  return added;
}

export async function autopilotStatus(store: TrendStore | undefined) {
  const state = store ? await readJson<AutopilotState>(store, AUTOPILOT_KEY, { lastScanned: {}, runs: 0 }) : { lastScanned: {}, runs: 0 };
  return {
    enabled: Boolean(store),
    lastRunAt: state.lastRunAt,
    lastKeyword: state.lastKeyword,
    lastError: state.lastError,
    runs: state.runs,
    tracked: Object.keys(state.lastScanned).length
  };
}

// Otopilotun sırayla taradığı ifadeler: sabit nişler, yaklaşan ABD sezonları ve Etsy'den keşfedilen ifadeler.
export function autopilotQueue(discovered: DiscoveredPhrase[], now = new Date()): Array<{ keyword: string; group: TrendGroup }> {
  const rows = [
    ...TREND_NICHES.map((niche) => ({ keyword: niche.keyword, group: niche.group })),
    ...upcomingSeasons(now).flatMap((season) => season.keywords),
    ...discovered.map((item) => ({ keyword: item.keyword, group: item.group }))
  ];
  const queue = new Map<string, { keyword: string; group: TrendGroup }>();
  for (const row of rows) {
    const keyword = normalizeKeyword(row.keyword);
    if (!queue.has(keyword)) queue.set(keyword, { keyword, group: row.group });
  }
  return [...queue.values()];
}

// Cron ile çalışır: her çalışmada en uzun süredir taranmamış tek ifadeyi tarar (ücretsiz plan işlemci sınırı için).
export async function runAutopilot(env: EtsyRuntimeEnv, store: TrendStore | undefined, fetcher: Fetcher = fetch, now = new Date()) {
  if (!store || !env.ETSY_API_KEY || !env.ETSY_SHARED_SECRET) return { skipped: true as const };
  const state = await readJson<AutopilotState>(store, AUTOPILOT_KEY, { lastScanned: {}, runs: 0 });
  const queue = autopilotQueue(await listDiscoveries(store), now);
  const next = [...queue].sort((a, b) => (state.lastScanned[a.keyword] || "").localeCompare(state.lastScanned[b.keyword] || ""))[0];
  const keyword = next.keyword;
  state.lastRunAt = now.toISOString();
  state.runs += 1;
  state.lastKeyword = keyword;
  let added: DiscoveredPhrase[] = [];
  try {
    const result = await scanTrend(env, { keyword, group: next.group }, store, fetcher, now.getTime());
    added = await recordScan(store, result, now.getTime());
    state.lastScanned[keyword] = now.toISOString();
    delete state.lastError;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message.slice(0, 200) : "Tarama başarısız.";
  }
  const keep = new Set(queue.map((item) => item.keyword));
  state.lastScanned = Object.fromEntries(Object.entries(state.lastScanned).filter(([key]) => keep.has(key)));
  await store.put(AUTOPILOT_KEY, JSON.stringify(state));
  return { skipped: false as const, keyword, added: added.map((item) => item.keyword), error: state.lastError };
}
