const ETSY_API_ROOT = "https://api.etsy.com/v3";
const ETSY_TOKEN_ENDPOINT = `${ETSY_API_ROOT}/public/oauth/token`;
const ETSY_AUTHORIZE_ENDPOINT = "https://www.etsy.com/oauth/connect";
const OAUTH_STATE_PREFIX = "etsy:oauth:";
const TOKEN_KEY = "etsy:tokens";
const OAUTH_SCOPES = ["shops_r", "listings_r", "listings_w", "transactions_r"];

type Fetcher = typeof fetch;

interface EtsyTokenStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface EtsyRuntimeEnv {
  ETSY_API_KEY?: string;
  ETSY_SHARED_SECRET?: string;
  ETSY_OAUTH?: EtsyTokenStore;
}

interface EtsyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  userId: string;
}

interface EtsyOAuthState {
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

interface EtsyTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export class EtsyIntegrationError extends Error {
  constructor(
    public code: "NOT_CONFIGURED" | "STORAGE_NOT_CONFIGURED" | "NOT_CONNECTED" | "AUTH_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | "VALIDATION_FAILED" | "UPSTREAM_FAILED",
    message: string,
    public status = 500
  ) {
    super(message);
    this.name = "EtsyIntegrationError";
  }
}

function requireConfiguration(env: EtsyRuntimeEnv) {
  if (!env.ETSY_API_KEY || !env.ETSY_SHARED_SECRET) {
    throw new EtsyIntegrationError("NOT_CONFIGURED", "Etsy API anahtarları yapılandırılmadı.", 503);
  }
  if (!env.ETSY_OAUTH) {
    throw new EtsyIntegrationError("STORAGE_NOT_CONFIGURED", "Etsy güvenli token deposu yapılandırılmadı.", 503);
  }
  return {
    apiKey: env.ETSY_API_KEY,
    sharedSecret: env.ETSY_SHARED_SECRET,
    store: env.ETSY_OAUTH
  };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function callbackUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/etsy/oauth/callback`;
}

function tokenFromResponse(value: EtsyTokenResponse): EtsyTokens {
  if (!value.access_token || !value.refresh_token) {
    throw new EtsyIntegrationError("AUTH_FAILED", value.error_description || "Etsy erişim anahtarı üretilemedi.", 401);
  }
  const userId = value.access_token.split(".")[0] || "";
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt: Date.now() + Math.max(60, Number(value.expires_in || 3600)) * 1000,
    scope: String(value.scope || ""),
    userId
  };
}

async function saveTokens(store: EtsyTokenStore, tokens: EtsyTokens): Promise<void> {
  await store.put(TOKEN_KEY, JSON.stringify(tokens));
}

async function loadTokens(store: EtsyTokenStore): Promise<EtsyTokens | null> {
  const raw = await store.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EtsyTokens;
  } catch {
    return null;
  }
}

async function exchangeToken(body: URLSearchParams): Promise<EtsyTokenResponse> {
  const response = await fetch(ETSY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({})) as EtsyTokenResponse;
  if (!response.ok) {
    throw new EtsyIntegrationError("AUTH_FAILED", payload.error_description || payload.error || "Etsy yetkilendirme isteği reddedildi.", response.status);
  }
  return payload;
}

async function validAccessToken(env: EtsyRuntimeEnv): Promise<{ token: string; userId: string }> {
  const { apiKey, store } = requireConfiguration(env);
  let tokens = await loadTokens(store);
  if (!tokens) throw new EtsyIntegrationError("NOT_CONNECTED", "Etsy hesabı henüz bağlanmadı.", 401);

  if (tokens.expiresAt <= Date.now() + 120_000) {
    const refreshed = tokenFromResponse(await exchangeToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: apiKey,
      refresh_token: tokens.refreshToken
    })));
    await saveTokens(store, refreshed);
    tokens = refreshed;
  }
  return { token: tokens.accessToken, userId: tokens.userId };
}

export interface EtsyRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  form?: URLSearchParams;
  multipart?: FormData;
  authenticated?: boolean;
}

function apiKeyHeader(env: EtsyRuntimeEnv): string {
  if (!env.ETSY_API_KEY || !env.ETSY_SHARED_SECRET) {
    throw new EtsyIntegrationError("NOT_CONFIGURED", "Etsy API anahtarları yapılandırılmadı.", 503);
  }
  return `${env.ETSY_API_KEY}:${env.ETSY_SHARED_SECRET}`;
}

export async function etsyRequest<T>(env: EtsyRuntimeEnv, path: string, options: EtsyRequestOptions = {}, fetcher: Fetcher = fetch): Promise<T> {
  const headers: Record<string, string> = { "x-api-key": apiKeyHeader(env), accept: "application/json" };
  if (options.authenticated !== false) {
    const { token } = await validAccessToken(env);
    headers.authorization = `Bearer ${token}`;
  }
  const url = new URL(`${ETSY_API_ROOT}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let body: BodyInit | undefined;
  if (options.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = options.form;
  } else if (options.multipart) {
    body = options.multipart;
  }
  const response = await fetcher(url.toString(), { method: options.method || "GET", headers, body });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 401 || response.status === 403) {
    throw new EtsyIntegrationError("AUTH_FAILED", "Etsy hesap yetkisi geçersiz veya süresi dolmuş.", response.status);
  }
  if (response.status === 404) throw new EtsyIntegrationError("NOT_FOUND", "Etsy kaydı bulunamadı.", 404);
  if (response.status === 429) throw new EtsyIntegrationError("RATE_LIMITED", "Etsy istek sınırına ulaşıldı. Biraz sonra tekrar deneyin.", 429);
  if (response.status === 400) {
    const detail = typeof payload.error === "string" ? payload.error.slice(0, 240) : "";
    throw new EtsyIntegrationError("VALIDATION_FAILED", detail ? `Etsy isteği reddetti: ${detail}` : "Etsy isteği reddetti.", 400);
  }
  if (!response.ok) {
    throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy geçici olarak yanıt vermedi.", response.status);
  }
  return payload as T;
}

function safeShopSummary(payload: unknown): { shopId?: number; shopName?: string; title?: string; currencyCode?: string } {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(root.results) ? root.results : [];
  const shop = rows[0] && typeof rows[0] === "object" ? rows[0] as Record<string, unknown> : root;
  return {
    shopId: shop.shop_id ? Number(shop.shop_id) : undefined,
    shopName: shop.shop_name ? String(shop.shop_name) : undefined,
    title: shop.title ? String(shop.title) : undefined,
    currencyCode: shop.currency_code ? String(shop.currency_code) : undefined
  };
}

export async function getConnectedShop(env: EtsyRuntimeEnv, fetcher: Fetcher = fetch): Promise<{ shopId: number; shopName?: string; currencyCode?: string }> {
  const { userId } = await validAccessToken(env);
  let shop: ReturnType<typeof safeShopSummary>;
  try {
    shop = safeShopSummary(await etsyRequest(env, `/application/users/${encodeURIComponent(userId)}/shops`, {}, fetcher));
  } catch (error) {
    if (error instanceof EtsyIntegrationError && error.code === "NOT_FOUND") shop = {};
    else throw error;
  }
  if (!shop.shopId) throw new EtsyIntegrationError("NOT_CONNECTED", "Etsy mağazası henüz açılmadı.", 409);
  return { shopId: shop.shopId, shopName: shop.shopName, currencyCode: shop.currencyCode };
}

export async function getEtsyStatus(env: EtsyRuntimeEnv) {
  const configured = Boolean(env.ETSY_API_KEY && env.ETSY_SHARED_SECRET);
  const storageConfigured = Boolean(env.ETSY_OAUTH);
  if (!configured || !storageConfigured) {
    return { configured, storageConfigured, connected: false };
  }

  const tokens = await loadTokens(env.ETSY_OAUTH!);
  if (!tokens) return { configured: true, storageConfigured: true, connected: false };

  try {
    let shop: ReturnType<typeof safeShopSummary>;
    try {
      shop = safeShopSummary(await etsyRequest(env, `/application/users/${encodeURIComponent(tokens.userId)}/shops`));
    } catch (error) {
      if (error instanceof EtsyIntegrationError && error.code === "NOT_FOUND") shop = {};
      else throw error;
    }
    if (!shop.shopId) {
      return {
        configured: true,
        storageConfigured: true,
        authorized: true,
        connected: false,
        shopReady: false,
        scope: tokens.scope,
        message: "Etsy hesap izni tamamlandı; mağaza kurulumu bekliyor."
      };
    }
    return {
      configured: true,
      storageConfigured: true,
      authorized: true,
      connected: true,
      shopReady: true,
      scope: tokens.scope,
      ...shop
    };
  } catch (error) {
    const code = error instanceof EtsyIntegrationError ? error.code : "UPSTREAM_FAILED";
    return {
      configured: true,
      storageConfigured: true,
      connected: false,
      error: code,
      message: error instanceof Error ? error.message : "Etsy bağlantısı doğrulanamadı."
    };
  }
}

export async function createEtsyConnectSession(request: Request, env: EtsyRuntimeEnv) {
  const { apiKey, store } = requireConfiguration(env);
  const state = randomToken(32);
  const verifier = randomToken(48);
  const redirectUri = callbackUrl(request);
  const challenge = await sha256Base64Url(verifier);
  const stateRecord: EtsyOAuthState = { verifier, redirectUri, createdAt: Date.now() };
  await store.put(`${OAUTH_STATE_PREFIX}${state}`, JSON.stringify(stateRecord), { expirationTtl: 600 });

  const url = new URL(ETSY_AUTHORIZE_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { authorizationUrl: url.toString(), redirectUri, scopes: OAUTH_SCOPES };
}

function callbackHtml(ok: boolean, message: string): Response {
  const color = ok ? "#1f6a52" : "#a83232";
  const title = ok ? "Etsy bağlantısı tamamlandı" : "Etsy bağlantısı tamamlanamadı";
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f7f2e8;font-family:system-ui,sans-serif;color:#17201d"><main style="max-width:620px;margin:60px auto;padding:28px"><section style="background:white;border-radius:22px;padding:28px;box-shadow:0 8px 30px #00000012"><h1 style="color:${color};font-size:28px">${title}</h1><p style="font-size:18px;line-height:1.6">${message}</p><p>GXL Akıllı Satıcı uygulamasına dönebilirsiniz.</p></section></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function handleEtsyCallback(request: Request, env: EtsyRuntimeEnv): Promise<Response> {
  const { apiKey, store } = requireConfiguration(env);
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (providerError) return callbackHtml(false, "Etsy izin işlemi iptal edildi veya reddedildi.");
  if (!state || !code) return callbackHtml(false, "Etsy dönüş bilgileri eksik.");

  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const rawState = await store.get(key);
  await store.delete(key);
  if (!rawState) return callbackHtml(false, "Bağlantı isteğinin süresi doldu. Uygulamadan yeniden deneyin.");

  let record: EtsyOAuthState;
  try {
    record = JSON.parse(rawState) as EtsyOAuthState;
  } catch {
    return callbackHtml(false, "Bağlantı doğrulaması geçersiz.");
  }
  if (Date.now() - record.createdAt > 10 * 60 * 1000) {
    return callbackHtml(false, "Bağlantı isteğinin süresi doldu. Uygulamadan yeniden deneyin.");
  }

  const tokens = tokenFromResponse(await exchangeToken(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: apiKey,
    redirect_uri: record.redirectUri,
    code,
    code_verifier: record.verifier
  })));
  await saveTokens(store, tokens);
  return callbackHtml(true, "Hesap yetkisi güvenli biçimde kaydedildi. Erişim anahtarı uygulamada veya GitHub'da tutulmadı.");
}
