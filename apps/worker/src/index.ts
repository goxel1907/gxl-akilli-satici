import { approvals, leads, messages, products } from "../../api/src/data.js";
import { generateListingPack } from "../../api/src/listing-agent.js";
import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "../../api/src/marketplace-policy.js";
import { analyzeProductImages } from "../../api/src/product-analyzer.js";
import { scoreProspect, type ProspectSignal } from "../../api/src/prospecting.js";
import type { AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { getShopierSnapshot, listRedactedShopierOrders, listShopierProducts, ShopierIntegrationError, type ShopierRuntimeEnv } from "./shopier.js";

interface Env extends AiRuntimeEnv, ShopierRuntimeEnv {
  APP_ACCESS_TOKEN?: string;
}

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS"
};

function json(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: corsHeaders });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12_000_000) throw new Error("PAYLOAD_TOO_LARGE");
  return await request.json() as Record<string, unknown>;
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

function authorized(request: Request, env: Env): boolean {
  if (!env.APP_ACCESS_TOKEN) return true;
  return request.headers.get("authorization") === `Bearer ${env.APP_ACCESS_TOKEN}`;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try {
    if (request.method === "OPTIONS") return json(204, {});
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true, service: "gxl-akilli-satici", ai: env.GEMINI_API_KEY ? "gemini" : env.OPENAI_API_KEY ? "openai" : "not_configured", shopier: env.SHOPIER_ACCESS_TOKEN ? "configured" : "not_configured" });
    }
    if (url.pathname.startsWith("/api/") && !authorized(request, env)) return json(401, { error: "Uygulama erişim anahtarı geçersiz." });

    if (request.method === "GET" && url.pathname === "/api/channels/status") {
      try {
        return json(200, { shopier: await getShopierSnapshot(env) });
      } catch (error) {
        const code = error instanceof ShopierIntegrationError ? error.code : "UPSTREAM_FAILED";
        const messages: Record<string, string> = {
          AUTH_FAILED: "Shopier erişim anahtarı reddedildi. Cloudflare secret değerini yenileyin.",
          RATE_LIMITED: "Shopier istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.",
          UPSTREAM_FAILED: "Shopier geçici olarak yanıt vermedi."
        };
        return json(200, {
          shopier: {
            configured: Boolean(env.SHOPIER_ACCESS_TOKEN),
            connected: false,
            error: code,
            upstreamStatus: error instanceof ShopierIntegrationError ? error.status : undefined,
            failedEndpoint: error instanceof ShopierIntegrationError ? error.endpoint : undefined,
            message: messages[code] || messages.UPSTREAM_FAILED
          }
        });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/shopier/products") {
      return json(200, { products: await listShopierProducts(env) });
    }
    if (request.method === "GET" && url.pathname === "/api/shopier/orders") {
      if (!env.APP_ACCESS_TOKEN) return json(503, { error: "Sipariş özeti için uygulama erişim anahtarı yapılandırılmalıdır." });
      return json(200, { orders: await listRedactedShopierOrders(env), privacy: "Müşteri adı, telefon, e-posta ve adres bilgileri bu yanıtta bulunmaz." });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard") return json(200, dashboard());
    if (request.method === "GET" && url.pathname === "/api/products") return json(200, products);
    if (request.method === "GET" && url.pathname === "/api/leads") return json(200, leads);
    if (request.method === "GET" && url.pathname === "/api/approvals") return json(200, approvals);

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
    if (code === "PAYLOAD_TOO_LARGE") return json(413, { error: "Fotoğraf isteği çok büyük; en fazla 4 sıkıştırılmış görsel gönderin." });
    if (code === "AI_PROVIDER_NOT_CONFIGURED") return json(503, { error: "Gemini anahtarı henüz sunucuya eklenmedi." });
    if (code === "AI_FREE_QUOTA_EXCEEDED") return json(429, { error: "Ücretsiz Gemini kotası doldu. Kota yenilenince tekrar deneyin; ücretli işlem yapılmadı." });
    if (code === "AI_PROVIDER_REQUEST_FAILED") return json(502, { error: "Gemini geçici olarak yanıt vermedi. Bir süre sonra tekrar deneyin." });
    if (code === "INVALID_IMAGE_INPUT") return json(400, { error: "Görsel biçimi veya boyutu uygun değil." });
    if (error instanceof ShopierIntegrationError) {
      if (error.code === "NOT_CONFIGURED") return json(503, { error: "Shopier erişim anahtarı henüz sunucuya eklenmedi." });
      if (error.code === "AUTH_FAILED") return json(401, { error: "Shopier erişim anahtarı reddedildi." });
      if (error.code === "RATE_LIMITED") return json(429, { error: "Shopier istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin." });
      return json(502, { error: "Shopier geçici olarak yanıt vermedi." });
    }
    return json(500, { error: "Beklenmeyen sunucu hatası." });
  }
}

export default { fetch: handleRequest };
