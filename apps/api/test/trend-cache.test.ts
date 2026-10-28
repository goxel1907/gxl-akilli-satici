import assert from "node:assert/strict";
import test from "node:test";
import { getTrendBoard, scanTrend } from "../../worker/src/etsy-trends.js";

function memoryKv() {
  const values = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    values,
    ttls,
    store: {
      async get(key: string) { return values.get(key) ?? null; },
      async put(key: string, value: string, options?: { expirationTtl?: number }) { values.set(key, value); ttls.set(key, options?.expirationTtl); },
      async delete(key: string) { values.delete(key); }
    }
  };
}

const listing = (index: number) => ({ title: `Printable planner ${index}`, url: `https://www.etsy.com/listing/${index}`, num_favorers: 10 + index, listing_type: "download", tags: ["printable planner"], original_creation_timestamp: 1_700_000_000 + index, price: { amount: 399, divisor: 100, currency_code: "USD" } });

// Otomatik keşif bir aramayı ancak 1-2 günde bir yeniler; sonuç 6 saatte silinirse trend listesi boş görünür.
test("a scan is kept for days so the trend board is not empty between autopilot rounds, but re-scanned after 6 hours", async () => {
  const kv = memoryKv();
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };
  let calls = 0;
  const fetcher = (async () => { calls += 1; return Response.json({ count: 945_115, results: Array.from({ length: 48 }, (_, index) => listing(index)) }); }) as typeof fetch;
  const start = Date.parse("2026-10-26T10:00:00Z");
  const first = await scanTrend(env, { nicheId: "printable-planner" }, kv.store, fetcher, start);
  const key = [...kv.ttls.keys()].find((item) => item.includes("printable-planner"))!;
  assert.ok((kv.ttls.get(key) || 0) >= 7 * 24 * 60 * 60, "kept for at least a week");

  const board = await getTrendBoard(env, kv.store);
  assert.equal(board.niches.find((niche) => niche.id === "printable-planner")?.result?.scannedAt, first.scannedAt);

  await scanTrend(env, { nicheId: "printable-planner" }, kv.store, fetcher, start + 2 * 60 * 60 * 1000);
  assert.equal(calls, 1, "a 2-hour-old scan is reused");
  await scanTrend(env, { nicheId: "printable-planner" }, kv.store, fetcher, start + 7 * 60 * 60 * 1000);
  assert.equal(calls, 2, "a 7-hour-old scan is refreshed");
});
