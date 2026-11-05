import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";
import { inferPrintableKind, normalizeKeyword, scoreTrend, type PrintableKind } from "./etsy-trends.js";
import { buildCompetition } from "./pattern-seed.js";

type ResearchProduct = { kind: PrintableKind; productType: string; keyword?: string; pageCount?: number };
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
  const response = await etsyRequest<{ count?: number; results?: Array<Record<string, unknown>> }>(env, "/application/listings/active", {
    authenticated: false, query: { keywords: keyword, sort_on: "score", limit: 100, currency: "USD" }
  }, fetcher);
  const comparable = (response.results || []).filter(row => matchesPrintableProduct(input, row));
  if (comparable.length < 3) throw new EtsyIntegrationError("VALIDATION_FAILED", "Bu aramada aynı tür ve konuda en az 3 dijital rakip bulunamadı. Daha belirgin bir Etsy araması yazın; eski analiz veya tahmini fiyat kullanılmadı.", 400);
  const result = scoreTrend(keyword, { count: response.count, results: comparable }, Date.now(), "printables");
  const competition = buildCompetition(result, input.kind, input.pageCount, []);
  if (!competition.launchPriceUsd) throw new EtsyIntegrationError("VALIDATION_FAILED", "Karşılaştırılabilir rakip fiyatı alınamadı. Başka arama deneyin.", 400);
  return { keyword, scannedAt: result.scannedAt, sampleSize: comparable.length, competition, trendTags: result.topTags.map(item => item.tag),
    noteTr: "Etsy aramasındaki aynı tür ve konuda eşleştirilen dijital ilan örneklemidir. Favori ve ilan sayıları satış değildir; fiyatlar gözlenen örnekleme dayanır." };
}
