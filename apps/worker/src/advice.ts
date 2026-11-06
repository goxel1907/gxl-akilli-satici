import type { PrintableKind, TrendResult } from "./etsy-trends.js";

export interface TrendAdvice {
  priority: "high" | "medium" | "low";
  titleTr: string;
  detailTr: string;
}

// Hangi format o PDF türünde alıcı için önemli: rakiplerde az görülen önemli format bir boşluktur.
export const RELEVANT_FORMATS: Record<PrintableKind | "pattern", string[]> = {
  planner: ["letter", "a4", "a5", "half_letter", "printer_friendly", "tablet"],
  digital_planner: ["tablet", "letter"],
  // Boyama sayfası zaten siyah-beyaz çizgi; "yazıcı dostu sürüm" boşluk olarak önerilmez.
  coloring: ["letter", "a4"],
  wall_art: ["ratio_sizes", "letter", "a4"],
  party: ["editable", "letter", "instant"],
  recipe: ["editable", "card_sizes", "letter"],
  journal: ["letter", "a5", "tablet", "printer_friendly"],
  kids: ["letter", "a4", "printer_friendly"],
  paper_craft: ["commercial", "scrapbook_size", "letter"],
  calendar: ["letter", "a4"],
  stickers: ["letter", "a4"],
  cards: ["letter", "a4"],
  puzzles: ["letter", "a4"],
  wallpaper: [],
  labels: ["letter", "a4"],
  app_icons: [],
  spreadsheet: [],
  slides: [],
  resume: ["letter", "a4"],
  // Desen PDF'leri zaten Letter ve A4'e uygun hazırlanır; desende anlamlı boşluk video eğitimdir.
  pattern: ["video"]
};

const percent = (value: number) => `%${Math.round(value * 100)}`;
const ORDER = { high: 0, medium: 1, low: 2 } as const;

export function buildAdvice(result: TrendResult): TrendAdvice[] {
  const advice: TrendAdvice[] = [];
  const digital = result.group === "printables" || result.group === "patterns";
  const signals = result.signals;
  const topTagSet = new Set(result.topTags.map((item) => item.tag));
  const rising = (result.risingTags || []).map((item) => item.tag);
  const unseen = rising.filter((tag) => !topTagSet.has(tag));
  const freshRising = (unseen.length ? unseen : rising).slice(0, 4);

  if (signals?.ipRisks.length) {
    advice.push({ priority: "high", titleTr: "Marka / telif riski", detailTr: `Rakip ilanlarda korunan isimler geçiyor (${signals.ipRisks.join(", ")}). Bunları başlıkta, etikette ve tasarımda kullanma; Etsy ilanı kaldırır, tekrarında mağazayı kapatabilir. Sistem bu kelimeleri ilanlarından otomatik çıkarır.` });
  }

  if (result.score >= 65) {
    advice.push({ priority: "high", titleTr: "Küçük bir ürün testi planla", detailTr: `Örneklem göstergeleri ${result.score} puan verdi. Bu, satış veya dönüşüm tahmini değildir. Ürüne uygun tek bir özgün tasarımla başlayıp ziyaret, favori ve gerçek sipariş sonuçlarını ayrı izle.` });
  } else if (result.parts.demand >= 50 && result.parts.openness < 30) {
    advice.push({ priority: "high", titleTr: "Genel aramayla değil, dar ifadeyle gir", detailTr: `Örneklemde ilgi göstergesi var; ${result.metrics.activeListings.toLocaleString("tr-TR")} aktif ilan görünüyor. Ürüne uyan daha dar bir arama ifadesini dene${freshRising.length ? `: ${freshRising.slice(0, 3).join(", ")}` : ""}.` });
  } else if (result.parts.demand < 25) {
    advice.push({ priority: "medium", titleTr: "Tek başına değil, paketin parçası olarak sun", detailTr: "Bu örneklemde favori göstergesi zayıf; gerçek talep veya satış ölçülmedi. Ürünü tek başına veya uyumlu bir set içinde denemeden önce kapsamı ve maliyeti değerlendir." });
  }

  if (result.metrics.newcomerShare >= 0.4) {
    advice.push({ priority: "medium", titleTr: "Örneklemde yeni ilan payı", detailTr: `Üst ilanların ${percent(result.metrics.newcomerShare)} kadarı son 6 ayda açılmış. İlan yaşı mağaza yaşı değildir; yeni mağazaların satış başarısı ölçülmedi.` });
  } else if (result.metrics.newcomerShare <= 0.15 && result.metrics.sampleSize > 10) {
    advice.push({ priority: "medium", titleTr: "Örneklemde eski ilanlar ağırlıkta", detailTr: `Üst ilanların ${percent(result.metrics.newcomerShare)} kadarı son 6 ayda açılmış. Bu oran mağaza yaşı, yorum sayısı veya satış üstünlüğü göstermez. Ürüne uygun daha dar bir aramayı ayrıca incele.` });
  }

  if (freshRising.length) {
    advice.push({ priority: "medium", titleTr: "Yeni ilanlarda görülen etiketler", detailTr: `Son 4 ayda açılmış örnek ilanlarda görülenler: ${freshRising.join(", ")}. Zaman içindeki artış veya alıcı tercihi ölçülmedi; yalnız ürününe uyan ifadeleri değerlendir.` });
  }

  if (digital && signals) {
    const relevant = RELEVANT_FORMATS[result.group === "patterns" ? "pattern" : result.kind || "planner"];
    const formats = signals.formats.filter((item) => relevant.includes(item.id));
    const standard = formats.filter((item) => item.share >= 0.5);
    const gaps = formats.filter((item) => item.share < 0.25).slice(0, 2);
    if (standard.length) {
      advice.push({ priority: "high", titleTr: "Örneklemde sık belirtilen formatlar", detailTr: `${standard.map((item) => `${item.labelTr} (${percent(item.share)})`).join(", ")}: örneklemdeki başlık veya etiketlerde belirtiliyor. Gerçek dosyalar incelenmedi; yalnız ürününe uygun ve hazırladığın formatları ilanda yaz.${standard.some((item) => ["commercial", "video", "editable"].includes(item.id)) ? " Ticari lisans, video ve düzenlenebilir sürüm uygulamanın paketinde yoktur; bunları ayrıca hazırlamadan ilanda yazma." : ""}` });
    }
    for (const gap of gaps) {
      // Uygulamanın talimatı bu üçünü üretmez; ilanda yazılırsa alıcı yanıltılır. Satıcıya ayrı iş olarak anlatılır.
      const manual = gap.id === "commercial"
        ? `Rakiplerin yalnızca ${percent(gap.share)} kadarı ticari kullanım lisansı belirtiyor. Uygulamanın hazırladığı ürünler kişisel kullanım lisanslıdır; ticari lisans satmak istersen ayrı bir "Commercial License" ilanı aç, ürün ilanında yazma.`
        : gap.id === "video"
          ? `Rakiplerin yalnızca ${percent(gap.share)} kadarı video eğitim belirtiyor. Yapay zekâ video çekemez; ürünü yaparken telefonla kısa bir video çekersen ilana ekle ve o zaman yaz.`
          : gap.id === "editable"
            ? `Rakiplerin yalnızca ${percent(gap.share)} kadarı düzenlenebilir sürüm belirtiyor. Uygulamanın paketi düzenlenemez PDF üretir; düzenlenebilir sürüm (Canva şablonu) hazırlamadan ilanda "editable" yazma.`
            : undefined;
      advice.push({ priority: "medium", titleTr: `Tasarım seçeneği: ${gap.labelTr}`, detailTr: manual || `Rakiplerin yalnızca ${percent(gap.share)} kadarı başlık veya etiketinde ${gap.labelTr} belirtiyor. Bu, rakibin dosyasında olmadığı anlamına gelmez. Uygunsa hazırlayıp dene; dosya hazır olmadan ilanda vaat etme.` });
    }
    if (signals.bundleShare >= 0.3) {
      advice.push({ priority: "medium", titleTr: "Örneklemde set ilanları", detailTr: `Üst ilanların ${percent(signals.bundleShare)} kadarı başlık/etiketinde paket veya set belirtiyor. Satış performansı bilinmiyor. Uyumlu bir seti ayrı ürün olarak hazırlarsan fiyatını maliyet ve karşılaştırılabilir örneklerle ayrıca dene.` });
    } else if (signals.bundleShare < 0.1 && result.metrics.sampleSize > 10) {
      advice.push({ priority: "medium", titleTr: "Set seçeneğini değerlendir", detailTr: `Örneklem başlık/etiketlerinin ${percent(signals.bundleShare)} kadarı set belirtiyor; gerçek dosya içerikleri bilinmiyor. Uyumlu bir set hazırlamak bir deneme seçeneğidir, daha fazla satış kanıtı değildir.` });
    }
    if (signals.pageCountMedian) {
      advice.push({ priority: "low", titleTr: "Daha fazla değer ver", detailTr: `Sayfa/tasarım sayısı belirten örnek ilanların ortancası ${signals.pageCountMedian}. ${Math.ceil(signals.pageCountMedian * 1.2)} yalnız tasarım adayıdır; daha fazla sayfanın daha iyi sattığı ölçülmedi. İlanda yalnız gerçek teslimat sayısını yaz.` });
    }
  }

  const comparableMedian = result.strategy ? result.strategy.pricing?.medianUsd : result.metrics.medianPriceUsd;
  if (comparableMedian) {
    const median = comparableMedian;
    const launch = Math.max(1.5, Math.round(median * 0.88 * 100) / 100);
    advice.push({ priority: "low", titleTr: "Fiyat denemesi", detailTr: digital
      ? `Örneklem ortancası ${median.toFixed(2)} USD; yüzde 12 indirimle ${launch.toFixed(2)} USD yalnız bir deneme adayıdır. En iyi fiyat veya satış etkisi kanıtlanmadı; ürün kapsamını, maliyeti ve ücretleri kontrol et.`
      : `Örneklem ortancası ${median.toFixed(2)} USD. Benzer ürün, kondisyon, malzeme ve kargo kapsamını karşılaştır; net kazanç hesabında kargoyu ve ücretleri birlikte değerlendir.` });
  }

  return advice.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}
