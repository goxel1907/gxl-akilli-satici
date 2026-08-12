import OpenAI from "openai";
import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "./marketplace-policy.js";

export interface ProductAnalysisInput {
  imageDataUrls: string[];
  sellerFacts?: {
    name?: string;
    category?: string;
    description?: string;
    material?: string;
    origin?: ProductOrigin;
    yearMade?: number;
    authenticityVerified?: boolean;
  };
}

export interface ProductAnalysisResult {
  product: {
    confidence: number;
    genericNameTr: string;
    categoryTr: string;
    suspectedBrand: string;
    detectedText: string[];
    observedFacts: Array<{ label: string; value: string; confidence: number }>;
    conditionNotes: string[];
  };
  riskFlags: RiskFlag[];
  unverifiedClaims: string[];
  questions: string[];
  listings: {
    etsy: { language: "en"; title: string; description: string; tags: string[]; categorySuggestion: string };
    shopier: { language: "tr"; title: string; description: string; tags: string[]; categorySuggestion: string };
    letgo: { language: "tr"; title: string; description: string; tags: string[]; categorySuggestion: string };
  };
  policies: ReturnType<typeof evaluateMarketplacePolicies>;
  taxonomyNotice: string;
}

function validImageDataUrl(value: string): boolean {
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= 8_000_000;
}

export async function analyzeProductImages(input: ProductAnalysisInput): Promise<ProductAnalysisResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  if (!input.imageDataUrls.length || input.imageDataUrls.length > 4 || input.imageDataUrls.some((image) => !validImageDataUrl(image))) {
    throw new Error("INVALID_IMAGE_INPUT");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sellerFacts = input.sellerFacts || {};
  const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-5.6",
    store: false,
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: `GXL çok kategorili mağazası için bu gerçek ürün fotoğraflarını incele. Satıcının beyanları: ${JSON.stringify(sellerFacts)}.\n\nGörselden kesin görülemeyen marka, model, üretim yılı, orijinallik, ayar, el yapımı oluş, malzeme ve güvenlik iddialarını gerçekmiş gibi yazma. Bunları unverifiedClaims ve questions alanlarına koy. genericNameTr ve categoryTr sadece güvenli, genel ürün tanımı olsun. Her platform için farklı, doğal ilan metni hazırla. Etsy metni İngilizce ve tam 13 etiketten oluşsun; Shopier ve Letgo Türkçe olsun. Yasaklı/riskli olabilecek sinyalleri riskFlags ile işaretle. Kategori önerileri canlı platform kategori kimliği değildir.`
        },
        ...input.imageDataUrls.map((image_url) => ({ type: "input_image" as const, image_url, detail: "high" as const }))
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "gxl_product_image_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            product: {
              type: "object", additionalProperties: false,
              properties: {
                confidence: { type: "number", minimum: 0, maximum: 1 }, genericNameTr: { type: "string" }, categoryTr: { type: "string" }, suspectedBrand: { type: "string" },
                detectedText: { type: "array", items: { type: "string" } },
                observedFacts: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: { type: "string" }, value: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["label", "value", "confidence"] } },
                conditionNotes: { type: "array", items: { type: "string" } }
              },
              required: ["confidence", "genericNameTr", "categoryTr", "suspectedBrand", "detectedText", "observedFacts", "conditionNotes"]
            },
            riskFlags: { type: "array", items: { type: "string", enum: ["weapon", "pocket_knife", "culinary_tool_knife", "firearm", "ammunition", "explosive", "illegal_drug", "tobacco", "alcohol", "medical_drug", "counterfeit", "stolen", "official_document", "live_animal", "human_remains", "recalled_product", "explicit_adult", "food", "fossil", "service", "childrens_product", "branded_product", "precious_material_claim", "none"] } },
            unverifiedClaims: { type: "array", items: { type: "string" } },
            questions: { type: "array", items: { type: "string" } },
            listings: {
              type: "object", additionalProperties: false,
              properties: {
                etsy: { type: "object", additionalProperties: false, properties: { language: { type: "string", enum: ["en"] }, title: { type: "string" }, description: { type: "string" }, tags: { type: "array", minItems: 13, maxItems: 13, items: { type: "string" } }, categorySuggestion: { type: "string" } }, required: ["language", "title", "description", "tags", "categorySuggestion"] },
                shopier: { type: "object", additionalProperties: false, properties: { language: { type: "string", enum: ["tr"] }, title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, categorySuggestion: { type: "string" } }, required: ["language", "title", "description", "tags", "categorySuggestion"] },
                letgo: { type: "object", additionalProperties: false, properties: { language: { type: "string", enum: ["tr"] }, title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } }, categorySuggestion: { type: "string" } }, required: ["language", "title", "description", "tags", "categorySuggestion"] }
              },
              required: ["etsy", "shopier", "letgo"]
            }
          },
          required: ["product", "riskFlags", "unverifiedClaims", "questions", "listings"]
        }
      }
    }
  });

  if (!response.output_text) throw new Error("EMPTY_ANALYSIS");
  const analysis = JSON.parse(response.output_text) as Omit<ProductAnalysisResult, "policies" | "taxonomyNotice">;
  const policies = evaluateMarketplacePolicies({
    origin: sellerFacts.origin || "unknown",
    yearMade: sellerFacts.yearMade,
    authenticityVerified: Boolean(sellerFacts.authenticityVerified),
    riskFlags: analysis.riskFlags.length ? analysis.riskFlags : ["none"]
  });
  return {
    ...analysis,
    policies,
    taxonomyNotice: "Kategori önerileri taslaktır. Yayın öncesinde bağlı platformun canlı kategori ağacından gerçek kategori/kimlik doğrulanmalıdır."
  };
}
