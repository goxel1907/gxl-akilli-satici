export const TREND_FRESH_MS = 6 * 60 * 60 * 1000;
export interface TrendEvidence { score?: number; scannedAt?: string; metrics?: { sampleSize?: number }; verdict?: string; parts?: { demand?: number }; }
// Satıcının amacı alıcı ilgisi olan ürünlerde rakiplerin önüne geçmek: talebi zayıf (alıcı ilgisi düşük) arama
// önerilmez ve listelerde en sona/gizliye düşer. Talep bilgisi yoksa (eski kayıt) dışlanmaz.
export function hasBuyerDemand(result?: TrendEvidence): boolean {
  if (!result) return false;
  // 45 ve üstü puan zaten yeterli talep demektir (Etsy'de "Talep zayıf" yalnız 45 altı puanda verilir).
  if (Number.isFinite(result.score) && result.score! >= 45) return true;
  if (result.verdict === "Talep zayıf") return false;
  return !(Number.isFinite(result.parts?.demand) && result.parts!.demand! < 25);
}
export function trendFreshness(result?: TrendEvidence, now = Date.now()): "fresh" | "stale" | "unscanned" {
  if (!result || !Number.isFinite(result.score) || result.score! < 0 || result.score! > 100 || !result.scannedAt) return "unscanned";
  const age = now - Date.parse(result.scannedAt);
  return Number.isFinite(age) && age >= -300_000 && age <= TREND_FRESH_MS ? "fresh" : "stale";
}
export function compareTrendEvidence(a?: TrendEvidence, b?: TrendEvidence, now = Date.now()): number {
  const tier = (row?: TrendEvidence) => ({ fresh: 2, stale: 1, unscanned: 0 })[trendFreshness(row, now)];
  const score = (row?: TrendEvidence) => Number.isFinite(row?.score) ? row!.score! : -1;
  const demand = (row?: TrendEvidence) => trendFreshness(row, now) === "unscanned" ? 0 : hasBuyerDemand(row) ? 1 : 0;
  // Önce güncel veri, sonra alıcı ilgisi olanlar, sonra puan.
  return tier(b) - tier(a) || demand(b) - demand(a) || score(b) - score(a)
    || String(b?.scannedAt || "").localeCompare(String(a?.scannedAt || ""));
}

export function canRankTrend(result?: TrendEvidence, now = Date.now()): boolean {
  return trendFreshness(result, now) === "fresh" && (result?.metrics?.sampleSize === undefined || result.metrics.sampleSize >= 3);
}
