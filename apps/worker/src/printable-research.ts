import { etsyRequest, EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";
import { inferPrintableKind, normalizeKeyword, scoreTrend, type PrintableKind } from "./etsy-trends.js";
import { buildCompetition } from "./pattern-seed.js";

// A fresh, product-specific sample. Never reuse the seed's old competition or mix
// physical products into digital-product price recommendations.
export async function researchPrintableMarket(env: EtsyRuntimeEnv, input: { kind: PrintableKind; productType: string; keyword?: string; pageCount?: number }, fetcher: typeof fetch = fetch) {
  const keyword = normalizeKeyword(input.keyword || input.productType);
  const response = await etsyRequest<{ count?: number; results?: Array<Record<string, unknown>> }>(env, "/application/listings/active", {
    authenticated: false, query: { keywords: keyword, sort_on: "score", limit: 100, currency: "USD" }
  }, fetcher);
  const comparable = (response.results || []).filter(row => (row.listing_type === "download" || row.type === "download") && inferPrintableKind(String(row.title || "")) === input.kind);
  if (comparable.length < 3) throw new EtsyIntegrationError("VALIDATION_FAILED", "Bu aramada aynı türde en az 3 dijital rakip bulunamadı. Daha belirgin bir Etsy araması yazın; eski analiz veya tahmini fiyat kullanılmadı.", 400);
  const result = scoreTrend(keyword, { count: response.count, results: comparable }, Date.now(), "printables");
  const competition = buildCompetition(result, input.kind, input.pageCount, []);
  if (!competition.launchPriceUsd) throw new EtsyIntegrationError("VALIDATION_FAILED", "Karşılaştırılabilir rakip fiyatı alınamadı. Başka arama deneyin.", 400);
  return { keyword, scannedAt: result.scannedAt, sampleSize: comparable.length, competition, trendTags: result.topTags.map(item => item.tag),
    noteTr: "Etsy aramasındaki aynı tür dijital ilan örneklemidir. Favori ve ilan sayıları satış değildir; fiyatlar gözlenen örnekleme dayanır." };
}
