import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductPlan,
  createEtsyPhysicalDraft,
  detectProductSignals,
  etsyEligibility,
  fiberEnglish,
  findTaxonomyId,
  normalizeProductInput,
  ruleKeywordCandidates
} from "../../worker/src/product-studio.js";
import { sanitizePhotoAnalysis } from "../../worker/src/photo-listing.js";
import { handleRequest } from "../../worker/src/index.js";

// Fotoğraflar KV'de ArrayBuffer, tokenlar metin olarak durur; Worker ikisini de aynı depodan okur.
function memoryKv() {
  const values = new Map<string, string | ArrayBuffer>();
  const store = {
    async get(key: string, type?: string) {
      const value = values.get(key);
      if (value === undefined) return null;
      if (type === "arrayBuffer") return typeof value === "string" ? new TextEncoder().encode(value).buffer : value;
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    },
    async put(key: string, value: string | ArrayBuffer) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as unknown as { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void> } };
}

function jpeg(size = 2_048, seed = 1): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let index = 4; index < size; index += 1) bytes[index] = (index * seed) % 251;
  return bytes;
}

const crochetSweater = () => normalizeProductInput({
  titleTr: "Tığ işi krem oversize kazak",
  origin: "made_by_seller",
  productKind: "knitwear",
  fiber: "%100 pamuk",
  size: "m",
  chestCm: 52,
  lengthCm: 60,
  colors: ["Cream"],
  audience: "women",
  priceTry: 2500,
  shippingTry: 900,
  usdTryRate: 40,
  imageUrls: ["https://gxl.example/media/photo/11111111-2222-3333-4444-555555555555.jpg"]
});

test("a crocheted sweater photo becomes crochet sweater language with size, yarn and care", () => {
  const product = crochetSweater();
  assert.equal(product.size, "M");
  const signals = detectProductSignals(product);
  assert.equal(signals.isKnitwear, true);
  assert.equal(signals.craft, "crochet");
  assert.equal(signals.noun, "crochet sweater");
  assert.equal(signals.material?.en, "cotton");
  assert.deepEqual(signals.attributes, ["oversized"]);

  const candidates = ruleKeywordCandidates(product, signals);
  for (const phrase of ["crochet sweater", "handmade crochet sweater", "cotton crochet sweater", "oversized crochet sweater", "cream crochet sweater"]) {
    assert.ok(candidates.includes(phrase), phrase);
  }

  const plan = buildProductPlan(product, candidates, [], { usdTryRate: 40, shopCurrency: "USD", signals });
  assert.equal(plan.title, "Crochet Sweater, Cream Cotton Oversized Sweater for Women, Size M, Handmade in Türkiye, Gift for Her");
  assert.equal(plan.title.match(/handmade/gi)?.length, 1, "no word repeated just to fill the title");
  assert.ok(plan.tags.includes("gift for her"));
  assert.ok(plan.tags.includes("crochet sweater"));
  assert.ok(plan.tags.every((tag) => tag.length <= 20));
  assert.match(plan.description, /Size: M/);
  assert.match(plan.description, /Chest width, laid flat: 52 cm \(20\.5 in\)/);
  assert.match(plan.description, /Length: 60 cm \(23\.6 in\)/);
  assert.match(plan.description, /Yarn: 100% cotton/);
  assert.match(plan.description, /Crocheted by hand at GXL Market Studio in Türkiye/);
  assert.match(plan.description, /CARE\nHand wash in cool water/);
  assert.deepEqual(plan.materials, ["cotton", "yarn"]);
  assert.equal(plan.eligibility.status, "allowed");
  assert.equal(plan.eligibility.whoMade, "i_did");
  assert.ok(plan.pricing && plan.pricing.recommendedUsd > 0);
  assert.ok(!plan.warnings.some((warning) => warning.startsWith("Beden")));
});

test("vintage titles keep the era and size, and never call a 50-year-old item antique", () => {
  const tray = normalizeProductInput({ titleTr: "Vintage bakır tepsi", origin: "vintage", productKind: "vintage", yearMade: 1975, lengthCm: 40, widthCm: 30, conditionNote: "Light surface scratches consistent with age." });
  const candidates = ruleKeywordCandidates(tray);
  assert.ok(!candidates.some((phrase) => phrase.startsWith("antique")));
  const plan = buildProductPlan(tray, candidates, [], {});
  assert.equal(plan.title, "Vintage Copper Tray, Turkish Tray, 1970s, 40 x 30 cm");
  assert.match(plan.description, /Dimensions: 40 × 30 cm \(15\.7 × 11\.8 in\)/);
  assert.match(plan.description, /CONDITION\nLight surface scratches/);
  assert.equal(plan.eligibility.whenMade, "1970s");
  const scanned = buildProductPlan(tray, ["antique copper tray", ...candidates], [{
    keyword: "antique copper tray", group: "vintage", score: 90, verdict: "Yüksek fırsat", parts: { demand: 50, openness: 50, newcomer: 50, price: 50 },
    metrics: { activeListings: 900, favoritesPerMonth: 1, newcomerShare: 0.3, digitalShare: 0, medianPriceUsd: 60, sampleSize: 48 },
    reasons: [], topTags: [{ tag: "antique tray", count: 30 }, { tag: "copper serving tray", count: 20 }], examples: [], scannedAt: new Date().toISOString()
  }], {});
  assert.doesNotMatch(`${scanned.title} ${scanned.tags.join(" ")}`, /antique/i, "a 1975 tray is vintage, not antique, even if competitors say so");
  assert.ok(scanned.tags.includes("copper serving tray"));
  const old = normalizeProductInput({ titleTr: "Antika bakır tepsi", origin: "vintage", yearMade: 1890 });
  assert.ok(ruleKeywordCandidates(old).includes("antique tray"));
});

test("colour words are not precious-metal claims and unrelated words do not look like knitting", () => {
  const golden = normalizeProductInput({ titleTr: "Altın sarısı tığ işi hırka", origin: "made_by_seller" });
  const signals = detectProductSignals(golden);
  assert.equal(signals.noun, "crochet cardigan");
  assert.equal(signals.material, undefined);
  assert.equal(etsyEligibility(golden, signals).status, "allowed");

  const bottle = detectProductSignals(normalizeProductInput({ titleTr: "Vintage cam şişe", origin: "vintage", yearMade: 1970 }));
  assert.equal(bottle.isKnitwear, false);
  assert.equal(bottle.isVintage, true);

  const shawl = detectProductSignals(normalizeProductInput({ titleTr: "İpek şal", origin: "made_by_seller" }));
  assert.equal(shawl.isKnitwear, false, "a shawl is knitwear only when crochet or knitting is mentioned");
  assert.equal(detectProductSignals(normalizeProductInput({ titleTr: "El örgüsü yün şal", origin: "made_by_seller" })).noun, "hand knit shawl");
});

test("yarn content in Turkish is translated, unknown words stay out of the English listing", () => {
  assert.equal(fiberEnglish("%100 pamuk"), "100% cotton");
  assert.equal(fiberEnglish("%50 yün %50 akrilik"), "50% wool 50% acrylic");
  assert.equal(fiberEnglish("merino yün ve kaşmir"), "merino wool and cashmere");
  assert.equal(fiberEnglish("tiftik karışım"), undefined);
  const plan = buildProductPlan(normalizeProductInput({ titleTr: "Tığ işi bere", origin: "made_by_seller", fiber: "tiftik karışım" }), [], [], {});
  assert.ok(plan.warnings.some((warning) => warning.includes("İplik içeriği İngilizceye çevrilemedi")));
  assert.ok(plan.warnings.some((warning) => warning.startsWith("Beden")));
});

test("a family member who crochets is listed as a shop member, child items wait for safety details", () => {
  const member = normalizeProductInput({ titleTr: "Tığ işi kazak", origin: "made_by_seller", madeByShopMember: true });
  const eligibility = etsyEligibility(member);
  assert.equal(eligibility.whoMade, "collective");
  assert.match(eligibility.reasons[0], /Shop members/);
  assert.match(buildProductPlan(member, [], [], {}).description, /by a member of our shop/);

  const baby = normalizeProductInput({ titleTr: "Tığ işi bebek battaniyesi", origin: "made_by_seller", riskFlags: ["childrens_product", "not_a_flag"] });
  assert.deepEqual(baby.riskFlags, ["childrens_product"]);
  const babyEligibility = etsyEligibility(baby);
  assert.equal(babyEligibility.status, "review");
  assert.ok(babyEligibility.requiredEvidence.some((item) => item.includes("güvenlik")));
});

test("Etsy category for knitwear follows the audience and avoids children's branches", async () => {
  const kv = memoryKv();
  const nodes = { results: [{ id: 1, name: "Clothing", children: [
    { id: 2, name: "Boys' Clothing", children: [{ id: 10, name: "Sweaters", children: [] }] },
    { id: 3, name: "Women's Clothing", children: [{ id: 20, name: "Sweaters", children: [] }] },
    { id: 4, name: "Men's Clothing", children: [{ id: 30, name: "Sweaters", children: [] }] }
  ] }] };
  const fetcher = (async () => Response.json(nodes)) as typeof fetch;
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  assert.equal(await findTaxonomyId(env, kv.store, ["crochet sweater", "sweater"], fetcher, /\bwomen/), 20);
  assert.equal(await findTaxonomyId(env, kv.store, ["crochet sweater", "sweater"], fetcher, /\bmen/), 30);
  assert.notEqual(await findTaxonomyId(env, memoryKv().store, ["hand knit sweater", "sweater"], fetcher), 10);
});

test("photos are stored by the app itself and served for the listing, without Shopier", async () => {
  const kv = memoryKv();
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: kv.store };
  const upload = async (file: File, token = "app-token") => {
    const form = new FormData();
    form.set("image", file);
    return await handleRequest(new Request("https://gxl.example/api/products/photos", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form }), env);
  };
  assert.equal((await upload(new File([jpeg()], "a.jpg", { type: "image/jpeg" }), "wrong")).status, 401);
  const bytes = jpeg(4_096, 7);
  const response = await upload(new File([bytes], "kazak.jpg", { type: "image/jpeg" }));
  assert.equal(response.status, 201);
  const { url, key } = await response.json() as { url: string; key: string };
  assert.match(key, /^photo\/[a-f0-9-]{36}\.jpg$/);
  assert.equal(url, `https://gxl.example/media/${key}`);
  const served = await handleRequest(new Request(url), env);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), bytes);

  const text = await upload(new File([new Uint8Array(2_048).fill(65)], "notes.jpg", { type: "image/jpeg" }));
  assert.equal(text.status, 400);
  assert.match(((await text.json()) as { error: string }).error, /JPG veya PNG/);
});

test("photo analysis explains the missing Gemini key and cleans the model answer", async () => {
  const env = { APP_ACCESS_TOKEN: "app-token" };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const image = `data:image/jpeg;base64,${Buffer.from(jpeg()).toString("base64")}`;
  const missing = await handleRequest(new Request("https://gxl.example/api/products/photo-analyze", { method: "POST", headers, body: JSON.stringify({ imageDataUrls: [image] }) }), env);
  assert.equal(missing.status, 503);
  assert.match(((await missing.json()) as { error: string }).error, /GEMINI_API_KEY/);
  const tooMany = await handleRequest(new Request("https://gxl.example/api/products/photo-analyze", { method: "POST", headers, body: JSON.stringify({ imageDataUrls: [image, image, image, image] }) }), env);
  assert.equal(tooMany.status, 400);

  const answer = {
    productKind: "knitwear", nameTr: "Krem tığ işi kazak", productNounEn: "Crochet Sweater!", craft: "crochet", audience: "women",
    materialGuessTr: "", colors: ["Cream", "cream", "x"], attributesEn: ["oversized", "granny square", "Chunky!!"],
    conditionNotesEn: [], questionsTr: ["İplik içeriği nedir?", "Beden ve ölçüler?"], riskFlags: ["none", "branded_product", "made_up"], confidence: 1.7
  };
  const realFetch = globalThis.fetch;
  let sentImages = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ inlineData?: unknown }> }> };
    sentImages = body.contents[0].parts.filter((part) => part.inlineData).length;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  }) as typeof fetch;
  try {
    const response = await handleRequest(new Request("https://gxl.example/api/products/photo-analyze", { method: "POST", headers, body: JSON.stringify({ imageDataUrls: [image, image], kind: "knitwear" }) }), { ...env, GEMINI_API_KEY: "test-key" });
    assert.equal(response.status, 200);
    const { analysis } = await response.json() as { analysis: ReturnType<typeof sanitizePhotoAnalysis> };
    assert.equal(sentImages, 2);
    assert.equal(analysis.productNounEn, "crochet sweater");
    assert.deepEqual(analysis.colors, ["cream"]);
    assert.deepEqual(analysis.attributesEn, ["oversized", "granny square", "chunky"]);
    assert.deepEqual(analysis.riskFlags, ["branded_product"]);
    assert.equal(analysis.confidence, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the Etsy draft reads the app's own photos from storage instead of fetching its own URL", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "listings_w", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const forms: Record<string, URLSearchParams> = {};
  let imageUploads = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "gxl.example") throw new Error("the Worker must not fetch its own media URL");
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, currency_code: "USD" });
    if (url.pathname.endsWith("/shipping-profiles")) return Response.json({ results: [{ shipping_profile_id: 55 }] });
    if (url.pathname.endsWith("/readiness-state-definitions")) return Response.json({ results: [{ readiness_state_id: 9, readiness_state: "ready_to_ship" }] });
    if (url.pathname === "/v3/application/seller-taxonomy/nodes") return Response.json({ results: [{ id: 1, name: "Clothing", children: [{ id: 3, name: "Women's Clothing", children: [{ id: 20, name: "Sweaters", children: [] }] }] }] });
    if (url.pathname === "/v3/application/shops/777/listings") { forms.listing = init?.body as URLSearchParams; return Response.json({ listing_id: 902 }, { status: 201 }); }
    if (url.pathname.endsWith("/images")) { imageUploads += 1; return Response.json({ listing_image_id: imageUploads }, { status: 201 }); }
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;

  const product = normalizeProductInput({ ...crochetSweater(), sourceId: "photo-1760000000000", madeByShopMember: true });
  const plan = buildProductPlan(product, ruleKeywordCandidates(product), [], { usdTryRate: 40, shopCurrency: "USD" });
  const listing = { title: plan.title, tags: plan.tags, description: plan.description, materials: plan.materials, priceUsd: 89.99 };
  const result = await createEtsyPhysicalDraft(env, kv.store, product, listing, fetcher, async () => jpeg().buffer);
  assert.equal(result.listingId, 902);
  assert.deepEqual(result.warnings, []);
  assert.equal(imageUploads, 1);
  assert.equal(forms.listing.get("who_made"), "collective");
  assert.equal(forms.listing.get("taxonomy_id"), "20");
  assert.equal(forms.listing.get("materials"), "cotton,yarn");
  assert.equal(kv.values.get("etsy:physical:photo-1760000000000"), "902");
});

test("model output is clamped to safe, short values", () => {
  const clean = sanitizePhotoAnalysis({ productKind: "spaceship" as never, productNounEn: "Very Long Crochet Sweater Name", craft: "loom" as never, colors: Array(9).fill("blue"), questionsTr: Array(9).fill(0).map((_, index) => `Soru ${index}`) });
  assert.equal(clean.productKind, "other");
  assert.equal(clean.productNounEn, "very long crochet");
  assert.equal(clean.craft, "none");
  assert.deepEqual(clean.colors, ["blue"]);
  assert.equal(clean.questionsTr.length, 5);
});
