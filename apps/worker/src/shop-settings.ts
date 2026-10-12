import { etsyGrantedScopes, etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";
import { findIpRisks } from "./ip-guard.js";
import { listDigitalProducts, type DigitalStore } from "./digital-delivery.js";

type Fetcher = typeof fetch;

// Etsy Open API v3 updateShop yalnız bu alanları değiştirir; logo, afiş ve "Hakkında" bölümü API'de yoktur, Shop Manager'dan elle yüklenir.
export interface ShopSettings {
  title: string;
  announcement: string;
  saleMessage: string;
  digitalSaleMessage: string;
  sections: string[];
}

export const SHOP_LIMITS = { title: 55, announcement: 1500, saleMessage: 1000, digitalSaleMessage: 1000, sectionTitle: 24, sections: 10 };

// Mağaza kimliği tek bir alıcı kitlesine konuşmalı: başlık, duyuru, bölümler ve görsel dil o kitleye göre seçilir.
export type ShopAudience = "planners" | "crafts" | "faith" | "vintage";

export interface ShopPreset extends ShopSettings {
  labelTr: string;
  audienceTr: string;
  tagline: string;
}

const DIGITAL_THANKS = "Thank you for your purchase! Your files are ready on your Etsy Purchases page (You > Purchases and reviews > Download files). Print at Actual size / 100% scale, and open the Tablet PDF in an annotation app that supports links. Need help? Message us anytime. Enjoy!";

export const SHOP_PRESETS: Record<ShopAudience, ShopPreset> = {
  planners: {
    labelTr: "Planlayıcı ve PDF alıcıları (önerilen)",
    audienceTr: "ABD'de düzen, alışkanlık ve sakin bir gün arayan kadınlar: anneler, öğrenciler, çalışan kadınlar.",
    tagline: "Printable planners & craft patterns for calm, organized days",
    title: "Printable Planners & Craft Patterns for Calm Days",
    announcement: "Welcome to GXL Market Studio! We design calm, practical printables for real, busy lives: undated planners, gentle habit and life trackers, and easy-to-follow craft patterns. Every file is an instant download that prints cleanly at home on US Letter or A4. Questions about printing or sizes? Send us a message, we are happy to help.",
    saleMessage: "Thank you for your order from GXL Market Studio! If you have any question about your item, just reply to this message and we will help.",
    digitalSaleMessage: DIGITAL_THANKS,
    sections: ["Printable Planners", "Habit & Life Trackers", "Crochet & Knit Patterns"]
  },
  crafts: {
    labelTr: "Örgü ve el işi yapanlar",
    audienceTr: "Tığ ve şiş ile örgü yapan, adım adım ve sayısı doğru desen arayan ABD'li hobi severler.",
    tagline: "Original crochet & knitting patterns, easy to follow",
    title: "Easy Crochet & Knitting Patterns, PDF Downloads",
    announcement: "Welcome to GXL Market Studio! We design original crochet and knitting patterns with clear, step-by-step instructions, a stitch count for every row and print-friendly PDFs in US terms. Every pattern is an instant download. Stuck on a row? Send us a message, we are happy to help.",
    saleMessage: "Thank you for your order from GXL Market Studio! If you have any question about your pattern, just reply to this message and we will help.",
    digitalSaleMessage: "Thank you for your purchase! Your pattern is ready on your Etsy Purchases page (You > Purchases and reviews > Download files). Print at Actual size / 100% scale. Stuck on a row? Message us anytime. Happy making!",
    sections: ["Crochet Patterns", "Knitting Patterns", "Beginner Friendly", "Printable Planners"]
  },
  faith: {
    labelTr: "Tesbih ve İslami hediye alıcıları",
    audienceTr: "Kendine veya Ramazan, Bayram ve özel günler için anlamlı hediye arayan alıcılar.",
    tagline: "Sterling silver prayer beads & thoughtful gifts",
    title: "Sterling Silver Prayer Beads & Islamic Gifts",
    announcement: "Welcome to GXL Market Studio! We offer sterling silver tesbih (prayer beads) and thoughtful gifts for Ramadan, Eid and special days. Every listing shows the real weight and materials of the piece. Questions about a piece or a gift note? Send us a message, we are happy to help.",
    saleMessage: "Thank you for your order from GXL Market Studio! Your prayer beads will be packed with care. If you would like a gift note, just reply to this message.",
    digitalSaleMessage: DIGITAL_THANKS,
    sections: ["Silver Prayer Beads", "Tesbih & Misbaha", "Ramadan & Eid Gifts"]
  },
  vintage: {
    labelTr: "Vintage koleksiyoncular",
    audienceTr: "En az 20 yıllık, hikâyesi olan gümüş, bakır ve tekstil arayan koleksiyoncular ve dekor severler.",
    tagline: "Curated vintage silver, copper & textiles from Türkiye",
    title: "Curated Vintage Silver, Copper & Turkish Finds",
    announcement: "Welcome to GXL Market Studio! We hand-select vintage pieces from Türkiye: silver jewelry, copper and textiles that are at least 20 years old. Every listing shows the real item with honest notes on age and condition. Questions? Send us a message, we are happy to help.",
    saleMessage: "Thank you for your order from GXL Market Studio! Your vintage piece will be packed with care. Reply to this message with any question.",
    digitalSaleMessage: DIGITAL_THANKS,
    sections: ["Vintage Silver", "Vintage Copper", "Rugs & Textiles"]
  }
};

function settingsOf(preset: ShopPreset): ShopSettings {
  return { title: preset.title, announcement: preset.announcement, saleMessage: preset.saleMessage, digitalSaleMessage: preset.digitalSaleMessage, sections: preset.sections };
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = settingsOf(SHOP_PRESETS.planners);

// Öneri mağazadaki dijital ürünlerden çıkar; ürün yoksa uygulamanın Etsy stratejisi (önce PDF ürünleri) esas alınır.
export function recommendAudience(products: Array<{ kind?: string; craft?: string }>): { audience: ShopAudience; reasonTr: string } {
  const printables = products.filter((product) => product.kind).length;
  const patterns = products.filter((product) => !product.kind && product.craft).length;
  if (patterns > printables) return { audience: "crafts", reasonTr: `Mağazadaki dijital ürünlerin çoğu desen (${patterns} desen, ${printables} PDF ürünü).` };
  if (printables) return { audience: "planners", reasonTr: `Mağazadaki dijital ürünlerin çoğu PDF ürünü (${printables} PDF ürünü, ${patterns} desen).` };
  return { audience: "planners", reasonTr: "Henüz ürün yok; uygulamanın Etsy stratejisi PDF ürünleriyle başlıyor. Trend taramalarında bu ürünlerin alıcıları ağırlıkla kadınlar, anneler ve öğrenciler." };
}

export class ShopSettingsError extends Error {
  constructor(public code: "VALIDATION_FAILED" | "SCOPE_MISSING", message: string, public status = 400) {
    super(message);
    this.name = "ShopSettingsError";
  }
}

function clean(value: unknown, limit: number, label: string, multiline = false): string {
  const text = String(value ?? "").replace(multiline ? /[^\S\n]+/g : /\s+/g, " ").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim();
  if (text.length > limit) throw new ShopSettingsError("VALIDATION_FAILED", `${label} en fazla ${limit} karakter olabilir (şu an ${text.length}).`);
  return text;
}

export function normalizeShopSettings(raw: Record<string, unknown>): Partial<ShopSettings> {
  const result: Partial<ShopSettings> = {};
  if (raw.title !== undefined) result.title = clean(raw.title, SHOP_LIMITS.title, "Mağaza başlığı");
  if (raw.announcement !== undefined) result.announcement = clean(raw.announcement, SHOP_LIMITS.announcement, "Duyuru", true);
  if (raw.saleMessage !== undefined) result.saleMessage = clean(raw.saleMessage, SHOP_LIMITS.saleMessage, "Satış mesajı", true);
  if (raw.digitalSaleMessage !== undefined) result.digitalSaleMessage = clean(raw.digitalSaleMessage, SHOP_LIMITS.digitalSaleMessage, "Dijital satış mesajı", true);
  if (raw.sections !== undefined) {
    const list = (Array.isArray(raw.sections) ? raw.sections : String(raw.sections).split(","))
      .map((item) => clean(item, SHOP_LIMITS.sectionTitle, "Bölüm adı"))
      .filter(Boolean);
    result.sections = [...new Set(list)].slice(0, SHOP_LIMITS.sections);
  }
  // Mağaza metinlerinde marka/karakter adı Etsy'de ihlal sayılır.
  const risks = findIpRisks(Object.values(result).flat().join(" "));
  if (risks.length) throw new ShopSettingsError("VALIDATION_FAILED", `Korunan marka/karakter adı içeriyor: ${risks.join(", ")}.`);
  return result;
}

export async function shopSettingsStatus(env: EtsyRuntimeEnv) {
  const scopes = await etsyGrantedScopes(env).catch(() => [] as string[]);
  const products = env.ETSY_OAUTH ? await listDigitalProducts(env.ETSY_OAUTH as unknown as DigitalStore).catch(() => []) : [];
  const recommendation = recommendAudience(products);
  return { defaults: settingsOf(SHOP_PRESETS[recommendation.audience]), presets: SHOP_PRESETS, recommended: recommendation.audience, reasonTr: recommendation.reasonTr, limits: SHOP_LIMITS, canWrite: scopes.includes("shops_w"), connected: scopes.length > 0 };
}

export async function applyShopSettings(env: EtsyRuntimeEnv, raw: Record<string, unknown>, fetcher: Fetcher = fetch) {
  const settings = normalizeShopSettings(raw);
  const scopes = await etsyGrantedScopes(env);
  if (!scopes.includes("shops_w")) {
    throw new ShopSettingsError("SCOPE_MISSING", "Mağaza ayarlarını değiştirmek için Etsy bağlantısını yenileyin (Etsy → Kılavuz → Etsy iznini yenile). Yeni izin: mağaza düzenleme.", 403);
  }
  const shop = await getConnectedShop(env, fetcher);
  const updated: string[] = [];
  const form = new URLSearchParams();
  if (settings.title) { form.set("title", settings.title); updated.push("title"); }
  if (settings.announcement !== undefined) { form.set("announcement", settings.announcement); updated.push("announcement"); }
  if (settings.saleMessage !== undefined) { form.set("sale_message", settings.saleMessage); updated.push("sale_message"); }
  if (settings.digitalSaleMessage !== undefined) { form.set("digital_sale_message", settings.digitalSaleMessage); updated.push("digital_sale_message"); }
  if (updated.length) await etsyRequest(env, `/application/shops/${shop.shopId}`, { method: "PUT", form }, fetcher);

  const created: string[] = [];
  const existing: string[] = [];
  if (settings.sections?.length) {
    const current = await etsyRequest<{ results?: Array<{ title?: string }> }>(env, `/application/shops/${shop.shopId}/sections`, {}, fetcher);
    const have = new Set((current.results || []).map((item) => String(item.title || "").trim().toLowerCase()));
    for (const title of settings.sections) {
      if (have.has(title.toLowerCase())) { existing.push(title); continue; }
      await etsyRequest(env, `/application/shops/${shop.shopId}/sections`, { method: "POST", form: new URLSearchParams({ title }) }, fetcher);
      created.push(title);
    }
  }
  if (!updated.length && !created.length && !existing.length) throw new EtsyIntegrationError("VALIDATION_FAILED", "Değiştirilecek mağaza ayarı gönderilmedi.", 400);
  return { shopId: shop.shopId, updated, sectionsCreated: created, sectionsExisting: existing };
}
