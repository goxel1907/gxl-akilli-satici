import assert from "node:assert/strict";
import test from "node:test";
import { getEtsyStatus } from "../../worker/src/etsy.js";
import { getTrendBoard, inferTrendGroup, scanTrend, scoreTrend, TREND_NICHES } from "../../worker/src/etsy-trends.js";
import { buildDigitalListing, buildPatternBrief, normalizeEtsyTitle, validateEtsyListingText } from "../../worker/src/pattern-studio.js";
import { createEtsyDigitalDraft, type DigitalStore } from "../../worker/src/digital-delivery.js";
import { handleRequest } from "../../worker/src/index.js";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const DAY = 24 * 60 * 60;

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
  return { values, store: store as unknown as DigitalStore & { get(key: string): Promise<string | null> } };
}

function listing(favorites: number, ageDays: number, cents: number, type = "download", tags = ["crochet doily", "doily pattern", "lace doily"]) {
  return {
    title: `Doily pattern ${favorites}`,
    url: `https://www.etsy.com/listing/${favorites}`,
    num_favorers: favorites,
    listing_type: type,
    tags,
    original_creation_timestamp: Math.round(NOW / 1000) - ageDays * DAY,
    price: { amount: cents, divisor: 100, currency_code: "USD" }
  };
}

test("trend score rewards demand, open competition and fresh winners", () => {
  const strong = scoreTrend("crochet doily pattern", {
    count: 4_000,
    results: [listing(300, 90, 650), listing(120, 60, 550), listing(80, 400, 700), listing(60, 30, 600)]
  }, NOW);
  const weak = scoreTrend("crochet blanket pattern", {
    count: 450_000,
    results: [listing(10, 900, 300, "physical"), listing(4, 1200, 250, "physical"), listing(2, 800, 200, "physical")]
  }, NOW);

  assert.ok(strong.score > weak.score);
  assert.equal(strong.verdict, "Yüksek fırsat");
  assert.equal(weak.verdict, "Zor / doygun");
  assert.equal(strong.metrics.newcomerShare, 0.75);
  assert.equal(strong.metrics.digitalShare, 1);
  assert.equal(strong.metrics.medianPriceUsd, 6.25);
  assert.deepEqual(strong.topTags[0], { tag: "crochet doily", count: 4 });
  assert.equal(strong.examples[0].favorites, 300);
  assert.ok(weak.reasons.some((reason) => reason.includes("dijital desen payı")));
});

test("physical tesbih and vintage niches use their own price scale and digital rules", () => {
  const silver = scoreTrend("sterling silver prayer beads", {
    count: 3_000,
    results: [listing(40, 60, 8_000, "physical"), listing(25, 90, 9_500, "physical"), listing(12, 200, 7_000, "physical")]
  }, NOW, "tesbih");
  assert.equal(silver.group, "tesbih");
  assert.equal(silver.metrics.medianPriceUsd, 80);
  assert.equal(silver.parts.price, 59);
  assert.ok(!silver.reasons.some((reason) => reason.includes("dijital")));

  const digitalHeavy = scoreTrend("vintage brooch", { count: 3_000, results: [listing(40, 60, 500), listing(25, 90, 400), listing(12, 200, 300, "physical")] }, NOW, "vintage");
  assert.ok(digitalHeavy.reasons.some((reason) => reason.includes("dijital ürün")));

  assert.equal(inferTrendGroup("crochet bag pattern"), "patterns");
  assert.equal(inferTrendGroup("antique silver ring"), "vintage");
  assert.equal(inferTrendGroup("misbaha gift"), "tesbih");
  assert.equal(inferTrendGroup("wooden bowl"), "other");
  assert.ok(TREND_NICHES.some((niche) => niche.group === "tesbih") && TREND_NICHES.some((niche) => niche.group === "vintage"));
});

test("trend scan uses the public Etsy search with the API key only and caches the result", async () => {
  const kv = memoryKv();
  let calls = 0;
  let requested = new URL("https://placeholder.test");
  let headers = new Headers();
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    requested = new URL(String(input));
    headers = new Headers(init?.headers);
    return Response.json({ count: 2_000, results: [listing(50, 40, 500)] });
  }) as typeof fetch;
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };

  const first = await scanTrend(env, { nicheId: "crochet-doily" }, kv.store, fetcher, NOW);
  const second = await scanTrend(env, { nicheId: "crochet-doily" }, kv.store, fetcher, NOW + 60_000);

  assert.equal(calls, 1);
  assert.equal(requested.pathname, "/v3/application/listings/active");
  assert.equal(requested.searchParams.get("keywords"), "crochet doily pattern");
  assert.equal(requested.searchParams.get("sort_on"), "score");
  assert.equal(requested.searchParams.get("limit"), "100");
  assert.equal(requested.searchParams.get("currency"), "USD");
  assert.equal(headers.get("x-api-key"), "key:secret");
  assert.equal(headers.get("authorization"), null);
  assert.equal(first.nicheId, "crochet-doily");
  assert.equal(second.cached, true);

  const board = await getTrendBoard(env, kv.store);
  assert.equal(board.niches.length, TREND_NICHES.length);
  assert.deepEqual(board.groups.map((group) => group.id), ["patterns", "tesbih", "vintage"]);
  assert.equal(board.niches[0].id, "crochet-doily");
});

test("pattern brief forces an original design and ties renders to the pattern spec", () => {
  const brief = buildPatternBrief({
    craft: "crochet",
    productType: "doily",
    referenceNotes: "8 green leaves, orange small flowers, white lace fans",
    referenceRepeatCount: 8,
    referenceColors: ["white", "green", "orange"],
    skillLevel: "intermediate",
    seed: "fixed"
  });
  const again = buildPatternBrief({ craft: "crochet", productType: "doily", referenceNotes: "8 green leaves, orange small flowers, white lace fans", seed: "fixed" });

  assert.equal(brief.name, again.name);
  assert.match(brief.name, / Doily$/);
  assert.ok(brief.originalityPlan[0].includes("8 yerine 10"));
  assert.match(brief.patternPrompt, /Use exactly 10 radial repeats/);
  assert.match(brief.patternPrompt, /does not reuse white, green, orange/);
  assert.match(brief.patternPrompt, /Design spec/);
  assert.match(brief.patternPrompt, /GXL Market Studio\. For personal use/);
  assert.match(brief.patternPrompt, /lie flat/);
  assert.match(brief.renderPrompt, /<DESIGN SPEC JSON>/);
  assert.equal(brief.photoPlan.length, 10);
});

test("digital listing follows Etsy title and tag rules and discloses AI and renders", () => {
  const draft = buildDigitalListing({
    name: "Juniper Crown Doily",
    craft: "crochet",
    productType: "doily",
    skillLevel: "intermediate",
    sizeNote: "16 in / 41 cm",
    yarnNote: "Size 10 cotton thread",
    keyword: "crochet doily pattern",
    trendTags: ["vintage doily", "lace doily pattern", "crochet table runner", "shop name brand"],
    pageCount: 24
  });

  assert.ok(draft.title.startsWith("Crochet Doily Pattern PDF, Juniper Crown Doily"));
  assert.ok(draft.title.length <= 140);
  assert.equal(draft.tags.length, 13);
  assert.ok(draft.tags.every((tag) => tag.length <= 20));
  assert.equal(new Set(draft.tags).size, 13);
  assert.ok(draft.tags.includes("vintage doily"));
  assert.ok(!draft.tags.includes("shop name brand"));
  assert.equal(draft.checks.ok, true);
  assert.match(draft.description, /digital renders/);
  assert.match(draft.description, /AI tools assisted/);
  assert.match(draft.description, /24-page PDF/);
  assert.ok(draft.warnings.some((warning) => warning.includes("test edilmedi")));
  assert.deepEqual(draft.materials, ["size 10 cotton thread", "crochet hook"]);

  const tested = buildDigitalListing({ name: "Juniper Crown Doily", craft: "crochet", productType: "doily", aiAssisted: false, photosAreRenders: false, testMade: true });
  assert.doesNotMatch(tested.description, /AI tools/);
  assert.doesNotMatch(tested.description, /digital renders/);
  assert.deepEqual(tested.warnings, []);
});

test("Etsy title normalizer removes invalid characters and repeated special symbols", () => {
  const title = normalizeEtsyTitle("Doily 100% Cotton: Lace & Fans & More 100% ✨ + Bonus + Extra");
  assert.equal(title, "Doily 100% Cotton: Lace & Fans  More 100 + Bonus  Extra".replace(/\s+/g, " "));
  const check = validateEtsyListingText({ title: "Bad ✨ title", tags: ["way too long tag for etsy rules"], materials: ["cotton, wool"] });
  assert.equal(check.ok, false);
  assert.equal(check.issues.length, 4);
});

test("pattern plan endpoint returns prompts and a listing draft", async () => {
  const response = await handleRequest(new Request("https://gxl.example/api/patterns/plan", {
    method: "POST",
    headers: { authorization: "Bearer app-token", "content-type": "application/json" },
    body: JSON.stringify({ craft: "knitting", productType: "ballet slippers", skillLevel: "beginner", sizeNote: "EU 36-41", keyword: "knit slippers pattern" })
  }), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(response.status, 200);
  const body = await response.json() as { brief: { name: string; patternPrompt: string }; listing: { title: string; tags: string[] } };
  assert.match(body.brief.name, /Ballet Slippers$/);
  assert.match(body.brief.patternPrompt, /grade at least 3 sizes/i);
  assert.ok(body.listing.title.startsWith("Knit Slippers Pattern PDF"));
  assert.equal(body.listing.tags.length, 13);

  const invalid = await handleRequest(new Request("https://gxl.example/api/patterns/plan", {
    method: "POST",
    headers: { authorization: "Bearer app-token", "content-type": "application/json" },
    body: JSON.stringify({ craft: "painting", productType: "doily" })
  }), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(invalid.status, 400);
});

function pdfFile(name = "Juniper Crown.pdf") {
  return new File([Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4_000, 32)])], name, { type: "application/pdf" });
}

function uploadForm(confirm = true, pdf: File = pdfFile()) {
  const form = new FormData();
  form.set("metadata", JSON.stringify({
    confirm,
    name: "Juniper Crown Doily",
    craft: "crochet",
    productType: "doily",
    prices: { usd: "6.50", try: "249" },
    flags: { aiAssisted: true, photosAreRenders: true, testMade: false },
    listing: { title: "Crochet Doily Pattern PDF, Juniper Crown Doily", description: "Digital PDF pattern.", tags: ["doily pattern", "crochet doily"], materials: ["cotton thread"] }
  }));
  form.set("pdf", pdf);
  form.append("images", new File([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2_000, 1)])], "render.png", { type: "image/png" }));
  return form;
}

test("digital products upload privately and protected links enforce limits", async () => {
  const kv = memoryKv();
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: kv.store };
  const post = (path: string, body: BodyInit, json = false) => handleRequest(new Request(`https://gxl.example${path}`, {
    method: "POST",
    headers: { authorization: "Bearer app-token", ...(json ? { "content-type": "application/json" } : {}) },
    body
  }), env);

  assert.equal((await post("/api/digital/products", uploadForm(false))).status, 409);
  const notPdf = await post("/api/digital/products", uploadForm(true, new File([Buffer.alloc(4_000, 65)], "fake.pdf", { type: "application/pdf" })));
  assert.equal(notPdf.status, 400);
  const unauthorized = await handleRequest(new Request("https://gxl.example/api/digital/products", { method: "POST", headers: { authorization: "Bearer wrong" }, body: uploadForm() }), env);
  assert.equal(unauthorized.status, 401);

  const created = await post("/api/digital/products", uploadForm());
  assert.equal(created.status, 201);
  const { product } = await created.json() as { product: { id: string; fileName: string; images: Array<{ url: string }> } };
  assert.equal(product.fileName, "Juniper-Crown.pdf");
  assert.equal((await handleRequest(new Request(product.images[0].url), env)).headers.get("content-type"), "image/png");

  const list = await handleRequest(new Request("https://gxl.example/api/digital/products", { headers: { authorization: "Bearer app-token" } }), env);
  assert.equal(((await list.json()) as { products: unknown[] }).products.length, 1);

  assert.equal((await post(`/api/digital/products/${product.id}/grants`, JSON.stringify({ orderRef: "SHP-1001" }), true)).status, 409);
  const grantResponse = await post(`/api/digital/products/${product.id}/grants`, JSON.stringify({ confirm: true, orderRef: "SHP-1001", maxDownloads: 2 }), true);
  assert.equal(grantResponse.status, 201);
  const { grant } = await grantResponse.json() as { grant: { id: string; url: string } };
  assert.match(grant.id, /^[A-Za-z0-9_-]{32}$/);

  const landing = await handleRequest(new Request(grant.url), env);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /SHP-1001/);

  for (let index = 0; index < 2; index += 1) {
    const download = await handleRequest(new Request(`${grant.url}/file`), env);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/pdf");
    assert.match(download.headers.get("content-disposition") || "", /Juniper-Crown\.pdf/);
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  }
  assert.equal((await handleRequest(new Request(`${grant.url}/file`), env)).status, 410);

  const second = await post(`/api/digital/products/${product.id}/grants`, JSON.stringify({ confirm: true, orderRef: "SHP-1002" }), true);
  const secondGrant = (await second.json() as { grant: { id: string; url: string } }).grant;
  assert.equal((await post(`/api/digital/grants/${secondGrant.id}/revoke`, JSON.stringify({ confirm: true }), true)).status, 200);
  assert.equal((await handleRequest(new Request(`${secondGrant.url}/file`), env)).status, 410);
  assert.equal((await handleRequest(new Request("https://gxl.example/d/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/file"), env)).status, 404);

  const detail = await handleRequest(new Request(`https://gxl.example/api/digital/products/${product.id}`, { headers: { authorization: "Bearer app-token" } }), env);
  const detailBody = await detail.json() as { grants: Array<{ downloads: number; revoked: boolean }> };
  assert.equal(detailBody.grants.length, 2);
  assert.equal(detailBody.grants.find((item) => item.revoked === false)?.downloads, 2);
});

test("Etsy digital draft creates a download listing and uploads images and the PDF", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", expiresAt: Date.now() + 3_600_000, scope: "listings_w", userId: "123" }));
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const created = await handleRequest(new Request("https://gxl.example/api/digital/products", {
    method: "POST",
    headers: { authorization: "Bearer app-token" },
    body: uploadForm()
  }), env);
  const { product } = await created.json() as { product: { id: string } };

  const requests: Array<{ path: string; method: string; body?: BodyInit | null; auth: string | null }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, method: init?.method || "GET", body: init?.body, auth: new Headers(init?.headers).get("authorization") });
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, shop_name: "GXLPatternStudio", currency_code: "USD" });
    if (url.pathname === "/v3/application/seller-taxonomy/nodes") {
      return Response.json({ results: [{ id: 1, name: "Craft Supplies & Tools", children: [{ id: 2, name: "Patterns & How To", children: [{ id: 3, name: "Crochet", children: [] }, { id: 4, name: "Knitting", children: [] }] }] }] });
    }
    if (url.pathname === "/v3/application/shops/777/listings") return Response.json({ listing_id: 555 }, { status: 201 });
    if (url.pathname.endsWith("/images")) return Response.json({ listing_image_id: 1 }, { status: 201 });
    if (url.pathname.endsWith("/files")) return Response.json({ listing_file_id: 9 }, { status: 201 });
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;

  const result = await createEtsyDigitalDraft(env, kv.store, product.id, async (key) => await kv.store.get(key, "arrayBuffer"), fetcher);

  assert.equal(result.listingId, 555);
  assert.equal(result.editUrl, "https://www.etsy.com/your/shops/me/listing-editor/edit/555");
  const draft = requests.find((item) => item.path === "/v3/application/shops/777/listings")!;
  const form = draft.body as URLSearchParams;
  assert.equal(form.get("type"), "download");
  assert.equal(form.get("taxonomy_id"), "3");
  assert.equal(form.get("price"), "6.50");
  assert.equal(form.get("who_made"), "i_did");
  assert.equal(form.get("tags"), "doily pattern,crochet doily");
  assert.equal(draft.auth, "Bearer 123.token");
  assert.equal(requests.find((item) => item.path === "/v3/application/seller-taxonomy/nodes")?.auth, null);
  const fileUpload = requests.find((item) => item.path.endsWith("/files"))!;
  assert.equal((fileUpload.body as FormData).get("name"), "Juniper-Crown.pdf");
  assert.ok(requests.some((item) => item.path === "/v3/application/shops/777/listings/555/images"));
  assert.equal(result.product.etsy?.fileUploaded, true);
  assert.equal(result.product.etsy?.imagesUploaded, 1);

  const again = await createEtsyDigitalDraft(env, kv.store, product.id, async () => null, fetcher);
  assert.equal(again.alreadyCreated, true);
});

test("Etsy status treats a missing shop as setup pending instead of an outage", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", expiresAt: Date.now() + 3_600_000, scope: "shops_r", userId: "123" }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: "User does not have a shop" }, { status: 404 })) as typeof fetch;
  try {
    const status = await getEtsyStatus({ ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store });
    assert.equal(status.authorized, true);
    assert.equal(status.shopReady, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
