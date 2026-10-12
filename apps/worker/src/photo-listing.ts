import type { RiskFlag } from "../../api/src/marketplace-policy.js";
import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import type { ProductKind } from "./product-studio.js";

// Fotoğraftan Etsy ilanı: satıcı Shopier'e ürün eklemeden telefonla çektiği fotoğrafları yükler.
// Model yalnız fotoğrafta görüneni söyler; malzeme, yaş ve damga gibi iddiaları satıcı onaylar.
export interface PhotoAnalysis {
  productKind: ProductKind;
  nameTr: string;
  productNounEn: string;
  craft: "crochet" | "knit" | "none";
  audience: "women" | "men" | "unisex" | "unknown";
  materialGuessTr: string;
  colors: string[];
  attributesEn: string[];
  conditionNotesEn: string[];
  questionsTr: string[];
  riskFlags: RiskFlag[];
  confidence: number;
}

export class PhotoListingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "PhotoListingError";
  }
}

export const MAX_ANALYSIS_IMAGES = 3;
// Telefon fotoğrafı analiz için 1024 piksele küçültür (~150 KB); sınır Worker'ın CPU ve istek boyutunu korur.
const MAX_ANALYSIS_IMAGE_CHARS = 2_000_000;
const KINDS: ProductKind[] = ["tesbih", "vintage", "knitwear", "other"];
const FLAGS: RiskFlag[] = ["weapon", "pocket_knife", "culinary_tool_knife", "tobacco", "alcohol", "medical_drug", "counterfeit", "explicit_adult", "food", "fossil", "live_animal", "childrens_product", "branded_product"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    productKind: { type: "string", enum: KINDS },
    nameTr: { type: "string" },
    productNounEn: { type: "string" },
    craft: { type: "string", enum: ["crochet", "knit", "none"] },
    audience: { type: "string", enum: ["women", "men", "unisex", "unknown"] },
    materialGuessTr: { type: "string" },
    colors: { type: "array", items: { type: "string" } },
    attributesEn: { type: "array", items: { type: "string" } },
    conditionNotesEn: { type: "array", items: { type: "string" } },
    questionsTr: { type: "array", items: { type: "string" } },
    riskFlags: { type: "array", items: { type: "string", enum: [...FLAGS, "none"] } },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["productKind", "nameTr", "productNounEn", "craft", "audience", "materialGuessTr", "colors", "attributesEn", "conditionNotesEn", "questionsTr", "riskFlags", "confidence"]
};

function validImage(value: string): boolean {
  // Tam regex yerine önek ve boyut: büyük base64 metninde regex Worker CPU süresini harcar.
  return /^data:image\/(jpeg|jpg|png|webp);base64,/.test(value.slice(0, 40)) && value.length <= MAX_ANALYSIS_IMAGE_CHARS;
}

function words(value: unknown, limit: number, max = 40): string[] {
  const list = (Array.isArray(value) ? value : []).map((item) => String(item).replace(/\s+/g, " ").trim()).filter((item) => item && item.length <= max);
  return [...new Set(list)].slice(0, limit);
}

function english(value: unknown, limit: number): string[] {
  const list = words(value, limit * 3, 24).map((item) => item.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim()).filter((item) => item.length >= 3);
  return [...new Set(list)].slice(0, limit);
}

export function sanitizePhotoAnalysis(raw: Partial<PhotoAnalysis>): PhotoAnalysis {
  const kind = KINDS.includes(raw.productKind as ProductKind) ? raw.productKind as ProductKind : "other";
  const noun = String(raw.productNounEn || "").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
  return {
    productKind: kind,
    nameTr: String(raw.nameTr || "").replace(/\s+/g, " ").trim().slice(0, 80),
    productNounEn: noun,
    craft: raw.craft === "crochet" || raw.craft === "knit" ? raw.craft : "none",
    audience: raw.audience === "women" || raw.audience === "men" || raw.audience === "unisex" ? raw.audience : "unknown",
    materialGuessTr: String(raw.materialGuessTr || "").replace(/\s+/g, " ").trim().slice(0, 60),
    colors: english(raw.colors, 3),
    attributesEn: english(raw.attributesEn, 4),
    conditionNotesEn: words(raw.conditionNotesEn, 4, 160),
    questionsTr: words(raw.questionsTr, 5, 200),
    riskFlags: (Array.isArray(raw.riskFlags) ? raw.riskFlags : []).filter((flag): flag is RiskFlag => FLAGS.includes(flag as RiskFlag)),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0))
  };
}

export async function analyzeListingPhotos(input: { imageDataUrls: unknown; kindHint?: unknown; nameHint?: unknown }, env: AiRuntimeEnv): Promise<PhotoAnalysis> {
  const images = (Array.isArray(input.imageDataUrls) ? input.imageDataUrls : []).map(String);
  if (!images.length) throw new PhotoListingError("En az bir ürün fotoğrafı gerekli.");
  if (images.length > MAX_ANALYSIS_IMAGES) throw new PhotoListingError(`Analiz için en fazla ${MAX_ANALYSIS_IMAGES} fotoğraf gönderilir.`);
  if (images.some((image) => !validImage(image))) throw new PhotoListingError("Fotoğraf okunamadı veya çok büyük. Uygulamayı güncelleyip tekrar deneyin.");
  if (!hasAiProvider(env)) {
    throw new PhotoListingError("Fotoğraf analizi için Cloudflare'de GEMINI_API_KEY tanımlı değil. Analiz olmadan da ürün türünü seçip adını yazarak devam edebilirsiniz.", 503);
  }
  const kindHint = KINDS.includes(String(input.kindHint) as ProductKind) ? String(input.kindHint) : "";
  const nameHint = String(input.nameHint || "").slice(0, 80);
  const raw = await generateStructuredObject<Partial<PhotoAnalysis>>({
    schemaName: "gxl_etsy_photo_listing",
    vision: true,
    imageDataUrls: images,
    schema: SCHEMA,
    prompt: [
      "You help a Turkish seller list a real item on Etsy for US buyers. Look only at these photos of ONE item.",
      kindHint || nameHint ? `Seller's note: ${JSON.stringify({ kind: kindHint || undefined, name: nameHint || undefined })}.` : "",
      "productKind: tesbih = prayer beads (tesbih, misbaha); vintage = an item that looks 20+ years old; knitwear = crocheted or knitted clothing, accessories or home textiles; otherwise other.",
      "nameTr: a short, plain Turkish name for the item (max 6 words). productNounEn: the plain English noun US Etsy buyers search for (max 3 words, e.g. crochet cardigan, prayer beads, copper tray).",
      "craft: crochet if you see crochet stitches, knit if knitted, else none. audience: who the cut is for, unknown if not clothing.",
      "materialGuessTr: the material in Turkish ONLY if it is clearly visible, else an empty string. Never claim silver, gold, a hallmark, a brand or an age you cannot read in the photo.",
      "colors: up to 3 plain English colour words buyers use (cream, sage green, burgundy). attributesEn: up to 4 visible design details in English (oversized, cable knit, granny square, tassel, filigree, hand engraved).",
      "conditionNotesEn: visible wear, stains, chips or repairs, in short neutral English sentences; empty if none visible.",
      "questionsTr: up to 5 short Turkish questions the seller must answer before listing (e.g. damga var mı, yaklaşık yaşı, beden ve ölçüler, iplik içeriği).",
      "riskFlags: only if clearly visible: childrens_product for items made for babies or kids, branded_product for a visible brand logo, the others only for prohibited items. Otherwise [\"none\"]."
    ].filter(Boolean).join("\n")
  }, env);
  return sanitizePhotoAnalysis(raw);
}
