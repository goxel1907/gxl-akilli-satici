import type { PatternCraft, PrintableKind, TrendResult } from "../../../worker/src/etsy-trends.js";
import { buildMarketingPlan, normalizeMarketingInput } from "../../../worker/src/marketing-plan.js";
import { buildPatternSeed } from "../../../worker/src/pattern-seed.js";
import { buildDigitalListing, buildPatternBrief, normalizeDigitalListingInput, normalizePatternPlanInput } from "../../../worker/src/pattern-studio.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput } from "../../../worker/src/printable-studio.js";
import { buildProductPlan, normalizeProductInput } from "../../../worker/src/product-studio.js";
import { SHOP_PRESETS } from "../../../worker/src/shop-settings.js";
import { guardMarketingPlan, guardPatternPlan, guardPrintablePlan, guardProductPlan, type GuardReport } from "../../../worker/src/output-guard.js";

// Uygulamanın ürettiği her metnin (talimat paketi, başlık, etiket, açıklama, pin, reklam metni) toplu örnekleri.
// Etsy'deki gerçek aramalara benzeyen trend verisiyle her stüdyo birkaç farklı tohumla çalıştırılır;
// otomatik denetleyici testi ve ajan incelemesi aynı seti kullanır.

const tags = (rows: Array<[string, number]>) => rows.map(([tag, count]) => ({ tag, count }));
const rising = (rows: Array<[string, number]>) => rows.map(([tag, weight]) => ({ tag, weight }));
const formats = (rows: Array<[string, number]>) => rows.map(([id, share]) => ({ id, labelTr: id, share }));

function trend(keyword: string, group: TrendResult["group"], partial: Partial<TrendResult>): TrendResult {
  return {
    keyword,
    group,
    score: 55,
    verdict: "Denenebilir",
    parts: { demand: 50, openness: 40, newcomer: 50, price: 60 },
    metrics: { activeListings: 120_000, favoritesPerMonth: 20, newcomerShare: 0.45, digitalShare: 1, medianPriceUsd: 5.5, sampleSize: 48 },
    reasons: [],
    topTags: [],
    risingTags: [],
    examples: [],
    scannedAt: "2026-10-28T12:00:00.000Z",
    ...partial
  };
}

const example = (title: string, favorites: number, ageDays: number, priceUsd = 5) => ({ title, url: "https://www.etsy.com/listing/1", favorites, ageDays, priceUsd });

export interface PrintableScenario { id: string; keyword: string; kind: PrintableKind; result: TrendResult }
export interface PatternScenario { id: string; keyword: string; craft: PatternCraft; result: TrendResult }

export const PRINTABLE_SCENARIOS: PrintableScenario[] = [
  // Kullanıcının ChatGPT'ye gönderdiği gerçek paketin trend verisi: Noel + cadı + dark academia karışımı burada doğdu.
  { id: "junk-journal-christmas", keyword: "junk journal kit", kind: "paper_craft", result: trend("junk journal kit", "printables", {
    kind: "paper_craft",
    metrics: { activeListings: 232_845, favoritesPerMonth: 30, newcomerShare: 0.5, digitalShare: 1, medianPriceUsd: 4.78, sampleSize: 48 },
    topTags: tags([["junk journal kit", 40], ["christmas ephemera", 14], ["junk journal", 12], ["folk witch junk journal", 9], ["house folio", 8], ["digital download", 8], ["junk journal pages", 7], ["ephemera pack", 6], ["dark academia journal", 5], ["printable journal kit", 5], ["instant download", 5], ["vintage ephemera", 4], ["scrapbook paper", 4]]),
    risingTags: rising([["cottage junk journal kit", 30], ["peculiar pages", 20], ["dark academia junk journal", 12]]),
    examples: [
      example("Christmas Ephemera Junk Journal Kit, Printable Vintage Holiday Papers, Digital Download", 2400, 300),
      example("Folk Witch Junk Journal Kit, House Folio, Printable Pages", 1500, 200),
      example("Cottage Junk Journal Kit, Peculiar Pages, Digital Collage Sheets", 900, 60),
      example("Dark Academia Junk Journal Kit, Library Ephemera", 700, 90)
    ],
    signals: { formats: formats([["commercial", 0.1], ["scrapbook_size", 0.15], ["letter", 0.2]]), bundleShare: 0.2, pageCountMedian: 17, ipRisks: [] }
  }) },
  { id: "digital-paper", keyword: "digital paper pack", kind: "paper_craft", result: trend("digital paper pack", "printables", {
    kind: "paper_craft",
    topTags: tags([["digital paper pack", 30], ["seamless pattern", 14], ["botanical digital paper", 10], ["watercolor floral paper", 8], ["scrapbook paper", 8], ["commercial use", 7], ["halloween digital paper", 6], ["boho digital paper", 5], ["printable paper", 5], ["instant download", 5]]),
    risingTags: rising([["wildflower digital paper", 25], ["mushroom pattern", 15]]),
    examples: [example("Botanical Digital Paper Pack, Seamless Watercolor Floral Patterns, Commercial Use", 1800, 150), example("Halloween Digital Paper, Spooky Seamless Patterns", 600, 40)],
    signals: { formats: formats([["commercial", 0.4], ["scrapbook_size", 0.6]]), bundleShare: 0.4, pageCountMedian: 12, ipRisks: [] }
  }) },
  { id: "planner", keyword: "printable planner", kind: "planner", result: trend("printable planner", "printables", {
    kind: "planner",
    topTags: tags([["printable planner", 40], ["daily planner", 18], ["weekly planner", 15], ["undated planner", 12], ["minimalist planner", 9], ["adhd planner", 8], ["habit tracker", 8], ["planner insert", 6], ["a5 planner", 5], ["instant download", 5]]),
    risingTags: rising([["adhd planner", 30], ["self care planner", 18]]),
    examples: [example("ADHD Planner Printable, Undated Daily Weekly Planner, A4 A5 Letter", 3000, 120), example("Minimalist Daily Planner Printable, Habit Tracker", 1200, 300)],
    signals: { formats: formats([["letter", 0.7], ["a4", 0.6], ["a5", 0.3], ["half_letter", 0.1], ["printer_friendly", 0.05]]), bundleShare: 0.35, pageCountMedian: 40, ipRisks: [] }
  }) },
  { id: "digital-planner", keyword: "digital planner", kind: "digital_planner", result: trend("digital planner", "printables", {
    kind: "digital_planner",
    topTags: tags([["digital planner", 40], ["ipad planner", 20], ["hyperlinked planner", 14], ["undated digital planner", 10], ["dark mode planner", 6], ["tablet planner", 6], ["android planner", 5], ["instant download", 4]]),
    risingTags: rising([["boho digital planner", 20], ["adhd digital planner", 14]]),
    examples: [example("Undated Digital Planner, iPad Planner, Hyperlinked PDF", 4000, 200), example("Boho Digital Planner, Dark Mode", 800, 50)],
    signals: { formats: formats([["tablet", 0.9], ["letter", 0.05]]), bundleShare: 0.2, pageCountMedian: 150, ipRisks: [] }
  }) },
  { id: "budget-planner", keyword: "budget planner printable", kind: "planner", result: trend("budget planner printable", "printables", {
    kind: "planner",
    topTags: tags([["budget planner", 30], ["budget planner printable", 20], ["finance planner", 10], ["savings tracker", 9], ["debt tracker", 8], ["bill tracker", 7], ["monthly budget", 7], ["paycheck budget", 5]]),
    risingTags: rising([["sinking funds tracker", 20], ["cash envelope", 12]]),
    examples: [example("Budget Planner Printable, Savings Tracker, Debt Payoff, Bill Tracker, US Letter A4", 2500, 260)],
    signals: { formats: formats([["letter", 0.6], ["a4", 0.5], ["a5", 0.2]]), bundleShare: 0.3, pageCountMedian: 25, ipRisks: [] }
  }) },
  { id: "adult-coloring", keyword: "adult coloring pages", kind: "coloring", result: trend("adult coloring pages", "printables", {
    kind: "coloring",
    topTags: tags([["adult coloring pages", 30], ["cozy coloring pages", 14], ["bold and easy", 10], ["cottagecore coloring", 8], ["halloween coloring", 7], ["christmas coloring", 7], ["mandala coloring", 6], ["printable coloring", 6], ["coloring book pdf", 5]]),
    risingTags: rising([["cozy christmas coloring", 25], ["bold easy coloring", 15]]),
    examples: [example("Cozy Coloring Pages for Adults, Bold and Easy, Printable PDF", 3000, 120), example("Christmas Cozy Coloring Book, 30 Pages", 800, 30)],
    signals: { formats: formats([["letter", 0.5], ["a4", 0.2], ["printer_friendly", 0.05]]), bundleShare: 0.2, pageCountMedian: 25, ipRisks: [] }
  }) },
  { id: "kids-coloring", keyword: "coloring pages for kids", kind: "coloring", result: trend("coloring pages for kids", "printables", {
    kind: "coloring",
    topTags: tags([["coloring pages for kids", 25], ["dinosaur coloring", 12], ["unicorn coloring", 10], ["easter coloring", 8], ["kids coloring book", 8], ["toddler coloring", 6], ["preschool printable", 5]]),
    risingTags: rising([["space coloring pages", 18]]),
    examples: [example("Dinosaur Coloring Pages for Kids, Printable PDF", 900, 100)],
    signals: { formats: formats([["letter", 0.5], ["a4", 0.3]]), bundleShare: 0.15, pageCountMedian: 20, ipRisks: [] }
  }) },
  { id: "wall-art", keyword: "printable wall art", kind: "wall_art", result: trend("printable wall art", "printables", {
    kind: "wall_art",
    topTags: tags([["printable wall art", 30], ["boho wall art", 14], ["botanical print", 12], ["abstract wall art", 10], ["set of 3 prints", 9], ["neutral wall art", 8], ["kitchen wall art", 6], ["digital download", 6]]),
    risingTags: rising([["vintage landscape print", 20], ["moody botanical", 12]]),
    examples: [example("Boho Botanical Wall Art Set of 3, Neutral Printable Prints", 2000, 200)],
    signals: { formats: formats([["ratio_sizes", 0.4], ["letter", 0.1]]), bundleShare: 0.4, ipRisks: [] }
  }) },
  { id: "recipe", keyword: "recipe card printable", kind: "recipe", result: trend("recipe card printable", "printables", {
    kind: "recipe",
    topTags: tags([["recipe card printable", 25], ["recipe cards", 14], ["farmhouse recipe card", 10], ["editable recipe card", 9], ["christmas recipe card", 6], ["recipe binder", 6], ["4x6 recipe card", 5]]),
    risingTags: rising([["heirloom recipe book", 15]]),
    examples: [example("Farmhouse Recipe Cards, Editable 4x6 Recipe Card Printable", 1200, 220)],
    signals: { formats: formats([["editable", 0.5], ["card_sizes", 0.2], ["letter", 0.3]]), bundleShare: 0.2, pageCountMedian: 12, ipRisks: [] }
  }) },
  { id: "bridal-games", keyword: "bridal shower games", kind: "party", result: trend("bridal shower games", "printables", {
    kind: "party",
    topTags: tags([["bridal shower games", 30], ["boho bridal shower", 12], ["floral bridal shower", 10], ["bridal shower bundle", 9], ["editable games", 7], ["bachelorette games", 6], ["he said she said", 5]]),
    risingTags: rising([["minimalist bridal shower", 15], ["coastal bridal shower", 10]]),
    examples: [example("Boho Bridal Shower Games Bundle, Printable Games, Editable", 1600, 160)],
    signals: { formats: formats([["editable", 0.6], ["letter", 0.2]]), bundleShare: 0.5, pageCountMedian: 10, ipRisks: [] }
  }) },
  { id: "reading-journal", keyword: "reading journal printable", kind: "journal", result: trend("reading journal printable", "printables", {
    kind: "journal",
    topTags: tags([["reading journal", 25], ["book journal", 14], ["reading tracker", 12], ["book lover gift", 8], ["dark academia journal", 6], ["book review template", 6], ["reading log", 6]]),
    risingTags: rising([["cozy reading journal", 18], ["romance reader journal", 10]]),
    examples: [example("Reading Journal Printable, Book Tracker, Book Review Pages, A5 Letter", 1400, 180)],
    signals: { formats: formats([["letter", 0.5], ["a5", 0.4], ["tablet", 0.1]]), bundleShare: 0.15, pageCountMedian: 30, ipRisks: [] }
  }) },
  { id: "kids-activity", keyword: "kids activity pages", kind: "kids", result: trend("kids activity pages", "printables", {
    kind: "kids",
    topTags: tags([["kids activity pages", 20], ["preschool worksheets", 14], ["busy book", 12], ["halloween activity", 8], ["christmas activity pages", 8], ["toddler activities", 7], ["learning printable", 6]]),
    risingTags: rising([["christmas busy book", 22]]),
    examples: [example("Christmas Activity Pages for Kids, Preschool Busy Book Printable", 700, 40)],
    signals: { formats: formats([["letter", 0.5], ["a4", 0.3]]), bundleShare: 0.2, pageCountMedian: 30, ipRisks: [] }
  }) },
  { id: "baby-shower", keyword: "baby shower games printable", kind: "party", result: trend("baby shower games printable", "printables", {
    kind: "party",
    topTags: tags([["baby shower games", 30], ["woodland baby shower", 10], ["gender neutral shower", 9], ["baby shower bingo", 8], ["boho baby shower", 7], ["printable games", 6]]),
    risingTags: rising([["little cutie baby shower", 12]]),
    examples: [example("Woodland Baby Shower Games Bundle, Printable", 1300, 200)],
    signals: { formats: formats([["editable", 0.4], ["letter", 0.3]]), bundleShare: 0.5, pageCountMedian: 12, ipRisks: [] }
  }) },
  { id: "self-care-journal", keyword: "self care journal printable", kind: "journal", result: trend("self care journal printable", "printables", {
    kind: "journal",
    topTags: tags([["self care journal", 25], ["mental health journal", 14], ["gratitude journal", 12], ["wellness journal", 8], ["mindfulness journal", 7], ["daily affirmations", 5]]),
    risingTags: rising([["shadow work journal", 20]]),
    examples: [example("Self Care Journal Printable, Gratitude, Mental Health Pages", 2200, 250)],
    signals: { formats: formats([["letter", 0.6], ["a5", 0.3]]), bundleShare: 0.2, pageCountMedian: 50, ipRisks: [] }
  }) }
];

export const PATTERN_SCENARIOS: PatternScenario[] = [
  { id: "crochet-cardigan", keyword: "crochet cardigan pattern", craft: "crochet", result: trend("crochet cardigan pattern", "patterns", {
    craft: "crochet",
    topTags: tags([["crochet cardigan pattern", 40], ["granny square cardigan", 12], ["oversized cardigan", 9], ["crochet cardigan", 8], ["boho cardigan", 6], ["chunky cardigan", 5], ["beginner crochet", 5], ["granny square", 5], ["sage green cardigan", 3], ["plus size cardigan", 4], ["crochet sweater", 4], ["cotton yarn", 2]]),
    risingTags: rising([["patchwork cardigan", 30], ["cropped cardigan", 22], ["puff sleeve cardigan", 10]]),
    examples: [example("Oversized Granny Square Cardigan Crochet Pattern, Boho Patchwork Jacket, XS-5XL", 3000, 90), example("Chunky Cropped Cardigan Crochet Pattern in Cream and Sage", 800, 40)],
    signals: { formats: formats([["video", 0.1]]), bundleShare: 0.1, ipRisks: [] }
  }) },
  { id: "crochet-doily", keyword: "crochet doily pattern", craft: "crochet", result: trend("crochet doily pattern", "patterns", {
    craft: "crochet",
    topTags: tags([["crochet doily pattern", 30], ["vintage doily", 12], ["pineapple doily", 9], ["round doily", 8], ["thread crochet", 7], ["christmas doily", 6], ["lace doily", 6]]),
    risingTags: rising([["mandala doily", 15]]),
    examples: [example("Vintage Pineapple Doily Crochet Pattern, Round Lace Doily PDF", 900, 300)]
  }) },
  { id: "amigurumi", keyword: "amigurumi pattern", craft: "crochet", result: trend("amigurumi pattern", "patterns", {
    craft: "crochet",
    topTags: tags([["amigurumi pattern", 30], ["crochet bunny", 14], ["easter amigurumi", 9], ["crochet animal", 9], ["no sew amigurumi", 8], ["halloween amigurumi", 7], ["crochet toy", 7]]),
    risingTags: rising([["low sew amigurumi", 18], ["crochet ghost", 14]]),
    examples: [example("No Sew Bunny Amigurumi Pattern, Easter Crochet Toy", 1500, 120), example("Crochet Ghost Pattern, Halloween Amigurumi", 1100, 50)]
  }) },
  { id: "crochet-bag", keyword: "crochet bag pattern", craft: "crochet", result: trend("crochet bag pattern", "patterns", {
    craft: "crochet",
    topTags: tags([["crochet bag pattern", 30], ["crochet tote bag", 14], ["granny square bag", 10], ["market bag", 9], ["summer bag", 7], ["boho bag", 6], ["cotton yarn", 4]]),
    risingTags: rising([["shoulder bag", 15], ["mesh bag", 12]]),
    examples: [example("Granny Square Tote Bag Crochet Pattern, Summer Market Bag", 1700, 150)]
  }) },
  { id: "knit-sweater", keyword: "knitting sweater pattern", craft: "knitting", result: trend("knitting sweater pattern", "patterns", {
    craft: "knitting",
    topTags: tags([["knitting sweater pattern", 30], ["raglan sweater", 12], ["top down sweater", 11], ["chunky sweater", 9], ["fair isle sweater", 8], ["christmas sweater", 6], ["worsted weight", 5]]),
    risingTags: rising([["cable knit sweater", 18], ["mohair sweater", 12]]),
    examples: [example("Top Down Raglan Sweater Knitting Pattern, Chunky Knit, XS-4XL", 2000, 200)]
  }) },
  { id: "cross-stitch", keyword: "cross stitch pattern", craft: "cross_stitch", result: trend("cross stitch pattern", "patterns", {
    craft: "cross_stitch",
    topTags: tags([["cross stitch pattern", 40], ["christmas cross stitch", 14], ["halloween cross stitch", 12], ["funny cross stitch", 10], ["floral cross stitch", 9], ["modern cross stitch", 8], ["beginner cross stitch", 6]]),
    risingTags: rising([["christmas ornament", 20], ["witchy cross stitch", 14]]),
    examples: [example("Christmas Cross Stitch Pattern, Ornament PDF, Beginner", 2200, 60), example("Witchy Halloween Cross Stitch Pattern", 900, 70)]
  }) },
  { id: "embroidery", keyword: "embroidery pattern", craft: "embroidery", result: trend("embroidery pattern", "patterns", {
    craft: "embroidery",
    topTags: tags([["embroidery pattern", 30], ["hand embroidery", 14], ["floral embroidery", 12], ["botanical embroidery", 9], ["beginner embroidery", 8], ["wildflower embroidery", 7]]),
    risingTags: rising([["mushroom embroidery", 14]]),
    examples: [example("Wildflower Hand Embroidery Pattern PDF, Beginner Floral", 1800, 200)]
  }) },
  { id: "sewing", keyword: "sewing pattern pdf", craft: "sewing", result: trend("sewing pattern pdf", "patterns", {
    craft: "sewing",
    topTags: tags([["sewing pattern pdf", 47], ["beginner sewing", 16], ["pdf sewing pattern", 10], ["instant download", 8], ["bag sewing pattern", 7], ["easy sewing pattern", 6], ["tote bag pattern", 5], ["diy tote bag", 4]]),
    risingTags: rising([["reversible tote bag", 40], ["lined tote bag", 20]]),
    examples: [example("Reversible Tote Bag Sewing Pattern, Lined Tote with Pockets, Canvas Bag", 900, 60)]
  }) },
  { id: "macrame", keyword: "macrame pattern", craft: "macrame", result: trend("macrame pattern", "patterns", {
    craft: "macrame",
    topTags: tags([["macrame pattern", 30], ["macrame wall hanging", 14], ["macrame plant hanger", 12], ["boho decor", 8], ["macrame tutorial", 7]]),
    risingTags: rising([["macrame feather", 12]]),
    examples: [example("Macrame Wall Hanging Pattern, Boho Decor PDF Tutorial", 800, 200)]
  }) },
  { id: "punch-needle", keyword: "punch needle pattern", craft: "punch_needle", result: trend("punch needle pattern", "patterns", {
    craft: "punch_needle",
    topTags: tags([["punch needle pattern", 25], ["punch needle mug rug", 10], ["mushroom punch needle", 8], ["punch needle pillow", 7], ["beginner punch needle", 6]]),
    risingTags: rising([["punch needle coaster", 12]]),
    examples: [example("Mushroom Punch Needle Pattern, Mug Rug PDF", 500, 100)]
  }) },
  { id: "granny-square", keyword: "granny square pattern", craft: "crochet", result: trend("granny square pattern", "patterns", {
    craft: "crochet",
    topTags: tags([["granny square pattern", 30], ["flower granny square", 12], ["sunburst granny square", 10], ["solid granny square", 8], ["christmas granny square", 6], ["easter granny square", 5]]),
    risingTags: rising([["3d flower square", 14]]),
    examples: [example("Flower Granny Square Crochet Pattern, Sunburst Square", 1400, 150)]
  }) }
];

export const PRODUCT_INPUTS: Array<{ id: string; raw: Record<string, unknown>; keywords: string[] }> = [
  { id: "silver-tesbih", keywords: ["sterling silver prayer beads", "silver tasbih", "islamic gift for men"], raw: { titleTr: "925 Ayar Gümüş Özel Tasarım Kafesli Tespih - Kral Zincir Püsküllü", origin: "designed_by_seller", materialVerified: true, weightGrams: 45, beadCount: 33, priceTry: 5000, shippingTry: 1200, usdTryRate: 40 } },
  { id: "amber-tesbih", keywords: ["amber prayer beads", "worry beads"], raw: { titleTr: "Damla kehribar tesbih 33'lük", origin: "made_by_seller", beadCount: 33, priceTry: 3000, usdTryRate: 40 } },
  { id: "oltu", keywords: ["oltu stone prayer beads"], raw: { titleTr: "Erzurum'un Oltu taşı ile Turuncu Galalit Malzeme", categoryHint: "tesbih", origin: "made_by_seller" } },
  { id: "crochet-sweater", keywords: ["crochet sweater", "oversized crochet sweater"], raw: { titleTr: "Tığ işi krem oversize kazak", origin: "made_by_seller", productKind: "knitwear", fiber: "%100 pamuk", size: "m", chestCm: 52, lengthCm: 60, colors: ["Cream"], audience: "women", priceTry: 2500, shippingTry: 900, usdTryRate: 40 } },
  { id: "knit-beanie", keywords: ["hand knit beanie"], raw: { titleTr: "El örgüsü yün bere", origin: "made_by_seller", productKind: "knitwear", fiber: "%100 yün", colors: ["Hardal"], priceTry: 900, usdTryRate: 40 } },
  { id: "copper-tray", keywords: ["vintage copper tray", "turkish copper"], raw: { titleTr: "Vintage bakır tepsi", origin: "vintage", productKind: "vintage", yearMade: 1975, lengthCm: 40, widthCm: 30, conditionLevel: "light_wear", priceTry: 2200, usdTryRate: 40 } },
  { id: "kilim-pillow", keywords: ["vintage kilim pillow"], raw: { titleTr: "Vintage kilim yastık kılıfı", origin: "vintage", productKind: "vintage", yearMade: 1980, lengthCm: 50, widthCm: 50, priceTry: 1500, usdTryRate: 40 } }
];

export interface OutputSample {
  id: string;
  studio: "printable" | "pattern" | "product" | "marketing" | "shop";
  kind?: PrintableKind;
  craft?: PatternCraft;
  field: string;
  text: string;
  listing?: { title: string; tags: string[]; description: string; materials?: string[]; digital: boolean };
}

const NONCES = ["a", "b", "c"];
// Sabit tarih: bayram zamanlaması (29 Ekim: Cadılar Bayramı geç, Noel uygun) her çalıştırmada aynı olsun.
export const MATRIX_NOW = Date.UTC(2026, 9, 29, 12);

export function printableOutputs(): Array<{ id: string; kind: PrintableKind; brief: ReturnType<typeof buildPrintableBrief>; listing: ReturnType<typeof buildPrintableListing>; input: ReturnType<typeof normalizePrintablePlanInput> }> {
  return PRINTABLE_SCENARIOS.flatMap((scenario) => NONCES.map((nonce) => {
    const seed = buildPatternSeed(scenario.keyword, scenario.result, { kindHint: scenario.kind, groupHint: "printables", nonce, now: MATRIX_NOW });
    // Telefon uygulamasının /api/printables/plan'a gönderdiği alanların aynısı.
    const input = normalizePrintablePlanInput({ kind: seed.kind, productType: seed.productType, referenceNotes: seed.referenceNotes, colors: seed.colors, formats: seed.formats, pageCount: seed.pageCount, audience: seed.audience, keyword: seed.keyword, trendTags: seed.trendTags, trendFeatures: seed.trendFeatures, seed: nonce });
    const brief = buildPrintableBrief(input);
    return { id: `${scenario.id}/${nonce}`, kind: scenario.kind, brief, listing: buildPrintableListing(input, brief.name), input };
  }));
}

export function patternOutputs(): Array<{ id: string; craft: PatternCraft; brief: ReturnType<typeof buildPatternBrief>; listing: ReturnType<typeof buildDigitalListing> }> {
  return PATTERN_SCENARIOS.flatMap((scenario) => NONCES.map((nonce) => {
    const seed = buildPatternSeed(scenario.keyword, scenario.result, { craftHint: scenario.craft, groupHint: "patterns", nonce, now: MATRIX_NOW });
    const raw = { craft: seed.craft, productType: seed.productType, referenceNotes: seed.referenceNotes, referenceSource: "trend", referenceColors: seed.referenceColors, skillLevel: seed.skillLevel, sizeNote: seed.sizeNote, yarnNote: seed.yarnNote, colors: seed.colors, keyword: seed.keyword, trendTags: seed.trendTags, trendFeatures: seed.trendFeatures, seed: nonce };
    const brief = buildPatternBrief(normalizePatternPlanInput(raw));
    return { id: `${scenario.id}/${nonce}`, craft: scenario.craft, brief, listing: buildDigitalListing(normalizeDigitalListingInput({ ...raw, name: brief.name })) };
  }));
}

export function productOutputs() {
  return PRODUCT_INPUTS.map((item) => {
    const product = normalizeProductInput(item.raw);
    return { id: item.id, plan: buildProductPlan(product, item.keywords, [], { usdTryRate: 40 }) };
  });
}

export async function marketingOutputs() {
  const inputs = [
    { productName: "925 gümüş tesbih", kind: "tesbih", channel: "etsy", priceUsd: 120, profitTry: 1500, activeEtsyListings: 6, photoCount: 8 },
    { productName: "Cozy Christmas junk journal kit", kind: "pdf", channel: "etsy", priceUsd: 4.49, activeEtsyListings: 3, photoCount: 10 },
    { productName: "Tığ işi kazak", kind: "knitwear", channel: "shopier", priceTry: 2500, profitTry: 900, whatsappNumber: "+90 555 123 45 67", link: "https://www.shopier.com/gxl/1" },
    { productName: "Vintage bakır tepsi", kind: "vintage", channel: "shopier", priceTry: 2200, profitTry: 700 }
  ];
  return await Promise.all(inputs.map(async (raw, index) => ({ id: `marketing-${index}`, plan: await buildMarketingPlan(normalizeMarketingInput(raw)) })));
}

// Tüm üretilmiş metinler tek düz listede: denetleyici ve ajan incelemesi için.
export async function allOutputSamples(): Promise<OutputSample[]> {
  const samples: OutputSample[] = [];
  for (const item of printableOutputs()) {
    samples.push({ id: item.id, studio: "printable", kind: item.kind, field: "masterPrompt", text: item.brief.masterPrompt });
    samples.push({ id: item.id, studio: "printable", kind: item.kind, field: "listing", text: [item.listing.title, item.listing.tags.join(", "), item.listing.description].join("\n\n"), listing: { ...item.listing, digital: true } });
    item.brief.pins.forEach((pin, index) => samples.push({ id: item.id, studio: "printable", kind: item.kind, field: `pin${index + 1}`, text: `${pin.title}\n${pin.description}` }));
  }
  for (const item of patternOutputs()) {
    samples.push({ id: item.id, studio: "pattern", craft: item.craft, field: "masterPrompt", text: item.brief.masterPrompt });
    samples.push({ id: item.id, studio: "pattern", craft: item.craft, field: "listing", text: [item.listing.title, item.listing.tags.join(", "), item.listing.description].join("\n\n"), listing: { ...item.listing, digital: true } });
  }
  for (const item of productOutputs()) {
    samples.push({ id: item.id, studio: "product", field: "listing", text: [item.plan.title, item.plan.tags.join(", "), item.plan.description].join("\n\n"), listing: { title: item.plan.title, tags: item.plan.tags, description: item.plan.description, materials: item.plan.materials, digital: false } });
  }
  for (const item of await marketingOutputs()) {
    for (const channel of item.plan.channels) for (const block of channel.copy) samples.push({ id: `${item.id}/${channel.id}`, studio: "marketing", field: block.labelTr, text: block.text });
  }
  for (const [id, preset] of Object.entries(SHOP_PRESETS)) {
    samples.push({ id: `shop-${id}`, studio: "shop", field: "shop", text: [preset.title, preset.announcement, preset.saleMessage, preset.digitalSaleMessage, preset.sections.join(", ")].join("\n\n") });
  }
  return samples;
}

// Otomatik denetleyicinin tüm örnek set üzerindeki raporu (her çıktı telefona gitmeden önce bu denetimden geçer).
export async function guardReports(): Promise<Array<{ id: string; studio: string; report: GuardReport }>> {
  const rows: Array<{ id: string; studio: string; report: GuardReport }> = [];
  for (const item of printableOutputs()) rows.push({ id: item.id, studio: "printable", report: guardPrintablePlan(item.brief, item.listing, { kind: item.kind, formats: item.input.formats }).quality });
  for (const item of patternOutputs()) rows.push({ id: item.id, studio: "pattern", report: guardPatternPlan(item.brief, item.listing, { craft: item.craft }).quality });
  for (const item of productOutputs()) rows.push({ id: item.id, studio: "product", report: guardProductPlan(item.plan).quality });
  for (const item of await marketingOutputs()) rows.push({ id: item.id, studio: "marketing", report: guardMarketingPlan(item.plan).quality });
  return rows;
}
