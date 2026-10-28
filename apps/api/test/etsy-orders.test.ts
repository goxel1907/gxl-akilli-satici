import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addEtsyTracking, listEtsyOrders, listShippingCarriers, normalizeTrackingInput, summarizeReceipt } from "../../worker/src/etsy-orders.js";
import { assistBuyerMessage, detectRedFlags, normalizeMessageInput } from "../../worker/src/message-assist.js";
import { handleRequest } from "../../worker/src/index.js";
import type { TrendStore } from "../../worker/src/etsy-trends.js";

const NOW = Date.parse("2026-11-10T09:00:00Z");
const DAY = 86_400;

function memoryKv() {
  const values = new Map<string, string>();
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as TrendStore & { delete(key: string): Promise<void> } };
}

function receipt(id: number, shipInDays: number, extra: Record<string, unknown> = {}) {
  return {
    receipt_id: id,
    name: "Jane Doe",
    status: "paid",
    is_paid: true,
    is_shipped: false,
    created_timestamp: NOW / 1000 - 2 * DAY,
    country_iso: "US",
    formatted_address: "Jane Doe<br>12 Oak St<br>Austin, TX 78701<br>United States",
    grandtotal: { amount: 7450, divisor: 100, currency_code: "USD" },
    message_from_buyer: "",
    transactions: [{ title: "Sterling Silver Prayer Beads", quantity: 1, listing_id: 901, is_digital: false, expected_ship_date: NOW / 1000 + shipInDays * DAY, variations: [{ formatted_name: "Color", formatted_value: "Black" }] }],
    shipments: [],
    ...extra
  };
}

test("orders show the ship-by date in plain words, latest problems first", () => {
  assert.equal(summarizeReceipt(receipt(1, -1.5), NOW).urgency, "late");
  assert.equal(summarizeReceipt(receipt(1, -1.5), NOW).daysLeft, -2);
  assert.equal(summarizeReceipt(receipt(2, -0.2), NOW).urgency, "late", "a ship-by time a few hours ago is already late, not 'today'");
  assert.equal(summarizeReceipt(receipt(2, -0.2), NOW).daysLeft, -1);
  assert.equal(summarizeReceipt(receipt(2, 0.3), NOW).urgency, "today", "less than 24 hours left means ship today");
  assert.equal(summarizeReceipt(receipt(2, 1.5), NOW).daysLeft, 1);
  assert.equal(summarizeReceipt(receipt(2, 1.5), NOW).urgency, "soon");
  assert.equal(summarizeReceipt(receipt(3, 5), NOW).urgency, "ok");
  const shipped = summarizeReceipt(receipt(4, 3, { is_shipped: true, shipments: [{ carrier_name: "PTT", tracking_code: "RR123456789TR" }] }), NOW);
  assert.equal(shipped.urgency, "done");
  assert.deepEqual(shipped.tracking, [{ carrier: "PTT", code: "RR123456789TR" }]);
  const digital = summarizeReceipt(receipt(5, 1, { transactions: [{ title: "Budget Planner", quantity: 1, is_digital: true }] }), NOW);
  assert.equal(digital.urgency, "digital");
  assert.equal(digital.address, undefined, "digital orders need no shipping address");
  const order = summarizeReceipt(receipt(6, 2), NOW);
  assert.equal(order.address, "Jane Doe\n12 Oak St\nAustin, TX 78701\nUnited States");
  assert.equal(order.totalText, "74.50 USD");
  assert.deepEqual(order.items[0].variations, ["Color: Black"]);
});

test("the orders list reads paid Etsy receipts and says whether tracking can be sent from the app", async () => {
  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "shops_r transactions_r", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const queries: URLSearchParams[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777, shop_name: "GXLMarketStudio" });
    if (url.pathname === "/v3/application/shops/777/receipts") {
      queries.push(url.searchParams);
      return Response.json({ results: url.searchParams.get("was_shipped") === "false" ? [receipt(10, 4), receipt(11, -1), receipt(12, 1.5)] : [receipt(10, 4)] });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  const result = await listEtsyOrders(env, fetcher, NOW);
  assert.equal(queries.length, 2, "all unshipped orders plus the latest shipped ones");
  for (const query of queries) {
    assert.equal(query.get("was_paid"), "true");
    assert.equal(query.get("was_canceled"), "false");
  }
  const unshipped = queries.find((query) => query.get("was_shipped") === "false");
  assert.equal(unshipped?.get("limit"), "100");
  assert.equal(unshipped?.get("sort_order"), "asc", "the oldest (most overdue) unshipped orders are read first");
  assert.deepEqual(result.orders.map((order) => order.receiptId), [11, 12, 10], "late first, then the closest deadline");
  assert.deepEqual(result.counts, { toShip: 3, late: 1 });
  assert.equal(result.canAddTracking, false, "an old connection without transactions_w must be renewed");
});

test("tracking is sent to Etsy only with permission and a real tracking number", async () => {
  assert.throws(() => normalizeTrackingInput({ receiptId: 5, trackingCode: "12", carrierName: "PTT" }), /6–40/);
  assert.throws(() => normalizeTrackingInput({ receiptId: 5, trackingCode: "RR123456789TR", carrierName: "" }), /Kargo firmasını/);
  const input = normalizeTrackingInput({ receiptId: 5, trackingCode: "rr 1234 5678 9tr", carrierName: "PTT", noteToBuyer: "On its way <b>!" });
  assert.equal(input.trackingCode, "RR123456789TR");
  assert.equal(input.noteToBuyer, "On its way b!");

  const kv = memoryKv();
  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "transactions_r", userId: "123" }));
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  await assert.rejects(() => addEtsyTracking(env, input, (async () => Response.json({})) as typeof fetch, NOW), /iznini bir kez yenileyin/);

  await kv.store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "r", expiresAt: Date.now() + 3_600_000, scope: "transactions_r transactions_w", userId: "123" }));
  let posted: { path: string; body: URLSearchParams } | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/v3/application/users/123/shops") return Response.json({ shop_id: 777 });
    posted = { path: url.pathname, body: new URLSearchParams(String(init?.body)) };
    return Response.json(receipt(5, 2, { is_shipped: true, shipments: [{ carrier_name: "PTT", tracking_code: "RR123456789TR" }] }));
  }) as typeof fetch;
  const order = await addEtsyTracking(env, input, fetcher, NOW);
  assert.equal(posted?.path, "/v3/application/shops/777/receipts/5/tracking");
  assert.equal(posted?.body.get("tracking_code"), "RR123456789TR");
  assert.equal(posted?.body.get("carrier_name"), "PTT");
  assert.equal(posted?.body.get("send_bcc"), "true");
  assert.equal(order.urgency, "done");
});

test("Etsy carriers for Türkiye are cached for a week", async () => {
  const kv = memoryKv();
  let calls = 0;
  const fetcher = (async (input: string | URL | Request) => {
    calls += 1;
    assert.equal(new URL(String(input)).searchParams.get("origin_country_iso"), "TR");
    return Response.json({ results: [{ name: "PTT" }, { name: "UPS" }, { name: "PTT" }] });
  }) as typeof fetch;
  const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };
  assert.deepEqual(await listShippingCarriers(env, kv.store, fetcher), ["PTT", "UPS"]);
  assert.deepEqual(await listShippingCarriers(env, kv.store, fetcher), ["PTT", "UPS"]);
  assert.equal(calls, 1);
});

test("buyer messages: scam and off-Etsy signs are flagged even without AI; AI adds the Turkish meaning and a reply", async () => {
  assert.equal(detectRedFlags("Hi, is this available in size L?").length, 0);
  const scam = "Please contact me on WhatsApp and I will pay with Zelle. Verify your account here: https://etsy-support.example";
  assert.equal(detectRedFlags(scam).length, 4);
  const offline = await assistBuyerMessage(normalizeMessageInput({ text: scam }), {});
  assert.equal(offline.aiUsed, false);
  assert.match(offline.noticeTr || "", /GEMINI_API_KEY/);
  assert.ok(offline.warningsTr.some((warning) => warning.includes("Etsy dışında ödeme")));
  assert.throws(() => normalizeMessageInput({ text: " " }), /yapıştırın/);

  const originalFetch = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    prompt = String(init?.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ translationTr: "Merhaba, L beden var mı?", intentTr: "L beden soruyor.", replyEn: "Hi! Size L is sold out, but M (chest 54 cm) is available. Thank you!", replyTr: "Merhaba! L kalmadı, M (göğüs 54 cm) var. Teşekkürler!", warningsTr: [] }) }] } }] });
  }) as typeof fetch;
  try {
    const result = await assistBuyerMessage(normalizeMessageInput({ text: "Hi, is this available in size L?", sellerNoteTr: "L yok, M var; göğüs 54 cm" }), { GEMINI_API_KEY: "test" });
    assert.equal(result.aiUsed, true);
    assert.equal(result.translationTr, "Merhaba, L beden var mı?");
    assert.match(result.replyEn, /Size L is sold out/);
    assert.match(prompt, /Never ask or agree to talk or pay outside Etsy/);
    assert.match(prompt, /L yok, M var/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("order and message routes need the app key; the Etsy connection asks for tracking permission", async () => {
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };
  const denied = await handleRequest(new Request("https://gxl.example/api/etsy/orders"), env);
  assert.equal(denied.status, 401);
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const message = await handleRequest(new Request("https://gxl.example/api/messages/assist", { method: "POST", headers, body: JSON.stringify({ text: "Can I pay with PayPal?" }) }), env);
  assert.equal(message.status, 200);
  assert.ok((await message.json() as { warningsTr: string[] }).warningsTr.length > 0);
  const etsySource = readFileSync(new URL("../../worker/src/etsy.ts", import.meta.url), "utf8");
  assert.match(etsySource, /"transactions_r", "transactions_w"\]/);
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  assert.match(app, /\{tab === "Siparişler" && <EtsyOrdersPanel online=\{online\} \/>\}/);
  assert.match(app, /<MessageHelperCard online=\{online\} \/>/);
});
