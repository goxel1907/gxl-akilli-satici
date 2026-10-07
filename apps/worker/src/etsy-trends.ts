import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";

type Fetcher = typeof fetch;

export type PatternCraft = "crochet" | "knitting" | "embroidery" | "cross_stitch" | "sewing" | "macrame" | "punch_needle";

export type TrendGroup = "patterns" | "tesbih" | "vintage" | "other";

export interface TrendNiche {
  id: string;
  keyword: string;
  labelTr: string;
  group: TrendGroup;
  craft?: PatternCraft;
}

interface GroupProfile {
  labelTr: string;
  expectsDigital?: boolean;
  priceUsd: [number, number];
}

export const TREND_GROUPS: Record<TrendGroup, GroupProfile> = {
  patterns: { labelTr: "Hobi desenleri", expectsDigital: true, priceUsd: [2, 12] },
  tesbih: { labelTr: "Tesbih ve gümüş", expectsDigital: false, priceUsd: [15, 250] },
  vintage: { labelTr: "Vintage", expectsDigital: false, priceUsd: [15, 250] },
  other: { labelTr: "Diğer", priceUsd: [10, 150] }
};

export const TREND_NICHES: TrendNiche[] = [
  { id: "crochet-doily", keyword: "crochet doily pattern", labelTr: "Tığ işi dantel / sehpa örtüsü", group: "patterns", craft: "crochet" },
  { id: "crochet-bag", keyword: "crochet bag pattern", labelTr: "Tığ işi çanta", group: "patterns", craft: "crochet" },
  { id: "amigurumi", keyword: "amigurumi pattern", labelTr: "Amigurumi oyuncak", group: "patterns", craft: "crochet" },
  { id: "crochet-cardigan", keyword: "crochet cardigan pattern", labelTr: "Tığ işi hırka", group: "patterns", craft: "crochet" },
  { id: "crochet-top", keyword: "crochet top pattern", labelTr: "Tığ işi bluz / top", group: "patterns", craft: "crochet" },
  { id: "granny-square", keyword: "granny square pattern", labelTr: "Granny square motif", group: "patterns", craft: "crochet" },
  { id: "crochet-flower", keyword: "crochet flower pattern", labelTr: "Tığ işi çiçek", group: "patterns", craft: "crochet" },
  { id: "crochet-blanket", keyword: "crochet blanket pattern", labelTr: "Tığ işi battaniye", group: "patterns", craft: "crochet" },
  { id: "knit-sweater", keyword: "knitting sweater pattern", labelTr: "Şiş örgü kazak", group: "patterns", craft: "knitting" },
  { id: "knit-slippers", keyword: "knit slippers pattern", labelTr: "Şiş örgü patik / babet", group: "patterns", craft: "knitting" },
  { id: "baby-knitting", keyword: "baby knitting pattern", labelTr: "Bebek örgüsü", group: "patterns", craft: "knitting" },
  { id: "cross-stitch", keyword: "cross stitch pattern", labelTr: "Kanaviçe / etamin", group: "patterns", craft: "cross_stitch" },
  { id: "embroidery", keyword: "embroidery pattern", labelTr: "Nakış / işleme", group: "patterns", craft: "embroidery" },
  { id: "punch-needle", keyword: "punch needle pattern", labelTr: "Punch nakış", group: "patterns", craft: "punch_needle" },
  { id: "sewing-pattern", keyword: "sewing pattern pdf", labelTr: "Dikiş kalıbı", group: "patterns", craft: "sewing" },
  { id: "macrame", keyword: "macrame pattern", labelTr: "Makrome", group: "patterns", craft: "macrame" },
  { id: "silver-prayer-beads", keyword: "sterling silver prayer beads", labelTr: "925 gümüş tesbih", group: "tesbih" },
  { id: "tasbih", keyword: "tasbih", labelTr: "Tesbih (tasbih)", group: "tesbih" },
  { id: "misbaha", keyword: "misbaha", labelTr: "Misbaha", group: "tesbih" },
  { id: "worry-beads", keyword: "worry beads", labelTr: "Worry beads / oyalama tesbihi", group: "tesbih" },
  { id: "amber-prayer-beads", keyword: "amber prayer beads", labelTr: "Kehribar tesbih", group: "tesbih" },
  { id: "islamic-gift-men", keyword: "islamic gift for men", labelTr: "Erkeğe İslami hediye", group: "tesbih" },
  { id: "vintage-silver-jewelry", keyword: "vintage sterling silver jewelry", labelTr: "Vintage gümüş takı", group: "vintage" },
  { id: "vintage-brooch", keyword: "vintage brooch", labelTr: "Vintage broş", group: "vintage" },
  { id: "vintage-turkish-rug", keyword: "vintage turkish rug", labelTr: "Vintage Türk halısı", group: "vintage" },
  { id: "vintage-kilim-pillow", keyword: "vintage kilim pillow", labelTr: "Vintage kilim yastık", group: "vintage" },
  { id: "vintage-copper", keyword: "vintage copper", labelTr: "Vintage bakır", group: "vintage" },
  { id: "vintage-prayer-beads", keyword: "vintage prayer beads", labelTr: "Vintage tesbih", group: "vintage" }
];

export function inferTrendGroup(keyword: string): TrendGroup {
  if (/\b(pattern|pdf|printable|template|svg|chart)\b/i.test(keyword)) return "patterns";
  if (/\b(vintage|antique|retro)\b/i.test(keyword)) return "vintage";
  if (/\b(tasbih|tesbih|tespih|misbaha|prayer beads|worry beads|komboloi|islamic)\b/i.test(keyword)) return "tesbih";
  return "other";
}

export interface TrendStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface TrendExample {
  title: string;
  url?: string;
  favorites: number;
  ageDays: number;
  priceUsd?: number;
}

export interface TrendResult {
  keyword: string;
  group: TrendGroup;
  nicheId?: string;
  labelTr?: string;
  craft?: PatternCraft;
  score: number;
  verdict: "Yüksek fırsat" | "Denenebilir" | "Zor / doygun";
  parts: { demand: number; openness: number; newcomer: number; price: number };
  metrics: {
    activeListings: number;
    favoritesPerMonth: number;
    newcomerShare: number;
    digitalShare: number;
    medianPriceUsd?: number;
    sampleSize: number;
  };
  reasons: string[];
  topTags: Array<{ tag: string; count: number }>;
  examples: TrendExample[];
  scannedAt: string;
  cached?: boolean;
}

interface EtsyMoney { amount?: number; divisor?: number; currency_code?: string }
interface EtsyListingRow {
  title?: string;
  url?: string;
  num_favorers?: number;
  listing_type?: string;
  tags?: string[];
  original_creation_timestamp?: number;
  created_timestamp?: number;
  creation_timestamp?: number;
  price?: EtsyMoney;
  converted_price?: EtsyMoney;
}

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FORCE_REFRESH_AFTER_MS = 30 * 60 * 1000;
const PAGE_ONE_SIZE = 48;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function priceUsd(listing: EtsyListingRow): number | undefined {
  for (const money of [listing.converted_price, listing.price]) {
    if (money?.currency_code === "USD" && Number(money.divisor) > 0) return Number(money.amount) / Number(money.divisor);
  }
  return undefined;
}

function ageDays(listing: EtsyListingRow, now: number): number {
  const created = Number(listing.original_creation_timestamp || listing.created_timestamp || listing.creation_timestamp || 0);
  if (!created) return 365;
  return Math.max(1, Math.round((now - created * 1000) / DAY_MS));
}

export function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{Nd}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function scoreTrend(keyword: string, payload: { count?: number; results?: unknown[] }, now = Date.now(), group: TrendGroup = inferTrendGroup(keyword)): TrendResult {
  const profile = TREND_GROUPS[group];
  const listings = (Array.isArray(payload.results) ? payload.results : []).filter((row): row is EtsyListingRow => Boolean(row && typeof row === "object"));
  const activeListings = Math.max(0, Number(payload.count || listings.length));
  const pageOne = listings.slice(0, PAGE_ONE_SIZE);

  const velocities = pageOne.map((listing) => Number(listing.num_favorers || 0) / Math.max(1, ageDays(listing, now) / 30));
  const favoritesPerMonth = median(velocities);
  const newcomerShare = pageOne.length ? pageOne.filter((listing) => ageDays(listing, now) <= 180).length / pageOne.length : 0;
  const digitalShare = listings.length ? listings.filter((listing) => listing.listing_type === "download" || listing.listing_type === "both").length / listings.length : 0;
  const prices = pageOne.map(priceUsd).filter((value): value is number => typeof value === "number" && value > 0);
  const medianPriceUsd = prices.length ? Math.round(median(prices) * 100) / 100 : undefined;

  const parts = {
    demand: Math.round(clamp(100 * Math.log10(1 + favoritesPerMonth) / Math.log10(101))),
    openness: Math.round(100 - clamp(100 * (Math.log10(Math.max(activeListings, 1)) - 2) / (Math.log10(500_000) - 2))),
    newcomer: Math.round(100 * newcomerShare),
    price: medianPriceUsd === undefined ? 50 : Math.round(clamp(priceScore(medianPriceUsd, profile.priceUsd)))
  };
  const digitalMismatch = listings.length > 0 && (
    (profile.expectsDigital === true && digitalShare < 0.3) ||
    (profile.expectsDigital === false && digitalShare > 0.5)
  );
  let score = 0.4 * parts.demand + 0.25 * parts.openness + 0.2 * parts.newcomer + 0.15 * parts.price;
  if (digitalMismatch) score *= 0.8;
  score = Math.round(clamp(score));

  const tagCounts = new Map<string, number>();
  for (const listing of pageOne) {
    for (const raw of Array.isArray(listing.tags) ? listing.tags : []) {
      const tag = String(raw).toLowerCase().trim();
      if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  const examples = pageOne
    .map((listing, index) => ({ listing, velocity: velocities[index] }))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 5)
    .map(({ listing }) => ({
      title: String(listing.title || "").slice(0, 140),
      url: listing.url ? String(listing.url) : undefined,
      favorites: Number(listing.num_favorers || 0),
      ageDays: ageDays(listing, now),
      priceUsd: priceUsd(listing)
    }));

  const reasons = [
    `Üst sıradaki ilanlar ayda ortanca ${favoritesPerMonth.toFixed(1)} favori alıyor (talep göstergesi).`,
    `${activeListings.toLocaleString("tr-TR")} aktif ilanla rekabet ediliyor.`,
    `İlk ${pageOne.length} ilanın %${Math.round(newcomerShare * 100)} kadarı son 6 ayda açılmış; yeni mağazanın öne çıkma şansı buna bağlı.`,
    medianPriceUsd === undefined ? "Fiyat verisi alınamadı." : `Üst sıradaki ilanların ortanca fiyatı ${medianPriceUsd.toFixed(2)} USD.`,
    ...(digitalMismatch && profile.expectsDigital ? [`Bu aramada dijital desen payı yalnızca %${Math.round(digitalShare * 100)}; alıcılar çoğunlukla bitmiş ürün arıyor.`] : []),
    ...(digitalMismatch && profile.expectsDigital === false ? [`Bu aramadaki ilanların %${Math.round(digitalShare * 100)} kadarı dijital ürün; fiziksel ürün için arama ifadesini daraltın.`] : [])
  ];

  return {
    keyword,
    group,
    score,
    verdict: score >= 65 ? "Yüksek fırsat" : score >= 45 ? "Denenebilir" : "Zor / doygun",
    parts,
    metrics: {
      activeListings,
      favoritesPerMonth: Math.round(favoritesPerMonth * 10) / 10,
      newcomerShare: Math.round(newcomerShare * 100) / 100,
      digitalShare: Math.round(digitalShare * 100) / 100,
      medianPriceUsd,
      sampleSize: pageOne.length
    },
    reasons,
    topTags,
    examples,
    scannedAt: new Date(now).toISOString()
  };
}

function priceScore(price: number, [low, high]: [number, number]): number {
  if (high <= 12) return 100 * (price - low) / (high - low);
  return 100 * (Math.log(Math.max(price, 1)) - Math.log(low)) / (Math.log(high) - Math.log(low));
}

function cacheKey(keyword: string): string {
  return `etsy:trend:${keyword.replace(/[^\p{L}\p{Nd}]+/gu, "-")}`;
}

async function readCached(store: TrendStore | undefined, keyword: string): Promise<TrendResult | undefined> {
  if (!store) return undefined;
  const raw = await store.get(cacheKey(keyword));
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as TrendResult;
  } catch {
    return undefined;
  }
}

export async function scanTrend(
  env: EtsyRuntimeEnv,
  input: { nicheId?: string; keyword?: string; force?: boolean },
  store: TrendStore | undefined,
  fetcher: Fetcher = fetch,
  now = Date.now()
): Promise<TrendResult> {
  const niche = input.nicheId ? TREND_NICHES.find((item) => item.id === input.nicheId) : undefined;
  if (input.nicheId && !niche) throw new EtsyIntegrationError("VALIDATION_FAILED", "Trend nişi bulunamadı.", 400);
  const keyword = normalizeKeyword(niche?.keyword || input.keyword || "");
  if (keyword.length < 3) throw new EtsyIntegrationError("VALIDATION_FAILED", "Taranacak anahtar kelime en az 3 karakter olmalıdır.", 400);

  const cached = await readCached(store, keyword);
  if (cached) {
    const age = now - Date.parse(cached.scannedAt);
    if (age < CACHE_TTL_SECONDS * 1000 && (!input.force || age < FORCE_REFRESH_AFTER_MS)) return { ...cached, cached: true };
  }

  const payload = await etsyRequest<{ count?: number; results?: unknown[] }>(env, "/application/listings/active", {
    authenticated: false,
    query: { keywords: keyword, sort_on: "score", limit: 100, currency: "USD" }
  }, fetcher);
  const result: TrendResult = {
    ...scoreTrend(keyword, payload, now, niche?.group || inferTrendGroup(keyword)),
    ...(niche ? { nicheId: niche.id, labelTr: niche.labelTr, craft: niche.craft } : {})
  };
  if (store) await store.put(cacheKey(keyword), JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
  return result;
}

export async function getTrendBoard(env: EtsyRuntimeEnv, store: TrendStore | undefined) {
  const results = await Promise.all(TREND_NICHES.map(async (niche) => ({ ...niche, result: await readCached(store, niche.keyword) })));
  return {
    configured: Boolean(env.ETSY_API_KEY && env.ETSY_SHARED_SECRET),
    cacheHours: CACHE_TTL_SECONDS / 3600,
    groups: (["patterns", "tesbih", "vintage"] as const).map((id) => ({ id, labelTr: TREND_GROUPS[id].labelTr })),
    niches: results.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1)),
    method: "Etsy resmî aramasında üst sıradaki ilanların favori hızı, rekabet hacmi, yeni ilan payı ve fiyat bandı puanlanır. Etsy satış adedini API ile paylaşmadığı için puan tahmindir."
  };
}
