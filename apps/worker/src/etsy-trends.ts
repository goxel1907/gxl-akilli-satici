import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";

type Fetcher = typeof fetch;

export type PatternCraft = "crochet" | "knitting" | "embroidery" | "cross_stitch" | "sewing" | "macrame" | "punch_needle";

export interface TrendNiche {
  id: string;
  keyword: string;
  labelTr: string;
  craft: PatternCraft;
}

// Kadınların yoğun ilgilendiği el işi hobileri için dijital desen nişleri.
export const HOBBY_NICHES: TrendNiche[] = [
  { id: "crochet-doily", keyword: "crochet doily pattern", labelTr: "Tığ işi dantel / sehpa örtüsü", craft: "crochet" },
  { id: "crochet-bag", keyword: "crochet bag pattern", labelTr: "Tığ işi çanta", craft: "crochet" },
  { id: "amigurumi", keyword: "amigurumi pattern", labelTr: "Amigurumi oyuncak", craft: "crochet" },
  { id: "crochet-cardigan", keyword: "crochet cardigan pattern", labelTr: "Tığ işi hırka", craft: "crochet" },
  { id: "crochet-top", keyword: "crochet top pattern", labelTr: "Tığ işi bluz / top", craft: "crochet" },
  { id: "granny-square", keyword: "granny square pattern", labelTr: "Granny square motif", craft: "crochet" },
  { id: "crochet-flower", keyword: "crochet flower pattern", labelTr: "Tığ işi çiçek", craft: "crochet" },
  { id: "crochet-blanket", keyword: "crochet blanket pattern", labelTr: "Tığ işi battaniye", craft: "crochet" },
  { id: "knit-sweater", keyword: "knitting sweater pattern", labelTr: "Şiş örgü kazak", craft: "knitting" },
  { id: "knit-slippers", keyword: "knit slippers pattern", labelTr: "Şiş örgü patik / babet", craft: "knitting" },
  { id: "baby-knitting", keyword: "baby knitting pattern", labelTr: "Bebek örgüsü", craft: "knitting" },
  { id: "cross-stitch", keyword: "cross stitch pattern", labelTr: "Kanaviçe / etamin", craft: "cross_stitch" },
  { id: "embroidery", keyword: "embroidery pattern", labelTr: "Nakış / işleme", craft: "embroidery" },
  { id: "punch-needle", keyword: "punch needle pattern", labelTr: "Punch nakış", craft: "punch_needle" },
  { id: "sewing-pattern", keyword: "sewing pattern pdf", labelTr: "Dikiş kalıbı", craft: "sewing" },
  { id: "macrame", keyword: "macrame pattern", labelTr: "Makrome", craft: "macrame" }
];

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

export function scoreTrend(keyword: string, payload: { count?: number; results?: unknown[] }, now = Date.now()): TrendResult {
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
    price: medianPriceUsd === undefined ? 50 : Math.round(clamp(100 * (medianPriceUsd - 2) / 10))
  };
  let score = 0.4 * parts.demand + 0.25 * parts.openness + 0.2 * parts.newcomer + 0.15 * parts.price;
  if (listings.length && digitalShare < 0.3) score *= 0.8;
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
    ...(listings.length && digitalShare < 0.3 ? [`Bu aramada dijital desen payı yalnızca %${Math.round(digitalShare * 100)}; alıcılar çoğunlukla bitmiş ürün arıyor.`] : [])
  ];

  return {
    keyword,
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
  const niche = input.nicheId ? HOBBY_NICHES.find((item) => item.id === input.nicheId) : undefined;
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
    ...scoreTrend(keyword, payload, now),
    ...(niche ? { nicheId: niche.id, labelTr: niche.labelTr, craft: niche.craft } : {})
  };
  if (store) await store.put(cacheKey(keyword), JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
  return result;
}

export async function getTrendBoard(env: EtsyRuntimeEnv, store: TrendStore | undefined) {
  const results = await Promise.all(HOBBY_NICHES.map(async (niche) => ({ ...niche, result: await readCached(store, niche.keyword) })));
  return {
    configured: Boolean(env.ETSY_API_KEY && env.ETSY_SHARED_SECRET),
    cacheHours: CACHE_TTL_SECONDS / 3600,
    niches: results.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1)),
    method: "Etsy resmî aramasında üst sıradaki ilanların favori hızı, rekabet hacmi, yeni ilan payı ve fiyat bandı puanlanır. Etsy satış adedini API ile paylaşmadığı için puan tahmindir."
  };
}
