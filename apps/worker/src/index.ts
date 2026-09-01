import { approvals, leads, messages, products } from "../../api/src/data.js";
import { generateListingPack } from "../../api/src/listing-agent.js";
import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "../../api/src/marketplace-policy.js";
import { buildOpportunityCenter, replyToAgent, type OpportunityContext } from "../../api/src/opportunity-agent.js";
import { canStartConversation } from "../../api/src/policy.js";
import { analyzeProductImages } from "../../api/src/product-analyzer.js";
import { scoreProspect, type ProspectSignal } from "../../api/src/prospecting.js";
import type { AiRuntimeEnv } from "../../api/src/structured-ai.js";
import type { Channel, Lead } from "../../api/src/types.js";
import { getShopierSnapshot, listRedactedShopierOrders, listShopierProducts, ShopierIntegrationError, type ShopierRuntimeEnv } from "./shopier.js";
import { createEtsyConnectSession, EtsyIntegrationError, getEtsyStatus, handleEtsyCallback, type EtsyRuntimeEnv } from "./etsy.js";

interface Env extends AiRuntimeEnv, ShopierRuntimeEnv, EtsyRuntimeEnv {
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
        etsy: env.ETSY_API_KEY && env.ETSY_SHARED_SECRET ? "configured" : "not_configured"
      });
    }
    if (request.method === "GET" && url.pathname === "/etsy/oauth/callback") return await handleEtsyCallback(request, env);
    if (url.pathname.startsWith("/api/") && !authorized(request, env)) return json(401, { error: "Uygulama erişim anahtarı geçersiz." });

    if (request.method === "GET" && url.pathname === "/api/channels/status") {
      let shopier: unknown;
      try {
        shopier = await getShopierSnapshot(env);
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
    if (code === "PAYLOAD_TOO_LARGE") return json(413, { error: "Fotoğraf isteği çok büyük; en fazla 4 sıkıştırılmış görsel gönderin." });
    if (code === "AI_PROVIDER_NOT_CONFIGURED") return json(503, { error: "Gemini anahtarı henüz sunucuya eklenmedi." });
    if (code === "AI_FREE_QUOTA_EXCEEDED") return json(429, { error: "Ücretsiz Gemini kotası doldu. Kota yenilenince tekrar deneyin; ücretli işlem yapılmadı." });
    if (code === "AI_PROVIDER_REQUEST_FAILED") return json(502, { error: "Gemini geçici olarak yanıt vermedi. Bir süre sonra tekrar deneyin." });
    if (code === "INVALID_IMAGE_INPUT") return json(400, { error: "Görsel biçimi veya boyutu uygun değil." });
    if (error instanceof EtsyIntegrationError) {
      if (error.code === "NOT_CONFIGURED") return json(503, { error: "Etsy keystring ve shared secret henüz sunucuya eklenmedi." });
      if (error.code === "STORAGE_NOT_CONFIGURED") return json(503, { error: "Etsy güvenli token deposu henüz bağlanmadı." });
      if (error.code === "NOT_CONNECTED") return json(401, { error: "Etsy hesabı henüz bağlanmadı." });
      if (error.code === "AUTH_FAILED") return json(401, { error: error.message });
      return json(502, { error: "Etsy geçici olarak yanıt vermedi." });
    }
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
