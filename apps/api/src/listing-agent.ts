import type { MarketplaceListingPack } from "./types.js";
import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "./structured-ai.js";

export interface ListingInput {
  name: string;
  category: string;
  description?: string;
  material: string;
  weightGrams?: number;
  priceTry?: number;
  stock: number;
  readyToShip: boolean;
  verifiedFacts: string[];
}

function fallback(input: ListingInput): MarketplaceListingPack {
  const weight = input.weightGrams ? `${input.weightGrams}g ` : "";
  const isSilver = input.material.toLocaleLowerCase("tr-TR").includes("925");
  const isTesbih = /tesbih|tasbih|misbaha/i.test(`${input.name} ${input.category}`);
  const materialEn = isSilver ? "925 Sterling Silver" : input.material;
  const productEn = isTesbih ? "Prayer Beads" : input.category;
  const tags = isTesbih
    ? ["prayer beads", "tesbih beads", "misbaha gift", "muslim gift", "dhikr beads", "turkish tesbih", "islamic gift", "mens gift", "collectors beads", "artisan beads", materialEn.toLowerCase(), "unique keepsake", "gxl collection"]
    : [productEn, materialEn, `handmade ${productEn}`, `unique ${productEn}`, `gift for collectors`, "artisan gift", "thoughtful gift", "small business gift", "limited stock", "gift idea", "gxl collection", "quality material", "collectible item"].map((tag) => tag.toLowerCase());
  return {
    etsy: {
      language: "en",
      title: `${materialEn} ${weight}${productEn}, Unique GXL Gift`.trim(),
      description: `${productEn} by GXL. ${input.description || input.name}\n\nVerified details:\n- Material: ${input.material}\n${input.weightGrams ? `- Weight: ${input.weightGrams} g\n` : ""}- Stock: ${input.stock}\n\nPlease review the photos and contact us before ordering if you need an additional measurement or detail.`,
      tags,
      materials: [materialEn]
    },
    turkey: {
      title: `${input.name}${input.weightGrams ? ` · ${input.weightGrams} g` : ""}`,
      description: `${input.description || input.name}\n\nMalzeme: ${input.material}${input.weightGrams ? `\nAğırlık: ${input.weightGrams} g` : ""}\nStok: ${input.stock}\nFotoğraflardaki ürün gönderilir. Sipariş öncesi ölçü ve stok teyidi yapılır.`,
      tags: [input.category, input.material, "koleksiyon", "hediyelik", "özel ürün", "GXL"]
    },
    shipping: {
      processingMinBusinessDays: input.readyToShip ? 1 : 2,
      processingMaxBusinessDays: input.readyToShip ? 1 : 5,
      destinations: [
        { region: "US", minTransitBusinessDays: 2, maxTransitBusinessDays: 5, note: "Yalnızca doğrulanmış ekspres taşıyıcı seçilirse kullanın." },
        { region: "EU", minTransitBusinessDays: 2, maxTransitBusinessDays: 7, note: "Ülke ve gümrüğe göre doğrulayın." },
        { region: "TR", minTransitBusinessDays: 1, maxTransitBusinessDays: 3, note: "Yurtiçi taşıyıcıya göre doğrulayın." },
        { region: "WORLD", minTransitBusinessDays: 5, maxTransitBusinessDays: 15, note: "Ülke ve gümrüğe göre doğrulayın." }
      ]
    },
    warnings: ["Taşıyıcı sözleşmesi ve gerçek transit süreleri doğrulanmadan ilanı yayınlamayın."]
  };
}

export async function generateListingPack(input: ListingInput, env?: AiRuntimeEnv): Promise<MarketplaceListingPack> {
  if (!hasAiProvider(env)) return fallback(input);
  return generateStructuredObject<MarketplaceListingPack>({
    prompt: `GXL için ürün kategorisinden bağımsız çok kanallı e-ticaret ilan uzmanısın. Ürünü gümüş, tesbih veya takı varsayma. Etsy metni doğal Amerikan İngilizcesi, Shopier ve Letgo metni Türkçe olmalı. Önce ürünün Etsy yaratıcılık ve yasaklı ürün kurallarına uygunluğunun ayrıca doğrulanması gerektiğini düşün. Yalnızca doğrulanmış gerçekleri kullan; fiyat, gram, el işçiliği, kargo, üretim yeri veya garanti uydurma. Etsy için 13 doğal çok kelimeli etiket üret, tekrar ve keyword stuffing yapma. Teslimat sürelerini vaat olarak değil taşıyıcı doğrulaması gereken profil olarak sun. Hazır stok değilse 1 gün hazırlama yazma. Çıktı belirtilen JSON şemasına uymalı.\n\nÜrün: ${JSON.stringify(input)}`,
    schemaName: "marketplace_listing_pack",
    schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            etsy: {
              type: "object", additionalProperties: false,
              properties: { language: { type: "string", enum: ["en"] }, title: { type: "string" }, description: { type: "string" }, tags: { type: "array", minItems: 13, maxItems: 13, items: { type: "string" } }, materials: { type: "array", items: { type: "string" } } },
              required: ["language", "title", "description", "tags", "materials"]
            },
            turkey: {
              type: "object", additionalProperties: false,
              properties: { title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
              required: ["title", "description", "tags"]
            },
            shipping: {
              type: "object", additionalProperties: false,
              properties: {
                processingMinBusinessDays: { type: "integer" }, processingMaxBusinessDays: { type: "integer" },
                destinations: { type: "array", items: { type: "object", additionalProperties: false, properties: { region: { type: "string", enum: ["US", "EU", "TR", "WORLD"] }, minTransitBusinessDays: { type: "integer" }, maxTransitBusinessDays: { type: "integer" }, note: { type: "string" } }, required: ["region", "minTransitBusinessDays", "maxTransitBusinessDays", "note"] } }
              }, required: ["processingMinBusinessDays", "processingMaxBusinessDays", "destinations"]
            },
            warnings: { type: "array", items: { type: "string" } }
          },
          required: ["etsy", "turkey", "shipping", "warnings"]
        }
  }, env);
}
