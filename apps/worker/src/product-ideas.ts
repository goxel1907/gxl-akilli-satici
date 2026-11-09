import { canRankTrend } from "../../mobile/trend-priority.js";
import { listDiscoveries } from "./discovery.js";
import { inferPrintableKind, readCached, TREND_NICHES, type TrendStore } from "./etsy-trends.js";
import { upcomingSeasons } from "./seasonal.js";
import { isIpRisky } from "./ip-guard.js";
import type { OpportunityContext } from "../../api/src/opportunity-agent.js";

export async function readProductIdeas(store: TrendStore | undefined, now = Date.now()): Promise<NonNullable<OpportunityContext["productIdeas"]>> {
  const discoveries = await listDiscoveries(store, now);
  const candidates = new Map([
    ...TREND_NICHES.map(row => [row.keyword, { keyword: row.keyword, group: row.group, labelTr: row.labelTr }] as const),
    ...discoveries.map(row => [row.keyword, { keyword: row.keyword, group: row.group, labelTr: "" }] as const),
    ...upcomingSeasons(new Date(now)).flatMap(row => row.keywords).map(row => [row.keyword, { ...row, labelTr: "" }] as const)
  ]);
  const measured = await Promise.all([...candidates.values()].filter(row => !isIpRisky(row.keyword)).map(async row => ({ ...row, result: await readCached(store, row.keyword) })));
  const items = measured.filter(row => canRankTrend(row.result, now) && row.result?.metrics)
    .sort((a, b) => b.result!.score - a.result!.score || b.result!.scannedAt.localeCompare(a.result!.scannedAt))
    .filter((row, index, rows) => rows.slice(0, index).filter(other => other.group === row.group).length < 5).map(row => ({ keyword: row.keyword, labelTr: row.labelTr || undefined, group: row.group, kind: row.group === "printables" ? inferPrintableKind(row.keyword) : undefined,
      score: row.result!.score, scannedAt: row.result!.scannedAt, sampleSize: row.result!.metrics.sampleSize, medianPriceUsd: row.result!.metrics.medianPriceUsd,
      reason: row.result!.reasons.slice(0, 3).join(" ") }));
  return { checkedAt: new Date(now).toISOString(), items,
    method: "Son 6 saatte taranan adaylar fırsat puanına göre sıralanır: %40 ilan yaşına göre ortalama favori ilgisi, %25 rekabet, %20 yeni ilan payı ve %15 fiyat. Sabit nişler, keşifler ve sezon aramaları birlikte değerlendirilir. Bu puan satış veya dikkat çekme olasılığı değildir; gerçek arama hacmi, dönüşüm ve satış tahmini ölçülmez." };
}
