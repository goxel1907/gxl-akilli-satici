import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  createShopierProduct,
  ShopierIntegrationError,
  updateShopierProduct,
  validateShopierProductInput,
  verifyShopierWebhook
} from "../../worker/src/shopier.js";

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
