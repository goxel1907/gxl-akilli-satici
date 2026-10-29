import { etsyConnection, etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";

type Fetcher = typeof fetch;

// Mağaza hazırlığı: açılıştan önce hangi adımın bittiğini Etsy'den okuyup tek listede gösterir.
// Kargo profili ve iade politikası Etsy API'siyle uygulamadan oluşturulur; ödeme, kimlik ve banka adımları
// yalnız satıcının kendisi tarafından Etsy'de yapılır (uygulama bunlara dokunmaz).

export type ReadinessState = "done" | "todo" | "manual";
export type ReadinessAction = "connect" | "reauth" | "create_shipping_profile" | "create_return_policy" | "open_url" | "shop_settings" | "sell";

export interface ReadinessItem {
  id: string;
  titleTr: string;
  state: ReadinessState;
  detailTr: string;
  action?: ReadinessAction;
  url?: string;
}

export const REQUIRED_SCOPES = ["listings_w", "shops_w", "transactions_r", "transactions_w"];
const RETURN_DEADLINES = [7, 14, 21, 30, 45, 60, 90];

type Row = Record<string, unknown>;
const rows = (payload: unknown): Row[] => {
  const root = payload && typeof payload === "object" ? payload as Row : {};
  return Array.isArray(root.results) ? root.results.filter((row): row is Row => Boolean(row) && typeof row === "object") : [];
};

// Kullanılabilir (silinmemiş) kargo profilleri; hazırlık listesi ve ilan taslağı aynı kuralı kullanır.
export async function shippingProfiles(env: EtsyRuntimeEnv, shopId: number, fetcher: Fetcher = fetch) {
  return rows(await etsyRequest(env, `/application/shops/${shopId}/shipping-profiles`, {}, fetcher)).filter((row) => row.shipping_profile_id && row.is_deleted !== true);
}

export async function returnPolicies(env: EtsyRuntimeEnv, shopId: number, fetcher: Fetcher = fetch) {
  return rows(await etsyRequest(env, `/application/shops/${shopId}/policies/return`, {}, fetcher)).filter((row) => row.return_policy_id);
}

// Etsy mağaza kaydı, açılışın ilk adımında (mağaza adı seçilince) oluşur; mağaza ancak ilk ilan yayına girince
// alıcılara açılır. Bu yüzden "açık" yalnız yayında ilan varken söylenir. Etsy'nin "Etsy Payments'a kayıtlı"
// bilgisi (is_etsy_payments_onboarded) Türkiye mağazalarında baştan açık olabilir; kimlik/banka adımlarının
// bittiğini göstermez, o adım her zaman satıcının kendi adımı olarak gösterilir.
export async function shopReadiness(env: EtsyRuntimeEnv, fetcher: Fetcher = fetch): Promise<{ items: ReadinessItem[]; done: number; total: number; shopOpen?: boolean }> {
  const items: ReadinessItem[] = [];
  const connection = await etsyConnection(env).catch(() => ({ connected: false, scopes: [] as string[], scopesKnown: false }));
  const scopes = connection.scopes;
  if (!connection.connected) {
    items.push({ id: "account", titleTr: "Etsy hesabını uygulamaya bağla", state: "todo", detailTr: "Etsy'de giriş yapıp uygulamaya izin verin. Şifreniz uygulamaya gelmez.", action: "connect" });
  } else {
    items.push({ id: "account", titleTr: "Etsy hesabı bağlı", state: "done", detailTr: "Uygulama Etsy hesabınıza izinle bağlı." });
    const missing = connection.scopesKnown ? REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope)) : REQUIRED_SCOPES;
    items.push(missing.length
      ? { id: "permissions", titleTr: "Etsy iznini yenile", state: "todo", detailTr: "Uygulamaya yeni izinler eklendi (ilan, mağaza ayarı, sipariş kargo bilgisi). Bir kez yenileyip Etsy'de onaylayın.", action: "reauth" }
      : { id: "permissions", titleTr: "İzinler güncel", state: "done", detailTr: "İlan, mağaza ayarı ve sipariş izinleri verilmiş." });
  }

  let shop: Awaited<ReturnType<typeof getConnectedShop>> | undefined;
  if (connection.connected) {
    try {
      shop = await getConnectedShop(env, fetcher);
    } catch (error) {
      if (error instanceof EtsyIntegrationError && error.code === "AUTH_FAILED") {
        // Bağlantının süresi dolmuş ya da izin geri alınmış: diğer adımlar okunamaz, önce bağlantı yenilenir.
        items.push({ id: "auth", titleTr: "Etsy bağlantısını yenile", state: "todo", detailTr: "Etsy bağlantısının süresi dolmuş ya da izin geri alınmış. Yenileyip Etsy'de onaylayın; sonra liste yeniden okunur.", action: "reauth" });
        const counted = items.filter((item) => item.state !== "manual");
        return { items, done: counted.filter((item) => item.state === "done").length, total: counted.length };
      }
      if (!(error instanceof EtsyIntegrationError && (error.code === "NOT_CONNECTED" || error.code === "NOT_FOUND"))) throw error;
    }
  }
  const shopOpen = shop ? (shop.activeListings ?? 0) > 0 : undefined;
  items.push(shop
    ? { id: "shop", titleTr: `Mağaza adı alındı: ${shop.shopName || "—"}`, state: "done", detailTr: shopOpen ? `Mağaza açık: ${shop.activeListings} ilan yayında.` : "Etsy'de mağaza kaydı var ama mağaza henüz açılmadı; alıcılar göremez. İlk ilan yayına girince açılır." }
    : { id: "shop", titleTr: "Etsy'de mağaza adını seç", state: "todo", detailTr: "Etsy → Sell on Etsy: mağaza dili, ülke, para birimi (USD önerilir) ve mağaza adı. Bu adımı Etsy'de siz yaparsınız.", action: "open_url", url: "https://www.etsy.com/sell" });

  items.push({ id: "payments", titleTr: "Ödeme, kimlik ve banka bilgileri (sizin adımınız)", state: "manual", detailTr: "Etsy'de kimlik doğrulama, banka hesabı (TL), fatura kartı ve iki adımlı doğrulama. Kişisel bilgiler olduğu için bu adımı yalnız siz Etsy'de yaparsınız; uygulama bunun bittiğini Etsy'den kesin okuyamaz. Etsy açılış ekranında bu adımlar tamamlandı görünmeli.", action: "open_url", url: "https://www.etsy.com/your/shops/me/dashboard" });

  if (shop) {
    const [profiles, policies] = await Promise.all([shippingProfiles(env, shop.shopId, fetcher), returnPolicies(env, shop.shopId, fetcher)]);
    items.push(profiles.length
      ? { id: "shipping", titleTr: "Kargo profili var", state: "done", detailTr: `${profiles.length} kargo profili tanımlı.` }
      : { id: "shipping", titleTr: "Kargo profili oluştur", state: "todo", detailTr: "Fiziksel ürün (tesbih, vintage, örgü) için gerekli. Uygulama Türkiye'den ABD'ye ücretsiz kargolu profili sizin yerinize oluşturur; kargo bedeli fiyata zaten eklenir. Başka ülkelere göndermek isterseniz Etsy'de profile ülke ekleyebilirsiniz.", action: "create_shipping_profile" });
    items.push(policies.length
      ? { id: "returns", titleTr: "İade politikası var", state: "done", detailTr: policies[0].accepts_returns ? `İade kabul: ${policies[0].return_deadline || "?"} gün.` : "İade kabul edilmiyor." }
      : { id: "returns", titleTr: "İade politikası oluştur", state: "todo", detailTr: "Fiziksel ilanın yayına girmesi için gerekir. Önerilen: 30 gün içinde iade ve değişim (iade kargosunu alıcı öder).", action: "create_return_policy" });
    items.push(shop.title
      ? { id: "storefront", titleTr: "Mağaza vitrini yazıldı", state: "done", detailTr: `Başlık: ${shop.title}` }
      : { id: "storefront", titleTr: "Mağaza başlığı ve duyurusu", state: "todo", detailTr: "Uzman mod → Etsy → Kılavuz → Mağaza vitrini kartından tek dokunuşla yazılır.", action: "shop_settings" });
    items.push((shop.activeListings ?? 0) > 0
      ? { id: "listings", titleTr: "Yayında ilan var", state: "done", detailTr: `${shop.activeListings} ilan yayında.` }
      : { id: "listings", titleTr: "İlk ilanı hazırla", state: "todo", detailTr: "Mağaza açılışı için en az bir ilan gerekir. 'Ürün sat' ile hazırlayın; 5+ ilan alıcıya daha güven verir.", action: "sell" });
  }

  items.push({ id: "branding", titleTr: "Logo, kapak görseli ve 'Hakkında'", state: "manual", detailTr: "Etsy bunları programlara açmaz. Shop Manager → Settings → Info & Appearance bölümünden yükleyin.", action: "open_url", url: "https://www.etsy.com/your/shops/me/dashboard" });

  const counted = items.filter((item) => item.state !== "manual");
  return { items, done: counted.filter((item) => item.state === "done").length, total: counted.length, shopOpen };
}

export function normalizeShippingProfileInput(raw: Record<string, unknown>) {
  const int = (value: unknown, fallback: number) => {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const minDeliveryDays = Math.min(45, int(raw.minDeliveryDays, 7));
  const maxDeliveryDays = Math.min(45, Math.max(minDeliveryDays, int(raw.maxDeliveryDays, 21)));
  const minProcessingDays = Math.min(10, int(raw.minProcessingDays, 1));
  const maxProcessingDays = Math.min(10, Math.max(minProcessingDays, int(raw.maxProcessingDays, 3)));
  const postalCode = String(raw.postalCode || "").replace(/\s+/g, "");
  if (postalCode && !/^\d{5}$/.test(postalCode)) throw new EtsyIntegrationError("VALIDATION_FAILED", "Posta kodu 5 rakam olmalı (ör. 34000).", 400);
  return { minDeliveryDays, maxDeliveryDays, minProcessingDays, maxProcessingDays, postalCode: postalCode || undefined };
}

// Türkiye → ABD, ücretsiz kargo (kargo bedeli ürün fiyatına eklenir). Var olan profil varsa yenisi açılmaz.
export async function createShippingProfile(env: EtsyRuntimeEnv, input: ReturnType<typeof normalizeShippingProfileInput>, fetcher: Fetcher = fetch) {
  const shop = await getConnectedShop(env, fetcher);
  const existing = await shippingProfiles(env, shop.shopId, fetcher);
  if (existing.length) return { shippingProfileId: Number(existing[0].shipping_profile_id), alreadyExisted: true };
  const form = new URLSearchParams({
    title: "Free shipping to the US from Türkiye",
    origin_country_iso: "TR",
    destination_country_iso: "US",
    primary_cost: "0",
    secondary_cost: "0",
    min_delivery_days: String(input.minDeliveryDays),
    max_delivery_days: String(input.maxDeliveryDays),
    min_processing_time: String(input.minProcessingDays),
    max_processing_time: String(input.maxProcessingDays),
    processing_time_unit: "business_days"
  });
  if (input.postalCode) form.set("origin_postal_code", input.postalCode);
  let created: Row;
  try {
    created = await etsyRequest<Row>(env, `/application/shops/${shop.shopId}/shipping-profiles`, { method: "POST", form }, fetcher);
  } catch (error) {
    if (error instanceof EtsyIntegrationError && error.code === "VALIDATION_FAILED" && /postal/i.test(error.message)) {
      throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy gönderen posta kodunu istiyor. Posta kodunuzu (5 rakam) yazıp tekrar deneyin.", 400);
    }
    throw error;
  }
  const shippingProfileId = Number(created.shipping_profile_id);
  if (!shippingProfileId) throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy kargo profili numarası döndürmedi.", 502);
  return { shippingProfileId, alreadyExisted: false };
}

export function normalizeReturnPolicyInput(raw: Record<string, unknown>) {
  const acceptsReturns = raw.acceptsReturns !== false;
  const deadline = Number(raw.deadlineDays ?? 30);
  if (acceptsReturns && !RETURN_DEADLINES.includes(deadline)) throw new EtsyIntegrationError("VALIDATION_FAILED", `İade süresi şu günlerden biri olmalı: ${RETURN_DEADLINES.join(", ")}.`, 400);
  return { acceptsReturns, deadlineDays: acceptsReturns ? deadline : undefined };
}

export async function createReturnPolicy(env: EtsyRuntimeEnv, input: ReturnType<typeof normalizeReturnPolicyInput>, fetcher: Fetcher = fetch) {
  const shop = await getConnectedShop(env, fetcher);
  const existing = await returnPolicies(env, shop.shopId, fetcher);
  const same = existing.find((row) => Boolean(row.accepts_returns) === input.acceptsReturns && (!input.acceptsReturns || Number(row.return_deadline) === input.deadlineDays));
  if (same) return { returnPolicyId: Number(same.return_policy_id), alreadyExisted: true };
  const form = new URLSearchParams({ accepts_returns: String(input.acceptsReturns), accepts_exchanges: String(input.acceptsReturns) });
  if (input.deadlineDays) form.set("return_deadline", String(input.deadlineDays));
  const created = await etsyRequest<Row>(env, `/application/shops/${shop.shopId}/policies/return`, { method: "POST", form }, fetcher);
  const returnPolicyId = Number(created.return_policy_id);
  if (!returnPolicyId) throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy iade politikası numarası döndürmedi.", 502);
  return { returnPolicyId, alreadyExisted: false };
}
