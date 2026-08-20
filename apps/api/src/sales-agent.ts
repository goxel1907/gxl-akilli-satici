import { generateStructuredObject, type AiRuntimeEnv } from "./structured-ai.js";

export type CatalogProduct = {
  id: string;
  title: string;
  url?: string;
  price?: number;
  currency?: string;
};

export type OpportunitySource = {
  id: string;
  name: string;
  status: "active" | "ready" | "setup_required" | "deferred" | "research_only";
  mode: "inbound" | "consented" | "research";
  explanation: string;
  nextStep: string;
};

type AgentContext = {
  catalog: CatalogProduct[];
  shopierConnected: boolean;
  etsyAuthorized: boolean;
  etsyShopReady: boolean;
  sources: OpportunitySource[];
};

const categoryRules: Array<{ words: string[]; audiences: string[] }> = [
  { words: ["tesbih", "gümüş", "takı", "kolye", "bileklik", "yüzük"], audiences: ["koleksiyon ve hediye arayanlar", "el işçiliği ve kişiselleştirilmiş takı ilgisi olanlar", "ürün gönderilerine kaydetme veya soru sinyali verenler"] },
  { words: ["oyuncak", "figür", "koleksiyon", "vintage"], audiences: ["koleksiyoncular", "nostaljik hediye arayanlar", "ürünün seri veya karakter adını arayanlar"] },
  { words: ["triko", "tekstil", "kazak", "aksesuar"], audiences: ["butik ve el emeği ürün takipçileri", "beden veya renk sorusu soranlar", "sezonluk hediye arayanlar"] },
  { words: ["hobi", "malzeme", "boncuk", "ip", "kit"], audiences: ["hobi üreticileri", "kendin yap toplulukları", "malzeme ve set araması yapanlar"] },
  { words: ["çakı", "bıçak"], audiences: ["yasal kullanım ve koleksiyon amaçlı ürün arayan yetişkinler", "kamp ve outdoor ilgisi olan yetişkinler", "ürün güvenliği ve yerel mevzuat bilgisi isteyenler"] }
];

function audiencesFor(title: string): string[] {
  const normalized = title.toLocaleLowerCase("tr-TR");
  return categoryRules.find((rule) => rule.words.some((word) => normalized.includes(word)))?.audiences
    || ["ürün kategorisiyle ilgili arama yapanlar", "benzer ürünlere kaydetme veya soru sinyali verenler", "hediye ve özel üretim arayanlar"];
}

export function buildOpportunityRadar(context: Omit<AgentContext, "sources">) {
  const sources: OpportunitySource[] = [
    {
      id: "shopier-inbound",
      name: "Shopier sipariş ve soruları",
      status: context.shopierConnected ? "active" : "setup_required",
      mode: "inbound",
      explanation: "Sipariş ve izinli müşteri sinyalleri ürünlerle eşleştirilir. Anonim mağaza ziyaretçilerinin kimliği alınmaz.",
      nextStep: context.shopierConnected ? "Yeni sipariş ve soruları takip et" : "Shopier erişimini doğrula"
    },
    {
      id: "etsy-inbound",
      name: "Etsy arama ve mesajları",
      status: context.etsyShopReady ? "active" : context.etsyAuthorized ? "ready" : "setup_required",
      mode: "inbound",
      explanation: "Mağaza açıldığında Etsy içi arama, favori, sipariş ve mesaj sinyalleri kullanılır.",
      nextStep: context.etsyShopReady ? "Etsy fırsatlarını takip et" : context.etsyAuthorized ? "Mağaza açılışını tamamla" : "Etsy hesabını yetkilendir"
    },
    {
      id: "email-inbound",
      name: "E-posta talepleri",
      status: "ready",
      mode: "inbound",
      explanation: "gxl.marketstudio@gmail.com adresine gelen ürün soruları ve yanıt veren kişiler puanlanabilir.",
      nextStep: "Gmail bağlantısı kurulduğunda gelen talepleri içe aktar"
    },
    {
      id: "meta-engagement",
      name: "Instagram / Facebook etkileşimleri",
      status: "setup_required",
      mode: "consented",
      explanation: "Mesaj, yorum, reklam formu ve sayfa etkileşimleri; platform izinleri ölçüsünde değerlendirilir.",
      nextStep: "Meta işletme hesabını bağla"
    },
    {
      id: "whatsapp-optin",
      name: "WhatsApp izinli kişiler",
      status: "setup_required",
      mode: "consented",
      explanation: "Yalnızca size yazan veya açık iletişim izni veren kişiler için ilk temas taslağı hazırlanır.",
      nextStep: "WhatsApp Business Cloud API bağlantısı kur"
    },
    {
      id: "forms-referrals",
      name: "Formlar, fuarlar ve yönlendirmeler",
      status: "ready",
      mode: "consented",
      explanation: "QR formu, etkinlik kaydı ve tavsiye ile izin veren kişiler ürün ilgisine göre eşleştirilir.",
      nextStep: "İzinli kişi veya form kayıtlarını ekle"
    },
    {
      id: "public-trends",
      name: "Açık web trend araştırması",
      status: "research_only",
      mode: "research",
      explanation: "Kamuya açık arama ve pazar eğilimlerinden ürün ve hedef kitle fırsatı çıkarılır; kişisel veri toplanmaz ve otomatik mesaj atılmaz.",
      nextStep: "Trend raporundan kampanya ve ürün fikri üret"
    },
    {
      id: "letgo-manual",
      name: "Letgo",
      status: "deferred",
      mode: "inbound",
      explanation: "Ücretli ilan nedeniyle arka planda tutulur; hazır ilan metni ve manuel devralma akışı korunur.",
      nextStep: "Gerektiğinde ilanı manuel aç"
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      firstContactApprovalRequired: true,
      unsolicitedBulkMessaging: false,
      anonymousVisitorIdentification: false,
      automaticSendEnabled: false
    },
    sources,
    matches: context.catalog.map((product) => ({
      productId: product.id,
      productTitle: product.title,
      audiences: audiencesFor(product.title),
      recommendedSources: sources
        .filter((source) => source.status === "active" || source.status === "ready" || source.status === "research_only")
        .slice(0, 4)
        .map((source) => source.name)
    }))
  };
}

const agentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "actions", "warnings", "requiresApproval", "sourceScope"],
  properties: {
    answer: { type: "string" },
    actions: { type: "array", maxItems: 5, items: { type: "string" } },
    warnings: { type: "array", maxItems: 5, items: { type: "string" } },
    requiresApproval: { type: "boolean" },
    sourceScope: { type: "array", maxItems: 8, items: { type: "string" } }
  }
};

export async function answerSalesAgent(message: string, context: AgentContext, env: AiRuntimeEnv) {
  const fallback = {
    answer: `Kataloğunuzdaki ${context.catalog.length} ürün için fırsat radarı hazır. Shopier gelen talepleri, Etsy mağazası açıldığında Etsy sinyallerini, e-posta taleplerini, izinli form kayıtlarını ve açık web trendlerini birlikte değerlendirebilirim. Kimliği belirsiz ziyaretçileri tespit edemem; izinsiz kişilere toplu mesaj göndermem.`,
    actions: [
      "Ürünü seç ve hedef müşteri segmentini oluştur",
      "İzinli veya gelen etkileşimleri puanla",
      "İlk temas mesajını onaya sun",
      "Onaydan sonra doğru kanala manuel devret"
    ],
    warnings: ["Gerçek müşteri kimliği yalnızca bağlı kanalın izin verdiği gelen veya izinli sinyallerden oluşabilir."],
    requiresApproval: true,
    sourceScope: context.sources.map((source) => source.name)
  };

  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return fallback;

  try {
    return await generateStructuredObject<typeof fallback>({
      prompt: [
        "Sen GXL Market Studio için Türkçe çalışan, doğruluk ve platform kurallarına bağlı bir satış ajanısın.",
        "Kullanıcının isteğine doğrudan cevap ver; yapılmamış bir işlemi yapılmış gibi söyleme.",
        "Potansiyel müşterileri sadece gelen mesaj, gerçek etkileşim, sipariş, açık rıza, reklam/form izni, yönlendirme veya izinli e-posta gibi meşru sinyallerden puanla.",
        "Açık web ve pazar trendleri yalnızca segment, kampanya ve ürün fırsatı üretir; kişisel kimlik çıkarmak veya izinsiz mesaj göndermek için kullanılamaz.",
        "İlk temas her zaman kullanıcı onayına gider. Bağlı ve yetkili gönderim kanalı yoksa otomatik gönderim yaptığını iddia etme.",
        "Etsy'de yalnızca satıcının ürettiği/tasarladığı ürünler, uygun el işi malzemeleri veya Etsy'nin güncel vintage yaş koşulunu sağlayan ürünler için öneri ver. Belirsiz özellikleri doğrulanmış gibi yazma.",
        "Çakı/bıçak gibi düzenlemeye tabi ürünlerde yaş, gönderim ve ülke kurallarını kontrol etmeden yayın veya hedefleme önerme.",
        `Kanal durumu: Shopier=${context.shopierConnected ? "bağlı" : "bağlı değil"}, Etsy hesap yetkisi=${context.etsyAuthorized ? "var" : "yok"}, Etsy mağazası=${context.etsyShopReady ? "açık" : "açık değil"}.`,
        `Katalog: ${JSON.stringify(context.catalog.slice(0, 20))}`,
        `Fırsat kaynakları: ${JSON.stringify(context.sources)}`,
        `Kullanıcı mesajı: ${message}`
      ].join("\n"),
      schemaName: "gxl_sales_agent_answer",
      schema: agentSchema
    }, env);
  } catch {
    return fallback;
  }
}
