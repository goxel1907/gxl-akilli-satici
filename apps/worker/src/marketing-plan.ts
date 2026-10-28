import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";

// Ürün için müşteri bulma ve reklam planı: hangi kanalda ne yapılır, reklam ne zaman açılır, bütçe ve durdurma
// kuralı. Kararlar kurallarla verilir (tahmin değil, açık eşikler); yapay zekâ yalnız paylaşılacak metinleri yazar.
// Müşteri "bulmak" = doğru kişinin ürünü görmesini sağlamak: reklam, paylaşım, Pinterest, gelen soruya hızlı yanıt.
// Tanımadığı kişilere toplu mesaj, hesap/numara toplama yapılmaz (Meta kuralları, KVKK, ticari ileti izni).

export type SaleChannel = "etsy" | "shopier";
export type MarketingProductKind = "pdf" | "pattern" | "tesbih" | "vintage" | "knitwear" | "other";
export type ChannelId = "etsy_ads" | "etsy_offers" | "offsite_ads" | "instagram" | "facebook" | "whatsapp" | "pinterest";
export type Decision = "now" | "later" | "skip" | "always";

export interface MarketingPlanInput {
  productName: string;
  kind: MarketingProductKind;
  channel: SaleChannel;
  priceTry?: number;
  priceUsd?: number;
  profitTry?: number;
  link?: string;
  activeEtsyListings?: number;
  photoCount?: number;
  whatsappNumber?: string;
}

export interface CopyBlock {
  labelTr: string;
  text: string;
}

export interface ChannelAdvice {
  id: ChannelId;
  titleTr: string;
  decision: Decision;
  decisionTr: string;
  whyTr: string;
  budgetTr?: string;
  stopRuleTr?: string;
  stepsTr: string[];
  copy: CopyBlock[];
  openUrl?: string;
  openLabelTr?: string;
}

export interface MarketingPlan {
  headlineTr: string;
  channel: SaleChannel;
  channels: ChannelAdvice[];
  rulesTr: string[];
  aiCopy: boolean;
}

export class MarketingPlanError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "MarketingPlanError";
  }
}

const KINDS: MarketingProductKind[] = ["pdf", "pattern", "tesbih", "vintage", "knitwear", "other"];
const DECISION_TR: Record<Decision, string> = { now: "Şimdi yap", later: "Sonra", skip: "Önerilmez", always: "Mutlaka" };
const KIND_TR: Record<MarketingProductKind, string> = { pdf: "PDF ürünü", pattern: "hobi deseni", tesbih: "tesbih", vintage: "vintage ürün", knitwear: "örgü giyim", other: "ürün" };
const DIGITAL = new Set<MarketingProductKind>(["pdf", "pattern"]);

// Etsy Ads: en az 1 USD/gün; Etsy yeni kullanıcıya küçük başlayıp 30 gün dokunmamayı önerir.
const ETSY_ADS_MIN_PRICE_USD = 5;
const ETSY_ADS_MIN_PHOTOS = 5;
// Offsite Ads ücreti (yıllık 10.000 USD altı mağaza): satış başına %15. Kâr marjı bunun altındaysa zarar ettirir.
const OFFSITE_FEE = 0.15;

function num(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function cleanPhone(value: unknown): string | undefined {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  const withCountry = digits.startsWith("90") ? digits : digits.startsWith("0") ? `9${digits}` : `90${digits}`;
  return /^90\d{10}$/.test(withCountry) ? withCountry : undefined;
}

export function normalizeMarketingInput(raw: Record<string, unknown>): MarketingPlanInput {
  const productName = String(raw.productName || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (productName.length < 3) throw new MarketingPlanError("Ürün adını yazın (ör. 925 gümüş tesbih).");
  const kind = KINDS.includes(raw.kind as MarketingProductKind) ? raw.kind as MarketingProductKind : "other";
  const channel: SaleChannel = raw.channel === "shopier" ? "shopier" : "etsy";
  const link = /^https:\/\/[^\s]+$/.test(String(raw.link || "")) ? String(raw.link).slice(0, 300) : undefined;
  const listings = Number(raw.activeEtsyListings);
  const photos = Number(raw.photoCount);
  return {
    productName,
    kind,
    channel,
    priceTry: num(raw.priceTry),
    priceUsd: num(raw.priceUsd),
    profitTry: num(raw.profitTry),
    link,
    activeEtsyListings: Number.isInteger(listings) && listings >= 0 ? listings : undefined,
    photoCount: Number.isInteger(photos) && photos >= 0 ? photos : undefined,
    whatsappNumber: cleanPhone(raw.whatsappNumber)
  };
}

interface Copy {
  captionTr: string;
  captionEn: string;
  hashtagsTr: string[];
  hashtagsEn: string[];
  storyTr: string;
  whatsappTr: string;
  pinTitleEn: string;
  pinDescriptionEn: string;
  audienceTr: string;
}

const AUDIENCE: Record<MarketingProductKind, { tr: string; en: string }> = {
  pdf: { tr: "Kadın, 25–45 yaş; ilgi alanları: planlama, düzen, kişisel gelişim, öğretmenlik", en: "Women 25–45 in the US; interests: planners, organization, journaling, teachers" },
  pattern: { tr: "Kadın, 25–60 yaş; ilgi alanları: örgü, tığ işi, el işi, DIY", en: "Women 25–60 in the US; interests: crochet, knitting, crafts, DIY" },
  tesbih: { tr: "Erkek ve kadın, 25–65 yaş; ilgi alanları: İslam, hediye, kehribar, gümüş", en: "Men and women 25–65 in the US; interests: Islam, Eid, gifts for men, prayer beads" },
  vintage: { tr: "25–65 yaş; ilgi alanları: antika, vintage, ev dekorasyonu, koleksiyon", en: "Adults 25–65 in the US; interests: vintage, antiques, home decor, collecting" },
  knitwear: { tr: "Kadın, 20–50 yaş; ilgi alanları: el yapımı moda, örgü, sürdürülebilir giyim", en: "Women 20–50 in the US; interests: handmade fashion, slow fashion, knitwear" },
  other: { tr: "Ürünle ilgilenecek yaş ve ilgi alanlarını seçin", en: "Pick the age range and interests that match the product" }
};

function templateCopy(input: MarketingPlanInput): Copy {
  const name = input.productName;
  const kind = KIND_TR[input.kind];
  const price = input.priceTry ? `${Math.round(input.priceTry).toLocaleString("tr-TR")} TL` : "";
  const tagsTr: Record<MarketingProductKind, string[]> = {
    pdf: ["#planlayıcı", "#düzenliyaşam", "#yazdırılabilir", "#ajanda", "#dijitalürün"],
    pattern: ["#örgü", "#tığişi", "#elişi", "#örgümodelleri", "#crochet"],
    tesbih: ["#tesbih", "#gümüştesbih", "#kehribar", "#tesbihkoleksiyonu", "#hediye"],
    vintage: ["#vintage", "#antika", "#eskieşya", "#koleksiyon", "#retro"],
    knitwear: ["#elörgüsü", "#örgükazak", "#tığişi", "#elyapımı", "#elörgüsükazak"],
    other: ["#elyapımı", "#hediye", "#elişi"]
  };
  const tagsEn: Record<MarketingProductKind, string[]> = {
    pdf: ["#printableplanner", "#plannercommunity", "#etsyfinds", "#digitaldownload", "#organization"],
    pattern: ["#crochetpattern", "#crochetersofinstagram", "#knittingpattern", "#etsyfinds", "#diycrafts"],
    tesbih: ["#prayerbeads", "#tasbih", "#misbaha", "#islamicgift", "#etsyfinds"],
    vintage: ["#vintagefinds", "#vintagedecor", "#etsyvintage", "#antiques", "#collectibles"],
    knitwear: ["#handknit", "#crochetsweater", "#slowfashion", "#handmadefashion", "#etsyfinds"],
    other: ["#handmade", "#etsyfinds", "#giftideas"]
  };
  return {
    captionTr: `${name} ✨ El emeğiyle hazırlandı, stokta ${input.kind === "vintage" ? "tek parça" : "sınırlı sayıda"}.${price ? ` Fiyat: ${price}.` : ""} Sipariş ve sorularınız için profildeki bağlantıya dokunun ya da DM atın.`,
    captionEn: `${name} — ${DIGITAL.has(input.kind) ? "instant download, print at home" : "handmade/curated in Türkiye, ships to the US"}. Find it in our Etsy shop (link in bio).`,
    hashtagsTr: tagsTr[input.kind],
    hashtagsEn: tagsEn[input.kind],
    storyTr: `Yeni ${kind}: ${name}. Bağlantıya dokunun 👆`,
    whatsappTr: `Merhaba, "${name}" hakkında bilgi almak istiyorum.`,
    pinTitleEn: name,
    pinDescriptionEn: `${name}. ${DIGITAL.has(input.kind) ? "Instant download PDF." : "Ships from Türkiye."} Available on Etsy.`,
    audienceTr: AUDIENCE[input.kind].tr
  };
}

const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    captionTr: { type: "string" },
    captionEn: { type: "string" },
    hashtagsTr: { type: "array", items: { type: "string" } },
    hashtagsEn: { type: "array", items: { type: "string" } },
    storyTr: { type: "string" },
    whatsappTr: { type: "string" },
    pinTitleEn: { type: "string" },
    pinDescriptionEn: { type: "string" }
  },
  required: ["captionTr", "captionEn", "hashtagsTr", "hashtagsEn", "storyTr", "whatsappTr", "pinTitleEn", "pinDescriptionEn"]
};

function tidy(value: unknown, max: number): string {
  return String(value || "").replace(/[<>{}]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function tags(value: unknown, fallback: string[]): string[] {
  const list = (Array.isArray(value) ? value : []).map((item) => `#${String(item).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((item) => item.length > 2 && item.length <= 30);
  const unique = [...new Set(list)].slice(0, 15);
  return unique.length >= 3 ? unique : fallback;
}

async function writeCopy(input: MarketingPlanInput, env: AiRuntimeEnv): Promise<{ copy: Copy; ai: boolean }> {
  const fallback = templateCopy(input);
  if (!hasAiProvider(env)) return { copy: fallback, ai: false };
  try {
    const raw = await generateStructuredObject<Partial<Copy>>({
      schemaName: "gxl_marketing_copy",
      schema: COPY_SCHEMA,
      prompt: [
        "Write short social media texts for a small Turkish seller. Be warm and plain; no exaggeration, no fake scarcity, no claims that are not given (material, age, brand, discounts).",
        `Product: ${JSON.stringify({ name: input.productName, type: KIND_TR[input.kind], sellsOn: input.channel === "etsy" ? "Etsy (US buyers)" : "Shopier (Turkish buyers)", priceTry: input.priceTry, priceUsd: input.priceUsd })}`,
        "captionTr: Instagram caption in Turkish (max 300 chars). captionEn: Instagram caption in English for US buyers pointing to the Etsy shop link in bio (max 300 chars).",
        "hashtagsTr: 8-12 Turkish hashtags people really use. hashtagsEn: 8-12 English hashtags. storyTr: one short Turkish story line (max 80 chars).",
        "whatsappTr: the message a customer sends when they tap the WhatsApp button, in Turkish, first person, mentioning the product (max 120 chars).",
        "pinTitleEn: Pinterest pin title in English (max 90 chars). pinDescriptionEn: Pinterest description in English with natural search words (max 400 chars)."
      ].join("\n")
    }, env);
    return {
      ai: true,
      copy: {
        captionTr: tidy(raw.captionTr, 400) || fallback.captionTr,
        captionEn: tidy(raw.captionEn, 400) || fallback.captionEn,
        hashtagsTr: tags(raw.hashtagsTr, fallback.hashtagsTr),
        hashtagsEn: tags(raw.hashtagsEn, fallback.hashtagsEn),
        storyTr: tidy(raw.storyTr, 100) || fallback.storyTr,
        whatsappTr: tidy(raw.whatsappTr, 160) || fallback.whatsappTr,
        pinTitleEn: tidy(raw.pinTitleEn, 100) || fallback.pinTitleEn,
        pinDescriptionEn: tidy(raw.pinDescriptionEn, 500) || fallback.pinDescriptionEn,
        audienceTr: fallback.audienceTr
      }
    };
  } catch {
    return { copy: fallback, ai: false };
  }
}

function advice(id: ChannelId, titleTr: string, decision: Decision, rest: Omit<ChannelAdvice, "id" | "titleTr" | "decision" | "decisionTr">): ChannelAdvice {
  return { id, titleTr, decision, decisionTr: DECISION_TR[decision], ...rest };
}

function etsyAds(input: MarketingPlanInput, margin?: number): ChannelAdvice {
  const steps = [
    "Etsy → Shop Manager (Mağaza Yöneticisi) → Marketing (Pazarlama) → Etsy Ads (Etsy Reklamları).",
    "Daily budget (Günlük bütçe): 1–3 USD yazın. Bu ürün dışındaki ilanlarda 'Advertising' (Reklam) anahtarını kapatın.",
    "Ayarlar ekranında yazan en fazla harcama tutarını okuyun; ilk hafta her gün 'Spend' (Harcama) satırına bakın.",
    "30 gün boyunca bütçeye ve ilana dokunmayın; sonra aşağıdaki durdurma kuralına göre karar verin."
  ];
  const stopRuleTr = `30 gün sonra: hiç satış yoksa ve harcama ${margin ? "bir satıştan kazancınızın" : "ürün fiyatının"} 2 katını geçtiyse reklamı kapatın, önce fotoğraf, başlık ve fiyatı düzeltin. Satış varsa ve harcama kazancın yarısının altındaysa bütçeyi 1 USD artırın.`;
  if (input.activeEtsyListings === 0) {
    return advice("etsy_ads", "Etsy reklamı (Etsy Ads)", "later", { whyTr: "Mağazada henüz aktif ilan yok; reklam ancak yayındaki ilana verilir.", stepsTr: steps, stopRuleTr, copy: [] });
  }
  if (input.photoCount !== undefined && input.photoCount < ETSY_ADS_MIN_PHOTOS) {
    return advice("etsy_ads", "Etsy reklamı (Etsy Ads)", "later", { whyTr: `İlanda ${input.photoCount} fotoğraf var. En az ${ETSY_ADS_MIN_PHOTOS} net fotoğraf olmadan reklam tıklaması satışa dönmez; para boşa gider.`, stepsTr: steps, stopRuleTr, copy: [] });
  }
  if (input.priceUsd !== undefined && input.priceUsd < ETSY_ADS_MIN_PRICE_USD) {
    return advice("etsy_ads", "Etsy reklamı (Etsy Ads)", "later", { whyTr: `Fiyat ${input.priceUsd.toFixed(2)} USD. Ucuz üründe bir tıklamanın bedeli kazancı yer. Önce 10+ ilan açın ve ilk satışları reklamsız alın; set (bundle) ilanı varsa reklamı ona verin.`, stepsTr: steps, stopRuleTr, copy: [] });
  }
  if (margin !== undefined && margin < 0.2) {
    return advice("etsy_ads", "Etsy reklamı (Etsy Ads)", "skip", { whyTr: `Kâr marjı %${Math.round(margin * 100)}. Etsy kesintileri ve reklam bedeli bu marjı sıfırlar; önce fiyatı yükseltin.`, stepsTr: steps, stopRuleTr, copy: [] });
  }
  return advice("etsy_ads", "Etsy reklamı (Etsy Ads)", "now", {
    whyTr: "Etsy reklamı, Etsy'de bu ürünü arayan alıcının karşısına ilanınızı çıkarır; yalnız tıklanınca ücret alınır. Yeni mağazada ilk görünürlüğü hızlandırır.",
    budgetTr: "Günde 1–3 USD, 30 gün (en az 1 USD; Etsy yeni başlayana küçük bütçe ve 30 gün sabır önerir).",
    stopRuleTr,
    stepsTr: steps,
    copy: [],
    openUrl: "https://www.etsy.com/your/shops/me/advertising",
    openLabelTr: "Etsy Ads sayfasını aç"
  });
}

function offsiteAds(margin?: number): ChannelAdvice {
  const steps = ["Etsy → Shop Manager (Mağaza Yöneticisi) → Marketing (Pazarlama) → Offsite Ads (Site dışı reklamlar).", "Yıllık satışı 10.000 USD altındaki mağaza bu reklamdan çıkabilir (opt out)."];
  if (margin !== undefined && margin < 0.3) {
    return advice("offsite_ads", "Etsy'nin site dışı reklamı (Offsite Ads)", "skip", { whyTr: `Bu reklamdan gelen satıştan Etsy %${Math.round(OFFSITE_FEE * 100)} ek ücret alır. Kâr marjınız %${Math.round(margin * 100)}; bu satış size zarar ettirir. Kapatın.`, stepsTr: steps, copy: [] });
  }
  return advice("offsite_ads", "Etsy'nin site dışı reklamı (Offsite Ads)", "always", {
    whyTr: `Etsy ürününüzü Google, Facebook ve Pinterest'te kendi parasıyla gösterir. Ücret yalnız satış olursa: satışın %${Math.round(OFFSITE_FEE * 100)} kadarı. Marjınız yetiyorsa açık bırakın; bedava görünürlüktür.`,
    stepsTr: steps,
    copy: []
  });
}

function etsyOffers(): ChannelAdvice {
  return advice("etsy_offers", "Favorileyene ve sepette bırakana indirim (Etsy)", "always", {
    whyTr: "Ürünü favorileyen ya da sepette bırakan alıcı en sıcak müşteridir. Etsy bu kişilere sizin yerinize otomatik indirim teklifi gönderir; reklam bedeli yoktur.",
    stepsTr: [
      "Etsy → Shop Manager (Mağaza Yöneticisi) → Marketing (Pazarlama) → Sales and discounts (İndirimler).",
      "Hedefli teklif (targeted offer) bölümünde 'abandoned cart' (sepette bırakan) ve 'favorited' (favorileyen) için %10–15 indirim açın.",
      "'Thank you' (teşekkür) kuponuyla ilk alıcıya ikinci alışveriş için %10 verin."
    ],
    copy: [],
    openUrl: "https://www.etsy.com/your/shops/me/sales-discounts",
    openLabelTr: "İndirimler sayfasını aç"
  });
}

function hashtagLine(list: string[]): string {
  return list.join(" ");
}

function instagram(input: MarketingPlanInput, copy: Copy): ChannelAdvice {
  const etsy = input.channel === "etsy";
  const boostBudget = etsy ? "Günde 3–5 USD, 5–7 gün; konum: ABD" : "Günde 50–100 TL, 5–7 gün; konum: Türkiye";
  return advice("instagram", "Instagram", "now", {
    whyTr: etsy
      ? "Etsy dışından alıcı getirir. İngilizce gönderi ve Reels, profildeki Etsy bağlantısına yönlendirir; kendi paylaşımınızla gelen satıştan Etsy site dışı reklam ücreti (Offsite Ads) almaz."
      : "Shopier ürünü için en güçlü kanal. Reels ve hikâye, hikâyedeki bağlantı çıkartmasıyla doğrudan Shopier sayfasına götürür.",
    budgetTr: `Önce reklamsız 3–5 gönderi. Etkileşimi en yüksek gönderiyi 'Öne çıkar' (Boost) ile: ${boostBudget}. Hedef kitle: ${etsy ? AUDIENCE[input.kind].en : copy.audienceTr}.`,
    stopRuleTr: "Öne çıkarılan gönderi 3 günde profil ziyareti ya da mesaj getirmediyse durdurun; başka bir fotoğraf/video ile yeniden deneyin.",
    stepsTr: [
      "Profili 'Profesyonel hesap' (İşletme) yapın; profildeki bağlantıya " + (etsy ? "Etsy mağaza bağlantısını" : "Shopier mağaza bağlantısını") + " koyun.",
      "Haftada 3 gönderi: ürün yakın çekim, kullanılırken, paketleme. 7–15 saniyelik Reels en çok erişimi alır.",
      "Hikâyede 'Bağlantı' çıkartmasına ürün bağlantısını ekleyin.",
      "Gelen yorum ve mesajlara aynı gün yanıt verin; Instagram hızlı yanıtlayan hesabı daha çok gösterir.",
      "Öne çıkarma: gönderinin altındaki 'Öne çıkar' → Hedef: 'Daha fazla web sitesi ziyareti' (bağlantı) ya da 'Daha fazla mesaj'."
    ],
    copy: [
      { labelTr: etsy ? "Gönderi metni (İngilizce, ABD'li alıcı için)" : "Gönderi metni", text: `${etsy ? copy.captionEn : copy.captionTr}\n\n${hashtagLine(etsy ? copy.hashtagsEn : copy.hashtagsTr)}` },
      ...(etsy ? [{ labelTr: "Türkçe karşılığı (paylaşmayın, anlamak için)", text: copy.captionTr }] : [{ labelTr: "Hikâye yazısı", text: copy.storyTr }])
    ],
    openUrl: "https://www.instagram.com/",
    openLabelTr: "Instagram'ı aç"
  });
}

function facebook(input: MarketingPlanInput, copy: Copy): ChannelAdvice {
  if (input.channel === "etsy") {
    return advice("facebook", "Facebook", input.kind === "pattern" || input.kind === "pdf" ? "later" : "skip", {
      whyTr: input.kind === "pattern" || input.kind === "pdf"
        ? "ABD'li örgü ve planlayıcı grupları alıcı getirebilir ama çoğu grup satış paylaşımını yasaklar. Önce Instagram ve Pinterest; gruplarda yalnız kuralların izin verdiği günlerde paylaşın."
        : "Etsy ürünü için Facebook'ta reklamsız erişim düşüktür; Etsy'nin kendi site dışı reklamı (Offsite Ads) bu işi sizin yerinize yapar.",
      stepsTr: ["Grup kurallarını okuyun; 'promo day' (tanıtım günü) olan gruplarda paylaşın.", "Gönderide Etsy ilan bağlantısını ve 1–2 net fotoğrafı kullanın."],
      copy: [{ labelTr: "Paylaşım metni (İngilizce)", text: copy.captionEn }]
    });
  }
  return advice("facebook", "Facebook ve Marketplace", "now", {
    whyTr: "Marketplace Türkiye'de yerel alıcıya ücretsiz ulaşır. Sayfa gönderisini Instagram'la aynı anda paylaşabilir, aynı bütçeyle öne çıkarabilirsiniz.",
    budgetTr: "Marketplace ücretsiz. Öne çıkarma Instagram'daki gibi: günde 50–100 TL, 5–7 gün.",
    stopRuleTr: "Marketplace ilanı 7 günde mesaj almadıysa fotoğrafı ve fiyatı değiştirip yenileyin.",
    stepsTr: [
      "Facebook → Marketplace → 'Yeni ilan' → Ürün: fotoğraflar, başlık, fiyat, konum.",
      "Açıklamaya Shopier bağlantısını ve 'güvenli ödeme Shopier ile' notunu ekleyin.",
      "Satış gruplarında yalnız grup kurallarının izin verdiği şekilde paylaşın; aynı metni her gruba yapıştırmayın (spam sayılır)."
    ],
    copy: [{ labelTr: "Marketplace / gönderi metni", text: `${copy.captionTr}${input.link ? `\n\nSipariş: ${input.link}` : ""}` }],
    openUrl: "https://www.facebook.com/marketplace/create/item",
    openLabelTr: "Marketplace ilanı aç"
  });
}

function whatsapp(input: MarketingPlanInput, copy: Copy): ChannelAdvice {
  if (input.channel === "etsy") {
    return advice("whatsapp", "WhatsApp", "skip", {
      whyTr: "Etsy, alıcıyı Etsy dışına (WhatsApp, Instagram, Shopier) yönlendirmeyi yasaklar; mağaza kapatılabilir. Etsy alıcısıyla yalnız Etsy mesajlarından yazışın.",
      stepsTr: ["Etsy ilanına ve Etsy mesajına telefon numarası ya da dış bağlantı yazmayın."],
      copy: []
    });
  }
  const link = input.whatsappNumber ? `https://wa.me/${input.whatsappNumber}?text=${encodeURIComponent(copy.whatsappTr)}` : undefined;
  const price = input.priceTry ? `${Math.round(input.priceTry).toLocaleString("tr-TR")} TL` : "[fiyat]";
  return advice("whatsapp", "WhatsApp Business", "now", {
    whyTr: "Türk alıcı soruyu WhatsApp'tan sorar. Tek dokunuşla yazabileceği bağlantı ve hazır yanıtlar satışı hızlandırır. Mesaj yalnız size yazan kişiyle olur; toplu mesaj atılmaz.",
    stepsTr: [
      "WhatsApp Business uygulamasını kurun (ücretsiz). Ayarlar → İşletme araçları → Katalog: ürünü fotoğraf, fiyat ve Shopier bağlantısıyla ekleyin.",
      "İşletme araçları → Hızlı yanıtlar: aşağıdaki hazır yanıtları ekleyin (/fiyat, /kargo, /odeme).",
      link ? "Aşağıdaki 'Bana yaz' bağlantısını Instagram profiline, hikâyeye ve Shopier açıklamasına koyun." : "Uygulamada WhatsApp numaranızı girerseniz 'Bana yaz' bağlantısı hazırlanır (numara yalnız bu telefonda saklanır).",
      "Durum (status) bölümünde haftada 2–3 kez yeni ürün paylaşın; rehberinizdeki kişiler görür."
    ],
    copy: [
      ...(link ? [{ labelTr: "'Bana yaz' bağlantısı", text: link }] : []),
      { labelTr: "Hızlı yanıt: /fiyat", text: `Merhaba, ${input.productName} ${price}. Stokta var. Sipariş için bağlantı: ${input.link || "[Shopier bağlantısı]"}` },
      { labelTr: "Hızlı yanıt: /kargo", text: "Siparişiniz 1–3 iş günü içinde kargoya verilir; kargo takip numarasını buradan iletirim." },
      { labelTr: "Hızlı yanıt: /odeme", text: `Ödeme Shopier üzerinden kartla güvenle yapılır: ${input.link || "[Shopier bağlantısı]"}` }
    ],
    openUrl: link,
    openLabelTr: link ? "Bağlantıyı dene" : undefined
  });
}

function pinterest(input: MarketingPlanInput, copy: Copy): ChannelAdvice {
  const strong = input.channel === "etsy" && input.kind !== "tesbih";
  return advice("pinterest", "Pinterest", strong ? "now" : "later", {
    whyTr: strong
      ? "ABD'li alıcı planlayıcı, desen, ev dekoru ve moda fikrini Pinterest'te arar; bir pin aylarca trafik getirir. Uygulamadaki Pinterest bölümü pinleri sizin yerinize sırayla paylaşır."
      : "Pinterest ABD ağırlıklıdır; Türk alıcı için etkisi düşüktür. Etsy'ye açılınca ilk kanal olur.",
    stepsTr: ["Etsy → Pinterest bölümünden hesabı bağlayın.", "Her ürün için 3–5 farklı dikey (2:3) görsel pinleyin; hepsi ilan bağlantısına gitsin."],
    copy: [{ labelTr: "Pin başlığı ve açıklaması (İngilizce)", text: `${copy.pinTitleEn}\n\n${copy.pinDescriptionEn}` }]
  });
}

export const MARKETING_RULES_TR = [
  "Takipçi, beğeni veya yorum satın almayın: hesap kısıtlanır, reklamlar yanlış kişilere gider.",
  "Tanımadığınız kişilere toplu DM, WhatsApp veya SMS atmayın; hesap ya da numara toplamayın. Meta hesabı kapatır; Türkiye'de ticari mesaj için önceden izin (İYS kaydı) gerekir.",
  "Etsy ilanına ve Etsy mesajlarına WhatsApp, Instagram veya Shopier bağlantısı yazmayın; Etsy alıcıyı dışarı yönlendirmeyi yasaklar.",
  "Reklama ilan hazır olunca başlayın: net fotoğraflar, doğru başlık, rakiple uyumlu fiyat. Kötü ilana reklam para yakar.",
  "Bir seferde tek şeyi değiştirin ve sonucu ölçün: Etsy reklamında 30 gün, Instagram öne çıkarmada 3–5 gün."
];

export async function buildMarketingPlan(input: MarketingPlanInput, env: AiRuntimeEnv = {}): Promise<MarketingPlan> {
  const { copy, ai } = await writeCopy(input, env);
  const margin = input.profitTry && input.priceTry ? Math.min(1, input.profitTry / input.priceTry) : undefined;
  const channels = input.channel === "etsy"
    ? [etsyOffers(), etsyAds(input, margin), offsiteAds(margin), instagram(input, copy), pinterest(input, copy), facebook(input, copy), whatsapp(input, copy)]
    : [instagram(input, copy), whatsapp(input, copy), facebook(input, copy), pinterest(input, copy)];
  const first = channels.filter((item) => item.decision === "now" || item.decision === "always").map((item) => item.titleTr);
  return {
    headlineTr: `${input.productName} (${KIND_TR[input.kind]}, ${input.channel === "etsy" ? "Etsy" : "Shopier"}) için önce: ${first.slice(0, 3).join(", ")}.`,
    channel: input.channel,
    channels,
    rulesTr: MARKETING_RULES_TR,
    aiCopy: ai
  };
}
