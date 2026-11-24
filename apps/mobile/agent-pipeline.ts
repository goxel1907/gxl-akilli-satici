import type { Assistant } from "./assistants";
import type { AgentTeam } from "./agent-team";

// Ajan hattı: üründen yayına her iş bir ajana verilir. "goxi" ajanları uygulama ve sunucuda kendiliğinden çalışır
// (Etsy araştırması, satış kanıtı, fiyat, SEO, dosya denetimi, otomatik denetim, taslak). Yapay zekâ ajanları ajan
// ekibine göre ChatGPT, Claude veya Gemini'ye gider (uygulama onları kendisi çalıştıramaz; talimatı paylaşır, sonucu
// geri alır). "seller" adımları yalnız satıcının yapabildikleridir: fotoğraf çekmek, Etsy'de yayınla ve ödeme.
export type AgentOwner = "goxi" | "seller" | Assistant;
export interface PipelineAgent { id: string; nameTr: string; taskTr: string; owner: AgentOwner; stage: number }
export type AgentState = "done" | "active" | "waiting";

// Dijital aşamalar listing-progress adımlarıyla aynıdır: 1 araştırma, 2 üretim, 3 yükleme, 4 Etsy taslağı, 5 yayın, 6 yayın sonrası.
export function digitalPipeline(team: AgentTeam): PipelineAgent[] {
  return [
    { id: "trend", nameTr: "Trend Ajanı", taskTr: "Etsy'de aranan, talebi artan konuları tarar; talebi zayıf konuyu önermez.", owner: "goxi", stage: 1 },
    { id: "proof", nameTr: "Satış Kanıtı Ajanı", taskTr: "En çok yorum alan ve mağaza satışı yüksek rakipleri bulur.", owner: "goxi", stage: 1 },
    { id: "pick", nameTr: "Ürün Seçim Ajanı", taskTr: "Talebi kanıtlı, rakibi geçilebilir ürünü ve içerik sayısını seçer.", owner: "goxi", stage: 1 },
    { id: "differ", nameTr: "Farklılaştırma Ajanı", taskTr: "Rakiplerin eksiğini, kapak rengini ve bizi öne çıkaracak farkı belirler.", owner: "goxi", stage: 1 },
    { id: "price", nameTr: "Fiyat Ajanı", taskTr: "Satan rakiplerin fiyat aralığında, zarar ettirmeyen fiyatı önerir.", owner: "goxi", stage: 1 },
    { id: "seo", nameTr: "SEO Ajanı", taskTr: "Başlık, 13 etiket ve açıklamayı alıcının arama ifadesiyle yazar.", owner: "goxi", stage: 1 },
    { id: "produce", nameTr: "Üretim Ajanı", taskTr: "Ürün dosyalarını (PDF/ZIP) ve kodla yapılan ilan görsellerini üretir; otomatik kalite betiğini çalıştırır.", owner: team.producer, stage: 2 },
    { id: "visual", nameTr: "Görsel Ajanı", taskTr: "Kapak zeminini ve iki kullanım sahnesini üretir; kapak rakiplerden dikkat çekici olur.", owner: team.visuals, stage: 2 },
    { id: "qa", nameTr: "Kalite Ajanı", taskTr: "Yüklenen dosyaları açar: bozuk, eksik format, tehlikeli dosya ve sayı uyuşmazlığını yakalar.", owner: "goxi", stage: 3 },
    { id: "review", nameTr: "Denetçi Ajanı", taskTr: "İlanı satan rakiplere göre puanlar; 'rakipten iyi mi?' kapısı geçmeden yayına geçilmez.", owner: "goxi", stage: 3 },
    { id: "second", nameTr: "İkinci Görüş Ajanı", taskTr: "Başka bir yapay zekâ görselleri de görerek ilanı yeniden denetler.", owner: team.reviewer, stage: 3 },
    { id: "draft", nameTr: "Yayın Ajanı", taskTr: "Dosyalar, görseller, başlık, etiket, fiyat ve kategoriyle Etsy taslağını açar.", owner: "goxi", stage: 4 },
    { id: "publish", nameTr: "Sen: yayınla", taskTr: "Taslağı Etsy'de kontrol edip Yayınla'ya basarsın (Etsy kuralı gereği yayın sende).", owner: "seller", stage: 5 },
    { id: "ads", nameTr: "Reklam Ajanı", taskTr: "İlana özel reklam kararı, bütçe ve durdurma kuralı hazırlar; ödemeyi sen yaparsın.", owner: "goxi", stage: 6 },
    { id: "track", nameTr: "Takip Ajanı", taskTr: "Yayın durumunu, ziyaret ve siparişleri izler; kapak/fiyat denemesini önerir.", owner: "goxi", stage: 6 }
  ];
}

// Fiziksel aşamalar physicalListingProgress ile aynıdır: 1 fotoğraf, 2 bilgi, 3 özellik, 4 fiyat/kargo, 5 araştırma ve ilan,
// 6 Etsy taslağı ve yayın, 7 yayın sonrası.
export function physicalPipeline(team: AgentTeam): PipelineAgent[] {
  return [
    { id: "shoot", nameTr: "Sen: fotoğraf ve video", taskTr: "Ürünün 5-10 gerçek fotoğrafını ve 5-15 sn videosunu çekersin.", owner: "seller", stage: 1 },
    { id: "photo", nameTr: "Stüdyo Fotoğraf Ajanı", taskTr: "Gerçek fotoğraflardan kodla stüdyo kapak ve galeri görselleri yapar; ürünü asla yeniden çizmez.", owner: team.photoEditor, stage: 1 },
    { id: "full", nameTr: "Tam İlan Ajanı", taskTr: "Fotoğraf ve videodan ürünü tanır; İngilizce başlık, 13 etiket, açıklama, fiyat ve kargo JSON'unu verir.", owner: team.listingWriter, stage: 1 },
    { id: "recognize", nameTr: "Tanıma Ajanı", taskTr: "Fotoğrafa bakıp ürün türünü, malzemeyi ve İngilizce adı önerir.", owner: "goxi", stage: 2 },
    { id: "rules", nameTr: "Uygunluk Ajanı", taskTr: "Kim yaptı sorusu, marka/IP riski ve doğrulanmamış gümüş/altın iddiasını denetler.", owner: "goxi", stage: 2 },
    { id: "ship", nameTr: "Kargo ve Fiyat Ajanı", taskTr: "Shipentegra ücretini fiyata ekler; alıcı ücretsiz kargo görür, eline geçecek tutar hesaplanır.", owner: "goxi", stage: 4 },
    { id: "proof", nameTr: "Satış Kanıtı Ajanı", taskTr: "Aynı üründe en çok yorum alan ve satan rakipleri bulur.", owner: "goxi", stage: 5 },
    { id: "seo", nameTr: "SEO Ajanı", taskTr: "Başlık ve 13 etiketi ABD'li alıcının arama ifadesiyle yazar; Türkçe kelime bırakmaz.", owner: "goxi", stage: 5 },
    { id: "review", nameTr: "Denetçi Ajanı", taskTr: "İlanı satan rakiplere göre puanlar; 'rakipten iyi mi?' kapısını uygular.", owner: "goxi", stage: 5 },
    { id: "second", nameTr: "İkinci Görüş Ajanı", taskTr: "Başka bir yapay zekâ fotoğrafları da görerek ilanı yeniden denetler.", owner: team.reviewer, stage: 5 },
    { id: "draft", nameTr: "Yayın Ajanı", taskTr: "Taslağı açar; kategori, iade politikası, hazırlık süresi ve ücretsiz kargo profilini tamamlar, onayınla yayınlar.", owner: "goxi", stage: 6 },
    { id: "ads", nameTr: "Reklam Ajanı", taskTr: "İlana özel reklam planı hazırlar; ödemeyi sen yaparsın.", owner: "goxi", stage: 7 },
    { id: "track", nameTr: "Takip Ajanı", taskTr: "Yayın durumunu ve siparişleri izler.", owner: "goxi", stage: 7 }
  ];
}

export function agentState(agent: PipelineAgent, stage: number, complete = false): AgentState {
  if (complete || agent.stage < stage) return "done";
  return agent.stage === stage ? "active" : "waiting";
}
