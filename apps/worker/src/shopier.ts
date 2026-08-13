// Deployment refresh: 2026-08-13 Shopier secret binding
export interface ShopierRuntimeEnv {
  SHOPIER_ACCESS_TOKEN?: string;
}

type Fetcher = typeof fetch;

type ShopierProduct = {
  id?: string;
  title?: string;
  url?: string;
  stockStatus?: string;
  stockQuantity?: number;
  priceData?: {
    currency?: string;
    price?: string;
    discountedPrice?: string;
  };
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

export class ShopierIntegrationError extends Error {
  readonly code: "NOT_CONFIGURED" | "AUTH_FAILED" | "RATE_LIMITED" | "UPSTREAM_FAILED";
  readonly status?: number;
  readonly endpoint?: string;

  constructor(
    code: "NOT_CONFIGURED" | "AUTH_FAILED" | "RATE_LIMITED" | "UPSTREAM_FAILED",
    status?: number,
    endpoint?: string
  ) {
    super(code);
    this.code = code;
    this.status = status;
    this.endpoint = endpoint;
  }
}

const API_BASE = "https://api.shopier.com/v1";

function isoWithoutMilliseconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "items", "result", "products", "orders"]) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

async function shopierGet<T>(env: ShopierRuntimeEnv, path: string, query: Record<string, string | number | undefined>, fetcher: Fetcher): Promise<T> {
  const token = env.SHOPIER_ACCESS_TOKEN?.trim().replace(/^Bearer\s+/i, "").replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!token) throw new ShopierIntegrationError("NOT_CONFIGURED");

  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetcher(url.toString(), {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" }
  });
  if (response.status === 401 || response.status === 403) throw new ShopierIntegrationError("AUTH_FAILED", response.status, path);
  if (response.status === 429) throw new ShopierIntegrationError("RATE_LIMITED", response.status, path);
  if (!response.ok) throw new ShopierIntegrationError("UPSTREAM_FAILED", response.status, path);
  return await response.json() as T;
}

export async function getShopierSnapshot(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  if (!env.SHOPIER_ACCESS_TOKEN?.trim()) {
    return { configured: false, connected: false, productCount: 0, recentOrderCount: 0 };
  }

  const dateEnd = isoWithoutMilliseconds(new Date());
  const dateStart = isoWithoutMilliseconds(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [productPayload, orderPayload] = await Promise.all([
    shopierGet<unknown>(env, "/products", { limit: 100, page: 1, sort: "dateDesc" }, fetcher),
    shopierGet<unknown>(env, "/orders", { dateStart, dateEnd, limit: 100, page: 1, sort: "dateDesc" }, fetcher)
  ]);
  const products = asArray<ShopierProduct>(productPayload);
  const orders = asArray<ShopierOrder>(orderPayload);
  return {
    configured: true,
    connected: true,
    productCount: products.length,
    recentOrderCount: orders.length,
    orderWindowDays: 30,
    checkedAt: new Date().toISOString()
  };
}

export async function listShopierProducts(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  const payload = await shopierGet<unknown>(env, "/products", { limit: 100, page: 1, sort: "dateDesc" }, fetcher);
  return asArray<ShopierProduct>(payload).map((product) => ({
    id: String(product.id || ""),
    title: String(product.title || "Ürün"),
    url: product.url ? String(product.url) : undefined,
    stockStatus: product.stockStatus ? String(product.stockStatus) : undefined,
    stockQuantity: typeof product.stockQuantity === "number" ? product.stockQuantity : undefined,
    price: product.priceData?.discountedPrice || product.priceData?.price,
    currency: product.priceData?.currency || "TRY"
  }));
}

export async function listRedactedShopierOrders(env: ShopierRuntimeEnv, fetcher: Fetcher = fetch) {
  const dateEnd = isoWithoutMilliseconds(new Date());
  const dateStart = isoWithoutMilliseconds(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const payload = await shopierGet<unknown>(env, "/orders", { dateStart, dateEnd, limit: 100, page: 1, sort: "dateDesc" }, fetcher);
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
