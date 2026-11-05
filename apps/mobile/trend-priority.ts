export const TREND_FRESH_MS = 6 * 60 * 60 * 1000;
export interface TrendEvidence { score?: number; scannedAt?: string; metrics?: { sampleSize?: number }; }
export function trendFreshness(result?: TrendEvidence, now = Date.now()): "fresh" | "stale" | "unscanned" {
  if (!result || !Number.isFinite(result.score) || result.score! < 0 || result.score! > 100 || !result.scannedAt) return "unscanned";
  const age = now - Date.parse(result.scannedAt);
  return Number.isFinite(age) && age >= -300_000 && age <= TREND_FRESH_MS ? "fresh" : "stale";
}
export function compareTrendEvidence(a?: TrendEvidence, b?: TrendEvidence, now = Date.now()): number {
  const tier = (row?: TrendEvidence) => ({ fresh: 2, stale: 1, unscanned: 0 })[trendFreshness(row, now)];
  const score = (row?: TrendEvidence) => Number.isFinite(row?.score) ? row!.score! : -1;
  return tier(b) - tier(a) || score(b) - score(a)
    || String(b?.scannedAt || "").localeCompare(String(a?.scannedAt || ""));
}

export function canRankTrend(result?: TrendEvidence, now = Date.now()): boolean {
  return trendFreshness(result, now) === "fresh" && (result?.metrics?.sampleSize === undefined || result.metrics.sampleSize >= 3);
}
