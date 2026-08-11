import OpenAI from "openai";
import { products } from "./data.js";
import { requestsOptOut, requiresHumanHandoff, validateDecision } from "./policy.js";
import type { AgentDecision, Lead, Product } from "./types.js";

function rankProducts(text: string, lead: Lead): Product[] {
  const terms = `${text} ${lead.interests.join(" ")}`.toLocaleLowerCase("tr-TR");
  return [...products]
    .filter((product) => product.stock > 0)
    .map((product) => ({
      product,
      score: product.tags.reduce((sum, tag) => sum + (terms.includes(tag.toLocaleLowerCase("tr-TR")) ? 3 : 0), 0)
        + (terms.includes(product.category.replace("_", " ")) ? 2 : 0)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ product }) => product);
}

function demoDecision(text: string, lead: Lead): AgentDecision {
  if (requestsOptOut(text)) {
    return { reply: "Talebiniz alındı; size tekrar mesaj gönderilmeyecek.", productIds: [], action: "block", reason: "İletişimden çıkma talebi." };
  }
  if (requiresHumanHandoff(text)) {
    return { reply: "Size doğru yardımcı olabilmem için görüşmeyi mağaza yetkilisine aktarıyorum.", productIds: [], action: "handoff", reason: "İnsan onayı gereken konu." };
  }

  const picks = rankProducts(text, lead);
  const first = picks[0];
  if (!first) return { reply: "Uygun ürünü kontrol edip size dönüş yapacağız.", productIds: [], action: "handoff", reason: "Uygun stok bulunamadı." };

  const link = first.letgoUrl ?? first.shopierUrl ?? "";
  const priceText = first.priceTry ? `fiyatı ${first.priceTry.toLocaleString("tr-TR")} TL` : "güncel fiyatı satış sayfasında";
  const stockText = first.stockVerified ? "şu an stokta" : "stok durumu sipariş öncesi doğrulanacaktır";
  return validateDecision({
    reply: `${first.name} için ${priceText}; ${stockText}. ${first.description} Fotoğrafını paylaşabilirim. İncelemek için: ${link}`,
    productIds: picks.map((product) => product.id),
    action: "reply",
    reason: "İlgi alanı, stok ve ürün etiketleri eşleşti."
  }, products);
}

export async function decideReply(text: string, lead: Lead): Promise<AgentDecision> {
  if (!process.env.OPENAI_API_KEY) return demoDecision(text, lead);
  if (requestsOptOut(text) || requiresHumanHandoff(text)) return demoDecision(text, lead);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const catalog = rankProducts(text, lead).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    priceTry: product.priceTry,
    stock: product.stock,
    stockVerified: product.stockVerified,
    weightGrams: product.weightGrams,
    material: product.material,
    shopierUrl: product.shopierUrl
  }));

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    store: false,
    input: [
      {
        role: "developer",
        content: "Türkçe konuşan bir mağaza satış asistanısın. Yalnızca verilen katalog bilgisini kullan. Fiyat, stok veya özellik uydurma. İndirim, iade, şikâyet, hukuki konu, çakı veya emin olmadığın durumda action=handoff seç. Kısa ve nazik ol."
      },
      {
        role: "user",
        content: `Müşteri: ${lead.displayName}\nİlgi alanları: ${lead.interests.join(", ")}\nMesaj: ${text}\nKatalog: ${JSON.stringify(catalog)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "sales_decision",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            reply: { type: "string" },
            productIds: { type: "array", items: { type: "string" } },
            action: { type: "string", enum: ["reply", "handoff", "block"] },
            reason: { type: "string" }
          },
          required: ["reply", "productIds", "action", "reason"]
        }
      }
    }
  });

  const decision = JSON.parse(response.output_text) as AgentDecision;
  return validateDecision(decision, products);
}
