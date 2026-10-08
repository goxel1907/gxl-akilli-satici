import { etsyRequest, type EtsyRuntimeEnv } from "./etsy.js";
import type { PatternCraft, PrintableKind } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";

// Pinterest otomatik pin: Etsy ilanı yayına girince ilanın kendi görseli, satış linki,
// başlığı, açıklaması ve anahtar kelimeleriyle pin oluşturulur. Pinler günlere yayılır.

type Fetcher = typeof fetch;

export interface PinterestStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PinterestRuntimeEnv extends EtsyRuntimeEnv {
  PINTEREST_APP_ID?: string;
  PINTEREST_APP_SECRET?: string;
  PINTEREST_API_BASE?: string;
}

export interface PinText { title: string; description: string; overlay?: string }

export interface PinJob {
  id: string;
  listingId: number;
  pinIndex: number;
  dueAt: string;
  status: "scheduled" | "waiting_listing" | "posted" | "failed";
  attempts: number;
  boardName: string;
  link?: string;
  pin?: PinText;
  aiAssisted?: boolean;
  listingTitle?: string;
  pinId?: string;
  pinUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface PinterestTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  refreshExpiresAt?: number;
  scope: string;
  username?: string;
}

interface EtsyListingImage { url_fullxfull?: string; url_570xN?: string; full_height?: number; full_width?: number }
interface EtsyListing { listing_id?: number; title?: string; description?: string; state?: string; tags?: string[]; images?: EtsyListingImage[] }

const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const SCOPES = ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"];
const TOKEN_KEY = "pinterest:tokens";
const STATE_PREFIX = "pinterest:oauth:";
const QUEUE_KEY = "pinterest:queue";
const BOARDS_KEY = "pinterest:boards";
const SETTINGS_KEY = "pinterest:settings";
const DAY_MS = 24 * 60 * 60 * 1000;
// Aynı ürünün pinleri aynı gün değil 0., 2. ve 5. günlerde atılır; art arda aynı link spam sayılabilir.
const PIN_SPACING_DAYS = [0, 2, 5];
const MAX_QUEUE = 300;
const LISTING_RECHECK_MS = 6 * 60 * 60 * 1000;
const MAX_LISTING_CHECKS = 60;

export class PinterestError extends Error {
  constructor(public code: "NOT_CONFIGURED" | "STORAGE_NOT_CONFIGURED" | "NOT_CONNECTED" | "AUTH_FAILED" | "VALIDATION_FAILED" | "RATE_LIMITED" | "UPSTREAM_FAILED" | "NOT_FOUND", message: string, public status = 500) {
    super(message);
    this.name = "PinterestError";
  }
}

const BOARD_NAMES: Record<PrintableKind, string> & Record<PatternCraft, string> = {
  planner: "Printable Planners & Trackers",
  digital_planner: "Digital Planners",
  coloring: "Printable Coloring Pages",
  wall_art: "Printable Wall Art",
  party: "Party Games & Printables",
  recipe: "Recipe Cards & Kitchen Printables",
  journal: "Journal Printables",
  kids: "Kids Activities & Worksheets",
  paper_craft: "Junk Journal & Digital Paper",
  crochet: "Crochet Patterns",
  knitting: "Knitting Patterns",
  embroidery: "Embroidery Patterns",
  cross_stitch: "Cross Stitch Patterns",
  sewing: "Sewing Patterns",
  macrame: "Macrame Patterns",
  punch_needle: "Punch Needle Patterns"
};

export function boardNameFor(input: { kind?: PrintableKind; craft?: PatternCraft; noun?: string }): string {
  if (input.kind) return BOARD_NAMES[input.kind];
  if (input.craft) return BOARD_NAMES[input.craft];
  if (input.noun && input.noun !== "item") return input.noun.split(/\s+/).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  return "GXL Market Studio";
}

function apiBase(env: PinterestRuntimeEnv): string {
  return (env.PINTEREST_API_BASE || "https://api.pinterest.com").replace(/\/+$/, "");
}

function requireStore(env: PinterestRuntimeEnv): PinterestStore {
  if (!env.ETSY_OAUTH) throw new PinterestError("STORAGE_NOT_CONFIGURED", "Güvenli KV deposu bağlı değil.", 503);
  return env.ETSY_OAUTH as unknown as PinterestStore;
}

function requireApp(env: PinterestRuntimeEnv): { appId: string; secret: string; store: PinterestStore } {
  if (!env.PINTEREST_APP_ID || !env.PINTEREST_APP_SECRET) throw new PinterestError("NOT_CONFIGURED", "Pinterest uygulama anahtarları (PINTEREST_APP_ID, PINTEREST_APP_SECRET) sunucuya eklenmedi.", 503);
  return { appId: env.PINTEREST_APP_ID, secret: env.PINTEREST_APP_SECRET, store: requireStore(env) };
}

async function readJson<T>(store: PinterestStore, key: string, fallback: T): Promise<T> {
  const raw = await store.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function randomToken(size = 24): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function basicAuth(appId: string, secret: string): string {
  return `Basic ${btoa(`${appId}:${secret}`)}`;
}

async function exchangeToken(env: PinterestRuntimeEnv, body: URLSearchParams, fetcher: Fetcher): Promise<PinterestTokens> {
  const { appId, secret } = requireApp(env);
  const response = await fetcher(`${apiBase(env)}/v5/oauth/token`, {
    method: "POST",
    headers: { authorization: basicAuth(appId, secret), "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new PinterestError("AUTH_FAILED", String(payload.message || payload.error_description || "Pinterest yetkilendirmesi reddedildi."), 401);
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
    refreshExpiresAt: payload.refresh_token_expires_in ? Date.now() + Number(payload.refresh_token_expires_in) * 1000 : undefined,
    scope: String(payload.scope || "")
  };
}

export async function createPinterestConnectSession(request: Request, env: PinterestRuntimeEnv) {
  const { appId, store } = requireApp(env);
  const state = randomToken(32);
  const redirectUri = `${new URL(request.url).origin}/pinterest/oauth/callback`;
  await store.put(`${STATE_PREFIX}${state}`, JSON.stringify({ redirectUri, createdAt: Date.now() }), { expirationTtl: 600 });
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  return { authorizationUrl: url.toString(), redirectUri, scopes: SCOPES };
}

function callbackHtml(ok: boolean, message: string): Response {
  const title = ok ? "Pinterest bağlantısı tamamlandı" : "Pinterest bağlantısı tamamlanamadı";
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f7f2e8;font-family:system-ui,sans-serif;color:#17201d"><main style="max-width:620px;margin:60px auto;padding:28px"><section style="background:white;border-radius:22px;padding:28px;box-shadow:0 8px 30px #00000012"><h1 style="color:${ok ? "#1f6a52" : "#a83232"};font-size:28px">${title}</h1><p style="font-size:18px;line-height:1.6">${message}</p><p>GXL Akıllı Satıcı uygulamasına dönebilirsiniz.</p></section></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function handlePinterestCallback(request: Request, env: PinterestRuntimeEnv, fetcher: Fetcher = fetch): Promise<Response> {
  const { store } = requireApp(env);
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (url.searchParams.get("error")) return callbackHtml(false, "Pinterest izni iptal edildi veya reddedildi.");
  if (!state || !code) return callbackHtml(false, "Pinterest dönüş bilgileri eksik.");
  const key = `${STATE_PREFIX}${state}`;
  const record = await readJson<{ redirectUri?: string; createdAt?: number }>(store, key, {});
  await store.delete(key);
  if (!record.redirectUri || Date.now() - Number(record.createdAt || 0) > 10 * 60 * 1000) return callbackHtml(false, "Bağlantı isteğinin süresi doldu. Uygulamadan yeniden deneyin.");
  const tokens = await exchangeToken(env, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: record.redirectUri }), fetcher);
  try {
    const account = await rawRequest<{ username?: string }>(env, tokens.accessToken, "/v5/user_account", {}, fetcher);
    tokens.username = account.username;
  } catch { /* kullanıcı adı alınamazsa bağlantı yine geçerlidir */ }
  await store.put(TOKEN_KEY, JSON.stringify(tokens));
  return callbackHtml(true, `Pinterest hesabı${tokens.username ? ` (@${tokens.username})` : ""} bağlandı. Erişim anahtarı yalnızca sunucudaki güvenli depoda tutulur.`);
}

async function validToken(env: PinterestRuntimeEnv, fetcher: Fetcher, force = false): Promise<string> {
  const store = requireStore(env);
  const tokens = await readJson<PinterestTokens | null>(store, TOKEN_KEY, null);
  if (!tokens) throw new PinterestError("NOT_CONNECTED", "Pinterest hesabı bağlı değil.", 409);
  if (!force && tokens.expiresAt - 5 * 60 * 1000 > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) throw new PinterestError("NOT_CONNECTED", "Pinterest bağlantısının süresi doldu; yeniden bağlayın.", 409);
  const refreshed = await exchangeToken(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }), fetcher);
  const next = { ...tokens, ...refreshed, refreshToken: refreshed.refreshToken || tokens.refreshToken, username: tokens.username };
  await store.put(TOKEN_KEY, JSON.stringify(next));
  return next.accessToken;
}

async function rawRequest<T>(env: PinterestRuntimeEnv, token: string, path: string, options: { method?: string; body?: unknown; query?: Record<string, string> }, fetcher: Fetcher): Promise<T> {
  const url = new URL(`${apiBase(env)}${path}`);
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value);
  const response = await fetcher(url.toString(), {
    method: options.method || "GET",
    headers: { authorization: `Bearer ${token}`, ...(options.body ? { "content-type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = String(payload.message || "Pinterest isteği başarısız.").slice(0, 300);
    if (response.status === 401) throw new PinterestError("AUTH_FAILED", message, 401);
    if (response.status === 429) throw new PinterestError("RATE_LIMITED", "Pinterest istek sınırı doldu; daha sonra tekrar denenecek.", 429);
    if (response.status === 404) throw new PinterestError("NOT_FOUND", message, 404);
    throw new PinterestError(response.status === 400 ? "VALIDATION_FAILED" : "UPSTREAM_FAILED", message, response.status >= 500 ? 502 : response.status);
  }
  return payload as T;
}

async function pinterestRequest<T>(env: PinterestRuntimeEnv, path: string, options: { method?: string; body?: unknown; query?: Record<string, string> }, fetcher: Fetcher): Promise<T> {
  try {
    return await rawRequest<T>(env, await validToken(env, fetcher), path, options, fetcher);
  } catch (error) {
    if (error instanceof PinterestError && error.code === "AUTH_FAILED") return await rawRequest<T>(env, await validToken(env, fetcher, true), path, options, fetcher);
    throw error;
  }
}

export async function readPinterestSettings(store: PinterestStore | undefined): Promise<{ auto: boolean }> {
  if (!store) return { auto: true };
  const settings = await readJson<{ auto?: boolean }>(store, SETTINGS_KEY, {});
  return { auto: settings.auto !== false };
}

export async function writePinterestSettings(store: PinterestStore, input: { auto?: unknown }) {
  const settings = { auto: input.auto !== false };
  await store.put(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export async function listPinJobs(store: PinterestStore | undefined): Promise<PinJob[]> {
  if (!store) return [];
  return await readJson<PinJob[]>(store, QUEUE_KEY, []);
}

async function saveJobs(store: PinterestStore, jobs: PinJob[]) {
  await store.put(QUEUE_KEY, JSON.stringify(jobs.slice(-MAX_QUEUE)));
}

function cleanPinText(pin: unknown): PinText | undefined {
  if (!pin || typeof pin !== "object") return undefined;
  const row = pin as Record<string, unknown>;
  const title = String(row.title || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const description = String(row.description || "").replace(/\s+/g, " ").trim().slice(0, 700);
  if (!title || !description || isIpRisky(`${title} ${description}`)) return undefined;
  return { title, description, overlay: row.overlay ? String(row.overlay).slice(0, 60) : undefined };
}

export function parseListingId(value: unknown): number | undefined {
  const text = String(value ?? "").trim();
  const match = text.match(/etsy\.com\/(?:[a-z-]+\/)?listing\/(\d+)/i) || text.match(/^(\d{6,})$/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export async function enqueueListingPins(store: PinterestStore, input: { listingId: number; boardName: string; pins?: unknown[]; link?: string; aiAssisted?: boolean; listingTitle?: string }, now = Date.now()): Promise<PinJob[]> {
  const jobs = await listPinJobs(store);
  if (jobs.some((job) => job.listingId === input.listingId && job.status !== "failed")) return [];
  const texts = (input.pins || []).map(cleanPinText).filter((pin): pin is PinText => Boolean(pin));
  const link = input.link && /^https:\/\//.test(input.link) ? input.link.slice(0, 2048) : undefined;
  const created: PinJob[] = PIN_SPACING_DAYS.map((days, index) => ({
    id: randomToken(12),
    listingId: input.listingId,
    pinIndex: index,
    dueAt: new Date(now + days * DAY_MS).toISOString(),
    status: "scheduled",
    attempts: 0,
    boardName: input.boardName.slice(0, 50),
    ...(link ? { link } : {}),
    ...(texts[index] ? { pin: texts[index] } : {}),
    ...(input.aiAssisted ? { aiAssisted: true } : {}),
    ...(input.listingTitle ? { listingTitle: input.listingTitle.slice(0, 140) } : {}),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  }));
  await saveJobs(store, [...jobs, ...created]);
  return created;
}

// Taslak oluşturma akışını asla bozmaz: hata olursa yalnızca kaydedilir.
export async function autoEnqueuePins(store: PinterestStore | undefined, input: Parameters<typeof enqueueListingPins>[1]): Promise<number> {
  if (!store) return 0;
  try {
    if (!(await readPinterestSettings(store)).auto) return 0;
    return (await enqueueListingPins(store, input)).length;
  } catch (error) {
    console.error("Pinterest queue failed", error instanceof Error ? error.message : error);
    return 0;
  }
}

async function ensureBoard(env: PinterestRuntimeEnv, store: PinterestStore, name: string, fetcher: Fetcher): Promise<string> {
  const boards = await readJson<Record<string, string>>(store, BOARDS_KEY, {});
  const key = name.toLowerCase();
  if (boards[key]) return boards[key];
  const list = await pinterestRequest<{ items?: Array<{ id?: string; name?: string }> }>(env, "/v5/boards", { query: { page_size: "100" } }, fetcher);
  let id = (list.items || []).find((board) => String(board.name || "").toLowerCase() === key)?.id;
  if (!id) {
    const created = await pinterestRequest<{ id?: string }>(env, "/v5/boards", { method: "POST", body: { name, description: `${name} by GXL Market Studio. Original designs, instant digital downloads and handmade finds.`, privacy: "PUBLIC" } }, fetcher);
    id = created.id;
  }
  if (!id) throw new PinterestError("UPSTREAM_FAILED", "Pinterest panosu oluşturulamadı.", 502);
  boards[key] = id;
  await store.put(BOARDS_KEY, JSON.stringify(boards));
  return id;
}

function shortenTitle(title: string): string {
  let result = "";
  for (const part of title.split(/\s*,\s*/)) {
    const next = result ? `${result}, ${part}` : part;
    if (next.length > 100) break;
    result = next;
  }
  return (result || title.slice(0, 100)).trim();
}

function hashtag(tag: string): string {
  return `#${tag.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

// Pin metni: başlık (≤100), açıklama (≤800: anahtar kelimeler + çağrı + hashtag), alt metin (≤500).
export function buildPinPayload(job: PinJob, listing: EtsyListing, boardId: string) {
  const tags = (listing.tags || []).map((tag) => String(tag).toLowerCase()).filter((tag) => tag && !isIpRisky(tag));
  const images = (listing.images || [])
    .filter((image) => image.url_fullxfull || image.url_570xN)
    .map((image) => ({ url: String(image.url_fullxfull || image.url_570xN), ratio: Number(image.full_height || 1) / Math.max(1, Number(image.full_width || 1)) }))
    .sort((a, b) => b.ratio - a.ratio);
  if (!images.length) throw new PinterestError("VALIDATION_FAILED", "Etsy ilanında görsel yok; pin için görsel gerekir.", 400);
  const title = job.pin?.title || shortenTitle(String(listing.title || "").replace(/\s+/g, " "));
  const intro = job.pin?.description || String(listing.description || "").split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim().slice(0, 320);
  const keywords = tags.slice(0, 8).join(", ");
  const hashtags = [...new Set(tags.slice(0, 5).map(hashtag))].join(" ");
  const description = [intro, keywords ? `Perfect for: ${keywords}.` : "", "Tap to see it on Etsy.", hashtags].filter(Boolean).join(" ").slice(0, 800);
  const link = job.link || `https://www.etsy.com/listing/${job.listingId}?utm_source=pinterest&utm_medium=social&utm_campaign=gxl_autopin`;
  return {
    board_id: boardId,
    title: title.slice(0, 100),
    description,
    link,
    alt_text: `${shortenTitle(String(listing.title || title))}${tags.length ? `. ${tags.slice(0, 4).join(", ")}` : ""}`.slice(0, 500),
    media_source: { source_type: "image_url", url: images[job.pinIndex % images.length].url },
    ...(job.aiAssisted ? { ai_disclosures: { values: ["AI_MODIFIED"] } } : {})
  };
}

// Cron ile çalışır: her çalışmada zamanı gelmiş tek pin işini işler (ücretsiz plan işlemci sınırı).
export async function processPinQueue(env: PinterestRuntimeEnv, store: PinterestStore | undefined, fetcher: Fetcher = fetch, now = Date.now(), options: { jobId?: string } = {}) {
  if (!store || !env.PINTEREST_APP_ID || !env.PINTEREST_APP_SECRET || !env.ETSY_API_KEY) return { skipped: "not_configured" as const };
  if (!(await store.get(TOKEN_KEY))) return { skipped: "not_connected" as const };
  const jobs = await listPinJobs(store);
  const job = options.jobId
    ? jobs.find((item) => item.id === options.jobId && item.status !== "posted")
    : jobs.filter((item) => (item.status === "scheduled" || item.status === "waiting_listing") && Date.parse(item.dueAt) <= now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (!job) return { skipped: "nothing_due" as const };
  job.attempts += 1;
  job.updatedAt = new Date(now).toISOString();
  try {
    const listing = await etsyRequest<EtsyListing>(env, `/application/listings/${job.listingId}`, { authenticated: false, query: { includes: "Images" } }, fetcher);
    job.listingTitle = String(listing.title || job.listingTitle || "").slice(0, 140);
    if (listing.state !== "active") {
      if (job.attempts >= MAX_LISTING_CHECKS) {
        job.status = "failed";
        job.error = "Etsy ilanı 15 gün içinde yayına girmedi.";
      } else {
        job.status = "waiting_listing";
        job.dueAt = new Date(now + LISTING_RECHECK_MS).toISOString();
        job.error = "Etsy ilanı henüz yayında değil; yayına girince pin otomatik atılacak.";
      }
      await saveJobs(store, jobs);
      return { jobId: job.id, status: job.status };
    }
    const boardId = await ensureBoard(env, store, job.boardName, fetcher);
    const payload = buildPinPayload(job, listing, boardId);
    let pin: { id?: string };
    try {
      pin = await pinterestRequest<{ id?: string }>(env, "/v5/pins", { method: "POST", body: payload }, fetcher);
    } catch (error) {
      if (!(error instanceof PinterestError && error.code === "VALIDATION_FAILED" && "ai_disclosures" in payload)) throw error;
      const { ai_disclosures: _ignored, ...withoutDisclosure } = payload;
      pin = await pinterestRequest<{ id?: string }>(env, "/v5/pins", { method: "POST", body: withoutDisclosure }, fetcher);
    }
    job.status = "posted";
    job.pinId = pin.id;
    job.pinUrl = pin.id ? `https://www.pinterest.com/pin/${pin.id}/` : undefined;
    delete job.error;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "Pin oluşturulamadı.";
    // Pano Pinterest'te silinmişse önbellekteki pano numarası temizlenir; sonraki denemede pano yeniden bulunur veya açılır.
    const boardMissing = error instanceof PinterestError && error.code === "NOT_FOUND";
    if (boardMissing) {
      const boards = await readJson<Record<string, string>>(store, BOARDS_KEY, {});
      delete boards[job.boardName.toLowerCase()];
      await store.put(BOARDS_KEY, JSON.stringify(boards));
    }
    const retryable = error instanceof PinterestError && (error.code === "RATE_LIMITED" || error.code === "UPSTREAM_FAILED" || boardMissing);
    job.error = message;
    if (retryable && job.attempts < 5) {
      job.status = "scheduled";
      job.dueAt = new Date(now + 60 * 60 * 1000).toISOString();
    } else if (error instanceof PinterestError && (error.code === "NOT_CONNECTED" || error.code === "AUTH_FAILED")) {
      job.status = "scheduled";
      job.dueAt = new Date(now + LISTING_RECHECK_MS).toISOString();
      job.error = "Pinterest bağlantısı yenilenmeli; uygulamadan yeniden bağlayın. Pin bekletiliyor.";
    } else {
      job.status = "failed";
    }
  }
  await saveJobs(store, jobs);
  return { jobId: job.id, status: job.status, error: job.error };
}

export async function getPinterestStatus(env: PinterestRuntimeEnv) {
  const store = env.ETSY_OAUTH as unknown as PinterestStore | undefined;
  const tokens = store ? await readJson<PinterestTokens | null>(store, TOKEN_KEY, null) : null;
  const jobs = await listPinJobs(store);
  const count = (status: PinJob["status"]) => jobs.filter((job) => job.status === status).length;
  return {
    configured: Boolean(env.PINTEREST_APP_ID && env.PINTEREST_APP_SECRET && store),
    connected: Boolean(tokens),
    username: tokens?.username,
    settings: await readPinterestSettings(store),
    queue: { scheduled: count("scheduled"), waiting: count("waiting_listing"), posted: count("posted"), failed: count("failed") },
    note: "Pinterest uygulamanız Trial erişimindeyse oluşturulan pinleri yalnızca siz görürsünüz. Herkese açık pin için Pinterest'ten Standard erişim onayı alın (Kılavuz → Pinterest)."
  };
}

export async function disconnectPinterest(store: PinterestStore) {
  await store.delete(TOKEN_KEY);
  await store.delete(BOARDS_KEY);
}
