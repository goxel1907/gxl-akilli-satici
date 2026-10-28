import assert from "node:assert/strict";
import test from "node:test";
import { createReturnPolicy, createShippingProfile, normalizeReturnPolicyInput, normalizeShippingProfileInput, shopReadiness } from "../../worker/src/etsy-setup.js";
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

async function connected(scope: string) {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope, userId: "123" }));
  return { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
}

function etsy(state: { shop?: Record<string, unknown>; profiles?: unknown[]; policies?: unknown[] }, posts: Array<{ path: string; body: URLSearchParams }> = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return state.shop ? Response.json(state.shop) : Response.json({ error: "no shop" }, { status: 404 });
    if (init?.method === "POST") {
      posts.push({ path: url.pathname, body: new URLSearchParams(String(init.body)) });
      return Response.json(url.pathname.endsWith("/shipping-profiles") ? { shipping_profile_id: 501 } : { return_policy_id: 601 });
    }
    if (url.pathname.endsWith("/shipping-profiles")) return Response.json({ results: state.profiles || [] });
    if (url.pathname.endsWith("/policies/return")) return Response.json({ results: state.policies || [] });
    return Response.json({ error: "unexpected" }, { status: 500 });
  }) as typeof fetch;
}

test("the readiness list shows what is done, what the app can do, and what only the seller can do", async () => {
  const notConnected = await shopReadiness({ ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: memoryKv().store }, etsy({}));
  assert.equal(notConnected.items[0].action, "connect");

  const oldScopes = await shopReadiness(await connected("shops_r listings_w"), etsy({}));
  assert.equal(oldScopes.items.find((item) => item.id === "permissions")?.action, "reauth");
  assert.equal(oldScopes.items.find((item) => item.id === "shop")?.state, "todo", "no shop yet");
  assert.equal(oldScopes.items.find((item) => item.id === "payments")?.state, "manual", "payments are the seller's own step");

  const env = await connected("shops_r shops_w listings_w transactions_r transactions_w");
  const fresh = await shopReadiness(env, etsy({ shop: { shop_id: 777, shop_name: "GXLMarketStudio", is_etsy_payments_onboarded: false, listing_active_count: 0 } }));
  const ids = Object.fromEntries(fresh.items.map((item) => [item.id, item]));
  assert.equal(ids.permissions.state, "done");
  assert.equal(ids.payments.state, "todo");
  assert.equal(ids.shipping.action, "create_shipping_profile");
  assert.equal(ids.returns.action, "create_return_policy");
  assert.equal(ids.storefront.action, "shop_settings");
  assert.equal(ids.listings.action, "sell");
  assert.equal(ids.branding.state, "manual");
  assert.equal(fresh.total, 8);
  assert.equal(fresh.done, 3);

  const ready = await shopReadiness(env, etsy({ shop: { shop_id: 777, shop_name: "GXLMarketStudio", title: "Handmade prayer beads", is_etsy_payments_onboarded: true, listing_active_count: 5 }, profiles: [{ shipping_profile_id: 55 }], policies: [{ return_policy_id: 66, accepts_returns: true, return_deadline: 30 }] }));
  assert.equal(ready.done, ready.total, "every checkable step is done");
});

test("the shipping profile is free US shipping from Türkiye and is never created twice", async () => {
  assert.deepEqual(normalizeShippingProfileInput({}), { minDeliveryDays: 7, maxDeliveryDays: 21, minProcessingDays: 1, maxProcessingDays: 3, postalCode: undefined });
  assert.deepEqual(normalizeShippingProfileInput({ minDeliveryDays: 30, maxDeliveryDays: 10, maxProcessingDays: 40 }), { minDeliveryDays: 30, maxDeliveryDays: 30, minProcessingDays: 1, maxProcessingDays: 10, postalCode: undefined });
  assert.throws(() => normalizeShippingProfileInput({ postalCode: "34-A" }), /5 rakam/);
  const env = await connected("shops_w");
  const posts: Array<{ path: string; body: URLSearchParams }> = [];
  const created = await createShippingProfile(env, normalizeShippingProfileInput({ postalCode: "34000" }), etsy({ shop: { shop_id: 777 } }, posts));
  assert.deepEqual(created, { shippingProfileId: 501, alreadyExisted: false });
  const body = posts[0].body;
  assert.equal(posts[0].path, "/v3/application/shops/777/shipping-profiles");
  assert.equal(body.get("origin_country_iso"), "TR");
  assert.equal(body.get("destination_country_iso"), "US");
  assert.equal(body.get("primary_cost"), "0");
  assert.equal(body.get("secondary_cost"), "0");
  assert.equal(body.get("min_delivery_days"), "7");
  assert.equal(body.get("max_delivery_days"), "21");
  assert.equal(body.get("origin_postal_code"), "34000");
  assert.equal(body.get("destination_region"), null, "country and region are mutually exclusive");
  const again = await createShippingProfile(env, normalizeShippingProfileInput({}), etsy({ shop: { shop_id: 777 }, profiles: [{ shipping_profile_id: 55 }] }, posts));
  assert.deepEqual(again, { shippingProfileId: 55, alreadyExisted: true });
  assert.equal(posts.length, 1);
});

test("the return policy uses Etsy's allowed deadlines and reuses a matching policy", async () => {
  assert.deepEqual(normalizeReturnPolicyInput({}), { acceptsReturns: true, deadlineDays: 30 });
  assert.deepEqual(normalizeReturnPolicyInput({ acceptsReturns: false }), { acceptsReturns: false, deadlineDays: undefined });
  assert.throws(() => normalizeReturnPolicyInput({ deadlineDays: 10 }), /7, 14, 21, 30, 45, 60, 90/);
  const env = await connected("shops_w");
  const posts: Array<{ path: string; body: URLSearchParams }> = [];
  const created = await createReturnPolicy(env, normalizeReturnPolicyInput({}), etsy({ shop: { shop_id: 777 } }, posts));
  assert.deepEqual(created, { returnPolicyId: 601, alreadyExisted: false });
  assert.equal(posts[0].path, "/v3/application/shops/777/policies/return");
  assert.equal(posts[0].body.get("accepts_returns"), "true");
  assert.equal(posts[0].body.get("accepts_exchanges"), "true");
  assert.equal(posts[0].body.get("return_deadline"), "30");
  const none = await createReturnPolicy(env, normalizeReturnPolicyInput({ acceptsReturns: false }), etsy({ shop: { shop_id: 777 } }, posts));
  assert.equal(posts[1].body.get("return_deadline"), null, "no deadline when returns are not accepted");
  assert.equal(none.alreadyExisted, false);
  const reused = await createReturnPolicy(env, normalizeReturnPolicyInput({}), etsy({ shop: { shop_id: 777 }, policies: [{ return_policy_id: 66, accepts_returns: true, return_deadline: 30 }] }, posts));
  assert.deepEqual(reused, { returnPolicyId: 66, alreadyExisted: true });
  assert.equal(posts.length, 2);
});

test("readiness routes need the app key", async () => {
  const response = await handleRequest(new Request("https://gxl.example/api/etsy/readiness"), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(response.status, 401);
  const bad = await handleRequest(new Request("https://gxl.example/api/etsy/return-policy", { method: "POST", headers: { authorization: "Bearer app-token", "content-type": "application/json" }, body: JSON.stringify({ deadlineDays: 3 }) }), { APP_ACCESS_TOKEN: "app-token" });
  assert.equal(bad.status, 400);
});
