import type { EtsyRuntimeEnv } from "./etsy.js";
import { RELEVANT_FORMATS } from "./advice.js";
import { listDiscoveries } from "./discovery.js";
import { inferPrintableKind, inferTrendGroup, isTrendGroup, normalizeKeyword, readCached, scanTrend, TREND_NICHES, type PatternCraft, type PrintableKind, type TrendGroup, type TrendResult, type TrendStore } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { craftDefaultMaterial, type SkillLevel } from "./pattern-studio.js";
import { defaultPrintableFormats, defaultPrintablePages, PRINTABLE_KINDS } from "./printable-studio.js";
import { familiesConflict, fitsTheme, holidayAllowed, holidayOutOfWindow, META_WORDS, MISLEADING_FEATURE, proseCase, themeFamilies, type ThemeFamily } from "./theme.js";

type Fetcher = typeof fetch;

// Stüdyo alanlarını trend verisinden doldurur. Ürün, özellik, renk, malzeme, ölçü ve zorluk
// sabit bir listeden değil, o aramadaki üst ve yükselen ilanların etiket ve başlıklarından çıkarılır.
// Rakipleri geçmek için veriden çıkarılan plan: fiyat, içerik miktarı, format boşlukları, paket.
export interface CompetitionPlan {
  medianPriceUsd?: number;
  launchPriceUsd?: number;
  bundlePriceUsd?: number;
  competitorPages?: number;
  ourPages?: number;
  standardFormats: string[];
  gapFormats: string[];
  bundleShare?: number;
  topCompetitors: Array<{ title: string; favorites: number; priceUsd?: number; ageDays: number }>;
  planTr: string[];
  planEn: string[];
}

export interface PatternSeed {
  studio: "pattern" | "printable";
  audience?: string;
  competition: CompetitionPlan;
  pickedReason?: string;
  kind?: PrintableKind;
  formats: string[];
  pageCount?: number;
  craft: PatternCraft;
  productType: string;
  referenceSource: "trend";
  referenceNotes: string;
  referenceColors: string[];
  skillLevel: SkillLevel;
  sizeNote: string;
  yarnNote: string;
  colors: string[];
  keyword: string;
  trendTags: string[];
  trendFeatures: string[];
  risingFeatures: string[];
  basis: string[];
  fresh: boolean;
  scannedAt?: string;
}

interface Row { tokens: string[]; weight: number; rising: boolean }
interface SeedHistory { combos: string[]; palettes: string[] }

const HISTORY_LIMIT = 40;
const NAME_HISTORY_KEY = "pattern:names";
const NAME_HISTORY_LIMIT = 300;

const CRAFT_PHRASES: Array<[PatternCraft, string]> = [
  ["cross_stitch", "\\bcross[ -]?stitch(?:es|ed|ing)?\\b"],
  ["punch_needle", "\\bpunch[ -]?needle\\b"],
  ["embroidery", "\\b(?:hand )?embroider(?:y|ed|ies)?\\b"],
  ["knitting", "\\bknit(?:s|ting|ted)?\\b"],
  // "no-sew" / "low-sew" amigurumi özelliğidir, dikiş tekniği değil.
  ["sewing", "(?<![a-z]-)\\bsew(?:s|ing|n)?\\b"],
  ["macrame", "\\bmacrame\\b"],
  ["crochet", "\\bcrochet(?:ed|ing)?\\b|\\bamigurumi\\b"]
];
// Teknik filtre: anlam taşımayan ve her ilanda geçen kelimeler özellik sayılmaz.
const STOP = new Set(["pattern", "patterns", "pdf", "pdfs", "digital", "download", "downloads", "instant", "printable", "printables", "print", "file", "files", "template", "templates", "tutorial", "tutorials", "diy", "chart", "charts", "svg", "design", "designs", "handmade", "gift", "gifts", "for", "and", "the", "with", "a", "an", "of", "in", "on", "to", "by", "or", "your", "you", "my", "etsy", "listing", "us", "terms", "english", "level", "friendly", "instructions", "written", "video", "step", "guide", "new", "best", "sale", "make", "made", "own", "how", "ebook", "e-book", "item", "items"]);
const SKILL_WORDS: Record<string, SkillLevel> = { beginner: "beginner", beginners: "beginner", easy: "easy", simple: "easy", quick: "easy", intermediate: "intermediate", advanced: "experienced", expert: "experienced" };
const AUDIENCE_OR_SEASON = /^(baby|babies|newborn|kids?|children|toddler|women|womens|ladies|men|mens|girls?|boys?|christmas|xmas|halloween|easter|valentines?|fall|autumn|winter|summer|spring|thanksgiving|hanukkah|ramadan|eid|patriotic|holiday|wedding|bridal)$/;
const SIZE_SIGNAL = /\b(plus size|size inclusive|inclusive sizing|xxs|xs ?(?:-|to) ?\d?x?l|\d?xl|\d{1,3} ?(?:in|inch|inches|cm|mm)|\d{1,3} ?x ?\d{1,3}(?: ?(?:in|inch|inches|cm))?|a0|a4|us letter|newborn|toddler|one size|all sizes|sizes? \d{1,2}(?: ?- ?\d{1,2})?)\b/g;
const NOT_A_WORD = /^(\d.*|a\d|xx?s|x*l|\d?xl)$/;
// "12 month journal", "52 week planner" gibi süreler anlamını korumak için tek kelime sayılır ("12-month").
const DURATION = /\b(\d{1,3}) (month|week|day|year)s?\b/g;
const DURATION_WORD = /^\d{1,3}-(month|week|day|year)$/;

// Renk tanıma sözlüğü. Ton açısı, trendde eksik kalan renkleri uyumlu biçimde tamamlamak için kullanılır.
const COLOR_LEXICON: Array<{ name: string; hue?: number }> = [
  { name: "sage green", hue: 100 }, { name: "forest green", hue: 130 }, { name: "olive green", hue: 75 }, { name: "mint green", hue: 150 },
  { name: "baby blue", hue: 205 }, { name: "sky blue", hue: 200 }, { name: "navy blue", hue: 225 }, { name: "dusty blue", hue: 210 },
  { name: "dusty rose", hue: 345 }, { name: "hot pink", hue: 330 }, { name: "baby pink", hue: 345 }, { name: "cherry red", hue: 355 },
  { name: "burnt orange", hue: 25 }, { name: "butter yellow", hue: 52 }, { name: "mustard yellow", hue: 48 },
  { name: "sage", hue: 100 }, { name: "olive", hue: 75 }, { name: "emerald", hue: 145 }, { name: "mint", hue: 150 }, { name: "green", hue: 120 },
  { name: "teal", hue: 180 }, { name: "aqua", hue: 185 }, { name: "turquoise", hue: 175 }, { name: "denim", hue: 215 }, { name: "navy", hue: 225 }, { name: "cobalt", hue: 220 }, { name: "blue", hue: 220 },
  { name: "lavender", hue: 270 }, { name: "lilac", hue: 280 }, { name: "purple", hue: 285 }, { name: "plum", hue: 300 },
  { name: "blush", hue: 350 }, { name: "pink", hue: 340 }, { name: "burgundy", hue: 345 }, { name: "wine", hue: 340 }, { name: "red", hue: 0 },
  { name: "coral", hue: 12 }, { name: "terracotta", hue: 15 }, { name: "rust", hue: 20 }, { name: "orange", hue: 30 }, { name: "peach", hue: 28 }, { name: "apricot", hue: 32 },
  { name: "mustard", hue: 48 }, { name: "yellow", hue: 55 }, { name: "gold", hue: 45 }, { name: "honey", hue: 40 },
  { name: "white" }, { name: "ivory" }, { name: "cream" }, { name: "oatmeal" }, { name: "beige" }, { name: "sand" }, { name: "camel" }, { name: "tan" },
  { name: "brown" }, { name: "chocolate" }, { name: "gray" }, { name: "grey" }, { name: "charcoal" }, { name: "black" }, { name: "silver" }
];
// Trendde renk yoksa, trendin stil özelliğine uygun palet seçilir (ör. dark academia → bordo, orman yeşili, altın).
const STYLE_PALETTES: Array<{ pattern: RegExp; label: string; palettes: string[][] }> = [
  // Önce bayram ve mevsim stilleri: "christmas ephemera" Noel paletini alır, vintage veya dark academia paletini değil.
  // Her stilde birkaç palet var; aynı aramada tekrar üretilen ürünler farklı görünür.
  { pattern: /christmas|holiday|xmas|noel/, label: "holiday", palettes: [["cherry red", "forest green", "ivory"], ["burgundy", "sage green", "gold"], ["wine", "olive green", "cream"], ["dusty blue", "silver", "ivory"]] },
  { pattern: /halloween|spooky|ghost|pumpkin/, label: "halloween", palettes: [["burnt orange", "black", "cream"], ["plum", "orange", "charcoal"], ["rust", "olive", "oatmeal"]] },
  { pattern: /fall|autumn|thanksgiving|harvest/, label: "autumn", palettes: [["rust", "mustard", "oatmeal"], ["burnt orange", "olive", "cream"], ["terracotta", "camel", "ivory"]] },
  { pattern: /winter|snow/, label: "winter", palettes: [["dusty blue", "silver", "white"], ["navy", "ivory", "silver"], ["sage green", "white", "camel"]] },
  { pattern: /easter|spring|pastel|bunny/, label: "spring", palettes: [["lavender", "mint", "butter yellow"], ["baby pink", "sky blue", "cream"], ["sage green", "blush", "ivory"]] },
  { pattern: /valentine|romantic|heart|coquette|bow/, label: "romantic", palettes: [["blush", "cherry red", "ivory"], ["dusty rose", "wine", "cream"], ["baby pink", "burgundy", "white"]] },
  { pattern: /coastal|beach|ocean|summer|nautical/, label: "coastal", palettes: [["navy", "sand", "white"], ["aqua", "coral", "ivory"], ["dusty blue", "sand", "cream"]] },
  { pattern: /dark academia|gothic|grimoire|witch|occult/, label: "dark academia", palettes: [["burgundy", "forest green", "gold"], ["plum", "olive", "cream"], ["charcoal", "wine", "camel"]] },
  { pattern: /botanical|floral|wildflower|garden|cottagecore|moss|mushroom|fern/, label: "botanical", palettes: [["sage green", "terracotta", "cream"], ["olive", "blush", "ivory"], ["forest green", "mustard", "oatmeal"], ["dusty rose", "sage green", "cream"]] },
  { pattern: /boho|bohemian|desert|terracotta/, label: "boho", palettes: [["terracotta", "mustard", "cream"], ["rust", "sand", "sage"], ["blush", "camel", "olive"], ["burnt orange", "beige", "dusty rose"]] },
  { pattern: /vintage|retro|antique|victorian|ephemera|nostalgic/, label: "vintage", palettes: [["dusty rose", "sand", "olive"], ["mustard", "teal", "cream"], ["rust", "dusty blue", "ivory"]] },
  { pattern: /minimal|minimalist|modern|neutral|scandi|clean/, label: "minimalist", palettes: [["charcoal", "sand", "white"], ["black", "beige", "olive"], ["sage green", "oatmeal", "white"], ["dusty blue", "beige", "ivory"]] },
  { pattern: /western|cowgirl|rodeo/, label: "western", palettes: [["rust", "tan", "denim"], ["terracotta", "camel", "cream"], ["burnt orange", "sand", "denim"]] },
  { pattern: /kawaii|cute|rainbow|kids|whimsical/, label: "playful", palettes: [["baby pink", "mint", "butter yellow"], ["lavender", "peach", "sky blue"], ["coral", "aqua", "butter yellow"]] }
];
// Hedef kitle: etiket ve başlıklarda geçen alıcı grupları.
const AUDIENCE_TERMS: Array<[string, string]> = [["busy moms", "busy moms"], ["moms", "moms"], ["mom", "moms"], ["teachers", "teachers"], ["teacher", "teachers"], ["homeschool", "homeschool families"], ["toddlers", "toddlers"], ["toddler", "toddlers"], ["preschool", "preschoolers"], ["kids", "kids"], ["teens", "teens"], ["students", "students"], ["adults", "adults"], ["adult", "adults"], ["seniors", "seniors"], ["women", "women"], ["brides", "brides-to-be"], ["bride", "brides-to-be"], ["couples", "couples"], ["nurses", "nurses"], ["book lovers", "book lovers"], ["bookish", "book lovers"], ["readers", "book lovers"], ["beginners", "beginners"], ["crafters", "crafters"], ["journalers", "journalers"]];
const FORMAT_OFFERS: Record<string, { format?: string; en: string; tr: string }> = {
  letter: { format: "US Letter", en: "US Letter size", tr: "US Letter" },
  a4: { format: "A4", en: "A4 size", tr: "A4" },
  a5: { format: "A5", en: "A5 size", tr: "A5" },
  half_letter: { format: "Half Letter", en: "Half Letter size", tr: "Half Letter" },
  tablet: { format: "Tablet PDF (hyperlinked)", en: "a hyperlinked tablet version", tr: "tablet (tıklanabilir) sürüm" },
  editable: { en: "an editable template version", tr: "düzenlenebilir şablon sürümü" },
  printer_friendly: { format: "Black-and-white printer-friendly version", en: "a black-and-white printer-friendly version", tr: "siyah-beyaz yazıcı dostu sürüm" },
  ratio_sizes: { format: "5 ratio files (fits every frame)", en: "five ratio files that fit every frame size", tr: "tüm çerçevelere uyan 5 oran dosyası" },
  card_sizes: { format: "4x6 and 5x7 in cards", en: "4x6 and 5x7 card sizes", tr: "4x6 ve 5x7 kart ölçüleri" },
  scrapbook_size: { format: "12x12 in sheets", en: "12x12 in scrapbook sheets", tr: "12x12 scrapbook sayfaları" },
  commercial: { en: "a commercial-use license option", tr: "ticari kullanım lisansı seçeneği" },
  video: { en: "a short video tutorial", tr: "kısa video eğitim" }
};

// Fiyatın .49 / .99 ile bitmesi alıcıya tanıdık gelir; hedef değerin altında kalan en yakın sonu seçer.
function charmPrice(value: number): number {
  const base = Math.floor(value);
  const options = [base - 0.01, base + 0.49, base + 0.99].filter((option) => option > 0 && option <= value + 0.001);
  return Math.max(0.99, ...options);
}

const COLOR_DESCRIPTORS = ["rainbow", "pastel", "neutral", "earth tone", "earthy", "monochrome", "multicolor"];
const YARN_WEIGHTS = ["super bulky", "lace weight", "sport weight", "fingering", "worsted", "chunky", "bulky", "jumbo", "aran", "dk"];
const FIBERS = ["quilting cotton", "crochet thread", "t-shirt yarn", "knit fabric", "embroidery floss", "macrame cord", "cotton", "acrylic", "merino", "mohair", "alpaca", "cashmere", "bamboo", "chenille", "velvet", "wool", "linen", "silk", "jute", "hemp", "thread", "canvas", "denim", "fleece", "jersey", "felt", "aida", "floss", "cord", "rope"];
const MATERIAL_WORDS = new Set([...YARN_WEIGHTS, ...FIBERS, "yarn", "fabric"].flatMap((term) => term.split(/[\s-]+/)).filter((word) => word.length > 2 && word !== "shirt" && word !== "knit"));
const PRINT_FORMATS = /^(a0|a4|us letter)$/;
const YARN_FIBERS = new Set(["cotton", "acrylic", "merino", "mohair", "alpaca", "cashmere", "bamboo", "chenille", "velvet", "wool", "linen", "silk"]);
const YARN_CRAFTS = new Set<PatternCraft>(["crochet", "knitting", "punch_needle"]);

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0)!;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
// Çoğul eki kaldırılır; "christmas", "canvas", "lotus" gibi s ile biten tekil kelimeler bozulmaz.
const NOT_PLURAL = /(ss|us|is|mas|vas|tlas|bias|ics)$/;
const singular = (word: string) => word.length > 3 && word.endsWith("s") && !NOT_PLURAL.test(word) ? word.slice(0, -1) : word;
// Ürün adı olamayacak sıfatlar: "floral embroidery" aramasında ürün "floral" değildir.
const ADJECTIVE_HEADS = /^(floral|botanical|funny|modern|vintage|boho|cute|easy|simple|beginner|hand|mini|small|large|big|cozy|retro|minimalist|traditional|subversive|snarky|sassy|witchy|spooky|kawaii|aesthetic|abstract|geometric|seamless|colorful|rainbow|tiny|giant|chunky|oversized|cropped|unique|personalized|custom|cottagecore|whimsical|elegant|classic|rustic|primitive|folk)$/;
// Başka bir ürünün adı özellik olamaz (duvar süsü deseninde "plant hanger", ayıcık deseninde "toy").
const PRODUCT_NOUNS = new Set(["hanger", "hanging", "bag", "tote", "purse", "hat", "beanie", "scarf", "shawl", "blanket", "throw", "rug", "pillow", "cushion", "coaster", "placemat", "runner", "doily", "cardigan", "sweater", "top", "vest", "dress", "skirt", "sock", "slipper", "mitten", "glove", "toy", "doll", "keychain", "earring", "necklace", "bracelet", "ornament", "garland", "wreath", "basket", "bookmark", "planner", "journal", "card", "poster", "print", "jacket", "pullover", "tee", "bralette", "shrug", "cowl", "headband", "bunting", "quilt", "apron"]);
// Yapım yöntemleri ürün adı içerse de özelliktir ("top down" bir kazak yapım şeklidir, "top" ürünü değil).
const CONSTRUCTIONS = new Set(["top down", "bottom up", "top-down", "bottom-up", "seamless top down", "toe up", "cuff down"]);
// Zanaat deseninde aramada ürün adı yoksa (ör. "embroidery pattern") kullanılacak bitmiş ürün.
const CRAFT_FALLBACK_PRODUCT: Record<PatternCraft, string> = { crochet: "granny square", knitting: "sweater", embroidery: "hoop art", cross_stitch: "hoop art", sewing: "tote bag", macrame: "wall hanging", punch_needle: "mug rug" };
const SINGLE_COLORS = new Set(COLOR_LEXICON.flatMap((color) => color.name.includes(" ") ? [color.name.split(" ").at(-1)!] : [color.name]));
const MULTI_COLORS = new RegExp(`\\b(?:${COLOR_LEXICON.filter((color) => color.name.includes(" ")).map((color) => color.name).join("|")})\\b`, "g");
const isColorWord = (word: string) => SINGLE_COLORS.has(word);

const CRAFT_GLOBAL = CRAFT_PHRASES.map(([craft, source]) => [craft, new RegExp(source, "g"), new RegExp(source)] as const);
const TERM_PATTERNS = new Map<string, RegExp>();
const termPattern = (term: string) => {
  let pattern = TERM_PATTERNS.get(term);
  if (!pattern) TERM_PATTERNS.set(term, pattern = new RegExp(`\\s${term.replace(/[-]/g, "[- ]?")}s?\\s`));
  return pattern;
};

function stripCraft(text: string): string {
  return CRAFT_GLOBAL.reduce((value, [, global]) => value.replace(global, " "), text);
}

// Başlık ve etiketleri anlamlı parçalara böler: zanaat adları çıkarılır, dolgu kelimeleri ayraç olur.
function chunks(text: string): string[][] {
  const words = stripCraft(clean(text).replace(/\b(no|low)[ -]?sew\b/g, "$1-sew").replace(DURATION, "$1-$2").replace(SIZE_SIGNAL, " | ").replace(MULTI_COLORS, " | ")).split(/\s+/);
  const result: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    if (!word || word === "|" || STOP.has(word) || SKILL_WORDS[word] || (NOT_A_WORD.test(word) && !DURATION_WORD.test(word))) {
      if (current.length) result.push(current);
      current = [];
    } else current.push(word);
  }
  if (current.length) result.push(current);
  return result;
}

function corpus(result?: TrendResult): Array<{ text: string; weight: number; rising: boolean }> {
  if (!result) return [];
  const rows = [
    ...(result.topTags || []).map((item) => ({ text: item.tag, weight: item.count, rising: false })),
    ...(result.risingTags || []).map((item, index) => ({ text: item.tag, weight: Math.max(1, 3 - index * 0.2), rising: true }))
  ];
  for (const example of result.examples || []) {
    const weight = 1 + Math.min(2, Math.log10(1 + (example.favorites || 0)) / 2);
    for (const segment of String(example.title || "").split(/[,|•·;:/()]| - | – /).slice(0, 3)) rows.push({ text: segment, weight, rising: (example.ageDays ?? 999) <= 120 });
  }
  return rows;
}

export function detectCraft(keyword: string, texts: string[], hint?: string): PatternCraft {
  const lower = keyword.toLowerCase();
  for (const [craft, , single] of CRAFT_GLOBAL) if (single.test(lower)) return craft;
  if (hint && CRAFT_PHRASES.some(([craft]) => craft === hint)) return hint as PatternCraft;
  const counts = new Map<PatternCraft, number>();
  for (const text of texts) for (const [craft, , single] of CRAFT_GLOBAL) if (single.test(text.toLowerCase())) counts.set(craft, (counts.get(craft) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "crochet";
}

function ranked(map: Map<string, number>): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || b[0].split(" ").length - a[0].split(" ").length || a[0].localeCompare(b[0]));
}

// Ürün: aramada ürün adı varsa odur; yoksa etiketlerdeki parçaların son kelimesi (baş isim) sayılır.
function mineProduct(keyword: string, rows: Row[], fallback?: string): { product: string; source: string; head: string } {
  const remainder = chunks(keyword).flat();
  const heads = new Map<string, number>();
  const specifics = new Map<string, number>();
  for (const row of rows) {
    if (row.tokens.length === 0) continue;
    const lastToken = row.tokens[row.tokens.length - 1];
    const head = singular(lastToken);
    if (AUDIENCE_OR_SEASON.test(lastToken) || AUDIENCE_OR_SEASON.test(head) || isColorWord(head) || ADJECTIVE_HEADS.test(head)) continue;
    heads.set(head, (heads.get(head) || 0) + row.weight);
    if (row.tokens.length >= 2) {
      const before = row.tokens[row.tokens.length - 2];
      if (!AUDIENCE_OR_SEASON.test(before) && !isColorWord(before)) {
        const phrase = `${before} ${row.tokens[row.tokens.length - 1]}`;
        specifics.set(phrase, (specifics.get(phrase) || 0) + row.weight);
      }
    }
  }
  const pickMined = () => {
    const [head, total] = ranked(heads)[0] || [];
    if (!head) return undefined;
    const specific = ranked(specifics).find(([phrase]) => singular(phrase.split(" ")[1]) === head);
    return specific && specific[1] >= total! * 0.4 ? { product: specific[0], count: specific[1] } : { product: head, count: total! };
  };
  if (remainder.length > 1 && AUDIENCE_OR_SEASON.test(remainder[remainder.length - 1]) && !AUDIENCE_OR_SEASON.test(remainder[remainder.length - 2])) {
    const reordered = [remainder[remainder.length - 1], ...remainder.slice(0, -1)];
    return { product: reordered.join(" "), source: "aramadan", head: singular(reordered[reordered.length - 1]) };
  }
  if (remainder.length && !AUDIENCE_OR_SEASON.test(remainder[remainder.length - 1])) {
    const product = remainder.join(" ");
    return { product, source: "aramadan", head: singular(remainder[remainder.length - 1]) };
  }
  const mined = pickMined();
  if (!mined && !remainder.length && fallback) return { product: fallback, source: "aramada ürün adı yok; tekniğin en çok satan bitmiş ürünü", head: singular(fallback.split(" ").at(-1)!) };
  if (!mined) return { product: remainder.join(" "), source: "aramadan", head: singular(remainder.at(-1) || "") };
  const product = remainder.length && !mined.product.startsWith(remainder.join(" ")) ? `${remainder.join(" ")} ${mined.product}` : mined.product;
  return { product, source: `üst ilan etiketlerinden (${Math.round(mined.count)} sinyal)`, head: singular(product.split(" ").at(-1)!) };
}

// Özellikler: ürün adından önce gelen kelimeler (ör. "oversized", "granny square") ve
// ürün adı geçmeyen ama başka yerde sıfat olarak kullanılan kısa ifadeler.
function mineFeatures(rows: Row[], productWords: Set<string>, head: string): { all: Array<[string, number]>; rising: Array<[string, number]> } {
  const scores = new Map<string, number>();
  const risingScores = new Map<string, number>();
  const modifierWords = new Set<string>();
  const add = (phrase: string, weight: number, rising: boolean) => {
    scores.set(phrase, (scores.get(phrase) || 0) + weight);
    if (rising) risingScores.set(phrase, (risingScores.get(phrase) || 0) + weight);
  };
  const usable = (word: string) => !productWords.has(word) && !productWords.has(singular(word)) && !isColorWord(word) && !MATERIAL_WORDS.has(word) && word.length > 2;
  for (const row of rows) {
    const index = row.tokens.findIndex((word) => singular(word) === head);
    if (index <= 0) continue;
    // Ürün kelimeleri çıkarıldıktan sonra ürün adından önceki son 3 kelime (ör. "enchanted moss junk journal kit" → enchanted, moss).
    const modifiers = row.tokens.slice(0, index).filter(usable).slice(-3);
    modifiers.forEach((word) => modifierWords.add(word));
    modifiers.forEach((word) => add(word, row.weight, row.rising));
    // İki kelimelik özellik yalnızca ürün adının hemen önündeyse sayılır ("granny square cardigan" → "granny square").
    if (modifiers.length >= 2) add(modifiers.slice(-2).join(" "), row.weight, row.rising);
  }
  for (const row of rows) {
    if (row.tokens.some((word) => singular(word) === head)) continue;
    // Ortadan kelime düşen ifade bozulur ("he said she said" → "said she said"): iki harfli kelimeler ifadede kalır,
    // başka bir kelime düşerse ifade hiç kullanılmaz.
    const keep = (word: string) => usable(word) || (word.length === 2 && /^[a-z]+$/.test(word) && !NOT_A_WORD.test(word));
    const kept = row.tokens.map(keep);
    const first = kept.indexOf(true);
    const last = kept.lastIndexOf(true);
    if (first !== -1 && kept.slice(first, last + 1).includes(false)) continue;
    const words = row.tokens.filter(keep);
    if (!words.some(usable) || words.length > 4) continue;
    if (words.length === 1 && !modifierWords.has(words[0])) continue;
    add(words.join(" "), row.weight * 0.6, row.rising);
  }
  // Tek kelime ile onu içeren ifade aynı özelliktir; ifade yeterince sık geçiyorsa ("granny" yerine "granny square") o kalır.
  const prune = (list: Array<[string, number]>) => {
    const chosen: Array<[string, number]> = [];
    for (const [phrase, score] of list) {
      const words = phrase.split(" ");
      const overlap = chosen.findIndex(([other]) => { const otherWords = other.split(" "); return words.every((word) => otherWords.includes(word)) || otherWords.every((word) => words.includes(word)); });
      if (overlap === -1) chosen.push([phrase, score]);
      else if (words.length > chosen[overlap][0].split(" ").length && score >= chosen[overlap][1] * 0.6) chosen[overlap] = [phrase, score];
    }
    return chosen;
  };
  const byLength = (list: Array<[string, number]>) => [...list].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  return { all: prune(byLength(ranked(scores))).slice(0, 10), rising: prune(byLength(ranked(risingScores))).slice(0, 5) };
}

function mineLexicon(texts: Array<{ text: string; weight: number }>, lexicon: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  const ordered = [...lexicon].sort((a, b) => b.length - a.length);
  for (const { text, weight } of texts) {
    let value = ` ${clean(text)} `;
    for (const term of ordered) {
      const pattern = termPattern(term);
      if (pattern.test(value)) {
        counts.set(term, (counts.get(term) || 0) + weight);
        value = value.replace(pattern, " ");
      }
    }
  }
  return ranked(counts);
}

function mineSizes(texts: Array<{ text: string; weight: number }>): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const { text, weight } of texts) {
    for (const match of clean(text).matchAll(SIZE_SIGNAL)) {
      const size = match[0].replace(/\s+/g, " ").replace(/ ?- ?/g, "-").replace(/ to /, "-");
      counts.set(size, (counts.get(size) || 0) + weight);
    }
  }
  return ranked(counts);
}

const PRINT_FORMAT_SIGNALS: Array<[string, RegExp]> = [
  ["US Letter", /\b(us letter|letter size|8\.5 ?x ?11)\b/],
  ["A4", /\ba4\b/],
  ["A5", /\ba5\b/],
  ["Half Letter", /\b(half letter|5\.5 ?x ?8\.5)\b/],
  ["4x6 in cards", /\b4 ?x ?6\b/],
  ["5x7 in cards", /\b5 ?x ?7\b/],
  ["8x10 in", /\b8 ?x ?10\b/],
  ["11x14 in", /\b11 ?x ?14\b/],
  ["12x12 in sheets", /\b12 ?x ?12\b/]
];

// PDF ürünlerinde format: türün standart formatları + rakiplerde geçen ek formatlar.
function printableFormats(kind: PrintableKind, texts: Array<{ text: string; weight: number }>): { formats: string[]; mined: string[] } {
  const counts = new Map<string, number>();
  for (const { text, weight } of texts) {
    const value = text.toLowerCase();
    for (const [label, pattern] of PRINT_FORMAT_SIGNALS) if (pattern.test(value)) counts.set(label, (counts.get(label) || 0) + weight);
  }
  const mined = ranked(counts).map(([label]) => label);
  const defaults = defaultPrintableFormats(kind);
  const extra = mined.filter((label) => !defaults.some((item) => item.toLowerCase().startsWith(label.toLowerCase().split(" ")[0])));
  return { formats: [...defaults, ...extra].slice(0, 6), mined };
}

function formatSize(value: string): string {
  return value.replace(/\b(\d?x*[sl]|xs|xxs)\b/g, (match) => match.toUpperCase()).replace(/^plus size/, "Plus Size").replace(/^one size/, "One Size").replace(/^size inclusive/, "Size Inclusive");
}

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return distance > 180 ? 360 - distance : distance;
}

// Palet: trend rengi varsa korunur; eksik kalan renkler ton uyumuna göre tamamlanır ve
// bu arama için daha önce kullanılmış paletler tekrar seçilmez.
function buildPalette(trendColors: string[], random: () => number, usedPalettes: Set<string>, styleTexts: string[] = []): { colors: string[]; source: string } {
  const hasHue = trendColors.some((name) => COLOR_LEXICON.find((color) => color.name === name)?.hue !== undefined);
  if (!hasHue) {
    // Palet ürünün ana temasından gelir: en önemli ifadeden başlayarak ilk eşleşen stil kullanılır (stiller karıştırılmaz).
    const style = styleTexts.map((text) => STYLE_PALETTES.find((item) => item.pattern.test(text))).find(Boolean);
    const options = style ? style.palettes.map((palette) => ({ palette, label: style.label })) : [];
    if (options.length) {
      const start = Math.floor(random() * options.length);
      for (let offset = 0; offset < options.length; offset += 1) {
        const option = options[(start + offset) % options.length];
        if (!usedPalettes.has([...option.palette].sort().join("|")) || offset === options.length - 1) return { colors: option.palette, source: `trendin ${option.label} stiline uygun palet` };
      }
    }
  }
  const lexicon = (name: string) => COLOR_LEXICON.find((color) => color.name === name);
  const hues = trendColors.filter((name) => lexicon(name)?.hue !== undefined);
  const neutrals = trendColors.filter((name) => lexicon(name) && lexicon(name)!.hue === undefined);
  const allChromatic = COLOR_LEXICON.filter((color) => color.hue !== undefined);
  const allNeutral = COLOR_LEXICON.filter((color) => color.hue === undefined && color.name !== "grey").map((color) => color.name);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  let best: string[] = [];
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const base = hues[0] ? lexicon(hues[0])! : pick(allChromatic);
    const companions = allChromatic.filter((color) => color.name !== base.name && !color.name.includes(base.name) && !base.name.includes(color.name) && (hueDistance(color.hue!, base.hue!) >= 100 || (hueDistance(color.hue!, base.hue!) >= 25 && hueDistance(color.hue!, base.hue!) <= 60)));
    const second = hues[1] && attempt === 0 ? hues[1] : (pick(companions) || pick(allChromatic)).name;
    const third = neutrals[0] && attempt < 2 ? neutrals[0] : pick(allNeutral);
    const palette = [base.name, second, third];
    best = palette;
    if (!usedPalettes.has([...palette].sort().join("|"))) break;
  }
  const source = hues.length >= 2 ? "trend renkleri ve yeni tamamlayıcı" : hues.length === 1 ? "trend rengi ve uyumlu yeni renkler" : "trendde renk sinyali yok; bu arama için kullanılmamış yeni palet";
  return { colors: best, source };
}

function buildMaterial(craft: PatternCraft, texts: Array<{ text: string; weight: number }>): { note: string; source: string } {
  const weight = mineLexicon(texts, YARN_WEIGHTS)[0]?.[0];
  const fiber = mineLexicon(texts, FIBERS)[0]?.[0];
  if (!weight && !fiber) return { note: craftDefaultMaterial(craft), source: "trendde malzeme sinyali yok; tekniğin standart malzemesi" };
  const weightLabel = weight === "dk" ? "DK" : weight;
  const parts = [weightLabel, fiber].filter(Boolean).join(" ");
  const needsYarn = YARN_CRAFTS.has(craft) && (!fiber || YARN_FIBERS.has(fiber));
  return { note: needsYarn ? `${parts} yarn` : parts, source: "üst ilanlarda geçen malzeme" };
}

function chooseSkill(texts: Array<{ text: string; weight: number }>): { level: SkillLevel; evidence: string } {
  const counts = new Map<SkillLevel, number>();
  for (const { text, weight } of texts) {
    for (const word of clean(text).split(" ")) if (SKILL_WORDS[word]) counts.set(SKILL_WORDS[word], (counts.get(SKILL_WORDS[word]) || 0) + weight);
  }
  const [level, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return level ? { level, evidence: `etiket ve başlıklarda ${Math.round(count!)} sinyal` } : { level: "easy", evidence: "trendde seviye sinyali yok; en geniş alıcı kitlesi" };
}

// Özellikler tek temada toplanır: en güçlü ifade temayı belirler, onunla çatışan (ör. Noel + cadı) ifadeler alınmaz.
function pickFeatures(pool: Array<[string, number]>, rising: Array<[string, number]>, random: () => number, usedCombos: Set<string>, base: Set<ThemeFamily>): { features: string[]; fresh: boolean } {
  if (!pool.length) return { features: [], fresh: true };
  const anchor = pool[0][0];
  const anchorFamilies = new Set([...base, ...themeFamilies(anchor)]);
  // Bayram yalnız ana temaysa girer: "farmhouse" tarif kartına üçüncü özellik olarak "christmas" eklenmez.
  const compatible = (phrase: string, families: Set<ThemeFamily>) => !familiesConflict(themeFamilies(phrase), families) && holidayAllowed(phrase, anchorFamilies);
  const risingOnly = rising.map(([phrase]) => phrase).filter((phrase) => phrase !== anchor && compatible(phrase, anchorFamilies));
  const others = pool.slice(1, 8).map(([phrase]) => phrase);
  let last: string[] = [anchor];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const set = new Set([anchor]);
    const families = new Set(anchorFamilies);
    const add = (phrase: string) => { set.add(phrase); themeFamilies(phrase).forEach((family) => families.add(family)); };
    if (risingOnly.length) add(risingOnly[Math.floor(random() * risingOnly.length)]);
    let rest = others.filter((phrase) => !set.has(phrase));
    while (set.size < 3) {
      rest = rest.filter((phrase) => compatible(phrase, families));
      if (!rest.length) break;
      add(rest.splice(Math.floor(random() * rest.length), 1)[0]);
    }
    last = [...set];
    if (!usedCombos.has([...last].sort().join("|"))) return { features: last, fresh: true };
  }
  return { features: last, fresh: false };
}

async function readJson<T>(store: TrendStore | undefined, key: string, fallback: T): Promise<T> {
  if (!store) return fallback;
  try {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

const MANUAL_OFFERS = new Set(["commercial", "video", "editable"]);
const MANUAL_OFFER_TR: Record<string, (share: string) => string> = {
  commercial: (share) => `Ticari lisans: rakiplerin ${share}'i ticari kullanım lisansı belirtiyor. Bu ürün kişisel kullanım lisansıyla satılır; ticari lisansı istersen ileride ayrı bir "Commercial License" ilanı olarak aç, bu ilanda yazma.`,
  video: (share) => `Video eğitim: rakiplerin ${share}'i video eğitim belirtiyor. Yapay zekâ video çekemez; ürünü yaparken telefonla kısa bir video çekebilirsen ilana ekle, çekmeden ilanda yazma.`,
  editable: (share) => `Düzenlenebilir şablon: rakiplerin ${share}'i düzenlenebilir (Canva/fillable) sürüm belirtiyor. Bu paket düzenlenemez PDF üretir; ilanda "editable" yazma.`
};

function joinEn(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function buildCompetition(result: TrendResult | undefined, kind: PrintableKind | undefined, ourPages: number | undefined, risingFeatures: string[]): CompetitionPlan {
  const median = result?.metrics.medianPriceUsd;
  const signals = result?.signals;
  const relevant = RELEVANT_FORMATS[kind || "pattern"];
  const formats = (signals?.formats || []).filter((item) => relevant.includes(item.id) && FORMAT_OFFERS[item.id]);
  const standard = formats.filter((item) => item.share >= 0.5);
  const gaps = formats.filter((item) => item.share < 0.25);
  const launch = median ? charmPrice(median * 0.88) : undefined;
  const bundle = median ? charmPrice(median * 2.3) : undefined;
  const competitorPages = signals?.pageCountMedian;
  const percent = (value: number) => `%${Math.round(value * 100)}`;
  const planTr: string[] = [];
  const planEn: string[] = [];
  if (median && launch && bundle) {
    planTr.push(`Fiyat: rakip ortancası ${median.toFixed(2)} USD → ilk yorumlara kadar ${launch.toFixed(2)} USD, set ${bundle.toFixed(2)} USD.`);
  }
  if (competitorPages && ourPages) {
    planTr.push(`İçerik: rakipler ortanca ${competitorPages} sayfa → bizde ${ourPages} sayfa.`);
    planEn.push(`include about ${ourPages} pages (the top listings' median is ${competitorPages})`);
  }
  // Yapay zekânın tek sohbette üretebileceği ve ilanda dürüstçe yazılabilecek formatlar talimata girer.
  // Ticari lisans (ürün kişisel kullanım lisanslı), video (yapay zekâ çekemez) ve düzenlenebilir şablon (PDF düzenlenemez)
  // talimata girmez; satıcıya ayrı bir iş olarak önerilir.
  const deliverable = (item: { id: string }) => !MANUAL_OFFERS.has(item.id);
  const gapFiles = gaps.filter(deliverable);
  const standardFiles = standard.filter(deliverable);
  if (gapFiles.length) {
    planTr.push(`Rakiplerin azının başlık/etiketinde belirttiği, bizim sunup ilanda açıkça yazacağımız: ${gapFiles.map((item) => `${FORMAT_OFFERS[item.id].tr} (rakiplerin ${percent(item.share)}'i)`).join(", ")}.`);
    const plural = gapFiles.length > 1 || /\b(sizes|versions|files|sheets)\b/.test(FORMAT_OFFERS[gapFiles[0].id].en);
    planEn.push(`include ${joinEn(gapFiles.map((item) => FORMAT_OFFERS[item.id].en))} and name ${plural ? "them" : "it"} on the cover, because few competitors offer ${plural ? "them" : "it"}`);
  }
  if (standardFiles.length) {
    planTr.push(`Mutlaka olacak (rakiplerin çoğunda var): ${standardFiles.map((item) => `${FORMAT_OFFERS[item.id].tr} (${percent(item.share)})`).join(", ")}.`);
    planEn.push(`always include ${joinEn(standardFiles.map((item) => FORMAT_OFFERS[item.id].en))}`);
  }
  for (const item of [...gaps, ...standard].filter((entry) => !deliverable(entry))) planTr.push(MANUAL_OFFER_TR[item.id](percent(item.share)));
  if (signals && result!.metrics.sampleSize > 10) {
    if (signals.bundleShare < 0.1) {
      planTr.push(`Paket boşluğu: rakiplerin yalnızca ${percent(signals.bundleShare)}'i set sunuyor → aynı stilde set de hazırla.`);
      planEn.push("design it so it can be sold as part of a matching set");
    } else if (signals.bundleShare >= 0.3) {
      planTr.push(`Setler satıyor (rakiplerin ${percent(signals.bundleShare)}'i) → tekli ürünle birlikte set ilanı da aç.`);
      planEn.push("plan it as part of a coordinated bundle");
    }
  }
  if (risingFeatures.length) {
    planTr.push(`Yeni ilanlarda yükselen özellikleri ilk sen kullan: ${risingFeatures.join(", ")}.`);
    planEn.push(`work in the rising ${risingFeatures.length > 1 ? "features" : "feature"} ${joinEn(risingFeatures.map(proseCase))} where ${risingFeatures.length > 1 ? "they fit" : "it fits"} the theme`);
  }
  if (result && result.metrics.newcomerShare >= 0.4) planTr.push(`Üst ilanların ${percent(result.metrics.newcomerShare)}'i son 6 ayda açılmış → yeni mağaza için açık niş, hızlı listele.`);
  if (signals?.ipRisks.length) planTr.push(`Telif riski olan kelimeler kullanılmayacak: ${signals.ipRisks.join(", ")}.`);
  return {
    medianPriceUsd: median,
    launchPriceUsd: launch,
    bundlePriceUsd: bundle,
    competitorPages,
    ourPages,
    standardFormats: standard.map((item) => FORMAT_OFFERS[item.id].tr),
    gapFormats: gaps.filter((item) => FORMAT_OFFERS[item.id].format).map((item) => FORMAT_OFFERS[item.id].format!),
    bundleShare: signals?.bundleShare,
    topCompetitors: (result?.examples || []).slice(0, 3).map((example) => ({ title: example.title.slice(0, 90), favorites: example.favorites, priceUsd: example.priceUsd, ageDays: example.ageDays })),
    planTr,
    planEn
  };
}

function mineAudience(texts: Array<{ text: string; weight: number }>): string | undefined {
  const counts = new Map<string, number>();
  for (const { text, weight } of texts) {
    const value = ` ${clean(text)} `;
    for (const [term, label] of AUDIENCE_TERMS) if (value.includes(` ${term} `)) counts.set(label, (counts.get(label) || 0) + weight);
  }
  const top = ranked(counts).slice(0, 2).map(([label]) => label);
  return top.length ? top.join(", ") : undefined;
}

const SKILL_TR: Record<SkillLevel, string> = { beginner: "Başlangıç", easy: "Kolay", intermediate: "Orta", experienced: "İleri" };

export function buildPatternSeed(keywordInput: string, result: TrendResult | undefined, options: { craftHint?: string; kindHint?: PrintableKind; groupHint?: TrendGroup; nonce?: string; history?: SeedHistory; now?: number } = {}): PatternSeed & { comboKey: string; paletteKey: string } {
  const keyword = normalizeKeyword(keywordInput);
  const texts = corpus(result).filter((item) => !isIpRisky(item.text));
  const studio: PatternSeed["studio"] = (result?.group || options.groupHint || inferTrendGroup(keyword)) === "printables" ? "printable" : "pattern";
  const kind: PrintableKind | undefined = studio === "printable" ? result?.kind || options.kindHint || inferPrintableKind(keyword) || "planner" : undefined;
  const craft = detectCraft(keyword, [keyword, ...texts.map((item) => item.text)], options.craftHint || result?.craft);
  const rows: Row[] = texts.flatMap((item) => chunks(item.text).map((tokens) => ({ tokens, weight: item.weight, rising: item.rising })));
  const mined0 = mineProduct(keyword, rows, studio === "pattern" ? CRAFT_FALLBACK_PRODUCT[craft] : undefined);
  // Tablet planlayıcıda ürün adı "digital planner" olmalı; "digital" kelimesi genel kelime olarak ayıklanıyor.
  // Nakış ve kanaviçede tek kelimelik motif ("mushroom") bitmiş ürün değildir: "mushroom hoop art".
  const product = kind === "digital_planner" && !/\bdigital\b/.test(mined0.product) ? { ...mined0, product: `digital ${mined0.product}` }
    : (craft === "embroidery" || craft === "cross_stitch") && studio === "pattern" && !mined0.product.includes(" ") && !PRODUCT_NOUNS.has(singular(mined0.product)) && mined0.product !== "sampler" ? { ...mined0, product: `${mined0.product} hoop art`, head: "art" } : mined0;
  const productWords = new Set(product.product.split(" ").flatMap((word) => [word, singular(word)]));
  const random = seededRandom(hash(`${keyword}|${options.nonce || ""}|${(options.history?.combos || []).length}`));
  const history = options.history || { combos: [], palettes: [] };
  const mined = mineFeatures(rows, productWords, product.head);
  const now = options.now ?? Date.now();
  const keywordFamilies = themeFamilies(`${keyword} ${product.product}`);
  // Özellik olamayacaklar: marka/telif, satış biçimi (kit, pages, commercial use, editable) ve zamanı geçmiş/çok uzak bayram.
  // Arama ifadesinin kendi bayramı (ör. "halloween coloring pages") düşürülmez; zamanlama uyarısı satıcıya gösterilir.
  const outOfWindow: string[] = [];
  const usable = ([phrase]: [string, number]) => {
    if (isIpRisky(phrase) || MISLEADING_FEATURE.test(phrase)) return false;
    if (phrase.split(" ").every((word) => META_WORDS.has(word) || productWords.has(word))) return false;
    if (!CONSTRUCTIONS.has(phrase) && phrase.split(" ").some((word) => PRODUCT_NOUNS.has(singular(word)) && !productWords.has(word) && !productWords.has(singular(word)))) return false;
    const timing = holidayOutOfWindow(phrase, studio, now);
    if (timing && !keywordFamilies.has(timing.family)) {
      outOfWindow.push(`${phrase} (${timing.nameTr}: ${timing.daysUntil} gün)`);
      return false;
    }
    return true;
  };
  const pool = mined.all.filter(usable);
  const risingPool = mined.rising.filter(usable);
  const chosen = pickFeatures(pool, risingPool, random, new Set(history.combos), keywordFamilies);
  const themeSet = new Set([...keywordFamilies, ...chosen.features.flatMap((feature) => [...themeFamilies(feature)])]);
  const offTheme = [...pool, ...risingPool].map(([phrase]) => phrase).filter((phrase, index, list) => list.indexOf(phrase) === index && !chosen.features.includes(phrase) && !fitsTheme(phrase, themeSet));
  const risingFeatures = risingPool.map(([phrase]) => phrase).filter((phrase) => !chosen.features.includes(phrase) && fitsTheme(phrase, themeSet)).slice(0, 2);
  const colorRank = mineLexicon(texts, COLOR_LEXICON.map((color) => color.name));
  const descriptors = mineLexicon(texts, COLOR_DESCRIPTORS).map(([name]) => name);
  // ABD yazımı: "grey" → "gray".
  const trendColors = colorRank.map(([name]) => name.replace(/\bgrey\b/, "gray")).filter((name, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.includes(name) && other !== name)).slice(0, 4);
  const palette = buildPalette(trendColors, random, new Set(history.palettes), [keyword, ...chosen.features, ...risingFeatures, ...descriptors]);
  const headPattern = new RegExp(`\\b${product.head.replace(/[^a-z0-9]/g, "")}s?\\b`);
  const titleTexts = (result?.examples || []).map((example) => ({ text: String(example.title || ""), weight: 1 }));
  const productTexts = [...texts, ...titleTexts].filter((item) => headPattern.test(clean(item.text)));
  const material = buildMaterial(craft, productTexts.length ? productTexts : texts);
  const mainSkill = chooseSkill(texts);
  // Zorluk inanılır olmalı: bedenli giysi en az "Kolay", örgü saç/jakar/dantel en az "Orta" (yeni başlayan yanlış ürünü alıp kötü yorum bırakmasın).
  const SKILL_ORDER: SkillLevel[] = ["beginner", "easy", "intermediate", "experienced"];
  const atLeast = (level: SkillLevel, minimum: SkillLevel) => SKILL_ORDER.indexOf(level) >= SKILL_ORDER.indexOf(minimum) ? level : minimum;
  const construction = `${product.product} ${chosen.features.join(" ")}`;
  const minimum: SkillLevel = /\b(cables?|fair isle|colorwork|lace|brioche|intarsia|tapestry|mosaic|stranded)\b/.test(construction) ? "intermediate"
    : studio === "pattern" && /\b(cardigan|sweater|pullover|jumper|top|vest|dress|skirt|jacket)\b/.test(product.product) ? "easy" : "beginner";
  const skill = atLeast(mainSkill.level, minimum) === mainSkill.level ? mainSkill : { level: minimum, evidence: `${mainSkill.evidence}; bu yapı için en az ${SKILL_TR[minimum]} seviyesi gerekir` };
  const size = mineSizes(productTexts).filter(([value]) => !PRINT_FORMATS.test(value)).slice(0, 2).map(([value]) => formatSize(value));
  const sizeNote = size.join(", ").slice(0, 60);
  const metrics = result?.metrics;
  // Ürünün temasına uymayan etiketler (Noel ürününde "halloween coloring") ilan ve yapay zekâ önerisine hiç gitmez.
  const trendTags = [...new Set([...(result?.risingTags || []).map((item) => item.tag), ...(result?.topTags || []).map((item) => item.tag)].map((tag) => clean(tag)).filter((tag) => tag && !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, themeSet)))].slice(0, 20);
  const printable = kind ? printableFormats(kind, [...texts, ...titleTexts]) : undefined;
  const competitorPages = result?.signals?.pageCountMedian;
  const pageCount = kind ? (competitorPages ? Math.ceil(competitorPages * 1.2) : defaultPrintablePages(kind)) : undefined;
  const competition = buildCompetition(result, kind, pageCount, risingFeatures);
  const audience = kind ? mineAudience([...texts, ...titleTexts]) : undefined;
  if (printable) {
    // "4x6 and 5x7 in cards" zaten "4x6 in cards" ve "5x7 in cards" varken ikinci kez eklenmez.
    const sizeTokens = (format: string) => format.toLowerCase().match(/\d+x\d+|half letter|us letter|\ba[0-9]\b|tablet|ratio|black-and-white/g) || [format.toLowerCase()];
    const covered = () => new Set(printable.formats.flatMap(sizeTokens));
    for (const gap of competition.gapFormats) if (!sizeTokens(gap).every((token) => covered().has(token)) && printable.formats.length < 7) printable.formats.push(gap);
  }
  const notes = [
    `Etsy market brief for "${keyword}"${metrics ? ` (${metrics.activeListings.toLocaleString("en-US")} live listings${metrics.medianPriceUsd ? `, median price ${metrics.medianPriceUsd} USD` : ""})` : ""}`,
    chosen.features.length ? `: buyers favor ${joinEn(chosen.features.map(proseCase))}` : "",
    risingFeatures.length ? `; the newest fast-selling listings add ${joinEn(risingFeatures.map(proseCase))}` : "",
    trendColors.length || descriptors.length ? `; colors seen in top listings: ${joinEn([...trendColors, ...descriptors].slice(0, 5))}` : "",
    audience ? `; main buyers: ${audience}` : "",
    ". ",
    competition.planEn.length ? `To outsell the top listings: ${competition.planEn.join("; ")}.` : ""
  ].join("").trim().slice(0, 1000);
  const keywordTiming = holidayOutOfWindow(keyword, studio, now);
  const themeNotes = [
    ...(offTheme.length ? [`Tek tema: ürün "${chosen.features[0] || keyword}" temasında; çatışan trend ifadeleri ürüne, etikete ve görsellere alınmadı: ${offTheme.slice(0, 5).join(", ")}.`] : []),
    ...(outOfWindow.length ? [`Zamanı uygun olmayan bayram ifadeleri alınmadı: ${outOfWindow.slice(0, 3).join(", ")}.`] : []),
    ...(keywordTiming ? [`Dikkat: ${keywordTiming.nameTr} ${keywordTiming.daysUntil} gün sonra (${keywordTiming.date}). ${keywordTiming.daysUntil < (studio === "pattern" ? 30 : 14) ? "Yeni ilan arama sonuçlarına oturmadan bayram geçer; bu ürünü gelecek yıl için hazırla." : "Alıcılar bu bayram için henüz aramıyor; ürünü hazırlayıp bayramdan yaklaşık 2 ay önce yayınla."}`] : [])
  ];
  const basis = kind ? [
    `PDF türü: ${PRINTABLE_KINDS[kind].labelTr} · Ürün: ${product.product} (${product.source})`,
    chosen.features.length ? `Bu seferki trend özellikleri: ${chosen.features.join(", ")}${risingFeatures.length ? ` · yeni ilanlarda yükselen: ${risingFeatures.join(", ")}` : ""}` : "Trendde belirgin özellik sinyali yok; özgün tasarım yapay zekâya bırakıldı.",
    `Renkler: ${palette.colors.join(", ")} (${palette.source})`,
    `Formatlar: ${printable!.formats.join(", ")}${competition.gapFormats.length ? " (rakiplerde az olanlar eklendi)" : printable!.mined.length ? ` (rakiplerde geçen: ${printable!.mined.slice(0, 3).join(", ")})` : " (türün standart formatları)"}`,
    ...(audience ? [`Hedef kitle: ${audience} (etiket ve başlıklardan)`] : []),
    competitorPages ? `Sayfa: ${pageCount} (rakiplerin ortancası ${competitorPages}; daha fazla değer için %20 fazlası)` : `Sayfa: ${pageCount} (trendde sayfa sayısı sinyali yok; türün tipik değeri)`,
    chosen.fresh ? "Bu özellik kombinasyonu bu arama için ilk kez kullanılıyor." : "Bu aramadaki tüm özellik kombinasyonları denendi; palet ve ad yine yeni seçildi.",
    ...themeNotes
  ] : [
    `Ürün: ${product.product} (${product.source})`,
    chosen.features.length ? `Bu seferki trend özellikleri: ${chosen.features.join(", ")}${risingFeatures.length ? ` · yeni ilanlarda yükselen: ${risingFeatures.join(", ")}` : ""}` : "Trendde belirgin özellik sinyali yok; özgün tasarım yapay zekâya bırakıldı.",
    `Renkler: ${palette.colors.join(", ")} (${palette.source})`,
    `Zorluk: ${SKILL_TR[skill.level]} (${skill.evidence})`,
    `Malzeme: ${material.note} (${material.source})`,
    sizeNote ? `Ölçü: ${sizeNote} (üst ilanlarda geçen ölçü)` : "Ölçü: trendde ölçü sinyali yok; promptta yapay zekâ standart ölçüyü seçer, PDF bitince gerçek ölçüyü girin.",
    chosen.fresh ? "Bu özellik kombinasyonu bu arama için ilk kez kullanılıyor." : "Bu aramadaki tüm özellik kombinasyonları denendi; palet ve desen adı yine yeni seçildi.",
    ...themeNotes
  ];
  return {
    studio,
    ...(kind ? { kind } : {}),
    ...(audience ? { audience } : {}),
    competition,
    formats: printable?.formats || [],
    ...(pageCount ? { pageCount } : {}),
    craft,
    productType: product.product.slice(0, 60),
    referenceSource: "trend",
    referenceNotes: notes,
    referenceColors: [...trendColors, ...descriptors].slice(0, 6),
    skillLevel: skill.level,
    sizeNote,
    yarnNote: material.note.slice(0, 80),
    colors: palette.colors,
    keyword,
    trendTags,
    trendFeatures: chosen.features,
    risingFeatures,
    basis,
    fresh: chosen.fresh,
    scannedAt: result?.scannedAt,
    comboKey: [...chosen.features].sort().join("|"),
    paletteKey: [...palette.colors].sort().join("|")
  };
}

const historyKey = (keyword: string) => `pattern:seed:${normalizeKeyword(keyword).replace(/[^a-z0-9]+/g, "-")}`;

const AUTOPICK_PREFIX = "pattern:autopick:";

function isPrintableKind(value: unknown): value is PrintableKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRINTABLE_KINDS, value);
}

// Arama verilmezse: seçilen türde (PDF türü veya el işi) önbellekteki en yüksek puanlı aramalardan,
// son kullanılanları atlayarak birini seçer.
export async function pickBestKeyword(store: TrendStore | undefined, input: { studio?: string; kind?: string; craft?: string }): Promise<{ keyword: string; reason: string; group: TrendGroup }> {
  const group: TrendGroup = input.studio === "printable" ? "printables" : "patterns";
  const kind = group === "printables" && isPrintableKind(input.kind) ? input.kind : undefined;
  const craft = group === "patterns" && CRAFT_PHRASES.some(([id]) => id === input.craft) ? input.craft as PatternCraft : undefined;
  const matches = (keyword: string, nicheKind?: PrintableKind, nicheCraft?: PatternCraft) => group === "printables"
    ? !kind || (nicheKind || inferPrintableKind(keyword)) === kind
    : !craft || (nicheCraft || detectCraft(keyword, [])) === craft;
  const discovered = await listDiscoveries(store);
  const candidates = [...new Set([
    ...TREND_NICHES.filter((niche) => niche.group === group && matches(niche.keyword, niche.kind, niche.craft)).map((niche) => niche.keyword),
    ...discovered.filter((item) => item.group === group && matches(item.keyword)).map((item) => item.keyword)
  ])].slice(0, 30);
  if (!candidates.length) throw new Error("PATTERN_KEYWORD_REQUIRED");
  const scored = await Promise.all(candidates.map(async (keyword) => ({ keyword, result: await readCached(store, keyword) })));
  const ranking = scored.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1));
  const recentKey = `${AUTOPICK_PREFIX}${group}:${kind || craft || "all"}`;
  const recent = await readJson<string[]>(store, recentKey, []);
  const choice = ranking.slice(0, 5).find((item) => item.result && !recent.includes(item.keyword)) || ranking.find((item) => item.result) || ranking[0];
  if (store) await store.put(recentKey, JSON.stringify([choice.keyword, ...recent.filter((item) => item !== choice.keyword)].slice(0, 3)));
  const reason = choice.result
    ? `Otomatik seçilen arama: "${choice.keyword}" (bu türde en güçlülerden; ${choice.result.score} puan, ${choice.result.verdict})`
    : `Otomatik seçilen arama: "${choice.keyword}" (henüz puanlanmamıştı; şimdi Etsy'de tarandı)`;
  return { keyword: choice.keyword, reason, group };
}

export async function createPatternSeed(
  env: EtsyRuntimeEnv,
  store: TrendStore | undefined,
  input: { keyword?: string; craft?: string; group?: string; kind?: string; studio?: string },
  fetcher: Fetcher = fetch,
  now = Date.now()
): Promise<PatternSeed> {
  let keyword = normalizeKeyword(input.keyword || "");
  let pickedReason: string | undefined;
  let groupHint: TrendGroup | undefined = isTrendGroup(input.group) ? input.group : input.studio === "printable" ? "printables" : undefined;
  if (keyword.length < 3) {
    if (input.studio !== "printable" && input.studio !== "pattern") throw new Error("PATTERN_KEYWORD_REQUIRED");
    const picked = await pickBestKeyword(store, input);
    keyword = picked.keyword;
    pickedReason = picked.reason;
    groupHint = picked.group;
  }
  const niche = TREND_NICHES.find((item) => item.keyword === keyword);
  const group = niche?.group || groupHint || inferTrendGroup(keyword);
  let result: TrendResult | undefined;
  try {
    result = await scanTrend(env, niche ? { nicheId: niche.id } : { keyword, group }, store, fetcher, now);
  } catch {
    result = await readCached(store, keyword);
  }
  const history = await readJson<SeedHistory>(store, historyKey(keyword), { combos: [], palettes: [] });
  const { comboKey, paletteKey, ...seed } = buildPatternSeed(keyword, result, {
    craftHint: input.craft,
    kindHint: niche?.kind || (isPrintableKind(input.kind) ? input.kind : undefined),
    groupHint: group,
    nonce: String(now),
    history,
    now
  });
  if (store) {
    const next: SeedHistory = {
      combos: [comboKey, ...history.combos.filter((item) => item !== comboKey)].slice(0, HISTORY_LIMIT),
      palettes: [paletteKey, ...history.palettes.filter((item) => item !== paletteKey)].slice(0, HISTORY_LIMIT)
    };
    await store.put(historyKey(keyword), JSON.stringify(next));
  }
  return pickedReason ? { ...seed, pickedReason, basis: [pickedReason, ...seed.basis] } : seed;
}

export async function readUsedNames(store: TrendStore | undefined): Promise<string[]> {
  return await readJson<string[]>(store, NAME_HISTORY_KEY, []);
}

export async function rememberName(store: TrendStore | undefined, name: string, used?: string[]): Promise<void> {
  if (!store) return;
  const list = used ?? await readUsedNames(store);
  await store.put(NAME_HISTORY_KEY, JSON.stringify([name, ...list.filter((item) => item !== name)].slice(0, NAME_HISTORY_LIMIT)));
}
