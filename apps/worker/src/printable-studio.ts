import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { buildAdVisuals, type AdVisual } from "./ad-visuals.js";
import type { PrintableKind } from "./etsy-trends.js";
import { isIpRisky } from "./ip-guard.js";
import { buildMasterPrompt } from "./master-prompt.js";
import { coinProductName, normalizeEtsyTags, normalizeEtsyTitle, titleCase, validateEtsyListingText } from "./pattern-studio.js";

// Kadınlara yönelik yazdırılabilir / dijital PDF ürünleri için stüdyo:
// türüne özel içerik kuralları, Claude/ChatGPT promptu, gerekirse sayfa sayfa görsel promptları,
// reklam tadında kullanım görselleri, Pinterest pinleri, paket fikri ve Etsy ilanı.

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
  signatureEn: string;
  includedEn: string[];
  tagStems: string[];
}

const PRINT_SAFE = "Print-safe margins: at least 0.25 in (6 mm) on every side and nothing important within 0.5 in of the edge, so home printers never cut content.";
const INK = "Ink-friendly: light tints, thin lines and no full-page dark backgrounds; also deliver a black-and-white version.";

export const PRINTABLE_KINDS: Record<PrintableKind, KindProfile> = {
  planner: {
    labelTr: "Planlayıcı", labelEn: "printable planner",
    defaultFormats: ["US Letter", "A4", "A5", "Half Letter"], defaultPages: 30, art: false,
    contentEn: [
      "Cover page and a short 'How to use this planner' page",
      "Core pages built for the planner's exact purpose, each with a clear title, labelled boxes and writing lines spaced at least 7 mm apart",
      "Undated pages with both Monday-start and Sunday-start versions so the product never expires",
      "Monthly overview, weekly spread, daily page, trackers and checklists that match the purpose",
      "Goal or review page, notes page and an index page"
    ],
    designEn: [PRINT_SAFE, INK, "A 0.75 in binding-safe inner margin for ring binders and disc planners", "Consistent grid, 10-12 pt body text, legible sans or serif pairing"],
    signatureEn: "a smart page or tracker that the top-ranking planners do not include (for example a quick-start page, a reflection prompt or a progress visual)",
    includedEn: ["Undated Monday + Sunday start", "Color and black-and-white versions", "How to print guide"],
    tagStems: ["planner insert", "planner pages", "undated planner", "printable insert", "life planner"]
  },
  digital_planner: {
    labelTr: "Dijital planlayıcı (tablet)", labelEn: "digital planner",
    defaultFormats: ["Landscape tablet PDF (iPad / Android tablets)", "Portrait tablet PDF"], defaultPages: 120, art: false,
    contentEn: [
      "Hyperlinked PDF: clickable tabs for every month and section, an index page linking to all sections, and a home button on every page",
      "Yearly, monthly, weekly and daily layouts plus trackers, notes, and themed section pages",
      "Undated so it works for any year, Monday and Sunday start",
      "A light and a dark theme version",
      "A one-page import guide for annotation apps such as GoodNotes, Notability, Noteshelf and Xodo (compatibility only, no logos)"
    ],
    designEn: ["Canvas sized for tablets (2388x1668 px landscape or 1668x2388 px portrait); every link target at least 44 px tall", "No tiny text: minimum 11 pt equivalent at 100% zoom"],
    signatureEn: "a navigation or layout idea that makes daily use faster than the top-ranking planners",
    includedEn: ["Hyperlinked tabs", "Light + dark theme", "Import guide"],
    tagStems: ["ipad planner", "tablet planner", "hyperlinked planner", "undated planner", "digital journal"]
  },
  coloring: {
    labelTr: "Boyama sayfaları", labelEn: "coloring pages",
    defaultFormats: ["US Letter", "A4"], defaultPages: 30, art: true,
    contentEn: [
      "Each coloring page is clean black line art on white: uniform line weight, fully closed shapes, no grayscale, no shading, no text",
      "Page order from simpler to more detailed, with a cover and a test page for trying colors",
      "Every page is a single-sided print with the back intentionally blank (to stop marker bleed-through)",
      "A 'color palette ideas' page and a thank-you page"
    ],
    designEn: [PRINT_SAFE, "Line art at 300 dpi, with the art filling the page inside the safe margins", "Generous coloring areas suited to the stated audience (bold and simple for kids, intricate for adults)"],
    signatureEn: "a theme twist or interactive element (hidden objects, a story thread across pages, or a matching colored reference) that top listings lack",
    includedEn: ["Single-sided pages", "US Letter + A4", "Color test page"],
    tagStems: ["coloring book", "coloring sheets", "printable coloring", "coloring pdf", "relaxing coloring"]
  },
  wall_art: {
    labelTr: "Duvar sanatı", labelEn: "printable wall art",
    defaultFormats: ["2:3 ratio (4x6 to 24x36 in)", "3:4 ratio (6x8 to 18x24 in)", "4:5 ratio (8x10 to 16x20 in)", "11x14 in", "ISO A-sizes (A5 to A1)"], defaultPages: 3, art: true,
    contentEn: [
      "A cohesive set of prints in one style; each artwork works alone and together as a gallery set",
      "Every artwork delivered in five ratio files so it fits every standard frame without cropping problems",
      "A size guide page listing which file prints which frame size"
    ],
    designEn: ["Master files at 300 dpi for the largest size in each ratio (for example 7200x10800 px for 24x36 in)", "Important elements kept away from edges so mats and frames do not cover them", "sRGB JPG files plus a PDF size guide"],
    signatureEn: "a distinct artistic detail (texture, composition or palette move) that sets the set apart from the top-ranking prints",
    includedEn: ["5 ratio files per print", "Prints up to 24x36 in", "Size guide"],
    tagStems: ["art print", "digital print", "gallery wall art", "printable poster", "home decor print"]
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
    signatureEn: "one original game or twist that most competing bundles do not offer",
    includedEn: ["Answer keys", "Cut lines", "Matching sign + tags"],
    tagStems: ["party games", "printable games", "party printable", "shower games", "game cards"]
  },
  recipe: {
    labelTr: "Tarif kartı / defteri", labelEn: "recipe printable",
    defaultFormats: ["4x6 in cards", "5x7 in cards", "US Letter binder pages", "A4"], defaultPages: 20, art: false,
    contentEn: [
      "Fill-in recipe cards in 4x6 and 5x7 laid out on Letter/A4 sheets with crop marks",
      "Full-page recipe binder pages with sections for ingredients, steps, servings, time and notes",
      "Section dividers, an index page, a measurement conversion chart and a weekly meal plan page"
    ],
    designEn: [PRINT_SAFE, INK, "Writing lines at least 7 mm apart; space for a photo on the full-page version"],
    signatureEn: "a useful extra (for example a family-recipe story box or a substitution chart) missing from top listings",
    includedEn: ["4x6 + 5x7 cards", "Binder pages", "Conversion chart"],
    tagStems: ["recipe cards", "recipe binder", "recipe template", "recipe book", "kitchen printable"]
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
    signatureEn: "a guided structure or progression that competing journals do not use",
    includedEn: ["40+ original prompts", "A5 + Letter", "Black-and-white version"],
    tagStems: ["guided journal", "journal pages", "journal prompts", "printable journal", "journal insert"]
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
    signatureEn: "a motivating element (story characters, rewards or a theme) that top listings lack",
    includedEn: ["Answer keys", "Certificate", "US Letter + A4"],
    tagStems: ["kids worksheets", "learning printable", "kids activities", "preschool printable", "busy book"]
  },
  paper_craft: {
    labelTr: "Kâğıt işi / dijital kâğıt", labelEn: "digital paper craft kit",
    defaultFormats: ["12x12 in sheets", "US Letter", "A4"], defaultPages: 20, art: true,
    contentEn: [
      "A coordinated set of designs: patterned papers, solid coordinates and ephemera (tags, labels, cut-outs) in one theme",
      "Seamless patterns that tile without visible seams",
      "Printable pages for junk journals with cut lines for ephemera"
    ],
    designEn: ["300 dpi files (3600x3600 px for 12x12 in sheets)", "JPG for papers, transparent PNG for ephemera, plus a PDF print collection"],
    signatureEn: "a signature motif or texture that ties the kit together and differs from top-ranking kits",
    includedEn: ["300 dpi files", "Seamless patterns", "Ephemera pieces"],
    tagStems: ["scrapbook paper", "junk journal", "digital paper", "printable paper", "craft printable"]
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

// Görsel gerektiren türlerde (boyama, duvar sanatı, dijital kâğıt) sayfa başına görsel promptu;
// motifler trend özelliklerinden ve trend etiketlerinden gelir.
function buildArtPrompts(input: PrintablePlanInput, profile: KindProfile): string[] {
  if (!profile.art) return [];
  const palette = input.colors?.length ? input.colors.join(", ") : "a harmonious palette";
  const head = productHead(input.productType);
  const motifs = [...new Set([
    ...(input.trendFeatures || []),
    ...(input.trendTags || []).map((tag) => tag.replace(new RegExp(`\\b(${head}s?|printable|pages?|coloring|wall art|digital|paper|pack|kit|for adults|for kids|pdf)\\b`, "g"), "").replace(/\s+/g, " ").trim())
  ])].filter((motif) => motif.length >= 3 && !isIpRisky(motif)).slice(0, 8);
  const count = Math.min(input.pageCount || profile.defaultPages, input.kind === "wall_art" ? 6 : 8);
  const motifAt = (index: number) => motifs.length ? motifs[index % motifs.length] : `an original ${input.productType} theme`;
  return Array.from({ length: count }, (_, index) => {
    const motif = motifAt(index);
    if (input.kind === "coloring") return `Coloring page ${index + 1}: ${motif}, original composition, clean black outline line art on pure white, uniform line weight, every shape fully closed, no grayscale, no shading, no text, no signature, portrait 8.5x11 in at 300 dpi with a 0.5 in empty border.`;
    if (input.kind === "wall_art") return `Print ${index + 1} of the set: ${motif}, ${palette}, ${(input.trendFeatures || []).slice(0, 2).join(" and ") || "modern"} style, gallery-quality original artwork, balanced negative space, no text, no frame, no watermark, 4:5 master at 7200x9000 px.`;
    return `Paper ${index + 1}: seamless repeating pattern of ${motif}, ${palette}, original design, 12x12 in at 300 dpi (3600x3600 px), tiles with no visible seams, no text.`;
  });
}

function originalityPlan(input: PrintablePlanInput, profile: KindProfile): { tr: string[]; en: string[] } {
  const features = input.trendFeatures?.length ? input.trendFeatures.join(", ") : "";
  return {
    tr: [
      `Tek bir ürün kopyalanmadı; trend özellikleri${features ? ` (${features})` : ""} özgün bir tasarımda birleştirilecek.`,
      "Üst sıradaki ilanlarda olmayan imza bir öğe eklenecek ve kapakta vurgulanacak.",
      "Yalnızca ticari kullanıma izin veren fontlar ve kendi üretilen görseller kullanılacak; marka, karakter ve ünlü adı geçmeyecek.",
      input.colors?.length ? `Renk paleti: ${input.colors.join(", ")}.` : "Renk paletini yapay zekâ özgün olarak önerecek."
    ],
    en: [
      `Build the buyer-favored features${features ? ` (${features})` : ""} into one coherent, original product with your own layout and wording.`,
      `Add ${profile.signatureEn}, and name it on the cover.`,
      "Use only fonts licensed for commercial use (for example Google Fonts) and list them; all text and artwork must be your own.",
      "Never use trademarked names, characters, celebrities, logos or brand styles.",
      input.colors?.length ? `Use this palette: ${input.colors.join(", ")}.` : "Propose a fresh palette with color names and hex codes."
    ]
  };
}

function buildPdfPrompt(input: PrintablePlanInput, profile: KindProfile, name: string, rules: string[], artPrompts: string[]): string {
  const year = new Date().getUTCFullYear();
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pages = input.pageCount || profile.defaultPages;
  return [
    `You are a senior print designer, copywriter and technical editor for Etsy ${profile.labelEn} products. Create an ORIGINAL, sellable ${input.productType} and produce print-ready files.`,
    "",
    "## Working name",
    `${name} (you may refine it, but it must stay original).`,
    "",
    "## Product",
    `- Item: ${input.productType}`,
    `- Buyers: US Etsy shoppers searching "${input.keyword || input.productType}"${input.audience ? `; audience: ${input.audience}` : ""}`,
    `- Size: about ${pages} ${input.kind === "wall_art" ? "artworks" : "pages"}, plus bonus pages`,
    `- Formats (deliver each as its own file): ${formats.join(", ")}`,
    `- Palette: ${input.colors?.length ? input.colors.join(", ") : "propose one with hex codes"}`,
    ...(input.trendFeatures?.length ? [`- Style signals: ${input.trendFeatures.join(", ")}`] : []),
    "",
    "## Market brief (Etsy research)",
    input.referenceNotes || `Buyers are searching Etsy for "${input.keyword || input.productType}".`,
    "There is no single reference product. Design for what these buyers want, in your own original way.",
    "",
    "## Originality rules (mandatory)",
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "## Content",
    ...profile.contentEn.map((line) => `- ${line}`),
    "",
    "## Design rules",
    ...profile.designEn.map((line) => `- ${line}`),
    "- US English spelling, no typos, consistent page numbers and footer on every page.",
    "",
    "## Work in three passes",
    "PASS 1 - Page plan: a table with one line per page (number, title, purpose, elements, format notes).",
    "PASS 2 - Check and report: every page inside the safe margins, text readable at 100% print size, no spelling errors, every fill-in area large enough for handwriting, totals in the page plan match the files.",
    profile.art
      ? "PASS 3 - Assembly: build one print-ready HTML document per format that places the artwork files (named page-01.png, page-02.png ...) with CSS @page set to the exact size (for example @page { size: 8.5in 11in; margin: 0 }) so 'Save as PDF' gives the exact size."
      : "PASS 3 - Final files: one print-ready HTML document per format with CSS @page set to the exact size (for example @page { size: 8.5in 11in; margin: 0 }) using vector shapes (inline SVG) only, ready to 'Save as PDF' without edits. If you can create files, export the PDFs directly.",
    "",
    ...(artPrompts.length ? [
      "## Artwork prompts",
      "Generate each artwork with an image model using these prompts. Keep one consistent style across the whole set and replace any image that breaks the rules.",
      ...artPrompts.map((prompt) => `- ${prompt}`),
      ""
    ] : []),
    "## Also deliver",
    "- A one-page 'How to print' guide: print at Actual size / 100% scale, paper weight suggestions, double-sided and print-shop tips.",
    `- A thank-you page from GXL Market Studio inviting the buyer to message for help and to leave a review.`,
    `- A license page: "© ${year} GXL Market Studio. For personal use only. Do not share, resell or redistribute these files, in whole or in part."`,
    "- A 'Product spec' JSON block: name, page titles in order, formats, palette (name + hex), fonts and the signature element. Mockups and listing photos will be made from it.",
    "",
    "## Never",
    "- Never claim reviews, awards, bestseller status or sales numbers.",
    "- Never use trademarked names, characters, celebrity names, logos or brand styles.",
    "- Never leave placeholder text such as Lorem ipsum."
  ].join("\n");
}

function relevantTrendTags(input: PrintablePlanInput): string[] {
  const words = new Set([...input.productType.split(/\s+/), productHead(input.productType), ...(input.trendFeatures || []).flatMap((feature) => feature.split(/\s+/))].filter((word) => !["printable", "pdf", "digital"].includes(word)));
  const features = input.trendFeatures || [];
  const rank = (tag: string) => { const index = features.findIndex((feature) => tag.includes(feature)); return index === -1 ? features.length : index; };
  return (input.trendTags || [])
    .filter((tag) => !isIpRisky(tag) && !["instant download", "digital download", "printable", "pdf"].includes(tag) && tag.split(/\s+/).some((word) => words.has(word) || words.has(word.replace(/s$/, ""))))
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => rank(a.tag) - rank(b.tag) || a.index - b.index)
    .map((item) => item.tag);
}

function bundleIdea(input: PrintablePlanInput, profile: KindProfile, name: string) {
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

// Pin başlıkları sabit sloganlardan değil, o aramanın alıcı ifadelerinden ve bu ürünün trend özelliklerinden kurulur.
function buildPins(input: PrintablePlanInput, name: string): PrintableBrief["pins"] {
  const keyword = input.keyword || input.productType;
  const features = input.trendFeatures || [];
  const phrases = [...new Set([keyword, ...relevantTrendTags(input)])];
  const angles = [
    { phrase: phrases[0], feature: features[0] },
    { phrase: phrases[1] || input.productType, feature: features[1] || features[0] },
    { phrase: phrases[2] || phrases[0], feature: features[2] || features[1] }
  ];
  const formats = formatPhrase(input.formats?.length ? input.formats : PRINTABLE_KINDS[input.kind].defaultFormats);
  const palette = input.colors?.length ? ` in a ${joinWords(input.colors.slice(0, 3))} palette` : "";
  const pages = input.pageCount ? `${input.pageCount} pages` : "";
  const tablet = (input.formats || []).some((format) => /tablet|hyperlink/i.test(format)) || input.kind === "digital_planner";
  // Pinterest açıklaması doğal cümlelerle yazılır; anahtar kelime yığını hem okuyucuyu hem Pinterest aramasını olumsuz etkiler.
  return angles.map(({ phrase, feature }, index) => {
    const related = phrases.filter((item) => item !== phrase && item !== feature).slice(index, index + 3);
    const sentences = [
      `${name} is an original ${phrase}${feature && !phrase.includes(feature) ? ` with ${feature} pages` : ""}${palette}.`,
      [pages, formats].filter(Boolean).length ? `Includes ${[pages, formats].filter(Boolean).join(" in ")}.` : "",
      `Instant digital download: print at home${tablet ? " or use it on your tablet" : ""}.`,
      input.audience ? `Made for ${joinWords(input.audience.split(/\s*,\s*/).filter(Boolean))}.` : "",
      related.length ? `Great if you love ${joinWords(related)}.` : "",
      "Designed by GXL Market Studio."
    ];
    return {
      title: `${titleCase(phrase)}${feature && !phrase.includes(feature) ? ` | ${titleCase(feature)}` : ""}`.slice(0, 100),
      overlay: (feature || phrase).toUpperCase(),
      description: sentences.filter(Boolean).join(" ").slice(0, 480)
    };
  });
}

function joinWords(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildPrintableBrief(input: PrintablePlanInput): PrintableBrief {
  const profile = PRINTABLE_KINDS[input.kind];
  const name = coinProductName({ productType: input.productType, salt: `${input.seed || ""}|${input.kind}|${input.productType}|${input.referenceNotes || ""}`, accents: [...(input.trendFeatures || []), ...(input.colors || [])], avoidNames: input.avoidNames });
  const rules = originalityPlan(input, profile);
  const artPrompts = buildArtPrompts(input, profile);
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pdfPrompt = buildPdfPrompt(input, profile, name, rules.en, artPrompts);
  const adVisuals = buildAdVisuals({ kind: input.kind, productType: input.productType, name, colors: input.colors, features: input.trendFeatures, formats, pageCount: input.pageCount || profile.defaultPages, seed: input.seed });
  const pins = buildPins(input, name);
  return {
    name,
    kind: input.kind,
    originalityPlan: rules.tr,
    pdfPrompt,
    artPrompts,
    adVisuals,
    pins,
    masterPrompt: buildMasterPrompt({
      name,
      productLabel: input.productType,
      specName: "Product spec",
      // Sanat promptları PDF briefinin içinde de geçer; pakette Brief B olarak bir kez verilir.
      filesBrief: pdfPrompt.replace(/## Artwork prompts[\s\S]*?\n\n(?=## )/, "## Artwork\nUse the artworks from Brief B.\n\n"),
      artPrompts,
      adVisuals,
      pins,
      checklist: [
        "Every page sits inside the safe margins and prints at 100% (Actual size) on both US Letter and A4 without clipping.",
        "US English spelling, no typos, no placeholder text, page numbers and footer consistent.",
        "All fonts are licensed for commercial use; list them.",
        "No brand, character or celebrity names; all artwork is original.",
        "Etsy allows at most 5 files of 20 MB each per digital listing; zip extras and give the files clear names (for example Planner-US-Letter.pdf).",
        "Listing images show the real pages from the files.",
        "How to print, thank-you and license pages are included."
      ]
    }),
    bundleIdea: bundleIdea(input, profile, name),
    qualityGate: [
      "Her formattan bir test sayfasını %100 (gerçek boyut) ölçekte hem Letter hem A4 kâğıda yazdır; kenar boşluğu kesilmiyor mu kontrol et.",
      "Yazım denetimi yap (US English); 'Lorem ipsum' veya boş alan kalmasın.",
      "Fontların ticari kullanım lisansı olsun; listeyi sakla.",
      "Marka, karakter veya ünlü adı yok; görseller tamamen özgün.",
      "Etsy dijital ilanına en fazla 5 dosya, her biri en fazla 20 MB yüklenebilir; fazlası için dosyaları ZIP'le ve adlarını anlaşılır yap (ör. Planner-US-Letter.pdf).",
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

function formatPhrase(formats: string[]): string | undefined {
  const short = formats.map((format) => format.replace(/\s*\(.*\)/, "")).filter((format) => /letter|a4|a5|4x6|5x7|12x12|ratio|tablet/i.test(format));
  return short.length ? short.slice(0, 3).join(", ") : undefined;
}

function buildTitle(input: PrintablePlanInput, name: string, primary = primaryPhrase(input)): string {
  const profile = PRINTABLE_KINDS[input.kind];
  const trend = input.trendTags || [];
  const covered = new Set(primary.toLowerCase().split(/\s+/));
  const phrases: string[] = [];
  for (const tag of relevantTrendTags(input)) {
    const words = tag.split(/\s+/);
    if (words.every((word) => covered.has(word))) continue;
    words.forEach((word) => covered.add(word));
    phrases.push(titleCase(tag));
    if (phrases.length === 2) break;
  }
  const format = formatPhrase(input.formats?.length ? input.formats : profile.defaultFormats);
  const segments = [primary, name, ...phrases, ...(format ? [format] : []), ...(!trend.length || trend.includes("instant download") ? ["Instant Download"] : [])];
  let title = "";
  for (const segment of segments) {
    const next = title ? `${title}, ${segment}` : segment;
    if (next.length > 140) break;
    title = next;
  }
  return normalizeEtsyTitle(title);
}

// Önce alıcı ifadeleri (trend), sonra bu ürünün formatları, renkleri ve kelimeleri; türün genel ifadeleri yalnızca 13'ü tamamlamak için.
const GENERIC_HEADS = /^(pages?|art|cards?|games?|sheets?|kit|pack|paper|printables?|templates?|worksheets?|activities|prints?)$/;
const SEARCHED_SIZES: Array<[RegExp, string]> = [[/^us letter/i, "letter"], [/^a4/i, "a4"], [/^a5/i, "a5"], [/^half letter/i, "half letter"], [/^4x6/i, "4x6"], [/^5x7/i, "5x7"], [/^8x10/i, "8x10"], [/^11x14/i, "11x14"], [/^12x12/i, "12x12"]];

function buildTags(input: PrintablePlanInput): string[] {
  const product = input.productType;
  const profile = PRINTABLE_KINDS[input.kind];
  const words = product.split(/\s+/);
  const tagHead = words.length > 1 && GENERIC_HEADS.test(words.at(-1)!) ? words.slice(-2).join(" ") : words.at(-1)!;
  const sizes = (input.formats?.length ? input.formats : profile.defaultFormats)
    .map((format) => SEARCHED_SIZES.find(([pattern]) => pattern.test(format))?.[1])
    .filter((size): size is string => Boolean(size));
  return normalizeEtsyTags([
    ...(input.keyword ? [input.keyword] : []),
    ...relevantTrendTags(input),
    ...(input.trendFeatures || []).map((feature) => `${feature} ${tagHead}`),
    product,
    `printable ${tagHead}`,
    `${tagHead} printable`,
    `${tagHead} pdf`,
    ...sizes.map((size) => `${size} ${tagHead}`),
    ...(input.colors || []).map((color) => `${color.toLowerCase()} ${tagHead}`),
    ...(words.length > 1 && !GENERIC_HEADS.test(words[0]) ? [`${words[0]} printable`] : []),
    `${tagHead} template`,
    ...(input.audience ? [`${tagHead} for ${input.audience.toLowerCase()}`] : []),
    profile.labelEn,
    ...profile.tagStems,
    ...(input.kind === "digital_planner" || input.kind === "paper_craft" ? [`digital ${tagHead}`] : []),
    "instant download"
  ].filter((tag) => !isIpRisky(tag)));
}

function buildDescription(input: PrintablePlanInput, name: string, hook?: string): string {
  const profile = PRINTABLE_KINDS[input.kind];
  const formats = input.formats?.length ? input.formats : profile.defaultFormats;
  const pages = input.pageCount || profile.defaultPages;
  return [
    `${name} - ${hook || `an original ${input.productType}${input.trendFeatures?.length ? ` with ${input.trendFeatures.slice(0, 3).join(", ")}` : ""}, designed to be printed at home and used right away.`}`,
    "",
    "THIS IS A DIGITAL PRODUCT. NO PHYSICAL ITEM WILL BE SHIPPED.",
    "",
    "WHAT'S INCLUDED",
    `• About ${pages} ${input.kind === "wall_art" ? "artworks" : "pages"}`,
    ...profile.includedEn.map((item) => `• ${item}`),
    `• Formats: ${formats.join(", ")}`,
    "",
    "HOW IT WORKS",
    "1. Purchase and download the files from your Etsy Purchases page.",
    "2. Print at home or at a print shop at Actual size / 100% scale.",
    "3. Start using your printable.",
    "",
    "PLEASE NOTE",
    "• Colors may look slightly different depending on your screen and printer.",
    "• Some listing images are mockups that show how the printed product can be used.",
    ...(input.aiAssisted !== false ? ["• AI tools assisted with drafting parts of this design; every page was reviewed by our team."] : []),
    "• Because this is a digital file, all sales are final, but message us with any question and we will help.",
    "",
    "LICENSE",
    "© GXL Market Studio. For personal use only. Please do not share, resell or redistribute the files."
  ].join("\n");
}

export function buildPrintableListing(input: PrintablePlanInput, name: string): PrintableListingDraft {
  const title = buildTitle(input, name);
  const tags = buildTags(input);
  const materials = ["pdf file", "printable", "digital download"];
  return {
    title,
    description: buildDescription(input, name),
    tags,
    materials,
    checks: validateEtsyListingText({ title, tags, materials }),
    warnings: [
      ...(input.aiAssisted !== false ? ["Etsy ilan formunda yapay zekâ kullanımı kutusunu işaretle; açıklamaya bildirim eklendi."] : []),
      "Mockup görsellerinde gerçek PDF sayfalarını kullan; ürünle uyuşmayan görsel kötü yorum getirir."
    ],
    source: "rules"
  };
}

interface AiPrintableSuggestion { hook: string; tags: string[] }

export async function createPrintableListing(input: PrintablePlanInput, name: string, env: AiRuntimeEnv): Promise<PrintableListingDraft> {
  const draft = buildPrintableListing(input, name);
  if (!hasAiProvider(env)) return draft;
  try {
    const suggestion = await generateStructuredObject<AiPrintableSuggestion>({
      schemaName: "gxl_etsy_printable_listing",
      prompt: `You are an Etsy SEO specialist for digital printables bought by US shoppers.\nProduct: ${JSON.stringify({ name, kind: input.kind, item: input.productType, features: input.trendFeatures, colors: input.colors, formats: input.formats })}\nTags on top-ranking Etsy listings for this search: ${JSON.stringify(input.trendTags || [])}.\nWrite fresh wording for this specific product; do not reuse stock phrases. Never use trademarked names or characters. Return: hook = one warm sentence (max 160 characters) about what makes it special, without claiming reviews or bestseller status; tags = 13 unique lowercase multi-word buyer phrases, each 20 characters or fewer, only letters, numbers, spaces, hyphens and apostrophes.`,
      schema: { type: "object", additionalProperties: false, properties: { hook: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["hook", "tags"] }
    }, env);
    const tags = normalizeEtsyTags([...suggestion.tags.filter((tag) => !isIpRisky(tag)), ...draft.tags]);
    const hook = cleanText(suggestion.hook, 160).replace(/\b(best ?seller|bestselling|top rated)\b/gi, "").trim();
    return { ...draft, tags, description: buildDescription(input, name, hook || undefined), checks: validateEtsyListingText({ title: draft.title, tags, materials: draft.materials }), source: "ai" };
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

