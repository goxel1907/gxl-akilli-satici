import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeScorecardInput, scoreListing, scoreShopListings } from "../../worker/src/listing-scorecard.js";
import { buildProductPlan, normalizeProductInput, ruleKeywordCandidates } from "../../worker/src/product-studio.js";
import { buildDigitalListing } from "../../worker/src/pattern-studio.js";
import { buildPrintableListing } from "../../worker/src/printable-studio.js";
import { handleRequest } from "../../worker/src/index.js";
import type { TrendStore } from "../../worker/src/etsy-trends.js";

const products = {
  tesbih: { titleTr: "925 Ayar Gümüş Kafesli Tespih", origin: "designed_by_seller", materialVerified: true, weightGrams: 45, beadCount: 33, lengthCm: 40, priceTry: 5000, shippingTry: 1200, usdTryRate: 40, productKind: "tesbih" },
  sweater: { titleTr: "Tığ işi krem oversize kazak", origin: "made_by_seller", productKind: "knitwear", fiber: "%100 pamuk", size: "m", chestCm: 52, lengthCm: 60, colors: ["Cream"], audience: "women", priceTry: 2500, shippingTry: 900, usdTryRate: 40 },
  vintage: { titleTr: "Vintage bakır tepsi", productKind: "vintage", origin: "vintage", yearMade: 1975, material: "bakır", widthCm: 35, lengthCm: 35, weightGrams: 800, conditionLevel: "light_wear", priceTry: 3000, shippingTry: 1500, usdTryRate: 40 }
};

// Uygulamanın kendi hazırladığı ilan kendi karnesinden geçmeli; geçemiyorsa ya kural ya üretim yanlıştır.
test("listings the app writes itself fill all 13 tags and score A", () => {
  for (const [name, raw] of Object.entries(products)) {
    const product = normalizeProductInput(raw);
    const plan = buildProductPlan(product, ruleKeywordCandidates(product), [], { usdTryRate: 40, shopCurrency: "USD" });
    assert.equal(plan.tags.length, 13, `${name}: ${plan.tags.join(", ")}`);
    const card = scoreListing({ title: plan.title, tags: plan.tags, description: plan.description, photoCount: 10, priceUsd: plan.pricing?.recommendedUsd, medianPriceUsd: plan.pricing?.medianUsd, primaryKeyword: plan.primaryKeyword });
    assert.equal(card.grade, "A", `${name}: ${card.score} ${card.checks.filter((check) => !check.ok).map((check) => check.id).join(", ")}`);
  }
  const pattern = buildDigitalListing({ name: "Juniper Crown Doily", craft: "crochet", productType: "doily", keyword: "crochet doily pattern", pageCount: 24 });
  const patternCard = scoreListing({ title: pattern.title, tags: pattern.tags, description: pattern.description, digital: true, primaryKeyword: "crochet doily pattern" });
  assert.ok(patternCard.checks.find((check) => check.id === "description_details")?.ok, "the pattern says it is a PDF, not a finished item");
  const planner = buildPrintableListing({ kind: "planner", productType: "planner", keyword: "printable planner", trendFeatures: ["daily", "habit tracker", "weekly"], pageCount: 33 }, "Zomery Planner");
  const plannerCard = scoreListing({ title: planner.title, tags: planner.tags, description: planner.description, digital: true, primaryKeyword: "printable planner" });
  assert.ok(plannerCard.score >= 85, `planner ${plannerCard.score}: ${plannerCard.checks.filter((check) => !check.ok).map((check) => check.id).join(", ")}`);
});

test("a weak listing gets a low grade with concrete Turkish fixes", () => {
  const card = scoreListing({ title: "SILVER BEADS SILVER SILVER", tags: ["beads", "silver", "beads", "a very long tag that breaks etsy"], description: "Nice beads.", photoCount: 0, priceUsd: 400, medianPriceUsd: 60, primaryKeyword: "sterling silver prayer beads" });
  assert.equal(card.grade, "D");
  const fixes = Object.fromEntries(card.checks.filter((check) => !check.ok).map((check) => [check.id, check.fixTr || ""]));
  assert.match(fixes.title_length, /30|ürün adı/);
  assert.match(fixes.title_keyword_front, /sterling silver prayer beads/);
  assert.match(fixes.title_repeat, /silver/);
  assert.match(fixes.title_caps, /BÜYÜK HARF/);
  assert.match(fixes.tags_count, /4 etiket/);
  assert.match(fixes.tags_length, /20 karakter/);
  assert.match(fixes.tags_unique, /iki kez/);
  assert.match(fixes.photos, /fotoğrafsız/);
  assert.match(fixes.price_market, /2 katından/);
});

test("unknown photo count and market price are left out of the score instead of counting as zero", () => {
  const base = { title: "Sterling Silver Prayer Beads, Tasbih Misbaha, Handmade Gift", tags: Array.from({ length: 13 }, (_, index) => `prayer beads ${index}`), description: `Sterling silver prayer beads. ${"Details about size 40 cm and silver material. ".repeat(12)}`, primaryKeyword: "sterling silver prayer beads" };
  const card = scoreListing(base);
  assert.ok(!card.checks.some((check) => check.area === "photos" || check.area === "price"));
  assert.equal(card.score, 100);
  assert.equal(normalizeScorecardInput({ ...base, tags: "a, b ,c" }).tags.length, 3, "comma separated tags from the phone are accepted");
});

test("the shop's live and draft listings are scored, weakest first", async () => {
  const kv = { values: new Map<string, string>() };
  const store = { async get(key: string) { return kv.values.get(key) ?? null; }, async put(key: string, value: string) { kv.values.set(key, value); }, async delete(key: string) { kv.values.delete(key); } };
  await store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "listings_r", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store as TrendStore & { delete(key: string): Promise<void> } };
  const states: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777 });
    if (url.pathname === "/v3/application/shops/777/listings") {
      states.push(`${url.searchParams.get("state")}:${url.searchParams.get("includes")}`);
      return Response.json({ results: url.searchParams.get("state") === "active"
        ? [{ listing_id: 1, title: "Sterling Silver Prayer Beads, Tasbih Misbaha, Islamic Gift for Him", tags: Array.from({ length: 13 }, (_, i) => `silver beads ${i}`), description: `Sterling silver prayer beads. ${"Length 40 cm, sterling silver material, care tips. ".repeat(10)}`, images: Array(10).fill({}), price: { amount: 18999, divisor: 100, currency_code: "USD" }, type: "physical" }]
        : [{ listing_id: 2, title: "beads", tags: ["beads"], description: "beads", images: [], type: "physical" }] });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  const result = await scoreShopListings(env, fetcher);
  assert.deepEqual(states, ["active:Images", "draft:Images"]);
  assert.deepEqual(result.items.map((item) => item.listingId), [2, 1]);
  assert.equal(result.items[0].state, "draft");
  assert.match(result.items[0].editUrl, /listing-editor\/edit\/2$/);
});

test("the scorecard is shown before sending to Etsy and needs the app key", async () => {
  const denied = await handleRequest(new Request("https://gxl.example/api/listings/scorecard", { method: "POST", body: "{}" }), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(denied.status, 401);
  const ok = await handleRequest(new Request("https://gxl.example/api/listings/scorecard", { method: "POST", headers: { authorization: "Bearer app-token", "content-type": "application/json" }, body: JSON.stringify({ title: "Copper tray", tags: ["copper tray"], description: "" }) }), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json() as { grade: string }).grade, "D");
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  assert.match(app, /<ScorecardView card=\{scorecard\} busy=\{scoring\} onRefresh=\{\(\) => rescore\(\)\} \/>/);
  assert.match(app, /fresh && fresh\.score < 50/, "a weak listing asks before creating the Etsy draft");
  assert.match(app, /photoCount=\{photos\.length\}/);
});
