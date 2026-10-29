import assert from "node:assert/strict";
import test from "node:test";
import { guardMarketingPlan, guardPatternPlan, guardPrintablePlan, guardProductPlan, repairText } from "../../worker/src/output-guard.js";
import { buildMarketingPlan, normalizeMarketingInput } from "../../worker/src/marketing-plan.js";
import { buildPatternSeed } from "../../worker/src/pattern-seed.js";
import { buildDigitalListing, buildPatternBrief, coinProductName, gradedSizes, normalizeDigitalListingInput, normalizePatternPlanInput } from "../../worker/src/pattern-studio.js";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { buildProductPlan, normalizeProductInput } from "../../worker/src/product-studio.js";
import { fitsTheme, harmonizeThemes, holidayOutOfWindow, proseCase, themeFamilies } from "../../worker/src/theme.js";
import { guardReports, marketingOutputs, MATRIX_NOW, PATTERN_SCENARIOS, patternOutputs, PRINTABLE_SCENARIOS, printableOutputs, productOutputs } from "./fixtures/output-matrix.js";

// Uygulamanın ürettiği her metin telefona gitmeden önce otomatik denetimden geçer. Bu testler, gerçek Etsy aramalarına
// benzeyen 25+ senaryonun her birini 3 farklı tohumla üretir ve denetleyicinin hiçbir hata bulmamasını şart koşar.

test("every generated package, listing, pin and post passes the automatic check with no errors", async () => {
  const rows = await guardReports();
  assert.ok(rows.length >= 80, `${rows.length} outputs`);
  const failing = rows.filter((row) => !row.report.ok).map((row) => `${row.id}: ${row.report.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code} (${issue.excerpt || issue.messageTr})`).join("; ")}`);
  assert.deepEqual(failing, []);
  assert.ok(rows.reduce((sum, row) => sum + row.report.checks, 0) > 5000);
});

test("generators write clean text at the source, so the checker has nothing left to repair", async () => {
  const repaired = [
    ...printableOutputs().filter((item) => guardPrintablePlan(item.brief, item.listing, { kind: item.kind, formats: item.input.formats }).quality.fixed.length).map((item) => item.id),
    ...patternOutputs().filter((item) => guardPatternPlan(item.brief, item.listing, { craft: item.craft }).quality.fixed.length).map((item) => item.id),
    ...productOutputs().filter((item) => guardProductPlan(item.plan).quality.fixed.length).map((item) => item.id),
    ...(await marketingOutputs()).filter((item) => guardMarketingPlan(item.plan).quality.fixed.length).map((item) => item.id)
  ];
  assert.deepEqual(repaired, []);
});

test("the Christmas junk journal package that went to ChatGPT is now one coherent theme with a full kit", () => {
  const item = printableOutputs().find((row) => row.id === "junk-journal-christmas/a")!;
  const master = item.brief.masterPrompt;
  // Tema: Noel ürününe cadı, dark academia veya Cadılar Bayramı girmez.
  assert.doesNotMatch(master, /witch|dark academia|halloween|occult/i);
  assert.match(master, /Theme: one theme for the whole product: .*Christmas/);
  // Görsel konuları satış kelimesi değil, çizilebilir konular.
  assert.ok(item.brief.artSubjects.length >= 8);
  for (const subject of item.brief.artSubjects) assert.doesNotMatch(subject.toLowerCase(), /\b(download|junk journal|journal|commercial|seamless|kit|pdf)\b/, subject);
  // Kit: kâğıtlar, süs sayfaları ve kapak görseli; sayfa bütçesi toplamı ürün boyutuna eşit.
  assert.match(master, /B\d+\. Ephemera sheet 1: /);
  assert.match(master, /B\d+\. Cover artwork: /);
  const size = Number(/- Size: (\d+) core pages/.exec(master)![1]);
  const budget = master.match(/### Page budget \(follow exactly\)\n((?:- .*\n?)+)/)![1].split("\n").filter((line) => /^- \d+ /.test(line)).reduce((sum, line) => sum + Number(/^- (\d+)/.exec(line)![1]), 0);
  assert.equal(budget, size);
  // Tam sayfa kâğıtlar altbilgi/sayfa numarası taşımaz; lisans tek ve kişisel kullanım.
  assert.match(master, /full-bleed artwork with no footer, page number, title or watermark/);
  assert.doesNotMatch(master, /consistent page numbers and footer on every page/);
  assert.doesNotMatch(master.replace(/- Never offer or mention a commercial-use license[^\n]*/, ""), /commercial-use license option|state them clearly on the cover/);
  assert.match(master, /For personal use only/);
  // Rakip ilan görseli veya telifli görsel referans alınmaz; ad değiştirilemez; 20 MB/5 dosya kuralı açık.
  assert.match(master, /Never use another seller's Etsy listing, photos or Pinterest pins, or any copyrighted image, as a reference/);
  assert.doesNotMatch(master, /you may refine it/);
  assert.match(master, /Upload set: .*12x12-Papers\.zip .*Ephemera\.zip/);
  // Kontrol listesi bu ürüne uyar: saat sırası ve tablet bağlantısı kontrolü yok.
  assert.doesNotMatch(master, /AM\/PM|LINKS —/);
  assert.match(master, /TEXT-FREE ART — patterned papers, solid papers and ephemera sheets/);
  // İlan: tek tema, yanıltıcı ifade yok, başlıkta tekrar yok.
  assert.ok(!item.listing.tags.some((tag) => /witch|academia|halloween|commercial/.test(tag)), item.listing.tags.join(", "));
  assert.equal(item.listing.tags.length, 13);
  assert.doesNotMatch(item.listing.title, /Junk Journal Kit.*Junk Journal Kit/);
});

test("the checker catches the defects found in the package the user sent to ChatGPT", () => {
  const old = [
    "## Brief A - product files",
    "### Product",
    "- Buyer-favored features: Christmas ephemera, folk witch and house folio",
    "To outsell the top listings: offer US Letter size, a commercial-use license option, 12x12 in scrapbook sheets and state them clearly on the cover and in the listing.",
    "### Working name",
    "Cream Udisen Junk Journal Kit (you may refine it, but it must stay original).",
    "- US English spelling, no typos, consistent page numbers and footer on every page.",
    "## Brief B - artwork (one image per reply)",
    "B1. Paper 1: seamless repeating pattern of christmas ephemera, mustard, teal, cream.",
    "B8. Paper 8: seamless repeating pattern of dark academia, mustard, teal, cream."
  ].join("\n");
  const brief = { masterPrompt: old, pdfPrompt: old, pins: [], artSubjects: ["christmas ephemera", "junk journal", "download", "dark academia"] };
  const listing = { title: "Junk Journal Kit, Cream Udisen Junk Journal Kit, Junk Journal Kit Pages", tags: ["christmas ephemera", "halloween journal", "commercial use"], description: "an original christmas kit in a orange palette." };
  const { quality } = guardPrintablePlan(brief, listing, { kind: "paper_craft" });
  const codes = new Set(quality.issues.map((issue) => issue.code));
  assert.equal(quality.ok, false);
  for (const code of ["license_conflict", "name_drift", "reference_rule", "footer_conflict", "theme_mix", "meta_subject", "title_stuffing", "tag_theme", "misleading", "etsy_rules", "digital_notice"]) assert.ok(codes.has(code), code);
});

test("small mistakes are repaired before the text leaves the server", () => {
  assert.equal(repairText("in a orange  and blush palette , ready"), "in an orange and blush palette, ready");
  assert.equal(repairText("A elegant set for a USB drive and a US Letter page"), "An elegant set for a USB drive and a US Letter page");
  assert.equal(repairText("a christmas kit for \"christmas junk journal\" buyers", { prose: true }), "a Christmas kit for \"christmas junk journal\" buyers");
  assert.equal(proseCase("see Planner-US-Letter.pdf on www.etsy.com, made for ipad"), "see Planner-US-Letter.pdf on www.etsy.com, made for iPad");
});

test("themes: one holiday per product, its season allowed, events kept apart, late holidays dropped", () => {
  const harmony = harmonizeThemes(["christmas ephemera", "folk witch", "house folio", "cottage", "dark academia", "winter village"]);
  assert.deepEqual(harmony.kept, ["christmas ephemera", "house folio", "cottage", "winter village"]);
  assert.deepEqual(harmony.dropped, ["folk witch", "dark academia"]);
  assert.equal(fitsTheme("halloween coloring", themeFamilies("christmas")), false);
  assert.equal(fitsTheme("snowy winter", themeFamilies("christmas")), true);
  assert.equal(fitsTheme("bachelorette games", themeFamilies("bridal shower games")), false);
  // 29 Ekim: Cadılar Bayramı 2 gün sonra (yeni dijital ürün için geç), Noel 57 gün sonra (uygun).
  assert.equal(holidayOutOfWindow("halloween", "printable", MATRIX_NOW)?.daysUntil, 2);
  assert.equal(holidayOutOfWindow("christmas", "printable", MATRIX_NOW), undefined);
  const amigurumi = PATTERN_SCENARIOS.find((row) => row.id === "amigurumi")!;
  const seed = buildPatternSeed(amigurumi.keyword, amigurumi.result, { craftHint: "crochet", nonce: "a", now: MATRIX_NOW });
  assert.ok(!seed.trendFeatures.some((feature) => /halloween|ghost|easter/.test(feature)), seed.trendFeatures.join(", "));
  assert.ok(seed.trendFeatures.includes("no-sew"), seed.trendFeatures.join(", "));
  const coloring = PRINTABLE_SCENARIOS.find((row) => row.id === "adult-coloring")!;
  for (const nonce of ["a", "b", "c"]) {
    const coloringSeed = buildPatternSeed(coloring.keyword, coloring.result, { kindHint: "coloring", nonce, now: MATRIX_NOW });
    assert.ok(!coloringSeed.trendFeatures.some((feature) => /halloween/.test(feature)), coloringSeed.trendFeatures.join(", "));
    assert.ok(!coloringSeed.trendTags.some((tag) => /halloween/.test(tag)), coloringSeed.trendTags.join(", "));
  }
});

test("seeds never chop words or turn a holiday or adjective into the product", () => {
  const cross = PATTERN_SCENARIOS.find((row) => row.id === "cross-stitch")!;
  const crossSeed = buildPatternSeed(cross.keyword, cross.result, { craftHint: "cross_stitch", nonce: "a", now: MATRIX_NOW });
  assert.doesNotMatch(crossSeed.productType, /christma\b|^funny$|^floral$/);
  const embroidery = PATTERN_SCENARIOS.find((row) => row.id === "embroidery")!;
  const embroiderySeed = buildPatternSeed(embroidery.keyword, embroidery.result, { craftHint: "embroidery", nonce: "a", now: MATRIX_NOW });
  assert.match(embroiderySeed.productType, /hoop art$/);
  const bridal = PRINTABLE_SCENARIOS.find((row) => row.id === "bridal-games")!;
  for (const nonce of ["a", "b", "c"]) {
    const seed = buildPatternSeed(bridal.keyword, bridal.result, { kindHint: "party", nonce, now: MATRIX_NOW });
    assert.ok(!seed.trendFeatures.some((feature) => /^said she said$|bachelorette|editable/.test(feature)), seed.trendFeatures.join(", "));
  }
  const paper = PRINTABLE_SCENARIOS.find((row) => row.id === "digital-paper")!;
  const paperSeed = buildPatternSeed(paper.keyword, paper.result, { kindHint: "paper_craft", nonce: "a", now: MATRIX_NOW });
  assert.ok(!paperSeed.trendFeatures.some((feature) => /commercial/.test(feature)));
  assert.ok(!paperSeed.trendTags.some((tag) => /commercial/.test(tag)));
  assert.doesNotMatch(paperSeed.referenceNotes, /commercial-use license|video tutorial|editable template/);
});

test("pattern packages follow their own craft, and listed sizes are all graded", () => {
  const cross = buildPatternBrief(normalizePatternPlanInput({ craft: "cross_stitch", productType: "ornament", seed: "x" }));
  assert.doesNotMatch(cross.masterPrompt, /rep from \*|STITCH MATH|hook/);
  assert.match(cross.masterPrompt, /CHART — every symbol in the chart is in the color key/);
  assert.match(cross.masterPrompt, /14, 16 and 18 count/);
  const sewing = buildPatternBrief(normalizePatternPlanInput({ craft: "sewing", productType: "tote bag", seed: "x" }));
  assert.match(sewing.masterPrompt, /TILING — the page-assembly map/);
  assert.match(sewing.masterPrompt, /A0 copy-shop file/);
  const macrame = buildPatternBrief(normalizePatternPlanInput({ craft: "macrame", productType: "wall hanging", seed: "x" }));
  assert.match(macrame.masterPrompt, /CORDS — the cord count and the cut lengths/);
  const punch = buildPatternBrief(normalizePatternPlanInput({ craft: "punch_needle", productType: "mug rug", seed: "x" }));
  assert.doesNotMatch(punch.masterPrompt, /radial repeat|cup or ruffle/);
  assert.deepEqual(gradedSizes("Plus Size, XS-5XL"), ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]);
  const cardigan = buildPatternBrief(normalizePatternPlanInput({ craft: "crochet", productType: "cardigan", sizeNote: "XS-5XL", seed: "x" }));
  assert.match(cardigan.masterPrompt, /Grade every listed size \(XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL\)/);
  const toy = buildPatternBrief(normalizePatternPlanInput({ craft: "crochet", productType: "bunny", seed: "x" }));
  assert.match(toy.masterPrompt, /Safety: for babies and children under 3, use embroidered eyes/);
  const listing = buildDigitalListing(normalizeDigitalListingInput({ craft: "crochet", productType: "bunny", name: "Mila Bunny" }));
  assert.match(listing.description, /use embroidered eyes instead of safety eyes/);
});

test("coined product names never form rude, gloomy or real words and never carry conditions or brands", () => {
  for (let index = 0; index < 400; index += 1) {
    const name = coinProductName({ productType: "planner", salt: `s${index}`, accents: ["adhd", "ipad", "sage", "bachelorette"] });
    assert.doesNotMatch(name, /semen|sullen|penis|linen|adhd|ipad|bachelorette/i, name);
  }
});

test("listings only claim what the product really has", () => {
  const coloring = buildPrintableListing({ kind: "coloring", productType: "adult coloring pages", keyword: "adult coloring pages", trendFeatures: ["cozy"], trendTags: ["cozy coloring pages", "mandala coloring", "halloween coloring", "christmas coloring", "adult printable"], colors: ["blush", "cream"], pageCount: 30 }, "Cozy Otasie Adult Coloring Pages");
  assert.ok(!coloring.tags.some((tag) => /mandala|halloween|christmas|blush|cream|^adult printable$/.test(tag)), coloring.tags.join(", "));
  const recipe = buildPrintableListing({ kind: "recipe", productType: "recipe card", keyword: "recipe card printable", trendFeatures: ["farmhouse", "editable"], trendTags: ["editable recipe card", "farmhouse recipe card"] }, "Ivory Gladery Recipe Card");
  assert.ok(!`${recipe.title} ${recipe.tags.join(" ")}`.includes("editable"));
  const planner = buildPrintableListing({ kind: "digital_planner", productType: "digital planner", keyword: "digital planner", formats: ["Landscape tablet PDF (iPad / Android tablets)"] }, "Nunnora Digital Planner");
  assert.match(planner.description, /ready to use in a note-taking app on your tablet/);
  assert.match(planner.description, /Import the PDF into a note-taking app/);
  assert.ok(!planner.tags.includes("printable planner"));
  const kids = buildPrintableBrief({ kind: "kids", productType: "kids activity pages", seed: "k" });
  assert.match(kids.pdfPrompt, /For personal and single-classroom use/);
  const journal = buildPrintableBrief({ kind: "journal", productType: "self care journal", trendFeatures: ["shadow work"], seed: "j" });
  assert.match(journal.pdfPrompt, /not medical advice or a substitute for professional care/);
});

test("English posts never carry Turkish names, and the Turkish meaning matches the post", async () => {
  for (const raw of [{ productName: "925 gümüş tesbih", kind: "tesbih", channel: "etsy" }, { productName: "Bütçe planlayıcı", kind: "pdf", channel: "etsy" }, { productName: "Tığ işi kazak", kind: "knitwear", channel: "shopier", priceTry: 2500 }]) {
    const { plan, quality } = guardMarketingPlan(await buildMarketingPlan(normalizeMarketingInput(raw)));
    assert.equal(quality.ok, true, JSON.stringify(quality.issues));
    for (const channel of plan.channels) for (const block of channel.copy) {
      if (/İngilizce|Pin başlığı/.test(block.labelTr)) assert.doesNotMatch(block.text, /[çğıöşÇĞİÖŞ]|gümüş|tesbih\b|kazak/, block.text);
      assert.doesNotMatch(block.text, /\[(fiyat|Shopier bağlantısı)\]|link in bio\)?\s*$|stokta sınırlı|#antika/i, block.text);
    }
  }
  const facebook = (await buildMarketingPlan(normalizeMarketingInput({ productName: "Budget planner", kind: "pdf", channel: "etsy" }))).channels.find((channel) => channel.id === "facebook")!;
  assert.doesNotMatch(facebook.copy[0].text, /link in bio/);
});

test("physical listings open with a sentence, not a copy of the title, and never repeat a title phrase", () => {
  const plan = buildProductPlan(normalizeProductInput({ titleTr: "925 Ayar Gümüş Özel Tasarım Kafesli Tespih - Kral Zincir Püsküllü", origin: "designed_by_seller", materialVerified: true, weightGrams: 45, beadCount: 33 }), ["sterling silver prayer beads", "islamic gift for men"], [], {});
  assert.notEqual(plan.description.split("\n")[0], plan.title);
  assert.match(plan.description.split("\n")[0], /sterling silver prayer beads with 33 beads/i);
  const segments = plan.title.toLowerCase().split(/,\s*/);
  assert.equal(new Set(segments).size, segments.length, plan.title);
  assert.ok((plan.title.match(/gift/gi) || []).length <= 1, plan.title);
});
