import { etsyRequest, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";

type Fetcher = typeof fetch;

// İlan karnesi: Etsy ilanını yayına girmeden (ya da yayındayken) açık eşiklerle puanlar ve eksikleri Türkçe söyler.
// Eşikler Etsy'nin kendi sınırlarından (140 karakter başlık, 13 etiket, 20 karakter etiket, 10 fotoğraf) ve yaygın
// arama uygulamalarından gelir: aranan ifade başlığın başında, çok kelimeli etiketler, ölçü/malzeme/kargo bilgili açıklama.
// Bilinmeyen alan (ör. fotoğraf sayısı) puana katılmaz; puan yalnız ölçülen maddelerden hesaplanır.

export type ScoreArea = "title" | "tags" | "description" | "photos" | "price";

export interface ScoreCheck {
  id: string;
  area: ScoreArea;
  ok: boolean;
  points: number;
  max: number;
  titleTr: string;
  fixTr?: string;
}

export interface Scorecard {
  score: number;
  grade: "A" | "B" | "C" | "D";
  gradeTr: string;
  checks: ScoreCheck[];
}

export interface ScorecardInput {
  title: string;
  tags: string[];
  description: string;
  photoCount?: number;
  priceUsd?: number;
  medianPriceUsd?: number;
  primaryKeyword?: string;
  digital?: boolean;
}

const ACRONYMS = new Set(["PDF", "USA", "DIY", "SVG", "PNG", "XXL", "UK", "US", "XS", "XL", "A4", "A5"]);
const STOP = new Set(["with", "from", "your", "this", "that", "pattern", "gift"]);

const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{Nd}]+/gu) || [];

function check(id: string, area: ScoreArea, ok: boolean, max: number, titleTr: string, fixTr: string, partial?: number): ScoreCheck {
  const points = ok ? max : Math.max(0, Math.min(max, partial ?? 0));
  return { id, area, ok, points, max, titleTr, ...(ok ? {} : { fixTr }) };
}

export function normalizeScorecardInput(raw: Record<string, unknown>): ScorecardInput {
  const num = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };
  const photoCount = num(raw.photoCount);
  return {
    title: String(raw.title || "").replace(/\s+/g, " ").trim().slice(0, 300),
    tags: (Array.isArray(raw.tags) ? raw.tags : String(raw.tags || "").split(",")).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20),
    description: String(raw.description || "").slice(0, 12_000),
    photoCount: photoCount === undefined ? undefined : Math.floor(photoCount),
    priceUsd: num(raw.priceUsd) || undefined,
    medianPriceUsd: num(raw.medianPriceUsd) || undefined,
    primaryKeyword: String(raw.primaryKeyword || "").trim().toLowerCase() || undefined,
    digital: raw.digital === true
  };
}

export function scoreListing(input: ScorecardInput): Scorecard {
  const checks: ScoreCheck[] = [];
  const title = input.title.trim();
  const keyword = (input.primaryKeyword || input.tags[0] || "").toLowerCase().trim();

  // Başlık (30)
  checks.push(check("title_length", "title", title.length >= 30 && title.length <= 140, 8, "Başlık uzunluğu uygun (30–140 karakter)",
    title.length > 140 ? `Başlık ${title.length} karakter; Etsy en fazla 140 kabul eder. Sondaki ifadeleri kısaltın.` : `Başlık ${title.length} karakter; alıcının arayacağı ürün adı, malzeme ve kullanım yeri gibi bilgileri ekleyin.`));
  const front = title.toLowerCase().slice(0, 45);
  checks.push(check("title_keyword_front", "title", Boolean(keyword) && front.includes(keyword), 10, "Aranan ifade başlığın başında",
    keyword ? `"${keyword}" ifadesini başlığın en başına taşıyın; Etsy ve alıcı ilk kelimelere bakar.` : "Başlığın başına alıcının arayacağı ürün adını yazın."));
  const counts = new Map<string, number>();
  for (const word of words(title)) if (word.length >= 4 && !STOP.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  const repeated = [...counts.entries()].filter(([, count]) => count > 2).map(([word]) => word);
  checks.push(check("title_repeat", "title", repeated.length === 0, 6, "Başlıkta aynı kelime gereksiz tekrar edilmiyor",
    `"${repeated.join(", ")}" 2'den fazla geçiyor; tekrar yerine farklı bir arama ifadesi kullanın.`));
  const caps = (title.match(/\b[\p{Lu}]{4,}\b/gu) || []).filter((word) => !ACRONYMS.has(word));
  checks.push(check("title_caps", "title", caps.length <= 1, 3, "Başlık büyük harfle bağırmıyor", "TAMAMI BÜYÜK HARF kelimeleri normal yazın; Etsy ve alıcı bunu spam gibi görür."));
  const separators = (title.match(/[,|]/g) || []).length;
  checks.push(check("title_readable", "title", separators <= 4, 3, "Başlık okunaklı (az ayraç)", `Başlıkta ${separators} virgül/çizgi var; 3–4 parçadan uzun liste yerine sade bir cümle yazın.`));

  // Etiketler (25)
  const tags = input.tags;
  checks.push(check("tags_count", "tags", tags.length === 13, 10, "13 etiketin hepsi kullanılmış", `${tags.length} etiket var; Etsy 13 etikete izin verir, eksikleri doldurun.`, Math.round(10 * Math.min(tags.length, 13) / 13)));
  const long = tags.filter((tag) => tag.length > 20);
  checks.push(check("tags_length", "tags", long.length === 0, 5, "Etiketler 20 karakteri aşmıyor", `Etsy 20 karakterden uzun etiketi kabul etmez: ${long.join(", ")}.`));
  const multi = tags.filter((tag) => tag.trim().includes(" ")).length;
  checks.push(check("tags_multiword", "tags", multi >= 8, 5, "Etiketlerin çoğu çok kelimeli", `Çok kelimeli etiket sayısı ${multi}; tek kelime yerine alıcının yazdığı ifadeleri kullanın (ör. "silver prayer beads").`, Math.round(5 * multi / 8)));
  const lower = tags.map((tag) => tag.toLowerCase());
  checks.push(check("tags_unique", "tags", new Set(lower).size === lower.length, 5, "Tekrarlanan etiket yok", "Aynı etiket iki kez yazılmış; tekrarı silip yeni bir arama ifadesi ekleyin."));

  // Açıklama (20)
  const description = input.description.trim();
  checks.push(check("description_length", "description", description.length >= 400, 8, "Açıklama yeterince ayrıntılı",
    `Açıklama ${description.length} karakter; ürün, ölçü, malzeme, bakım ve kargo bilgisini yazın (en az 400 karakter).`, description.length >= 200 ? 4 : 0));
  const head = description.slice(0, 160).toLowerCase();
  const nounWords = words(keyword).filter((word) => word.length >= 4 && !STOP.has(word));
  const headHit = Boolean(keyword) && (head.includes(keyword) || (nounWords.length > 0 && nounWords.every((word) => head.includes(word))));
  checks.push(check("description_keyword_start", "description", headHit, 6, "Açıklamanın ilk satırları ürünü anlatıyor",
    "Açıklamanın ilk cümlesinde aranan ifadeyi ve ürünün ne olduğunu yazın; Google ve Etsy önizlemede bu kısmı gösterir."));
  const details = input.digital
    ? /digital|download|instant/i.test(description) && /no physical|not (be )?ship|nothing will be (shipped|mailed)|not a finished/i.test(description)
    : /\b(cm|mm|inch|inches|size|length|width|dimensions?|measure)/i.test(description) && /\b(material|silver|wool|cotton|acrylic|copper|brass|amber|wood|yarn|stone|care|wash|ship)/i.test(description);
  checks.push(check("description_details", "description", details, 6, input.digital ? "Dijital ürün olduğu açıkça yazıyor" : "Ölçü ve malzeme/bakım bilgisi var",
    input.digital ? "Açıklamaya 'instant digital download' ve 'no physical item will be shipped' cümlelerini ekleyin; iade talebini önler." : "Açıklamaya ölçüleri (cm ve inç) ve malzeme/bakım bilgisini ekleyin; alıcının en çok sorduğu budur."));

  // Fotoğraflar (15) — bilinmiyorsa puana katılmaz
  if (typeof input.photoCount === "number") {
    const photos = input.photoCount;
    checks.push(check("photos", "photos", photos >= 10, 15, "10 fotoğrafın hepsi kullanılmış",
      photos === 0 ? "Fotoğraf yok; ilan fotoğrafsız yayına girmez. En az 5 net fotoğraf ekleyin." : `${photos} fotoğraf var; Etsy 10'a izin verir. Ölçü, doku, kullanım ve paket fotoğrafı ekleyin.`,
      photos >= 5 ? 12 : photos >= 1 ? 5 : 0));
  }

  // Fiyat (10) — piyasa ortancası bilinmiyorsa puana katılmaz
  if (input.priceUsd && input.medianPriceUsd) {
    const ratio = input.priceUsd / input.medianPriceUsd;
    checks.push(check("price_market", "price", ratio >= 0.5 && ratio <= 2, 10, "Fiyat piyasa aralığında",
      ratio > 2 ? `Fiyat (${input.priceUsd} USD) Etsy ortancasının (${input.medianPriceUsd} USD) 2 katından fazla; fotoğraf ve açıklamada farkı (el yapımı, malzeme) çok net gösterin ya da fiyatı gözden geçirin.` : `Fiyat (${input.priceUsd} USD) Etsy ortancasının (${input.medianPriceUsd} USD) yarısından az; kârınızı kaçırıyor olabilirsiniz.`, 4));
  }

  const max = checks.reduce((sum, item) => sum + item.max, 0);
  const score = max ? Math.round(100 * checks.reduce((sum, item) => sum + item.points, 0) / max) : 0;
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  const gradeTr = grade === "A" ? "Yayına hazır" : grade === "B" ? "İyi; küçük düzeltmeler" : grade === "C" ? "Eksikler var" : "Önce düzeltin";
  return { score, grade, gradeTr, checks };
}

// Mağazadaki yayında ve taslak ilanların karnesi (en düşük puan önce).
export async function scoreShopListings(env: EtsyRuntimeEnv, fetcher: Fetcher = fetch) {
  const shop = await getConnectedShop(env, fetcher);
  const pages = await Promise.all(["active", "draft"].map(async (state) => {
    const payload = await etsyRequest<{ results?: Array<Record<string, unknown>> }>(env, `/application/shops/${shop.shopId}/listings`, { query: { state, limit: 100, includes: "Images" } }, fetcher);
    return (payload.results || []).map((row) => ({ ...row, _state: state }));
  }));
  const listings: Array<Record<string, unknown>> = pages.flat();
  const items = listings.map((row) => {
    const price = row.price && typeof row.price === "object" ? row.price as Record<string, unknown> : {};
    const card = scoreListing({
      title: String(row.title || ""),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
      description: String(row.description || ""),
      photoCount: Array.isArray(row.images) ? row.images.length : undefined,
      priceUsd: price.currency_code === "USD" && Number(price.amount) ? Number(price.amount) / (Number(price.divisor) || 100) : undefined,
      digital: row.type === "download"
    });
    return {
      listingId: Number(row.listing_id),
      title: String(row.title || "").slice(0, 140),
      state: String(row._state),
      url: row.url ? String(row.url) : undefined,
      editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${row.listing_id}`,
      ...card
    };
  }).filter((item) => item.listingId > 0).sort((a, b) => a.score - b.score);
  return { items };
}
