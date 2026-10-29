import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { buildMasterPrompt } from "./master-prompt.js";
import { qaProtocol } from "./qa-protocol.js";
import { buildAdVisuals, type AdVisual } from "./ad-visuals.js";
import type { PatternCraft } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { cleanBriefNotes, fitsTheme, harmonizeThemes, MISLEADING_FEATURE, proseCase, themeFamilies } from "./theme.js";

export type SkillLevel = "beginner" | "easy" | "intermediate" | "experienced";

export interface PatternPlanInput {
  craft: PatternCraft;
  productType: string;
  referenceNotes?: string;
  referenceRepeatCount?: number;
  referenceColors?: string[];
  skillLevel?: SkillLevel;
  sizeNote?: string;
  yarnNote?: string;
  colors?: string[];
  keyword?: string;
  trendTags?: string[];
  seed?: string;
  referenceSource?: "trend";
  trendFeatures?: string[];
  avoidNames?: string[];
}

export interface PatternBrief {
  name: string;
  originalityPlan: string[];
  patternPrompt: string;
  renderPrompt: string;
  photoPlan: Array<{ slot: number; title: string; detail: string }>;
  qualityGate: string[];
  adVisuals: AdVisual[];
  // Desen, render ve reklam görselleri tek sohbette sırayla yapılsın diye birleştirilmiş paket.
  masterPrompt: string;
}

export interface DigitalListingInput {
  name: string;
  craft: PatternCraft;
  productType: string;
  skillLevel?: SkillLevel;
  sizeNote?: string;
  yarnNote?: string;
  colors?: string[];
  pageCount?: number;
  keyword?: string;
  trendTags?: string[];
  features?: string[];
  aiAssisted?: boolean;
  photosAreRenders?: boolean;
  testMade?: boolean;
}

export interface DigitalListingDraft {
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  etsy: { type: "download"; who_made: "i_did"; when_made: "2020_2026"; is_supply: true; quantity: number };
  checks: { titleLength: number; tagCount: number; ok: boolean; issues: string[] };
  warnings: string[];
  source: "rules" | "ai";
}

interface CraftProfile {
  label: string;
  tag: string;
  short: string;
  order: "craft-first" | "product-first";
  tool: string;
  terms: string;
  unit: string;
  defaultMaterial: string;
  fan: string;
  chart: string;
}

const CRAFTS: Record<PatternCraft, CraftProfile> = {
  crochet: { label: "Crochet", tag: "crochet", short: "crochet", order: "craft-first", tool: "crochet hook", terms: "standard US crochet terms (Craft Yarn Council)", unit: "round/row", defaultMaterial: "cotton yarn", fan: "crocheter", chart: "stitch chart using standard Craft Yarn Council crochet symbols" },
  knitting: { label: "Knit", tag: "knitting", short: "knit", order: "craft-first", tool: "knitting needles", terms: "standard US knitting terms (Craft Yarn Council)", unit: "row/round", defaultMaterial: "wool blend yarn", fan: "knitter", chart: "knitting chart using standard Craft Yarn Council symbols with a key" },
  embroidery: { label: "Embroidery", tag: "embroidery", short: "embroidery", order: "product-first", tool: "embroidery hoop and needle", terms: "standard embroidery stitch names", unit: "stitch area", defaultMaterial: "cotton embroidery floss", fan: "embroiderer", chart: "full-size printable template with stitch and color callouts" },
  cross_stitch: { label: "Cross Stitch", tag: "cross stitch", short: "cross stitch", order: "product-first", tool: "tapestry needle and Aida fabric", terms: "DMC floss numbers and standard cross stitch symbols", unit: "chart section", defaultMaterial: "cotton embroidery floss", fan: "cross stitcher", chart: "complete symbol chart (black-and-white symbols plus color version) with a DMC key and stitch counts" },
  sewing: { label: "Sewing", tag: "sewing", short: "sewing", order: "product-first", tool: "sewing machine", terms: "standard US sewing terms", unit: "step", defaultMaterial: "cotton fabric", fan: "sewist", chart: "to-scale pattern pieces with grainlines, notches, seam allowances and a 1 in / 2.5 cm test square" },
  macrame: { label: "Macrame", tag: "macrame", short: "macrame", order: "craft-first", tool: "wooden dowel", terms: "standard macrame knot names", unit: "row", defaultMaterial: "cotton macrame cord", fan: "macrame maker", chart: "knot diagram for every row with cord numbering" },
  punch_needle: { label: "Punch Needle", tag: "punch needle", short: "punch needle", order: "craft-first", tool: "punch needle and monk's cloth", terms: "standard punch needle terms", unit: "color area", defaultMaterial: "wool yarn", fan: "punch needle maker", chart: "full-size mirrored template with loop height and color callouts" }
};

const SKILL_LABELS: Record<SkillLevel, { en: string; title: string; tag: string }> = {
  beginner: { en: "Beginner", title: "Beginner Friendly", tag: "beginner" },
  easy: { en: "Easy", title: "Easy Level", tag: "easy" },
  intermediate: { en: "Intermediate", title: "Intermediate Level", tag: "intermediate" },
  experienced: { en: "Advanced", title: "Advanced Level", tag: "advanced" }
};

// Desen adı hazır kelime listesinden seçilmez: hecelerden her seferinde yeni bir sözcük türetilir.
const NAME_ONSETS = ["b", "c", "d", "f", "g", "l", "m", "n", "p", "r", "s", "t", "v", "z", "br", "cl", "fl", "gl", "sh", "st", "w"];
const NAME_VOWELS = ["a", "e", "i", "o", "u"];
const NAME_MIDDLES = ["l", "n", "r", "v", "m", "s", "th", "ll", "nn", "d", "z"];
const NAME_ENDINGS = ["a", "ia", "elle", "ora", "ine", "is", "en", "yn", "ette", "ara", "ina", "ery", "o", "ie"];
const WEARABLE = /(slipper|sock|sweater|cardigan|\btop\b|hat|beanie|dress|vest|mitten|glove|bootie|shoe|pullover|skirt|shawl|shrug|tee|jumper)/i;
const CIRCULAR = /(doily|mandala|coaster|placemat|round|circle|(?<!mug )\brug\b|centerpiece)/i;
const YARN_CRAFTS = new Set<PatternCraft>(["crochet", "knitting"]);
const TOY = /\b(amigurumi|toy|doll|bunny|bear|animal|octopus|dinosaur|plush|teddy|rattle)\b/i;

// Tek lisans metni: PDF'teki lisans sayfası ve ilan aynı cümleyi kullanır.
export function patternLicense(year = new Date().getUTCFullYear()): string {
  return `© ${year} GXL Market Studio. For personal use. You may sell finished items you make by hand in small quantities; please credit "Pattern by GXL Market Studio". Do not copy, share, resell, translate or redistribute this PDF, in whole or in part.`;
}

// "XS-5XL" gibi aralık açık beden listesine çevrilir: ilanda yazan her beden desende de hesaplanır.
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
export function gradedSizes(sizeNote?: string): string[] | undefined {
  const match = (sizeNote || "").toUpperCase().replace(/XXL/g, "2XL").match(/\b(XXS|XS|S|M|L|XL|[2-6]XL)\s*(?:-|TO)\s*(XXS|XS|S|M|L|XL|[2-6]XL)\b/);
  if (!match) return undefined;
  const from = SIZE_ORDER.indexOf(match[1]);
  const to = SIZE_ORDER.indexOf(match[2]);
  return from >= 0 && to > from ? SIZE_ORDER.slice(from, to + 1) : undefined;
}

// Her tekniğin kendi el yazması: tığ/şiş satır sayımı, kanaviçe şeması, nakış şablonu, dikiş kalıbı, makrome ip listesi.
interface CraftManuscript {
  product: (input: PatternPlanInput, sizes?: string[]) => string[];
  plan: string;
  checks: string[];
  manuscript: string[];
  publicDomain: string;
  spec: string;
  never: string;
  included: string[];
  varies: string;
}

const MANUSCRIPTS: Record<PatternCraft, CraftManuscript> = {
  crochet: yarnManuscript("crochet"),
  knitting: yarnManuscript("knitting"),
  cross_stitch: {
    product: () => ["- Fabric: 14-count Aida (also give finished sizes on 16 and 18 count)", "- Threads: DMC stranded cotton, 2 strands for cross stitch and 1 for backstitch (DMC color numbers may be named as plain text)"],
    plan: "PASS 1 - Chart plan: the chart size in stitches (width × height), every color with its DMC number, symbol and stitch count, and the backstitch lines.",
    checks: [
      "- Every chart cell holds exactly one symbol or is empty; every symbol is in the color key and every key entry is used.",
      "- The stitch count per color adds up to the total stitch count.",
      "- Finished size = stitches ÷ fabric count, in inches and centimeters, for 14, 16 and 18 count.",
      "- Floss needed per color in skeins, with a 15% safety margin."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise, finished size on 14-count, stitch count and number of colors",
      "2. At a glance: stitch count, fabric, finished sizes, number of colors, skill level",
      "3. Materials & tools: fabric, DMC floss list with skeins, tapestry needle size, hoop or frame",
      "4. How to read the chart and how to start in the center",
      "5. Color key: symbol, DMC number, color name, skeins",
      "6. Full chart in black-and-white symbols, split into pages with 10×10 grid lines, overlap rows and a page map",
      "7. The same chart in color",
      "8. Backstitch and special stitches guide with diagrams",
      "9. Finishing for this item: framing, hoop display or ornament backing with a hanging loop",
      "10. Troubleshooting table: symptom - likely cause - fix"
    ],
    publicDomain: "Standard stitches (full and half cross stitch, backstitch, French knots) are allowed, but the design, layout and every written sentence must be your own.",
    spec: "name, item, stitch count (W × H), fabric count, finished sizes, colors (DMC number + name + hex), number of stitches per color",
    never: "Never leave a symbol without a key entry.",
    included: ["Black-and-white symbol chart and a color chart", "Color key with DMC floss numbers and skein amounts", "Finished sizes for 14, 16 and 18 count fabric", "Beginner guide to reading the chart"],
    varies: "fabric, floss and colors"
  },
  embroidery: {
    product: () => ["- Fabric: medium-weight cotton or linen in a 6 in or 8 in hoop", "- Threads: DMC stranded cotton; give the number of strands for every area (DMC color numbers may be named as plain text)"],
    plan: "PASS 1 - Stitch plan: every numbered area of the design with its stitch name, floss color (DMC number), number of strands and order of work.",
    checks: [
      "- Every area on the template has a number, a stitch and a color callout, and every callout is in the legend.",
      "- The stitch guide explains every stitch that is used.",
      "- The template prints at 100% scale and has a 1 in / 2.5 cm test square.",
      "- The floss list matches the callouts, with skeins per color."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise, hoop size and finished size",
      "2. At a glance: stitches used, skill level, estimated time",
      "3. Materials & tools: fabric, hoop, DMC floss list with strands and skeins, needles, transfer tool",
      "4. Transfer methods (light box or window, water-soluble stabilizer)",
      "5. Full-size template with a 1 in / 2.5 cm test square",
      "6. Color and stitch map with numbered callouts",
      "7. Stitch guide: numbered steps with a diagram for every stitch",
      "8. Order of work",
      "9. Finishing and framing the hoop",
      "10. Troubleshooting table: symptom - likely cause - fix"
    ],
    publicDomain: "Standard stitches (satin, stem, split, French knot, lazy daisy) are allowed, but the design, layout and every written sentence must be your own.",
    spec: "name, item, hoop size, finished size, colors (DMC number + name + hex), stitch list, numbered areas",
    never: "Never leave an area without a stitch and color callout.",
    included: ["Full-size printable template with a test square", "Color and stitch map with DMC floss numbers", "Step-by-step stitch guide with diagrams", "Transfer and finishing instructions"],
    varies: "fabric, floss and colors"
  },
  punch_needle: {
    product: () => ["- Foundation: monk's cloth on a gripper frame", "- Yarn: worsted or rug yarn; give loop height and yarn amount for every color"],
    plan: "PASS 1 - Color plan: every numbered color area with its yarn color, loop height, punching side and order of work.",
    checks: [
      "- The template is mirrored for punching from the back and is clearly labeled \"back side\".",
      "- The template prints at 100% scale and has a 1 in / 2.5 cm test square.",
      "- Every color area has a number, a yarn color and a loop height, all listed in the legend.",
      "- Yarn amounts per color include a 15% safety margin."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise and finished size",
      "2. At a glance: skill level, finished size, estimated time",
      "3. Materials & tools: foundation fabric, frame, punch needle size, yarn per color with amounts",
      "4. Transferring the mirrored template",
      "5. Full-size mirrored template with a 1 in / 2.5 cm test square",
      "6. Color map with loop heights",
      "7. Step-by-step punching instructions in the order of work",
      "8. Finishing (backing, edging, gluing or sewing)",
      "9. Troubleshooting table: symptom - likely cause - fix"
    ],
    publicDomain: "Standard punch needle techniques (loops, flat stitches, outlining) are allowed, but the design, layout and every written sentence must be your own.",
    spec: "name, item, finished size, colors (name + hex), loop heights, numbered areas",
    never: "Never leave a color area without a loop height.",
    included: ["Full-size mirrored template with a test square", "Color map with loop heights and yarn amounts", "Step-by-step punching instructions", "Finishing guide"],
    varies: "yarn and colors"
  },
  sewing: {
    product: () => ["- Fabric: state the fabric type and yardage for 44/45 in and 58/60 in wide fabric, plus notions", "- Seam allowance: one value used everywhere (for example 1/2 in / 1.3 cm), stated on every pattern piece"],
    plan: "PASS 1 - Piece plan: every pattern piece with its name, cut quantity, fabric, grainline and finished dimensions, then the list of sewing steps.",
    checks: [
      "- Edges that are sewn together have the same length (within 1/8 in), and notches match.",
      "- The cutting layouts fit the stated yardage for both fabric widths.",
      "- Finished dimensions equal the piece dimensions minus the seam allowances.",
      "- Every step names the pieces it joins and the seam allowance."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise, finished size",
      "2. At a glance: skill level, finished size, estimated time",
      "3. Materials: fabric types and yardage for both widths, notions, tools",
      "4. Pattern pieces list and cutting chart",
      "5. Cutting layouts for 44/45 in and 58/60 in fabric",
      "6. Printing the pattern: tiled US Letter and A4 pages with overlap marks, a page-assembly map and a 1 in / 2.5 cm test square, plus an A0 copy-shop file (simple rectangles may be given as dimensions instead)",
      "7. Step-by-step sewing instructions with a diagram for every step",
      "8. Finishing and care",
      "9. Troubleshooting table: symptom - likely cause - fix"
    ],
    publicDomain: "Standard techniques (plain seams, boxed corners, French seams, topstitching) are allowed, but the design, pieces and every written sentence must be your own.",
    spec: "name, item, finished size, fabrics, colors (name + hex), pattern pieces with dimensions, seam allowance",
    never: "Never leave a pattern piece without a label, grainline and cut quantity.",
    included: ["Full-size pattern pieces, tiled for US Letter and A4, plus an A0 copy-shop file", "Cutting chart and cutting layouts with fabric yardage", "Step-by-step illustrated sewing instructions", "Finished measurements"],
    varies: "fabric and colors"
  },
  macrame: {
    product: () => ["- Cord: give the cord type and thickness (for example 4 mm single-strand cotton) and the total length", "- Hanger: wooden dowel or ring size"],
    plan: "PASS 1 - Row plan: every row with the knot used, the cord numbers, the spacing and a measurement from the dowel.",
    checks: [
      "- Every cord's cut length covers the knots it works (state the rule used) plus a 20% safety margin.",
      "- The cord count and the cut lengths are the same in the cutting list, the instructions and the spec.",
      "- Row widths and measurements fit the dowel width.",
      "- Cord numbering stays the same in every diagram."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise, finished size",
      "2. At a glance: skill level, finished size, estimated time",
      "3. Materials & tools: cord type, thickness and total length, dowel or ring, scissors, comb",
      "4. Cutting list: cord numbers and cut lengths",
      "5. Knot guide: numbered steps with a diagram for every knot",
      "6. Row-by-row instructions with cord numbers and measurements",
      "7. Finishing: trimming, brushing the fringe, hanging",
      "8. Troubleshooting table: symptom - likely cause - fix"
    ],
    publicDomain: "Standard knots (square knot, half hitch, lark's head) are allowed, but the design, layout and every written sentence must be your own.",
    spec: "name, item, finished size, cord type and thickness, cord count and cut lengths, colors (name + hex), number of rows",
    never: "Never leave a row without its cord numbers and a measurement.",
    included: ["Cord cutting list with lengths", "Knot guide with diagrams", "Row-by-row instructions with measurements", "Finishing guide"],
    varies: "cord and colors"
  }
};

function yarnManuscript(craft: "crochet" | "knitting"): CraftManuscript {
  const unit = craft === "crochet" ? "round/row" : "row/round";
  return {
    product: (input, sizes) => [
      `- Target size: ${sizes ? `${sizes[0]} to ${sizes[sizes.length - 1]} (${sizes.join(", ")})` : input.sizeNote || "choose a practical standard size and state it in inches and centimeters"}`,
      `- Material: ${input.yarnNote || `${CRAFTS[craft].defaultMaterial}; state the Craft Yarn Council weight number`}`
    ],
    plan: `PASS 1 - Row plan: a table with one line per ${unit}: number, what is worked, stitch count at the end, repeats, color, and a measurable checkpoint.`,
    checks: [
      `- Recount every ${unit}; the stated count must equal the stitches produced by the written instruction.`,
      "- Check that every repeat divides evenly and every \"*...; rep from *\" closes exactly.",
      "- Check that gauge, finished size and yardage per color agree; add a 15% yardage safety margin."
    ],
    manuscript: [
      "1. Cover: name, one-sentence promise, skill level, finished size, \"US terms\" badge",
      "2. At a glance: skill level, construction summary, finished size, estimated time",
      `3. Materials & tools: yarn weight and fiber, yardage and meters per color, ${craft === "crochet" ? "hook" : "needle"} size in mm and US size, notions`,
      "4. Gauge & finished measurements: how to measure and what to do if gauge is off",
      "5. Abbreviations & special techniques with numbered step-by-step explanations",
      "6. Construction overview with a simple labeled schematic",
      `7. Instructions: every ${unit} numbered, the count in parentheses at the end of every ${unit}, color changes stated where they happen, no \"continue as established\" shortcuts`,
      `8. Chart: ${CRAFTS[craft].chart}; it must match the written instructions exactly`,
      "9. Assembly, finishing and blocking with target measurements",
      "10. Troubleshooting table: symptom - likely cause - fix",
      "11. One-page quick reference",
      "12. Care notes"
    ],
    publicDomain: craft === "crochet"
      ? "Common public-domain techniques (picots, shells, granny squares, basic stitches) are allowed, but the overall design, proportions and every written sentence must be your own."
      : "Common public-domain techniques (ribbing, cables, garter and stockinette stitch) are allowed, but the overall design, proportions and every written sentence must be your own.",
    spec: "name, item, finished_size, sizes, colors (name + hex), motif and repeat counts, number of rounds/rows, skill_level",
    never: `Never leave a ${unit} without a count.`,
    included: [`Written instructions with a count at the end of every ${unit}`, "Charts or diagrams that match the written steps", "Materials list, gauge and finished measurements", "Troubleshooting guide and one-page quick reference"],
    varies: "yarn, tension and colors"
  };
}

const TITLE_DISALLOWED = /[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/gu;
const TAG_DISALLOWED = /[^\p{L}\p{Nd}\p{Zs}\-'™©®]/gu;
const MATERIAL_DISALLOWED = /[^\p{L}\p{Nd}\p{Zs}]/gu;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0)!;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

// Başlık düzeni: küçük bağlaçlar küçük kalır ("Coloring Pages for Kids"), marka ve kısaltmalar doğru yazılır (iPad, PDF, ADHD).
const TITLE_SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const TITLE_SPECIAL: Record<string, string> = { ipad: "iPad", iphone: "iPhone", goodnotes: "GoodNotes", pdf: "PDF", adhd: "ADHD", diy: "DIY", svg: "SVG", png: "PNG", jpg: "JPG", usa: "USA", us: "US", uk: "UK", dk: "DK", xs: "XS", xl: "XL" };

export function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").split(" ").map((word, index) => {
    if (!word) return word;
    const lower = word.toLowerCase();
    if (TITLE_SPECIAL[lower]) return TITLE_SPECIAL[lower];
    if (/^\d?x+[sl]$/.test(lower) || /^\d+xl$/.test(lower)) return word.toUpperCase();
    if (index > 0 && TITLE_SMALL.has(lower)) return lower;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

function cleanText(value: unknown, max = 300): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 8, maxLength = 40): string[] {
  const rows = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return rows.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

export function normalizePatternPlanInput(raw: Record<string, unknown>): PatternPlanInput {
  const craft = String(raw.craft || "") as PatternCraft;
  if (!CRAFTS[craft]) throw new Error("PATTERN_CRAFT_INVALID");
  const productType = cleanText(raw.productType, 60).toLowerCase();
  if (productType.length < 3) throw new Error("PATTERN_PRODUCT_REQUIRED");
  const skillLevel = String(raw.skillLevel || "easy") as SkillLevel;
  const repeat = Number(raw.referenceRepeatCount);
  return {
    craft,
    productType,
    referenceNotes: cleanText(raw.referenceNotes, 1000) || undefined,
    referenceRepeatCount: Number.isInteger(repeat) && repeat > 1 && repeat <= 48 ? repeat : undefined,
    referenceColors: cleanList(raw.referenceColors, 6, 30),
    skillLevel: SKILL_LABELS[skillLevel] ? skillLevel : "easy",
    sizeNote: cleanText(raw.sizeNote, 60) || undefined,
    yarnNote: cleanText(raw.yarnNote, 80) || undefined,
    colors: cleanList(raw.colors, 6, 30),
    keyword: cleanText(raw.keyword, 60).toLowerCase() || undefined,
    trendTags: cleanList(raw.trendTags, 20, 40).map((tag) => tag.toLowerCase()),
    seed: cleanText(raw.seed, 60) || undefined,
    referenceSource: raw.referenceSource === "trend" ? "trend" : undefined,
    trendFeatures: cleanList(raw.trendFeatures, 6, 40).map((feature) => feature.toLowerCase())
  };
}

export function craftDefaultMaterial(craft: PatternCraft): string {
  return CRAFTS[craft].defaultMaterial;
}

function coinWord(value: number): string {
  let state = value >>> 0;
  const next = (length: number) => {
    state = (Math.imul(state ^ (state >>> 13), 1103515245) + 12345) >>> 0;
    return state % length;
  };
  const pick = (list: string[]) => list[next(list.length)];
  const lead = next(3) === 0 ? pick(NAME_VOWELS) : "";
  const word = `${lead}${pick(NAME_ONSETS)}${pick(NAME_VOWELS)}${pick(NAME_MIDDLES)}${pick(NAME_ENDINGS)}`;
  return word[0].toUpperCase() + word.slice(1);
}

// Ad: trendden gelen bir özellik veya renk + türetilmiş özgün sözcük + ürün. Daha önce kullanılan adlar atlanır.
const NAME_FUNCTION_WORDS = new Set(["daily", "weekly", "monthly", "yearly", "annual", "undated", "dated", "habit", "tracker", "trackers", "budget", "printable", "digital", "editable", "instant", "download", "bundle", "set", "kit", "page", "pages", "template", "worksheet", "worksheets", "checklist", "schedule", "log", "book", "card", "cards", "game", "games", "pattern", "pdf", "planner", "journal", "insert", "inserts", "tablet", "hyperlinked", "month", "week", "day", "year", "life", "goal", "goals", "mood", "sleep", "meal", "fitness", "beginner", "easy", "free", "chart", "video", "tutorial"]);

// Türetilen sözcük kaba, olumsuz veya tıbbi bir kelimeye ya da gerçek bir İngilizce kelimeye denk gelmemeli
// ("Semen", "Sullen", "Linen" gibi); denk gelirse yeni sözcük türetilir.
const BAD_NAME_PARTS = /(semen|penis|anal|anus|porn|sex|cum|slut|whore|nazi|rape|kill|dead|die|hate|tit|fag|nig|cock|dick|puss|vagin|bitch|damn|hell|shit|fuck|crap|piss|poop|turd|sull|gloom|doom|grim|scab|vomit|ugly|drug|meth|opium|weed|satan|demon|devil|cult|corpse|tumor|cancer|herpes|virus|toxic|venom|panic|manic|lunat|psych|retard|moron|idiot|stupid|dumb|loser|nasty|filth|smut|lewd|nude|naked|bomb|gun|war|blood)/i;
const REAL_WORDS = new Set(["salon", "lemon", "melon", "seven", "women", "linen", "siren", "raven", "haven", "woven", "given", "fallen", "pollen", "stolen", "lumen", "omen", "toxin", "robin", "satin", "cabin", "basin", "resin", "rosin", "tenor", "manor", "minor", "donor", "major", "sonata", "stamina", "retina", "marina", "glamor", "rumor", "humor", "honor", "valor", "color", "molar", "solar", "polar", "lunar", "sugar", "cedar", "radar", "viral", "moral", "coral", "feral", "floral", "mural", "rural", "naval", "fatal", "vital", "total", "penal", "renal", "banal", "canal", "final", "tonal", "zonal", "sinus", "venus", "bonus", "lotus", "famine", "ravine", "marine", "saline", "feline", "canine", "bovine", "sardine", "tennis", "dennis", "lily", "molly", "sally", "silly", "belly", "jelly", "bully", "folly", "tally", "dolly", "gully", "rally", "valley", "galley", "alley", "volley", "nanny", "funny", "bunny", "penny", "sunny", "honey", "money", "doll", "bell", "mall", "pill", "fill"]);
// Ada yalnız renk ve stil girer; hastalık, durum ve etkinlik adları ("ADHD Fona Planner", "Bachelorette ...") ürün adına girmez.
const NAME_BANNED_ACCENTS = new Set(["ipad", "iphone", "android", "tablet", "goodnotes", "notability", "digital", "printable", "hyperlinked", "adhd", "ocd", "autism", "autistic", "anxiety", "depression", "mental", "health", "therapy", "grief", "trauma", "bachelorette", "funeral", "memorial", "sympathy", "cancer", "sobriety", "recovery", "divorce", "pregnancy", "ivf", "fertility", "shadow", "self", "care", "black", "charcoal"]);

function acceptableCoinedWord(word: string): boolean {
  const lower = word.toLowerCase();
  return !BAD_NAME_PARTS.test(lower) && !REAL_WORDS.has(lower);
}

export function coinProductName(input: { productType: string; salt: string; accents?: string[]; avoidNames?: string[] }): string {
  const avoid = new Set((input.avoidNames || []).map((name) => name.toLowerCase()));
  const productWords = new Set(input.productType.toLowerCase().split(/\s+/));
  // Ada yalnız renk/stil gibi tanımlayıcılar girer; "habit tracker", "weekly" gibi arama ifadeleri adı anahtar kelime yığınına çevirir.
  const accents = (input.accents || [])
    .map((value) => value.toLowerCase().trim())
    .filter((value) => /^[a-z][a-z -]{1,15}$/.test(value) && value.split(" ").length <= 2 && !value.split(/[\s-]+/).some((word) => productWords.has(word) || NAME_FUNCTION_WORDS.has(word) || NAME_BANNED_ACCENTS.has(word)));
  const product = titleCase(input.productType);
  let name = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = hash(`${input.salt}|${attempt}`);
    const word = coinWord(value);
    if (!acceptableCoinedWord(word)) continue;
    const accent = accents.length && value % 3 !== 0 ? `${titleCase(accents[value % accents.length])} ` : "";
    name = `${accent}${word} ${product}`;
    if (!avoid.has(name.toLowerCase())) break;
  }
  return name || `Studio ${product}`;
}

export function choosePatternName(input: Pick<PatternPlanInput, "productType" | "referenceNotes" | "craft" | "seed" | "trendFeatures" | "colors" | "avoidNames">): string {
  return coinProductName({
    productType: input.productType,
    salt: `${input.seed || ""}|${input.craft}|${input.productType}|${input.referenceNotes || ""}`,
    accents: [...(input.trendFeatures || []), ...(input.colors || [])],
    avoidNames: input.avoidNames
  });
}

function alternativeRepeat(reference: number): number {
  const options = [6, 8, 10, 12, 14, 16, 18, 20, 24].filter((value) => Math.abs(value - reference) >= 2);
  return options.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference) || b - a)[0];
}

function trendOriginalityRules(input: PatternPlanInput): { tr: string[]; en: string[] } {
  const product = input.productType;
  const kept = patternThemes({ features: input.trendFeatures, keyword: input.keyword, productType: input.productType }).kept.map(proseCase);
  const features = kept.length <= 1 ? kept.join("") : `${kept.slice(0, -1).join(", ")} and ${kept[kept.length - 1]}`;
  const tr = [
    `Tek bir model kopyalanmadı; trend özellikleri${features ? ` (${features})` : ""} özgün bir tasarımda birleştirilecek.`,
    "Tasarıma üst sıradaki ilanlarda olmayan imza bir ayrıntı (motif, yapım hilesi veya bitiş) eklenecek.",
    input.colors?.length ? `Renk paleti: ${input.colors.join(", ")}.` : "Renk paletini yapay zekâ özgün olarak önerecek."
  ];
  const en = [
    `Build ${features ? `the buyer-favored features (${features})` : "what these buyers want"} into one coherent design with a single theme, your own proportions, layout and construction order.`,
    "Add one signature detail that the top-ranking listings do not have (a motif, a construction trick or a finishing detail) and name it in the cover promise.",
    input.colors?.length ? `Use this palette: ${input.colors.join(", ")}.` : "Propose a fresh 3-color palette with color names and hex codes."
  ];
  if (CIRCULAR.test(product)) {
    tr.push("Tekrar sayısı tasarıma göre seçilip her tur yeniden hesaplanacak.");
    en.push("Choose the radial repeat count that best suits the design and recalculate every round for it.");
  }
  if (WEARABLE.test(product)) {
    tr.push("En az 3 beden kendi ölçü tablosuna göre hesaplanacak.");
    en.push("Grade at least 3 sizes from your own size chart.");
  }
  tr.push("Hiçbir yayımlanmış desenin yazısı, şeması, fotoğrafı, sayfa düzeni veya adı kullanılmayacak; başka satıcının görseli referans olarak bile kullanılmayacak.");
  en.push("Do not reproduce any text, chart, photo, diagram, page layout, or name from any published pattern or listing, and never use another seller's listing photos or any copyrighted image as a reference.");
  return { tr, en };
}

function originalityRules(input: PatternPlanInput): { tr: string[]; en: string[] } {
  if (input.referenceSource === "trend") return trendOriginalityRules(input);
  const tr: string[] = [];
  const en: string[] = [];
  const product = input.productType;
  if (CIRCULAR.test(product) && input.referenceRepeatCount) {
    const target = alternativeRepeat(input.referenceRepeatCount);
    tr.push(`Tekrar sayısı referanstaki ${input.referenceRepeatCount} yerine ${target} olacak.`);
    en.push(`Use exactly ${target} radial repeats (the reference uses ${input.referenceRepeatCount}); recalculate every round for ${target} repeats.`);
  } else if (CIRCULAR.test(product)) {
    tr.push("Referanstaki tekrar sayısından farklı bir tekrar sayısı seçilecek.");
    en.push("Choose a radial repeat count that differs from the reference by at least 2 and recalculate every round for it.");
  }
  tr.push("Ana motifin şekli ve yapım tekniği değişecek (ör. yaprak → farklı yaprak/çiçek türü, ayrı motif → birleştirerek ilerleme).");
  en.push("Replace the main motif with a different shape and a different construction technique (for example separate motifs vs. join-as-you-go).");
  tr.push("Kenar bitişi tamamen farklı bir teknikle yapılacak.");
  en.push("Design a different edging/finishing technique from the reference.");
  const referenceColors = input.referenceColors?.length ? ` (referans: ${input.referenceColors.join(", ")})` : "";
  tr.push(`Renk paleti yeni olacak${referenceColors}.`);
  en.push(input.colors?.length ? `Use this palette: ${input.colors.join(", ")}.` : `Propose a fresh 3-color palette with color names and hex codes${input.referenceColors?.length ? ` that does not reuse ${input.referenceColors.join(", ")}` : ""}.`);
  if (WEARABLE.test(product)) {
    tr.push("Beden aralığı en az 3 bedene göre yeniden hesaplanacak; dokuma/örgü dokusu farklı olacak.");
    en.push("Use a different stitch texture and a different construction order from the reference, and grade at least 3 sizes from your own measurements.");
  }
  tr.push("Referansın yazısı, fotoğrafı, şeması, sayfa düzeni ve adı kesinlikle kullanılmayacak.");
  en.push("Do not reproduce any text, chart, photo, diagram, page layout, or name from the reference or from any other published pattern.");
  return { tr, en };
}

function buildPatternPrompt(input: PatternPlanInput, name: string, rules: string[]): string {
  const craft = CRAFTS[input.craft];
  const manuscript = MANUSCRIPTS[input.craft];
  const skill = SKILL_LABELS[input.skillLevel || "easy"].en;
  const yarn = YARN_CRAFTS.has(input.craft);
  const wearable = yarn && WEARABLE.test(input.productType);
  const circular = yarn && CIRCULAR.test(input.productType);
  const sizes = wearable ? gradedSizes(input.sizeNote) : undefined;
  const toy = TOY.test(input.productType);
  const lines = [
    `You are a senior ${craft.label.toLowerCase()} pattern designer and a meticulous technical editor. Design an ORIGINAL, sellable digital ${craft.label.toLowerCase()} pattern and produce a print-ready PDF manuscript.`,
    "",
    "## Pattern name",
    `${name}. Use this exact name everywhere and do not change it: the Etsy listing and images already use it.`,
    "",
    "## Product",
    `- Item: ${input.productType}`,
    `- Skill level: ${skill}`,
    ...(yarn ? manuscript.product(input, sizes) : [`- Target size: ${input.sizeNote || "choose a practical standard size and state it in inches and centimeters"}`, ...manuscript.product(input, sizes)]),
    `- Colors: ${input.colors?.length ? input.colors.join(", ") : "propose a 3-color palette with names and hex codes"}`,
    `- Terminology: ${craft.terms}. Give every measurement in inches and centimeters.`,
    "",
    ...(input.referenceSource === "trend" ? [
      "## Market brief (Etsy research)",
      cleanBriefNotes(input.referenceNotes, patternThemes({ features: input.trendFeatures, keyword: input.keyword, productType: input.productType }).dropped) || `Buyers are searching Etsy for "${input.keyword || input.productType}".`,
      "There is no single reference model. Design for what these buyers want, in your own original way.",
      "",
      "## Originality rules (mandatory)"
    ] : [
      "## Originality rules (mandatory)",
      `The shop owner liked a reference design${input.referenceNotes ? `: "${input.referenceNotes}"` : ""}. Use it only as a mood reference. Your design must be clearly different:`
    ]),
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    manuscript.publicDomain,
    "",
    "## Work in three passes",
    manuscript.plan,
    "PASS 2 - Technical edit (do it carefully, then report the result):",
    ...manuscript.checks,
    ...(circular ? ["- For a flat circular piece, check that each round adds enough stitches/chain length to lie flat; fix any round that would cup or ruffle and explain the fix."] : []),
    ...(wearable ? [sizes
      ? `- Grade every listed size (${sizes.join(", ")}) from a size chart; give every count per size as "${sizes.map((_, index) => 30 + index * 4).join(", ").replace(/^(\d+), /, "$1 (")})" and check each size separately.`
      : "- Grade at least 3 sizes from a size chart; give every count per size as \"30 (34, 38)\" and check each size separately."] : []),
    "- Mark anything that can only be confirmed by physically making the item as [TEST-MAKE CHECK].",
    "PASS 3 - Final manuscript in this exact order:",
    ...manuscript.manuscript,
    ...(toy ? [`${manuscript.manuscript.length + 1}. Safety: for babies and children under 3, use embroidered eyes instead of safety eyes, stuff firmly and secure every part; add this note to the cover page too`] : []),
    `${manuscript.manuscript.length + (toy ? 2 : 1)}. License page: "${patternLicense()}"`,
    `Footer on every page except the cover: "${name} · © GXL Market Studio · page N"`,
    "",
    "## Output format",
    "- Deliver the final manuscript as one print-ready HTML document (US Letter with 0.75 in margins so it also prints cleanly on A4, 11 pt body text, high contrast, clear headings) with inline SVG diagrams, ready to save as PDF without edits. If you can create files, also export it as a PDF.",
    `- The "Design spec" JSON (${manuscript.spec}) comes first, in step 1 of the package, and again, updated, after the manuscript. The product renders are made from it, so it must match the pattern exactly.`,
    "- Finally list every [TEST-MAKE CHECK] item.",
    "",
    "## Never",
    "- Never claim the pattern was tested, never invent reviews, awards or sales numbers.",
    "- Never use another designer's name, brand or trademark; material brands (for example DMC floss numbers) may appear only as plain text.",
    "- Never use another seller's listing photos or any copyrighted image as a reference.",
    `- ${manuscript.never}`
  ];
  return lines.join("\n");
}

function lifestyleScene(product: string): string {
  if (/wall hanging|plant hanger|hoop art/i.test(product)) return "hanging on a white wall above a small console with a plant";
  if (CIRCULAR.test(product)) return "on a light oak side table under a small ceramic vase with dried flowers";
  if (WEARABLE.test(product)) return "folded neatly on a cream wool throw beside a window, no people";
  if (/bag|tote|purse/i.test(product)) return "hanging from a wooden chair back in a bright room";
  if (/amigurumi|toy|doll|animal/i.test(product)) return "sitting on a white bookshelf next to a stack of linen books";
  return "styled in a calm, bright home setting with natural materials";
}

function buildRenderPrompt(input: PatternPlanInput, name: string): string {
  const craft = CRAFTS[input.craft];
  const material = input.yarnNote || craft.defaultMaterial;
  return [
    `Photorealistic product photo of a handmade ${craft.label.toLowerCase()} ${input.productType} called "${name}", made from ${material}.`,
    "It must match this design spec exactly (paste the Design spec JSON from the finished pattern here): <DESIGN SPEC JSON>.",
    "Show exactly the colors, proportions, motif counts and details in the spec; do not add or remove motifs, petals, leaves, rounds or pieces.",
    `Real ${YARN_CRAFTS.has(input.craft) || input.craft === "punch_needle" ? "fiber" : input.craft === "sewing" ? "fabric" : input.craft === "macrame" ? "cord" : "thread"} texture with individually visible ${input.craft === "sewing" ? "seams and topstitching" : input.craft === "macrame" ? "knots" : `${craft.label.toLowerCase()} stitches`}, slight natural irregularity, no plastic or CGI look.`,
    "Main image: flat lay, centered, the item fills about 70% of the frame, on light natural linen, soft diffused daylight from the upper left, gentle shadow, portrait (make it at the image tool's native portrait size, then crop to 4:5 in code).",
    "Also create, one per reply: (1) a macro close-up showing the stitch or knot structure, (2) a lifestyle image " + lifestyleScene(input.productType) + ", (3) a size reference image next to a ruler.",
    "No text, no watermark, no logo, no hands, nothing covering the item."
  ].join("\n");
}

const PHOTO_PLAN = [
  { title: "Kapak", detail: "Gerçek örülmüş ürün fotoğrafı. Yoksa render kullan ve köşesine küçük 'Digital render' yaz. Ürün ortada, açık arka plan, 4:5 veya kare." },
  { title: "Yakın çekim", detail: "Bir tekrarın ilmek dokusu net görünsün." },
  { title: "Ölçü", detail: "Cetvel veya el yanında gerçek boyut; cm ve inç yazılı." },
  { title: "Neler var?", detail: "Sayfa sayısı, US terimleri, şema, adım adım anlatım, sorun giderme listesini gösteren kart." },
  { title: "PDF önizleme", detail: "2-3 iç sayfanın düzenli görüntüsü; talimat metni okunamayacak kadar küçük veya bulanık." },
  { title: "Malzeme", detail: "İplik/kumaş, tığ/şiş/iğne ölçüsü ve metraj kartı." },
  { title: "Zorluk ve süre", detail: "Seviye, tahmini süre ve gereken temel teknikler." },
  { title: "Renk seçenekleri", detail: "Aynı desenin 2-3 farklı renk uyarlaması." },
  { title: "Yaşam alanı", detail: "Ürün ev ortamında; alıcının hayal kurmasını sağlar." },
  { title: "Anında indirme", detail: "Ödeme sonrası Etsy'nin indirme adımlarını anlatan sade kart." }
];

export function buildPatternBrief(input: PatternPlanInput): PatternBrief {
  const name = choosePatternName(input);
  const rules = originalityRules(input);
  const patternPrompt = buildPatternPrompt(input, name, rules.en);
  const renderPrompt = buildRenderPrompt(input, name);
  const adVisuals = buildAdVisuals({ craft: input.craft, productType: input.productType, name, colors: input.colors, features: input.trendFeatures, formats: input.sizeNote ? [input.sizeNote] : undefined, seed: input.seed });
  return {
    name,
    originalityPlan: rules.tr,
    patternPrompt,
    renderPrompt,
    photoPlan: PHOTO_PLAN.map((item, index) => ({ slot: index + 1, ...item })),
    adVisuals,
    masterPrompt: buildMasterPrompt({
      name,
      productLabel: `${CRAFTS[input.craft].label.toLowerCase()} ${input.productType} pattern`,
      specName: "Design spec",
      filesBrief: patternPrompt,
      renderPrompt,
      adVisuals,
      qa: qaProtocol({ type: "pattern", name, craft: input.craft, terms: CRAFTS[input.craft].terms, unit: CRAFTS[input.craft].unit, sizes: (YARN_CRAFTS.has(input.craft) && WEARABLE.test(input.productType) ? gradedSizes(input.sizeNote)?.join(", ") : undefined) || input.sizeNote }),
      checklist: [
        YARN_CRAFTS.has(input.craft) ? "Every stitch count adds up row by row; every [TEST-MAKE CHECK] item is listed for the maker to confirm." : "Every chart, template, piece or cord list matches the spec; every [TEST-MAKE CHECK] item is listed for the maker to confirm.",
        "Renders show exactly the motif counts, repeats and colors of the Design spec.",
        "No text, photo, chart or name from any reference product appears in the pattern or listing, and no other seller's image was used as a reference.",
        "Every PDF page except the cover has the copyright footer, and the last page has the license text.",
        YARN_CRAFTS.has(input.craft) ? "US terms are used and a stitch abbreviation table is included." : `The terminology follows ${CRAFTS[input.craft].terms}.`,
        "No brand, character or celebrity names."
      ]
    }),
    qualityGate: [
      "Deseni satışa açmadan önce en az bir kez bizzat ör/yap ya da test ördür; sayıları, metrajı ve ölçüyü buna göre düzelt.",
      "Paketin 'Automated QA' çıktısını iste ve oku: ilmek hesabı tablosunda hesaplanan ve yazılan sayılar her sırada eşit olmalı, sıra numaralarında boşluk/tekrar olmamalı, kısaltma tablosu eksiksiz olmalı.",
      "Ana fotoğraf mümkünse gerçek üründen olsun. Render kullanılıyorsa görselde 'Digital render' yazsın; ilan açıklaması bunu otomatik belirtir.",
      "Yapay zekâ desteği kullandıysan Etsy formunda yapay zekâ kutusunu işaretle ve 'Designed by' seçeneğini kullan.",
      "Render, PDF'teki Design spec ile birebir aynı sayıda motif ve aynı renkleri göstermeli; farklıysa yeniden üret.",
      "Referans modelin yazısı, fotoğrafı, şeması veya adı PDF'te ve ilanda bulunmamalı.",
      "PDF'in kapak dışındaki her sayfasında telif altbilgisi ve son sayfada lisans metni olmalı.",
      "Gerçek ürün varsa ilana 5-15 saniyelik döndürme videosu ekle; öne çıkan desen mağazaları bunu kullanıyor.",
      "Prompt çıktısındaki tüm [TEST-MAKE CHECK] maddeleri kapatılmadan PDF yüklenmemeli."
    ]
  };
}

function enforceOnce(value: string, characters: string[]): string {
  let result = value;
  for (const character of characters) {
    let seen = false;
    result = [...result].filter((item) => {
      if (item !== character) return true;
      if (seen) return false;
      seen = true;
      return true;
    }).join("");
  }
  return result;
}

export function normalizeEtsyTitle(value: string): string {
  let title = value.replace(TITLE_DISALLOWED, "").replace(/\s+/g, " ").trim();
  title = enforceOnce(title, ["%", ":", "&", "+"]).replace(/\s+/g, " ").trim();
  if (title.length > 140) title = title.slice(0, 140).replace(/[\s,|-]+\S*$/, "").trim();
  return title.replace(/[\s,|-]+$/, "");
}

export function normalizeEtsyTags(values: string[], limit = 13): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values) {
    const tag = raw.replace(TAG_DISALLOWED, " ").replace(/\s+/g, " ").trim().toLowerCase();
    // Etsy kelime sırasına ve tekil/çoğula bakmaz: "planner printable" ile "printable planner", "recipe card" ile
    // "recipe cards" aynı aramayı karşılar; ikincisi etiket hakkını boşa harcar.
    const key = tag.split(" ").map((word) => word.length > 3 && word.endsWith("s") && !/(ss|us|is|mas)$/.test(word) ? word.slice(0, -1) : word).sort().join(" ");
    // "adult" tek başına yetişkin içerik aramalarına düşer; yalnız boyama bağlamında kullanılır.
    if (/\badults?\b/.test(tag) && !/\bcolou?ring\b/.test(tag)) continue;
    if (!tag || tag.length > 20 || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === limit) break;
  }
  return tags;
}

export function validateEtsyListingText(listing: { title: string; tags: string[]; materials?: string[] }) {
  const issues: string[] = [];
  if (!listing.title) issues.push("Başlık boş.");
  if (listing.title.length > 140) issues.push("Başlık 140 karakteri aşıyor.");
  if (/[^\p{L}\p{Nd}\p{P}\p{Sm}\p{Zs}™©®]/u.test(listing.title)) issues.push("Başlıkta Etsy'nin kabul etmediği karakter var.");
  for (const character of ["%", ":", "&", "+"]) {
    if (listing.title.split(character).length > 2) issues.push(`Başlıkta '${character}' en fazla bir kez kullanılabilir.`);
  }
  if (listing.tags.length !== 13) issues.push(`Etsy 13 etiket kullanmaya izin verir; şu an ${listing.tags.length} etiket var.`);
  const lower = listing.tags.map((tag) => tag.toLowerCase());
  if (new Set(lower).size !== lower.length) issues.push("Tekrarlanan etiket var.");
  for (const tag of listing.tags) {
    if (tag.length > 20) issues.push(`'${tag}' etiketi 20 karakteri aşıyor.`);
    if (/[^\p{L}\p{Nd}\p{Zs}\-'™©®]/u.test(tag)) issues.push(`'${tag}' etiketinde geçersiz karakter var.`);
  }
  for (const material of listing.materials || []) {
    if (/[^\p{L}\p{Nd}\p{Zs}]/u.test(material)) issues.push(`'${material}' malzemesinde geçersiz karakter var.`);
  }
  return { ok: issues.length === 0, issues, titleLength: listing.title.length, tagCount: listing.tags.length };
}

function primaryPhrase(input: DigitalListingInput): string {
  const craft = CRAFTS[input.craft];
  const productHead = input.productType.toLowerCase().split(/\s+/).at(-1)!.replace(/s$/, "");
  if (input.keyword && /pattern/i.test(input.keyword) && input.keyword.toLowerCase().includes(productHead)) return titleCase(input.keyword.replace(/\bpdf\b/gi, "").replace(/\s+/g, " ").trim());
  // Aramada ürün adı yoksa ("cross stitch pattern") alıcının yazdığı tam ürün ifadesi öne çıkar: "Christmas Ornament".
  const craftWords = new Set([...craft.tag.split(" "), ...craft.short.split(" "), craft.label.toLowerCase()]);
  const fuller = relevantTrendTags(input).find((tag) => tag.endsWith(input.productType.toLowerCase()) && tag !== input.productType.toLowerCase() && tag.split(" ").length <= input.productType.split(" ").length + 2 && !tag.split(" ").some((word) => craftWords.has(word)));
  const product = titleCase(fuller || input.productType);
  return craft.order === "craft-first" ? `${craft.label} ${product} Pattern` : `${product} ${craft.label} Pattern`;
}

// Başlıkta desen adı ürün kelimesi olmadan yazılır ("Cobalt Wullery Cardigan" → "Cobalt Wullery"); ürün zaten başta geçiyor.
function shortName(input: DigitalListingInput): string {
  const productWords = new Set(input.productType.toLowerCase().split(/\s+/));
  const words = input.name.split(/\s+/).filter((word) => !productWords.has(word.toLowerCase()));
  return words.length ? words.join(" ") : input.name;
}

// Her tekniğin alıcı ifadeleri: trend ve ürün etiketleri 13'ü doldurmazsa bunlarla tamamlanır (hepsi ürüne uyar).
const CRAFT_TAG_STEMS: Record<PatternCraft, string[]> = {
  crochet: ["crochet tutorial", "crochet design", "diy crochet", "crochet pdf"],
  knitting: ["knitting tutorial", "knit design", "diy knitting", "knitting pdf"],
  cross_stitch: ["cross stitch chart", "counted cross stitch", "cross stitch design", "modern cross stitch", "cross stitch pdf", "dmc cross stitch"],
  embroidery: ["hand embroidery", "embroidery design", "embroidery template", "hoop art pattern", "stitch guide", "embroidery pdf", "diy embroidery"],
  punch_needle: ["punch needle design", "punch needle pdf", "punch needle art", "diy punch needle"],
  sewing: ["sewing pdf", "sewing project", "diy sewing", "sewing tutorial"],
  macrame: ["macrame tutorial", "macrame decor", "diy macrame", "macrame knots"]
};
const COMPOUND_HEADS = new Set(["art", "rug", "hanging", "hanger", "square", "runner", "board", "ring", "ball", "cozy"]);
const GENERIC_TAGS = new Set(["instant download", "digital download", "printable pattern", "digital pattern", "pdf pattern", "pattern pdf"]);
const TAG_FILLERS = new Set(["for", "and", "the", "of", "with", "to", "in", "a"]);
const SKILL_WORDS = new Set(["beginner", "beginners", "easy", "simple", "intermediate", "advanced", "quick"]);

const singularWord = (word: string) => word.length > 3 && word.endsWith("s") && !/(ss|us|is|mas)$/.test(word) ? word.slice(0, -1) : word;

// Desende tek tema: özellikler birbiriyle çatışmaz, trend etiketi temaya uyar ve yalnız desenin gerçekten
// içerdiği kelimelerden (ürün, teknik, özellik, malzeme, ölçü, seviye, renk) kurulur.
function patternThemes(input: Pick<DigitalListingInput, "features" | "keyword" | "productType">) {
  const usable = [...new Set((input.features || []).map((feature) => feature.toLowerCase()))].filter((feature) => !MISLEADING_FEATURE.test(feature) && !isIpRisky(feature));
  return harmonizeThemes(usable, themeFamilies(`${input.keyword || ""} ${input.productType}`));
}

function relevantTrendTags(input: DigitalListingInput): string[] {
  const craft = CRAFTS[input.craft];
  const { kept: features, families } = patternThemes(input);
  const vocabulary = new Set([
    ...input.productType.toLowerCase().split(/\s+/),
    ...(input.keyword || "").toLowerCase().split(/\s+/),
    ...craft.tag.split(" "), ...craft.short.split(" "), craft.label.toLowerCase(),
    ...features.flatMap((feature) => feature.split(/\s+/)),
    ...(input.yarnNote || craft.defaultMaterial).toLowerCase().split(/[^a-z]+/),
    ...(input.sizeNote || "").toLowerCase().split(/[^a-z0-9-]+/),
    ...(input.colors || []).flatMap((color) => color.toLowerCase().split(/\s+/)),
    ...SKILL_WORDS, "pattern", "patterns", "pdf", "diy", "tutorial", "instant", "download", "digital", "printable", "us", "terms", "plus", "size"
  ].filter(Boolean).flatMap((word) => [word, singularWord(word)]));
  const productWords = input.productType.toLowerCase().split(/\s+/);
  const lastWord = productWords.at(-1) || input.productType;
  const craftWords = new Set([...craft.tag.split(" "), ...craft.short.split(" "), "pattern", "patterns", "pdf"]);
  const topical = new Set([...productWords, singularWord(lastWord), ...features.flatMap((feature) => feature.split(/\s+/))].filter((word) => !craftWords.has(word)));
  const relevant = (input.trendTags || []).filter((tag) => {
    const words = tag.toLowerCase().split(/\s+/);
    return !GENERIC_TAGS.has(tag) && !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, families)
      && words.some((word) => topical.has(word) || topical.has(singularWord(word)))
      && words.every((word) => TAG_FILLERS.has(word) || vocabulary.has(word) || vocabulary.has(singularWord(word)));
  });
  // Bu seferki trend özelliklerini içeren ifadeler öne alınır; böylece her desenin başlığı ve etiket sırası farklı olur.
  const featureRank = (tag: string) => { const index = features.findIndex((feature) => tag.includes(feature)); return index === -1 ? features.length : index; };
  return relevant.map((tag, index) => ({ tag, index })).sort((a, b) => featureRank(a.tag) - featureRank(b.tag) || a.index - b.index).map((item) => item.tag);
}

// Başlık sabit dolgu ifadeleriyle değil, trendde alıcıların kullandığı ifadelerle uzar.
// "US Terms" ve "Instant Download" yalnızca trend verisinde geçiyorsa (veya trend verisi yoksa) eklenir.
function buildTitle(input: DigitalListingInput, primary?: string): string {
  const skill = SKILL_LABELS[input.skillLevel || "easy"];
  const lead = `${primary || primaryPhrase(input)} PDF`;
  const trend = input.trendTags || [];
  const inTrend = (phrase: string) => !trend.length || trend.some((tag) => tag.includes(phrase));
  // Hiçbir kelime başlıkta ikiden fazla geçmez (Etsy ve alıcı bunu anahtar kelime yığını olarak görür):
  // ürün adı zaten iki kez geçtiyse trend ifadesinden çıkarılır ("Granny Square Cardigan" → "Granny Square").
  const counts = new Map<string, number>();
  const count = (phrase: string) => (phrase.toLowerCase().match(/[a-z0-9']+/g) || []).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  const name = shortName(input);
  count(lead);
  count(name);
  const trendPhrases: string[] = [];
  for (const tag of relevantTrendTags(input)) {
    let words = tag.split(/\s+/);
    if (words.every((word) => counts.has(word))) continue;
    words = words.filter((word) => !(word.length >= 3 && (counts.get(word) || 0) >= 2));
    // Kırpılınca tek sıfat kalan ifade ("Vintage") başlığa girmez.
    if (words.length < 2 || words.every((word) => counts.has(word) || TAG_FILLERS.has(word))) continue;
    count(words.join(" "));
    trendPhrases.push(titleCase(words.join(" ")));
    if (trendPhrases.length === 2) break;
  }
  const segments = [
    lead,
    name,
    ...trendPhrases,
    ...(input.sizeNote && input.sizeNote.length <= 28 ? [input.sizeNote] : []),
    ...(inTrend(skill.tag) || inTrend(skill.en.toLowerCase()) ? [skill.title] : []),
    ...(inTrend("us terms") ? ["US Terms"] : []),
    ...(inTrend("instant download") ? ["Instant Download"] : [])
  ];
  let title = "";
  for (const segment of segments) {
    const next = title ? `${title}, ${segment}` : segment;
    if (next.length > 140) break;
    title = next;
  }
  return normalizeEtsyTitle(proseCase(title));
}

// Etiketler önce trendin alıcı ifadelerinden gelir; ürün ifadeleri ve genel ifadeler yalnızca 13'ü tamamlamak için kullanılır.
function buildTags(input: DigitalListingInput): string[] {
  const craft = CRAFTS[input.craft];
  const product = input.productType.toLowerCase();
  const productWords = product.split(/\s+/);
  // "hoop art", "wall hanging", "granny square" bölünmez: "art pattern", "hanging pattern" anlamsızdır.
  const lastWord = productWords.length > 1 && COMPOUND_HEADS.has(productWords.at(-1)!) ? product : productWords.at(-1) || product;
  const skillWord = SKILL_LABELS[input.skillLevel || "easy"].tag;
  const skillTags = input.skillLevel === "easy" || !input.skillLevel ? [`easy ${craft.short} pattern`] : [`${skillWord} ${craft.tag}`, `${skillWord} ${craft.short}`];
  const colorTags = (input.colors || []).slice(0, 2).map((color) => `${color.toLowerCase()} ${lastWord}`);
  const { kept: features, families } = patternThemes(input);
  const featureTags = features.map((feature) => `${feature} ${lastWord}`);
  return normalizeEtsyTags([
    ...(input.keyword ? [input.keyword] : []),
    ...relevantTrendTags(input),
    ...featureTags,
    ...(productWords.length > 1 ? [product] : []),
    `${product} pattern`,
    `${craft.short} ${product}`,
    `${craft.tag} ${product}`,
    `${lastWord} pattern`,
    // "sewing bag" dikiş malzemesi çantası gibi okunur; dikişte teknik + ürün etiketi kullanılmaz.
    ...(input.craft !== "sewing" ? [`${craft.short} ${lastWord}`] : []),
    `${product} pattern pdf`,
    `${lastWord} pattern pdf`,
    `${craft.tag} pattern`,
    ...skillTags,
    `${craft.tag} pattern pdf`,
    `${craft.short} ${lastWord} pdf`,
    `diy ${product}`,
    `${lastWord} tutorial`,
    ...colorTags,
    ...(CIRCULAR.test(product) ? [`${craft.short} home decor`] : WEARABLE.test(product) ? [`${craft.short} gift pattern`] : []),
    "printable pattern",
    `gift for ${craft.fan}`,
    `${craft.tag} gift idea`,
    ...CRAFT_TAG_STEMS[input.craft],
    "digital pattern",
    "instant download"
  ].filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, families)));
}

function buildMaterials(input: DigitalListingInput): string[] {
  const craft = CRAFTS[input.craft];
  return [input.yarnNote || craft.defaultMaterial, craft.tool]
    .map((value) => value.replace(MATERIAL_DISALLOWED, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 45))
    .filter(Boolean);
}

function buildDescription(input: DigitalListingInput, hook?: string): string {
  const craft = CRAFTS[input.craft];
  const skill = SKILL_LABELS[input.skillLevel || "easy"].en;
  const product = input.productType.toLowerCase();
  const pages = input.pageCount && input.pageCount > 0 ? `${input.pageCount}-page ` : "";
  const manuscript = MANUSCRIPTS[input.craft];
  const notes = [
    ...(input.photosAreRenders !== false ? [`The listing photos are digital renders of the design, not photos of a finished piece. Your finished piece will vary with your ${manuscript.varies}.`] : []),
    ...(input.aiAssisted !== false ? [`Designed with the help of AI tools; the counts and measurements were checked with an automated script${input.testMade ? " and the pattern was test-made before release" : ""}.`] : []),
    ...(TOY.test(input.productType) ? ["For babies and children under 3, use embroidered eyes instead of safety eyes and secure every part."] : []),
    "This is a digital file. Because files cannot be returned, all sales are final, but please message us with any question about the pattern and we will help."
  ];
  const features = patternThemes(input).kept;
  return [
    hook ? `${input.name}: ${hook}` : `${input.name} is an original ${craft.order === "craft-first" ? `${craft.label.toLowerCase()} ${product}` : `${product} ${craft.label.toLowerCase()}`} pattern with clear, step-by-step instructions.`,
    "",
    `THIS IS A DIGITAL PDF PATTERN, NOT A FINISHED ${product.toUpperCase()}.`,
    "",
    ...(features.length ? [`HIGHLIGHTS: ${features.slice(0, 4).map((feature) => titleCase(proseCase(feature))).join(" · ")}`, ""] : []),
    "WHAT YOU GET",
    `• ${pages}PDF pattern in US English using ${craft.terms}`,
    ...manuscript.included.map((item) => `• ${item}`),
    "",
    `SKILL LEVEL: ${skill}`,
    ...(input.sizeNote ? [`${gradedSizes(input.sizeNote) && YARN_CRAFTS.has(input.craft) && WEARABLE.test(product) ? `SIZES: ${gradedSizes(input.sizeNote)!.join(", ")}` : `FINISHED SIZE: ${input.sizeNote}`}`] : []),
    `MATERIALS: ${input.yarnNote || craft.defaultMaterial}, ${craft.tool}`,
    ...(input.colors?.length ? [`COLORS SHOWN: ${input.colors.join(", ")}`] : []),
    "",
    "INSTANT DOWNLOAD",
    "After payment Etsy gives you the download link right away. You can also find it later under Purchases and reviews on Etsy.",
    "",
    "PLEASE NOTE",
    ...notes.map((note) => `• ${note}`),
    "",
    "COPYRIGHT",
    patternLicense()
  ].join("\n");
}

export function normalizeDigitalListingInput(raw: Record<string, unknown>): DigitalListingInput {
  const base = normalizePatternPlanInput(raw);
  const name = cleanText(raw.name, 80) || choosePatternName(base);
  const pageCount = Number(raw.pageCount);
  return {
    name,
    craft: base.craft,
    productType: base.productType,
    skillLevel: base.skillLevel,
    sizeNote: base.sizeNote,
    yarnNote: base.yarnNote,
    colors: base.colors,
    keyword: base.keyword,
    trendTags: base.trendTags,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 && pageCount < 500 ? pageCount : undefined,
    features: cleanList(raw.features ?? raw.trendFeatures, 6, 80),
    aiAssisted: raw.aiAssisted !== false,
    photosAreRenders: raw.photosAreRenders !== false,
    testMade: raw.testMade === true
  };
}

function listingWarnings(input: DigitalListingInput): string[] {
  return [
    ...(!input.testMade ? ["Desen henüz test edilmedi. Etsy'de en sık kötü yorum, çalışmayan veya fotoğrafla uyuşmayan desenler için geliyor; satıştan önce bir kez ör veya test ördür."] : []),
    ...(input.photosAreRenders !== false ? ["Görseller render. Kapak görseline 'Digital render' yaz; mümkünse gerçek ürün fotoğrafıyla değiştir."] : []),
    ...(input.aiAssisted !== false ? ["Etsy ilan formunda yapay zekâ kullanımı kutusunu işaretle; açıklamaya bildirim eklendi."] : [])
  ];
}

export function buildDigitalListing(input: DigitalListingInput): DigitalListingDraft {
  const title = buildTitle(input);
  const tags = buildTags(input);
  const materials = buildMaterials(input);
  return {
    title,
    description: buildDescription(input),
    tags,
    materials,
    etsy: { type: "download", who_made: "i_did", when_made: "2020_2026", is_supply: true, quantity: 999 },
    checks: validateEtsyListingText({ title, tags, materials }),
    warnings: listingWarnings(input),
    source: "rules"
  };
}

interface AiListingSuggestion {
  hook: string;
  primaryPhrase: string;
  tags: string[];
}

export async function createDigitalListing(input: DigitalListingInput, env: AiRuntimeEnv): Promise<DigitalListingDraft> {
  const draft = buildDigitalListing(input);
  if (!hasAiProvider(env)) return draft;
  try {
    const suggestion = await generateStructuredObject<AiListingSuggestion>({
      schemaName: "gxl_etsy_pattern_listing",
      prompt: `You are an Etsy SEO specialist for digital craft patterns. Write for buyers searching Etsy in the US.\nPattern: ${JSON.stringify({ name: input.name, craft: input.craft, item: input.productType, skill: input.skillLevel, size: input.sizeNote, material: input.yarnNote, colors: input.colors, trendFeatures: input.features })}\nTags that currently appear on top-ranking Etsy listings for this search: ${JSON.stringify(input.trendTags || [])}.\nWrite fresh wording for this specific design; do not reuse stock phrases. Return: hook = one warm sentence (max 160 characters) describing what makes the design special, without claiming it was tested, bestselling or handmade; primaryPhrase = the exact phrase most buyers type for this item, ending with the word Pattern, max 45 characters; tags = 13 unique lowercase multi-word buyer phrases, each 20 characters or fewer, only letters, numbers, spaces, hyphens and apostrophes, no brand names, no repeated tag.`,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          hook: { type: "string" },
          primaryPhrase: { type: "string" },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["hook", "primaryPhrase", "tags"]
      }
    }, env);
    const primary = /pattern\s*$/i.test(suggestion.primaryPhrase) ? titleCase(cleanText(suggestion.primaryPhrase, 45)) : undefined;
    const title = buildTitle(input, primary);
    const tags = normalizeEtsyTags([...suggestion.tags.filter((tag) => !isIpRisky(tag) && !MISLEADING_FEATURE.test(tag) && fitsTheme(tag, families)), ...draft.tags]);
    const families = patternThemes(input).families;
    const cleaned = proseCase(cleanText(suggestion.hook, 160).replace(/\b(tested|best ?seller|bestselling)\b/gi, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!])/g, "$1").trim());
    const hook = cleaned && fitsTheme(cleaned, families) && !MISLEADING_FEATURE.test(cleaned) ? cleaned : "";
    return {
      ...draft,
      title,
      tags,
      description: buildDescription(input, hook || undefined),
      checks: validateEtsyListingText({ title, tags, materials: draft.materials }),
      source: "ai"
    };
  } catch (error) {
    console.error("AI listing suggestion failed", error instanceof Error ? error.message : error);
    return draft;
  }
}
