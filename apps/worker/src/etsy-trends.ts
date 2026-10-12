import { buildAdvice, type TrendAdvice } from "./advice.js";
import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";
import { findIpRisks } from "./ip-guard.js";

type Fetcher = typeof fetch;

export type PatternCraft = "crochet" | "knitting" | "embroidery" | "cross_stitch" | "sewing" | "macrame" | "punch_needle";

// Kadınlara yönelik yazdırılabilir / dijital PDF ürün türleri.
export type PrintableKind = "planner" | "digital_planner" | "coloring" | "wall_art" | "party" | "recipe" | "journal" | "kids" | "paper_craft";

export type TrendGroup = "printables" | "patterns" | "tesbih" | "vintage" | "other";

export interface TrendNiche {
  id: string;
  keyword: string;
  labelTr: string;
  group: TrendGroup;
  craft?: PatternCraft;
  kind?: PrintableKind;
}

interface GroupProfile {
  labelTr: string;
  expectsDigital?: boolean;
  priceUsd: [number, number];
}

export const TREND_GROUPS: Record<TrendGroup, GroupProfile> = {
  printables: { labelTr: "PDF ürünleri", expectsDigital: true, priceUsd: [2, 15] },
  patterns: { labelTr: "Hobi desenleri", expectsDigital: true, priceUsd: [2, 12] },
  tesbih: { labelTr: "Tesbih ve gümüş", expectsDigital: false, priceUsd: [15, 250] },
  vintage: { labelTr: "Vintage", expectsDigital: false, priceUsd: [15, 250] },
  other: { labelTr: "Diğer", priceUsd: [10, 150] }
};

export const TREND_NICHES: TrendNiche[] = [
  { id: "printable-planner", keyword: "printable planner", labelTr: "Yazdırılabilir planlayıcı", group: "printables", kind: "planner" },
  { id: "digital-planner", keyword: "digital planner", labelTr: "Dijital planlayıcı (tablet)", group: "printables", kind: "digital_planner" },
  { id: "budget-planner", keyword: "budget planner printable", labelTr: "Bütçe planlayıcı", group: "printables", kind: "planner" },
  { id: "meal-planner", keyword: "meal planner printable", labelTr: "Yemek planlayıcı", group: "printables", kind: "planner" },
  { id: "habit-tracker", keyword: "habit tracker printable", labelTr: "Alışkanlık takipçisi", group: "printables", kind: "planner" },
  { id: "cleaning-schedule", keyword: "cleaning schedule printable", labelTr: "Temizlik planı", group: "printables", kind: "planner" },
  { id: "wedding-planner", keyword: "wedding planner printable", labelTr: "Düğün planlayıcı", group: "printables", kind: "planner" },
  { id: "adult-coloring", keyword: "adult coloring pages", labelTr: "Yetişkin boyama sayfaları", group: "printables", kind: "coloring" },
  { id: "kids-coloring", keyword: "coloring pages for kids", labelTr: "Çocuk boyama sayfaları", group: "printables", kind: "coloring" },
  { id: "wall-art", keyword: "printable wall art", labelTr: "Yazdırılabilir duvar sanatı", group: "printables", kind: "wall_art" },
  { id: "recipe-cards", keyword: "recipe card printable", labelTr: "Tarif kartı / tarif defteri", group: "printables", kind: "recipe" },
  { id: "bridal-shower-games", keyword: "bridal shower games", labelTr: "Bridal shower oyunları", group: "printables", kind: "party" },
  { id: "baby-shower-games", keyword: "baby shower games printable", labelTr: "Baby shower oyunları", group: "printables", kind: "party" },
  { id: "self-care-journal", keyword: "self care journal printable", labelTr: "Öz bakım günlüğü", group: "printables", kind: "journal" },
  { id: "reading-journal", keyword: "reading journal printable", labelTr: "Okuma günlüğü", group: "printables", kind: "journal" },
  { id: "junk-journal", keyword: "junk journal kit", labelTr: "Junk journal kiti", group: "printables", kind: "paper_craft" },
  { id: "digital-paper", keyword: "digital paper pack", labelTr: "Dijital kâğıt paketi", group: "printables", kind: "paper_craft" },
  { id: "kids-activity", keyword: "kids activity pages", labelTr: "Çocuk etkinlik sayfaları", group: "printables", kind: "kids" },
  { id: "homeschool", keyword: "homeschool printables", labelTr: "Evde eğitim çalışma kâğıtları", group: "printables", kind: "kids" },
  { id: "quilt-pattern", keyword: "quilt pattern pdf", labelTr: "Kapitone / yorgan deseni", group: "patterns", craft: "sewing" },
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

export function isTrendGroup(value: unknown): value is TrendGroup {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TREND_GROUPS, value);
}

const CRAFT_IN_KEYWORD = /\b(crochet|knit|knitting|sewing|sew|embroidery|cross stitch|macrame|punch needle|amigurumi|quilt|quilting|needlepoint)\b/i;
const PRINTABLE_IN_KEYWORD = /\b(printables?|planners?|journal|journaling|coloring|colouring|wall art|worksheets?|tracker|checklist|recipe cards?|invitations?|games|digital paper|clipart|stickers|templates?|calendar|workbook|flash ?cards)\b/i;

export function inferPrintableKind(keyword: string): PrintableKind | undefined {
  const value = keyword.toLowerCase();
  if (/\bdigital planner|goodnotes|notability|hyperlinked\b/.test(value)) return "digital_planner";
  if (/\bcolou?ring\b/.test(value)) return "coloring";
  if (/\bwall art|poster|art print|digital print\b/.test(value)) return "wall_art";
  if (/\brecipe\b/.test(value)) return "recipe";
  if (/\bgames?|invitation|shower|party|bingo|scavenger hunt\b/.test(value)) return "party";
  if (/\bkids?|toddler|preschool|homeschool|worksheets?|activity|flash ?cards?|classroom\b/.test(value)) return "kids";
  if (/\bjunk journal|digital paper|scrapbook|ephemera|paper flower|clipart|stickers\b/.test(value)) return "paper_craft";
  if (/\bjournal|workbook|gratitude|prompts\b/.test(value)) return "journal";
  if (/\bplanner|tracker|checklist|schedule|calendar|organizer|budget\b/.test(value)) return "planner";
  return undefined;
}

export function inferTrendGroup(keyword: string): TrendGroup {
  if (CRAFT_IN_KEYWORD.test(keyword) && /\b(pattern|pdf|chart|template)\b/i.test(keyword)) return "patterns";
  if (PRINTABLE_IN_KEYWORD.test(keyword) && !CRAFT_IN_KEYWORD.test(keyword)) return "printables";
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
  verdict: "Yüksek fırsat" | "Denenebilir" | "Talep zayıf" | "Rekabet yoğun" | "Zor";
  parts: { demand: number; openness: number; newcomer: number; price: number };
  metrics: {
    activeListings: number;
    favoritesPerMonth: number;
    // Öne çıkan çeyreğin (en hızlı favori toplayan %25) ortanca aylık favorisi: kazanan ilanın gördüğü talep.
    leaderFavoritesPerMonth?: number;
    newcomerShare: number;
    digitalShare: number;
    medianPriceUsd?: number;
    sampleSize: number;
  };
  reasons: string[];
  topTags: Array<{ tag: string; count: number }>;
  risingTags?: Array<{ tag: string; weight: number }>;
  examples: TrendExample[];
  scannedAt: string;
  cached?: boolean;
  kind?: PrintableKind;
  signals?: TrendSignals;
  advice?: TrendAdvice[];
}

// Üst ilanların başlık ve etiketlerinde hangi formatların ne sıklıkla geçtiği: rakiplerin sunmadığı formatı sunmak öne geçirir.
export interface TrendSignals {
  formats: Array<{ id: string; labelTr: string; share: number }>;
  bundleShare: number;
  pageCountMedian?: number;
  ipRisks: string[];
}

const FORMAT_SIGNALS: Array<{ id: string; labelTr: string; pattern: RegExp }> = [
  { id: "letter", labelTr: "US Letter", pattern: /\b(us letter|letter size|8\.5 ?x ?11)\b/ },
  { id: "a4", labelTr: "A4", pattern: /\ba4\b/ },
  { id: "a5", labelTr: "A5", pattern: /\ba5\b/ },
  { id: "half_letter", labelTr: "Half Letter", pattern: /\b(half letter|5\.5 ?x ?8\.5)\b/ },
  { id: "editable", labelTr: "Düzenlenebilir (Canva/Corjl)", pattern: /\b(editable|canva|corjl|templett)\b/ },
  { id: "tablet", labelTr: "Tablet / hyperlinked", pattern: /\b(goodnotes|notability|hyperlinked|ipad|tablet)\b/ },
  { id: "printer_friendly", labelTr: "Yazıcı dostu / siyah-beyaz", pattern: /\b(printer friendly|black and white|ink saving|minimal ink)\b/ },
  { id: "instant", labelTr: "Instant download", pattern: /\binstant download\b/ },
  { id: "commercial", labelTr: "Ticari kullanım lisansı", pattern: /\b(commercial use|plr|resell rights)\b/ },
  { id: "video", labelTr: "Video eğitim", pattern: /\b(video tutorial|video)\b/ },
  { id: "ratio_sizes", labelTr: "Çoklu çerçeve ölçüleri", pattern: /\b(5 ?x ?7|8 ?x ?10|11 ?x ?14|16 ?x ?20|18 ?x ?24|24 ?x ?36|multiple sizes)\b/ },
  { id: "card_sizes", labelTr: "Kart ölçüleri (4x6 / 5x7)", pattern: /\b(4 ?x ?6|5 ?x ?7|3 ?x ?5)\b/ },
  { id: "scrapbook_size", labelTr: "12x12 scrapbook", pattern: /\b12 ?x ?12\b/ }
];

function computeSignals(pageOne: EtsyListingRow[], topTags: Array<{ tag: string }>): TrendSignals {
  const texts = pageOne.map((listing) => `${String(listing.title || "")} ${(Array.isArray(listing.tags) ? listing.tags : []).join(" ")}`.toLowerCase());
  const share = (pattern: RegExp) => texts.length ? Math.round(100 * texts.filter((text) => pattern.test(text)).length / texts.length) / 100 : 0;
  const pageCounts = pageOne
    .map((listing) => String(listing.title || "").toLowerCase().match(/\b(\d{2,3})\+? ?(?:pages|page|designs|sheets|cards|prints|worksheets)\b/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number(match[1]))
    .filter((value) => value >= 2 && value <= 600);
  return {
    formats: FORMAT_SIGNALS.map((item) => ({ id: item.id, labelTr: item.labelTr, share: share(item.pattern) })),
    bundleShare: share(/\b(bundle|set of|mega|pack)\b/),
    pageCountMedian: pageCounts.length >= 3 ? Math.round(median(pageCounts)) : undefined,
    ipRisks: [...new Set([...topTags.map((item) => item.tag), ...pageOne.map((listing) => String(listing.title || ""))].flatMap((text) => findIpRisks(text)))].slice(0, 8)
  };
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

// Aylık favori hızını 0-100'e çevirir: 100 favori/ay ve üstü tam puan.
function demandScale(velocity: number): number {
  return clamp(100 * Math.log10(1 + velocity) / Math.log10(101));
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
  // Etsy yeni ilanlara ilk sayfada yer açar; bu yüzden ortanca, büyük nişlerde (örn. printable planner) 0'a yakın çıkar.
  // Talebi ortanca ile öne çıkan çeyreğin birlikte ölçer: biri tipik ilanı, diğeri kazanan ilanın gördüğü ilgiyi gösterir.
  const leaders = [...velocities].sort((a, b) => b - a).slice(0, Math.max(3, Math.ceil(velocities.length / 4)));
  const leaderFavoritesPerMonth = median(leaders);
  const newcomerShare = pageOne.length ? pageOne.filter((listing) => ageDays(listing, now) <= 180).length / pageOne.length : 0;
  const digitalShare = listings.length ? listings.filter((listing) => listing.listing_type === "download" || listing.listing_type === "both").length / listings.length : 0;
  const prices = pageOne.map(priceUsd).filter((value): value is number => typeof value === "number" && value > 0);
  const medianPriceUsd = prices.length ? Math.round(median(prices) * 100) / 100 : undefined;

  const parts = {
    demand: Math.round(clamp(0.5 * demandScale(favoritesPerMonth) + 0.5 * demandScale(leaderFavoritesPerMonth))),
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

  // Son 4 ayda açılıp hızla favori toplayan ilanların etiketleri yükselen arama ifadelerini gösterir.
  const risingWeights = new Map<string, number>();
  pageOne.forEach((listing, index) => {
    if (ageDays(listing, now) > 120) return;
    for (const raw of Array.isArray(listing.tags) ? listing.tags : []) {
      const tag = String(raw).toLowerCase().trim();
      if (tag) risingWeights.set(tag, (risingWeights.get(tag) || 0) + Math.max(0.1, velocities[index]));
    }
  });
  const risingTags = [...risingWeights.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([tag, weight]) => ({ tag, weight: Math.round(weight * 10) / 10 }));

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

  const signals = computeSignals(pageOne, topTags);
  const reasons = [
    `Üst sıradaki ilanlar ayda ortanca ${favoritesPerMonth.toFixed(1)} favori, öne çıkan çeyrek ise ${leaderFavoritesPerMonth.toFixed(1)} favori alıyor (talep göstergesi).`,
    `${activeListings.toLocaleString("tr-TR")} aktif ilanla rekabet ediliyor.`,
    `İlk ${pageOne.length} ilanın %${Math.round(newcomerShare * 100)} kadarı son 6 ayda açılmış; yeni mağazanın öne çıkma şansı buna bağlı.`,
    medianPriceUsd === undefined ? "Fiyat verisi alınamadı." : `Üst sıradaki ilanların ortanca fiyatı ${medianPriceUsd.toFixed(2)} USD.`,
    ...(digitalMismatch && profile.expectsDigital ? [`Bu aramada dijital desen payı yalnızca %${Math.round(digitalShare * 100)}; alıcılar çoğunlukla bitmiş ürün arıyor.`] : []),
    ...(digitalMismatch && profile.expectsDigital === false ? [`Bu aramadaki ilanların %${Math.round(digitalShare * 100)} kadarı dijital ürün; fiziksel ürün için arama ifadesini daraltın.`] : []),
    ...(!profile.expectsDigital && parts.demand < 25 && medianPriceUsd !== undefined && medianPriceUsd >= 40 ? ["Pahalı fiziksel ürünlerde favori sayısı doğal olarak düşüktür; az satış da satış başına yüksek kazanç getirir. Puanı adet hacmi olarak okuyun."] : [])
  ];
  const verdict: TrendResult["verdict"] = score >= 65 ? "Yüksek fırsat"
    : score >= 45 ? "Denenebilir"
    : parts.demand < 25 ? "Talep zayıf"
    : parts.openness < 30 ? "Rekabet yoğun"
    : "Zor";

  const result: TrendResult = {
    keyword,
    group,
    ...(group === "printables" ? { kind: inferPrintableKind(keyword) } : {}),
    score,
    verdict,
    parts,
    metrics: {
      activeListings,
      favoritesPerMonth: Math.round(favoritesPerMonth * 10) / 10,
      leaderFavoritesPerMonth: Math.round(leaderFavoritesPerMonth * 10) / 10,
      newcomerShare: Math.round(newcomerShare * 100) / 100,
      digitalShare: Math.round(digitalShare * 100) / 100,
      medianPriceUsd,
      sampleSize: pageOne.length
    },
    reasons,
    topTags,
    risingTags,
    examples,
    signals,
    scannedAt: new Date(now).toISOString()
  };
  return { ...result, advice: buildAdvice(result) };
}

function priceScore(price: number, [low, high]: [number, number]): number {
  if (high <= 20) return 100 * (price - low) / (high - low);
  return 100 * (Math.log(Math.max(price, 1)) - Math.log(low)) / (Math.log(high) - Math.log(low));
}

function cacheKey(keyword: string): string {
  return `etsy:trend:${keyword.replace(/[^\p{L}\p{Nd}]+/gu, "-")}`;
}

export async function readCached(store: TrendStore | undefined, keyword: string): Promise<TrendResult | undefined> {
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
  input: { nicheId?: string; keyword?: string; force?: boolean; group?: TrendGroup },
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
    ...scoreTrend(keyword, payload, now, niche?.group || input.group || inferTrendGroup(keyword)),
    ...(niche ? { nicheId: niche.id, labelTr: niche.labelTr, craft: niche.craft, ...(niche.kind ? { kind: niche.kind } : {}) } : {})
  };
  if (store) await store.put(cacheKey(keyword), JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
  return result;
}

export async function getTrendBoard(env: EtsyRuntimeEnv, store: TrendStore | undefined) {
  const results = await Promise.all(TREND_NICHES.map(async (niche) => ({ ...niche, result: await readCached(store, niche.keyword) })));
  return {
    configured: Boolean(env.ETSY_API_KEY && env.ETSY_SHARED_SECRET),
    cacheHours: CACHE_TTL_SECONDS / 3600,
    groups: (["printables", "patterns", "tesbih", "vintage"] as const).map((id) => ({ id, labelTr: TREND_GROUPS[id].labelTr })),
    niches: results.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1)),
    method: "Etsy resmî aramasında üst sıradaki ilanların favori hızı, rekabet hacmi, yeni ilan payı ve fiyat bandı puanlanır. Etsy satış adedini API ile paylaşmadığı için puan tahmindir."
  };
}
