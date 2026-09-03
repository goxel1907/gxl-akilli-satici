// Shopier REST API integration. Product writes are exposed only through
// confirmation-protected Worker routes; destructive delete is intentionally absent.
export interface ShopierRuntimeEnv {
  SHOPIER_ACCESS_TOKEN?: string;
  SHOPIER_WEBHOOK_TOKEN?: string;
  SHOPIER_WEBHOOK_SECRET?: string;
}

type Fetcher = typeof fetch;

export type ShopierCurrency = "TRY" | "USD" | "EUR";
export type ShopierProductType = "physical" | "digital";
export type ShopierShippingPayer = "sellerPays" | "buyerPays";

export interface ShopierMediaInput {
  type: "image";
  url: string;
  placement: number;
}

export interface ShopierProductInput {
  title: string;
  description?: string;
  type: ShopierProductType;
  media: ShopierMediaInput[];
  priceData: {
    currency: ShopierCurrency;
    price: string;
    discount?: boolean;
    discountedPrice?: string;
    shippingPrice?: string;
  };
  stockQuantity?: number;
  shippingPayer: ShopierShippingPayer;
  categories?: Array<{ categoryId: string }>;
  customListing?: boolean;
  customNote?: string;
  placementScore?: number;
  dispatchDuration?: number;
}

export type ShopierProductPatch = Partial<Omit<ShopierProductInput, "priceData">> & {
  priceData?: Partial<ShopierProductInput["priceData"]>;
};

type ShopierProduct = {
  id?: string;
  title?: string;
  description?: string;
  type?: ShopierProductType;
  dateCreated?: string;
  dateUpdated?: string;
  url?: string;
  media?: Array<{ id?: string; type?: string; url?: string; placement?: number }>;
  stockStatus?: string;
  stockQuantity?: number;
  shippingPayer?: ShopierShippingPayer;
  priceData?: {
    currency?: ShopierCurrency;
    price?: string;
    discount?: boolean;
    discountedPrice?: string;
    shippingPrice?: string;
  };
  categories?: Array<{ id?: string; title?: string }>;
  customListing?: boolean;
  customNote?: string;
  placementScore?: number;
  dispatchDuration?: number;
};

type ShopierOrder = {
  id?: string;
  status?: string;
  paymentStatus?: string;
  dateCreated?: string;
  currency?: string;
  totals?: { total?: string };
  lineItems?: Array<{ title?: string; quantity?: number }>;
};

export type ShopierWebhookEvent =
  | "product.created"
  | "product.updated"
  | "order.created"
  | "order.addressUpdated"
  | "order.fulfilled"
  | "refund.requested"
  | "refund.updated";

export interface ShopierWebhookSubscription {
  id: string;
  event: ShopierWebhookEvent;
  url: string;
  token?: string;
}

export class ShopierIntegrationError extends Error {
  readonly code: "NOT_CONFIGURED" | "AUTH_FAILED" | "RATE_LIMITED" | "VALIDATION_FAILED" | "UPSTREAM_FAILED";
  readonly status?: number;
  readonly endpoint?: string;
  readonly upstreamCode?: string;
  readonly upstreamMessage?: string;

  constructor(
    code: "NOT_CONFIGURED" | "AUTH_FAILED" | "RATE_LIMITED" | "VALIDATION_FAILED" | "UPSTREAM_FAILED",
    status?: number,
    endpoint?: string,
    upstreamCode?: string,
    upstreamMessage?: string
  ) {
    super(upstreamMessage || code);
    this.code = code;
    this.status = status;
    this.endpoint = endpoint;
    this.upstreamCode = upstreamCode;
    this.upstreamMessage = upstreamMessage;
  }
}

const API_BASE = "https://api.shopier.com/v1";
const WEBHOOK_EVENTS = new Set<ShopierWebhookEvent>([
  "product.created", "product.updated", "order.created", "order.addressUpdated",
  "order.fulfilled", "refund.requested", "refund.updated"
]);

function isoWithoutMilliseconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "items", "result", "products", "orders", "webhooks"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

function accessToken(env: ShopierRuntimeEnv): string {
  const token = env.SHOPIER_ACCESS_TOKEN?.trim().replace(/^Bearer\s+/i, "").replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!token) throw new ShopierIntegrationError("NOT_CONFIGURED", 503);
  return token;
}

async function shopierRequest<T>(
  env: ShopierRuntimeEnv,
  path: string,
  options: { method?: "GET" | "POST" | "PUT"; query?: Record<string, string | number | undefined>; body?: unknown } = {},
  fetcher: Fetcher = fetch
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetcher(url.toString(), {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${accessToken(env)}`,
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  if (!response.ok) {
    let upstreamCode: string | undefined;
    let upstreamMessage: string | undefined;
    try {
      const body = await response.json() as Record<string, unknown>;
      upstreamCode = typeof body.error === "string" ? body.error.slice(0, 80) : undefined;
      upstreamMessage = typeof body.message === "string" ? body.message.slice(0, 240) : undefined;
    } catch {
      // Shopier may return an empty/non-JSON error body.
    }
    if (response.status === 401 || response.status === 403) throw new ShopierIntegrationError("AUTH_FAILED", response.status, path, upstreamCode, upstreamMessage);
    if (response.status === 429) throw new ShopierIntegrationError("RATE_LIMITED", response.status, path, upstreamCode, upstreamMessage);
    throw new ShopierIntegrationError("UPSTREAM_FAILED", response.status, path, upstreamCode, upstreamMessage);
  }
  return await response.json() as T;
}

function decimal(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) < 0) {
    throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, field, `${field} sıfır veya pozitif, en fazla iki ondalıklı sayı olmalıdır.`);
  }
  return Number(normalized).toFixed(2);
}

function validateMedia(media: unknown, required: boolean): ShopierMediaInput[] | undefined {
  if (media === undefined && !required) return undefined;
  if (!Array.isArray(media) || media.length < 1 || media.length > 5) {
    throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "media", "Shopier ürünü için 1-5 herkese açık görsel bağlantısı gereklidir.");
  }
  const placements = new Set<number>();
  return media.map((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const url = String(row.url || "").trim();
    const placement = Number(row.placement ?? index + 1);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "media", "Görsel adresi geçerli bir HTTPS URL olmalıdır."); }
    if (parsed.protocol !== "https:" || !/\.(?:jpe?g|png|bmp)$/i.test(parsed.pathname)) {
      throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "media", "Görseller HTTPS ve jpg, jpeg, png veya bmp biçiminde olmalıdır.");
    }
    if (!Number.isInteger(placement) || placement < 1 || placement > 5 || placements.has(placement)) {
      throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "media", "Görsel sıraları 1-5 arasında ve benzersiz olmalıdır.");
    }
    placements.add(placement);
    return { type: "image", url, placement };
  });
}

function validateCommon(input: ShopierProductPatch, create: boolean): ShopierProductPatch {
  const result: ShopierProductPatch = {};
  if (input.title !== undefined || create) {
    const title = String(input.title || "").trim();
    if (!title) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "title", "Ürün adı gereklidir.");
    result.title = title;
  }
  if (input.description !== undefined) result.description = String(input.description).trim();
  if (input.type !== undefined || create) {
    const type = input.type || "physical";
    if (!(["physical", "digital"] as string[]).includes(type)) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "type", "Ürün tipi physical veya digital olmalıdır.");
    result.type = type;
  }
  const media = validateMedia(input.media, create);
  if (media) result.media = media;
  if (input.priceData !== undefined || create) {
    const value = input.priceData || {};
    const currency = (value.currency || "TRY") as ShopierCurrency;
    if (!(["TRY", "USD", "EUR"] as string[]).includes(currency)) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "currency", "Para birimi TRY, USD veya EUR olmalıdır.");
    const priceData: ShopierProductPatch["priceData"] = {};
    if (create || value.currency !== undefined) priceData.currency = currency;
    if (create || value.price !== undefined) priceData.price = decimal(value.price, "Fiyat");
    if (value.discount !== undefined) priceData.discount = Boolean(value.discount);
    if (value.discountedPrice !== undefined && String(value.discountedPrice).trim()) priceData.discountedPrice = decimal(value.discountedPrice, "İndirimli fiyat");
    if (value.shippingPrice !== undefined && String(value.shippingPrice).trim()) priceData.shippingPrice = decimal(value.shippingPrice, "Kargo fiyatı");
    result.priceData = priceData;
  }
  if (input.stockQuantity !== undefined) {
    const stock = Number(input.stockQuantity);
    if (!Number.isInteger(stock) || stock < 0) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "stockQuantity", "Stok sıfır veya pozitif tam sayı olmalıdır.");
    result.stockQuantity = stock;
  }
  if (input.shippingPayer !== undefined || create) {
    const shippingPayer = input.shippingPayer || "sellerPays";
    if (!(["sellerPays", "buyerPays"] as string[]).includes(shippingPayer)) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "shippingPayer", "Kargo ödeyeni sellerPays veya buyerPays olmalıdır.");
    result.shippingPayer = shippingPayer;
  }
  if (input.categories !== undefined) result.categories = input.categories.map((item) => ({ categoryId: String(item.categoryId || "").trim() })).filter((item) => item.categoryId);
  if (input.customListing !== undefined) result.customListing = Boolean(input.customListing);
  if (input.customNote !== undefined) result.customNote = String(input.customNote).trim();
  if (input.placementScore !== undefined) {
    const score = Number(input.placementScore);
    if (!Number.isInteger(score) || score < 1) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "placementScore", "Sıralama puanı en az 1 olmalıdır.");
    result.placementScore = score;
  }
  if (input.dispatchDuration !== undefined) {
    const days = Number(input.dispatchDuration);
    if (!Number.isInteger(days) || days < 1 || days > 3) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "dispatchDuration", "Kargoya verme süresi 1-3 gün olmalıdır.");
    result.dispatchDuration = days;
  }
  if (!create && !Object.keys(result).length) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "product", "Güncellenecek en az bir ürün alanı gereklidir.");
  return result;
}

export function validateShopierProductInput(input: ShopierProductPatch, create = false): ShopierProductPatch {
  return validateCommon(input, create);
}

function normalizeProduct(product: ShopierProduct) {
  return {
    id: String(product.id || ""),
    title: String(product.title || "Ürün"),
    description: String(product.description || ""),
    type: product.type || "physical",
    url: product.url ? String(product.url) : undefined,
    media: Array.isArray(product.media) ? product.media.map((item) => ({ id: item.id ? String(item.id) : undefined, type: item.type || "image", url: item.url ? String(item.url) : "", placement: Number(item.placement || 1) })) : [],
    stockStatus: product.stockStatus ? String(product.stockStatus) : undefined,
    stockQuantity: typeof product.stockQuantity === "number" ? product.stockQuantity : undefined,
    shippingPayer: product.shippingPayer,
    price: product.priceData?.discountedPrice || product.priceData?.price,
    basePrice: product.priceData?.price,
    discountedPrice: product.priceData?.discountedPrice,
    shippingPrice: product.priceData?.shippingPrice,
    currency: product.priceData?.currency || "TRY",
    categories: product.categories || [],
    customListing: Boolean(product.customListing),
    customNote: product.customNote || "",
    placementScore: product.placementScore,
    dispatchDuration: product.dispatchDuration,
    dateCreated: product.dateCreated,
    dateUpdated: product.dateUpdated
  };
}

export async function getShopierSnapshot(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  if (!env.SHOPIER_ACCESS_TOKEN?.trim()) {
    return { configured: false, connected: false, productCount: 0, recentOrderCount: 0 };
  }
  const dateEnd = isoWithoutMilliseconds(new Date());
  const dateStart = isoWithoutMilliseconds(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [productPayload, orderPayload] = await Promise.all([
    shopierRequest<unknown>(env, "/products", { query: { limit: 50, page: 1, sort: "dateDesc" } }, fetcher),
    shopierRequest<unknown>(env, "/orders", { query: { dateStart, dateEnd, limit: 50, page: 1, sort: "dateDesc" } }, fetcher)
  ]);
  const products = asArray<ShopierProduct>(productPayload);
  const orders = asArray<ShopierOrder>(orderPayload);
  return {
    configured: true,
    connected: true,
    productCount: products.length,
    recentOrderCount: orders.length,
    orderWindowDays: 30,
    webhookVerificationConfigured: Boolean(env.SHOPIER_WEBHOOK_TOKEN || env.SHOPIER_WEBHOOK_SECRET),
    checkedAt: new Date().toISOString()
  };
}

export async function listShopierProducts(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  const payload = await shopierRequest<unknown>(env, "/products", { query: { limit: 50, page: 1, sort: "dateDesc" } }, fetcher);
  return asArray<ShopierProduct>(payload).map(normalizeProduct);
}

export async function getShopierProduct(env: ShopierRuntimeEnv, id: string, fetcher: Fetcher = fetch) {
  if (!id.trim()) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "id", "Shopier ürün kimliği gereklidir.");
  return normalizeProduct(await shopierRequest<ShopierProduct>(env, `/products/${encodeURIComponent(id)}`, {}, fetcher));
}

export async function createShopierProduct(env: ShopierRuntimeEnv, input: ShopierProductInput, fetcher: Fetcher = fetch) {
  const body = validateCommon(input, true) as ShopierProductInput;
  return normalizeProduct(await shopierRequest<ShopierProduct>(env, "/products", { method: "POST", body }, fetcher));
}

export async function updateShopierProduct(env: ShopierRuntimeEnv, id: string, input: ShopierProductPatch, fetcher: Fetcher = fetch) {
  if (!id.trim()) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "id", "Shopier ürün kimliği gereklidir.");
  const body = validateCommon(input, false);
  return normalizeProduct(await shopierRequest<ShopierProduct>(env, `/products/${encodeURIComponent(id)}`, { method: "PUT", body }, fetcher));
}

export async function listRedactedShopierOrders(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  const dateEnd = isoWithoutMilliseconds(new Date());
  const dateStart = isoWithoutMilliseconds(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const payload = await shopierRequest<unknown>(env, "/orders", { query: { dateStart, dateEnd, limit: 50, page: 1, sort: "dateDesc" } }, fetcher);
  return asArray<ShopierOrder>(payload).map((order) => ({
    id: String(order.id || ""),
    status: order.status,
    paymentStatus: order.paymentStatus,
    dateCreated: order.dateCreated,
    total: order.totals?.total,
    currency: order.currency || "TRY",
    items: Array.isArray(order.lineItems) ? order.lineItems.map((item) => ({ title: item.title, quantity: item.quantity })) : []
  }));
}

function normalizeWebhook(value: Record<string, unknown>): ShopierWebhookSubscription {
  return {
    id: String(value.id || ""),
    event: String(value.event || "") as ShopierWebhookEvent,
    url: String(value.url || ""),
    token: value.token ? String(value.token) : undefined
  };
}

export async function listShopierWebhookSubscriptions(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  const payload = await shopierRequest<unknown>(env, "/webhooks", { query: { limit: 50, page: 1 } }, fetcher);
  return asArray<Record<string, unknown>>(payload).map(normalizeWebhook);
}

export async function createShopierWebhookSubscription(
  env: ShopierRuntimeEnv,
  event: ShopierWebhookEvent,
  url: string,
  fetcher: Fetcher = fetch
) {
  if (!WEBHOOK_EVENTS.has(event)) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "event", "Shopier webhook olay türü geçersiz.");
  let notificationUrl: URL;
  try { notificationUrl = new URL(url); } catch { throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "url", "Webhook adresi geçerli bir HTTPS URL olmalıdır."); }
  if (notificationUrl.protocol !== "https:") throw new ShopierIntegrationError("VALIDATION_FAILED", 400, undefined, "url", "Webhook adresi HTTPS olmalıdır.");
  const webhook = normalizeWebhook(await shopierRequest<Record<string, unknown>>(env, "/webhooks", { method: "POST", body: { event, url: notificationUrl.toString() } }, fetcher));
  if (!webhook.id || !webhook.token) throw new ShopierIntegrationError("UPSTREAM_FAILED", 502, "/webhooks", "missing_token", "Shopier webhook anahtarını ilk yanıtta döndürmedi.");
  return webhook;
}

function signatureCandidates(bytes: Uint8Array): string[] {
  const hex = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return [hex, base64, base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), `sha256=${hex}`];
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left.trim());
  const b = new TextEncoder().encode(right.trim());
  let different = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) different |= (a[index] || 0) ^ (b[index] || 0);
  return different === 0;
}

export async function verifyShopierWebhook(
  rawBody: string,
  headers: Headers,
  token: string | undefined,
  nowMs = Date.now()
): Promise<{ ok: true; event: ShopierWebhookEvent; webhookId: string; timestamp: number } | { ok: false; reason: string }> {
  if (!token?.trim()) return { ok: false, reason: "Shopier webhook doğrulama anahtarı yapılandırılmadı." };
  const event = headers.get("Shopier-Event") as ShopierWebhookEvent | null;
  const webhookId = headers.get("Shopier-Webhook-Id")?.trim() || "";
  const signature = headers.get("Shopier-Signature")?.trim() || "";
  const timestamp = Number(headers.get("Shopier-Timestamp"));
  if (!event || !WEBHOOK_EVENTS.has(event)) return { ok: false, reason: "Shopier olay türü geçersiz." };
  if (!webhookId || !signature || !Number.isFinite(timestamp)) return { ok: false, reason: "Shopier webhook başlıkları eksik." };
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > 10 * 60) return { ok: false, reason: "Shopier webhook zaman damgası güvenli aralığın dışında." };
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  if (!signatureCandidates(digest).some((candidate) => constantTimeTextEqual(candidate, signature))) return { ok: false, reason: "Shopier webhook imzası geçersiz." };
  return { ok: true, event, webhookId, timestamp };
}
