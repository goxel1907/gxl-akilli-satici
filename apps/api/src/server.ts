import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { decideReply } from "./agent.js";
import { connectors } from "./connectors.js";
import { db, createApproval, createMessage, findLead, findProducts } from "./store.js";
import { canAutoReply, canStartConversation } from "./policy.js";
import { generateListingPack } from "./listing-agent.js";
import { rankMarketOpportunities, type MarketSignal } from "./market-advisor.js";
import { analyzeProductImages } from "./product-analyzer.js";
import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "./marketplace-policy.js";
import { scoreProspect, type ProspectSignal } from "./prospecting.js";
import type { Channel } from "./types.js";

const port = Number(process.env.PORT || 8787);

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 12_000_000) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function dashboard() {
  return {
    metrics: {
      activeLeads: db.leads.filter((lead) => lead.stage === "active").length,
      pendingApprovals: db.approvals.filter((approval) => approval.status === "pending").length,
      catalogProducts: db.products.length,
      conversations: new Set(db.messages.map((message) => message.leadId)).size
    },
    leads: db.leads,
    approvals: db.approvals,
    products: db.products,
    messages: db.messages.slice(-20)
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 204, {});
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "akilli-satici" });
    if (req.method === "GET" && url.pathname === "/api/dashboard") return json(res, 200, dashboard());
    if (req.method === "GET" && url.pathname === "/api/products") return json(res, 200, db.products);
    if (req.method === "GET" && url.pathname === "/api/leads") return json(res, 200, db.leads);
    if (req.method === "GET" && url.pathname === "/api/approvals") return json(res, 200, db.approvals);

    if (req.method === "POST" && url.pathname === "/api/products/analyze-images") {
      const input = await body(req);
      const imageDataUrls = Array.isArray(input.imageDataUrls) ? input.imageDataUrls.map(String) : [];
      if (!imageDataUrls.length) return json(res, 400, { error: "En az bir ürün fotoğrafı gerekli." });
      const sellerFacts = input.sellerFacts && typeof input.sellerFacts === "object" ? input.sellerFacts as Record<string, unknown> : {};
      const analysis = await analyzeProductImages({
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
      });
      return json(res, 200, analysis);
    }

    if (req.method === "POST" && url.pathname === "/api/products/policy-check") {
      const input = await body(req);
      const policies = evaluateMarketplacePolicies({
        origin: String(input.origin || "unknown") as ProductOrigin,
        yearMade: input.yearMade ? Number(input.yearMade) : undefined,
        authenticityVerified: Boolean(input.authenticityVerified),
        riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String) as RiskFlag[] : ["none"]
      });
      return json(res, 200, { policies });
    }

    if (req.method === "POST" && url.pathname === "/api/prospects/score") {
      const input = await body(req);
      const signals = Array.isArray(input.signals) ? input.signals as ProspectSignal[] : [];
      if (!signals.length) return json(res, 400, { error: "Gerçek etkileşim sinyali gerekli." });
      return json(res, 200, scoreProspect(signals, Array.isArray(input.catalogTags) ? input.catalogTags.map(String) : []));
    }

    if (req.method === "POST" && url.pathname === "/api/listings/generate") {
      const input = await body(req);
      const name = String(input.name || "").trim();
      const material = String(input.material || "").trim();
      if (!name || !material) return json(res, 400, { error: "Ürün adı ve doğrulanmış malzeme bilgisi gerekli." });
      const pack = await generateListingPack({
        name,
        category: String(input.category || "ürün"),
        description: input.description ? String(input.description) : undefined,
        material,
        weightGrams: input.weightGrams ? Number(input.weightGrams) : undefined,
        priceTry: input.priceTry ? Number(input.priceTry) : undefined,
        stock: Math.max(0, Number(input.stock || 0)),
        readyToShip: Boolean(input.readyToShip),
        verifiedFacts: Array.isArray(input.verifiedFacts) ? input.verifiedFacts.map(String) : []
      });
      return json(res, 200, pack);
    }

    if (req.method === "POST" && url.pathname === "/api/market-opportunities") {
      const input = await body(req);
      const signals = Array.isArray(input.signals) ? input.signals as MarketSignal[] : [];
      if (!signals.length) return json(res, 400, { error: "Tarih ve kaynak bağlantısı içeren güncel pazar sinyalleri gerekli; ajan veri olmadan çok satan iddiası üretmez." });
      return json(res, 200, { opportunities: rankMarketOpportunities(signals) });
    }

    if (req.method === "POST" && url.pathname === "/api/approvals") {
      const input = await body(req);
      const lead = findLead(String(input.leadId || ""));
      if (!lead) return json(res, 404, { error: "Müşteri adayı bulunamadı." });
      if (!canStartConversation(lead)) return json(res, 409, { error: "İzin/engelleme kuralı nedeniyle ilk temas oluşturulamaz." });
      const approval = createApproval({
        leadId: lead.id,
        channel: lead.channel,
        draft: String(input.draft || "Merhaba, ilginize uygun ürünlerimizi paylaşmak isteriz."),
        productIds: Array.isArray(input.productIds) ? input.productIds.map(String) : []
      });
      return json(res, 201, approval);
    }

    const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
    if (req.method === "POST" && approvalMatch) {
      const approval = db.approvals.find((item) => item.id === approvalMatch[1]);
      if (!approval) return json(res, 404, { error: "Onay kaydı bulunamadı." });
      if (approval.status !== "pending") return json(res, 409, { error: "Bu kayıt daha önce sonuçlandırıldı." });
      const lead = findLead(approval.leadId);
      if (!lead) return json(res, 404, { error: "Müşteri adayı bulunamadı." });
      approval.status = approvalMatch[2] === "approve" ? "approved" : "rejected";
      approval.decidedAt = new Date().toISOString();
      if (approval.status === "rejected") return json(res, 200, approval);

      lead.stage = "active";
      lead.autoReplyAllowed = true;
      const products = findProducts(approval.productIds);
      const message = createMessage({
        leadId: lead.id,
        channel: lead.channel,
        direction: "outbound",
        text: approval.draft,
        mediaUrls: products.flatMap((product) => product.imageUrls.slice(0, 1)),
        automated: false
      });
      const delivery = await connectors[lead.channel].send(message);
      return json(res, 200, { approval, message, delivery });
    }

    if (req.method === "POST" && url.pathname === "/api/messages/inbound") {
      const input = await body(req);
      const lead = findLead(String(input.leadId || ""));
      if (!lead) return json(res, 404, { error: "Müşteri adayı bulunamadı." });
      const text = String(input.text || "").trim();
      if (!text) return json(res, 400, { error: "Mesaj metni gerekli." });
      createMessage({ leadId: lead.id, channel: lead.channel, direction: "inbound", text, mediaUrls: [], automated: false });
      lead.lastInboundAt = new Date().toISOString();

      if (!canAutoReply(lead)) return json(res, 202, { queuedForHuman: true, reason: "Otomatik yanıt izni veya ilk temas onayı yok." });
      const decision = await decideReply(text, lead);
      if (decision.action === "block") {
        lead.stage = "blocked";
        lead.autoReplyAllowed = false;
      }
      if (decision.action === "handoff") return json(res, 202, { decision, queuedForHuman: true });

      const reply = createMessage({
        leadId: lead.id,
        channel: lead.channel,
        direction: "outbound",
        text: decision.reply,
        mediaUrls: findProducts(decision.productIds).flatMap((product) => product.imageUrls.slice(0, 1)),
        automated: true
      });
      const delivery = await connectors[lead.channel].send(reply);
      return json(res, 200, { decision, reply, delivery });
    }

    if (req.method === "GET" && url.pathname === "/webhooks/meta") {
      const verifyToken = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (verifyToken && verifyToken === process.env.META_VERIFY_TOKEN) {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end(challenge || "");
      }
      return json(res, 403, { error: "Webhook doğrulaması başarısız." });
    }

    if (req.method === "POST" && ["/webhooks/meta", "/webhooks/shopier"].includes(url.pathname)) {
      const payload = await body(req);
      // Üretimde imza doğrulaması zorunludur. Ham gövde saklanmaz; olaya dönüştürülür.
      return json(res, 202, { accepted: true, kind: url.pathname.split("/").pop(), receivedKeys: Object.keys(payload) });
    }

    if (req.method === "POST" && url.pathname === "/api/manual/letgo-link") {
      const input = await body(req);
      const lead = findLead(String(input.leadId || ""));
      if (!lead || lead.channel !== "letgo") return json(res, 404, { error: "Letgo müşterisi bulunamadı." });
      return json(res, 200, { mode: "manual_handoff", profileUrl: process.env.LETGO_PROFILE_URL || "https://www.letgo.com/", note: "Görüşmeye Letgo uygulamasında devam edin." });
    }

    return json(res, 404, { error: "Endpoint bulunamadı." });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") return json(res, 413, { error: "Fotoğraf isteği çok büyük; en fazla 4 sıkıştırılmış görsel gönderin." });
    if (error instanceof Error && error.message === "OPENAI_API_KEY_NOT_CONFIGURED") return json(res, 503, { error: "Görsel analiz servisi henüz yapılandırılmadı." });
    if (error instanceof Error && error.message === "INVALID_IMAGE_INPUT") return json(res, 400, { error: "Görsel biçimi veya boyutu uygun değil." });
    return json(res, 500, { error: "Beklenmeyen sunucu hatası." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Akıllı Satıcı API http://localhost:${port} adresinde çalışıyor.`);
});
