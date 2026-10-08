import assert from "node:assert/strict";
import test from "node:test";
import { buildPatternSeed, createPatternSeed, readUsedNames } from "../../worker/src/pattern-seed.js";
import { buildDigitalListing, buildPatternBrief, choosePatternName, normalizeDigitalListingInput } from "../../worker/src/pattern-studio.js";
import type { TrendResult, TrendStore } from "../../worker/src/etsy-trends.js";
import { handleRequest } from "../../worker/src/index.js";

function memoryKv() {
  const values = new Map<string, string>();
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as TrendStore & { delete(key: string): Promise<void> } };
}

const tags = (rows: Array<[string, number]>) => rows.map(([tag, count]) => ({ tag, count }));

function trend(keyword: string, partial: Partial<TrendResult>): TrendResult {
  return {
    keyword,
    group: "patterns",
    score: 50,
    verdict: "Denenebilir",
    metrics: { activeListings: 50_000, favoritesPerMonth: 20, medianPriceUsd: 7, newcomerShare: 0.5, digitalShare: 1 },
    reasons: [],
    topTags: [],
    risingTags: [],
    examples: [],
    scannedAt: new Date().toISOString(),
    ...partial
  } as TrendResult;
}

// Telefondaki "sewing pattern pdf" taramasındaki etiketler.
const sewing = trend("sewing pattern pdf", {
  metrics: { activeListings: 1_407_006, favoritesPerMonth: 39.3, medianPriceUsd: 6.97, newcomerShare: 0.73, digitalShare: 1 } as TrendResult["metrics"],
  topTags: tags([["sewing pattern pdf", 47], ["beginner sewing", 16], ["pdf sewing pattern", 10], ["instant download", 8], ["bag sewing pattern", 7], ["easy sewing pattern", 6], ["beginner sewing pdf", 5], ["sewing pattern", 5], ["tote bag pattern", 5], ["diy tote bag", 4], ["printable pattern", 4], ["a0 sewing pattern", 3], ["baby sewing pattern", 3], ["bag pattern pdf", 3]]),
  risingTags: [{ tag: "reversible tote bag", weight: 40 }, { tag: "lined tote bag", weight: 20 }],
  examples: [
    { title: "Low Rise Pleated Skirt Sewing Pattern PDF, Sizes XS-5XL", favorites: 5785, ageDays: 187 },
    { title: "Reversible Tote Bag Sewing Pattern, Lined Tote with Pockets, Canvas Bag", favorites: 900, ageDays: 60 }
  ]
});

const cardigan = trend("crochet cardigan pattern", {
  topTags: tags([["crochet cardigan pattern", 40], ["granny square cardigan", 12], ["oversized cardigan", 9], ["crochet cardigan", 8], ["boho cardigan", 6], ["chunky cardigan", 5], ["beginner crochet", 5], ["granny square", 5], ["sage green cardigan", 3], ["plus size cardigan", 4], ["crochet sweater", 4], ["cotton yarn", 2]]),
  risingTags: [{ tag: "patchwork cardigan", weight: 30 }, { tag: "cropped cardigan", weight: 22 }, { tag: "puff sleeve cardigan", weight: 10 }],
  examples: [
    { title: "Oversized Granny Square Cardigan Crochet Pattern, Boho Patchwork Jacket, XS-5XL", favorites: 3000, ageDays: 90 },
    { title: "Chunky Cropped Cardigan Crochet Pattern in Cream and Sage", favorites: 800, ageDays: 40 }
  ]
});

test("seed fills every field from trend data, even when the search has no product word", () => {
  const seed = buildPatternSeed("sewing pattern pdf", sewing, { nonce: "a" });
  assert.equal(seed.craft, "sewing");
  assert.equal(seed.productType, "tote bag");
  assert.equal(seed.skillLevel, "beginner");
  assert.equal(seed.sizeNote, "");
  assert.equal(seed.yarnNote, "canvas");
  assert.ok(seed.trendFeatures.includes("reversible"));
  assert.ok(!seed.trendFeatures.some((feature) => /canvas|a0|beginner/.test(feature)));
  assert.equal(seed.colors.length, 3);
  assert.match(seed.referenceNotes, /Etsy market brief for "sewing pattern pdf"/);
  assert.ok(seed.trendTags.includes("beginner sewing") && seed.trendTags.includes("instant download"));
  assert.ok(seed.basis.some((line) => line.includes("tote bag")));
});

test("seed keeps trend colors and sizes but cuts features cleanly", () => {
  const seed = buildPatternSeed("crochet cardigan pattern", cardigan, { nonce: "a" });
  assert.equal(seed.craft, "crochet");
  assert.equal(seed.productType, "cardigan");
  assert.equal(seed.trendFeatures[0], "granny square");
  assert.ok(!seed.trendFeatures.some((feature) => /oversized granny|cotton|yarn|sage/.test(feature)));
  assert.equal(seed.colors[0], "sage green");
  assert.ok(!seed.referenceColors.includes("sage"));
  assert.match(seed.sizeNote, /XS-5XL/);
  assert.match(seed.yarnNote, /chunky/);
});

test("each seed request picks a combination that was not used before for that search", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:trend:crochet-cardigan-pattern", JSON.stringify(cardigan));
  const seen = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    const seed = await createPatternSeed({}, kv.store, { keyword: "crochet cardigan pattern" }, fetch, Date.now() + index);
    seen.add(`${[...seed.trendFeatures].sort().join("|")}#${[...seed.colors].sort().join("|")}`);
    assert.equal(seed.productType, "cardigan");
  }
  assert.equal(seen.size, 4);
  const history = JSON.parse(kv.values.get("pattern:seed:crochet-cardigan-pattern")!) as { combos: string[]; palettes: string[] };
  assert.equal(history.combos.length >= 2, true);
  assert.equal(history.palettes.length, 4);
  await assert.rejects(createPatternSeed({}, kv.store, { keyword: "x" }), /PATTERN_KEYWORD_REQUIRED/);
});

test("pattern names are coined, deterministic per seed and never reuse an earlier name", () => {
  const input = { craft: "crochet" as const, productType: "cardigan", seed: "s1", trendFeatures: ["granny square"], colors: ["sage green"] };
  const first = choosePatternName(input);
  assert.equal(choosePatternName(input), first);
  assert.match(first, / Cardigan$/);
  const second = choosePatternName({ ...input, avoidNames: [first] });
  assert.notEqual(second, first);
  assert.match(second, / Cardigan$/);
});

test("trend-mode prompt is a market brief, not a copy of a single model", () => {
  const seed = buildPatternSeed("crochet cardigan pattern", cardigan, { nonce: "b" });
  const brief = buildPatternBrief({ ...seed, seed: "b" });
  assert.match(brief.patternPrompt, /## Market brief \(Etsy research\)/);
  assert.doesNotMatch(brief.patternPrompt, /The shop owner liked a reference design/);
  assert.match(brief.patternPrompt, /signature detail/);
  assert.match(brief.patternPrompt, new RegExp(`Use this palette: ${seed.colors.join(", ")}`));
  assert.ok(brief.originalityPlan[0].includes(seed.trendFeatures[0]));
});

test("listing title is led by the product and only uses filler phrases the trend data contains", () => {
  const seed = buildPatternSeed("sewing pattern pdf", sewing, { nonce: "c" });
  const listing = buildDigitalListing(normalizeDigitalListingInput({ ...seed, name: "Test Name Tote Bag" }));
  assert.ok(listing.title.startsWith("Tote Bag Sewing Pattern PDF, Test Name Tote Bag"));
  assert.match(listing.title, /Reversible Tote Bag/);
  assert.match(listing.title, /Instant Download/);
  assert.doesNotMatch(listing.title, /US Terms/);
  assert.ok(!listing.tags.includes("baby sewing pattern"));
  assert.equal(listing.tags.length, 13);
  assert.equal(listing.checks.ok, true);

  const cardiganSeed = buildPatternSeed("crochet cardigan pattern", cardigan, { nonce: "d" });
  const cardiganListing = buildDigitalListing(normalizeDigitalListingInput({ ...cardiganSeed, name: "Test Cardigan" }));
  assert.doesNotMatch(cardiganListing.title, /Instant Download|US Terms/);
  assert.match(cardiganListing.title, /Granny Square Cardigan/);
});

test("seed and plan endpoints fill the studio and remember used names", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:trend:crochet-cardigan-pattern", JSON.stringify(cardigan));
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: kv.store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };

  const seedResponse = await handleRequest(new Request("https://gxl.example/api/patterns/seed", { method: "POST", headers, body: JSON.stringify({ keyword: "crochet cardigan pattern" }) }), env);
  assert.equal(seedResponse.status, 200);
  const seed = await seedResponse.json() as Record<string, unknown>;
  assert.equal(seed.productType, "cardigan");
  assert.equal(seed.referenceSource, "trend");

  const body = JSON.stringify({ ...seed, seed: "same" });
  const first = await (await handleRequest(new Request("https://gxl.example/api/patterns/plan", { method: "POST", headers, body }), env)).json() as { brief: { name: string; patternPrompt: string } };
  const second = await (await handleRequest(new Request("https://gxl.example/api/patterns/plan", { method: "POST", headers, body }), env)).json() as { brief: { name: string } };
  assert.notEqual(first.brief.name, second.brief.name);
  assert.match(first.brief.patternPrompt, /Market brief/);
  assert.deepEqual((await readUsedNames(kv.store)).slice(0, 2), [second.brief.name, first.brief.name]);

  const missing = await handleRequest(new Request("https://gxl.example/api/patterns/seed", { method: "POST", headers, body: JSON.stringify({}) }), env);
  assert.equal(missing.status, 400);
});
