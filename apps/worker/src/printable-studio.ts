import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { buildAdVisuals, type AdVisual } from "./ad-visuals.js";
import type { PrintableKind } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { buildMasterPrompt } from "./master-prompt.js";
import { qaProtocol } from "./qa-protocol.js";
import { coinProductName, normalizeEtsyTags, normalizeEtsyTitle, titleCase, validateEtsyListingText } from "./pattern-studio.js";
import { cleanBriefNotes, fitsTheme, harmonizeThemes, isHolidayFamily, META_WORDS, MISLEADING_FEATURE, proseCase, THEME_ADJECTIVES, themeFamilies, type ThemeFamily } from "./theme.js";

// Kadınlara yönelik yazdırılabilir / dijital PDF ürünleri için stüdyo:
// türüne özel içerik kuralları, Claude/ChatGPT promptu, gerekirse sayfa sayfa görsel promptları,
// reklam tadında kullanım görselleri, Pinterest pinleri, paket fikri ve Etsy ilanı.
// Talimat tek seferde doğru çalışsın diye ürün tek temada tutulur, sayfa bütçesi açıkça yazılır ve
// ilan yalnızca ürünün gerçekten içerdiği şeyleri söyler.

export interface PrintablePlanInput {
  kind: PrintableKind;
  productType: string;
  keyword?: string;
  referenceNotes?: string;
  trendFeatures?: string[];
  trendTags?: string[];
  colors?: string[];
  formats?: string[];
  pageCount?: number;
  audience?: string;
  seed?: string;
  avoidNames?: string[];
  aiAssisted?: boolean;
}

export interface PrintableBrief {
  name: string;
  kind: PrintableKind;
  originalityPlan: string[];
  pdfPrompt: string;
  artPrompts: string[];
  // Brief B'deki görsel konuları; otomatik denetleyici bunların somut, çizilebilir konular olduğunu kontrol eder.
  artSubjects: string[];
  adVisuals: AdVisual[];
  pins: Array<{ title: string; description: string; overlay: string }>;
  bundleIdea: { titleTr: string; items: string[]; priceNoteTr: string };
  qualityGate: string[];
  // Tüm parçalar tek sohbette sırayla yapılsın diye birleştirilmiş paket (tek paylaşım).
  masterPrompt: string;
}

export interface PrintableListingDraft {
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  checks: { titleLength: number; tagCount: number; ok: boolean; issues: string[] };
  warnings: string[];
  source: "rules" | "ai";
}

interface KindProfile {
  labelTr: string;
  labelEn: string;
  defaultFormats: string[];
  defaultPages: number;
  art: boolean;
  contentEn: string[];
  designEn: string[];
  // Sayfaların altbilgi/sayfa numarası kuralı (kâğıt ve duvar sanatı tam sayfa görseldir, yazı taşımaz).
  textRuleEn: string;
  signatureEn: string;
  includedEn: string[];
  tagStems: string[];
  // Talimatın her üründe garanti ettiği içerik kelimeleri: yalnız bunlarla kurulan trend etiketleri ilana girer.
  vocabulary: string[];
  pageWord: string;
}

const PRINT_SAFE = "Print-safe margins: at least 0.25 in (6 mm) on every side and nothing important within 0.5 in of the edge, so home printers never cut content.";
const INK = "Ink-friendly: light tints, thin lines and no full-page dark backgrounds, so every page prints well in color or in black and white on a home printer.";
const TEXT_PAGES = "US English spelling, no typos, page numbers and a small footer on every page except the cover.";

export const PRINTABLE_KINDS: Record<PrintableKind, KindProfile> = {
  planner: {
    labelTr: "Planlayıcı", labelEn: "printable planner",
    defaultFormats: ["US Letter", "A4", "A5", "Half Letter"], defaultPages: 30, art: false,
    contentEn: [
      "Cover page and a short 'How to use this planner' page",
      "Core pages built for the planner's exact purpose, each with a clear title, labeled boxes and writing lines spaced at least 7 mm apart",
      "Undated pages with both Monday-start and Sunday-start versions so the product never expires",
      "Monthly overview, weekly spread, daily page, trackers and checklists that match the purpose",
      "Goal or review page, notes page and an index page"
    ],
    designEn: [PRINT_SAFE, INK, "A 0.75 in binding-safe inner margin for ring binders and disc planners", "Consistent grid, 10-12 pt body text, legible sans or serif pairing"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "a smart page or tracker that the top-ranking planners do not include (for example a quick-start page, a reflection prompt or a progress visual)",
    includedEn: ["Undated Monday + Sunday start", "Ink-friendly design", "How to print guide"],
    tagStems: ["planner insert", "planner pages", "undated planner", "printable insert", "life planner", "planner refill", "weekly planner", "monthly planner", "daily planner"],
    vocabulary: ["planner", "planners", "insert", "inserts", "pages", "undated", "daily", "weekly", "monthly", "goal", "goals", "notes", "checklist", "organizer", "life", "refill", "tracker", "trackers"],
    pageWord: "pages"
  },
  digital_planner: {
    labelTr: "Dijital planlayıcı (tablet)", labelEn: "digital planner",
    defaultFormats: ["Landscape tablet PDF (iPad / Android tablets)", "Portrait tablet PDF"], defaultPages: 120, art: false,
    contentEn: [
      "Hyperlinked PDF: clickable tabs for every month and section, an index page linking to all sections, and a home button on every page",
      "Yearly, monthly, weekly and daily layouts plus trackers, notes, and themed section pages",
      "Undated so it works for any year, Monday and Sunday start",
      "A light and a dark theme version of every tablet edition, each as its own PDF (see the upload set)",
      "A one-page import guide for annotation apps such as GoodNotes, Notability, Noteshelf and Xodo (compatibility only, no logos)"
    ],
    designEn: ["Canvas sized for tablets (2388x1668 px landscape or 1668x2388 px portrait); every link target at least 44 px tall", "No tiny text: minimum 11 pt equivalent at 100% zoom"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "a navigation or layout idea that makes daily use faster than the top-ranking planners",
    includedEn: ["Hyperlinked tabs", "Light + dark theme", "Import guide for note-taking apps"],
    tagStems: ["ipad planner", "tablet planner", "hyperlinked planner", "undated planner", "android planner", "pdf planner", "planner for tablet", "goal planner"],
    vocabulary: ["planner", "planners", "digital", "tablet", "ipad", "android", "hyperlinked", "undated", "daily", "weekly", "monthly", "dark", "mode", "journal", "notes"],
    pageWord: "pages"
  },
  coloring: {
    labelTr: "Boyama sayfaları", labelEn: "coloring pages",
    defaultFormats: ["US Letter", "A4"], defaultPages: 30, art: true,
    contentEn: [
      "Each coloring page is clean black line art on white: uniform line weight, fully closed shapes, no grayscale, no shading, no text",
      "Page order from simpler to more detailed, with a cover and a test page for trying colors",
      "Each coloring page is meant to be printed single-sided to stop marker bleed-through; say so in the how-to-print guide and do not insert blank pages into the PDF",
      "A 'color palette ideas' page and a thank-you page"
    ],
    designEn: [PRINT_SAFE, "Line art at 300 dpi, with the art filling the page inside the safe margins", "Generous coloring areas suited to the stated audience (bold and simple for kids, intricate for adults)"],
    textRuleEn: "US English spelling, no typos; each coloring page carries only a small page number and © line in the bottom margin, outside the art, and the cover carries none.",
    signatureEn: "a theme twist or interactive element (hidden objects, a story thread across pages, or a matching colored reference) that top listings lack",
    includedEn: ["Single-sided pages", "US Letter + A4", "Color test page"],
    tagStems: ["coloring book", "coloring sheets", "printable coloring", "coloring pdf", "relaxing coloring", "coloring pages", "coloring gift", "line art coloring"],
    vocabulary: ["coloring", "colouring", "book", "pages", "sheets", "relaxing", "adult", "adults"],
    pageWord: "designs"
  },
  wall_art: {
    labelTr: "Duvar sanatı", labelEn: "printable wall art",
    // En büyük ölçü dürüst tutulur: görsel aracının 1024-1536 px çıktısı kodla büyütülünce 18x24 in üstü bulanık basılır.
    defaultFormats: ["2:3 ratio (4x6 to 16x24 in)", "3:4 ratio (6x8 to 18x24 in)", "4:5 ratio (8x10 to 16x20 in)", "11x14 in", "ISO A-sizes (A5 to A2)"], defaultPages: 3, art: true,
    contentEn: [
      "A cohesive set of prints in one style; each artwork works alone and together as a gallery set",
      "Every artwork delivered as one file per listed ratio or size, so it fits standard frames",
      "A size guide page listing which file prints which frame size"
    ],
    designEn: ["One 2:3 master per print at 5400x8100 px (18x27 in at 300 dpi); every other ratio is cropped from it in code at 300 dpi for its largest size", "Important elements kept away from edges so mats and frames do not cover them", "sRGB JPG files plus a PDF size guide"],
    textRuleEn: "US English spelling, no typos. The art prints carry no text, footer, page number or signature; only the size guide, how-to-print, thank-you and license pages carry text.",
    signatureEn: "a distinct artistic detail (texture, composition or palette move) that sets the set apart from the top-ranking prints",
    includedEn: ["One file per frame ratio", "Prints up to 18x24 in", "Size guide"],
    tagStems: ["art print", "digital print", "gallery wall art", "printable poster", "home decor print", "wall decor", "printable art", "set of prints"],
    vocabulary: ["wall", "art", "print", "prints", "poster", "posters", "decor", "gallery", "home"],
    pageWord: "designs"
  },
  party: {
    labelTr: "Parti oyunu / davet", labelEn: "party printable",
    defaultFormats: ["US Letter", "A4", "5x7 in cards"], defaultPages: 10, art: false,
    contentEn: [
      "Several complete party games with written instructions, original questions or prompts, and answer keys where needed",
      "Game cards laid out several per page with crop marks for easy cutting",
      "Matching extras: welcome sign, prize tags, and a fill-in invitation",
      "A host checklist page"
    ],
    designEn: [PRINT_SAFE, "Large, readable type for guests; fill-in lines long enough for handwriting", "Crop marks for cut-out items"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "one original game or twist that most competing bundles do not offer",
    includedEn: ["Answer keys", "Cut lines", "Matching sign + tags"],
    tagStems: ["party games", "printable games", "party printable", "shower games", "game cards", "party activities", "game bundle", "fun party games"],
    vocabulary: ["games", "game", "party", "cards", "activities", "signs", "sign", "invitation"],
    pageWord: "pages"
  },
  recipe: {
    labelTr: "Tarif kartı / defteri", labelEn: "recipe printable",
    defaultFormats: ["4x6 in cards", "5x7 in cards", "US Letter binder pages", "A4"], defaultPages: 20, art: false,
    contentEn: [
      "Fill-in recipe cards: the 4x6 and the 5x7 cards are each their own PDF, with the cards laid out on US Letter sheets with crop marks so they print at home",
      "Full-page recipe binder pages with sections for ingredients, steps, servings, time and notes",
      "Section dividers, an index page, a measurement conversion chart and a weekly meal plan page"
    ],
    designEn: [PRINT_SAFE, INK, "Writing lines at least 7 mm apart; space for a photo on the full-page version"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "a useful extra (for example a family-recipe story box or a substitution chart) missing from top listings",
    includedEn: ["4x6 + 5x7 cards", "Binder pages", "Conversion chart"],
    tagStems: ["recipe cards", "recipe binder", "recipe template", "recipe book", "kitchen printable", "recipe organizer", "family recipe book", "recipe pages", "meal plan printable"],
    vocabulary: ["recipe", "recipes", "card", "cards", "binder", "book", "template", "kitchen", "pages", "meal", "plan"],
    pageWord: "pages"
  },
  journal: {
    labelTr: "Günlük / çalışma kitabı", labelEn: "guided journal",
    defaultFormats: ["US Letter", "A5", "Half Letter"], defaultPages: 60, art: false,
    contentEn: [
      "Original guided prompts written by you (at least 40 unique prompts), grouped into themed sections",
      "Reflection, tracker and gratitude pages that fit the journal's purpose",
      "Weekly and monthly check-in pages and plenty of free-writing pages"
    ],
    designEn: [PRINT_SAFE, INK, "Calm, airy layouts with writing lines at least 7 mm apart"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "a guided structure or progression that competing journals do not use",
    includedEn: ["40+ original prompts", "Ink-friendly design", "How to print guide"],
    tagStems: ["guided journal", "journal pages", "journal prompts", "printable journal", "journal insert", "journal workbook", "writing prompts", "reflection journal"],
    vocabulary: ["journal", "journals", "pages", "prompts", "tracker", "log", "insert", "guided", "workbook", "gratitude", "reflection"],
    pageWord: "pages"
  },
  kids: {
    labelTr: "Çocuk etkinlik / çalışma kâğıdı", labelEn: "kids printable",
    defaultFormats: ["US Letter", "A4"], defaultPages: 40, art: false,
    contentEn: [
      "Age-appropriate activities for a clearly stated age range, increasing gently in difficulty",
      "Clear instructions for adults, large fonts and simple line art suitable for coloring",
      "Answer keys, a progress chart and a certificate of completion"
    ],
    designEn: [PRINT_SAFE, INK, "Primary-school friendly fonts at 14 pt or larger; tracing lines with dashed guides"],
    textRuleEn: TEXT_PAGES,
    signatureEn: "a motivating element (story characters, rewards or a theme) that top listings lack",
    includedEn: ["Answer keys", "Certificate of completion", "How to print guide"],
    tagStems: ["kids worksheets", "learning printable", "kids activities", "learning activities", "kids printable", "homeschool printable", "kids activity book", "fun learning pages"],
    vocabulary: ["kids", "worksheets", "worksheet", "activities", "activity", "learning", "pages", "kid"],
    pageWord: "pages"
  },
  paper_craft: {
    labelTr: "Kâğıt işi / dijital kâğıt", labelEn: "digital paper craft kit",
    defaultFormats: ["12x12 in sheets", "US Letter", "A4"], defaultPages: 20, art: true,
    contentEn: [],
    designEn: ["300 dpi files (3600x3600 px for 12x12 in sheets)", "JPG for papers, transparent PNG for ephemera, plus printable PDF editions"],
    textRuleEn: "US English spelling, no typos. Patterned papers, solid papers and ephemera sheets are full-bleed artwork with no footer, page number, title or watermark; only the cover, how-to-print, thank-you and license pages carry text.",
    signatureEn: "a signature motif or texture that ties the kit together and differs from top-ranking kits",
    includedEn: [],
    tagStems: ["scrapbook paper", "digital paper", "printable paper", "craft printable", "paper craft", "background paper", "pattern paper", "card making paper"],
    vocabulary: ["scrapbook", "paper", "papers", "digital", "seamless", "pattern", "patterns", "sheets", "craft", "background", "backgrounds"],
    pageWord: "designs"
  }
};

function cleanText(value: unknown, max = 300): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 8, maxLength = 40): string[] {
  const rows = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return rows.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

export function normalizePrintablePlanInput(raw: Record<string, unknown>): PrintablePlanInput {
  const kind = String(raw.kind || "") as PrintableKind;
  if (!PRINTABLE_KINDS[kind]) throw new Error("PRINTABLE_KIND_INVALID");
  const productType = cleanText(raw.productType, 60).toLowerCase();
  if (productType.length < 3) throw new Error("PATTERN_PRODUCT_REQUIRED");
  const pages = Number(raw.pageCount);
  return {
    kind,
    productType,
    keyword: cleanText(raw.keyword, 60).toLowerCase() || undefined,
    referenceNotes: cleanText(raw.referenceNotes, 1000) || undefined,
    trendFeatures: cleanList(raw.trendFeatures, 6, 40).map((item) => item.toLowerCase()).filter((item) => !isIpRisky(item)),
    trendTags: cleanList(raw.trendTags, 20, 40).map((item) => item.toLowerCase()).filter((item) => !isIpRisky(item)),
    colors: cleanList(raw.colors, 6, 30),
    formats: cleanList(raw.formats, 6, 50),
    pageCount: Number.isInteger(pages) && pages > 0 && pages <= 1000 ? pages : undefined,
    audience: cleanText(raw.audience, 60) || undefined,
    seed: cleanText(raw.seed, 60) || undefined,
    aiAssisted: raw.aiAssisted !== false
  };
}

function productHead(productType: string): string {
  return productType.split(/\s+/).at(-1)!.replace(/s$/, "");
}

const singular = (word: string) => word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function joinWords(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function article(phrase: string): string {
  return /^(?:[aeio]|u(?!ni|s[aeiu]))/i.test(phrase) ? "an" : "a";
}

const UNCOUNTABLE = /\b(art|ephemera|paper|decor|stationery|clipart|wall art)$/;
// "an original adult coloring pages" yerine "an original set of adult coloring pages".
function productPhrase(productType: string): string {
  if (UNCOUNTABLE.test(productType)) return `${productType} set`;
  const last = productType.split(" ").at(-1)!;
  return last.endsWith("s") && !last.endsWith("ss") ? `set of ${productType}` : productType;
}

// Tek lisans metni: PDF'teki lisans sayfası ve ilan aynı cümleyi kullanır. Çocuk çalışma kâğıtları öğretmenlerce
// alındığı için tek sınıf kullanımına izin verilir (görsellerde sınıf sahnesi de var).
export function printableLicense(kind: PrintableKind, year = new Date().getUTCFullYear()): string {
  const use = kind === "kids" ? "For personal and single-classroom use (one teacher with their own students)." : "For personal use only.";
  return `© ${year} GXL Market Studio. ${use} Do not share, resell or redistribute these files, in whole or in part.`;
}

function printGuide(kind: PrintableKind): string {
  switch (kind) {
    case "digital_planner": return "A one-page 'How to import' guide: download the PDF, import it into a note-taking app that supports PDF links (for example GoodNotes, Notability or Xodo, named as plain text only), and tap the tabs to move around.";
    case "coloring": return "A one-page 'How to print' guide: print single-sided at Actual size / 100% scale; heavier paper (32 lb / 120 gsm) for markers; print-shop tips.";
    case "wall_art": return "A one-page 'How to print' guide: which file fits which frame, Actual size / 100% scale, matte photo paper or a print shop for larger sizes.";
    case "paper_craft": return "A one-page 'How to print' guide: US Letter and A4 pages at home at Actual size / 100% scale on matte paper or cardstock; 12x12 in sheets at a print shop or on a wide-format printer.";
    case "party": return "A one-page 'How to print' guide: print single-sided at Actual size / 100% scale on cardstock, then cut along the crop marks.";
    default: return "A one-page 'How to print' guide: print at Actual size / 100% scale, paper weight suggestions, double-sided and print-shop tips.";
  }
}

function useSentence(kind: PrintableKind): string {
  if (kind === "digital_planner") return "ready to use in a note-taking app on your tablet";
  if (kind === "wall_art") return "ready to print at home or at a print shop and frame";
  if (kind === "paper_craft") return "ready to print at home or at a print shop";
  return "designed to be printed at home and used right away";
}

// Ruh sağlığı ve dikkat konulu ürünler sağlık iddiası taşımaz; PDF'te ve ilanda nazik bir not bulunur.
const HEALTH = /\b(mental health|shadow work|anxiety|depression|therapy|therapist|adhd|trauma|grief|healing|ocd|bipolar)\b/;
function healthNote(input: PrintablePlanInput): string | undefined {
  const text = [input.productType, input.keyword || "", ...(input.trendFeatures || [])].join(" ").toLowerCase();
  return HEALTH.test(text) ? "This is a self-reflection and planning tool, not medical advice or a substitute for professional care." : undefined;
}

// İlan, pin ve talimat metninde aynı tema: yalnız ürünün temasındaki ifadeler kullanılır.
interface Prepared {
  input: PrintablePlanInput;
  themes: Set<ThemeFamily>;
  dropped: string[];
}

function prepare(raw: PrintablePlanInput): Prepared {
  const productWords = new Set(raw.productType.split(/\s+/).flatMap((word) => [word, singular(word)]));
  // "vintage" yeni bir dijital ürün için "vintage style" demektir (Etsy'de "vintage" 20 yaş üstü ürünlerdir);
  // "daily weekly" iki ayrı özelliktir.
  const TIME_WORDS = /^(daily|weekly|monthly|yearly|undated)$/;
  const unique = [...new Set((raw.trendFeatures || []).flatMap((feature) => feature.split(" ").every((word) => TIME_WORDS.test(word)) ? feature.split(" ") : [feature]).map((feature) => feature === "vintage" ? "vintage style" : feature))];
  const usable = unique.filter((feature) => !MISLEADING_FEATURE.test(feature) && !feature.split(" ").every((word) => META_WORDS.has(word) || productWords.has(word)));
  const harmony = harmonizeThemes(usable, themeFamilies(`${raw.keyword || ""} ${raw.productType}`));
  const dropped = [...unique.filter((feature) => !usable.includes(feature)), ...harmony.dropped];
  const tags = (raw.trendTags || []).filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, harmony.families) && (!/\bvintage\b/.test(tag) || /\bvintage (style|inspired)\b/.test(tag)));
  const notes = cleanBriefNotes(raw.referenceNotes, dropped);
  return { input: { ...raw, trendFeatures: harmony.kept, trendTags: tags, referenceNotes: notes }, themes: harmony.families, dropped };
}

// ---------- Görsel planı: konu, stil ve sayfa bütçesi ----------

const STYLE_WORDS = new Set(["cozy", "cosy", "bold", "easy", "simple", "minimalist", "minimal", "boho", "bohemian", "vintage", "retro", "aesthetic", "modern", "cute", "kawaii", "whimsical", "moody", "peculiar", "quirky", "neutral", "abstract", "rustic", "farmhouse", "cottagecore", "elegant", "classic", "dark", "academia", "gothic", "folk", "hand", "drawn", "watercolor", "pastel", "muted", "bright", "colorful", "detailed", "intricate", "large", "relaxing", "calm", "fun", "funny", "sweet", "pretty", "beautiful", "unique", "trendy", "scandi", "victorian", "nostalgic", "antique"]);
const COMPONENT = /\b(folios?|pockets?|tucks?|envelopes?|tags?|labels?|journaling cards?|tabs?|flips?|booklets?|bookmarks?|belly bands?|tickets?)\b/;
const COLOR_WORD = /\b(sage|green|olive|emerald|mint|teal|aqua|turquoise|blue|navy|denim|cobalt|lavender|lilac|purple|plum|blush|pink|rose|burgundy|wine|red|coral|terracotta|rust|orange|peach|apricot|mustard|yellow|gold|golden|honey|white|ivory|cream|oatmeal|beige|sand|camel|tan|brown|chocolate|gray|grey|charcoal|black|silver)\b/g;
const MOTIF_NOISE = /\b(kitchen|bathroom|bedroom|nursery|living|room|office|entryway|dorm|classroom|for|adults?|kids|women|men|teens|toddlers?|preschool|beginners?|gift|gifts|idea|ideas|lovers?|\d+x\d+|\d+|a[3-6]|us|letter|size|sizes|ratio|ratios|print|prints|poster|posters|art|wall|decor|coloring|colouring|book|books|planner|tracker|insert|refill|and|the|with|in|on|to|of|set|instant|digital|download|printable|pdf|pages?|sheets?|papers?|pack|bundle|kit|template|seamless|pattern|patterns|background|backgrounds|collage|scrapbook|journal|junk)\b/g;

// Tema ailesine göre konu fikirleri: trendden gelen konu azsa her sayfa yine temaya uygun ve farklı olur.
const THEME_SUBJECTS: Partial<Record<ThemeFamily, string[]>> = {
  christmas: ["vintage ornaments and pine sprigs", "a snowy cottage with a wreath on the door", "gingerbread cookies and baking tins", "stockings hung by a fireplace", "holly, berries and ribbon bows", "a winter village with lit windows", "wrapped gifts and twine", "candles, pinecones and evergreen"],
  halloween: ["pumpkins and autumn leaves", "friendly ghosts and lanterns", "a moonlit haunted house", "black cats and candles", "apothecary bottles and spiders' webs", "a pumpkin patch at dusk"],
  thanksgiving: ["a harvest table with pies", "pumpkins, gourds and wheat", "autumn leaves and acorns", "a cozy kitchen with apple pie"],
  fall: ["autumn leaves and acorns", "mushrooms on a forest floor", "apples and harvest baskets", "a cozy sweater and warm tea", "pumpkins and wheat"],
  winter: ["snowflakes and mittens", "a snowy forest cabin", "hot cocoa and knitted scarves", "winter birds on bare branches"],
  spring: ["tulips and daffodils", "birds and blossoming branches", "a garden with watering cans", "butterflies and wildflowers"],
  easter: ["pastel eggs and spring flowers", "bunnies in a flower garden", "a spring basket with tulips", "chicks and blossoms"],
  valentine: ["hearts and roses", "love letters and envelopes", "sweet treats and ribbons", "a bouquet of tulips and hearts"],
  summer: ["lemons and sunshine", "a beach with seashells", "ice cream and picnic baskets", "sunflowers and bees"],
  coastal: ["seashells and starfish", "lighthouses and sailboats", "ocean waves and gulls", "coral and sea glass"],
  witchy: ["moon phases and stars", "herb bundles and apothecary jars", "crystals and candles", "a witch's cottage garden"],
  dark: ["old books and candlelight", "antique keys and inkwells", "a gothic library", "pressed flowers and letters"],
  cozy: ["a cottage interior with tea and books", "a reading nook by the window", "a cottage garden gate", "knitting baskets and quilts", "a warm kitchen with bread"],
  botanical: ["wildflowers and ferns", "mushrooms and moss", "herbs and leaves", "garden roses and peonies", "botanical sprigs and seed pods"],
  vintage: ["vintage postage stamps and tickets", "antique botanical plates", "old letters and wax seals", "vintage clocks and keys"],
  boho: ["sun and rainbow arches", "pampas grass and dried flowers", "desert plants and terracotta pots", "abstract boho shapes"],
  minimalist: ["simple line-art leaves", "abstract organic shapes", "a minimalist landscape"],
  western: ["cowboy boots and cacti", "desert sunsets and horses", "wildflowers on the prairie"],
  playful: ["smiling stars and rainbows", "cute animals with balloons", "candy and sweets"],
  bridal: ["roses, rings and champagne", "a floral wedding arch", "eucalyptus and peonies"],
  baby_shower: ["baby animals and clouds", "rattles, booties and balloons", "woodland babies and stars"],
  birthday: ["balloons, cake and confetti", "party hats and streamers"]
};

const KIND_SUBJECTS: Partial<Record<PrintableKind, string[]>> = {
  coloring: ["a cozy cottage scene", "a flower garden", "forest animals", "a kitchen still life", "a seaside village", "a reading nook", "a mushroom forest", "a vintage tea party"],
  wall_art: ["a botanical study", "an abstract landscape", "a still life with fruit", "a coastal horizon"],
  paper_craft: ["botanical sprigs", "garden flowers", "small stars and dots", "soft geometric shapes"]
};

const PAPER_LAYOUTS = ["an all-over ditsy repeat", "a large-scale toile-style repeat", "a striped repeat", "a soft plaid repeat", "a scattered sprig repeat", "a damask-style repeat", "a ledger-grid repeat with small motifs", "a polka-dot repeat with small motifs", "a patchwork repeat", "a medallion wallpaper repeat", "a border-stripe repeat", "a tiny all-over texture repeat"];
const EPHEMERA_PIECES = ["tags, labels and tickets", "stamps, postcards and frames", "journaling cards, bookmarks and photo corners", "envelopes, belly bands and pocket fronts"];

type PaperMode = "kit" | "papers";
function paperMode(productType: string): PaperMode {
  return /\b(digital paper|paper pack|seamless|backgrounds?|pattern pack|scrapbook paper)\b/.test(productType) ? "papers" : "kit";
}

interface ArtPlan {
  prompts: string[];
  notes: string[];
  budget: string[];
  includedEn: string[];
  components: string[];
  // Brief B'de gerçekten kullanılan konular (etiket kelimeleri ve denetim bunlara bakar).
  subjects: string[];
  style: string;
  // Kontrol listesinin beklediği sayfa/dosya sayısı, sayfa bütçesiyle aynı cümle.
  pagesNote: string;
}

function motifFromTag(tag: string, productWords: Set<string>): string {
  const words = tag.replace(COLOR_WORD, " ").replace(MOTIF_NOISE, " ").split(/\s+/).filter((word) => word.length > 2 && !productWords.has(word) && !productWords.has(singular(word)) && !META_WORDS.has(word));
  return words.join(" ");
}

// Konu ile stil ayrılır: "christmas ephemera" çizilecek bir konudur, "cozy christmas" ve "moody botanical" stildir.
const TEXT_LIKE = /\b(letters?|tickets?|labels?|stamps?|newspapers?|words?|script|postcards?|notes?)\b/;
const COMPOSITIONS = ["as one large central subject", "in a detailed scene", "with a simple background", "as a playful group", "framed by small motifs", "in a cozy setting", "close-up with large, easy shapes", "in a busy landscape"];
const STYLE_DIRECTIONS: Record<string, string> = { peculiar: "whimsical vintage collage", quirky: "whimsical vintage collage", "bold easy": "bold and easy", "bold and easy": "bold and easy" };

// "Christmas ephemera", "library ephemera" çizilecek bir konu değil, ürün türüdür: çekirdek kelime ("library")
// çizilebilir bir konuya çevrilir; çekirdek yalnız tema ise ("christmas") konu temanın kendi listesinden gelir.
const PAPER_NOUNS = /(^|\s+)(ephemera|papers?|pages?|sheets?|collage sheets|cut-?outs|clipart|designs?|prints?|patterns?|motifs?|backgrounds?)$/;
const CORE_SUBJECTS: Record<string, string> = {
  library: "stacks of old library books with a reading lamp",
  botanical: "pressed botanical leaves and stems",
  floral: "loose garden flowers",
  mushroom: "woodland mushrooms and moss",
  butterfly: "vintage butterflies and moths",
  bird: "songbirds on branches",
  ocean: "seashells, coral and waves",
  sea: "seashells, coral and waves",
  travel: "a vintage globe, compass and suitcase",
  garden: "a cottage garden with a watering can",
  kitchen: "vintage kitchen jars and teacups",
  tea: "teacups, teapots and sugar cubes",
  cottage: "a stone cottage with climbing roses",
  forest: "pine trees, ferns and pinecones",
  bee: "honeybees and honeycomb"
};

function featureSubject(feature: string, concrete: (phrase: string) => boolean): string | undefined {
  if (!PAPER_NOUNS.test(feature)) return concrete(feature) ? feature : undefined;
  const core = feature.replace(PAPER_NOUNS, "").trim();
  if (!core || !concrete(core)) return undefined;
  return CORE_SUBJECTS[core] || CORE_SUBJECTS[singular(core)] || `${core} motifs`;
}

function subjectsAndStyle(prepared: Prepared, profile: KindProfile): { subjects: string[]; components: string[]; styles: string[] } {
  const { input, themes } = prepared;
  const productWords = new Set(input.productType.split(/\s+/).flatMap((word) => [word, singular(word)]));
  const features = input.trendFeatures || [];
  const concrete = (phrase: string) => phrase.split(" ").some((word) => !THEME_ADJECTIVES.has(word) && !STYLE_WORDS.has(word) && !META_WORDS.has(word) && !productWords.has(word) && word !== "style" && word !== "and");
  const components = features.filter((feature) => COMPONENT.test(feature));
  const styles = features.filter((feature) => !COMPONENT.test(feature) && !concrete(feature));
  const fromFeatures = features.filter((feature) => !components.includes(feature) && concrete(feature))
    .map((feature) => featureSubject(feature, concrete)).filter((subject): subject is string => Boolean(subject));
  // Trend etiketinden gelen konu yalnız ürünün temasındansa kullanılır (dinozor kitabına unicorn sayfası girmez).
  const onTheme = (motif: string) => themes.size > 0 && fitsTheme(motif, themes) && [...themeFamilies(motif)].some((family) => themes.has(family));
  const fromTags = profile.art ? (input.trendTags || []).map((tag) => motifFromTag(tag, productWords)).filter((motif) => motif.length >= 3 && concrete(motif) && !COMPONENT.test(motif) && onTheme(motif))
    .map((motif) => featureSubject(motif, concrete)).filter((subject): subject is string => Boolean(subject)) : [];
  const fromThemes = [...themes].flatMap((family) => THEME_SUBJECTS[family] || []);
  const own = [...fromFeatures, ...fromTags, ...fromThemes];
  // Türün genel konuları yalnız üründe hiçbir konu yoksa kullanılır.
  const all = (own.length ? own : KIND_SUBJECTS[input.kind] || []).filter((subject) => !TEXT_LIKE.test(subject) || features.includes(subject));
  const subjects: string[] = [];
  for (const subject of all) {
    const words = subject.split(" ");
    // "ephemera" ile "christmas ephemera" aynı konudur; yalnız biri kalır.
    if (subjects.some((other) => { const otherWords = other.split(" "); return otherWords.every((word) => words.includes(word)) || words.every((word) => otherWords.includes(word)); })) continue;
    subjects.push(subject);
  }
  const styleNames = styles.map((style) => style.split(" ").filter((word) => !META_WORDS.has(word)).join(" ")).filter(Boolean).map((style) => STYLE_DIRECTIONS[style] || style);
  // Tek kelimelik konu ("cottage") görsel talimatında "cottage motifs" olarak yazılır.
  const uniqueStyles = [...new Set(styleNames)];
  const keptStyles = uniqueStyles.filter((style, index) => !uniqueStyles.some((other, otherIndex) => otherIndex !== index && other.length > style.length && new RegExp(`\\b${escapeRegex(style)}\\b`).test(other)));
  return { subjects: subjects.map((subject) => proseCase(subject.includes(" ") || /s$/.test(subject) ? subject : `${subject} motifs`)), components, styles: keptStyles };
}

function buildArtPlan(prepared: Prepared, profile: KindProfile, pages: number): ArtPlan {
  const { input } = prepared;
  const palette = input.colors?.length ? `${joinWords(input.colors)} palette` : "the spec palette";
  const { subjects, components, styles } = subjectsAndStyle(prepared, profile);
  const style = styles.length ? `${joinWords(styles.map(proseCase))} style` : "one consistent original illustration style";
  const subjectAt = (index: number) => subjects[index % Math.max(1, subjects.length)] || `an original ${input.productType} theme`;
  // Kapak ürünün ana temasını gösterir (Noel kitinin kapağı kütüphane değil, Noel konusudur).
  const anchored = (subject: string, holidayOnly: boolean) => [...themeFamilies(subject)].some((family) => prepared.themes.has(family) && (!holidayOnly || isHolidayFamily(family)));
  const coverSubject = subjects.find((subject) => anchored(subject, true)) || subjects.find((subject) => anchored(subject, false)) || subjectAt(0);
  // Konu sayısı sayfa sayısından azsa her sayfa farklı bir kompozisyon alır; aynı görsel iki kez üretilmez.
  const compositions = COMPOSITIONS.filter((composition) => !styles.some((styleWord) => composition.includes(styleWord)));
  const variedAt = (index: number, count: number) => subjects.length >= count ? subjectAt(index) : `${subjectAt(index)}, ${compositions[index % compositions.length]}`;
  const used = (count: number) => subjects.slice(0, Math.min(subjects.length, count));
  const sharedNotes = [
    "Keep one consistent style and the spec palette across every image, and replace any image that breaks a rule.",
    "Never copy or imitate another seller's listing images, Pinterest pins or any copyrighted artwork, and never upload them as references; describe the style in words only."
  ];
  const textPages = "the how-to-print, thank-you and license pages";
  if (!profile.art) return { prompts: [], notes: [], budget: [], includedEn: profile.includedEn, components, subjects: [], style, pagesNote: `${pages} core pages plus the cover, ${input.kind === "digital_planner" ? "import guide" : "how-to-print"}, thank-you and license pages` };

  if (input.kind === "coloring") {
    const explicit = Math.min(pages, 8);
    const prompts = Array.from({ length: explicit }, (_, index) => `Coloring page ${index + 1}: ${variedAt(index, explicit)}, ${style}, original composition, clean black outline line art on pure white, uniform line weight, every shape fully closed, no grayscale, no shading, no text, no signature, portrait page; keep the art inside a centered 7.5x10 in area so it fits both US Letter and A4.`);
    if (pages > explicit) prompts.push(`Coloring pages ${explicit + 1}-${pages}: the same rules as above, one new subject per page taken from the PASS 1 page plan, all within the theme; no subject or composition is repeated.`);
    return {
      prompts,
      notes: [...sharedNotes, "Image tools give about 1024-1536 px. Upscale or vectorize every page to 300 dpi at the page size (2550x3300 px for US Letter) and keep the lines pure black (threshold, no gray)."],
      budget: [`${pages} coloring pages, each a different subject, ordered from simpler to more detailed`, `Plus the cover, a color test page, a color palette ideas page and ${textPages}`],
      includedEn: [`${pages} coloring pages`, "Color test page", "Color palette ideas page"],
      components, subjects: used(explicit), style,
      pagesNote: `${pages} coloring pages plus the cover, color test, color palette ideas, how-to-print, thank-you and license pages`
    };
  }

  if (input.kind === "wall_art") {
    const count = Math.min(Math.max(pages, 1), 6);
    return {
      prompts: Array.from({ length: count }, (_, index) => `Print ${index + 1} of the set: ${variedAt(index, count)}, ${palette}, ${style}, gallery-quality original artwork, balanced negative space, no text, no frame, no watermark, portrait 2:3 composition with every important element inside the central 4:5 safe area.`),
      notes: [...sharedNotes, "Image tools give about 1024-1536 px. Upscale each print to its 5400x8100 px 2:3 master with the best method available (an AI upscaler if you have one, otherwise Lanczos plus light sharpening) and check it at 100% zoom. Then crop every other ratio from that master in code, keeping the important elements inside the 4:5 safe area."],
      budget: [`${count} art ${count > 1 ? "prints" : "print"}, each delivered in every listed ratio or size`, "Plus a size guide, a how-to-print page, a thank-you page and a license page, together in one PDF"],
      includedEn: [`${count} art ${count > 1 ? "prints" : "print"}`, `${(input.formats?.length ? input.formats : profile.defaultFormats).length} frame ratios or sizes per print`, "Prints up to 18x24 in", "Size guide"],
      components, subjects: used(count), style,
      pagesNote: `${count} prints, each in every listed ratio or size, plus one PDF with the size guide, how-to-print, thank-you and license pages`
    };
  }

  // Kâğıt işi: kit (kâğıt + süs parçaları + kapak) veya yalnız kâğıt paketi.
  const mode = paperMode(input.productType);
  const tileNote = "Image tools give about 1024-1536 px. Make every patterned paper as one seamless tile and repeat it in code (for example 3x3) to fill 3600x3600 px; never stretch a small image. Before repeating, check each tile in code: offset it by half its width and height, blend or retouch the cross-shaped seam, then show a 2x2 preview. The left and right edges, and the top and bottom edges, must match.";
  if (mode === "papers") {
    const patterned = Math.min(pages, 12);
    const solids = Math.max(0, pages - patterned);
    return {
      prompts: Array.from({ length: patterned }, (_, index) => `Paper ${index + 1}: seamless repeating pattern, ${PAPER_LAYOUTS[index % PAPER_LAYOUTS.length]} of ${subjectAt(index)}, ${palette}, ${style}, original design, a square tile that repeats with no visible seams, no text, no letters.`),
      notes: [...sharedNotes, tileNote],
      budget: [`${patterned} patterned papers (Brief B)`, ...(solids ? [`${solids} solid or subtly textured coordinate papers made in code from the palette hex codes`] : []), `Plus a cover collage made in code from the papers and ${textPages}`],
      includedEn: [`${patterned} seamless patterned papers`, ...(solids ? [`${solids} coordinating solid papers`] : []), "12x12 in sheets at 300 dpi"],
      components, subjects: used(patterned), style,
      pagesNote: `${pages} papers plus the cover, how-to-print, thank-you and license pages`
    };
  }
  const ephemera = pages >= 12 ? 3 : 2;
  const solids = pages >= 10 ? 3 : 2;
  const papers = Math.max(4, Math.min(8, pages - ephemera - solids));
  const extras = Math.max(0, pages - papers - solids - ephemera);
  const componentList = components.length ? joinWords(components.map((item) => proseCase(item))) : "pocket and folio templates";
  const prompts = [
    ...Array.from({ length: papers }, (_, index) => `Paper ${index + 1}: seamless repeating pattern, ${PAPER_LAYOUTS[index % PAPER_LAYOUTS.length]} of ${subjectAt(index)}, ${palette}, ${style}, original design, a square tile that repeats with no visible seams, no text, no letters.`),
    ...Array.from({ length: ephemera }, (_, index) => `Ephemera sheet ${index + 1}: 8-12 separate cut-out pieces (${EPHEMERA_PIECES[index % EPHEMERA_PIECES.length]}) featuring ${subjectAt(papers + index)}, ${palette}, ${style}, each piece with a thin white cutting border and generous space between pieces, on a flat light gray (#DDDDDD) background, no text or letters (label areas left blank for writing).`),
    `Cover artwork: one hero illustration of ${coverSubject}, ${palette}, ${style}, square composition with the top third kept plain for the title, which is added later in code; no text or letters.`
  ];
  return {
    prompts,
    notes: [...sharedNotes, tileNote, "Ephemera and cover art: upscale 2-3x with a high-quality method (Lanczos). For the ephemera sheets, remove only the flat gray background in code (keep each piece's white cutting border) and save every piece as a transparent PNG file."],
    budget: [
      `${papers} patterned papers (Brief B, papers)`,
      `${solids} solid coordinate papers made in code from the palette hex codes, with a subtle paper grain`,
      `${ephemera} ephemera sheets with cut-out pieces (Brief B, ephemera sheets)`,
      ...(extras ? [`${extras} ${extras > 1 ? "pages" : "page"} of ${componentList}, journaling cards and tags, built in code (vector) from the artwork and palette, every page different`] : components.length ? [`The ${componentList} placed on the ephemera sheets`] : []),
      `Plus the cover (cover artwork from Brief B with the title added in code) and ${textPages}`
    ],
    includedEn: [
      `${papers} seamless patterned papers`,
      `${solids} coordinating solid papers`,
      `${ephemera} ephemera sheets (also as transparent PNG files)`,
      ...(extras ? [`${extras} ${extras > 1 ? "pages" : "page"} of ${componentList}, journaling cards and tags`] : [])
    ],
    components, subjects: used(papers + ephemera), style,
    pagesNote: `${pages} core pages plus the cover, how-to-print, thank-you and license pages`
  };
}

function originalityPlan(prepared: Prepared, profile: KindProfile): { tr: string[]; en: string[] } {
  const { input } = prepared;
  const features = input.trendFeatures?.length ? joinWords(input.trendFeatures.map(proseCase)) : "";
  return {
    tr: [
      `Tek bir ürün kopyalanmadı; trend özellikleri${features ? ` (${features})` : ""} tek temada, özgün bir tasarımda birleştirilecek.`,
      ...(prepared.dropped.length ? [`Temayla çatışan veya yanıltıcı ifadeler ürüne alınmadı: ${prepared.dropped.join(", ")}.`] : []),
      "Üst sıradaki ilanlarda olmayan imza bir öğe eklenecek ve kapakta vurgulanacak.",
      "Yalnızca ticari kullanıma izin veren fontlar ve kendi üretilen görseller kullanılacak; başka satıcının ilan görseli veya telifli görsel referans olarak bile kullanılmayacak.",
      input.colors?.length ? `Renk paleti: ${input.colors.join(", ")}.` : "Renk paletini yapay zekâ özgün olarak önerecek."
    ],
    en: [
      `Build ${features ? `the buyer-favored features (${features})` : "what these buyers want"} into one coherent, original product with a single theme, your own layout and your own wording.`,
      `Add ${profile.signatureEn}, and name it ${input.kind === "wall_art" ? "in the size guide" : "on the cover"}.`,
      "Use only fonts licensed for commercial use (for example Google Fonts) and list them; all text and artwork must be your own.",
      "Never use another seller's Etsy listing, photos or Pinterest pins, or any copyrighted image, as a reference or input; describe a style in words only.",
      "Never use trademarked names, characters, celebrities, logos or brand styles.",
      input.colors?.length ? `Use this palette: ${input.colors.join(", ")}.` : "Propose a fresh palette with color names and hex codes."
    ]
  };
}

function contentLines(prepared: Prepared, profile: KindProfile): string[] {
  if (prepared.input.kind !== "paper_craft") return profile.contentEn;
  const mode = paperMode(prepared.input.productType);
  return mode === "papers"
    ? ["A coordinated set of seamless patterned papers and solid coordinates in one theme", "Seamless patterns that tile without visible seams"]
    : ["A coordinated kit in one theme: patterned papers, solid coordinates, ephemera sheets (tags, labels, cut-outs) and the components in the page budget", "Seamless patterns that tile without visible seams", "Printable pages with cut lines for every ephemera piece and template"];
}

const isTablet = (format: string) => /tablet|hyperlink/i.test(format);
const fileSlug = (format: string) => format.replace(/\s*\(.*\)/, "").replace(/:/g, "x").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Yükleme seti her türde en fazla 5 dosyadır (Etsy sınırı); fazla format varsa son gruplar tek zip'te birleşir.
function deliverables(prepared: Prepared, name: string, formats: string[]): string[] {
  const { input } = prepared;
  const file = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const limit = "Etsy accepts at most 5 files of at most 20 MB each. Keep JPG quality between 80 and 90; if a file is still too big, lower the quality or split that group into Part-1 and Part-2 zips while the whole set stays at 5 files.";
  const fit = (files: string[]) => files.length <= 5 ? files : [...files.slice(0, 4), `${file}-More-Sizes.zip (${files.slice(4).map((item) => item.replace(/ \(.*\)$/, "")).join(" + ")})`];
  if (input.kind === "paper_craft") {
    const pdfs = formats.filter((format) => !/12x12/.test(format));
    return [`Upload set: ${fit([...pdfs.map((format) => `${file}-${fileSlug(format)}.pdf (all pages printable on ${format})`), `${file}-12x12-Papers.zip (every paper as a 3600x3600 px JPG)`, ...(paperMode(input.productType) === "kit" ? [`${file}-Ephemera.zip (transparent PNG pieces)`] : [])]).join("; ")}.`, limit];
  }
  if (input.kind === "wall_art") {
    // Zip içinde zip olmaz: 5'ten fazla ölçü grubu varsa son gruplar tek "More-Sizes" zip'inde düz dosyalar olarak durur.
    const groups = formats.map((format) => ({ slug: fileSlug(format), label: format.replace(/\s*\(.*\)/, "") }));
    const zips = groups.length <= 5
      ? groups.map((group) => `${file}-${group.slug}.zip (every print in ${group.label})`)
      : [...groups.slice(0, 4).map((group) => `${file}-${group.slug}.zip (every print in ${group.label})`), `${file}-More-Sizes.zip (every print in ${joinWords(groups.slice(4).map((group) => group.label))})`];
    return [`Upload set: ${zips.join("; ")}; put the PDF with the size guide, how-to-print, thank-you and license pages inside the first zip.`, limit];
  }
  if (input.kind === "digital_planner") {
    const tablets = formats.filter(isTablet).flatMap((format) => ["Light", "Dark"].map((theme) => `${file}-${fileSlug(format)}-${theme}.pdf`));
    const prints = formats.filter((format) => !isTablet(format)).map((format) => `${file}-${fileSlug(format)}.pdf`);
    return [`Upload set: ${fit([...tablets, ...prints]).join("; ")} (each tablet edition once in the light and once in the dark theme).`, limit];
  }
  return [`Upload set: ${fit(formats.map((format) => `${file}-${fileSlug(format)}.pdf`)).join("; ")}.`, limit];
}

// Yazı kuralı tek yerden: kâğıt paketinde süs sayfası olmadığı için kural yalnız kâğıtları sayar.
function textRule(prepared: Prepared): string {
  const { input } = prepared;
  const rule = PRINTABLE_KINDS[input.kind].textRuleEn;
  return input.kind === "paper_craft" && paperMode(input.productType) === "papers" ? rule.replace("Patterned papers, solid papers and ephemera sheets are", "Patterned and solid papers are") : rule;
}

function themeLine(prepared: Prepared): string {
  const lead = (prepared.input.trendFeatures || []).filter((feature) => themeFamilies(feature).size || feature.split(" ").every((word) => STYLE_WORDS.has(word) || THEME_ADJECTIVES.has(word) || word === "style"));
  // "Christmas ephemera and library ephemera" iki tema gibi okunur: ilk özellik temadır, diğerleri o temanın ayrıntısıdır.
  const allNames = [...new Set(lead.map((feature) => proseCase(feature.replace(PAPER_NOUNS, "").trim())).filter(Boolean))];
  // "moody botanical" varken ayrıca "botanical" yazılmaz.
  const names = allNames.filter((name, index) => !allNames.some((other, otherIndex) => otherIndex !== index && other.length > name.length && new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(other)));
  const [main, ...details] = names;
  return main
    ? `- Theme: one theme for the whole product: ${main}${details.length ? `, with ${joinWords(details.slice(0, 2))} details that fit it` : ""}; add nothing from another season, holiday or mood`
    : "- Theme: one consistent visual style for the whole product; add no season, holiday or mood that is not listed above";
}

function buildPdfPrompt(prepared: Prepared, profile: KindProfile, name: string, rules: string[], art: ArtPlan): string {
  const { input } = prepared;
  const year = new Date().getUTCFullYear();
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pages = input.pageCount || profile.defaultPages;
  const features = input.trendFeatures || [];
  const textKind = !profile.art;
  return [
    input.kind === "digital_planner"
      ? `You are a senior digital planner designer, copywriter and technical editor for Etsy ${profile.labelEn} products. Create an ORIGINAL, sellable ${productPhrase(input.productType)} and produce ready-to-use tablet files.`
      : `You are a senior print designer, copywriter and technical editor for Etsy ${profile.labelEn} products. Create an ORIGINAL, sellable ${productPhrase(input.productType)} and produce print-ready files.`,
    "",
    "## Product name",
    `${name}. Use this exact name everywhere and do not change it: the Etsy listing, pins and images already use it.`,
    "",
    "## Product",
    `- Item: ${input.productType}`,
    `- Buyers: US Etsy shoppers searching "${input.keyword || input.productType}"${input.audience ? `; audience: ${input.audience}` : ""}`,
    input.kind === "wall_art"
      ? `- Size: ${Math.min(Math.max(pages, 1), 6)} artworks, each delivered in every ratio file`
      : `- Size: ${pages} core pages; the cover, ${input.kind === "digital_planner" ? "import guide" : "how-to-print"}, thank-you and license pages come on top`,
    `- Formats (deliver each as its own file): ${formats.join(", ")}`,
    `- Palette: ${input.colors?.length ? input.colors.join(", ") : "propose one with hex codes"}`,
    ...(features.length ? [`- Buyer-favored features: ${joinWords(features.map(proseCase))}`] : []),
    // Tema satırı yalnız gerçek bir tema/stil varsa onu adlandırır ("led by daily" gibi anlamsız tema yazılmaz).
    themeLine(prepared),
    "",
    "## Market brief (Etsy research)",
    input.referenceNotes || `Buyers are searching Etsy for "${input.keyword || input.productType}".`,
    "There is no single reference product. Design for what these buyers want, in your own original way.",
    "",
    "## Originality rules (mandatory)",
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "## Content",
    ...contentLines(prepared, profile).map((line) => `- ${line}`),
    ...(art.budget.length ? ["", "## Page budget (follow exactly)", ...art.budget.map((line) => `- ${line}`)] : []),
    "",
    "## Design rules",
    ...(input.kind === "paper_craft" && paperMode(input.productType) === "papers" ? ["300 dpi files (3600x3600 px for 12x12 in sheets)", "JPG for the 12x12 papers, plus printable PDF editions"] : profile.designEn).map((line) => `- ${line}`),
    `- ${textRule(prepared)}`,
    "",
    "## Work in three passes",
    `PASS 1 - Page plan: a table with one line per page (number, title, purpose, elements, format notes)${art.budget.length ? " that follows the page budget exactly" : ""}.`,
    `PASS 2 - Check and report: ${profile.art ? "all text and cut lines inside the safe margins (full-bleed art may reach the edge)" : "every page inside the safe margins"}, text readable at 100% ${input.kind === "digital_planner" ? "zoom on a tablet" : "print size"}, no spelling errors${textKind || input.kind === "paper_craft" ? ", every fill-in area large enough for handwriting" : ""}, totals in the page plan match the files.`,
    input.kind === "wall_art"
      ? "PASS 3 - Files: in code, crop and resize every print from its 2:3 master to each listed ratio or size (sRGB JPG, 300 dpi, exact pixel size), and build the size guide, how-to-print, thank-you and license pages as one PDF."
      : profile.art
      ? `PASS 3 - Assembly: build one print-ready HTML document per format that places the artwork files (art-01.png, art-02.png ... in Brief B order, as mapped in the page plan) with CSS @page set to the exact size (for example @page { size: 8.5in 11in; margin: 0 }) so 'Save as PDF' gives the exact size.${input.kind === "paper_craft" ? " Save every paper also as a 3600x3600 px JPG for the 12x12 set." : ""}`
      : input.kind === "digital_planner"
        ? "PASS 3 - Final files: generate the planner with a Python script (one template per layout plus loops; for example reportlab with internal links) so every tab and index link works, then export one hyperlinked PDF per format."
        : "PASS 3 - Final files: one print-ready HTML document per format with CSS @page set to the exact size (for example @page { size: 8.5in 11in; margin: 0 }) using vector shapes (inline SVG) only, ready to 'Save as PDF' without edits. If you can create files, export the PDFs directly.",
    "",
    ...(art.prompts.length ? [
      "## Artwork prompts",
      "Generate each artwork with an image model using these prompts.",
      ...art.notes.map((note) => `- ${note}`),
      ...art.prompts.map((prompt) => `- ${prompt}`),
      ""
    ] : []),
    "## Also deliver",
    `- ${printGuide(input.kind)}`,
    ...(input.kind !== "digital_planner" && formats.some(isTablet) ? ["- For the tablet edition: clickable tabs and an index on every page, plus a short 'How to import' page (download, import the PDF into a note-taking app that supports PDF links, tap the tabs)."] : []),
    "- A thank-you page from GXL Market Studio inviting the buyer to message for help and to leave a review.",
    `- A license page: "${printableLicense(input.kind, year)}"`,
    ...(healthNote(input) ? [`- A short gentle note on the first inside page: "${healthNote(input)}"`] : []),
    "- A 'Product spec' JSON block: name, theme, page titles in order, formats, palette (name + hex), fonts and the signature element. Mockups and listing photos will be made from it.",
    ...deliverables(prepared, name, formats).map((line) => `- ${line}`),
    "",
    "## Never",
    "- Never claim reviews, awards, bestseller status or sales numbers.",
    "- Never offer or mention a commercial-use license, a video or an editable version; this product has none.",
    "- Never use another seller's listing images or any copyrighted image as a reference.",
    "- Never use trademarked names, characters, celebrity names, logos or brand styles. App or tool names may appear only as plain-text compatibility notes (for example \"works with GoodNotes\"), never as logos or in the product name.",
    "- Never leave placeholder text such as Lorem ipsum."
  ].join("\n");
}

// Trend etiketi yalnız ürünün gerçekten içerdiği kelimelerden kuruluysa kullanılır (ör. "mandala coloring",
// ürün mandala içermiyorsa ilana girmez). Ürün kelimeleri, türün garanti içeriği, özellikler, görsel konuları,
// formatlar, kitle ve (renkli ürünlerde) renkler kapsanır.
function coveredVocabulary(prepared: Prepared, art?: ArtPlan): Set<string> {
  const { input } = prepared;
  const profile = PRINTABLE_KINDS[input.kind];
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const colorful = input.kind === "paper_craft" || input.kind === "wall_art";
  const words = [
    ...input.productType.split(/\s+/),
    ...(input.keyword || "").split(/\s+/),
    ...profile.vocabulary,
    ...profile.tagStems.flatMap((stem) => stem.split(" ")),
    ...(input.trendFeatures || []).flatMap((feature) => feature.split(/\s+/)),
    ...(art?.subjects || []).flatMap((subject) => subject.toLowerCase().split(/[^a-z']+/)),
    ...formats.flatMap((format) => format.toLowerCase().split(/[^a-z0-9]+/)),
    ...(input.audience || "").toLowerCase().split(/[^a-z]+/),
    ...(colorful ? (input.colors || []).flatMap((color) => color.toLowerCase().split(/\s+/)) : []),
    ...(input.kind === "paper_craft" && paperMode(input.productType) === "kit" ? ["ephemera", "junk", "journal", "journaling", "tags", "labels", "cards", "kit"] : []),
    "printable", "printables", "pdf", "digital", "download", "instant", "us"
  ];
  return new Set(words.filter(Boolean).flatMap((word) => [word, singular(word)]));
}

const TAG_FILLERS = new Set(["for", "and", "the", "of", "with", "to", "in", "a"]);

function relevantTrendTags(prepared: Prepared, art?: ArtPlan): string[] {
  const { input, themes } = prepared;
  const vocabulary = coveredVocabulary(prepared, art);
  const features = input.trendFeatures || [];
  const rank = (tag: string) => { const index = features.findIndex((feature) => tag.includes(feature)); return index === -1 ? features.length : index; };
  return (input.trendTags || [])
    .filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, themes) && !["instant download", "digital download", "printable", "pdf"].includes(tag)
      && tag.split(/\s+/).every((word) => TAG_FILLERS.has(word) || vocabulary.has(word) || vocabulary.has(singular(word))))
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => rank(a.tag) - rank(b.tag) || a.index - b.index)
    .map((item) => item.tag);
}

function bundleIdea(prepared: Prepared, profile: KindProfile, name: string) {
  const { input } = prepared;
  const head = productHead(input.productType);
  const companions = (input.trendTags || [])
    .filter((tag) => !isIpRisky(tag) && !tag.includes(head) && tag.split(/\s+/).length >= 2 && !/\b(printable|instant|download|digital|pdf)\b/.test(tag))
    .slice(0, 3);
  const items = [input.productType, ...companions];
  return {
    titleTr: `${name} seti`,
    items: items.length > 1 ? items : [input.productType, `${input.productType} (ek tema/renk)`, `${profile.labelEn} bonus sayfalar`],
    priceNoteTr: "Aynı stil ve paletle uyumlu bir set yap. Set fiyatı tekli ürünün yaklaşık 2-2,5 katı olsun; tekli ürünün açıklamasında sete bağlantı ver."
  };
}

// Yalnız sayılabilen bir ürün adıyla biten ifade cümleye girer ("a daily planner", "cozy coloring pages");
// "dinosaur coloring" veya "boho bridal shower" gibi ifadeler cümleyi bozacağı için kullanılmaz.
const COUNTABLE_HEAD = /^(planner|journal|card|book|kit|pack|set|print|poster|insert|binder|tracker|log|workbook|bundle|template)$/;
const PLURAL_HEAD = /^(planners|journals|cards|books|kits|packs|sets|prints|posters|inserts|games|pages|papers|sheets|worksheets|activities|trackers|templates|printables)$/;
function nounPhrase(phrase: string): string | undefined {
  const last = phrase.split(" ").at(-1)!;
  if (PLURAL_HEAD.test(last) || /\bephemera$/.test(phrase)) return phrase;
  if (COUNTABLE_HEAD.test(last)) return `${article(phrase)} ${phrase}`;
  return undefined;
}

// Düz yazıda formatlar: "US Letter, A4 and A5 sizes", duvar sanatında "five frame ratios up to 24x36 in".
function formatsProse(formats: string[], kind: PrintableKind): string | undefined {
  if (kind === "wall_art") return "frame sizes up to 18x24 in";
  if (kind === "digital_planner") return "a hyperlinked tablet PDF";
  const short = [...new Set(formats.map((format) => format.replace(/\s*\(.*\)/, "").replace(/\s+in\s+(sheets|cards)$/i, "").replace(/\s+binder pages$/i, "").replace(/^4x6 and 5x7$/, "4x6, 5x7").trim()).flatMap((format) => format.split(/,\s*/)).filter((format) => /^(us letter|half letter|a4|a5|4x6|5x7|12x12|8x10|11x14)$/i.test(format)))];
  return short.length ? `${joinWords(short.slice(0, 4))} ${short.length > 1 ? "sizes" : "size"}` : undefined;
}

// Özellik cümleye türüne göre girer: tema "with a Christmas theme", stil "in a boho style", içerik "with busy book pages".
// "iPad", "book", "daily" gibi içerik/biçim kelimeleri cümleye girmez ("with iPad pages" olmaz).
const NO_CLAUSE = /^(ipad|tablet|goodnotes|notability|book|books|daily|weekly|monthly|undated|dated|printable|digital|kids|adult|adults|finance|money|adhd|large print|instant download)$/;
const PLURAL_CONTENT = /\b(pages|designs|papers|prints|worksheets|games|cards|activities|sheets|prompts|trackers|templates|ephemera)$/;
function featureClause(feature: string | undefined, profile: KindProfile, kind: PrintableKind): string {
  if (!feature) return "";
  const lower = feature.toLowerCase().trim();
  if (NO_CLAUSE.test(lower)) return "";
  if (lower === "gender neutral") return " in a gender-neutral style";
  const styleWords = lower.replace(/\s+style$/, "").split(" ");
  if (styleWords.every((word) => STYLE_WORDS.has(word))) {
    const style = proseCase(styleWords.join(" "));
    return ` in ${article(style)} ${style} style`;
  }
  if (themeFamilies(lower).size && !PLURAL_CONTENT.test(lower)) return ` with ${article(lower)} ${proseCase(lower)} theme`;
  if (PLURAL_CONTENT.test(lower)) return ` with ${proseCase(lower)}`;
  if (kind === "party") return ` with ${article(lower)} ${proseCase(lower)} game`;
  return ` with ${proseCase(lower)} ${profile.pageWord}`;
}

// İçerik özeti: "8 seamless patterned papers, 3 coordinating solid papers and 3 ephemera sheets".
function contentsSummary(items: string[]): string {
  const parts = items
    .filter((item) => !/^\d+x\d+|up to/i.test(item))
    .map((item) => item.replace(/\s*\(.*?\)/g, "").trim())
    .map((item) => /^\d/.test(item) ? item : `${article(item)} ${item.charAt(0).toLowerCase()}${item.slice(1)}`);
  return joinWords(parts);
}

// Uzun açıklama ortadan kesilmez ("... GXL Market Studio" noktasız kalmaz): sığana kadar ikincil cümleler çıkarılır.
function fitSentences(sentences: string[], max: number): string {
  const kept = sentences.filter(Boolean);
  const optional = [1, 4, 3];
  let text = kept.join(" ");
  for (const index of optional) {
    if (text.length <= max) break;
    const sentence = sentences[index];
    if (sentence && kept.includes(sentence)) kept.splice(kept.indexOf(sentence), 1);
    text = kept.join(" ");
  }
  return text;
}

// Pin başlıkları alıcı ifadelerinden; açıklama her zaman ürünün kendi adıyla kurulan düzgün cümlelerdir.
function buildPins(prepared: Prepared, name: string, art: ArtPlan): PrintableBrief["pins"] {
  const { input } = prepared;
  const profile = PRINTABLE_KINDS[input.kind];
  const keyword = input.keyword || input.productType;
  const features = input.trendFeatures || [];
  const phrases = [...new Set([keyword, ...relevantTrendTags(prepared, art)])];
  const angles = [
    { phrase: phrases[0], feature: features[0] },
    { phrase: phrases[1] || input.productType, feature: features[1] || features[0] },
    { phrase: phrases[2] || phrases[0], feature: features[2] || features[1] }
  ];
  const formats = formatsProse(input.formats?.length ? input.formats : profile.defaultFormats, input.kind);
  const palette = input.colors?.length ? ` in ${article(input.colors[0])} ${joinWords(input.colors.slice(0, 3))} palette` : "";
  const pages = input.pageCount || profile.defaultPages;
  const included = art.includedEn.length && profile.art ? contentsSummary(art.includedEn) : `${pages} pages`;
  const tablet = (input.formats || []).some((format) => /tablet|hyperlink/i.test(format)) || input.kind === "digital_planner";
  // Pinler aynı açıklamayı tekrar etmesin diye her açının kendi cümle kalıbı vardır.
  const lookingLines = [(phrase: string) => `A thoughtful pick for anyone looking for ${phrase}.`, (phrase: string) => `Perfect if you are looking for ${phrase}.`, (phrase: string) => `A fresh take on ${phrase}.`];
  const includeLines = ["Includes", "Inside you get", "You get"];
  const audience = (input.audience || "").split(/\s*,\s*/).filter(Boolean);
  const audienceLine = !audience.length ? "" : input.kind === "coloring" ? `Made for ${joinWords(audience)} who love to color.` : `Made for ${joinWords(audience)}.`;
  const product = `${article("original")} original ${productPhrase(input.productType)}`;
  const usedOverlays = new Set<string>();
  const head = productHead(input.productType);
  return angles.map(({ phrase, feature }, angle) => {
    // "peculiar pages" gibi yalnız stil + "pages" olan ifade ürün araması değildir; cümleye girmez.
    const styleOnly = phrase.split(" ").slice(0, -1).every((word) => STYLE_WORDS.has(word));
    const looking = phrase !== input.productType && phrase !== keyword && !styleOnly ? nounPhrase(phrase) : undefined;
    // Pin başlığında ürün türü her zaman geçer; üstteki başlık yazısı pinden pine farklıdır.
    // "watercolor floral paper" + "paper pack" → "watercolor floral paper pack" (kelime tekrarı olmadan).
    // "cozy christmas coloring" + "adult coloring pages" → "cozy christmas coloring pages".
    const productWords = input.productType.split(" ");
    const lastWord = phrase.split(" ").at(-1)!;
    const shared = productWords.indexOf(lastWord);
    const overlap = productWords.findIndex((_, index) => phrase.endsWith(productWords.slice(0, productWords.length - index).join(" ")));
    const base = phrase.includes(head) ? phrase
      : shared >= 0 ? `${phrase} ${productWords.slice(shared + 1).join(" ")}`.trim()
        : overlap >= 0 && overlap < productWords.length ? `${phrase} ${productWords.slice(productWords.length - overlap).join(" ")}`.trim() : `${phrase} ${input.productType}`;
    const overlay = [feature, phrase, input.productType].map((item) => (item || "").toUpperCase()).find((item) => item && !usedOverlays.has(item)) || input.productType.toUpperCase();
    usedOverlays.add(overlay);
    const sentences = [
      `${name} is ${proseCase(product)}${featureClause(feature && !phrase.includes(feature) ? feature : undefined, profile, input.kind)}${palette}.`,
      looking ? lookingLines[angle % lookingLines.length](proseCase(looking)) : "",
      `${includeLines[angle % includeLines.length]} ${included}.${formats ? ` Available in ${formats}.` : ""}`,
      input.kind === "digital_planner" ? "Instant digital download for your tablet." : `Instant digital download: ${input.kind === "wall_art" || input.kind === "paper_craft" ? "print at home or at a print shop" : "print at home"}${tablet ? " or use it on your tablet" : ""}.`,
      audienceLine,
      "Designed by GXL Market Studio."
    ];
    return {
      title: proseCase(`${titleCase(base)}${feature && !base.includes(feature) ? ` | ${titleCase(feature)}` : ""}`).slice(0, 100),
      overlay,
      description: fitSentences(sentences, 480)
    };
  });
}

function checklistFor(prepared: Prepared): string[] {
  const { input } = prepared;
  const formats = input.formats?.length ? input.formats : PRINTABLE_KINDS[input.kind].defaultFormats;
  const printSizes = formats.filter((format) => !isTablet(format) && !/black-and-white/i.test(format));
  return [
    input.kind === "digital_planner"
      ? "Every page reads well at 100% zoom on a tablet, and every tab and index link jumps to the right page."
      : `Every page sits inside the safe margins and prints at 100% (Actual size) in every included size (${printSizes.join(", ")}) without clipping.`,
    textRule(prepared),
    "The whole product follows one theme; nothing from another season, holiday or mood appears.",
    "All fonts are licensed for commercial use; list them.",
    "No brand, character or celebrity names; all artwork is original and no other seller's image was used as a reference.",
    "Etsy allows at most 5 files of at most 20 MB each per digital listing; the upload set follows the 'Upload set' line and every file name is clear.",
    "Listing images show the real pages from the files.",
    `${input.kind === "digital_planner" ? "Import guide" : input.kind === "wall_art" ? "Size guide, how-to-print" : "How-to-print"}, thank-you and license pages are included.`
  ];
}

export function buildPrintableBrief(raw: PrintablePlanInput): PrintableBrief {
  const prepared = prepare(raw);
  const { input } = prepared;
  const profile = PRINTABLE_KINDS[input.kind];
  const pages = input.pageCount || profile.defaultPages;
  // Ada yalnız tek kelimelik renk/stil girer; "Library Ephemera Govery Junk Journal Kit" gibi uzun adlar oluşmaz.
  const accents = [...(input.trendFeatures || []), ...(input.colors || [])].filter((accent) => !accent.includes(" ") && !/^(black|charcoal|gray|grey|brown|chocolate)$/.test(accent));
  const name = coinProductName({ productType: input.productType, salt: `${input.seed || ""}|${input.kind}|${input.productType}|${input.referenceNotes || ""}`, accents, avoidNames: input.avoidNames });
  const rules = originalityPlan(prepared, profile);
  const art = buildArtPlan(prepared, profile, pages);
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pdfPrompt = buildPdfPrompt(prepared, profile, name, rules.en, art);
  // Görsel promptuna yalnız görünen özellikler girer ("iPad", "daily" gibi içerik kelimeleri değil).
  const visibleFeatures = (input.trendFeatures || []).filter((feature) => themeFamilies(feature).size || art.subjects.some((subject) => subject.toLowerCase().includes(feature)));
  const adVisuals = buildAdVisuals({ kind: input.kind, productType: input.productType, name, colors: input.colors, features: visibleFeatures, formats, pageCount: pages, seed: input.seed, papersOnly: input.kind === "paper_craft" && paperMode(input.productType) === "papers" });
  const pins = buildPins(prepared, name, art);
  return {
    name,
    kind: input.kind,
    originalityPlan: rules.tr,
    pdfPrompt,
    artPrompts: art.prompts,
    artSubjects: art.prompts.length ? art.subjects.slice(0, art.prompts.length) : [],
    adVisuals,
    pins,
    masterPrompt: buildMasterPrompt({
      name,
      productLabel: input.productType,
      specName: "Product spec",
      // Sanat promptları PDF briefinin içinde de geçer; pakette Brief B olarak bir kez verilir.
      filesBrief: pdfPrompt.replace(/## Artwork prompts[\s\S]*?\n\n(?=## )/, "## Artwork\nUse the artworks from Brief B.\n\n"),
      artPrompts: art.prompts,
      artNotes: art.notes,
      adVisuals,
      pins,
      qa: qaProtocol({ type: "printable", name, kind: input.kind, formats, pages, pagesNote: art.pagesNote, papersOnly: input.kind === "paper_craft" && paperMode(input.productType) === "papers" }),
      checklist: checklistFor(prepared)
    }),
    bundleIdea: bundleIdea(prepared, profile, name),
    qualityGate: [
      "Her formattan bir test sayfasını %100 (gerçek boyut) ölçekte hem Letter hem A4 kâğıda yazdır; kenar boşluğu kesilmiyor mu kontrol et.",
      "Paketin 'Automated QA' çıktısını iste ve oku: tek satırda FAIL kalmamalı (sayfa sayısı, kopya sayfa, eksik format, ad tutarlılığı, kapak, dosya boyutu).",
      "Ürünün tek temada olduğuna bak: başka bayram, mevsim veya tarz (ör. Noel kitinde cadı sayfası) olmamalı.",
      "İlanda yazan her format dosyalarda gerçekten var mı bak; uygulama yüklemede eksik formatı ve aynı dosyanın iki kez yüklenmesini engeller.",
      "Yazım denetimi yap (US English); 'Lorem ipsum' veya boş alan kalmasın.",
      "Fontların ticari kullanım lisansı olsun; listeyi sakla.",
      "Marka, karakter veya ünlü adı yok; görseller tamamen özgün, başka satıcının görseli referans alınmadı.",
      "Etsy dijital ilanına en fazla 5 dosya, her biri en fazla 20 MB yüklenebilir; büyük dosyaları bölümlere ayırıp ZIP'le ve adlarını anlaşılır yap.",
      "Mockup görsellerindeki sayfalar gerçek PDF sayfaları olsun; render olduğunu açıklamada belirt.",
      "Yapay zekâ kullandıysan Etsy formunda yapay zekâ kutusunu işaretle.",
      "PDF'te 'Nasıl yazdırılır' sayfası ve teşekkür sayfası bulunsun; bunlar yanlış baskı şikâyetlerini ve iade taleplerini azaltır."
    ]
  };
}

function primaryPhrase(input: PrintablePlanInput): string {
  const head = productHead(input.productType);
  if (input.keyword && input.keyword.includes(head)) return titleCase(input.keyword);
  return titleCase(`${input.productType} ${input.kind === "digital_planner" || input.kind === "wall_art" || /printable/.test(input.productType) ? "" : "printable"}`.trim());
}

// Başlıkta okunur format ifadesi ("12x12 in sheets, US Letter, A4" yerine "12x12, US Letter, A4").
function formatPhrase(formats: string[], kind?: PrintableKind): string | undefined {
  if (kind === "wall_art") return "Sizes up to 18x24";
  if (kind === "digital_planner") return "Tablet PDF";
  const short = formats.map((format) => format.replace(/\s*\(.*\)/, "").replace(/\s+in\s+(sheets|cards)$/i, "").replace(/\s+binder pages$/i, "").trim())
    .filter((format) => /letter|a4|a5|4x6|5x7|12x12/i.test(format));
  const unique = [...new Set(short)];
  return unique.length ? unique.slice(0, 4).join(", ") : undefined;
}

const wordsOf = (value: string) => value.toLowerCase().match(/[a-z0-9']+/g) || [];

function buildTitle(prepared: Prepared, art: ArtPlan, primary = primaryPhrase(prepared.input)): string {
  const { input } = prepared;
  const profile = PRINTABLE_KINDS[input.kind];
  const trend = input.trendTags || [];
  const counts = new Map<string, number>();
  const count = (phrase: string) => wordsOf(phrase).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  count(primary);
  const phrases: string[] = [primary.toLowerCase()];
  const words = input.productType.split(/\s+/);
  const tagHead = words.length > 1 && GENERIC_HEADS.test(words.at(-1)!) ? words.slice(-2).join(" ") : words.at(-1)!;
  // Yalnız yeni kelime getiren, hiçbir kelimeyi ikiden fazla tekrarlatmayan ve başlıktaki bir ifadeyi
  // ("Junk Journal Kit, Cottage Junk Journal Kit") yeniden içermeyen ifade eklenir.
  const fits = (phrase: string) => {
    const phraseWords = wordsOf(phrase);
    if (phraseWords.every((word) => counts.has(word)) || phraseWords.some((word) => word.length >= 3 && (counts.get(word) || 0) >= 2)) return false;
    return !phrases.some((used) => used.split(" ").length >= 2 && new RegExp(`\\b${escapeRegex(used)}\\b`).test(phrase.toLowerCase()));
  };
  const add = (phrase: string) => { count(phrase); phrases.push(phrase.toLowerCase()); };
  const trendTags = relevantTrendTags(prepared, art);
  // Her varyant kendi öne çıkan özelliğiyle başlar: önce o özelliği içeren alıcı ifadesi, yoksa "özellik + ürün".
  const features = (input.trendFeatures || []).filter((feature, index, all) => !NO_CLAUSE.test(feature) && !MISLEADING_FEATURE.test(feature)
    && !all.some((other, otherIndex) => otherIndex !== index && other.length > feature.length && other.includes(feature)));
  for (const feature of features) {
    const candidates = [
      ...trendTags.filter((tag) => tag.includes(feature)),
      ...(!feature.includes(" ") && (themeFamilies(feature).size || STYLE_WORDS.has(feature)) ? [`${feature} ${tagHead}`] : []),
      ...(feature.includes(" ") || themeFamilies(feature).size ? [feature] : [])
    ];
    const chosen = candidates.find(fits);
    if (chosen) { add(chosen); break; }
  }
  for (const tag of trendTags) {
    if (phrases.length === 4) break;
    if (fits(tag)) add(tag);
  }
  const format = formatPhrase(input.formats?.length ? input.formats : profile.defaultFormats, input.kind);
  const segments = [primary, ...phrases.slice(1).map(titleCase), ...(format ? [format] : []), ...(!trend.length || trend.includes("instant download") ? ["Instant Download"] : [])];
  let title = "";
  for (const segment of segments) {
    const next = title ? `${title}, ${segment}` : segment;
    if (next.length > 140) break;
    title = next;
  }
  return normalizeEtsyTitle(proseCase(title));
}

// Önce alıcı ifadeleri (trend), sonra bu ürünün formatları, renkleri ve kelimeleri; türün genel ifadeleri yalnızca 13'ü tamamlamak için.
const GENERIC_HEADS = /^(pages?|art|cards?|games?|sheets?|kit|pack|paper|printables?|templates?|worksheets?|activities|prints?)$/;
const SEARCHED_SIZES: Array<[RegExp, string]> = [[/^us letter/i, "us letter"], [/^a4/i, "a4"], [/^a5/i, "a5"], [/^half letter/i, "half letter"], [/^4x6/i, "4x6"], [/^5x7/i, "5x7"], [/^8x10/i, "8x10"], [/^11x14/i, "11x14"], [/^12x12/i, "12x12"]];

function buildTags(prepared: Prepared, art: ArtPlan): string[] {
  const { input } = prepared;
  const product = input.productType;
  const profile = PRINTABLE_KINDS[input.kind];
  const words = product.split(/\s+/);
  const tagHead = words.length > 1 && GENERIC_HEADS.test(words.at(-1)!) ? words.slice(-2).join(" ") : words.at(-1)!;
  const sizes = (input.formats?.length ? input.formats : profile.defaultFormats)
    .map((format) => SEARCHED_SIZES.find(([pattern]) => pattern.test(format))?.[1])
    .filter((size): size is string => Boolean(size));
  const kit = input.kind === "paper_craft" && paperMode(product) === "kit";
  // Ölçü etiketi yalnız ölçüyle aranan türlerde ve en fazla 2 tane; renk etiketi yalnız duvar sanatında aranır.
  const sizeTags = ["planner", "journal", "recipe", "wall_art"].includes(input.kind) ? sizes.slice(0, 2) : [];
  const vocabulary = new Set([...profile.vocabulary, ...words].map((word) => singular(word)));
  const featureTags = (input.trendFeatures || []).flatMap((feature) => {
    const last = singular(feature.split(" ").at(-1)!);
    // "preschool worksheets activity pages" olmaz: özellik zaten bir ürün adıyla bitiyorsa olduğu gibi kullanılır.
    if (vocabulary.has(last) || PLURAL_CONTENT.test(feature)) return [feature];
    return feature.includes(" ") ? [`${feature} ${tagHead}`, feature] : [`${feature} ${tagHead}`];
  });
  return normalizeEtsyTags([
    ...(input.keyword ? [input.keyword] : []),
    ...relevantTrendTags(prepared, art),
    ...featureTags,
    product,
    ...(input.kind !== "digital_planner" ? [`printable ${tagHead}`, `${tagHead} printable`] : []),
    ...(input.kind !== "wall_art" ? [`${tagHead} pdf`] : []),
    ...sizeTags.map((size) => `${size} ${tagHead}`),
    ...(input.kind === "wall_art" ? (input.colors || []).map((color) => `${color.toLowerCase()} ${tagHead}`) : []),
    ...(words.length > 1 && !GENERIC_HEADS.test(words[0]) ? [`${words.slice(0, -1).join(" ")} printable`] : []),
    ...(["planner", "recipe", "party", "journal"].includes(input.kind) ? [`${tagHead} template`] : []),
    ...(input.audience ? [`${tagHead} for ${input.audience.split(",")[0].trim().toLowerCase()}`] : []),
    ...(kit ? ["junk journal", "printable ephemera", "journal ephemera", "junk journal pages"] : []),
    profile.labelEn,
    ...profile.tagStems,
    ...(input.kind === "digital_planner" || input.kind === "paper_craft" ? [`digital ${tagHead}`] : []),
    "instant download"
  ].filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, prepared.themes)));
}

function buildDescription(prepared: Prepared, name: string, art: ArtPlan, hook?: string): string {
  const { input } = prepared;
  const profile = PRINTABLE_KINDS[input.kind];
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pages = input.pageCount || profile.defaultPages;
  const features = input.trendFeatures || [];
  const lead = features[0] && themeFamilies(features[0]).size ? ` with ${article(features[0])} ${proseCase(features[0])} theme` : "";
  const included = input.kind === "wall_art" || input.kind === "paper_craft" || input.kind === "coloring" ? art.includedEn : [`${pages} pages`, ...profile.includedEn];
  const note = healthNote(input);
  const tablet = formats.some((format) => isTablet(format));
  const lastStep: Record<PrintableKind, string> = {
    planner: "Fill in your pages and start planning.",
    digital_planner: "Tap the tabs and start planning.",
    coloring: "Pick your pencils and start coloring.",
    wall_art: "Frame your prints and enjoy.",
    party: "Cut the cards and play at your party.",
    recipe: "Write in your favorite recipes and file the cards.",
    journal: "Grab a pen and start writing.",
    kids: "Hand out the pages and start learning.",
    paper_craft: "Cut, fold and create."
  };
  const steps = input.kind === "digital_planner"
    ? ["1. Purchase and download the files from your Etsy Purchases page.", "2. Import the PDF into a note-taking app that supports PDF links.", `3. ${lastStep.digital_planner}`]
    : [
      "1. Purchase and download the files from your Etsy Purchases page.",
      `2. ${input.kind === "wall_art" ? "Unzip the size you need and print it at home or at a print shop" : input.kind === "paper_craft" ? "Unzip the files and print at home or at a print shop" : "Print at home or at a print shop"} at Actual size / 100% scale.`,
      `3. ${lastStep[input.kind]}`,
      ...(tablet ? ["4. On a tablet: import the hyperlinked PDF into a note-taking app that supports PDF links."] : [])
    ];
  // "Christmas · Christmas Busy Book" olmaz: başka bir özelliğin içinde geçen özellik tekrar yazılmaz.
  const highlights = features.filter((feature, index) => !features.some((other, otherIndex) => otherIndex !== index && other.length > feature.length && new RegExp(`\\b${escapeRegex(feature)}\\b`, "i").test(other)));
  return [
    hook ? `${name}: ${hook}` : `${name} is ${article("original")} original ${proseCase(productPhrase(input.productType))}${lead}, ${useSentence(input.kind)}.`,
    "",
    "THIS IS A DIGITAL PRODUCT. NO PHYSICAL ITEM WILL BE SHIPPED.",
    "",
    ...(highlights.length ? [`HIGHLIGHTS: ${highlights.map((feature) => titleCase(proseCase(feature)).replace(/\bAnd\b/g, "and")).join(" · ")}`, ""] : []),
    "WHAT'S INCLUDED",
    ...included.map((item) => `• ${item}`),
    `• Formats: ${formats.join(", ")}`,
    "",
    "HOW IT WORKS",
    ...steps,
    "",
    "PLEASE NOTE",
    ...(note ? [`• ${note}`] : []),
    `• Colors may look slightly different depending on your ${input.kind === "digital_planner" ? "screen" : "screen and printer"}.`,
    "• All listing images are mockups made from the actual files.",
    ...(input.aiAssisted !== false ? ["• Designed with the help of AI tools and checked with automated file tests."] : []),
    "• Because this is a digital file, all sales are final, but message us with any question and we will help.",
    "",
    "LICENSE",
    printableLicense(input.kind)
  ].join("\n");
}

function listingParts(raw: PrintablePlanInput) {
  const prepared = prepare(raw);
  const profile = PRINTABLE_KINDS[prepared.input.kind];
  const art = buildArtPlan(prepared, profile, prepared.input.pageCount || profile.defaultPages);
  return { prepared, art };
}

export function buildPrintableListing(raw: PrintablePlanInput, name: string): PrintableListingDraft {
  const { prepared, art } = listingParts(raw);
  const title = buildTitle(prepared, art);
  const tags = buildTags(prepared, art);
  const materials = ["pdf file", "printable", "digital download"];
  return {
    title,
    description: buildDescription(prepared, name, art),
    tags,
    materials,
    checks: validateEtsyListingText({ title, tags, materials }),
    warnings: [
      ...(raw.aiAssisted !== false ? ["Etsy ilan formunda yapay zekâ kullanımı kutusunu işaretle; açıklamaya bildirim eklendi."] : []),
      ...(prepared.dropped.length ? [`Temayla çatışan veya yanıltıcı ifadeler ilana alınmadı: ${prepared.dropped.join(", ")}.`] : []),
      "Mockup görsellerinde gerçek PDF sayfalarını kullan; ürünle uyuşmayan görsel kötü yorum getirir."
    ],
    source: "rules"
  };
}

interface AiPrintableSuggestion { hook: string; tags: string[] }

export async function createPrintableListing(raw: PrintablePlanInput, name: string, env: AiRuntimeEnv): Promise<PrintableListingDraft> {
  const draft = buildPrintableListing(raw, name);
  if (!hasAiProvider(env)) return draft;
  const { prepared, art } = listingParts(raw);
  const { input } = prepared;
  try {
    const suggestion = await generateStructuredObject<AiPrintableSuggestion>({
      schemaName: "gxl_etsy_printable_listing",
      prompt: `You are an Etsy SEO specialist for digital printables bought by US shoppers.\nProduct: ${JSON.stringify({ name, kind: input.kind, item: input.productType, theme: input.trendFeatures?.[0], features: input.trendFeatures, includes: art.includedEn, colors: input.colors, formats: input.formats })}\nTags on top-ranking Etsy listings for this search: ${JSON.stringify(input.trendTags || [])}.\nWrite fresh wording for this specific product; do not reuse stock phrases. Describe only what the product includes; never mention another holiday, season or theme, a commercial license, an editable version or a video. Never use trademarked names or characters. Return: hook = one warm sentence (max 160 characters) about what makes it special, in correct US English with proper capitalization, without claiming reviews or bestseller status; tags = 13 unique lowercase multi-word buyer phrases, each 20 characters or fewer, only letters, numbers, spaces, hyphens and apostrophes.`,
      schema: { type: "object", additionalProperties: false, properties: { hook: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["hook", "tags"] }
    }, env);
    const tags = normalizeEtsyTags([...suggestion.tags.filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, prepared.themes)), ...draft.tags]);
    const hook = proseCase(cleanText(suggestion.hook, 160).replace(/\b(best ?seller|bestselling|top rated)\b/gi, "").replace(/\s{2,}/g, " ").trim());
    const safeHook = hook && fitsTheme(hook, prepared.themes) && !MISLEADING_FEATURE.test(hook) ? hook : undefined;
    return { ...draft, tags, description: buildDescription(prepared, name, art, safeHook), checks: validateEtsyListingText({ title: draft.title, tags, materials: draft.materials }), source: "ai" };
  } catch (error) {
    console.error("AI printable listing failed", error instanceof Error ? error.message : error);
    return draft;
  }
}

export function printableKindOptions() {
  return (Object.keys(PRINTABLE_KINDS) as PrintableKind[]).map((id) => ({ id, labelTr: PRINTABLE_KINDS[id].labelTr, defaultFormats: PRINTABLE_KINDS[id].defaultFormats, defaultPages: PRINTABLE_KINDS[id].defaultPages }));
}

export function defaultPrintableFormats(kind: PrintableKind): string[] {
  return PRINTABLE_KINDS[kind].defaultFormats;
}

export function defaultPrintablePages(kind: PrintableKind): number {
  return PRINTABLE_KINDS[kind].defaultPages;
}
