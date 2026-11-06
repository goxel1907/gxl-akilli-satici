import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";
import { inferPrintableKind, normalizeKeyword, scoreTrend, type PrintableKind } from "./etsy-trends.js";
import { buildCompetition } from "./pattern-seed.js";

type ResearchProduct = { kind: PrintableKind; productType: string; keyword?: string; pageCount?: number; competitorLinks?: string };
export function competitorIds(value = ""): string[] {
  const refs = value.trim().split(/[\s,]+/).filter(Boolean);
  if (refs.length > 5) throw new EtsyIntegrationError("VALIDATION_FAILED", "En fazla 5 rakip ilan linki veya numarası girin.", 400);
  return [...new Set(refs.map(ref => {
    if (/^[1-9]\d{0,14}$/.test(ref)) return ref;
    try {
      const url = new URL(ref), id = url.pathname.match(/^\/(?:[a-z-]+\/)?listing\/([1-9]\d{0,14})(?:\/|$)/i)?.[1];
      if (url.protocol === "https:" && /^(www\.)?etsy\.com$/i.test(url.hostname) && id) return id;
    } catch { /* Invalid links never become arbitrary network targets. */ }
    throw new EtsyIntegrationError("VALIDATION_FAILED", "Rakip için geçerli bir Etsy ilan linki veya ilan numarası girin.", 400);
  }))];
}
const TOPICS = [
  /\b(abc|alphabet|a-z)\b/, /\banimals?\b|\bwildlife\b/, /\bbaby showers?\b/, /\bbridal showers?\b/,
  /\b(christmas|xmas|noel)\b/, /\bhalloween\b/, /\bvalentine.?s?\b/, /\b(easter|spring eggs)\b/,
  /\bmandalas?\b/, /\bdinosaurs?\b/, /\b(woodland|forest animals?)\b/, /\b(cats?|kittens?)\b/, /\b(dogs?|puppies|puppy)\b/,
  /\b(budget|finance|financial|money|expenses?|savings?|paycheck)\b/, /\bwedding\b/, /\b(reading|book reviews?|reading log)\b/,
  /\bescape (room|game)s?\b/, /\b(trivia|quiz)\b/
];
const GENERIC = new Set("printable digital download instant pdf png pptx xlsx docx pages page coloring colour book books game games party planner template templates cards card set bundle pack sheets sheet activity activities worksheet worksheets calendar journal wall art prints print phone wallpaper stickers labels for and the with in of to us letter a4 a5 kids children baby adult adults cute easy simple bold large cozy neutral aesthetic animal animals".split(" "));
export function matchesPrintableProduct(input: ResearchProduct, row: Record<string, unknown>): boolean {
  if (row.listing_type !== "download" && row.type !== "download") return false;
  const title = String(row.title || "").toLowerCase();
  if (inferPrintableKind(title) !== input.kind) return false;
  const target = `${normalizeKeyword(input.productType)} ${normalizeKeyword(input.keyword || "")}`;
  const candidate = `${title} ${Array.isArray(row.tags) ? row.tags.map(String).join(" ").toLowerCase() : ""}`;
  const required = TOPICS.filter(topic => topic.test(target));
  if (required.some(topic => !topic.test(candidate))) return false;
  for (const season of TOPICS.slice(4, 8)) if (!season.test(target) && season.test(candidate) && TOPICS.slice(4, 8).some(topic => topic.test(target))) return false;
  const year = target.match(/\b20\d{2}\b/)?.[0];
  if (input.kind === "calendar" && year && !candidate.includes(year)) return false;
  const singular = (word: string) => word.replace(/s$/, "");
  const remaining = required.reduce((text, topic) => text.replace(new RegExp(topic.source, "g"), " "), target);
  const anchors = remaining.split(/\s+/).filter(word => word.length > 2 && !GENERIC.has(word) && !/^\d+$/.test(word)).map(singular);
  const words = new Set(candidate.replace(/[^\p{L}\p{Nd}\s'-]/gu, " ").split(/\s+/).map(singular));
  return !anchors.length || anchors.some(word => words.has(word));
}

// A fresh, product-specific sample. Never reuse the seed's old competition or mix
// physical products into digital-product price recommendations.
export async function researchPrintableMarket(env: EtsyRuntimeEnv, input: ResearchProduct, fetcher: typeof fetch = fetch) {
  const keyword = normalizeKeyword(input.keyword || input.productType);
  const selectedIds = competitorIds(input.competitorLinks);
  const response = await etsyRequest<{ count?: number; results?: Array<Record<string, unknown>> }>(env, "/application/listings/active", {
    authenticated: false, query: { keywords: keyword, sort_on: "score", limit: 100, currency: "USD" }
  }, fetcher);
  const selected: Record<string, unknown>[] = [];
  for (const id of selectedIds) {
    const row = await etsyRequest<Record<string, unknown>>(env, `/application/listings/${id}`, { authenticated: false }, fetcher);
    if (row.state !== "active" || !matchesPrintableProduct(input, row)) throw new EtsyIntegrationError("VALIDATION_FAILED", `Seçilen ${id} numaralı rakip yayında değil veya bu ürünle aynı tür/konuda değil. Rakip listesini düzeltin.`, 400);
    selected.push({ ...row, listing_id: Number(id) });
  }
  const seen = new Set<string>();
  const comparable = [...selected, ...(response.results || []).filter(row => matchesPrintableProduct(input, row))].filter(row => {
    if (!row.listing_id) return true;
    const id = String(row.listing_id); if (seen.has(id)) return false; seen.add(id); return true;
  });
  if (comparable.length < 3) throw new EtsyIntegrationError("VALIDATION_FAILED", "Bu aramada aynı tür ve konuda en az 3 dijital rakip bulunamadı. Daha belirgin bir Etsy araması yazın; eski analiz veya tahmini fiyat kullanılmadı.", 400);
  const result = scoreTrend(keyword, { count: response.count, results: comparable }, Date.now(), "printables", "product_matched");
  if (!result.strategy || result.strategy.sampleSize < 3) throw new EtsyIntegrationError("VALIDATION_FAILED", "Korunan isimler elendikten sonra en az 3 karşılaştırılabilir rakip gerekli. Başka bir Etsy araması deneyin.", 400);
  if (!result.strategy.pricing) throw new EtsyIntegrationError("VALIDATION_FAILED", "Korunan isimler elendikten sonra en az 3 karşılaştırılabilir USD fiyatı gerekli. Başka bir Etsy araması deneyin; farklı para birimleri fiyat önerisine katılmadı.", 400);
  const competition = buildCompetition(result, input.kind, input.pageCount, []);
  if (!competition.launchPriceUsd) throw new EtsyIntegrationError("VALIDATION_FAILED", "Karşılaştırılabilir rakip fiyatı alınamadı. Başka arama deneyin.", 400);
  return { keyword, scannedAt: result.scannedAt, sampleSize: result.strategy.sampleSize, selectedIds, strategy: result.strategy, competition, trendTags: result.topTags.map(item => item.tag),
    noteTr: "Etsy aramasındaki aynı tür ve konuda eşleştirilen dijital ilan örneklemidir. Favori ve ilan sayıları satış değildir; fiyatlar gözlenen örnekleme dayanır." };
}
