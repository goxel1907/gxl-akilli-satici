import { etsyGrantedScopes, etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";
import { findIpRisks } from "./ip-guard.js";

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

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  title: "Printable Planners, PDF Patterns & Handmade Finds",
  announcement: "Welcome to GXL Market Studio! We design original printable planners, habit trackers and craft patterns for real, busy lives, and we also offer handpicked prayer beads and vintage finds. Every digital file is an instant download: print at home at Actual size (100%). Questions about printing, sizes or an order? Send us a message, we are happy to help.",
  saleMessage: "Thank you for your order from GXL Market Studio! If you have any question about your item, just reply to this message and we will help.",
  digitalSaleMessage: "Thank you for your purchase! Your files are ready on your Etsy Purchases page (You > Purchases and reviews > Download files). Print at Actual size / 100% scale, and open the Tablet PDF in an annotation app that supports links. Need help? Message us anytime. Enjoy!",
  sections: ["Printable Planners", "Habit & Life Trackers", "Crochet & Knit Patterns", "Prayer Beads & Tesbih", "Vintage Finds"]
};

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
  return { defaults: DEFAULT_SHOP_SETTINGS, limits: SHOP_LIMITS, canWrite: scopes.includes("shops_w"), connected: scopes.length > 0 };
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
