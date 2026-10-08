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
  coloring: ["letter", "a4", "printer_friendly"],
  wall_art: ["ratio_sizes", "letter", "a4"],
  party: ["editable", "letter", "instant"],
  recipe: ["editable", "card_sizes", "letter"],
  journal: ["letter", "a5", "tablet", "printer_friendly"],
  kids: ["letter", "a4", "printer_friendly"],
  paper_craft: ["commercial", "scrapbook_size", "letter"],
  pattern: ["video", "letter", "a4"]
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
    advice.push({ priority: "high", titleTr: "Hemen gir", detailTr: `Talep yüksek ve rekabet makul (${result.score} puan). İlk hafta aynı nişte birbirinden farklı 3-5 ürün listele; Etsy aynı alıcıya mağazandan birden fazla seçenek gösterebilir.` });
  } else if (result.parts.demand >= 50 && result.parts.openness < 30) {
    advice.push({ priority: "high", titleTr: "Genel aramayla değil, dar ifadeyle gir", detailTr: `Talep var ama ${result.metrics.activeListings.toLocaleString("tr-TR")} ilanla rekabet çok yüksek. Başlığı daha dar ve yükselen bir ifadeyle başlat${freshRising.length ? `: ${freshRising.slice(0, 3).join(", ")}` : ""}.` });
  } else if (result.parts.demand < 25) {
    advice.push({ priority: "medium", titleTr: "Tek başına değil, paketin parçası olarak sun", detailTr: "Bu aramada talep zayıf. Ürünü güçlü bir nişteki paketin bonus sayfası olarak kullanmak daha verimli." });
  }

  if (result.metrics.newcomerShare >= 0.4) {
    advice.push({ priority: "medium", titleTr: "Yeni mağazaya açık niş", detailTr: `Üst ilanların ${percent(result.metrics.newcomerShare)} kadarı son 6 ayda açılmış. Erken giren ve düzenli yeni ürün ekleyen mağaza öne çıkıyor.` });
  } else if (result.metrics.newcomerShare <= 0.15 && result.metrics.sampleSize > 10) {
    advice.push({ priority: "medium", titleTr: "Eski ve yorumlu ilanlar hâkim", detailTr: `Üst ilanların yalnızca ${percent(result.metrics.newcomerShare)} kadarı yeni. Yüzlerce yorumlu rakibi genel aramada geçmek zor; ürününü yükselen bir alt ifadeye yönlendir.` });
  }

  if (freshRising.length) {
    advice.push({ priority: "medium", titleTr: "Yükselen özellikleri ilk sen kullan", detailTr: `Son 4 ayda açılıp hızla favori toplayan ilanlarda öne çıkanlar: ${freshRising.join(", ")}. Bunları tasarıma ve ilk 40 karakterlik başlığa taşı.` });
  }

  if (digital && signals) {
    const relevant = RELEVANT_FORMATS[result.group === "patterns" ? "pattern" : result.kind || "planner"];
    const formats = signals.formats.filter((item) => relevant.includes(item.id));
    const standard = formats.filter((item) => item.share >= 0.5);
    const gaps = formats.filter((item) => item.share < 0.25).slice(0, 2);
    if (standard.length) {
      advice.push({ priority: "high", titleTr: "Bu formatlar artık standart", detailTr: `${standard.map((item) => `${item.labelTr} (${percent(item.share)})`).join(", ")}: üst ilanların çoğu sunuyor. Ürününde mutlaka bulunsun ve başlıkta/görselde yazsın.` });
    }
    for (const gap of gaps) {
      advice.push({ priority: "medium", titleTr: `Boşluk: ${gap.labelTr}`, detailTr: `Rakiplerin yalnızca ${percent(gap.share)} kadarı ${gap.labelTr} sunuyor. Sen sunarsan bu formatı arayan alıcıda öne çıkarsın; kapak görselinde belirt.` });
    }
    if (signals.bundleShare >= 0.3) {
      advice.push({ priority: "medium", titleTr: "Paketler satıyor", detailTr: `Üst ilanların ${percent(signals.bundleShare)} kadarı paket/set. Tekli ürün yerine uyumlu 3-5'li set hazırla; set fiyatı tekli fiyatın yaklaşık 2-2,5 katı olsun.` });
    } else if (signals.bundleShare < 0.1 && result.metrics.sampleSize > 10) {
      advice.push({ priority: "medium", titleTr: "Paket boşluğu", detailTr: `Rakiplerin yalnızca ${percent(signals.bundleShare)} kadarı set sunuyor. Aynı stilde bir set ile hem öne çıkar hem sepet tutarını büyüt.` });
    }
    if (signals.pageCountMedian) {
      advice.push({ priority: "low", titleTr: "Daha fazla değer ver", detailTr: `Rakipler ortanca ${signals.pageCountMedian} sayfa/tasarım sunuyor. ${Math.ceil(signals.pageCountMedian * 1.2)} civarı sayfa veya bonus sayfalarla daha fazla değer ver ve sayıyı kapak görseline yaz.` });
    }
  }

  if (result.metrics.medianPriceUsd) {
    const median = result.metrics.medianPriceUsd;
    const launch = Math.max(1.5, Math.round(median * 0.88 * 100) / 100);
    advice.push({ priority: "low", titleTr: "Fiyat stratejisi", detailTr: digital
      ? `Üst ilanların ortanca fiyatı ${median.toFixed(2)} USD. İlk yorumlar gelene kadar ${launch.toFixed(2)} USD civarında başla; yorumlar geldikçe ortancaya çık. Etsy'nin indirim kampanyalarını (Sales and discounts) sezon başlarında kullan.`
      : `Üst ilanların ortanca fiyatı ${median.toFixed(2)} USD. ABD alıcısı ücretsiz kargo filtresini sık kullanır; kargoyu fiyata dahil et.` });
  }

  return advice.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]).slice(0, 8);
}
