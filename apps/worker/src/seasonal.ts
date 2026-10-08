import { normalizeKeyword, readCached, type TrendResult, type TrendStore } from "./etsy-trends.js";

type KeywordGroup = "printables" | "patterns" | "tesbih" | "vintage";

interface SeasonDefinition {
  id: string;
  nameTr: string;
  nameEn: string;
  leadDays: number;
  tipTr: string;
  keywords: Partial<Record<KeywordGroup, string[]>>;
  date(year: number): Date | undefined;
  approximate?: boolean;
}

export interface UpcomingSeason {
  id: string;
  nameTr: string;
  nameEn: string;
  date: string;
  approximate: boolean;
  daysUntil: number;
  listByProducts: string;
  listByPatterns: string;
  urgency: "Hemen listele" | "Bu ay hazırla" | "Planla";
  tipTr: string;
  keywords: Array<{ keyword: string; group: KeywordGroup; result?: TrendResult }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Desen alıcısı ürünü bayramdan önce örmek zorunda olduğu için desenler daha erken listelenir.
const PATTERN_EXTRA_LEAD_DAYS = 21;

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

function table(dates: Record<number, [number, number]>) {
  return (year: number) => dates[year] ? utc(year, dates[year][0], dates[year][1]) : undefined;
}

// Hicri ve hareketli bayramlar yıla göre tablodan gelir; Hicri tarihler ay gözlemine göre bir gün kayabilir.
export const US_SEASONS: SeasonDefinition[] = [
  {
    id: "halloween", nameTr: "Cadılar Bayramı", nameEn: "Halloween", leadDays: 45,
    tipTr: "Kabak, hayalet ve sonbahar temalı ürünler Eylül'den itibaren aranır.",
    keywords: { printables: ["halloween printables", "halloween coloring pages"], patterns: ["halloween crochet pattern", "crochet pumpkin pattern", "halloween cross stitch pattern"], vintage: ["vintage halloween decor"] },
    date: (year) => utc(year, 9, 31)
  },
  {
    id: "thanksgiving", nameTr: "Şükran Günü", nameEn: "Thanksgiving", leadDays: 45,
    tipTr: "Sonbahar sofrası, hindi ve şükran temaları; masa örtüsü ve sehpa örtüsü desenleri öne çıkar.",
    keywords: { printables: ["thanksgiving printables", "thanksgiving games printable"], patterns: ["thanksgiving crochet pattern", "fall crochet pattern", "autumn doily pattern"], vintage: ["vintage thanksgiving decor"] },
    date: (year) => nthWeekday(year, 10, 4, 4)
  },
  {
    id: "hanukkah", nameTr: "Hanuka", nameEn: "Hanukkah", leadDays: 50,
    tipTr: "Yahudi alıcılar için menora, Davut yıldızı ve mavi-gümüş renkli ürünler.",
    keywords: { patterns: ["hanukkah crochet pattern", "hanukkah cross stitch pattern"], vintage: ["vintage menorah"] },
    date: table({ 2026: [11, 4], 2027: [11, 24], 2028: [11, 12] })
  },
  {
    id: "christmas", nameTr: "Noel / Yılbaşı", nameEn: "Christmas", leadDays: 75,
    tipTr: "Yılın en büyük alışveriş dönemi. Süs, ağaç süsü, çorap ve hediye ürünleri Ekim'den itibaren aranır; ABD'ye kargo süresini hesaba katın.",
    keywords: { printables: ["christmas printables", "christmas coloring pages", "christmas games printable"], patterns: ["christmas crochet pattern", "crochet ornament pattern", "christmas cross stitch pattern", "christmas knitting pattern"], tesbih: ["christmas gift for him"], vintage: ["vintage christmas ornaments", "vintage christmas decor"] },
    date: (year) => utc(year, 11, 25)
  },
  {
    id: "valentines", nameTr: "Sevgililer Günü", nameEn: "Valentine's Day", leadDays: 45,
    tipTr: "Kalp temalı ürünler, takı ve kişiye özel hediyeler.",
    keywords: { printables: ["valentine printable cards", "valentines day printables"], patterns: ["valentine crochet pattern", "crochet heart pattern"], vintage: ["vintage valentine", "vintage heart necklace"] },
    date: (year) => utc(year, 1, 14)
  },
  {
    id: "ramadan", nameTr: "Ramazan", nameEn: "Ramadan", leadDays: 45, approximate: true,
    tipTr: "ABD'deki Müslüman alıcılar Ramazan öncesi tesbih, seccade ve süsleme arar. Tesbih için yılın en güçlü dönemi.",
    keywords: { tesbih: ["ramadan gift", "tasbih", "misbaha", "ramadan decor"], patterns: ["ramadan cross stitch pattern"] },
    date: table({ 2027: [1, 8], 2028: [0, 28] })
  },
  {
    id: "eid-fitr", nameTr: "Ramazan Bayramı", nameEn: "Eid al-Fitr", leadDays: 40, approximate: true,
    tipTr: "Bayram hediyesi olarak gümüş tesbih ve erkek hediyeleri aranır.",
    keywords: { tesbih: ["eid gift", "eid gift for men", "islamic gift for men"], patterns: ["eid crochet pattern"] },
    date: table({ 2027: [2, 10], 2028: [1, 27] })
  },
  {
    id: "st-patricks", nameTr: "Aziz Patrick Günü", nameEn: "St. Patrick's Day", leadDays: 35,
    tipTr: "Yeşil, yonca ve İrlanda temaları.",
    keywords: { patterns: ["st patricks day crochet pattern", "crochet shamrock pattern"] },
    date: (year) => utc(year, 2, 17)
  },
  {
    id: "easter", nameTr: "Paskalya", nameEn: "Easter", leadDays: 40,
    tipTr: "Tavşan, yumurta ve bahar çiçekleri; amigurumi tavşan desenleri çok aranır.",
    keywords: { printables: ["easter coloring pages", "easter printables"], patterns: ["easter crochet pattern", "crochet bunny pattern", "easter cross stitch pattern"], vintage: ["vintage easter decor"] },
    date: table({ 2026: [3, 5], 2027: [2, 28], 2028: [3, 16] })
  },
  {
    id: "mothers-day", nameTr: "Anneler Günü", nameEn: "Mother's Day", leadDays: 45,
    tipTr: "Çiçek buketi desenleri, takı ve broş gibi hediyeler.",
    keywords: { printables: ["mothers day printable card", "mothers day coloring pages"], patterns: ["mothers day crochet pattern", "crochet flower bouquet pattern"], vintage: ["vintage brooch", "vintage sterling silver jewelry"] },
    date: (year) => nthWeekday(year, 4, 0, 2)
  },
  {
    id: "eid-adha", nameTr: "Kurban Bayramı", nameEn: "Eid al-Adha", leadDays: 40, approximate: true,
    tipTr: "Bayram hediyesi olarak tesbih ve İslami ev süsleri.",
    keywords: { tesbih: ["eid al adha gift", "islamic gift for men"] },
    date: table({ 2026: [4, 27], 2027: [4, 16], 2028: [4, 5] })
  },
  {
    id: "fathers-day", nameTr: "Babalar Günü", nameEn: "Father's Day", leadDays: 40,
    tipTr: "Erkek hediyeleri: gümüş tesbih, worry beads ve vintage aksesuarlar.",
    keywords: { printables: ["fathers day printable card"], tesbih: ["fathers day gift", "gift for dad", "worry beads"], vintage: ["vintage gift for him"] },
    date: (year) => nthWeekday(year, 5, 0, 3)
  },
  {
    id: "july-4", nameTr: "Bağımsızlık Günü", nameEn: "4th of July", leadDays: 30,
    tipTr: "Kırmızı-beyaz-mavi, yıldız ve bayrak temaları.",
    keywords: { printables: ["4th of july printables"], patterns: ["4th of july crochet pattern", "patriotic crochet pattern"] },
    date: (year) => utc(year, 6, 4)
  },
  {
    id: "fall", nameTr: "Sonbahar sezonu", nameEn: "Fall season", leadDays: 45,
    tipTr: "Sonbahar renkleri, yaprak ve kabak motifleri; ev dekoru desenleri yükselişe geçer.",
    keywords: { printables: ["fall wall art printable", "fall printables"], patterns: ["fall crochet pattern", "autumn crochet pattern", "crochet leaf pattern"] },
    date: (year) => utc(year, 8, 22)
  },
  {
    id: "new-year", nameTr: "Yeni yıl planlama sezonu", nameEn: "New Year planning", leadDays: 60,
    tipTr: "Planlayıcı, takip sayfası ve hedef günlükleri Ekim-Ocak arasında zirve yapar. Dijital ve yazdırılabilir planlayıcıları Kasım başına kadar listele.",
    keywords: { printables: ["new year planner printable", "digital planner", "goal planner printable", "habit tracker printable"] },
    date: (year) => utc(year, 0, 1)
  },
  {
    id: "wedding-season", nameTr: "Düğün sezonu", nameEn: "Wedding season", leadDays: 90,
    tipTr: "ABD'de düğünler Mayıs-Ekim arasında yoğunlaşır; planlayıcı ve bridal shower oyunları kış sonundan itibaren aranır.",
    keywords: { printables: ["wedding planner printable", "bridal shower games", "wedding welcome sign"] },
    date: (year) => utc(year, 4, 1)
  },
  {
    id: "back-to-school", nameTr: "Okula dönüş", nameEn: "Back to school", leadDays: 45,
    tipTr: "Öğretmen planlayıcıları, evde eğitim ve çocuk çalışma kâğıtları Temmuz-Ağustos'ta zirve yapar.",
    keywords: { printables: ["teacher planner printable", "homeschool planner", "back to school printables"] },
    date: (year) => utc(year, 7, 15)
  }
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

export function upcomingSeasons(now = new Date(), horizonDays = 180): Array<Omit<UpcomingSeason, "keywords"> & { keywords: Array<{ keyword: string; group: KeywordGroup }> }> {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const rows = [];
  for (const season of US_SEASONS) {
    for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
      const date = season.date(year);
      if (!date) continue;
      const daysUntil = Math.round((date.getTime() - today.getTime()) / DAY_MS);
      if (daysUntil < 0 || daysUntil > horizonDays) continue;
      const listByProducts = new Date(date.getTime() - season.leadDays * DAY_MS);
      const listByPatterns = new Date(date.getTime() - (season.leadDays + PATTERN_EXTRA_LEAD_DAYS) * DAY_MS);
      const daysToListBy = Math.round((listByProducts.getTime() - today.getTime()) / DAY_MS);
      rows.push({
        id: `${season.id}-${year}`,
        nameTr: season.nameTr,
        nameEn: season.nameEn,
        date: iso(date),
        approximate: Boolean(season.approximate),
        daysUntil,
        listByProducts: iso(listByProducts),
        listByPatterns: iso(listByPatterns),
        urgency: daysToListBy <= 7 ? "Hemen listele" as const : daysToListBy <= 30 ? "Bu ay hazırla" as const : "Planla" as const,
        tipTr: season.tipTr,
        keywords: (Object.entries(season.keywords) as Array<[KeywordGroup, string[]]>).flatMap(([group, keywords]) => keywords.map((keyword) => ({ keyword, group })))
      });
      break;
    }
  }
  return rows.sort((a, b) => a.daysUntil - b.daysUntil);
}

export async function seasonalBoard(store: TrendStore | undefined, now = new Date()) {
  const seasons = upcomingSeasons(now);
  const events: UpcomingSeason[] = await Promise.all(seasons.map(async (season) => ({
    ...season,
    keywords: await Promise.all(season.keywords.map(async (item) => ({ ...item, result: await readCached(store, normalizeKeyword(item.keyword)) })))
  })));
  return {
    today: iso(now),
    events,
    note: "Son listeleme tarihleri: fiziksel ürünler için bayramdan önceki alışveriş ve ABD'ye kargo süresi, desenler için alıcının ürünü örmesi gereken ek 3 hafta hesaba katılarak verilir. Hicri bayram tarihleri yaklaşıktır."
  };
}
