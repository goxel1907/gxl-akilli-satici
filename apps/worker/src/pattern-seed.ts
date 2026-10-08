import type { EtsyRuntimeEnv } from "./etsy.js";
import { inferPrintableKind, inferTrendGroup, normalizeKeyword, readCached, scanTrend, type PatternCraft, type PrintableKind, type TrendResult, type TrendStore } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { craftDefaultMaterial, type SkillLevel } from "./pattern-studio.js";
import { defaultPrintableFormats, defaultPrintablePages, PRINTABLE_KINDS } from "./printable-studio.js";

type Fetcher = typeof fetch;

// Stüdyo alanlarını trend verisinden doldurur. Ürün, özellik, renk, malzeme, ölçü ve zorluk
// sabit bir listeden değil, o aramadaki üst ve yükselen ilanların etiket ve başlıklarından çıkarılır.
export interface PatternSeed {
  studio: "pattern" | "printable";
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
  ["sewing", "\\bsew(?:s|ing|n)?\\b"],
  ["macrame", "\\bmacrame\\b"],
  ["crochet", "\\bcrochet(?:ed|ing)?\\b|\\bamigurumi\\b"]
];
// Teknik filtre: anlam taşımayan ve her ilanda geçen kelimeler özellik sayılmaz.
const STOP = new Set(["pattern", "patterns", "pdf", "pdfs", "digital", "download", "downloads", "instant", "printable", "print", "file", "files", "template", "templates", "tutorial", "tutorials", "diy", "chart", "charts", "svg", "design", "designs", "handmade", "gift", "gifts", "for", "and", "the", "with", "a", "an", "of", "in", "on", "to", "by", "or", "your", "you", "my", "etsy", "listing", "us", "terms", "english", "level", "friendly", "instructions", "written", "video", "step", "guide", "new", "best", "sale", "make", "made", "own", "how", "ebook", "e-book", "item", "items"]);
const SKILL_WORDS: Record<string, SkillLevel> = { beginner: "beginner", beginners: "beginner", easy: "easy", simple: "easy", quick: "easy", intermediate: "intermediate", advanced: "experienced", expert: "experienced" };
const AUDIENCE_OR_SEASON = /^(baby|babies|newborn|kids?|children|toddler|women|womens|ladies|men|mens|girls?|boys?|christmas|xmas|halloween|easter|valentines?|fall|autumn|winter|summer|spring|thanksgiving|hanukkah|ramadan|eid|patriotic|holiday|wedding|bridal)$/;
const SIZE_SIGNAL = /\b(plus size|size inclusive|inclusive sizing|xxs|xs ?(?:-|to) ?\d?x?l|\d?xl|\d{1,3} ?(?:in|inch|inches|cm|mm)|\d{1,3} ?x ?\d{1,3}(?: ?(?:in|inch|inches|cm))?|a0|a4|us letter|newborn|toddler|one size|all sizes|sizes? \d{1,2}(?: ?- ?\d{1,2})?)\b/g;
const NOT_A_WORD = /^(\d.*|a\d|xx?s|x*l|\d?xl)$/;

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
const singular = (word: string) => word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
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
  const words = stripCraft(clean(text).replace(SIZE_SIGNAL, " | ").replace(MULTI_COLORS, " | ")).split(/\s+/);
  const result: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    if (!word || word === "|" || STOP.has(word) || SKILL_WORDS[word] || NOT_A_WORD.test(word)) {
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
function mineProduct(keyword: string, rows: Row[]): { product: string; source: string; head: string } {
  const remainder = chunks(keyword).flat();
  const heads = new Map<string, number>();
  const specifics = new Map<string, number>();
  for (const row of rows) {
    if (row.tokens.length === 0) continue;
    const head = singular(row.tokens[row.tokens.length - 1]);
    if (AUDIENCE_OR_SEASON.test(head) || isColorWord(head)) continue;
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
    const modifiers = row.tokens.slice(Math.max(0, index - 3), index).filter(usable);
    modifiers.forEach((word) => modifierWords.add(word));
    modifiers.forEach((word) => add(word, row.weight, row.rising));
    // İki kelimelik özellik yalnızca ürün adının hemen önündeyse sayılır ("granny square cardigan" → "granny square").
    if (modifiers.length >= 2) add(modifiers.slice(-2).join(" "), row.weight, row.rising);
  }
  for (const row of rows) {
    if (row.tokens.some((word) => singular(word) === head)) continue;
    const words = row.tokens.filter(usable);
    if (words.length === 0 || words.length > 3) continue;
    if (words.length === 1 && !modifierWords.has(words[0])) continue;
    add(words.join(" "), row.weight * 0.6, row.rising);
  }
  const prune = (list: Array<[string, number]>) => {
    const chosen: Array<[string, number]> = [];
    for (const [phrase, score] of list) {
      const words = phrase.split(" ");
      if (chosen.some(([other]) => { const otherWords = other.split(" "); return words.every((word) => otherWords.includes(word)) || otherWords.every((word) => words.includes(word)); })) continue;
      chosen.push([phrase, score]);
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
function buildPalette(trendColors: string[], random: () => number, usedPalettes: Set<string>): { colors: string[]; source: string } {
  const lexicon = (name: string) => COLOR_LEXICON.find((color) => color.name === name);
  const hues = trendColors.filter((name) => lexicon(name)?.hue !== undefined);
  const neutrals = trendColors.filter((name) => lexicon(name) && lexicon(name)!.hue === undefined);
  const allChromatic = COLOR_LEXICON.filter((color) => color.hue !== undefined);
  const allNeutral = COLOR_LEXICON.filter((color) => color.hue === undefined).map((color) => color.name);
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

function pickFeatures(pool: Array<[string, number]>, rising: Array<[string, number]>, random: () => number, usedCombos: Set<string>): { features: string[]; fresh: boolean } {
  if (!pool.length) return { features: [], fresh: true };
  const risingOnly = rising.map(([phrase]) => phrase).filter((phrase) => phrase !== pool[0][0]);
  const others = pool.slice(1, 8).map(([phrase]) => phrase);
  let last: string[] = [pool[0][0]];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const set = new Set([pool[0][0]]);
    if (risingOnly.length) set.add(risingOnly[Math.floor(random() * risingOnly.length)]);
    const rest = others.filter((phrase) => !set.has(phrase));
    while (set.size < 3 && rest.length) set.add(rest.splice(Math.floor(random() * rest.length), 1)[0]);
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

const SKILL_TR: Record<SkillLevel, string> = { beginner: "Başlangıç", easy: "Kolay", intermediate: "Orta", experienced: "İleri" };

export function buildPatternSeed(keywordInput: string, result: TrendResult | undefined, options: { craftHint?: string; nonce?: string; history?: SeedHistory } = {}): PatternSeed & { comboKey: string; paletteKey: string } {
  const keyword = normalizeKeyword(keywordInput);
  const texts = corpus(result).filter((item) => !isIpRisky(item.text));
  const studio: PatternSeed["studio"] = (result?.group || inferTrendGroup(keyword)) === "printables" ? "printable" : "pattern";
  const kind: PrintableKind | undefined = studio === "printable" ? result?.kind || inferPrintableKind(keyword) || "planner" : undefined;
  const craft = detectCraft(keyword, [keyword, ...texts.map((item) => item.text)], options.craftHint || result?.craft);
  const rows: Row[] = texts.flatMap((item) => chunks(item.text).map((tokens) => ({ tokens, weight: item.weight, rising: item.rising })));
  const product = mineProduct(keyword, rows);
  const productWords = new Set(product.product.split(" ").flatMap((word) => [word, singular(word)]));
  const random = seededRandom(hash(`${keyword}|${options.nonce || ""}|${(options.history?.combos || []).length}`));
  const history = options.history || { combos: [], palettes: [] };
  const mined = mineFeatures(rows, productWords, product.head);
  const chosen = pickFeatures(mined.all.filter(([phrase]) => !isIpRisky(phrase)), mined.rising.filter(([phrase]) => !isIpRisky(phrase)), random, new Set(history.combos));
  const risingFeatures = mined.rising.map(([phrase]) => phrase).filter((phrase) => !chosen.features.includes(phrase)).slice(0, 2);
  const colorRank = mineLexicon(texts, COLOR_LEXICON.map((color) => color.name));
  const descriptors = mineLexicon(texts, COLOR_DESCRIPTORS).map(([name]) => name);
  const trendColors = colorRank.map(([name]) => name).filter((name, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.includes(name) && other !== name)).slice(0, 4);
  const palette = buildPalette(trendColors, random, new Set(history.palettes));
  const headPattern = new RegExp(`\\b${product.head.replace(/[^a-z0-9]/g, "")}s?\\b`);
  const titleTexts = (result?.examples || []).map((example) => ({ text: String(example.title || ""), weight: 1 }));
  const productTexts = [...texts, ...titleTexts].filter((item) => headPattern.test(clean(item.text)));
  const material = buildMaterial(craft, productTexts.length ? productTexts : texts);
  const skill = chooseSkill(texts);
  const size = mineSizes(productTexts).filter(([value]) => !PRINT_FORMATS.test(value)).slice(0, 2).map(([value]) => formatSize(value));
  const sizeNote = size.join(", ").slice(0, 60);
  const metrics = result?.metrics;
  const trendTags = [...new Set([...(result?.risingTags || []).map((item) => item.tag), ...(result?.topTags || []).map((item) => item.tag)].map((tag) => clean(tag)).filter((tag) => tag && !isIpRisky(tag)))].slice(0, 20);
  const printable = kind ? printableFormats(kind, [...texts, ...titleTexts]) : undefined;
  const competitorPages = result?.signals?.pageCountMedian;
  const pageCount = kind ? (competitorPages ? Math.ceil(competitorPages * 1.2) : defaultPrintablePages(kind)) : undefined;
  const notes = [
    `Etsy market brief for "${keyword}"${metrics ? ` (${metrics.activeListings.toLocaleString("en-US")} live listings${metrics.medianPriceUsd ? `, median ${metrics.medianPriceUsd} USD` : ""})` : ""}`,
    chosen.features.length ? `: buyers favor ${chosen.features.join(", ")}` : "",
    risingFeatures.length ? `; the newest fast-selling listings add ${risingFeatures.join(", ")}` : "",
    trendColors.length || descriptors.length ? `; colors seen in top listings: ${[...trendColors, ...descriptors].slice(0, 5).join(", ")}` : "",
    "."
  ].join("").slice(0, 600);
  const basis = kind ? [
    `PDF türü: ${PRINTABLE_KINDS[kind].labelTr} · Ürün: ${product.product} (${product.source})`,
    chosen.features.length ? `Bu seferki trend özellikleri: ${chosen.features.join(", ")}${risingFeatures.length ? ` · yeni ilanlarda yükselen: ${risingFeatures.join(", ")}` : ""}` : "Trendde belirgin özellik sinyali yok; özgün tasarım yapay zekâya bırakıldı.",
    `Renkler: ${palette.colors.join(", ")} (${palette.source})`,
    `Formatlar: ${printable!.formats.join(", ")}${printable!.mined.length ? ` (rakiplerde geçen: ${printable!.mined.slice(0, 3).join(", ")})` : " (türün standart formatları)"}`,
    competitorPages ? `Sayfa: ${pageCount} (rakiplerin ortancası ${competitorPages}; daha fazla değer için %20 fazlası)` : `Sayfa: ${pageCount} (trendde sayfa sayısı sinyali yok; türün tipik değeri)`,
    chosen.fresh ? "Bu özellik kombinasyonu bu arama için ilk kez kullanılıyor." : "Bu aramadaki tüm özellik kombinasyonları denendi; palet ve ad yine yeni seçildi."
  ] : [
    `Ürün: ${product.product} (${product.source})`,
    chosen.features.length ? `Bu seferki trend özellikleri: ${chosen.features.join(", ")}${risingFeatures.length ? ` · yeni ilanlarda yükselen: ${risingFeatures.join(", ")}` : ""}` : "Trendde belirgin özellik sinyali yok; özgün tasarım yapay zekâya bırakıldı.",
    `Renkler: ${palette.colors.join(", ")} (${palette.source})`,
    `Zorluk: ${SKILL_TR[skill.level]} (${skill.evidence})`,
    `Malzeme: ${material.note} (${material.source})`,
    sizeNote ? `Ölçü: ${sizeNote} (üst ilanlarda geçen ölçü)` : "Ölçü: trendde ölçü sinyali yok; promptta yapay zekâ standart ölçüyü seçer, PDF bitince gerçek ölçüyü girin.",
    chosen.fresh ? "Bu özellik kombinasyonu bu arama için ilk kez kullanılıyor." : "Bu aramadaki tüm özellik kombinasyonları denendi; palet ve desen adı yine yeni seçildi."
  ];
  return {
    studio,
    ...(kind ? { kind } : {}),
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

export async function createPatternSeed(
  env: EtsyRuntimeEnv,
  store: TrendStore | undefined,
  input: { keyword: string; craft?: string },
  fetcher: Fetcher = fetch,
  now = Date.now()
): Promise<PatternSeed> {
  const keyword = normalizeKeyword(input.keyword || "");
  if (keyword.length < 3) throw new Error("PATTERN_KEYWORD_REQUIRED");
  let result: TrendResult | undefined;
  try {
    result = await scanTrend(env, { keyword, group: "patterns" }, store, fetcher, now);
  } catch {
    result = await readCached(store, keyword);
  }
  const history = await readJson<SeedHistory>(store, historyKey(keyword), { combos: [], palettes: [] });
  const { comboKey, paletteKey, ...seed } = buildPatternSeed(keyword, result, { craftHint: input.craft, nonce: String(now), history });
  if (store) {
    const next: SeedHistory = {
      combos: [comboKey, ...history.combos.filter((item) => item !== comboKey)].slice(0, HISTORY_LIMIT),
      palettes: [paletteKey, ...history.palettes.filter((item) => item !== paletteKey)].slice(0, HISTORY_LIMIT)
    };
    await store.put(historyKey(keyword), JSON.stringify(next));
  }
  return seed;
}

export async function readUsedNames(store: TrendStore | undefined): Promise<string[]> {
  return await readJson<string[]>(store, NAME_HISTORY_KEY, []);
}

export async function rememberName(store: TrendStore | undefined, name: string, used?: string[]): Promise<void> {
  if (!store) return;
  const list = used ?? await readUsedNames(store);
  await store.put(NAME_HISTORY_KEY, JSON.stringify([name, ...list.filter((item) => item !== name)].slice(0, NAME_HISTORY_LIMIT)));
}
