import { evaluateMarketplacePolicies, type ProductOrigin, type RiskFlag } from "../../api/src/marketplace-policy.js";
import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";
import type { TrendResult } from "./etsy-trends.js";
import { normalizeEtsyTags, normalizeEtsyTitle, validateEtsyListingText } from "./pattern-studio.js";

type Fetcher = typeof fetch;

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ProductPlanInput {
  sourceId?: string;
  titleTr: string;
  descriptionTr?: string;
  categoryHint?: string;
  productNounEn?: string;
  material?: string;
  materialVerified: boolean;
  weightGrams?: number;
  beadCount?: number;
  lengthCm?: number;
  origin: ProductOrigin;
  yearMade?: number;
  priceTry?: number;
  shippingTry?: number;
  usdTryRate?: number;
  readyToShip: boolean;
  quantity: number;
  imageUrls: string[];
  keywords: string[];
}

interface MaterialInfo { en: string; short: string; precious: boolean }

export interface ProductSignals {
  isTesbih: boolean;
  isVintage: boolean;
  material?: MaterialInfo;
  noun: string;
  attributes: string[];
}

export interface EtsyEligibility {
  status: "allowed" | "review" | "blocked";
  whoMade?: "i_did" | "someone_else";
  whenMade?: string;
  isSupply: boolean;
  needsProductionPartner: boolean;
  reasons: string[];
  requiredEvidence: string[];
}

export interface ProductPricing {
  usdTryRate: number;
  priceTry: number;
  targetNetUsd: number;
  shippingUsd: number;
  feePercent: number;
  fixedFeesUsd: number;
  breakEvenUsd: number;
  recommendedUsd: number;
  recommendedTry: number;
  medianUsd?: number;
  positioning: "below" | "aligned" | "above" | "unknown";
  netAtRecommendedTry: number;
  note: string;
}

export interface ProductPlan {
  primaryKeyword: string;
  keywordScores: Array<{ keyword: string; score?: number; verdict?: string; activeListings?: number; medianPriceUsd?: number }>;
  title: string;
  tags: string[];
  description: string;
  materials: string[];
  pricing?: ProductPricing;
  eligibility: EtsyEligibility;
  competitors: TrendResult["examples"];
  checks: ReturnType<typeof validateEtsyListingText>;
  warnings: string[];
}

// Etsy'nin Türkiye satıcıları için ücretleri; resmî ücret sayfasından periyodik olarak doğrulanmalıdır.
export const ETSY_TR_FEES = {
  transactionRate: 0.065,
  processingRate: 0.065,
  processingFixedTry: 14,
  regulatoryRate: 0.0227,
  listingFeeUsd: 0.2,
  conversionRate: 0.025
};

const MATERIALS: Array<{ stems: string[]; info: MaterialInfo }> = [
  { stems: ["925", "gümüş", "gumus", "silver"], info: { en: "sterling silver", short: "silver", precious: true } },
  { stems: ["altın", "altin", "gold"], info: { en: "gold", short: "gold", precious: true } },
  { stems: ["kehribar", "amber"], info: { en: "amber", short: "amber", precious: false } },
  { stems: ["oltu"], info: { en: "oltu stone", short: "oltu stone", precious: false } },
  { stems: ["galalit", "galalith"], info: { en: "galalith", short: "galalith", precious: false } },
  { stems: ["kuka"], info: { en: "kuka wood", short: "kuka wood", precious: false } },
  { stems: ["sedef"], info: { en: "mother of pearl", short: "mother of pearl", precious: false } },
  { stems: ["akik", "agate"], info: { en: "agate", short: "agate", precious: false } },
  { stems: ["oniks", "onyx"], info: { en: "onyx", short: "onyx", precious: false } },
  { stems: ["obsidyen", "obsidian"], info: { en: "obsidian", short: "obsidian", precious: false } },
  { stems: ["abanoz", "ebony"], info: { en: "ebony wood", short: "ebony", precious: false } },
  { stems: ["bakır", "bakir", "copper"], info: { en: "copper", short: "copper", precious: false } },
  { stems: ["pirinç", "pirinc", "brass"], info: { en: "brass", short: "brass", precious: false } },
  { stems: ["yün", "yun", "wool"], info: { en: "wool", short: "wool", precious: false } },
  { stems: ["ipek", "silk"], info: { en: "silk", short: "silk", precious: false } },
  { stems: ["deri", "leather"], info: { en: "leather", short: "leather", precious: false } }
];

const NOUNS: Array<{ stems: string[]; en: string }> = [
  { stems: ["tesbih", "tespih", "tesbıh", "misbaha", "tasbih"], en: "prayer beads" },
  { stems: ["broş", "bros", "brooch"], en: "brooch" },
  { stems: ["yüzük", "yuzuk", "ring"], en: "ring" },
  { stems: ["kolye", "necklace"], en: "necklace" },
  { stems: ["bilezik", "bileklik", "bracelet"], en: "bracelet" },
  { stems: ["küpe", "kupe", "earring"], en: "earrings" },
  { stems: ["halı", "hali", "rug"], en: "rug" },
  { stems: ["kilim"], en: "kilim" },
  { stems: ["yastık", "yastik", "pillow"], en: "pillow cover" },
  { stems: ["tepsi", "tray"], en: "tray" },
  { stems: ["cezve"], en: "turkish coffee pot" },
  { stems: ["semaver", "samovar"], en: "samovar" },
  { stems: ["çaydanlık", "caydanlik", "teapot"], en: "teapot" },
  { stems: ["ibrik", "ewer"], en: "ewer" },
  { stems: ["sürahi", "surahi", "pitcher"], en: "pitcher" },
  { stems: ["vazo", "vase"], en: "vase" },
  { stems: ["kase", "bowl"], en: "bowl" },
  { stems: ["tabak", "plate"], en: "plate" },
  { stems: ["fincan", "cup"], en: "coffee cup" },
  { stems: ["şamdan", "samdan", "candle"], en: "candle holder" },
  { stems: ["kandil", "lantern"], en: "lantern" },
  { stems: ["kutu", "box"], en: "box" },
  { stems: ["ayna", "mirror"], en: "mirror" },
  { stems: ["lamba", "lamp"], en: "lamp" },
  { stems: ["çanta", "canta", "bag"], en: "bag" },
  { stems: ["şal", "shawl"], en: "shawl" },
  { stems: ["saat", "watch"], en: "watch" }
];

const ATTRIBUTES: Array<{ stems: string[]; en: string }> = [
  { stems: ["kafes", "kafesli"], en: "cage" },
  { stems: ["telkari"], en: "filigree" },
  { stems: ["püskül", "puskul"], en: "tassel" },
  { stems: ["oksit"], en: "oxidized" },
  { stems: ["osmanlı", "osmanli", "ottoman"], en: "ottoman" },
  { stems: ["kral"], en: "king chain" }
];

function tokens(value: string): string[] {
  return value.toLocaleLowerCase("tr-TR").split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
}

function hasStem(words: string[], stems: string[]): boolean {
  return words.some((word) => stems.some((stem) => word.startsWith(stem)));
}

function titleCase(value: string): string {
  return value.replace(/\s+/g, " ").trim().split(" ").map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");
}

function positiveNumber(value: unknown, max = 1_000_000): number | undefined {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 && number <= max ? number : undefined;
}

const ORIGINS = new Set<ProductOrigin>(["made_by_seller", "designed_by_seller", "vintage", "craft_supply", "commercial_resale", "unknown"]);

export function normalizeProductInput(raw: Record<string, unknown>): ProductPlanInput {
  const titleTr = String(raw.titleTr || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (titleTr.length < 3) throw new Error("PRODUCT_TITLE_REQUIRED");
  const origin = String(raw.origin || "unknown") as ProductOrigin;
  const yearMade = positiveNumber(raw.yearMade, new Date().getUTCFullYear());
  return {
    sourceId: raw.sourceId ? String(raw.sourceId).replace(/[^\w-]/g, "").slice(0, 64) : undefined,
    titleTr,
    descriptionTr: raw.descriptionTr ? String(raw.descriptionTr).trim().slice(0, 3_000) : undefined,
    categoryHint: raw.categoryHint ? String(raw.categoryHint).trim().slice(0, 60) : undefined,
    productNounEn: raw.productNounEn ? String(raw.productNounEn).toLowerCase().replace(/[^a-z\s'-]/g, "").trim().slice(0, 40) || undefined : undefined,
    material: raw.material ? String(raw.material).trim().slice(0, 60) : undefined,
    materialVerified: raw.materialVerified === true,
    weightGrams: positiveNumber(raw.weightGrams, 100_000),
    beadCount: positiveNumber(raw.beadCount, 1_000),
    lengthCm: positiveNumber(raw.lengthCm, 1_000),
    origin: ORIGINS.has(origin) ? origin : "unknown",
    yearMade: yearMade ? Math.round(yearMade) : undefined,
    priceTry: positiveNumber(raw.priceTry),
    shippingTry: positiveNumber(raw.shippingTry, 100_000),
    usdTryRate: positiveNumber(raw.usdTryRate, 1_000),
    readyToShip: raw.readyToShip !== false,
    quantity: Math.min(999, Math.max(1, Math.round(Number(raw.quantity || 1)))),
    imageUrls: (Array.isArray(raw.imageUrls) ? raw.imageUrls : []).map(String).filter((url) => /^https:\/\//.test(url)).slice(0, 10),
    keywords: (Array.isArray(raw.keywords) ? raw.keywords : []).map((value) => String(value).toLowerCase().replace(/\s+/g, " ").trim()).filter((value) => value.length >= 3 && value.length <= 60).slice(0, 8)
  };
}

export function detectProductSignals(input: ProductPlanInput): ProductSignals {
  const words = tokens(`${input.titleTr} ${input.categoryHint || ""} ${input.material || ""}`);
  const material = MATERIALS.find((item) => hasStem(words, item.stems))?.info;
  const nounMatch = NOUNS.find((item) => hasStem(words, item.stems));
  const isTesbih = nounMatch?.en === "prayer beads";
  const isVintage = input.origin === "vintage" || hasStem(words, ["vintage", "antika", "antique"]);
  const attributes = ATTRIBUTES.filter((item) => hasStem(words, item.stems)).map((item) => item.en);
  return { isTesbih, isVintage, material, noun: input.productNounEn || nounMatch?.en || "item", attributes };
}

export function ruleKeywordCandidates(input: ProductPlanInput, signals = detectProductSignals(input)): string[] {
  const material = signals.material;
  const noun = signals.noun;
  const list: string[] = [...input.keywords];
  if (signals.isTesbih) {
    if (material) list.push(`${material.en} prayer beads`, `${material.short} tasbih`, `${material.short} misbaha`);
    list.push("prayer beads", "tasbih", "misbaha");
    if (material && ["amber", "galalith"].includes(material.short)) list.push("worry beads");
  } else if (signals.isVintage) {
    if (material) list.push(`vintage ${material.short} ${noun}`);
    list.push(`vintage ${noun}`, `antique ${noun}`, `vintage turkish ${noun}`);
  } else {
    if (material) list.push(`${material.short} ${noun}`);
    if (signals.attributes[0]) list.push(`${signals.attributes[0]} ${noun}`);
    list.push(`turkish ${noun}`, noun);
    if (input.origin === "made_by_seller") list.push(`handmade ${noun}`);
  }
  return [...new Set(list.map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.length >= 3 && value !== "item"))];
}

export async function keywordCandidates(input: ProductPlanInput, env: AiRuntimeEnv): Promise<{ candidates: string[]; signals: ProductSignals; source: "rules" | "ai" }> {
  const signals = detectProductSignals(input);
  const rules = ruleKeywordCandidates(input, signals);
  if (!hasAiProvider(env)) return { candidates: rules.slice(0, 6), signals, source: "rules" };
  try {
    const ai = await generateStructuredObject<{ productNoun: string; phrases: string[] }>({
      schemaName: "gxl_etsy_buyer_phrases",
      prompt: `You are an Etsy search expert for the US market. A Turkish seller lists this product: ${JSON.stringify({ title: input.titleTr, description: input.descriptionTr?.slice(0, 600), material: input.material, vintage: signals.isVintage })}.\nReturn productNoun = the plain English noun US buyers use for it (max 3 words), and phrases = 5 different lowercase search phrases that US Etsy buyers really type to find this exact kind of item (2-5 words each, no brand names, no Turkish words unless buyers use them, e.g. tasbih or misbaha).`,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { productNoun: { type: "string" }, phrases: { type: "array", items: { type: "string" } } },
        required: ["productNoun", "phrases"]
      }
    }, env);
    const aiPhrases = (ai.phrases || []).map((value) => String(value).toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim()).filter((value) => value.length >= 3 && value.length <= 60);
    const noun = String(ai.productNoun || "").toLowerCase().replace(/[^a-z\s'-]/g, "").trim();
    const merged = [...new Set([...input.keywords, ...aiPhrases, ...rules])].slice(0, 6);
    return { candidates: merged, signals: { ...signals, noun: signals.noun === "item" && noun ? noun : signals.noun }, source: "ai" };
  } catch (error) {
    console.error("AI keyword suggestion failed", error instanceof Error ? error.message : error);
    return { candidates: rules.slice(0, 6), signals, source: "rules" };
  }
}

function vintageWhenMade(year: number): string {
  if (year >= 2000) return "2000_2006";
  if (year >= 1900) return `${Math.floor(year / 10) * 10}s`;
  if (year >= 1800) return "1800s";
  if (year >= 1700) return "1700s";
  return "before_1700";
}

export function etsyEligibility(input: ProductPlanInput, signals = detectProductSignals(input)): EtsyEligibility {
  const preciousUnverified = Boolean(signals.material?.precious && !input.materialVerified);
  const riskFlags: RiskFlag[] = preciousUnverified ? ["precious_material_claim"] : ["none"];
  const policy = evaluateMarketplacePolicies({ origin: input.origin, yearMade: input.yearMade, authenticityVerified: input.materialVerified, riskFlags }).find((item) => item.marketplace === "etsy")!;
  const base = { isSupply: input.origin === "craft_supply", needsProductionPartner: false, reasons: policy.reasons, requiredEvidence: policy.requiredEvidence };
  if (policy.status === "blocked") {
    return { ...base, status: "blocked", reasons: [...policy.reasons, "Bu ürün Etsy'de yayınlanmaz; Shopier'de satışa devam edin."] };
  }
  if (policy.status === "review") return { ...base, status: "review" };
  const vintageYear = input.yearMade && input.yearMade <= new Date().getUTCFullYear() - 20 ? input.yearMade : undefined;
  if (input.origin === "vintage" || (input.origin === "commercial_resale" && vintageYear)) {
    return { ...base, status: "allowed", whoMade: "someone_else", whenMade: vintageWhenMade(vintageYear!), reasons: [`${vintageYear} yapımı vintage ürün olarak listelenir.`] };
  }
  if (input.origin === "designed_by_seller") {
    return { ...base, status: "allowed", whoMade: "someone_else", whenMade: "2020_2026", needsProductionPartner: true, reasons: ["Tasarım sizin, üretim ortağınız yaptı: Etsy'de üretim ortağı gösterilerek listelenir."] };
  }
  if (input.origin === "craft_supply") return { ...base, status: "allowed", whoMade: "someone_else", whenMade: "2020_2026", reasons: ["El işi malzemesi olarak listelenir."] };
  return { ...base, status: "allowed", whoMade: "i_did", whenMade: "2020_2026", reasons: ["Sizin yaptığınız ürün olarak listelenir."] };
}

function roundPrice(value: number): number {
  return Math.max(0.99, Math.ceil(value) - 0.01);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computePricing(input: { priceTry?: number; shippingTry?: number; usdTryRate?: number; shopCurrency?: string; medianUsd?: number }): ProductPricing | undefined {
  if (!input.priceTry || !input.usdTryRate) return undefined;
  const rate = input.usdTryRate;
  const fees = ETSY_TR_FEES;
  const feePercent = fees.transactionRate + fees.processingRate + fees.regulatoryRate + (input.shopCurrency && input.shopCurrency !== "TRY" ? fees.conversionRate : 0);
  const fixedFeesUsd = fees.listingFeeUsd + fees.processingFixedTry / rate;
  const targetNetUsd = input.priceTry / rate;
  const shippingUsd = (input.shippingTry || 0) / rate;
  const breakEvenUsd = (targetNetUsd + shippingUsd + fixedFeesUsd) / (1 - feePercent);
  let recommended = breakEvenUsd;
  let positioning: ProductPricing["positioning"] = "unknown";
  let note = "Etsy ortanca fiyatı bulunamadı; başabaş fiyat önerildi.";
  if (input.medianUsd) {
    const ratio = breakEvenUsd / input.medianUsd;
    if (ratio > 1.3) {
      positioning = "above";
      note = "Başabaş fiyatınız Etsy'deki benzer ilanların ortancasının belirgin üstünde; satış zorlaşabilir. Ürünün farkını (ağırlık, işçilik, malzeme) fotoğraf ve açıklamada öne çıkarın.";
    } else if (ratio < 0.85) {
      positioning = "below";
      recommended = input.medianUsd * 0.85;
      note = "Başabaş fiyatınız Etsy ortancasının altında. Önerilen fiyat ortancanın %85'idir; Shopier fiyatınızın üstünde ek kâr bırakır.";
    } else {
      positioning = "aligned";
      note = "Başabaş fiyatınız Etsy ortancasıyla uyumlu.";
    }
  }
  const recommendedUsd = roundPrice(recommended);
  const netAtRecommendedUsd = recommendedUsd * (1 - feePercent) - fixedFeesUsd - shippingUsd;
  return {
    usdTryRate: rate,
    priceTry: input.priceTry,
    targetNetUsd: round2(targetNetUsd),
    shippingUsd: round2(shippingUsd),
    feePercent: Math.round(feePercent * 10_000) / 100,
    fixedFeesUsd: round2(fixedFeesUsd),
    breakEvenUsd: round2(breakEvenUsd),
    recommendedUsd,
    recommendedTry: Math.round(recommendedUsd * rate),
    medianUsd: input.medianUsd,
    positioning,
    netAtRecommendedTry: Math.round(netAtRecommendedUsd * rate),
    note: `${note} Kargo fiyata dahil edildi (alıcıya ücretsiz kargo).`
  };
}

export async function getUsdTryRate(store: KeyValueStore | undefined, fetcher: Fetcher = fetch, override?: number): Promise<number | undefined> {
  if (override) return override;
  const cached = Number(await store?.get("fx:USD:TRY"));
  if (cached > 1) return cached;
  const sources: Array<[string, (body: any) => unknown]> = [
    ["https://api.frankfurter.app/latest?from=USD&to=TRY", (body) => body?.rates?.TRY],
    ["https://open.er-api.com/v6/latest/USD", (body) => body?.rates?.TRY]
  ];
  for (const [url, pick] of sources) {
    try {
      const response = await fetcher(url, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const rate = Number(pick(await response.json()));
      if (rate > 1 && rate < 1_000) {
        await store?.put("fx:USD:TRY", String(rate), { expirationTtl: 12 * 60 * 60 });
        return rate;
      }
    } catch {
      // Bir kaynak yanıt vermezse sıradakini dene.
    }
  }
  return undefined;
}

function relevantVocabulary(signals: ProductSignals, keywords: string[]): Set<string> {
  const words = new Set<string>(["gift", "islamic", "muslim", "men", "him", "dad", "father", "vintage", "antique", "turkish", "ottoman", "handmade"]);
  for (const value of [...keywords, signals.noun, signals.material?.en || "", ...signals.attributes]) {
    for (const word of value.toLowerCase().split(/\s+/)) if (word.length > 2) words.add(word.replace(/s$/, ""));
  }
  return words;
}

function buildTags(signals: ProductSignals, primary: string, scans: TrendResult[], candidates: string[]): string[] {
  const vocabulary = relevantVocabulary(signals, candidates);
  const counts = new Map<string, number>();
  for (const scan of scans) {
    for (const tag of scan.topTags) counts.set(tag.tag, (counts.get(tag.tag) || 0) + tag.count);
  }
  const ranked = [...counts.entries()]
    .filter(([tag]) => tag.split(/\s+/).some((word) => vocabulary.has(word.replace(/s$/, ""))))
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
  const generated = [
    signals.material ? `${signals.material.short} ${signals.noun}` : "",
    ...signals.attributes.map((attribute) => `${attribute} ${signals.noun}`),
    `turkish ${signals.noun}`,
    signals.isVintage ? `vintage ${signals.noun}` : "",
    signals.isTesbih ? "islamic gift" : "",
    signals.isTesbih ? "muslim gift for him" : ""
  ];
  return normalizeEtsyTags([primary, ...candidates, ...ranked, ...generated].filter(Boolean));
}

function buildTitle(input: ProductPlanInput, signals: ProductSignals, primary: string, candidates: string[], tags: string[]): string {
  const primaryWords = new Set(primary.split(/\s+/));
  const secondary = candidates
    .filter((value) => value !== primary && value.split(/\s+/).some((word) => !primaryWords.has(word)))
    .map((value) => value.split(/\s+/).filter((word) => !primaryWords.has(word)).join(" "))
    .filter((value) => value.length > 2)
    .slice(0, 2);
  const [mainAttribute, ...extraAttributes] = signals.attributes;
  const attributeSegment = mainAttribute
    ? `${titleCase(mainAttribute)} Design${extraAttributes.length ? ` with ${extraAttributes.map(titleCase).join(" and ")}` : ""}`
    : "";
  const originSegment = input.origin === "vintage" && input.yearMade ? `Vintage ${Math.floor(input.yearMade / 10) * 10}s` : input.origin === "made_by_seller" ? "Handmade in Türkiye" : "";
  const giftTag = tags.find((tag) => tag.includes("gift"));
  const segments = [
    titleCase(primary),
    secondary.length ? titleCase(secondary.join(" ")) : "",
    attributeSegment,
    input.weightGrams ? `${Math.round(input.weightGrams)} g` : "",
    originSegment,
    giftTag ? titleCase(giftTag) : ""
  ].filter(Boolean);
  let title = "";
  for (const segment of segments) {
    const next = title ? `${title}, ${segment}` : segment;
    if (next.length > 140) break;
    title = next;
  }
  return normalizeEtsyTitle(title);
}

function buildDescription(input: ProductPlanInput, signals: ProductSignals, eligibility: EtsyEligibility, title: string): string {
  const details = [
    signals.material ? `• Material: ${signals.material.en}${signals.material.precious && input.materialVerified ? " (hallmarked)" : ""}` : "",
    input.weightGrams ? `• Weight: ${Math.round(input.weightGrams)} g (${(input.weightGrams / 28.3495).toFixed(2)} oz)` : "",
    input.beadCount ? `• Beads: ${Math.round(input.beadCount)}` : "",
    input.lengthCm ? `• Length: ${input.lengthCm} cm (${(input.lengthCm / 2.54).toFixed(1)} in)` : "",
    signals.attributes.length ? `• Design details: ${signals.attributes.join(", ")}` : ""
  ].filter(Boolean);
  const origin = input.origin === "vintage"
    ? `This is a genuine vintage piece${input.yearMade ? ` from around ${Math.floor(input.yearMade / 10) * 10}s` : ""}. As a pre-owned item it may show gentle signs of age; please see every photo.`
    : eligibility.needsProductionPartner
      ? "Designed by GXL Market Studio and made for us by our production partner, a silversmith workshop in Türkiye."
      : input.origin === "made_by_seller" ? "Made by GXL Market Studio in Türkiye." : "";
  return [
    `${title}`,
    "",
    "DETAILS",
    ...details,
    ...(origin ? ["", origin] : []),
    "",
    "The item you receive is the one shown in the photos. Please review every photo and message us before ordering if you need an extra measurement or a closer look.",
    "",
    "SHIPPING",
    `• Ships from Türkiye with tracking. ${input.readyToShip ? "Ready to ship." : "Prepared to order; see the processing time on this listing."}`,
    "• Free shipping: delivery cost is already included in the price.",
    "• Import duties or taxes may apply depending on your country.",
    ...(signals.material?.short === "silver" ? ["", "CARE", "Silver naturally darkens over time. Wipe with a soft silver polishing cloth and store in a dry pouch."] : []),
    "",
    "© GXL Market Studio"
  ].join("\n");
}

export function buildProductPlan(input: ProductPlanInput, candidates: string[], scans: TrendResult[], context: { usdTryRate?: number; shopCurrency?: string; signals?: ProductSignals }): ProductPlan {
  const signals = context.signals || detectProductSignals(input);
  const byKeyword = new Map(scans.map((scan) => [scan.keyword, scan]));
  const usable = scans.filter((scan) => scan.metrics.activeListings >= 50);
  const best = [...usable].sort((a, b) => b.score - a.score || b.keyword.length - a.keyword.length)[0];
  const primary = best?.keyword || candidates[0] || signals.noun;
  const tags = buildTags(signals, primary, scans, candidates);
  const title = buildTitle(input, signals, primary, candidates, tags);
  const eligibility = etsyEligibility(input, signals);
  const materials = [signals.material?.en, signals.noun === "prayer beads" ? "beads" : undefined]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/[^\p{L}\p{Nd}\p{Zs}]/gu, " ").trim());
  const pricing = computePricing({ priceTry: input.priceTry, shippingTry: input.shippingTry, usdTryRate: context.usdTryRate, shopCurrency: context.shopCurrency, medianUsd: best?.metrics.medianPriceUsd });
  const warnings = [
    ...(!scans.length ? ["Etsy araması yapılamadı; başlık ve etiketler yalnızca kurallarla üretildi."] : []),
    ...(!input.weightGrams && signals.material?.precious ? ["Ağırlık girilmedi; gümüş ve altın ürünlerde ağırlık alıcı için önemli bir bilgidir."] : []),
    ...(!input.shippingTry ? ["ABD kargo ücreti girilmedi; önerilen fiyat kargo hariç hesaplandı."] : []),
    ...(input.priceTry && !context.usdTryRate ? ["Dolar kuru alınamadı; kuru elle girin."] : []),
    ...(signals.noun === "item" ? ["Ürünün İngilizce adı anlaşılamadı; 'İngilizce ürün adı' alanını doldurun."] : [])
  ];
  return {
    primaryKeyword: primary,
    keywordScores: candidates.map((keyword) => {
      const scan = byKeyword.get(keyword);
      return { keyword, score: scan?.score, verdict: scan?.verdict, activeListings: scan?.metrics.activeListings, medianPriceUsd: scan?.metrics.medianPriceUsd };
    }),
    title,
    tags,
    description: buildDescription(input, signals, eligibility, title),
    materials,
    pricing,
    eligibility,
    competitors: best?.examples || [],
    checks: validateEtsyListingText({ title, tags, materials }),
    warnings
  };
}

interface TaxonomyNode { id?: number; name?: string; children?: TaxonomyNode[] }

async function findTaxonomyId(env: EtsyRuntimeEnv, store: KeyValueStore, terms: string[], fetcher: Fetcher): Promise<number> {
  const cacheKey = `etsy:taxonomy:term:${terms[0].replace(/[^a-z0-9]+/g, "-")}`;
  const cached = Number(await store.get(cacheKey));
  if (cached > 0) return cached;
  const payload = await etsyRequest<{ results?: TaxonomyNode[] }>(env, "/application/seller-taxonomy/nodes", { authenticated: false }, fetcher);
  for (const term of terms) {
    let best: { id: number; depth: number } | undefined;
    const visit = (node: TaxonomyNode, depth: number) => {
      const name = String(node.name || "").toLowerCase();
      if (node.id && name.includes(term) && (!best || depth > best.depth)) best = { id: node.id, depth };
      for (const child of node.children || []) visit(child, depth + 1);
    };
    for (const node of payload.results || []) visit(node, 0);
    if (best) {
      await store.put(cacheKey, String(best.id), { expirationTtl: 7 * 24 * 60 * 60 });
      return best.id;
    }
  }
  throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy kategorisi bulunamadı; 'İngilizce ürün adı' alanını kontrol edin.", 400);
}

function imageKind(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return undefined;
}

export async function createEtsyPhysicalDraft(
  env: EtsyRuntimeEnv,
  store: KeyValueStore,
  input: ProductPlanInput,
  listing: { title: string; tags: string[]; description: string; materials: string[]; priceUsd: number },
  fetcher: Fetcher = fetch
) {
  const signals = detectProductSignals(input);
  const eligibility = etsyEligibility(input, signals);
  if (eligibility.status !== "allowed") {
    throw new EtsyIntegrationError("VALIDATION_FAILED", eligibility.status === "blocked" ? eligibility.reasons.join(" ") : `Etsy için eksik bilgi: ${eligibility.requiredEvidence.join(", ")}`, 400);
  }
  const title = normalizeEtsyTitle(listing.title);
  const tags = normalizeEtsyTags(listing.tags);
  const check = validateEtsyListingText({ title, tags, materials: listing.materials });
  if (check.issues.some((issue) => !issue.startsWith("Etsy 13 etiket"))) throw new EtsyIntegrationError("VALIDATION_FAILED", check.issues.join(" "), 400);
  if (!(listing.priceUsd > 0)) throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy fiyatı gerekli.", 400);

  const mappingKey = input.sourceId ? `etsy:physical:${input.sourceId}` : undefined;
  const existing = mappingKey ? await store.get(mappingKey) : null;
  if (existing) {
    const listingId = Number(existing);
    return { listingId, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`, alreadyCreated: true, warnings: [] as string[] };
  }

  const shop = await getConnectedShop(env, fetcher);
  const currency = (shop.currencyCode || "USD").toUpperCase();
  let price = listing.priceUsd;
  if (currency === "TRY") {
    const rate = await getUsdTryRate(store, fetcher, input.usdTryRate);
    if (!rate) throw new EtsyIntegrationError("VALIDATION_FAILED", "Mağaza para birimi TL; dolar kuru alınamadı.", 400);
    price = Math.round(listing.priceUsd * rate);
  } else if (currency !== "USD") {
    throw new EtsyIntegrationError("VALIDATION_FAILED", `Mağaza para birimi ${currency}; şimdilik yalnızca USD ve TL destekleniyor.`, 400);
  }

  const profiles = await etsyRequest<{ results?: Array<{ shipping_profile_id?: number; is_deleted?: boolean }> }>(env, `/application/shops/${shop.shopId}/shipping-profiles`, {}, fetcher);
  const shippingProfile = (profiles.results || []).find((profile) => profile.shipping_profile_id && !profile.is_deleted);
  if (!shippingProfile) throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy'de önce bir kargo profili oluşturun: Shop Manager → Settings → Shipping settings. ABD için ücretsiz kargo seçin; kargo bedeli fiyata dahil edildi.", 400);

  let readinessStateId: number | undefined;
  try {
    const processing = await etsyRequest<{ results?: Array<{ readiness_state_id?: number; readiness_state?: string }> }>(env, `/application/shops/${shop.shopId}/readiness-state-definitions`, {}, fetcher);
    const rows = processing.results || [];
    readinessStateId = (rows.find((row) => row.readiness_state === (input.readyToShip ? "ready_to_ship" : "made_to_order")) || rows[0])?.readiness_state_id;
  } catch (error) {
    if (!(error instanceof EtsyIntegrationError && error.code === "NOT_FOUND")) throw error;
  }

  let productionPartnerId: number | undefined;
  if (eligibility.needsProductionPartner) {
    const partners = await etsyRequest<{ results?: Array<{ production_partner_id?: number }> }>(env, `/application/shops/${shop.shopId}/production-partners`, {}, fetcher);
    productionPartnerId = partners.results?.find((partner) => partner.production_partner_id)?.production_partner_id;
    if (!productionPartnerId) throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy'de üretim ortağı tanımlı değil: Shop Manager → Settings → Production partners bölümünden gümüşçünüzü/atölyenizi ekleyin.", 400);
  }

  const terms = signals.noun === "prayer beads" ? ["prayer beads", "mala", "rosar"] : [signals.noun, signals.noun.split(" ").at(-1) || signals.noun];
  const taxonomyId = await findTaxonomyId(env, store, terms, fetcher);

  const form = new URLSearchParams({
    quantity: String(input.quantity),
    title,
    description: listing.description.slice(0, 9_000),
    price: price.toFixed(2),
    who_made: eligibility.whoMade!,
    when_made: eligibility.whenMade!,
    taxonomy_id: String(taxonomyId),
    is_supply: eligibility.isSupply ? "true" : "false",
    type: "physical",
    shipping_profile_id: String(shippingProfile.shipping_profile_id)
  });
  if (readinessStateId) form.set("readiness_state_id", String(readinessStateId));
  if (productionPartnerId) form.set("production_partner_ids", String(productionPartnerId));
  if (tags.length) form.set("tags", tags.join(","));
  const materials = listing.materials.map((value) => value.replace(/[^\p{L}\p{Nd}\p{Zs}]/gu, " ").trim()).filter(Boolean);
  if (materials.length) form.set("materials", materials.join(","));
  if (input.weightGrams) {
    form.set("item_weight", String(input.weightGrams));
    form.set("item_weight_unit", "g");
  }
  const created = await etsyRequest<{ listing_id?: number }>(env, `/application/shops/${shop.shopId}/listings`, { method: "POST", form }, fetcher);
  const listingId = Number(created.listing_id);
  if (!listingId) throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy taslak ilan numarası döndürmedi.", 502);
  if (mappingKey) await store.put(mappingKey, String(listingId));

  const warnings: string[] = [];
  for (const [index, url] of input.imageUrls.entries()) {
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(String(response.status));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const kind = imageKind(bytes);
      if (!kind || bytes.byteLength > 10_000_000) throw new Error("format");
      const imageForm = new FormData();
      imageForm.set("image", new Blob([bytes], { type: kind }), `photo-${index + 1}.${kind === "image/png" ? "png" : "jpg"}`);
      imageForm.set("rank", String(index + 1));
      await etsyRequest(env, `/application/shops/${shop.shopId}/listings/${listingId}/images`, { method: "POST", multipart: imageForm }, fetcher);
    } catch {
      warnings.push(`${index + 1}. fotoğraf Etsy'ye yüklenemedi; Etsy'de elle ekleyin.`);
    }
  }
  if (!input.imageUrls.length) warnings.push("Fotoğraf yok; Etsy'de taslağa en az 5 fotoğraf ekleyin.");
  return { listingId, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`, alreadyCreated: false, warnings };
}

// Taslağı yayına alır; Etsy yayın için en az bir görsel ister ve ilan ücreti bu adımda alınır.
export async function publishEtsyListing(env: EtsyRuntimeEnv, listingId: number, fetcher: Fetcher = fetch) {
  if (!Number.isInteger(listingId) || listingId <= 0) throw new EtsyIntegrationError("VALIDATION_FAILED", "Geçersiz Etsy ilan numarası.", 400);
  const shop = await getConnectedShop(env, fetcher);
  const updated = await etsyRequest<{ state?: string; url?: string }>(env, `/application/shops/${shop.shopId}/listings/${listingId}`, {
    method: "PATCH",
    form: new URLSearchParams({ state: "active" })
  }, fetcher);
  return { listingId, state: updated.state || "active", url: updated.url || `https://www.etsy.com/listing/${listingId}` };
}
