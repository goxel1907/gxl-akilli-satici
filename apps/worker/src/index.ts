import { approvals, leads, messages, products } from "../../api/src/data.js";
import { generateListingPack } from "../../api/src/listing-agent.js";
import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "../../api/src/marketplace-policy.js";
import { buildOpportunityCenter, replyToAgent, type OpportunityContext } from "../../api/src/opportunity-agent.js";
import { canStartConversation } from "../../api/src/policy.js";
import { analyzeProductImages } from "../../api/src/product-analyzer.js";
import { scoreProspect, type ProspectSignal } from "../../api/src/prospecting.js";
import type { AiRuntimeEnv } from "../../api/src/structured-ai.js";
import type { Channel, Lead } from "../../api/src/types.js";
import {
  createShopierProduct,
  createShopierWebhookSubscription,
  getShopierSnapshot,
  listRedactedShopierOrders,
  listShopierProducts,
  listShopierWebhookSubscriptions,
  ShopierIntegrationError,
  updateShopierProduct,
  verifyShopierWebhook,
  type ShopierProductInput,
  type ShopierProductPatch,
  type ShopierRuntimeEnv,
  type ShopierWebhookEvent
} from "./shopier.js";
import { createEtsyConnectSession, EtsyIntegrationError, getConnectedShop, getEtsyStatus, handleEtsyCallback, type EtsyRuntimeEnv } from "./etsy.js";
import { getTrendBoard, isTrendGroup, normalizeKeyword, readCached, scanTrend, type TrendResult, type TrendStore } from "./etsy-trends.js";
import { seasonalBoard } from "./seasonal.js";
import { autopilotStatus, listDiscoveries, recordScan, runAutopilot } from "./discovery.js";
import { buildProductPlan, createEtsyPhysicalDraft, detectProductSignals, getUsdTryRate, keywordCandidates, normalizeProductInput, publishEtsyListing, type KeyValueStore } from "./product-studio.js";
import { buildPatternBrief, createDigitalListing, normalizeDigitalListingInput, normalizePatternPlanInput } from "./pattern-studio.js";
import { PRIVACY_PATHS, privacyPolicyPage } from "./legal-pages.js";
import { createPatternSeed, readUsedNames, rememberName } from "./pattern-seed.js";
import { buildPrintableBrief, createPrintableListing, normalizePrintablePlanInput } from "./printable-studio.js";
import {
  autoEnqueuePins,
  boardNameFor,
  createPinterestConnectSession,
  disconnectPinterest,
  enqueueListingPins,
  getPinterestStatus,
  handlePinterestCallback,
  listPinJobs,
  parseListingId,
  PinterestError,
  processPinQueue,
  writePinterestSettings,
  type PinterestRuntimeEnv,
  type PinterestStore
} from "./pinterest.js";
import {
  createDigitalProduct,
  createEtsyDigitalDraft,
  createGrant,
  DigitalDeliveryError,
  getDigitalProduct,
  grantDownload,
  grantLandingPage,
  listDigitalProducts,
  listGrants,
  revokeGrant,
  type DigitalStore
} from "./digital-delivery.js";

interface Env extends AiRuntimeEnv, ShopierRuntimeEnv, EtsyRuntimeEnv, PinterestRuntimeEnv {
  APP_ACCESS_TOKEN?: string;
  PRODUCT_MEDIA?: {
    get(key: string): Promise<{ body: ReadableStream; httpEtag?: string } | null>;
    put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<unknown>;
  };
}

interface ProductMediaKv {
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer): Promise<void>;
}

interface ShopierWebhookKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface StoredShopierWebhook {
  id: string;
  event: ShopierWebhookEvent;
  url: string;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS"
};

const processedShopierWebhookIds = new Set<string>();
const shopierWebhookEvents: Array<{ id: string; event: string; resourceId?: string; receivedAt: string }> = [];
const SHOPIER_WEBHOOK_MANIFEST_KEY = "shopier:webhooks:manifest";
const SHOPIER_WEBHOOK_TOKEN_PREFIX = "shopier:webhook-token:";
const SHOPIER_WEBHOOK_EVENTS: ShopierWebhookEvent[] = [
  "order.created",
  "order.addressUpdated",
  "order.fulfilled",
  "product.created",
  "product.updated",
  "refund.requested",
  "refund.updated"
];

function json(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: corsHeaders });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000_000) throw new Error("PAYLOAD_TOO_LARGE");
  return await request.json() as Record<string, unknown>;
}

async function readRawBody(request: Request, maxBytes = 2_000_000): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  return raw;
}

function decodeProductImage(input: Record<string, unknown>): { bytes: ArrayBuffer; mimeType: string; extension: string } {
  const mimeType = String(input.mimeType || "").toLowerCase();
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/bmp": "bmp" };
  const extension = extensions[mimeType];
  if (!extension) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, "/api/shopier/media", "media", "Yalnızca JPG, PNG veya BMP ürün fotoğrafı yüklenebilir.");
  const raw = String(input.imageBase64 || "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, "/api/shopier/media", "media", "Ürün fotoğrafı okunamadı.");
  const binary = Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
  if (binary.byteLength < 1_000 || binary.byteLength > 5_000_000) throw new ShopierIntegrationError("VALIDATION_FAILED", 400, "/api/shopier/media", "media", "Ürün fotoğrafı 1 KB ile 5 MB arasında olmalıdır.");
  return { bytes: binary.buffer, mimeType, extension };
}

function requireConfirmedShopierWrite(env: Env, input: Record<string, unknown>): Response | undefined {
  if (!env.APP_ACCESS_TOKEN) return json(503, { error: "Shopier yazma işlemleri için uygulama erişim anahtarı zorunludur." });
  if (input.confirm !== true) return json(409, { error: "Shopier mağazasında değişiklik yapmak için açık onay gereklidir.", requiresConfirmation: true });
  return undefined;
}

function requireConfirmedWrite(env: Env, input: Record<string, unknown>, action: string): Response | undefined {
  if (!env.APP_ACCESS_TOKEN) return json(503, { error: `${action} için uygulama erişim anahtarı zorunludur.` });
  if (input.confirm !== true) return json(409, { error: `${action} için açık onay gereklidir.`, requiresConfirmation: true });
  return undefined;
}

function digitalStore(env: Env): DigitalStore {
  if (!env.ETSY_OAUTH) throw new DigitalDeliveryError("STORAGE_NOT_CONFIGURED", "Dijital ürünler için ücretsiz KV deposu bağlı değil.", 503);
  return env.ETSY_OAUTH as unknown as DigitalStore;
}

async function readMultipart(request: Request): Promise<FormData> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 45_000_000) throw new Error("PAYLOAD_TOO_LARGE");
  if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) {
    throw new DigitalDeliveryError("VALIDATION_FAILED", "Dosya yüklemesi multipart/form-data olarak gönderilmelidir.");
  }
  return await request.formData();
}

function productMediaStorage(env: Env): "r2" | "kv" | undefined {
  if (env.PRODUCT_MEDIA) return "r2";
  if (env.ETSY_OAUTH) return "kv";
  return undefined;
}

async function getProductMedia(env: Env, key: string): Promise<{ body: BodyInit; etag?: string } | null> {
  if (env.PRODUCT_MEDIA) {
    const object = await env.PRODUCT_MEDIA.get(key);
    return object ? { body: object.body, etag: object.httpEtag } : null;
  }
  if (!env.ETSY_OAUTH) return null;
  const value = await (env.ETSY_OAUTH as unknown as ProductMediaKv).get(key, "arrayBuffer");
  return value ? { body: value } : null;
}

async function putProductMedia(env: Env, key: string, value: ArrayBuffer, mimeType: string): Promise<void> {
  if (env.PRODUCT_MEDIA) {
    await env.PRODUCT_MEDIA.put(key, value, { httpMetadata: { contentType: mimeType, cacheControl: "public, max-age=31536000, immutable" } });
    return;
  }
  if (!env.ETSY_OAUTH) throw new Error("PRODUCT_MEDIA_NOT_CONFIGURED");
  await (env.ETSY_OAUTH as unknown as ProductMediaKv).put(key, value);
}

function shopierWebhookStore(env: Env): ShopierWebhookKv | undefined {
  return env.ETSY_OAUTH as unknown as ShopierWebhookKv | undefined;
}

async function loadShopierWebhookManifest(env: Env): Promise<StoredShopierWebhook[]> {
  const store = shopierWebhookStore(env);
  if (!store) return [];
  const raw = await store.get(SHOPIER_WEBHOOK_MANIFEST_KEY);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as StoredShopierWebhook[];
    return Array.isArray(values) ? values.filter((value) => value.id && value.event && value.url) : [];
  } catch {
    return [];
  }
}

async function shopierWebhookToken(env: Env, webhookId: string): Promise<string | undefined> {
  const configured = env.SHOPIER_WEBHOOK_TOKEN || env.SHOPIER_WEBHOOK_SECRET;
  if (configured) return configured;
  const store = shopierWebhookStore(env);
  if (!store || !webhookId) return undefined;
  return (await store.get(`${SHOPIER_WEBHOOK_TOKEN_PREFIX}${webhookId}`)) || undefined;
}

async function shopierWebhooksConfigured(env: Env): Promise<boolean> {
  if (env.SHOPIER_WEBHOOK_TOKEN || env.SHOPIER_WEBHOOK_SECRET) return true;
  return (await loadShopierWebhookManifest(env)).length > 0;
}

async function setupShopierWebhooks(env: Env, notificationUrl: string) {
  const store = shopierWebhookStore(env);
  if (!store) throw new ShopierIntegrationError("NOT_CONFIGURED", 503, "/webhooks", "storage", "Shopier webhook anahtarları için KV deposu bağlı değil.");
  const [remote, stored] = await Promise.all([
    listShopierWebhookSubscriptions(env),
    loadShopierWebhookManifest(env)
  ]);
  const created: StoredShopierWebhook[] = [];
  const ready = [...stored];
  const needsRecreation: Array<{ id: string; event: ShopierWebhookEvent }> = [];

  for (const event of SHOPIER_WEBHOOK_EVENTS) {
    const existingStored = ready.find((item) => item.event === event && item.url === notificationUrl);
    if (existingStored && await store.get(`${SHOPIER_WEBHOOK_TOKEN_PREFIX}${existingStored.id}`)) continue;
    const existingRemote = remote.find((item) => item.event === event && item.url === notificationUrl);
    if (existingRemote) {
      needsRecreation.push({ id: existingRemote.id, event });
      continue;
    }
    const webhook = await createShopierWebhookSubscription(env, event, notificationUrl);
    await store.put(`${SHOPIER_WEBHOOK_TOKEN_PREFIX}${webhook.id}`, webhook.token!);
    const safe = { id: webhook.id, event: webhook.event, url: webhook.url };
    ready.push(safe);
    created.push(safe);
  }
  await store.put(SHOPIER_WEBHOOK_MANIFEST_KEY, JSON.stringify(ready));
  return {
    configured: ready.length,
    expected: SHOPIER_WEBHOOK_EVENTS.length,
    created,
    needsRecreation,
    ready: ready.length === SHOPIER_WEBHOOK_EVENTS.length && needsRecreation.length === 0
  };
}

function shopierWebhookSetupPage(): Response {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GXL Shopier Webhook Kurulumu</title><style>body{font-family:system-ui;background:#f6f2e9;color:#17201d;margin:0}main{max-width:620px;margin:48px auto;padding:24px}section{background:#fff;border-radius:22px;padding:28px;box-shadow:0 10px 30px #0001}input,button{box-sizing:border-box;width:100%;padding:14px;border-radius:12px;font-size:16px}input{border:1px solid #bbb;margin:12px 0}button{border:0;background:#176b52;color:#fff;font-weight:700}pre{white-space:pre-wrap;background:#f2f4f3;padding:14px;border-radius:12px}</style></head><body><main><section><h1>Shopier olay bağlantısı</h1><p>Cloudflare'a kaydettiğiniz APP_ACCESS_TOKEN değerini girin. Değer yalnızca bu Worker'a gönderilir ve sayfada saklanmaz.</p><input id="token" type="password" autocomplete="off" placeholder="APP_ACCESS_TOKEN"><button id="setup">7 Shopier olayını bağla</button><pre id="result">Hazır.</pre></section></main><script>document.getElementById('setup').addEventListener('click',async()=>{const token=document.getElementById('token').value.trim();const result=document.getElementById('result');if(!token){result.textContent='Anahtarı girin.';return}result.textContent='Kuruluyor…';try{const response=await fetch('/api/shopier/webhooks/setup',{method:'POST',headers:{'authorization':'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({confirm:true})});const body=await response.json();result.textContent=response.ok?(body.ready?'Tamamlandı: tüm Shopier olayları bağlı.':'Kısmen tamamlandı: '+JSON.stringify(body,null,2)):(body.error||'Kurulum başarısız.')}catch{result.textContent='Bağlantı kurulamadı.'}document.getElementById('token').value=''})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function shopierCenter(env: Env) {
  const [liveProducts, orders] = await Promise.all([
    listShopierProducts(env),
    listRedactedShopierOrders(env)
  ]);
  const writeEnabled = Boolean(env.SHOPIER_ACCESS_TOKEN && env.APP_ACCESS_TOKEN);
  const webhookVerificationConfigured = await shopierWebhooksConfigured(env);
  const mediaStorage = productMediaStorage(env);
  const mediaUploadConfigured = Boolean(mediaStorage);
  const blockers = [
    ...(!writeEnabled ? ["Ürün oluşturma ve güncelleme için APP_ACCESS_TOKEN yapılandırılmalı."] : []),
    ...(!webhookVerificationConfigured ? ["Anlık ürün/sipariş olayları için SHOPIER_WEBHOOK_TOKEN yapılandırılmalı."] : []),
    ...(!mediaUploadConfigured ? ["Telefondan ürün fotoğrafı yüklemek için ücretsiz KV veya R2 deposu bağlanmalı."] : [])
  ];
  return {
    connected: true,
    checkedAt: new Date().toISOString(),
    counts: { products: liveProducts.length, recentOrders: orders.length, orderWindowDays: 30 },
    products: liveProducts,
    orders,
    privacy: "Sipariş özetinde müşteri adı, telefon, e-posta ve adres bilgileri bulunmaz.",
    capabilities: {
      readProducts: true,
      readOrders: true,
      createProducts: writeEnabled,
      updateProducts: writeEnabled,
      deleteProducts: false,
      signedWebhooks: webhookVerificationConfigured,
      mediaUpload: mediaUploadConfigured,
      mediaStorage
    },
    recentWebhookEvents: shopierWebhookEvents.slice(-20).reverse(),
    blockers,
    ready: blockers.length === 0
  };
}

function dashboard() {
  return {
    metrics: {
      activeLeads: leads.filter((lead) => lead.stage === "active").length,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      catalogProducts: products.length,
      conversations: new Set(messages.map((message) => message.leadId)).size
    },
    leads,
    approvals,
    products,
    messages: messages.slice(-20)
  };
}

const channels = new Set<Channel>(["whatsapp", "instagram", "facebook", "shopier", "letgo", "etsy", "email"]);

function sourceName(channel: Channel): string {
  const names: Record<Channel, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    facebook: "Facebook",
    shopier: "Shopier",
    letgo: "Letgo",
    etsy: "Etsy",
    email: "İzinli e-posta/form"
  };
  return names[channel];
}

async function opportunityContext(env: Env): Promise<OpportunityContext> {
  let shopier: OpportunityContext["shopier"];
  try {
    const snapshot = await getShopierSnapshot(env);
    const liveProducts = snapshot.connected ? await listShopierProducts(env) : [];
    shopier = { ...snapshot, products: liveProducts };
  } catch (error) {
    shopier = {
      configured: Boolean(env.SHOPIER_ACCESS_TOKEN),
      connected: false,
      error: error instanceof ShopierIntegrationError ? error.code : "UPSTREAM_FAILED",
      message: "Shopier geçici olarak yanıt vermedi."
    };
  }

  return {
    shopier,
    etsy: await getEtsyStatus(env),
    catalogProducts: products.map((product) => ({
      id: product.id,
      title: product.name,
      url: product.shopierUrl || product.etsyUrl || product.letgoUrl,
      stockQuantity: product.stock
    })),
    prospects: leads.map((lead) => ({
      id: lead.id,
      kind: lead.lastInboundAt ? "real_customer" as const : "permissioned_prospect" as const,
      sourceId: lead.channel === "email" ? "permissioned_email_forms" : lead.channel === "shopier" || lead.channel === "etsy" || lead.channel === "letgo" ? "marketplace_inbound" : "meta_channels",
      sourceName: sourceName(lead.channel),
      displayName: lead.displayName,
      evidence: lead.lastInboundAt
        ? `Müşteri ${new Date(lead.lastInboundAt).toLocaleDateString("tr-TR")} tarihinde görüşmeyi kendisi başlattı.`
        : "Açık iletişim izni ve doğrulanmış ürün ilgisi mevcut.",
      score: lead.score,
      contactAllowed: lead.consent
    }))
  };
}

function authorized(request: Request, env: Env): boolean {
  if (!env.APP_ACCESS_TOKEN) return true;
  return request.headers.get("authorization") === `Bearer ${env.APP_ACCESS_TOKEN}`;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    if (request.method === "OPTIONS") return json(204, {});
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        service: "gxl-akilli-satici",
        ai: env.GEMINI_API_KEY ? "gemini" : env.OPENAI_API_KEY ? "openai" : "not_configured",
        shopier: env.SHOPIER_ACCESS_TOKEN ? "configured" : "not_configured",
        shopierWebhooks: await shopierWebhooksConfigured(env) ? "verified" : "not_configured",
        productMedia: productMediaStorage(env) || "not_configured",
        etsy: env.ETSY_API_KEY && env.ETSY_SHARED_SECRET ? "configured" : "not_configured"
      });
    }
    if (request.method === "GET" && url.pathname === "/setup/shopier-webhooks") return shopierWebhookSetupPage();
    // Pinterest başvurusu gizlilik adresinde şirket adını arar; aynı sayfa şirket adlı yollardan da açılır.
    if (request.method === "GET" && PRIVACY_PATHS.has(url.pathname.toLowerCase().replace(/\/+$/, ""))) return privacyPolicyPage();
    if (request.method === "GET" && url.pathname === "/etsy/oauth/callback") return await handleEtsyCallback(request, env);
    if (request.method === "GET" && url.pathname === "/pinterest/oauth/callback") return await handlePinterestCallback(request, env);
    if (request.method === "GET" && (url.pathname.startsWith("/media/shopier/") || url.pathname.startsWith("/media/digital/"))) {
      if (!productMediaStorage(env)) return json(404, { error: "Ürün görseli bulunamadı." });
      const key = url.pathname.slice("/media/".length);
      if (!/^(shopier|digital)\/[a-f0-9-]+\.(jpg|png|bmp)$/.test(key)) return json(404, { error: "Ürün görseli bulunamadı." });
      const object = await getProductMedia(env, key);
      if (!object) return json(404, { error: "Ürün görseli bulunamadı." });
      const extension = key.split(".").at(-1);
      const contentType = extension === "png" ? "image/png" : extension === "bmp" ? "image/bmp" : "image/jpeg";
      return new Response(object.body, { headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable", ...(object.etag ? { etag: object.etag } : {}) } });
    }
    if (request.method === "POST" && url.pathname === "/webhooks/shopier") {
      const rawBody = await readRawBody(request);
      const verification = await verifyShopierWebhook(rawBody, request.headers, await shopierWebhookToken(env, request.headers.get("Shopier-Webhook-Id")?.trim() || ""));
      if (!verification.ok) return json(401, { accepted: false, error: verification.reason });
      if (processedShopierWebhookIds.has(verification.webhookId)) return json(200, { accepted: true, duplicate: true });
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(rawBody) as Record<string, unknown>; } catch { return json(400, { accepted: false, error: "Shopier webhook gövdesi geçerli JSON değil." }); }
      processedShopierWebhookIds.add(verification.webhookId);
      if (processedShopierWebhookIds.size > 500) processedShopierWebhookIds.delete(processedShopierWebhookIds.values().next().value as string);
      shopierWebhookEvents.push({
        id: verification.webhookId,
        event: verification.event,
        resourceId: payload.id ? String(payload.id) : undefined,
        receivedAt: new Date().toISOString()
      });
      if (shopierWebhookEvents.length > 100) shopierWebhookEvents.splice(0, shopierWebhookEvents.length - 100);
      return json(200, { accepted: true, duplicate: false, event: verification.event });
    }
    const downloadMatch = url.pathname.match(/^\/d\/([A-Za-z0-9_-]{32})(\/file)?$/);
    if (request.method === "GET" && downloadMatch) {
      if (!env.ETSY_OAUTH) return json(404, { error: "İndirme bağlantısı bulunamadı." });
      return downloadMatch[2] ? await grantDownload(digitalStore(env), downloadMatch[1]) : await grantLandingPage(digitalStore(env), downloadMatch[1]);
    }
    if (url.pathname.startsWith("/api/") && !authorized(request, env)) return json(401, { error: "Uygulama erişim anahtarı geçersiz." });

    if (request.method === "GET" && url.pathname === "/api/channels/status") {
      let shopier: unknown;
      try {
        shopier = { ...(await getShopierSnapshot(env)), webhookVerificationConfigured: await shopierWebhooksConfigured(env) };
      } catch (error) {
        const code = error instanceof ShopierIntegrationError ? error.code : "UPSTREAM_FAILED";
        const messages: Record<string, string> = {
          AUTH_FAILED: "Shopier erişim anahtarı reddedildi. Cloudflare secret değerini yenileyin.",
          RATE_LIMITED: "Shopier istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.",
          UPSTREAM_FAILED: "Shopier geçici olarak yanıt vermedi."
        };
        shopier = {
          configured: Boolean(env.SHOPIER_ACCESS_TOKEN),
          connected: false,
          error: code,
          upstreamStatus: error instanceof ShopierIntegrationError ? error.status : undefined,
          failedEndpoint: error instanceof ShopierIntegrationError ? error.endpoint : undefined,
          upstreamCode: error instanceof ShopierIntegrationError ? error.upstreamCode : undefined,
          upstreamMessage: error instanceof ShopierIntegrationError ? error.upstreamMessage : undefined,
          message: messages[code] || messages.UPSTREAM_FAILED
        };
      }
      return json(200, { shopier, etsy: await getEtsyStatus(env) });
    }

    if (request.method === "POST" && url.pathname === "/api/etsy/connect-session") {
      return json(200, await createEtsyConnectSession(request, env));
    }

    if (request.method === "GET" && url.pathname === "/api/etsy/trends") {
      return json(200, await getTrendBoard(env, env.ETSY_OAUTH as unknown as TrendStore | undefined));
    }
    if (request.method === "GET" && url.pathname === "/api/etsy/seasonal") {
      return json(200, await seasonalBoard(env.ETSY_OAUTH as unknown as TrendStore | undefined));
    }
    if (request.method === "POST" && url.pathname === "/api/etsy/trends/scan") {
      const input = await readBody(request);
      const store = env.ETSY_OAUTH as unknown as TrendStore | undefined;
      const result = await scanTrend(env, {
        nicheId: input.nicheId ? String(input.nicheId) : undefined,
        keyword: input.keyword ? String(input.keyword) : undefined,
        force: input.force === true,
        group: isTrendGroup(input.group) ? input.group : undefined
      }, store);
      const discovered = result.cached && input.track !== true ? [] : await recordScan(store, result, Date.now(), { track: input.track === true });
      return json(200, { ...result, discovered: discovered.map((item) => item.keyword) });
    }
    if (request.method === "GET" && url.pathname === "/api/etsy/discoveries") {
      const store = env.ETSY_OAUTH as unknown as TrendStore | undefined;
      return json(200, { autopilot: await autopilotStatus(store), items: await listDiscoveries(store) });
    }

    if (request.method === "POST" && url.pathname === "/api/patterns/seed") {
      const input = await readBody(request);
      return json(200, await createPatternSeed(env, env.ETSY_OAUTH as unknown as TrendStore | undefined, { keyword: String(input.keyword || ""), craft: input.craft ? String(input.craft) : undefined }));
    }
    if (request.method === "POST" && url.pathname === "/api/patterns/plan") {
      const input = await readBody(request);
      const store = env.ETSY_OAUTH as unknown as TrendStore | undefined;
      const plan = normalizePatternPlanInput(input);
      const usedNames = await readUsedNames(store);
      const brief = buildPatternBrief({ ...plan, avoidNames: usedNames });
      await rememberName(store, brief.name, usedNames);
      const listing = await createDigitalListing(normalizeDigitalListingInput({ ...input, name: input.name || brief.name }), env);
      return json(200, { brief, listing });
    }

    if (request.method === "POST" && url.pathname === "/api/printables/plan") {
      const input = normalizePrintablePlanInput(await readBody(request));
      const store = env.ETSY_OAUTH as unknown as TrendStore | undefined;
      const usedNames = await readUsedNames(store);
      const brief = buildPrintableBrief({ ...input, avoidNames: usedNames });
      await rememberName(store, brief.name, usedNames);
      return json(200, { brief, listing: await createPrintableListing(input, brief.name, env) });
    }

    if (request.method === "GET" && url.pathname === "/api/pinterest/status") return json(200, await getPinterestStatus(env));
    if (request.method === "POST" && url.pathname === "/api/pinterest/connect-session") return json(200, await createPinterestConnectSession(request, env));
    if (request.method === "POST" && url.pathname === "/api/pinterest/settings") {
      if (!env.ETSY_OAUTH) return json(503, { error: "Güvenli KV deposu bağlı değil." });
      return json(200, { settings: await writePinterestSettings(env.ETSY_OAUTH as unknown as PinterestStore, await readBody(request)) });
    }
    if (request.method === "POST" && url.pathname === "/api/pinterest/disconnect") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Pinterest bağlantısını kaldırma");
      if (blocked) return blocked;
      if (env.ETSY_OAUTH) await disconnectPinterest(env.ETSY_OAUTH as unknown as PinterestStore);
      return json(200, { disconnected: true });
    }
    if (request.method === "GET" && url.pathname === "/api/pinterest/queue") {
      const jobs = await listPinJobs(env.ETSY_OAUTH as unknown as PinterestStore | undefined);
      return json(200, { jobs: [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60) });
    }
    if (request.method === "POST" && url.pathname === "/api/pinterest/queue") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Pinterest pin planlama");
      if (blocked) return blocked;
      if (!env.ETSY_OAUTH) return json(503, { error: "Güvenli KV deposu bağlı değil." });
      const listingId = parseListingId(input.listingId ?? input.listingUrl);
      if (!listingId) return json(400, { error: "Geçerli bir Etsy ilan linki veya numarası girin." });
      const jobs = await enqueueListingPins(env.ETSY_OAUTH as unknown as PinterestStore, {
        listingId,
        boardName: String(input.boardName || "").trim() || "GXL Market Studio",
        link: input.link ? String(input.link) : undefined
      });
      return json(201, { jobs, alreadyQueued: jobs.length === 0 });
    }
    const pinRunMatch = url.pathname.match(/^\/api\/pinterest\/queue\/([A-Za-z0-9_-]{8,32})\/run$/);
    if (pinRunMatch && request.method === "POST") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Pini şimdi gönderme");
      if (blocked) return blocked;
      return json(200, await processPinQueue(env, env.ETSY_OAUTH as unknown as PinterestStore | undefined, fetch, Date.now(), { jobId: pinRunMatch[1] }));
    }

    if (request.method === "POST" && url.pathname === "/api/products/etsy-keywords") {
      const product = normalizeProductInput(await readBody(request));
      return json(200, await keywordCandidates(product, env));
    }
    if (request.method === "POST" && url.pathname === "/api/products/etsy-plan") {
      const input = await readBody(request);
      const product = normalizeProductInput(input.product && typeof input.product === "object" ? input.product as Record<string, unknown> : {});
      const store = env.ETSY_OAUTH as unknown as TrendStore | undefined;
      const keywords = [...new Set((Array.isArray(input.keywords) ? input.keywords : []).map((value) => normalizeKeyword(String(value))).filter((value) => value.length >= 3))].slice(0, 6);
      const scans: TrendResult[] = [];
      let inlineScans = 0;
      for (const keyword of keywords) {
        const cached = await readCached(store, keyword);
        if (cached) scans.push(cached);
        else if (inlineScans < 2 && env.ETSY_API_KEY && env.ETSY_SHARED_SECRET) {
          inlineScans += 1;
          scans.push(await scanTrend(env, { keyword }, store));
        }
      }
      const usdTryRate = await getUsdTryRate(env.ETSY_OAUTH as unknown as KeyValueStore | undefined, fetch, product.usdTryRate);
      let shopCurrency: string | undefined;
      try { shopCurrency = (await getConnectedShop(env)).currencyCode; } catch { shopCurrency = undefined; }
      return json(200, { plan: buildProductPlan(product, keywords, scans, { usdTryRate, shopCurrency, signals: detectProductSignals(product) }), shopCurrency });
    }
    if (request.method === "POST" && url.pathname === "/api/products/etsy-publish") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Etsy ilanını yayınlama");
      if (blocked) return blocked;
      return json(200, await publishEtsyListing(env, Number(input.listingId)));
    }
    if (request.method === "POST" && url.pathname === "/api/products/etsy-draft") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Etsy taslak ilanı oluşturma");
      if (blocked) return blocked;
      if (!env.ETSY_OAUTH) return json(503, { error: "Etsy güvenli token deposu henüz bağlanmadı." });
      const product = normalizeProductInput(input.product && typeof input.product === "object" ? input.product as Record<string, unknown> : {});
      const listing = input.listing && typeof input.listing === "object" ? input.listing as Record<string, unknown> : {};
      const result = await createEtsyPhysicalDraft(env, env.ETSY_OAUTH as unknown as KeyValueStore, product, {
        title: String(listing.title || ""),
        tags: Array.isArray(listing.tags) ? listing.tags.map(String) : [],
        description: String(listing.description || ""),
        materials: Array.isArray(listing.materials) ? listing.materials.map(String) : [],
        priceUsd: Number(listing.priceUsd || 0)
      });
      const pinsQueued = result.alreadyCreated ? 0 : await autoEnqueuePins(env.ETSY_OAUTH as unknown as PinterestStore, { listingId: result.listingId, boardName: boardNameFor({ noun: detectProductSignals(product).noun }), listingTitle: String(listing.title || "") });
      return json(result.alreadyCreated ? 200 : 201, { ...result, pinsQueued });
    }

    if (request.method === "GET" && url.pathname === "/api/digital/products") {
      return json(200, { products: await listDigitalProducts(digitalStore(env)) });
    }
    if (request.method === "POST" && url.pathname === "/api/digital/products") {
      const form = await readMultipart(request);
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(String(form.get("metadata") || "{}")) as Record<string, unknown>; } catch { /* createDigitalProduct reports it */ }
      const blocked = requireConfirmedWrite(env, metadata, "Dijital ürün yükleme");
      if (blocked) return blocked;
      const store = digitalStore(env);
      return json(201, { product: await createDigitalProduct(store, form, url.origin, (key, bytes, mimeType) => putProductMedia(env, key, bytes, mimeType)) });
    }
    const digitalProductMatch = url.pathname.match(/^\/api\/digital\/products\/([a-f0-9-]{36})(?:\/(grants|etsy-draft))?$/);
    if (digitalProductMatch && request.method === "GET" && !digitalProductMatch[2]) {
      const store = digitalStore(env);
      const product = await getDigitalProduct(store, digitalProductMatch[1]);
      const grants = (await listGrants(store, product.id)).map((grant) => ({ ...grant, url: `${url.origin}/d/${grant.id}` }));
      return json(200, { product, grants });
    }
    if (digitalProductMatch && request.method === "POST" && digitalProductMatch[2] === "grants") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "İndirme bağlantısı oluşturma");
      if (blocked) return blocked;
      const grant = await createGrant(digitalStore(env), digitalProductMatch[1], input);
      return json(201, { grant: { ...grant, url: `${url.origin}/d/${grant.id}` } });
    }
    if (digitalProductMatch && request.method === "POST" && digitalProductMatch[2] === "etsy-draft") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "Etsy taslak ilanı oluşturma");
      if (blocked) return blocked;
      const result = await createEtsyDigitalDraft(env, digitalStore(env), digitalProductMatch[1], async (key) => {
        const media = await getProductMedia(env, key);
        return media ? await new Response(media.body).arrayBuffer() : null;
      });
      const pinsQueued = result.alreadyCreated ? 0 : await autoEnqueuePins(env.ETSY_OAUTH as unknown as PinterestStore, {
        listingId: result.listingId,
        boardName: boardNameFor({ kind: result.product.kind, craft: result.product.craft }),
        pins: result.product.pins,
        aiAssisted: result.product.flags.aiAssisted && result.product.flags.photosAreRenders,
        listingTitle: result.product.listing.title
      });
      return json(result.alreadyCreated ? 200 : 201, { ...result, pinsQueued });
    }
    const grantRevokeMatch = url.pathname.match(/^\/api\/digital\/grants\/([A-Za-z0-9_-]{32})\/revoke$/);
    if (grantRevokeMatch && request.method === "POST") {
      const input = await readBody(request);
      const blocked = requireConfirmedWrite(env, input, "İndirme bağlantısını kapatma");
      if (blocked) return blocked;
      return json(200, { grant: await revokeGrant(digitalStore(env), grantRevokeMatch[1]) });
    }

    if (request.method === "GET" && url.pathname === "/api/shopier/products") {
      return json(200, { products: await listShopierProducts(env) });
    }
    if (request.method === "POST" && url.pathname === "/api/shopier/products") {
      const input = await readBody(request);
      const blocked = requireConfirmedShopierWrite(env, input);
      if (blocked) return blocked;
      return json(201, { product: await createShopierProduct(env, input as unknown as ShopierProductInput) });
    }
    if (request.method === "POST" && url.pathname === "/api/shopier/media") {
      const input = await readBody(request);
      const blocked = requireConfirmedShopierWrite(env, input);
      if (blocked) return blocked;
      if (!productMediaStorage(env)) return json(503, { error: "Telefondan fotoğraf yüklemek için ücretsiz KV veya R2 deposu henüz bağlı değil." });
      const image = decodeProductImage(input);
      const key = `shopier/${crypto.randomUUID()}.${image.extension}`;
      await putProductMedia(env, key, image.bytes, image.mimeType);
      return json(201, { url: `${url.origin}/media/${key}` });
    }
    if (request.method === "POST" && url.pathname === "/api/shopier/webhooks/setup") {
      const input = await readBody(request);
      const blocked = requireConfirmedShopierWrite(env, input);
      if (blocked) return blocked;
      return json(200, await setupShopierWebhooks(env, `${url.origin}/webhooks/shopier`));
    }
    const shopierProductMatch = url.pathname.match(/^\/api\/shopier\/products\/([^/]+)$/);
    if (request.method === "PUT" && shopierProductMatch) {
      const input = await readBody(request);
      const blocked = requireConfirmedShopierWrite(env, input);
      if (blocked) return blocked;
      const { confirm: _confirm, ...patch } = input;
      return json(200, { product: await updateShopierProduct(env, decodeURIComponent(shopierProductMatch[1]), patch as ShopierProductPatch) });
    }
    if (request.method === "GET" && url.pathname === "/api/shopier/orders") {
      if (!env.APP_ACCESS_TOKEN) return json(503, { error: "Sipariş özeti için uygulama erişim anahtarı yapılandırılmalıdır." });
      return json(200, { orders: await listRedactedShopierOrders(env), privacy: "Müşteri adı, telefon, e-posta ve adres bilgileri bu yanıtta bulunmaz." });
    }
    if (request.method === "GET" && url.pathname === "/api/shopier/center") {
      if (!env.APP_ACCESS_TOKEN) return json(503, { error: "Shopier satış merkezi için uygulama erişim anahtarı yapılandırılmalıdır." });
      return json(200, await shopierCenter(env));
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") return json(200, dashboard());
    if (request.method === "GET" && url.pathname === "/api/products") return json(200, products);
    if (request.method === "GET" && url.pathname === "/api/leads") return json(200, leads);
    if (request.method === "GET" && url.pathname === "/api/approvals") return json(200, approvals);

    if (request.method === "GET" && url.pathname === "/api/opportunities") {
      return json(200, buildOpportunityCenter(await opportunityContext(env)));
    }

    if (request.method === "POST" && url.pathname === "/api/agent/chat") {
      const input = await readBody(request);
      const message = String(input.message || "").trim();
      if (!message) return json(400, { error: "Ajana sorulacak mesaj gerekli." });
      if (message.length > 2_000) return json(400, { error: "Mesaj en fazla 2.000 karakter olabilir." });
      return json(200, await replyToAgent(message, await opportunityContext(env), env));
    }

    if (request.method === "POST" && url.pathname === "/api/prospects/intake") {
      const input = await readBody(request);
      const channel = String(input.channel || "") as Channel;
      const displayName = String(input.displayName || "").trim();
      const handle = String(input.handle || "").trim();
      const signals = Array.isArray(input.signals) ? input.signals as ProspectSignal[] : [];
      if (!channels.has(channel) || !displayName || !handle || !signals.length) {
        return json(400, { error: "Kaynak, görünen ad, kanal kimliği ve gerçek etkileşim sinyali gerekli." });
      }
      const scored = scoreProspect(signals, products.flatMap((product) => product.tags));
      if (!scored.canDraftFirstContact) {
        return json(202, { stored: false, classification: "market_signal", scored, reason: "Açık iletişim izni veya müşterinin başlattığı talep yok." });
      }
      const lastInboundAt = signals
        .filter((signal) => signal.type === "inbound_message")
        .map((signal) => signal.occurredAt)
        .sort()
        .at(-1);
      let lead = leads.find((item) => item.channel === channel && item.handle === handle);
      if (lead) {
        lead.displayName = displayName;
        lead.consent = true;
        lead.interests = scored.matchedInterests;
        lead.score = scored.score;
        lead.stage = "qualified";
        lead.lastInboundAt = lastInboundAt || lead.lastInboundAt;
      } else {
        lead = {
          id: crypto.randomUUID(),
          displayName,
          channel,
          handle,
          stage: "qualified",
          consent: true,
          interests: scored.matchedInterests,
          score: scored.score,
          lastInboundAt,
          autoReplyAllowed: false
        } satisfies Lead;
        leads.push(lead);
      }
      return json(201, { stored: true, classification: lastInboundAt ? "real_customer" : "permissioned_prospect", lead, scored });
    }

    if (request.method === "POST" && url.pathname === "/api/approvals") {
      const input = await readBody(request);
      const lead = leads.find((item) => item.id === String(input.leadId || ""));
      if (!lead) return json(404, { error: "Müşteri adayı bulunamadı." });
      if (!canStartConversation(lead)) return json(409, { error: "İzin/engelleme kuralı nedeniyle ilk temas oluşturulamaz." });
      const approval = {
        id: crypto.randomUUID(),
        leadId: lead.id,
        channel: lead.channel,
        draft: String(input.draft || "").trim(),
        productIds: Array.isArray(input.productIds) ? input.productIds.map(String) : [],
        status: "pending" as const,
        createdAt: new Date().toISOString()
      };
      if (!approval.draft) return json(400, { error: "Onaya sunulacak mesaj taslağı gerekli." });
      approvals.push(approval);
      lead.stage = "contact_pending";
      return json(201, approval);
    }

    const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
    if (request.method === "POST" && approvalMatch) {
      const approval = approvals.find((item) => item.id === approvalMatch[1]);
      if (!approval) return json(404, { error: "Onay kaydı bulunamadı." });
      if (approval.status !== "pending") return json(409, { error: "Bu kayıt daha önce sonuçlandırıldı." });
      approval.status = approvalMatch[2] === "approve" ? "approved" : "rejected";
      approval.decidedAt = new Date().toISOString();
      const lead = leads.find((item) => item.id === approval.leadId);
      if (lead && approval.status === "approved") {
        lead.stage = "active";
        lead.autoReplyAllowed = true;
        messages.push({
          id: crypto.randomUUID(),
          leadId: lead.id,
          channel: lead.channel,
          direction: "outbound",
          text: approval.draft,
          mediaUrls: [],
          createdAt: new Date().toISOString(),
          automated: false
        });
      }
      return json(200, {
        approval,
        delivery: {
          accepted: false,
          mode: "manual_handoff",
          reason: approval.status === "approved" ? "Kanal gönderim anahtarı bağlı değil; onaylı taslak uygulamada paylaşılmalı." : "Taslak reddedildi."
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/products/analyze-images") {
      const input = await readBody(request);
      const imageDataUrls = Array.isArray(input.imageDataUrls) ? input.imageDataUrls.map(String) : [];
      if (!imageDataUrls.length) return json(400, { error: "En az bir ürün fotoğrafı gerekli." });
      const sellerFacts = input.sellerFacts && typeof input.sellerFacts === "object" ? input.sellerFacts as Record<string, unknown> : {};
      return json(200, await analyzeProductImages({
        imageDataUrls,
        sellerFacts: {
          name: sellerFacts.name ? String(sellerFacts.name) : undefined,
          category: sellerFacts.category ? String(sellerFacts.category) : undefined,
          description: sellerFacts.description ? String(sellerFacts.description) : undefined,
          material: sellerFacts.material ? String(sellerFacts.material) : undefined,
          origin: sellerFacts.origin ? String(sellerFacts.origin) as ProductOrigin : "unknown",
          yearMade: sellerFacts.yearMade ? Number(sellerFacts.yearMade) : undefined,
          authenticityVerified: Boolean(sellerFacts.authenticityVerified)
        }
      }, env));
    }

    if (request.method === "POST" && url.pathname === "/api/products/policy-check") {
      const input = await readBody(request);
      return json(200, { policies: evaluateMarketplacePolicies({
        origin: String(input.origin || "unknown") as ProductOrigin,
        yearMade: input.yearMade ? Number(input.yearMade) : undefined,
        authenticityVerified: Boolean(input.authenticityVerified),
        riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String) as RiskFlag[] : ["none"]
      }) });
    }

    if (request.method === "POST" && url.pathname === "/api/prospects/score") {
      const input = await readBody(request);
      const signals = Array.isArray(input.signals) ? input.signals as ProspectSignal[] : [];
      if (!signals.length) return json(400, { error: "Gerçek etkileşim sinyali gerekli." });
      return json(200, scoreProspect(signals, Array.isArray(input.catalogTags) ? input.catalogTags.map(String) : []));
    }

    if (request.method === "POST" && url.pathname === "/api/listings/generate") {
      const input = await readBody(request);
      const name = String(input.name || "").trim();
      const material = String(input.material || "").trim();
      if (!name || !material) return json(400, { error: "Ürün adı ve doğrulanmış malzeme bilgisi gerekli." });
      return json(200, await generateListingPack({
        name,
        category: String(input.category || "ürün"),
        description: input.description ? String(input.description) : undefined,
        material,
        weightGrams: input.weightGrams ? Number(input.weightGrams) : undefined,
        priceTry: input.priceTry ? Number(input.priceTry) : undefined,
        stock: Math.max(0, Number(input.stock || 0)),
        readyToShip: Boolean(input.readyToShip),
        verifiedFacts: Array.isArray(input.verifiedFacts) ? input.verifiedFacts.map(String) : []
      }, env));
    }

    return json(404, { error: "Endpoint bulunamadı." });
  } catch (error) {
    console.error(error);
    const code = error instanceof Error ? error.message : "";
    if (code === "PAYLOAD_TOO_LARGE") return json(413, { error: "İstek çok büyük; PDF en fazla 20 MB, görseller sıkıştırılmış olmalıdır." });
    if (code === "AI_PROVIDER_NOT_CONFIGURED") return json(503, { error: "Gemini anahtarı henüz sunucuya eklenmedi." });
    if (code === "AI_FREE_QUOTA_EXCEEDED") return json(429, { error: "Ücretsiz Gemini kotası doldu. Kota yenilenince tekrar deneyin; ücretli işlem yapılmadı." });
    if (code === "AI_PROVIDER_REQUEST_FAILED") return json(502, { error: "Gemini geçici olarak yanıt vermedi. Bir süre sonra tekrar deneyin." });
    if (code === "INVALID_IMAGE_INPUT") return json(400, { error: "Görsel biçimi veya boyutu uygun değil." });
    if (code === "PATTERN_CRAFT_INVALID") return json(400, { error: "El işi türünü seçin." });
    if (code === "PRODUCT_TITLE_REQUIRED") return json(400, { error: "Ürün adı gerekli." });
    if (code === "PRINTABLE_KIND_INVALID") return json(400, { error: "PDF türünü seçin." });
    if (code === "PATTERN_KEYWORD_REQUIRED") return json(400, { error: "Desen için bir Etsy araması seçin." });
    if (code === "PATTERN_PRODUCT_REQUIRED") return json(400, { error: "Ürün türünü yazın (ör. doily, slippers)." });
    if (error instanceof DigitalDeliveryError) return json(error.status, { error: error.message });
    if (error instanceof PinterestError) return json(error.status, { error: error.message, code: error.code });
    if (error instanceof EtsyIntegrationError) {
      if (error.code === "NOT_CONFIGURED") return json(503, { error: "Etsy keystring ve shared secret henüz sunucuya eklenmedi." });
      if (error.code === "STORAGE_NOT_CONFIGURED") return json(503, { error: "Etsy güvenli token deposu henüz bağlanmadı." });
      if (error.code === "NOT_CONNECTED") return json(error.status === 409 ? 409 : 401, { error: error.status === 409 ? "Etsy mağazası henüz açılmadı." : "Etsy hesabı henüz bağlanmadı." });
      if (error.code === "AUTH_FAILED") return json(401, { error: error.message });
      if (error.code === "RATE_LIMITED") return json(429, { error: error.message });
      if (error.code === "VALIDATION_FAILED") return json(400, { error: error.message });
      if (error.code === "NOT_FOUND") return json(404, { error: error.message });
      return json(502, { error: "Etsy geçici olarak yanıt vermedi." });
    }
    if (error instanceof ShopierIntegrationError) {
      if (error.code === "NOT_CONFIGURED") return json(503, { error: "Shopier erişim anahtarı henüz sunucuya eklenmedi." });
      if (error.code === "AUTH_FAILED") return json(401, { error: "Shopier erişim anahtarı reddedildi." });
      if (error.code === "RATE_LIMITED") return json(429, { error: "Shopier istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin." });
      if (error.code === "VALIDATION_FAILED") return json(400, { error: error.message, field: error.upstreamCode });
      return json(502, { error: "Shopier geçici olarak yanıt vermedi." });
    }
    return json(500, { error: "Beklenmeyen sunucu hatası." });
  }
}

// Cron: Etsy trend otopilotu ve zamanı gelmiş Pinterest pini aynı tetiklemede çalışır.
export async function handleScheduled(env: Env) {
  const [autopilot, pinterest] = await Promise.all([
    runAutopilot(env, env.ETSY_OAUTH as unknown as TrendStore | undefined),
    processPinQueue(env, env.ETSY_OAUTH as unknown as PinterestStore | undefined).catch((error) => ({ error: error instanceof Error ? error.message : "Pinterest kuyruğu çalışmadı." }))
  ]);
  return { autopilot, pinterest };
}

export default {
  fetch: handleRequest,
  scheduled(_event: unknown, env: Env, context: { waitUntil(promise: Promise<unknown>): void }) {
    context.waitUntil(handleScheduled(env));
  }
};
