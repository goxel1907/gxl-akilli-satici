import assert from "node:assert/strict";
import test from "node:test";
import { autopilotQueue, autopilotStatus, extractDiscoveries, listDiscoveries, recordScan, runAutopilot } from "../../worker/src/discovery.js";
import { scoreTrend, TREND_NICHES, type TrendStore } from "../../worker/src/etsy-trends.js";
import { publishEtsyListing } from "../../worker/src/product-studio.js";
import worker, { handleRequest } from "../../worker/src/index.js";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const DAY = 24 * 60 * 60;

function memoryKv() {
  const values = new Map<string, string>();
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as TrendStore & { delete(key: string): Promise<void> } };
}

function listing(favorites: number, ageDays: number, tags: string[], now = NOW, cents = 650) {
  return {
    title: `Listing ${favorites}`,
    url: `https://www.etsy.com/listing/${favorites}`,
    num_favorers: favorites,
    listing_type: "download",
    tags,
    original_creation_timestamp: Math.round(now / 1000) - ageDays * DAY,
    price: { amount: cents, divisor: 100, currency_code: "USD" }
  };
}

function doilyPayload(now = NOW) {
  return {
    count: 3_000,
    results: [
      listing(300, 30, ["pineapple doily", "digital download", "lace"], now),
      listing(30, 60, ["crochet table runner", "christmas gift", "boho wall hanging"], now),
      listing(900, 400, ["vintage doily pattern"], now)
    ]
  };
}

test("rising tags come only from fresh listings, weighted by favorite speed", () => {
  const result = scoreTrend("crochet doily pattern", doilyPayload(), NOW, "patterns");
  const weight = (tag: string) => result.risingTags?.find((item) => item.tag === tag)?.weight;
  assert.equal(weight("pineapple doily"), 300);
  assert.equal(weight("crochet table runner"), 15);
  assert.equal(weight("vintage doily pattern"), undefined);
  assert.equal(result.risingTags?.[0].weight, 300);
  assert.ok(result.topTags.some((item) => item.tag === "vintage doily pattern"));
});

test("discoveries turn real Etsy tags into new search phrases per group", () => {
  const patterns = extractDiscoveries(scoreTrend("crochet doily pattern", doilyPayload(), NOW, "patterns"));
  const phrases = patterns.map((item) => item.keyword);
  assert.ok(phrases.includes("pineapple doily pattern"));
  assert.ok(phrases.includes("crochet table runner pattern"));
  assert.ok(phrases.includes("vintage doily pattern"));
  assert.ok(!phrases.some((phrase) => /digital download|christmas gift|boho wall|^lace/.test(phrase)));
  assert.equal(patterns.find((item) => item.keyword === "pineapple doily pattern")?.rising, true);
  assert.equal(patterns.find((item) => item.keyword === "vintage doily pattern")?.rising, false);
  assert.ok(patterns.every((item) => item.group === "patterns" && item.from === "crochet doily pattern"));

  const tesbih = extractDiscoveries(scoreTrend("misbaha", {
    count: 800,
    results: [listing(40, 20, ["worry beads", "islamic gift for men", "mens bracelet", "tasbih"], NOW, 9_000)]
  }, NOW, "tesbih"));
  assert.deepEqual(tesbih.map((item) => item.keyword).sort(), ["islamic gift for men", "worry beads"]);
});

test("recorded scans keep a ranked, de-duplicated discovery list and track manual searches", async () => {
  const kv = memoryKv();
  const result = scoreTrend("crochet doily pattern", doilyPayload(), NOW, "patterns");
  const added = await recordScan(kv.store, result, NOW);
  assert.ok(added.length >= 2);
  assert.deepEqual(await recordScan(kv.store, result, NOW + 1_000), []);

  const followUp = scoreTrend("pineapple doily pattern", doilyPayload(), NOW, "patterns");
  await recordScan(kv.store, followUp, NOW + 2_000);
  const list = await listDiscoveries(kv.store);
  const pineapple = list.find((item) => item.keyword === "pineapple doily pattern")!;
  assert.equal(pineapple.summary?.score, followUp.score);
  assert.equal(new Set(list.map((item) => item.keyword)).size, list.length);
  assert.ok(!list.some((item) => TREND_NICHES.some((niche) => niche.keyword === item.keyword)));

  const manual = scoreTrend("crochet market bag pattern", doilyPayload(), NOW, "patterns");
  await recordScan(kv.store, manual, NOW, { track: true });
  const tracked = (await listDiscoveries(kv.store)).find((item) => item.keyword === "crochet market bag pattern");
  assert.equal(tracked?.from, "elle arandı");
  assert.equal(tracked?.summary?.score, manual.score);
});

test("autopilot queue mixes seed niches, upcoming seasons and discoveries without duplicates", () => {
  const queue = autopilotQueue([
    { keyword: "pineapple doily pattern", group: "patterns", from: "crochet doily pattern", rising: true, discoveredAt: new Date(NOW).toISOString() },
    { keyword: "crochet doily pattern", group: "patterns", from: "x", rising: false, discoveredAt: new Date(NOW).toISOString() }
  ], new Date(NOW));
  const keywords = queue.map((item) => item.keyword);
  assert.equal(keywords[0], TREND_NICHES[0].keyword);
  assert.ok(keywords.includes("christmas crochet pattern"));
  assert.ok(keywords.includes("pineapple doily pattern"));
  assert.equal(new Set(keywords).size, keywords.length);
  assert.equal(queue.find((item) => item.keyword === "misbaha" || item.keyword === "tasbih")?.group, "tesbih");
});

test("autopilot scans one stale keyword per run, records discoveries and reports errors", async () => {
  const kv = memoryKv();
  const scanned: string[] = [];
  let fail = false;
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    scanned.push(url.searchParams.get("keywords") || "");
    if (fail) return Response.json({ error: "Too many requests" }, { status: 429 });
    if (/planner/.test(url.searchParams.get("keywords") || "")) return Response.json({ count: 900, results: [listing(200, 20, ["sinking funds tracker", "cash envelope budget", "disney planner"])] });
    return Response.json(doilyPayload(NOW));
  }) as typeof fetch;
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };

  assert.deepEqual(await runAutopilot({}, kv.store, fetcher, new Date(NOW)), { skipped: true });
  const first = await runAutopilot(env, kv.store, fetcher, new Date(NOW));
  assert.equal(first.keyword, TREND_NICHES[0].keyword);
  assert.ok(first.added.includes("sinking funds tracker"));
  assert.ok(!first.added.some((phrase) => phrase.includes("disney")));
  const second = await runAutopilot(env, kv.store, fetcher, new Date(NOW + 30 * 60_000));
  assert.equal(second.keyword, TREND_NICHES[1].keyword);
  assert.deepEqual(scanned, [TREND_NICHES[0].keyword, TREND_NICHES[1].keyword]);

  fail = true;
  const third = await runAutopilot(env, kv.store, fetcher, new Date(NOW + 60 * 60_000));
  assert.ok(third.error);
  const status = await autopilotStatus(kv.store);
  assert.equal(status.runs, 3);
  assert.equal(status.tracked, 2);
  assert.equal(status.lastKeyword, TREND_NICHES[2].keyword);
  assert.ok(status.lastError);
});

test("scan endpoint tracks manual searches with a group override and discoveries endpoint lists them", async () => {
  const kv = memoryKv();
  const cached = scoreTrend("eid gift for men", {
    count: 900,
    results: [listing(25, 15, ["worry beads", "eid mubarak gift", "dhikr counter beads"], Date.now(), 4_500)]
  }, Date.now(), "tesbih");
  await kv.store.put("etsy:trend:eid-gift-for-men", JSON.stringify(cached));
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };

  const scan = await handleRequest(new Request("https://gxl.example/api/etsy/trends/scan", { method: "POST", headers, body: JSON.stringify({ keyword: "eid gift for men", group: "tesbih", track: true }) }), env);
  assert.equal(scan.status, 200);
  const scanBody = await scan.json() as { cached: boolean; discovered: string[] };
  assert.equal(scanBody.cached, true);
  assert.deepEqual(scanBody.discovered.sort(), ["dhikr counter beads", "eid mubarak gift"]);

  const response = await handleRequest(new Request("https://gxl.example/api/etsy/discoveries", { headers }), env);
  assert.equal(response.status, 200);
  const body = await response.json() as { autopilot: { enabled: boolean; runs: number }; items: Array<{ keyword: string; group: string; from: string }> };
  assert.equal(body.autopilot.enabled, true);
  assert.equal(body.autopilot.runs, 0);
  const manual = body.items.find((item) => item.keyword === "eid gift for men");
  assert.equal(manual?.group, "tesbih");
  assert.equal(manual?.from, "elle arandı");
});

test("publishing activates the Etsy draft and the endpoint requires explicit confirmation", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "listings_w", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  let patch: { method?: string; body?: BodyInit | null } | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, currency_code: "USD" });
    if (url.pathname === "/v3/application/shops/777/listings/901") {
      patch = { method: init?.method, body: init?.body };
      return Response.json({ listing_id: 901, state: "active", url: "https://www.etsy.com/listing/901/silver-prayer-beads" });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;

  const result = await publishEtsyListing(env, 901, fetcher);
  assert.deepEqual(result, { listingId: 901, state: "active", url: "https://www.etsy.com/listing/901/silver-prayer-beads" });
  assert.equal(patch?.method, "PATCH");
  assert.equal((patch?.body as URLSearchParams).get("state"), "active");
  await assert.rejects(publishEtsyListing(env, 0, fetcher), /Geçersiz Etsy ilan numarası/);

  const apiEnv = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: kv.store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const unconfirmed = await handleRequest(new Request("https://gxl.example/api/products/etsy-publish", { method: "POST", headers, body: JSON.stringify({ listingId: 901 }) }), apiEnv);
  assert.equal(unconfirmed.status, 409);
  const invalid = await handleRequest(new Request("https://gxl.example/api/products/etsy-publish", { method: "POST", headers, body: JSON.stringify({ confirm: true, listingId: "abc" }) }), apiEnv);
  assert.equal(invalid.status, 400);
});

test("scheduled worker event runs the autopilot in the background", async () => {
  const pending: Array<Promise<unknown>> = [];
  worker.scheduled({}, {} as never, { waitUntil: (promise) => { pending.push(promise); } });
  assert.equal(pending.length, 1);
  assert.deepEqual(await pending[0], { skipped: true });
});
