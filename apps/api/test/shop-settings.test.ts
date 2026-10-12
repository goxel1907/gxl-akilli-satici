import assert from "node:assert/strict";
import test from "node:test";
import { applyShopSettings, DEFAULT_SHOP_SETTINGS, normalizeShopSettings, recommendAudience, SHOP_LIMITS, SHOP_PRESETS } from "../../worker/src/shop-settings.js";
import { handleRequest } from "../../worker/src/index.js";

function memoryKv() {
  const values = new Map<string, string>();
  return {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
}

async function envWithScope(scope: string) {
  const store = memoryKv();
  await store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", expiresAt: Date.now() + 3_600_000, scope, userId: "123" }));
  return { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store };
}

test("every audience preset respects Etsy limits and contains no protected names", () => {
  for (const [key, preset] of Object.entries(SHOP_PRESETS)) {
    assert.ok(preset.title.length <= SHOP_LIMITS.title, key);
    assert.ok(preset.sections.every((section) => section.length <= SHOP_LIMITS.sectionTitle), key);
    assert.deepEqual(normalizeShopSettings(preset as unknown as Record<string, unknown>).sections, preset.sections);
  }
  assert.equal(DEFAULT_SHOP_SETTINGS.title, SHOP_PRESETS.planners.title);
  assert.throws(() => normalizeShopSettings({ title: "x".repeat(56) }), /en fazla 55/);
  assert.throws(() => normalizeShopSettings({ sections: ["Disney Printables"] }), /disney/);
});

test("storefront update needs the shops_w permission and explicit confirmation", async () => {
  const oldEnv = await envWithScope("shops_r listings_w");
  await assert.rejects(() => applyShopSettings(oldEnv, { title: "Printable Planners" }), /bağlantısını yenileyin/);
  const status = await handleRequest(new Request("https://gxl.example/api/etsy/shop-settings", { headers: { authorization: "Bearer app-token" } }), oldEnv);
  assert.equal(((await status.json()) as { canWrite: boolean }).canWrite, false);
  const unconfirmed = await handleRequest(new Request("https://gxl.example/api/etsy/shop-settings", { method: "POST", headers: { authorization: "Bearer app-token", "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) }), oldEnv);
  assert.equal(unconfirmed.status, 409);
});

test("storefront update writes the shop texts and only creates missing sections", async () => {
  const env = await envWithScope("shops_r shops_w listings_r listings_w transactions_r");
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method || "GET", path: url.pathname, body: String(init?.body || "") });
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, shop_name: "GXLMarketStudio", currency_code: "USD" });
    if (url.pathname === "/v3/application/shops/777" && init?.method === "PUT") return Response.json({ shop_id: 777 });
    if (url.pathname === "/v3/application/shops/777/sections" && (init?.method || "GET") === "GET") return Response.json({ results: [{ title: "Vintage Finds" }] });
    if (url.pathname === "/v3/application/shops/777/sections") return Response.json({ shop_section_id: calls.length }, { status: 201 });
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;
  const result = await applyShopSettings(env, DEFAULT_SHOP_SETTINGS as unknown as Record<string, unknown>, fetcher);
  assert.deepEqual(result.updated, ["title", "announcement", "sale_message", "digital_sale_message"]);
  assert.deepEqual(result.sectionsExisting, []);
  assert.equal(result.sectionsCreated.length, DEFAULT_SHOP_SETTINGS.sections.length);
  const again = await applyShopSettings(env, { sections: ["Vintage Finds", "Printable Planners"] }, fetcher);
  assert.deepEqual(again.sectionsExisting, ["Vintage Finds"]);
  assert.deepEqual(again.sectionsCreated, ["Printable Planners"]);
  const put = calls.find((call) => call.method === "PUT")!;
  const form = new URLSearchParams(put.body);
  assert.equal(form.get("title"), DEFAULT_SHOP_SETTINGS.title);
  assert.ok(form.get("digital_sale_message")?.includes("Purchases"));
  assert.ok(!form.has("policy_additional"), "policy_additional is EU-only and must not be sent");
});

test("Etsy connection asks for the shop editing permission", async () => {
  const env = await envWithScope("shops_r");
  const response = await handleRequest(new Request("https://gxl.example/api/etsy/connect-session", { method: "POST", headers: { authorization: "Bearer app-token", "content-type": "application/json" }, body: "{}" }), env);
  const { authorizationUrl } = await response.json() as { authorizationUrl: string };
  assert.match(new URL(authorizationUrl).searchParams.get("scope") || "", /\bshops_w\b/);
});

test("the storefront preset follows what the shop actually sells", () => {
  assert.equal(recommendAudience([]).audience, "planners");
  assert.equal(recommendAudience([{ craft: "crochet" }, { craft: "knitting" }, { kind: "planner" }]).audience, "crafts");
  assert.equal(recommendAudience([{ kind: "planner" }, { kind: "coloring" }, { craft: "crochet" }]).audience, "planners");
  assert.ok(!/handmade/i.test(SHOP_PRESETS.faith.title + SHOP_PRESETS.vintage.title), "no handmade claim for bought-in or vintage items");
});
