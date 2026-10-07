import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import type { PatternCraft } from "./etsy-trends.js";

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
  macrame: { label: "Macrame", tag: "macrame", short: "macrame", order: "craft-first", tool: "macrame cord and dowel", terms: "standard macrame knot names", unit: "row", defaultMaterial: "cotton macrame cord", fan: "macrame maker", chart: "knot diagram for every row with cord numbering" },
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
const CIRCULAR = /(doily|mandala|coaster|placemat|round|circle|rug|centerpiece)/i;

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

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").split(" ").map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word).join(" ");
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
    referenceNotes: cleanText(raw.referenceNotes, 600) || undefined,
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
export function choosePatternName(input: Pick<PatternPlanInput, "productType" | "referenceNotes" | "craft" | "seed" | "trendFeatures" | "colors" | "avoidNames">): string {
  const avoid = new Set((input.avoidNames || []).map((name) => name.toLowerCase()));
  const productWords = new Set(input.productType.toLowerCase().split(/\s+/));
  const accents = [...(input.trendFeatures || []), ...(input.colors || [])]
    .map((value) => value.toLowerCase().trim())
    .filter((value) => /^[a-z][a-z -]{1,15}$/.test(value) && !value.split(" ").some((word) => productWords.has(word)));
  const product = titleCase(input.productType);
  let name = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = hash(`${input.seed || ""}|${input.craft}|${input.productType}|${input.referenceNotes || ""}|${attempt}`);
    const accent = accents.length && value % 3 !== 0 ? `${titleCase(accents[value % accents.length])} ` : "";
    name = `${accent}${coinWord(value)} ${product}`;
    if (!avoid.has(name.toLowerCase())) break;
  }
  return name;
}

function alternativeRepeat(reference: number): number {
  const options = [6, 8, 10, 12, 14, 16, 18, 20, 24].filter((value) => Math.abs(value - reference) >= 2);
  return options.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference) || b - a)[0];
}

function trendOriginalityRules(input: PatternPlanInput): { tr: string[]; en: string[] } {
  const product = input.productType;
  const features = input.trendFeatures?.length ? input.trendFeatures.join(", ") : "";
  const tr = [
    `Tek bir model kopyalanmadı; trend özellikleri${features ? ` (${features})` : ""} özgün bir tasarımda birleştirilecek.`,
    "Tasarıma üst sıradaki ilanlarda olmayan imza bir ayrıntı (motif, yapım hilesi veya bitiş) eklenecek.",
    input.colors?.length ? `Renk paleti: ${input.colors.join(", ")}.` : "Renk paletini yapay zekâ özgün olarak önerecek."
  ];
  const en = [
    `Build the buyer-favored features${features ? ` (${features})` : ""} into one coherent design with your own proportions, layout and construction order.`,
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
  tr.push("Hiçbir yayımlanmış desenin yazısı, şeması, fotoğrafı, sayfa düzeni veya adı kullanılmayacak.");
  en.push("Do not reproduce any text, chart, photo, diagram, page layout, or name from any published pattern or listing.");
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
  const skill = SKILL_LABELS[input.skillLevel || "easy"].en;
  const year = new Date().getUTCFullYear();
  const wearable = WEARABLE.test(input.productType);
  const circular = CIRCULAR.test(input.productType);
  const lines = [
    `You are a senior ${craft.label.toLowerCase()} pattern designer and a meticulous technical editor. Design an ORIGINAL, sellable digital ${craft.label.toLowerCase()} pattern and produce a print-ready PDF manuscript.`,
    "",
    "## Working name",
    `${name} (you may refine it, but it must stay original and must not match any existing pattern name you know).`,
    "",
    "## Product",
    `- Item: ${input.productType}`,
    `- Skill level: ${skill}`,
    `- Target size: ${input.sizeNote || "choose a practical standard size and state it in inches and centimeters"}`,
    `- Material: ${input.yarnNote || `${craft.defaultMaterial}; state the Craft Yarn Council weight number`}`,
    `- Colors: ${input.colors?.length ? input.colors.join(", ") : "propose a 3-color palette with names and hex codes"}`,
    `- Terminology: ${craft.terms}. Give every measurement in inches and centimeters.`,
    "",
    ...(input.referenceSource === "trend" ? [
      "## Market brief (Etsy research)",
      input.referenceNotes || `Buyers are searching Etsy for "${input.keyword || input.productType}".`,
      "There is no single reference model. Design for what these buyers want, in your own original way.",
      "",
      "## Originality rules (mandatory)"
    ] : [
      "## Originality rules (mandatory)",
      `The shop owner liked a reference design${input.referenceNotes ? `: "${input.referenceNotes}"` : ""}. Use it only as a mood reference. Your design must be clearly different:`
    ]),
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    "Common public-domain techniques (picots, shells, granny squares, basic knots) are allowed, but the overall design, proportions and every written sentence must be your own.",
    "",
    "## Work in three passes",
    `PASS 1 - Design spec: write a table with one line per ${craft.unit}: number, what is worked, stitch/knot count at the end, repeats, color, and a measurable checkpoint.`,
    "PASS 2 - Technical edit (do it carefully, then report the result):",
    `- Recount every ${craft.unit}; the stated count must equal the stitches produced by the written instruction.`,
    "- Check that every repeat divides evenly and every \"*...; rep from *\" closes exactly.",
    ...(circular ? ["- For a flat circular piece, check that each round adds enough stitches/chain length to lie flat; fix any round that would cup or ruffle and explain the fix."] : []),
    ...(wearable ? ["- Grade at least 3 sizes from a size chart; give every count per size as \"30 (34, 38)\" and check each size separately."] : []),
    "- Check that gauge, finished size and yardage per color agree; add a 15% yardage safety margin.",
    "- Mark anything that can only be confirmed by physically making the item as [TEST-MAKE CHECK].",
    "PASS 3 - Final manuscript in this exact order:",
    "1. Cover: name, one-sentence promise, skill level, finished size, \"US terms\" badge",
    "2. At a glance: skill level, construction summary, finished size, estimated time",
    "3. Materials & tools: material weight and fiber, yardage and meters per color, tool size in mm and US size, notions",
    "4. Gauge & finished measurements: how to measure and what to do if gauge is off",
    "5. Abbreviations & special techniques with numbered step-by-step explanations",
    "6. Construction overview with a simple labeled schematic",
    `7. Instructions: every ${craft.unit} numbered, the count in parentheses at the end of every ${craft.unit}, color changes stated where they happen, no \"continue as established\" shortcuts`,
    `8. Chart: ${craft.chart}; it must match the written instructions exactly`,
    "9. Assembly, finishing and blocking with target measurements",
    "10. Troubleshooting table: symptom - likely cause - fix",
    "11. One-page quick reference",
    "12. Care notes",
    `13. License page: "© ${year} GXL Market Studio. For personal use. You may sell finished items you make by hand in small quantities; please credit 'Pattern by GXL Market Studio'. Do not copy, share, resell, translate or redistribute this PDF, in whole or in part."`,
    `Footer on every page: "${name} · © GXL Market Studio · Personal use only · page N"`,
    "",
    "## Output format",
    "- Deliver the final manuscript as one print-ready HTML document (US Letter with 0.75 in margins so it also prints cleanly on A4, 11 pt body text, high contrast, clear headings) with inline SVG diagrams, ready to save as PDF without edits. If you can create files, also export it as a PDF.",
    "- After the manuscript, output a \"Design spec\" JSON block with: name, item, finished_size, colors (name + hex), motif and repeat counts, number of rounds/rows, skill_level. The product renders will be made from this block, so it must match the pattern exactly.",
    "- Finally list every [TEST-MAKE CHECK] item.",
    "",
    "## Never",
    "- Never claim the pattern was tested, never invent reviews, awards or sales numbers.",
    "- Never use another designer's name, brand or trademark.",
    `- Never leave a ${craft.unit} without a count.`
  ];
  return lines.join("\n");
}

function lifestyleScene(product: string): string {
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
    "Show exactly the motif counts, repeat count, colors and proportions in the spec; do not add or remove motifs, petals, leaves or rounds.",
    `Real fiber texture with individually visible ${craft.label.toLowerCase()} stitches, slight natural irregularity, no plastic or CGI look.`,
    "Main image: flat lay, centered, the item fills about 70% of the frame, on light natural linen, soft diffused daylight from the upper left, gentle shadow, 4:5 portrait, 2400x3000 px.",
    "Also create: (1) a macro close-up of one repeat showing the stitch structure, (2) a lifestyle image " + lifestyleScene(input.productType) + ", (3) a size reference image next to a ruler.",
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
  return {
    name,
    originalityPlan: rules.tr,
    patternPrompt: buildPatternPrompt(input, name, rules.en),
    renderPrompt: buildRenderPrompt(input, name),
    photoPlan: PHOTO_PLAN.map((item, index) => ({ slot: index + 1, ...item })),
    qualityGate: [
      "Deseni satışa açmadan önce en az bir kez bizzat ör/yap ya da test ördür; sayıları, metrajı ve ölçüyü buna göre düzelt.",
      "Ana fotoğraf mümkünse gerçek üründen olsun. Render kullanılıyorsa görselde 'Digital render' yazsın; ilan açıklaması bunu otomatik belirtir.",
      "Yapay zekâ desteği kullandıysan Etsy formunda yapay zekâ kutusunu işaretle ve 'Designed by' seçeneğini kullan.",
      "Render, PDF'teki Design spec ile birebir aynı sayıda motif ve aynı renkleri göstermeli; farklıysa yeniden üret.",
      "Referans modelin yazısı, fotoğrafı, şeması veya adı PDF'te ve ilanda bulunmamalı.",
      "PDF'in her sayfasında telif altbilgisi ve son sayfada lisans metni olmalı.",
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
    if (!tag || tag.length > 20 || seen.has(tag)) continue;
    seen.add(tag);
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
  if (input.keyword && /pattern/i.test(input.keyword) && input.keyword.toLowerCase().includes(productHead)) return titleCase(input.keyword.replace(/\bpdf\b/gi, ""));
  const product = titleCase(input.productType);
  return craft.order === "craft-first" ? `${craft.label} ${product} Pattern` : `${product} ${craft.label} Pattern`;
}

const GENERIC_TAGS = new Set(["instant download", "digital download", "printable pattern", "digital pattern", "pdf pattern", "pattern pdf"]);

function relevantTrendTags(input: DigitalListingInput): string[] {
  const craft = CRAFTS[input.craft];
  const productWords = input.productType.toLowerCase().split(/\s+/);
  const lastWord = productWords.at(-1) || input.productType;
  const craftWords = new Set([...craft.tag.split(" "), ...craft.short.split(" "), "pattern", "patterns", "pdf"]);
  const vocabulary = new Set([...productWords, lastWord.replace(/s$/, ""), ...(input.features || []).flatMap((feature) => feature.toLowerCase().split(/\s+/))].filter((word) => !craftWords.has(word)));
  const relevant = (input.trendTags || []).filter((tag) => !GENERIC_TAGS.has(tag) && tag.toLowerCase().split(/\s+/).some((word) => vocabulary.has(word) || vocabulary.has(word.replace(/s$/, ""))));
  // Bu seferki trend özelliklerini içeren ifadeler öne alınır; böylece her desenin başlığı ve etiket sırası farklı olur.
  const features = (input.features || []).map((feature) => feature.toLowerCase());
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
  const coveredWords = new Set(lead.toLowerCase().split(/\s+/));
  const trendPhrases: string[] = [];
  for (const tag of relevantTrendTags(input)) {
    const words = tag.split(/\s+/);
    if (words.every((word) => coveredWords.has(word))) continue;
    words.forEach((word) => coveredWords.add(word));
    trendPhrases.push(titleCase(tag));
    if (trendPhrases.length === 2) break;
  }
  const segments = [
    lead,
    input.name,
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
  return normalizeEtsyTitle(title);
}

// Etiketler önce trendin alıcı ifadelerinden gelir; ürün ifadeleri ve genel ifadeler yalnızca 13'ü tamamlamak için kullanılır.
function buildTags(input: DigitalListingInput): string[] {
  const craft = CRAFTS[input.craft];
  const product = input.productType.toLowerCase();
  const productWords = product.split(/\s+/);
  const lastWord = productWords.at(-1) || product;
  const skillWord = SKILL_LABELS[input.skillLevel || "easy"].tag;
  const skillTags = input.skillLevel === "easy" || !input.skillLevel ? [`easy ${craft.short} pattern`] : [`${skillWord} ${craft.tag}`, `${skillWord} ${craft.short}`];
  const colorTags = (input.colors || []).slice(0, 2).map((color) => `${color.toLowerCase()} ${lastWord}`);
  const featureTags = (input.features || []).map((feature) => `${feature.toLowerCase()} ${lastWord}`);
  return normalizeEtsyTags([
    ...(input.keyword ? [input.keyword] : []),
    ...relevantTrendTags(input),
    ...featureTags,
    ...(productWords.length > 1 ? [product] : []),
    `${product} pattern`,
    `${craft.short} ${product}`,
    `${craft.tag} ${product}`,
    `${lastWord} pattern`,
    `${craft.short} ${lastWord}`,
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
    "digital pattern",
    "instant download"
  ]);
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
  const notes = [
    ...(input.photosAreRenders !== false ? ["Some listing photos are digital renders of the design. Your finished piece will vary with your yarn, tension and colors."] : []),
    ...(input.aiAssisted !== false ? [`AI tools assisted with drafting and illustrating this pattern. The design and instructions were reviewed by our team${input.testMade ? " and the pattern was test-made before release" : ""}.`] : []),
    "This is a digital file. Because files cannot be returned, all sales are final, but please message us with any question about the pattern and we will help."
  ];
  return [
    `${input.name} - ${hook || `an original ${craft.label.toLowerCase()} ${product} pattern${input.features?.length ? ` built around ${input.features.slice(0, 3).join(", ")}` : ""}, with clear, step-by-step instructions.`}`,
    "",
    `THIS IS A DIGITAL PDF PATTERN, NOT A FINISHED ${product.toUpperCase()}.`,
    "",
    "WHAT YOU GET",
    `• ${pages}PDF pattern in US English using ${craft.terms}`,
    "• Written instructions with a count at the end of every round/row",
    "• Charts or diagrams that match the written steps",
    "• Materials list, gauge and finished measurements",
    "• Troubleshooting guide and one-page quick reference",
    "",
    `SKILL LEVEL: ${skill}`,
    ...(input.sizeNote ? [`FINISHED SIZE: ${input.sizeNote}`] : []),
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
    "© GXL Market Studio. For personal use. You may sell finished items you make yourself in small quantities; please credit GXL Market Studio. Do not copy, share, resell or translate this pattern."
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
    const tags = normalizeEtsyTags([...suggestion.tags, ...draft.tags]);
    const hook = cleanText(suggestion.hook, 160).replace(/\b(tested|best ?seller|bestselling)\b/gi, "").trim();
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
