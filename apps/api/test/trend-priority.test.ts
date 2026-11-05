import assert from "node:assert/strict";
import test from "node:test";
import { compareTrendEvidence, trendFreshness } from "../../mobile/trend-priority.js";
import { pickBestKeyword } from "../../worker/src/pattern-seed.js";
import { listDiscoveries, recordScan } from "../../worker/src/discovery.js";
import { readProductIdeas } from "../../worker/src/product-ideas.js";
import { buildOpportunityCenter, replyToAgent } from "../src/opportunity-agent.js";
import { scoreTrend, type TrendGroup, type TrendStore } from "../../worker/src/etsy-trends.js";

const now = Date.now();
function memory() { const values = new Map<string, string>(); return { values, store: { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); } } as TrendStore }; }
const key = (keyword: string) => `etsy:trend:${keyword.replace(/[^\p{L}\p{Nd}]+/gu, "-")}`;
function result(keyword: string, score: number, age = 0, group: TrendGroup = "printables") {
  return { ...scoreTrend(keyword, { count: 1000, results: Array.from({ length: 3 }, () => ({ title: keyword, listing_type: "download", num_favorers: 30, original_creation_timestamp: Math.floor(now / 1000) - 90 * 86400, price: { amount: 600, divisor: 100, currency_code: "USD" }, tags: [] })) }, now - age, group), score };
}

test("fresh evidence ranks above stale scores and unmeasured discoveries have no invented points", async () => {
  const { values, store } = memory();
  const fresh = result("ocean coloring pages", 20);
  const stale = result("space coloring pages", 99, 7 * 3600000);
  const rows = [stale, undefined, fresh].sort((a, b) => compareTrendEvidence(a, b, now));
  assert.equal(rows[0]?.keyword, fresh.keyword);
  assert.equal(trendFreshness(stale, now), "stale");
  assert.equal(trendFreshness({ score: NaN, scannedAt: fresh.scannedAt }, now), "unscanned");
  assert.equal(trendFreshness({ ...fresh, scannedAt: new Date(now + 86400000).toISOString() }, now), "stale");
  values.set("etsy:discovered", JSON.stringify([{ keyword: fresh.keyword, group: "printables", from: "manual", discoveredAt: fresh.scannedAt, rising: false }, { keyword: "unmeasured coloring pages", group: "printables", from: "manual", discoveredAt: fresh.scannedAt, rising: true }]));
  await recordScan(store, fresh, now);
  assert.equal((await listDiscoveries(store, now))[0].keyword, fresh.keyword);
});

test("automatic product selection includes a strong discovery beyond the former 30-candidate limit", async () => {
  const { values, store } = memory();
  const discoveries = Array.from({ length: 45 }, (_, i) => ({ keyword: `ocean ${i} coloring pages`, group: "printables", from: "animal coloring pages", discoveredAt: new Date(now).toISOString(), rising: false }));
  values.set("etsy:discovered", JSON.stringify(discoveries));
  for (const [index, item] of discoveries.entries()) values.set(key(item.keyword), JSON.stringify(result(item.keyword, index === 44 ? 95 : 30)));
  values.set(key("animal coloring pages"), JSON.stringify(result("animal coloring pages", 100, 7 * 3600000)));
  const choice = await pickBestKeyword(store, { studio: "printable", kind: "coloring" }, now);
  assert.equal(choice.keyword, discoveries[44].keyword);
  assert.match(choice.reason, /95 puan/);
});

test("agent receives measured product rankings, excluding stale and tiny samples", async () => {
  const { values, store } = memory();
  values.set("etsy:discovered", JSON.stringify([{ keyword: "animal coloring pages", group: "printables", from: "alphabet coloring pages", rising: true, discoveredAt: new Date(now).toISOString() }]));
  values.set(key("animal coloring pages"), JSON.stringify(result("animal coloring pages", 75)));
  values.set(key("budget planner printable"), JSON.stringify(result("budget planner printable", 60)));
  values.set(key("adult coloring pages"), JSON.stringify(result("adult coloring pages", 99, 7 * 3600000)));
  const tiny = result("recipe cards printable", 100); tiny.metrics.sampleSize = 1;
  values.set(key(tiny.keyword), JSON.stringify(tiny));
  const productIdeas = await readProductIdeas(store, now);
  assert.deepEqual(productIdeas.items.map(item => item.keyword), ["animal coloring pages", "budget planner printable"]);
  const context = { productIdeas };
  const center = buildOpportunityCenter(context);
  assert.equal(center.sources.find(source => source.id === "search_trends")?.status, "live");
  assert.ok(center.opportunities.some(item => item.id === "trend-animal coloring pages" && item.kind === "market_signal"));
  assert.equal(center.counts.realCustomers, 0);
  const reply = await replyToAgent("Hangi yeni ürün fikri daha öncelikli?", context);
  assert.ok(reply.basis[0].startsWith("animal coloring pages"));
  assert.match(reply.reply, /olasılığı değildir/);
  assert.ok(!reply.reply.includes("adult coloring pages"));
});

test("missing fresh trend evidence produces a rescan instruction, not an invented winner", async () => {
  const productIdeas = await readProductIdeas(undefined, now);
  const reply = await replyToAgent("Hangi yeni ürün fikrini hazırlayalım?", { productIdeas });
  assert.match(reply.reply, /son 6 saatte/);
  assert.equal(reply.basis.length, 0);
});

test("a failed automatic scan does not block every later scan of other queries", async () => {
  const { runAutopilot, autopilotStatus } = await import("../../worker/src/discovery.js");
  const { store } = memory();
  const queries: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    queries.push(new URL(String(input)).searchParams.get("keywords") || "");
    return queries.length === 1 ? Response.json({ error: "temporary failure" }, { status: 500 }) : Response.json({ count: 0, results: [] });
  }) as typeof fetch;
  const env = { ETSY_API_KEY: "local-key", ETSY_SHARED_SECRET: "local-secret" };
  await runAutopilot(env, store, fetcher, new Date(now));
  await runAutopilot(env, store, fetcher, new Date(now + 30 * 60000));
  assert.equal(queries.length, 2);
  assert.notEqual(queries[0], queries[1]);
  assert.equal((await autopilotStatus(store, false)).enabled, false);
  assert.match((await autopilotStatus(store, false)).disabledReason!, /API/);
});

test("product-ranking questions keep the measured order even when an AI provider is configured", async context => {
  const request = context.mock.method(globalThis, "fetch", async () => { throw Error("Ranking must not ask AI to invent priorities"); });
  const productIdeas = { checkedAt: new Date(now).toISOString(), method: "Observed sample", items: [
    { keyword: "animal coloring pages", group: "printables", score: 80, scannedAt: new Date(now).toISOString(), sampleSize: 30, reason: "Observed favorites" },
    { keyword: "budget planner printable", group: "printables", score: 60, scannedAt: new Date(now).toISOString(), sampleSize: 30, reason: "Observed favorites" }
  ] };
  const reply = await replyToAgent("Hangi yeni ürün fikri daha öncelikli?", { productIdeas }, { OPENAI_API_KEY: "local-only" });
  assert.equal(request.mock.callCount(), 0);
  assert.ok(reply.basis[0].startsWith("animal coloring pages"));
});
