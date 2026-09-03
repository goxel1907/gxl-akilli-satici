import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createShopierProduct,
  createShopierWebhookSubscription,
  listShopierWebhookSubscriptions,
  ShopierIntegrationError,
  updateShopierProduct,
  validateShopierProductInput,
  verifyShopierWebhook
} from "../../worker/src/shopier.js";
import { handleRequest } from "../../worker/src/index.js";

const env = { SHOPIER_ACCESS_TOKEN: "test-token" };

test("Shopier product creation validates and sends the official payload", async () => {
  let captured: { url?: string; method?: string; body?: Record<string, unknown> } = {};
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    captured = {
      url: String(input),
      method: init?.method,
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    };
    return Response.json({
      id: "49555980",
      title: "GXL ürün",
      description: "Doğrulanmış açıklama",
      type: "physical",
      url: "https://www.shopier.com/49555980",
      media: [{ id: "m1", type: "image", url: "https://example.com/product.jpg", placement: 1 }],
      priceData: { currency: "TRY", price: "2500.00" },
      stockStatus: "inStock",
      stockQuantity: 1,
      shippingPayer: "sellerPays",
      dispatchDuration: 2
    });
  }) as typeof fetch;

  const product = await createShopierProduct(env, {
    title: "  GXL ürün  ",
    description: "Doğrulanmış açıklama",
    type: "physical",
    media: [{ type: "image", url: "https://example.com/product.jpg", placement: 1 }],
    priceData: { currency: "TRY", price: "2500" },
    stockQuantity: 1,
    shippingPayer: "sellerPays",
    dispatchDuration: 2
  }, fetcher);

  assert.equal(captured.url, "https://api.shopier.com/v1/products");
  assert.equal(captured.method, "POST");
  assert.equal(captured.body?.title, "GXL ürün");
  assert.deepEqual(captured.body?.priceData, { currency: "TRY", price: "2500.00" });
  assert.equal(product.id, "49555980");
  assert.equal(product.price, "2500.00");
});

test("Shopier product update sends only approved fields", async () => {
  let sentBody: Record<string, unknown> = {};
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return Response.json({ id: "p1", title: "Ürün", priceData: { currency: "TRY", price: "2750.00" }, stockQuantity: 0 });
  }) as typeof fetch;

  await updateShopierProduct(env, "p1", { stockQuantity: 0, priceData: { price: "2750" } }, fetcher);
  assert.deepEqual(sentBody, { stockQuantity: 0, priceData: { price: "2750.00" } });
});

test("Shopier rejects unsafe product media before calling the API", () => {
  assert.throws(() => validateShopierProductInput({
    title: "Ürün",
    type: "physical",
    media: [{ type: "image", url: "http://example.com/file.gif", placement: 1 }],
    priceData: { currency: "TRY", price: "10" },
    shippingPayer: "sellerPays"
  }, true), (error: unknown) => error instanceof ShopierIntegrationError && error.code === "VALIDATION_FAILED");
});

test("Shopier webhook verification accepts a current signed event", async () => {
  const raw = JSON.stringify({ id: "p1", title: "Ürün" });
  const token = "webhook-secret";
  const timestamp = 1_750_000_000;
  const signature = createHmac("sha256", token).update(raw).digest("base64");
  const headers = new Headers({
    "Shopier-Event": "product.updated",
    "Shopier-Webhook-Id": "hook-1",
    "Shopier-Timestamp": String(timestamp),
    "Shopier-Signature": signature
  });
  const result = await verifyShopierWebhook(raw, headers, token, timestamp * 1000);
  assert.deepEqual(result, { ok: true, event: "product.updated", webhookId: "hook-1", timestamp });
});

test("Shopier webhook verification rejects stale events", async () => {
  const raw = "{}";
  const token = "webhook-secret";
  const signature = createHmac("sha256", token).update(raw).digest("base64");
  const headers = new Headers({
    "Shopier-Event": "order.created",
    "Shopier-Webhook-Id": "hook-2",
    "Shopier-Timestamp": "1000",
    "Shopier-Signature": signature
  });
  const result = await verifyShopierWebhook(raw, headers, token, 2_000_000 * 1000);
  assert.equal(result.ok, false);
});

test("Shopier webhook subscriptions use the official endpoint and preserve the one-time token", async () => {
  const calls: Array<{ method: string; body?: Record<string, unknown> }> = [];
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: String(init?.method || "GET"), body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined });
    if ((init?.method || "GET") === "POST") {
      return Response.json({ id: "wh-1", event: "order.created", url: "https://gxl.example/webhooks/shopier", token: "one-time-token" });
    }
    return Response.json([{ id: "wh-1", event: "order.created", url: "https://gxl.example/webhooks/shopier" }]);
  }) as typeof fetch;

  const created = await createShopierWebhookSubscription(env, "order.created", "https://gxl.example/webhooks/shopier", fetcher);
  const listed = await listShopierWebhookSubscriptions(env, fetcher);
  assert.equal(created.token, "one-time-token");
  assert.deepEqual(calls[0], { method: "POST", body: { event: "order.created", url: "https://gxl.example/webhooks/shopier" } });
  assert.equal(listed[0]?.id, "wh-1");
  assert.equal(listed[0]?.token, undefined);
});

test("Shopier media upload stores a phone image and returns a public URL", async () => {
  let stored: { key?: string; bytes?: number; contentType?: string } = {};
  const response = await handleRequest(new Request("https://gxl.example/api/shopier/media", {
    method: "POST",
    headers: { authorization: "Bearer app-token", "content-type": "application/json" },
    body: JSON.stringify({ confirm: true, mimeType: "image/jpeg", imageBase64: Buffer.alloc(1_024, 7).toString("base64") })
  }), {
    APP_ACCESS_TOKEN: "app-token",
    PRODUCT_MEDIA: {
      get: async () => null,
      put: async (key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) => {
        stored = { key, bytes: value.byteLength, contentType: options?.httpMetadata?.contentType };
      }
    }
  });

  assert.equal(response.status, 201);
  const body = await response.json() as { url: string };
  assert.match(body.url, /^https:\/\/gxl\.example\/media\/shopier\/[a-f0-9-]+\.jpg$/);
  assert.equal(stored.bytes, 1_024);
  assert.equal(stored.contentType, "image/jpeg");
});

test("Shopier media upload falls back to the existing free KV binding", async () => {
  const values = new Map<string, string | ArrayBuffer>();
  const store = {
    get: async (key: string) => {
      const value = values.get(key);
      return (value ?? null) as string | null;
    },
    put: async (key: string, value: string) => { values.set(key, value); },
    delete: async (key: string) => { values.delete(key); }
  };
  const response = await handleRequest(new Request("https://gxl.example/api/shopier/media", {
    method: "POST",
    headers: { authorization: "Bearer app-token", "content-type": "application/json" },
    body: JSON.stringify({ confirm: true, mimeType: "image/png", imageBase64: Buffer.alloc(1_024, 9).toString("base64") })
  }), {
    APP_ACCESS_TOKEN: "app-token",
    ETSY_OAUTH: store
  });

  assert.equal(response.status, 201);
  const body = await response.json() as { url: string };
  const key = new URL(body.url).pathname.slice("/media/".length);
  assert.equal((values.get(key) as ArrayBuffer).byteLength, 1_024);

  const imageResponse = await handleRequest(new Request(body.url), { ETSY_OAUTH: store });
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  assert.equal((await imageResponse.arrayBuffer()).byteLength, 1_024);
});
