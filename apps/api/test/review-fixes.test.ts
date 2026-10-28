import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEtsyConnectSession, etsyConnection, getConnectedShop, handleEtsyCallback } from "../../worker/src/etsy.js";
import { listEtsyOrders } from "../../worker/src/etsy-orders.js";
import { shopReadiness } from "../../worker/src/etsy-setup.js";
import { turkishForPhrases } from "../../worker/src/phrase-tr.js";
import { handleRequest } from "../../worker/src/index.js";
import type { TrendStore } from "../../worker/src/etsy-trends.js";

function memoryKv() {
  const values = new Map<string, string>();
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as TrendStore & { delete(key: string): Promise<void> } };
}

// Etsy'nin token yanıtı izin listesini içermez; izinler boş kaydedilirse uygulama bağlı hesabı "bağlı değil" sanır.
test("granted Etsy permissions are kept on connect and on the hourly token refresh", async () => {
  const kv = memoryKv();
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const session = await createEtsyConnectSession(new Request("https://gxl.example/api/etsy/connect-session", { method: "POST" }), env);
  const state = new URL(session.authorizationUrl).searchParams.get("state")!;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ access_token: "123.first", refresh_token: "r1", token_type: "Bearer", expires_in: 3600 })) as typeof fetch;
  try {
    const callback = await handleEtsyCallback(new Request(`https://gxl.example/etsy/oauth/callback?state=${state}&code=abc`), env);
    assert.equal(callback.status, 200);
    const connected = await etsyConnection(env);
    assert.equal(connected.scopesKnown, true);
    assert.ok(connected.scopes.includes("transactions_w") && connected.scopes.includes("shops_w"));

    const saved = JSON.parse(kv.values.get("etsy:tokens")!);
    await kv.store.put("etsy:tokens", JSON.stringify({ ...saved, expiresAt: Date.now() - 1000 }));
    globalThis.fetch = (async () => Response.json({ access_token: "123.second", refresh_token: "r2", expires_in: 3600 })) as typeof fetch;
    await getConnectedShop(env, (async () => Response.json({ shop_id: 777 })) as typeof fetch);
    const refreshed = JSON.parse(kv.values.get("etsy:tokens")!);
    assert.equal(refreshed.accessToken, "123.second");
    assert.equal(refreshed.scope, saved.scope, "a refresh without scope keeps the saved permissions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an older connection without a saved permission list is treated as unknown: the app tries, and asks to renew once", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777 });
    if (url.pathname.endsWith("/receipts")) return Response.json({ results: [] });
    return Response.json({ results: [] });
  }) as typeof fetch;
  const readiness = await shopReadiness(env, fetcher);
  assert.equal(readiness.items.find((item) => item.id === "account")?.state, "done", "a connected account is never shown as not connected");
  assert.equal(readiness.items.find((item) => item.id === "permissions")?.action, "reauth");
  assert.equal((await listEtsyOrders(env, fetcher)).canAddTracking, true, "unknown permission: the app tries and Etsy decides");
});

test("a phrase the AI skips is not asked again on every screen open, and parallel writes keep both results", async () => {
  const kv = memoryKv();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [] }) }] } }] }); }) as typeof fetch;
  try {
    await turkishForPhrases(["dhikr counter beads"], { GEMINI_API_KEY: "test" }, kv.store);
    await turkishForPhrases(["dhikr counter beads"], { GEMINI_API_KEY: "test" }, kv.store);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
  await kv.store.put("tr:phrases:v1", JSON.stringify({ "other phrase": "başka" }));
  globalThis.fetch = (async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ en: "zikr beads", tr: "zikir tesbihi" }] }) }] } }] })) as typeof fetch;
  try {
    await turkishForPhrases(["zikr beads"], { GEMINI_API_KEY: "test" }, kv.store);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const cache = JSON.parse(kv.values.get("tr:phrases:v1")!);
  assert.equal(cache["other phrase"], "başka");
  assert.equal(cache["zikr beads"], "zikir tesbihi");
});

test("Etsy errors carry a machine-readable code so the app does not read Turkish text", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "transactions_r", userId: "123" }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ error: "no shop" }, { status: 404 })) as typeof fetch;
  try {
    const response = await handleRequest(new Request("https://gxl.example/api/etsy/orders", { headers: { authorization: "Bearer app-token" } }), { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "Etsy mağazası henüz açılmadı.", code: "NOT_CONNECTED" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("phone-side review fixes stay in place", () => {
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  assert.match(app, /code: body\.code \? String\(body\.code\) : undefined/);
  assert.match(app, /const noShop = code === "NOT_CONNECTED";/);
  assert.doesNotMatch(app, /mağazası henüz açılmadı\|hesabı henüz bağlanmadı/, "no regex on Turkish server text");
  assert.match(app, /<View style=\{route === "photo" \? undefined : styles\.hidden\}>\{route === "photo" && back\}<PhotoListingStudio/, "the sell wizard stays mounted, so leaving it never loses a listing");
  assert.match(app, /const fresh = await rescore\(\);\n    if \(fresh && fresh\.score < 50\)/, "the low-score warning uses a fresh score");
  assert.match(app, /if \(!updateCheckRunning\) updateCheckRunning = runUpdateCheck\(\)/, "one update download at a time");
});
