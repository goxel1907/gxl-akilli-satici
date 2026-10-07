import assert from "node:assert/strict";
import test from "node:test";
import type { TrendResult } from "../../worker/src/etsy-trends.js";
import {
  buildProductPlan,
  computePricing,
  createEtsyPhysicalDraft,
  detectProductSignals,
  etsyEligibility,
  getUsdTryRate,
  normalizeProductInput,
  ruleKeywordCandidates
} from "../../worker/src/product-studio.js";
import { handleRequest } from "../../worker/src/index.js";

function memoryKv() {
  const values = new Map<string, string>();
  return {
    values,
    store: {
      async get(key: string) { return values.get(key) ?? null; },
      async put(key: string, value: string) { values.set(key, value); },
      async delete(key: string) { values.delete(key); }
    }
  };
}

const silverTesbih = () => normalizeProductInput({
  sourceId: "49555980",
  titleTr: "925 Ayar Gümüş Özel Tasarım Kafesli Tespih - Kral Zincir Püsküllü",
  origin: "designed_by_seller",
  materialVerified: true,
  weightGrams: 45,
  priceTry: 5000,
  shippingTry: 1200,
  usdTryRate: 40,
  imageUrls: ["https://cdn.shopier.example/p1.jpg"]
});

function scan(keyword: string, score: number, activeListings: number, medianPriceUsd: number, tags: string[]): TrendResult {
  return {
    keyword,
    group: "tesbih",
    score,
    verdict: "Talep zayıf",
    parts: { demand: 6, openness: 50, newcomer: 44, price: 80 },
    metrics: { activeListings, favoritesPerMonth: 0.3, newcomerShare: 0.44, digitalShare: 0, medianPriceUsd, sampleSize: 48 },
    reasons: [],
    topTags: tags.map((tag, index) => ({ tag, count: 20 - index })),
    examples: [{ title: `${keyword} example`, url: "https://www.etsy.com/listing/1", favorites: 12, ageDays: 90, priceUsd: medianPriceUsd }],
    scannedAt: new Date().toISOString()
  };
}

test("detects buyer language for a Turkish silver tesbih title", () => {
  const product = silverTesbih();
  const signals = detectProductSignals(product);
  assert.equal(signals.isTesbih, true);
  assert.equal(signals.material?.en, "sterling silver");
  assert.deepEqual(signals.attributes, ["cage", "tassel", "king chain"]);
  assert.deepEqual(ruleKeywordCandidates(product).slice(0, 3), ["sterling silver prayer beads", "silver tasbih", "silver misbaha"]);

  const oltu = normalizeProductInput({ titleTr: "Erzurum'un Oltu taşı ile Turuncu Galalit Malzeme", categoryHint: "tesbih", origin: "made_by_seller" });
  assert.equal(detectProductSignals(oltu).material?.en, "oltu stone");
  assert.ok(ruleKeywordCandidates(oltu).includes("oltu stone prayer beads"));
});

test("Etsy gate blocks resale and requires partner, hallmark or vintage proof", () => {
  const designed = etsyEligibility(silverTesbih());
  assert.equal(designed.status, "allowed");
  assert.equal(designed.whoMade, "someone_else");
  assert.equal(designed.needsProductionPartner, true);

  const resale = etsyEligibility(normalizeProductInput({ titleTr: "Gümüş tesbih", origin: "commercial_resale", materialVerified: true }));
  assert.equal(resale.status, "blocked");
  assert.ok(resale.reasons.some((reason) => reason.includes("Etsy'de yayınlanmaz")));

  const vintage = etsyEligibility(normalizeProductInput({ titleTr: "Eski bakır cezve", origin: "vintage", yearMade: 1985 }));
  assert.equal(vintage.status, "allowed");
  assert.equal(vintage.whenMade, "1980s");

  const unverified = etsyEligibility(normalizeProductInput({ titleTr: "925 ayar gümüş tesbih", origin: "made_by_seller" }));
  assert.equal(unverified.status, "review");
  assert.ok(unverified.requiredEvidence.some((item) => item.includes("damga")));

  assert.equal(etsyEligibility(normalizeProductInput({ titleTr: "Tesbih", origin: "unknown" })).status, "review");
});

test("pricing converts TRY, adds Etsy Turkey fees and shipping, and compares with the Etsy median", () => {
  const aligned = computePricing({ priceTry: 5000, shippingTry: 1200, usdTryRate: 40, shopCurrency: "USD", medianUsd: 159 })!;
  assert.equal(aligned.targetNetUsd, 125);
  assert.equal(aligned.shippingUsd, 30);
  assert.equal(aligned.feePercent, 17.77);
  assert.equal(aligned.breakEvenUsd, 189.16);
  assert.equal(aligned.positioning, "aligned");
  assert.equal(aligned.recommendedUsd, 189.99);
  assert.equal(aligned.recommendedTry, 7600);
  assert.ok(aligned.netAtRecommendedTry >= 5000);

  const below = computePricing({ priceTry: 2000, shippingTry: 1200, usdTryRate: 40, shopCurrency: "USD", medianUsd: 159 })!;
  assert.equal(below.positioning, "below");
  assert.equal(below.recommendedUsd, 135.99);

  const above = computePricing({ priceTry: 8000, shippingTry: 1200, usdTryRate: 40, shopCurrency: "TRY", medianUsd: 159 })!;
  assert.equal(above.positioning, "above");
  assert.equal(above.feePercent, 15.27);
  assert.equal(computePricing({ priceTry: 5000 }), undefined);
});

test("plan picks the strongest real search phrase and builds a valid Etsy listing", () => {
  const product = silverTesbih();
  const candidates = ruleKeywordCandidates(product);
  const plan = buildProductPlan(product, candidates, [
    scan("sterling silver prayer beads", 35, 12_508, 158.82, ["prayer beads", "tasbih", "islamic gift", "muslim gift", "silver tasbih", "eid gift", "unrelated brand"]),
    scan("tasbih", 25, 13_328, 42.46, ["tasbih", "misbaha", "islamic gift for men", "prayer beads"]),
    scan("silver misbaha", 40, 20, 99, ["misbaha"])
  ], { usdTryRate: 40, shopCurrency: "USD" });

  assert.equal(plan.primaryKeyword, "sterling silver prayer beads");
  assert.ok(plan.title.startsWith("Sterling Silver Prayer Beads, Tasbih Misbaha"));
  assert.ok(plan.title.includes("45 g"));
  assert.equal(plan.checks.ok, true);
  assert.equal(plan.tags.length, 13);
  assert.ok(plan.tags.includes("prayer beads") && plan.tags.includes("islamic gift"));
  assert.ok(!plan.tags.includes("unrelated brand"));
  assert.equal(plan.pricing?.medianUsd, 158.82);
  assert.equal(plan.eligibility.status, "allowed");
  assert.match(plan.description, /production partner/);
  assert.match(plan.description, /45 g \(1\.59 oz\)/);
  assert.equal(plan.competitors[0].title, "sterling silver prayer beads example");
  assert.equal(plan.keywordScores.find((row) => row.keyword === "tasbih")?.score, 25);
});

test("USD/TRY rate is fetched once and cached", async () => {
  const kv = memoryKv();
  let calls = 0;
  const fetcher = (async () => { calls += 1; return Response.json({ rates: { TRY: 41.5 } }); }) as typeof fetch;
  assert.equal(await getUsdTryRate(kv.store, fetcher), 41.5);
  assert.equal(await getUsdTryRate(kv.store, fetcher), 41.5);
  assert.equal(calls, 1);
  assert.equal(await getUsdTryRate(kv.store, fetcher, 39), 39);
});

test("physical Etsy draft uses shipping, processing, production partner, taxonomy and photos", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "listings_w", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const requests: Array<{ path: string; body?: BodyInit | null }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, body: init?.body });
    if (url.hostname === "cdn.shopier.example") return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, currency_code: "USD" });
    if (url.pathname.endsWith("/shipping-profiles")) return Response.json({ results: [{ shipping_profile_id: 55, is_deleted: false }] });
    if (url.pathname.endsWith("/readiness-state-definitions")) return Response.json({ results: [{ readiness_state_id: 8, readiness_state: "made_to_order" }, { readiness_state_id: 9, readiness_state: "ready_to_ship" }] });
    if (url.pathname.endsWith("/production-partners")) return Response.json({ results: [{ production_partner_id: 31, partner_name: "Atölye" }] });
    if (url.pathname === "/v3/application/seller-taxonomy/nodes") return Response.json({ results: [{ id: 1, name: "Accessories", children: [{ id: 2, name: "Prayer Beads", children: [] }] }] });
    if (url.pathname === "/v3/application/shops/777/listings") return Response.json({ listing_id: 901 }, { status: 201 });
    if (url.pathname.endsWith("/images")) return Response.json({ listing_image_id: 1 }, { status: 201 });
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;

  const product = silverTesbih();
  const plan = buildProductPlan(product, ruleKeywordCandidates(product), [], { usdTryRate: 40, shopCurrency: "USD" });
  const listing = { title: plan.title, tags: plan.tags, description: plan.description, materials: plan.materials, priceUsd: 189.99 };
  const result = await createEtsyPhysicalDraft(env, kv.store, product, listing, fetcher);

  assert.equal(result.listingId, 901);
  assert.deepEqual(result.warnings, []);
  const form = requests.find((item) => item.path === "/v3/application/shops/777/listings")!.body as URLSearchParams;
  assert.equal(form.get("type"), "physical");
  assert.equal(form.get("who_made"), "someone_else");
  assert.equal(form.get("when_made"), "2020_2026");
  assert.equal(form.get("shipping_profile_id"), "55");
  assert.equal(form.get("readiness_state_id"), "9");
  assert.equal(form.get("production_partner_ids"), "31");
  assert.equal(form.get("taxonomy_id"), "2");
  assert.equal(form.get("price"), "189.99");
  assert.equal(form.get("item_weight"), "45");
  assert.ok(requests.some((item) => item.path === "/v3/application/shops/777/listings/901/images"));
  assert.equal(kv.values.get("etsy:physical:49555980"), "901");

  const again = await createEtsyPhysicalDraft(env, kv.store, product, listing, fetcher);
  assert.equal(again.alreadyCreated, true);

  const resale = normalizeProductInput({ titleTr: "Hazır alınmış tesbih", origin: "commercial_resale", materialVerified: true });
  await assert.rejects(createEtsyPhysicalDraft(env, kv.store, resale, listing, fetcher), /Etsy'de yayınlanmaz/);
});

test("product endpoints suggest phrases and build a plan from cached scans", async () => {
  const kv = memoryKv();
  const cached = scan("sterling silver prayer beads", 35, 12_508, 158.82, ["prayer beads", "tasbih"]);
  await kv.store.put("etsy:trend:sterling-silver-prayer-beads", JSON.stringify(cached));
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: kv.store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const product = { titleTr: "925 Ayar Gümüş Kafesli Tespih", origin: "designed_by_seller", materialVerified: true, priceTry: 5000, shippingTry: 1200, usdTryRate: 40 };

  const keywords = await handleRequest(new Request("https://gxl.example/api/products/etsy-keywords", { method: "POST", headers, body: JSON.stringify(product) }), env);
  assert.equal(keywords.status, 200);
  const keywordBody = await keywords.json() as { candidates: string[]; source: string };
  assert.equal(keywordBody.candidates[0], "sterling silver prayer beads");
  assert.equal(keywordBody.source, "rules");

  const planResponse = await handleRequest(new Request("https://gxl.example/api/products/etsy-plan", { method: "POST", headers, body: JSON.stringify({ product, keywords: keywordBody.candidates }) }), env);
  assert.equal(planResponse.status, 200);
  const { plan } = await planResponse.json() as { plan: { primaryKeyword: string; pricing: { usdTryRate: number; medianUsd: number }; eligibility: { status: string } } };
  assert.equal(plan.primaryKeyword, "sterling silver prayer beads");
  assert.equal(plan.pricing.usdTryRate, 40);
  assert.equal(plan.pricing.medianUsd, 158.82);
  assert.equal(plan.eligibility.status, "allowed");

  const draft = await handleRequest(new Request("https://gxl.example/api/products/etsy-draft", { method: "POST", headers, body: JSON.stringify({ product, listing: {} }) }), env);
  assert.equal(draft.status, 409);
});
