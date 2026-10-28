import { etsyConnection, etsyRequest, EtsyIntegrationError, getConnectedShop, mayUseScope, type EtsyRuntimeEnv } from "./etsy.js";
import type { TrendStore } from "./etsy-trends.js";

type Fetcher = typeof fetch;

// Etsy siparişleri (receipt): satıcıya Türkçe kart olarak gösterilir; en önemli bilgi son kargo tarihidir.
// Geç kargo yeni mağazanın puanını düşürür, bu yüzden "gecikti / bugün / kaç gün kaldı" öne çıkar.
// Takip numarası Etsy'ye yazılınca alıcıya Etsy'den bildirim gider (transactions_w izni gerekir).

export type OrderUrgency = "late" | "today" | "soon" | "ok" | "done" | "digital";

export interface EtsyOrder {
  receiptId: number;
  buyerName: string;
  status: string;
  shipped: boolean;
  digitalOnly: boolean;
  createdAt?: string;
  shipBy?: string;
  daysLeft?: number;
  urgency: OrderUrgency;
  items: Array<{ title: string; quantity: number; listingId?: number; variations: string[]; digital: boolean }>;
  totalText?: string;
  address?: string;
  countryIso?: string;
  buyerNote?: string;
  giftMessage?: string;
  isGift: boolean;
  tracking: Array<{ carrier: string; code: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CARRIER_CACHE_KEY = "etsy:carriers:TR";
const CARRIER_CACHE_SECONDS = 7 * 24 * 60 * 60;
const TRACKING_CODE = /^[A-Za-z0-9-]{6,40}$/;

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row => value && typeof value === "object" ? value as Row : {};
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.map(asRow) : [];
const text = (value: unknown, max = 400) => typeof value === "string" ? value.replace(/\s+\n/g, "\n").trim().slice(0, max) : "";
const epoch = (value: unknown) => typeof value === "number" && value > 0 ? value * 1000 : undefined;

function money(value: unknown): string | undefined {
  const row = asRow(value);
  const amount = Number(row.amount);
  const divisor = Number(row.divisor) || 100;
  if (!Number.isFinite(amount)) return undefined;
  return `${(amount / divisor).toFixed(2)} ${text(row.currency_code, 3) || "USD"}`;
}

// Etsy adres metnindeki HTML kırılımlarını düz satıra çevirir.
function plainAddress(value: unknown): string | undefined {
  const raw = text(value, 600).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"");
  return raw ? raw.split("\n").map((line) => line.trim()).filter(Boolean).join("\n") : undefined;
}

export function summarizeReceipt(raw: unknown, now = Date.now()): EtsyOrder {
  const receipt = asRow(raw);
  const transactions = asRows(receipt.transactions);
  const items = transactions.map((row) => ({
    title: text(row.title, 140) || "Ürün",
    quantity: Number(row.quantity) || 1,
    listingId: row.listing_id ? Number(row.listing_id) : undefined,
    variations: asRows(row.variations).map((item) => `${text(item.formatted_name, 40)}: ${text(item.formatted_value, 60)}`).filter((item) => item.length > 2),
    digital: row.is_digital === true
  }));
  const digitalOnly = items.length > 0 && items.every((item) => item.digital);
  const shipped = receipt.is_shipped === true;
  const shipDates = transactions.map((row) => epoch(row.expected_ship_date)).filter((value): value is number => value !== undefined);
  const shipByMs = shipDates.length ? Math.min(...shipDates) : undefined;
  // Geçmiş tarih her zaman "gecikti" (en az 1 gün); 24 saatten az kaldıysa "bugün"; sonra tam gün sayısı.
  const msLeft = shipByMs === undefined ? undefined : shipByMs - now;
  const daysLeft = msLeft === undefined ? undefined : msLeft < 0 ? -Math.max(1, Math.ceil(-msLeft / DAY_MS)) : Math.floor(msLeft / DAY_MS);
  const urgency: OrderUrgency = shipped ? "done"
    : digitalOnly ? "digital"
    : daysLeft === undefined ? "ok"
    : daysLeft < 0 ? "late"
    : daysLeft === 0 ? "today"
    : daysLeft <= 2 ? "soon"
    : "ok";
  const created = epoch(receipt.created_timestamp) ?? epoch(receipt.create_timestamp);
  return {
    receiptId: Number(receipt.receipt_id),
    buyerName: text(receipt.name, 80) || "Alıcı",
    status: text(receipt.status, 40),
    shipped,
    digitalOnly,
    createdAt: created ? new Date(created).toISOString() : undefined,
    shipBy: shipByMs ? new Date(shipByMs).toISOString() : undefined,
    daysLeft,
    urgency,
    items,
    totalText: money(receipt.grandtotal),
    address: digitalOnly ? undefined : plainAddress(receipt.formatted_address),
    countryIso: text(receipt.country_iso, 2) || undefined,
    buyerNote: text(receipt.message_from_buyer, 1000) || undefined,
    giftMessage: text(receipt.gift_message, 500) || undefined,
    isGift: receipt.is_gift === true,
    tracking: asRows(receipt.shipments).map((row) => ({ carrier: text(row.carrier_name, 40), code: text(row.tracking_code, 60) })).filter((row) => row.code)
  };
}

const URGENCY_ORDER: Record<OrderUrgency, number> = { late: 0, today: 1, soon: 2, ok: 3, digital: 4, done: 5 };

export async function listEtsyOrders(env: EtsyRuntimeEnv, fetcher: Fetcher = fetch, now = Date.now()) {
  const shop = await getConnectedShop(env, fetcher);
  // Gönderilmemiş siparişlerin hepsi (en eskisi en çok gecikmiş olandır) ve son gönderilen 10 sipariş.
  const receipts = (shipped: boolean, limit: number) => etsyRequest<{ results?: unknown[] }>(env, `/application/shops/${shop.shopId}/receipts`, {
    query: { was_paid: true, was_canceled: false, was_shipped: shipped, limit, sort_on: "created", sort_order: "desc" }
  }, fetcher);
  const [open, done] = await Promise.all([receipts(false, 100), receipts(true, 10)]);
  const seen = new Set<number>();
  const orders = [...(open.results || []), ...(done.results || [])].map((row) => summarizeReceipt(row, now))
    .filter((order) => order.receiptId > 0 && !seen.has(order.receiptId) && Boolean(seen.add(order.receiptId)))
    .sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
  const connection = await etsyConnection(env);
  return {
    shopName: shop.shopName,
    canAddTracking: mayUseScope(connection, "transactions_w"),
    counts: {
      toShip: orders.filter((order) => !order.shipped && !order.digitalOnly).length,
      late: orders.filter((order) => order.urgency === "late").length
    },
    orders
  };
}

export async function listShippingCarriers(env: EtsyRuntimeEnv, store?: TrendStore, fetcher: Fetcher = fetch): Promise<string[]> {
  const cached = await store?.get(CARRIER_CACHE_KEY).catch(() => null);
  if (cached) {
    try {
      const list = JSON.parse(cached);
      if (Array.isArray(list) && list.length) return list.map(String);
    } catch { /* yeniden alınır */ }
  }
  const payload = await etsyRequest<{ results?: unknown[] }>(env, "/application/shipping-carriers", { query: { origin_country_iso: "TR" }, authenticated: false }, fetcher);
  const names = [...new Set(asRows(payload.results).map((row) => text(row.name, 40)).filter(Boolean))].slice(0, 40);
  if (names.length && store) await store.put(CARRIER_CACHE_KEY, JSON.stringify(names), { expirationTtl: CARRIER_CACHE_SECONDS });
  return names;
}

export function normalizeTrackingInput(raw: Record<string, unknown>) {
  const receiptId = Number(raw.receiptId);
  const trackingCode = String(raw.trackingCode || "").replace(/\s+/g, "").toUpperCase();
  const carrierName = String(raw.carrierName || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const noteToBuyer = String(raw.noteToBuyer || "").replace(/[<>]/g, "").trim().slice(0, 500);
  if (!Number.isInteger(receiptId) || receiptId <= 0) throw new EtsyIntegrationError("VALIDATION_FAILED", "Sipariş seçilmedi.", 400);
  if (!TRACKING_CODE.test(trackingCode)) throw new EtsyIntegrationError("VALIDATION_FAILED", "Takip numarası 6–40 harf ve rakam olmalı; kargo fişindeki numarayı boşluksuz yazın.", 400);
  if (carrierName.length < 2) throw new EtsyIntegrationError("VALIDATION_FAILED", "Kargo firmasını seçin.", 400);
  return { receiptId, trackingCode, carrierName, noteToBuyer: noteToBuyer || undefined };
}

export async function addEtsyTracking(env: EtsyRuntimeEnv, input: ReturnType<typeof normalizeTrackingInput>, fetcher: Fetcher = fetch, now = Date.now()) {
  if (!mayUseScope(await etsyConnection(env), "transactions_w")) {
    throw new EtsyIntegrationError("AUTH_FAILED", "Takip numarasını Etsy'ye göndermek için Etsy iznini bir kez yenileyin (Siparişler ekranındaki 'Etsy iznini yenile').", 403);
  }
  const shop = await getConnectedShop(env, fetcher);
  const form = new URLSearchParams({ tracking_code: input.trackingCode, carrier_name: input.carrierName, send_bcc: "true" });
  if (input.noteToBuyer) form.set("note_to_buyer", input.noteToBuyer);
  const receipt = await etsyRequest(env, `/application/shops/${shop.shopId}/receipts/${input.receiptId}/tracking`, { method: "POST", form }, fetcher);
  return summarizeReceipt(receipt, now);
}
