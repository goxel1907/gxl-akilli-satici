import { trendFreshness } from "../../mobile/trend-priority.js";
import {
  generateStructuredObject,
  hasAiProvider,
  type AiRuntimeEnv,
} from "./structured-ai.js";

export type OpportunityKind =
  | "real_customer"
  | "permissioned_prospect"
  | "market_signal";

export type SourceStatus = "live" | "ready" | "planned" | "manual" | "paused";

export interface CatalogProduct {
  id: string;
  title: string;
  url?: string;
  stockStatus?: string;
  stockQuantity?: number;
  price?: number | string;
  currency?: string;
}

export interface OpportunityContext {
  shopier?: {
    configured: boolean;
    connected: boolean;
    productCount?: number;
    recentOrderCount?: number;
    orderWindowDays?: number;
    checkedAt?: string;
    error?: string;
    message?: string;
    products?: CatalogProduct[];
  };
  etsy?: {
    configured: boolean;
    storageConfigured?: boolean;
    connected: boolean;
    shopId?: number | string;
    shopName?: string;
  };
  productIdeas?: {
    checkedAt: string;
    method: string;
    items: Array<{ keyword: string; labelTr?: string; group: string; kind?: string; score: number; scannedAt: string; sampleSize?: number; medianPriceUsd?: number; reason: string }>;
  };
  catalogProducts?: CatalogProduct[];
  prospects?: Array<{
    id: string;
    kind: "real_customer" | "permissioned_prospect";
    sourceId: string;
    sourceName: string;
    displayName: string;
    evidence: string;
    score: number;
    contactAllowed: boolean;
    productId?: string;
  }>;
}

export interface OpportunitySource {
  id: string;
  name: string;
  category: string;
  status: SourceStatus;
  kind: OpportunityKind;
  evidenceMode: string;
  canMessage: boolean;
  approvalRequired: boolean;
  note: string;
}

export interface SalesOpportunity {
  id: string;
  kind: OpportunityKind;
  sourceId: string;
  sourceName: string;
  title: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
  nextAction: string;
  contactAllowed: boolean;
  approvalRequired: boolean;
  productId?: string;
}

export interface OpportunityCenter {
  sources: OpportunitySource[];
  opportunities: SalesOpportunity[];
  counts: {
    realCustomers: number;
    permissionedProspects: number;
    marketSignals: number;
  };
  summary: string;
  guardrails: string[];
}

export interface AgentReply {
  reply: string;
  basis: string[];
  warnings: string[];
  suggestedActions: string[];
  requiresApproval: boolean;
}

const GUARDRAILS = [
  "Kişisel veri kazıma, sahte hesap veya izinsiz toplu mesaj yok.",
  "İlk dış temas, açık izin ya da gerçek bir gelen talep yoksa işletme sahibi onayı ister.",
  "Pazar sinyalleri müşteri gibi gösterilmez; kaynak ve kanıt türü açıkça belirtilir.",
  "Ürün ve malzeme özellikleri doğrulanmadan kesin bilgi olarak yazılmaz.",
];

export function buildOpportunitySources(context: OpportunityContext): OpportunitySource[] {
  const shopierLive = Boolean(context.shopier?.connected);
  const etsyLive = Boolean(context.etsy?.connected);

  return [
    {
      id: "shopier",
      name: "Shopier",
      category: "Mağaza ve sipariş",
      status: shopierLive ? "live" : context.shopier?.configured ? "ready" : "planned",
      kind: "real_customer",
      evidenceMode: "Ürün, sipariş ve müşterinin başlattığı mağaza etkileşimi",
      canMessage: false,
      approvalRequired: true,
      note: shopierLive
        ? "Canlı ürün ve sipariş verisi okunuyor. Gelen talep olmadan müşteriye mesaj atılmaz."
        : "Bağlantı tamamlandığında canlı mağaza verisi okunur.",
    },
    {
      id: "etsy",
      name: "Etsy",
      category: "Uluslararası pazar yeri",
      status: etsyLive ? "live" : context.etsy?.configured ? "ready" : "planned",
      kind: "real_customer",
      evidenceMode: "Mağaza soruları, siparişler ve ilan performansı",
      canMessage: false,
      approvalRequired: true,
      note: etsyLive
        ? "Etsy mağaza verisi kullanılabilir."
        : "API hazır; mağaza kurulup yetki verilince canlı çalışır.",
    },
    {
      id: "marketplace_inbound",
      name: "Pazar yeri gelen soruları",
      category: "Gelen talep",
      status: "ready",
      kind: "real_customer",
      evidenceMode: "Müşterinin kendisinin başlattığı soru veya teklif",
      canMessage: true,
      approvalRequired: false,
      note: "Gerçek sorular müşteri olarak kaydedilir; yanıt taslağı ajan tarafından hazırlanır.",
    },
    {
      id: "permissioned_email_forms",
      name: "İzinli e-posta ve formlar",
      category: "İzinli aday",
      status: "ready",
      kind: "permissioned_prospect",
      evidenceMode: "Açık iletişim izni, talep formu veya e-posta aboneliği",
      canMessage: true,
      approvalRequired: true,
      note: "İlk mesaj onaya gelir; onaydan sonra izin kapsamındaki takip otomatikleşebilir.",
    },
    {
      id: "search_trends",
      name: "Arama eğilimleri",
      category: "Talep araştırması",
      status: context.productIdeas?.items.length ? "live" : context.productIdeas ? "ready" : "planned",
      kind: "market_signal",
      evidenceMode: "Etsy arama örneklemindeki favori ilgisi, rekabet, yeni ilan payı ve fiyat",
      canMessage: false,
      approvalRequired: false,
      note: "Güncel fırsat puanları ürün fikri verir; gerçek arama hacmi veya satış olasılığı ölçülmez.",
    },
    {
      id: "community_signals",
      name: "Topluluk ve forum sinyalleri",
      category: "İhtiyaç araştırması",
      status: "planned",
      kind: "market_signal",
      evidenceMode: "Kişisel veri toplamadan, toplu konu ve ihtiyaç örüntüsü",
      canMessage: false,
      approvalRequired: false,
      note: "Hangi ürün ve içeriklerin ilgi gördüğünü anlamak için kullanılır.",
    },
    {
      id: "public_b2b_requests",
      name: "Açık B2B alım talepleri",
      category: "Kurumsal fırsat",
      status: "manual",
      kind: "market_signal",
      evidenceMode: "Kamuya açık ve doğrulanabilir alım talebi",
      canMessage: false,
      approvalRequired: true,
      note: "Talep ve işletme doğrulanmadan aday ya da müşteri sayılmaz.",
    },
    {
      id: "meta_channels",
      name: "Meta, WhatsApp ve Instagram",
      category: "Sosyal ve mesajlaşma",
      status: "planned",
      kind: "permissioned_prospect",
      evidenceMode: "Gelen mesaj, reklam formu veya açık iletişim izni",
      canMessage: true,
      approvalRequired: true,
      note: "Kaynaklardan yalnızca biri; sistem bununla sınırlı değildir.",
    },
    {
      id: "letgo",
      name: "Letgo",
      category: "Pazar yeri",
      status: "paused",
      kind: "real_customer",
      evidenceMode: "İlan soruları ve teklifler",
      canMessage: false,
      approvalRequired: true,
      note: "Ücretli ilan nedeniyle şimdilik manuel ve arka planda tutuluyor.",
    },
  ];
}

export function buildOpportunityCenter(context: OpportunityContext): OpportunityCenter {
  const sources = buildOpportunitySources(context);
  const opportunities: SalesOpportunity[] = [];
  const shopier = context.shopier;
  const shopierProducts = shopier?.products ?? [];

  for (const prospect of context.prospects ?? []) {
    opportunities.push({
      id: `prospect-${prospect.id}`,
      kind: prospect.kind,
      sourceId: prospect.sourceId,
      sourceName: prospect.sourceName,
      title: prospect.displayName,
      evidence: prospect.evidence,
      confidence: "high",
      nextAction: prospect.contactAllowed
        ? "İlgilendiği ürüne göre kişiselleştirilmiş ilk mesaj taslağını onaya sun."
        : "Mesaj gönderme; yeni bir gelen talep veya açık iletişim izni bekle.",
      contactAllowed: prospect.contactAllowed,
      approvalRequired: true,
      productId: prospect.productId,
    });
  }

  for (const idea of (context.productIdeas?.items || []).filter(item => trendFreshness(item) === "fresh").sort((a, b) => b.score - a.score)) {
    opportunities.push({ id: `trend-${idea.keyword}`, kind: "market_signal", sourceId: "search_trends", sourceName: "Etsy trend araştırması",
      title: `Ürün fikri: ${idea.labelTr || idea.keyword}`, evidence: `${idea.keyword}: ${idea.score}/100 fırsat puanı; tarama ${idea.scannedAt}; örneklem ${idea.sampleSize ?? "bilinmiyor"}. ${idea.reason}`,
      confidence: idea.sampleSize !== undefined && idea.sampleSize >= 20 ? "medium" : "low",
      nextAction: `${idea.keyword} aramasıyla ürün türüne özel rakip analizi yap; ardından özgün ürün paketini hazırla.`, contactAllowed: false, approvalRequired: false });
  }

  if (shopier?.connected && (shopier.productCount ?? 0) > 0) {
    opportunities.push({
      id: "shopier-demand-test",
      kind: "market_signal",
      sourceId: "shopier",
      sourceName: "Shopier",
      title: "Shopier ürünleri için ölçülebilir talep testi",
      evidence: `${shopier.productCount ?? 0} ürün canlı; son ${shopier.orderWindowDays ?? 30} günde ${shopier.recentOrderCount ?? 0} sipariş görüldü.`,
      confidence: "high",
      nextAction: "Ürün bağlantısını izinli kanallarda paylaş, görüntülenme ve sipariş dönüşümünü ölç.",
      contactAllowed: false,
      approvalRequired: true,
    });

    for (const product of shopierProducts.slice(0, 5)) {
      opportunities.push({
        id: `shopier-product-${product.id}`,
        kind: "market_signal",
        sourceId: "shopier",
        sourceName: "Shopier",
        title: `Başlık, görsel ve fiyat deneyi: ${product.title}`,
        evidence: `Canlı Shopier ürünü${product.price ? `; fiyat ${product.price} ${product.currency ?? ""}` : ""}.`,
        confidence: "high",
        nextAction: "Ajanla SEO başlığı ve iki içerik varyasyonu üret; yalnızca gerçek performans verisiyle kazananı seç.",
        contactAllowed: false,
        approvalRequired: false,
        productId: product.id,
      });
    }
  }

  if (!context.etsy?.connected) {
    opportunities.push({
      id: "etsy-ready-when-shop-opens",
      kind: "market_signal",
      sourceId: "etsy",
      sourceName: "Etsy",
      title: "Etsy mağazası açıldığında bağlantıyı tamamla",
      evidence: context.etsy?.configured
        ? "Etsy API anahtarları hazır; mağaza yetkilendirmesi henüz tamamlanmadı."
        : "Etsy bağlantısı henüz yapılandırılmadı.",
      confidence: "high",
      nextAction: "Mağaza kurulumu tamamlanınca OAuth bağlantısını aç ve ilk ürünü taslak olarak hazırla.",
      contactAllowed: false,
      approvalRequired: true,
    });
  }

  opportunities.push({
    id: "permissioned-demand-form",
    kind: "market_signal",
    sourceId: "permissioned_email_forms",
    sourceName: "İzinli e-posta ve formlar",
    title: "Ürün talep ve haber verme formu oluştur",
    evidence: context.prospects?.some(item => item.kind === "permissioned_prospect" && item.contactAllowed) ? "İzinli aday kayıtları mevcut; yeni talepler için izin kapsamı açık bir form kullanılabilir." : "Henüz doğrulanmış izinli aday kaydı yok.",
    confidence: "high",
    nextAction: "İlgilendiği ürün türü ve iletişim izni alan kısa bir form yayınla; yalnızca onay verenleri puanla.",
    contactAllowed: false,
    approvalRequired: true,
  });

  const counts = opportunities.reduce(
    (result, opportunity) => {
      if (opportunity.kind === "real_customer") result.realCustomers += 1;
      if (opportunity.kind === "permissioned_prospect") result.permissionedProspects += 1;
      if (opportunity.kind === "market_signal") result.marketSignals += 1;
      return result;
    },
    { realCustomers: 0, permissionedProspects: 0, marketSignals: 0 },
  );

  const summary = counts.realCustomers || counts.permissionedProspects
    ? `${counts.realCustomers} gerçek müşteri ve ${counts.permissionedProspects} izinli aday bulundu.`
    : `Şu an doğrulanmış müşteri adayı yok; ${counts.marketSignals} pazar sinyali ve test önerisi hazır.`;

  return { sources, opportunities, counts, summary, guardrails: GUARDRAILS };
}

function fallbackReply(message: string, context: OpportunityContext): AgentReply {
  const normalized = message.toLocaleLowerCase("tr-TR");
  const center = buildOpportunityCenter(context);
  const shopier = context.shopier;
  const unsafeRequest = /(izinsiz|toplu mesaj|herkese mesaj|scrape|kazı|telefonları bul|mailleri bul)/i.test(normalized);

  if (unsafeRequest) {
    return {
      reply: "Kişisel veri kazıma veya izinsiz toplu mesaj gönderme yapamam. Bunun yerine açık talep bırakanları, gelen soruları ve iletişim izni veren adayları bulup puanlayabilirim; ilk mesajı onayınıza sunarım.",
      basis: GUARDRAILS.slice(0, 3),
      warnings: ["İzinsiz iletişim, platform kurallarına ve veri koruma yükümlülüklerine aykırı olabilir."],
      suggestedActions: ["İzinli talep formu oluştur", "Shopier ürün bağlantıları için ölçülebilir içerik testi başlat"],
      requiresApproval: true,
    };
  }

  if (/(trend|ürün fikri|hangi ürün|ne sat|fırsat|öncelik|yeni ürün)/i.test(normalized)) {
    const items = (context.productIdeas?.items || []).filter(item => trendFreshness(item) === "fresh");
    const group = /tesbih|gümüş/.test(normalized) ? "tesbih" : /vintage/.test(normalized) ? "vintage" : /örgü|desen/.test(normalized) ? "patterns" : "printables";
    const ideas = items.filter(item => item.group === group).sort((a, b) => b.score - a.score).slice(0, 5);
    return {
      reply: ideas.length ? `Güncel taranan adaylar içinde öncelik sırası: ${ideas.map((item, index) => `${index + 1}) ${item.labelTr || item.keyword}: ${item.score}/100`).join("; ")}. Puan satış veya dikkat çekme olasılığı değildir; en güçlü aramadan ürün türüne özel rakip analiziyle başlayın.` : "Bu grupta son 6 saatte doğrulanmış ürün fikri yok. Etsy → Trendler bölümünde aramaları yeniden tarayın; eski veya taranmamış fikirleri en güçlü fırsat diye sıralamıyorum.",
      basis: ideas.map(item => `${item.keyword} · ${item.scannedAt} · ${item.sampleSize ?? "bilinmeyen"} ilanlık örneklem`),
      warnings: ["Favori ilgisi satış değildir; görselin dikkat çekmesini ve dönüşümü ancak gerçek ilan deneyiyle ölçebiliriz."],
      suggestedActions: ideas.length ? ideas.slice(0, 3).map(item => `${item.keyword} için rakip analizi hazırla`) : ["Etsy → Trendler bölümünde seçili grubu tara"], requiresApproval: false
    };
  }

  const asksStatus = /(durum|shopier|hazır|bağlı|kaç ürün|sipariş)/i.test(normalized);
  if (asksStatus) {
    const shopierLine = shopier?.connected
      ? `Shopier bağlı: ${shopier.productCount ?? 0} ürün ve son ${shopier.orderWindowDays ?? 30} günde ${shopier.recentOrderCount ?? 0} sipariş görünüyor.`
      : "Shopier şu anda canlı bağlı görünmüyor.";
    const etsyLine = context.etsy?.connected
      ? "Etsy mağazası bağlı."
      : context.etsy?.configured
        ? "Etsy teknik ayarları hazır ancak mağaza bağlantısı tamamlanmamış."
        : "Etsy henüz yapılandırılmamış.";
    return {
      reply: `${shopierLine} ${etsyLine} Bunları gerçek müşteri olarak saymıyorum; şu an ${center.counts.marketSignals} doğrulanabilir pazar sinyali/test önerisi var.`,
      basis: [center.summary],
      warnings: [],
      suggestedActions: uniqueActions(center),
      requiresApproval: true,
    };
  }

  return {
    reply: "Evet, yalnızca Meta/WhatsApp/Instagram’a bağlı kalmayacağım. Shopier ve Etsy mağaza verileri, gelen pazar yeri soruları, izinli e-posta/formlar, toplu arama eğilimleri, topluluk ihtiyaçları ve doğrulanmış açık B2B talepleri ayrı kaynaklar olarak izlenecek. Şu an gerçek veya izinli müşteri kaydı yoksa bunu açıkça söyler, pazar sinyallerinden satış testi üretirim.",
    basis: [center.summary, `${center.sources.length} farklı kaynak sınıfı tanımlı.`],
    warnings: ["Pazar sinyali müşteri değildir; kişiye mesaj atmak için gerçek talep veya açık izin gerekir."],
    suggestedActions: uniqueActions(center),
    requiresApproval: true,
  };
}


function uniqueActions(center: { opportunities: Array<{ nextAction: string }> }): string[] {
  return [...new Set(center.opportunities.map((item) => item.nextAction))].slice(0, 3);
}
export async function replyToAgent(
  message: string,
  context: OpportunityContext,
  env?: AiRuntimeEnv,
  history: Array<{ role: string; text: string }> = [],
): Promise<AgentReply> {
  if (/(hangi (yeni )?ürün|ürün (fikri|fikirleri|önerileri)|ne sat|fırsatları.*sırala|trend.*sırala)/i.test(message.toLocaleLowerCase("tr-TR"))) return fallbackReply(message, context);
  if (!env || !hasAiProvider(env)) return fallbackReply(message, context);

  try {
    return await generateStructuredObject<AgentReply>({
      prompt: [
        "Sen GXL işletme sahibinin satış ajanısın.",
        "Yalnızca verilen canlı bağlamı gerçek veri say.",
        "Ürün fikirlerini productIdeas içindeki güncel puan sırasıyla öner; örneklem ve tarama zamanını belirt. Eski/taranmamış veriden en güçlü fikir veya satış/dikkat çekme olasılığı uydurma. Puan başarı yüzdesi değildir. Google Trends bağlantısı arama hacmi verisi sayılmaz.",
        "real_customer, permissioned_prospect ve market_signal kavramlarını asla birbirine karıştırma.",
        "Kişisel veri kazıma, izinsiz toplu mesaj, sahte etkileşim veya platform kuralı ihlali önerme.",
        "İlk dış temas her zaman işletme sahibi onayı gerektirir.",
        "Kısa, açık ve Türkçe cevap ver.",
        JSON.stringify({ message, history, context, opportunityCenter: buildOpportunityCenter(context) }),
      ].join("\n"),
      schemaName: "gxl_owner_agent_reply",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["reply", "basis", "warnings", "suggestedActions", "requiresApproval"],
        properties: {
          reply: { type: "string" },
          basis: { type: "array", items: { type: "string" } },
          warnings: { type: "array", items: { type: "string" } },
          suggestedActions: { type: "array", items: { type: "string" } },
          requiresApproval: { type: "boolean" },
        },
      },
    }, env);
  } catch {
    return fallbackReply(message, context);
  }
}
