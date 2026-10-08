import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvice } from "../../worker/src/advice.js";
import { createDigitalProduct, findKindTaxonomyId, type DigitalStore } from "../../worker/src/digital-delivery.js";
import { inferPrintableKind, scoreTrend, TREND_NICHES } from "../../worker/src/etsy-trends.js";
import { findIpRisks } from "../../worker/src/ip-guard.js";
import { buildPatternSeed } from "../../worker/src/pattern-seed.js";
import { buildPatternBrief } from "../../worker/src/pattern-studio.js";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { handleRequest } from "../../worker/src/index.js";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const listing = (title: string, tags: string[], favorites: number, ageDays: number, cents = 699) => ({
  title, tags, num_favorers: favorites, listing_type: "download", url: `https://www.etsy.com/listing/${favorites}`,
  original_creation_timestamp: Math.round(NOW / 1000) - ageDays * 86_400, price: { amount: cents, divisor: 100, currency_code: "USD" }
});

const budgetPayload = { count: 85_000, results: [
  listing("Budget Planner Printable, Monthly Budget, Bill Tracker, A4 A5 Letter, 30 Pages", ["budget planner", "budget planner printable", "monthly budget", "bill tracker", "a5 budget planner", "instant download"], 900, 200),
  listing("Minimalist Budget Binder Bundle 50 Pages, Savings Tracker, Debt Tracker", ["budget binder", "minimalist planner", "savings tracker", "debt tracker", "budget planner"], 400, 60),
  listing("Cash Envelope Budget System Printable, Sinking Funds Tracker 40 Pages", ["cash envelope budget", "sinking funds tracker", "paycheck budget", "budget planner"], 300, 40),
  listing("Disney Budget Planner Printable 25 pages", ["disney budget", "budget planner", "monthly budget"], 100, 300),
  listing("Paycheck Budget Planner Letter Size Printable, Finance Planner", ["paycheck budget", "finance planner", "budget planner printable", "bill tracker"], 250, 90),
  listing("Sage Green Budget Planner Set, Monthly Budget, Savings Tracker 35 pages", ["budget planner", "monthly budget", "savings tracker", "sage green planner"], 200, 30)
] };

test("printable niches span the PDF products women buy, and kinds are inferred from the search", () => {
  const kinds = new Set(TREND_NICHES.filter((niche) => niche.group === "printables").map((niche) => niche.kind));
  for (const kind of ["planner", "digital_planner", "coloring", "wall_art", "party", "recipe", "journal", "kids", "paper_craft"]) assert.ok(kinds.has(kind as never), kind);
  assert.equal(inferPrintableKind("digital planner goodnotes"), "digital_planner");
  assert.equal(inferPrintableKind("bridal shower games"), "party");
  assert.equal(inferPrintableKind("junk journal kit"), "paper_craft");
  assert.deepEqual(findIpRisks("Disney Princess coloring pages, Taylor Swift eras"), ["disney", "taylor swift"]);
  assert.deepEqual(findIpRisks("Floral spring coloring pages"), []);
});

test("printable scans measure competitor formats, bundles, page counts and brand risks", () => {
  const result = scoreTrend("budget planner printable", budgetPayload, NOW);
  assert.equal(result.group, "printables");
  assert.equal(result.kind, "planner");
  const share = (id: string) => result.signals!.formats.find((item) => item.id === id)!.share;
  assert.equal(share("a5"), 0.17);
  assert.equal(share("letter"), 0.17);
  assert.equal(result.signals!.bundleShare, 0.17);
  assert.equal(result.signals!.pageCountMedian, 35);
  assert.deepEqual(result.signals!.ipRisks, ["disney"]);
  assert.equal(result.advice![0].titleTr, "Marka / telif riski");
  assert.ok(result.advice!.some((item) => item.titleTr === "Boşluk: US Letter"));
  assert.ok(result.advice!.some((item) => item.titleTr === "Daha fazla değer ver" && item.detailTr.includes("42")));
});

test("advice reacts to standard formats and bundle-heavy niches", () => {
  const result = scoreTrend("adult coloring pages", { count: 20_000, results: Array.from({ length: 12 }, (_, index) => listing(`Mandala Coloring Bundle ${index} US Letter A4 50 pages`, ["adult coloring pages", "mandala coloring"], 300 + index, 40)) }, NOW);
  const advice = buildAdvice(result);
  assert.ok(advice.some((item) => item.titleTr === "Bu formatlar artık standart" && item.detailTr.includes("US Letter")));
  assert.ok(advice.some((item) => item.titleTr === "Paketler satıyor"));
});

test("printable seed fills kind, product, formats and a page count above competitors", () => {
  const result = scoreTrend("budget planner printable", budgetPayload, NOW);
  const seed = buildPatternSeed(result.keyword, result, { nonce: "1" });
  assert.equal(seed.studio, "printable");
  assert.equal(seed.kind, "planner");
  assert.equal(seed.productType, "budget planner");
  assert.deepEqual(seed.formats.slice(0, 4), ["US Letter", "A4", "A5", "Half Letter"]);
  assert.equal(seed.pageCount, 42);
  assert.ok(!seed.trendTags.some((tag) => tag.includes("disney")));
  assert.ok(seed.basis.some((line) => line.startsWith("PDF türü: Planlayıcı")));

  const kids = buildPatternSeed("coloring pages for kids", undefined, { nonce: "1" });
  assert.equal(kids.kind, "coloring");
  assert.equal(kids.productType, "kids coloring pages");
  assert.deepEqual(kids.formats, ["US Letter", "A4"]);
  assert.equal(buildPatternSeed("crochet cardigan pattern", undefined).studio, "pattern");
});

test("printable brief gives a kind-specific print prompt, artwork prompts and ad visuals with their placement", () => {
  const planner = buildPrintableBrief({ kind: "planner", productType: "budget planner", keyword: "budget planner printable", trendFeatures: ["sinking funds tracker", "minimalist"], trendTags: ["sinking funds tracker", "budget binder", "savings tracker", "disney budget"], colors: ["sage green", "cream", "plum"], pageCount: 42, seed: "a" });
  assert.match(planner.pdfPrompt, /Undated pages with both Monday-start and Sunday-start/);
  assert.match(planner.pdfPrompt, /How to print/);
  assert.match(planner.pdfPrompt, /@page/);
  assert.match(planner.pdfPrompt, /Never use trademarked names/);
  assert.deepEqual(planner.artPrompts, []);
  assert.equal(planner.adVisuals.length, 10);
  assert.ok(planner.adVisuals.every((visual) => visual.useTr && visual.aspect && visual.prompt.includes("Do not render any text")));
  assert.ok(planner.adVisuals.some((visual) => /Pinterest/.test(visual.useTr) && visual.aspect.startsWith("2:3")));
  assert.ok(planner.adVisuals.some((visual) => /Instagram/.test(visual.useTr)));
  assert.match(planner.adVisuals[0].prompt, /calculator|receipts|savings tracker|binder/);
  assert.equal(planner.pins.length, 3);
  assert.ok(planner.pins.every((pin) => !/disney/i.test(`${pin.title} ${pin.description}`)));
  assert.ok(planner.bundleIdea.items.includes("budget planner"));

  const coloring = buildPrintableBrief({ kind: "coloring", productType: "adult coloring pages", trendFeatures: ["mushroom", "cottagecore"], pageCount: 30, seed: "b" });
  assert.equal(coloring.artPrompts.length, 8);
  assert.match(coloring.artPrompts[0], /fully closed/);
  assert.match(coloring.pdfPrompt, /## Artwork prompts/);
  const wallArt = buildPrintableBrief({ kind: "wall_art", productType: "wall art", trendFeatures: ["boho"], pageCount: 3, seed: "c" });
  assert.equal(wallArt.artPrompts.length, 3);
  assert.match(wallArt.pdfPrompt, /five ratio files/);
});

test("printable listing leads with the buyer phrase, lists formats and drops brand terms", () => {
  const input = { kind: "planner" as const, productType: "budget planner", keyword: "budget planner printable", trendFeatures: ["sinking funds tracker"], trendTags: ["sinking funds tracker", "disney budget", "savings tracker", "instant download"], formats: ["US Letter", "A4", "A5"], pageCount: 42 };
  const draft = buildPrintableListing(input, "Muthine Budget Planner");
  assert.ok(draft.title.startsWith("Budget Planner Printable, Muthine Budget Planner, Sinking Funds Tracker"));
  assert.match(draft.title, /US Letter, A4, A5/);
  assert.match(draft.title, /Instant Download/);
  assert.ok(!draft.tags.some((tag) => tag.includes("disney")));
  assert.equal(draft.tags.length, 13);
  assert.equal(draft.checks.ok, true);
  assert.match(draft.description, /NO PHYSICAL ITEM WILL BE SHIPPED/);
  assert.match(draft.description, /About 42 pages/);
});

test("pattern briefs also get placement-labelled ad visuals", () => {
  const brief = buildPatternBrief({ craft: "crochet", productType: "cardigan", seed: "x", trendFeatures: ["granny square"], colors: ["sage green"] });
  assert.equal(brief.adVisuals.length, 10);
  assert.match(brief.adVisuals[1].prompt, /cardigan/);
  assert.match(brief.adVisuals[0].prompt, /Design spec JSON/);
});

test("printable plan endpoint and kind-aware digital products", async () => {
  const values = new Map<string, string | ArrayBuffer>();
  const store = {
    async get(key: string, type?: string) { const value = values.get(key); if (value === undefined) return null; return type === "arrayBuffer" ? value : value; },
    async put(key: string, value: string | ArrayBuffer) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  } as unknown as DigitalStore;
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const response = await handleRequest(new Request("https://gxl.example/api/printables/plan", { method: "POST", headers, body: JSON.stringify({ kind: "recipe", productType: "recipe cards", keyword: "recipe card printable", seed: "same" }) }), env);
  assert.equal(response.status, 200);
  const body = await response.json() as { brief: { name: string; pdfPrompt: string }; listing: { title: string } };
  assert.match(body.brief.pdfPrompt, /4x6 and 5x7/);
  assert.ok(body.listing.title.startsWith("Recipe Card Printable"));
  const again = await (await handleRequest(new Request("https://gxl.example/api/printables/plan", { method: "POST", headers, body: JSON.stringify({ kind: "recipe", productType: "recipe cards", keyword: "recipe card printable", seed: "same" }) }), env)).json() as { brief: { name: string } };
  assert.notEqual(again.brief.name, body.brief.name);
  assert.equal((await handleRequest(new Request("https://gxl.example/api/printables/plan", { method: "POST", headers, body: JSON.stringify({ kind: "nope", productType: "x planner" }) }), env)).status, 400);

  const form = new FormData();
  form.set("metadata", JSON.stringify({ name: "Muthine Budget Planner", kind: "planner", productType: "budget planner", listing: { title: "Budget Planner Printable", description: "A printable budget planner.", tags: ["budget planner"], materials: ["pdf file"] }, prices: { usd: 6.5 } }));
  form.set("pdf", new File([Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4_000, 32)])], "Budget.pdf", { type: "application/pdf" }));
  const product = await createDigitalProduct(store, form, "https://gxl.example", async () => undefined);
  assert.equal(product.kind, "planner");
  assert.equal(product.craft, undefined);

  const fetcher = (async () => Response.json({ results: [{ id: 1, name: "Paper & Party Supplies", children: [{ id: 2, name: "Paper", children: [{ id: 3, name: "Calendars & Planners", children: [] }] }] }] })) as typeof fetch;
  assert.equal(await findKindTaxonomyId({ ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" }, "planner", store, fetcher), 3);
});
