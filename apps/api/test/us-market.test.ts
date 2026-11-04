import assert from "node:assert/strict";
import test from "node:test";
import { guardDigitalListing, guardPrintablePlan, repairText } from "../../worker/src/output-guard.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput, printableKindOptions } from "../../worker/src/printable-studio.js";

// Satıcı yapay zekâyla Türkçe konuşur; ürün, dosya, görsel yazısı ve ilan ABD'li alıcı için Amerikan İngilizcesidir.
const products: Record<string, string> = { planner: "daily planner", digital_planner: "digital planner", coloring: "adult coloring pages", wall_art: "wall art", party: "bridal shower games", recipe: "recipe card", journal: "gratitude journal", kids: "kids activity pages", paper_craft: "junk journal kit", calendar: "calendar", stickers: "planner stickers", cards: "christmas cards", puzzles: "word search", wallpaper: "phone wallpaper", labels: "pantry labels", app_icons: "app icons", spreadsheet: "budget spreadsheet", slides: "christmas trivia game", resume: "resume template" };

const pack = (kind: string, extra: Record<string, unknown> = {}) => buildPrintableBrief(normalizePrintablePlanInput({ kind, productType: products[kind], keyword: products[kind], seed: "us", ...extra })).masterPrompt;
const parts = (prompt: string) => { const [tr, en] = prompt.split("\n---\n"); return { tr, en }; };

test("every package asks in Turkish and keeps the product spec in American English", () => {
  for (const option of printableKindOptions()) {
    for (const assistant of ["chatgpt", "claude", undefined]) {
      const prompt = pack(option.id, assistant ? { assistant } : {});
      const { tr, en } = parts(prompt);
      assert.ok(en, `${option.id}: the spec follows the divider`);
      assert.match(tr, /Benimle her zaman Türkçe konuş/, option.id);
      assert.match(tr, /Ürüne giren her şey Amerikan İngilizcesiyle olur/, option.id);
      assert.match(tr, /## ABD pazarı kuralları \(eyalet farkları dahil\)/, option.id);
      assert.match(tr, /^- ADIM 1 - Önce Product spec: /m, option.id);
      assert.doesNotMatch(tr, /^- STEP \d+|write next/m, option.id);
      // Teknik şartnamede Türkçe harf yok: ürüne Türkçe metin sızmaz.
      assert.doesNotMatch(en, /[çğıöşÇĞİÖŞ]/, `${option.id}: ${en.match(/.{0,40}[çğıöşÇĞİÖŞ].{0,40}/)?.[0]}`);
      assert.match(en, /AMERICAN ENGLISH — /, option.id);
      assert.match(en, /Every word in the files, the file names and the Product spec is American English/, option.id);
    }
  }
});

test("rules that differ by US state are never written into the product as fixed facts", () => {
  const spreadsheet = parts(pack("spreadsheet"));
  assert.match(spreadsheet.tr, /Oregon, Montana, New Hampshire ve Delaware'de satış vergisi yoktur/);
  assert.match(spreadsheet.tr, /Texas, Washington ve Wyoming'de eyalet gelir vergisi yoktur/);
  assert.match(spreadsheet.en, /No fixed tax rate anywhere: sales-tax and income-tax rates differ by US state/);
  assert.match(spreadsheet.en, /US FORMAT — currency cells use the \$ format/);
  assert.doesNotMatch(spreadsheet.tr, /inç \("in"\)/, "screen products get no inch rule");

  const budget = parts(pack("planner", { productType: "budget planner", keyword: "budget planner printable" }));
  assert.match(budget.en, /Tax fields are blank for the buyer to fill in/);
  assert.match(budget.tr, /sabit vergi oranı yazma/);

  const calendar = parts(pack("calendar"));
  assert.match(calendar.tr, /"Patriots' Day" yalnız Massachusetts ve Maine'de/);
  assert.match(calendar.en, /no holiday is printed \(holidays differ by state\)/);

  const kids = parts(pack("kids"));
  assert.match(kids.tr, /"Pre-K", "Kindergarten", "1st grade"/);
  assert.match(kids.tr, /"Common Core aligned"/);
  assert.match(kids.en, /claim no state or Common Core standard/);
  assert.match(kids.en, /US SCHOOL TERMS — /);

  const teacher = parts(pack("planner", { productType: "teacher planner", keyword: "teacher planner printable" }));
  assert.match(teacher.tr, /"August to July"/);
  assert.doesNotMatch(parts(pack("planner")).tr, /August to July/, "only school planners get the school-year rule");

  assert.match(parts(pack("recipe")).en, /US UNITS — the conversion chart lists US measures first/);
  assert.match(parts(pack("labels")).en, /US grocery name \(powdered sugar, all-purpose flour, cornstarch, baking soda\)/);
  assert.match(parts(pack("party")).en, /21\+ — any game that mentions alcohol/);
  assert.match(parts(pack("wallpaper")).tr, /önce iPhone ölçüleri/);

  // İlgisiz kural yazılmaz: boyama sayfasına vergi, saat veya okul kuralı girmez.
  const coloring = parts(pack("coloring"));
  assert.doesNotMatch(coloring.tr, /gelir vergisi|AM\/PM|Kindergarten|Patriots/);
});

test("British spelling is fixed to American English before anything reaches the phone", () => {
  assert.equal(repairText("A colourful, organised gift for Mum in grey and centre gold"), "A colorful, organized gift for Mom in gray and center gold");
  assert.equal(repairText("Earl Grey tea labels with icing sugar and plain flour"), "Earl Grey tea labels with powdered sugar and all-purpose flour");
  // Tırnak içindeki örnek kelimeler değişmez (QA kuralı "colour" yazımını örnek gösterir).
  assert.equal(repairText('fix any British spelling ("colour", "grey")'), 'fix any British spelling ("colour", "grey")');
  const listing = { title: "Pantry Labels Printable, Kitchen Organisation", tags: ["pantry labels"], description: "Labels for your favourite jars.\n\nTHIS IS A DIGITAL PRODUCT. NO PHYSICAL ITEM WILL BE SHIPPED.\n\n© 2026 GXL Market Studio. For personal use only." };
  const guarded = guardDigitalListing(listing);
  assert.equal(guarded.listing.title, "Pantry Labels Printable, Kitchen Organization");
  assert.match(guarded.listing.description, /favorite jars/);
  // Karşılığı bağlama bağlı kelime düzeltilmez ama raporlanır.
  const fortnight = guardDigitalListing({ ...listing, description: `${listing.description}\nUse it every fortnight.` });
  assert.ok(fortnight.quality.issues.some((issue) => issue.code === "british_spelling"));
});

test("the checker rejects a package without the Turkish language rule or with English steps", () => {
  const base = { kind: "coloring", productType: "adult coloring pages", keyword: "adult coloring pages", seed: "g" };
  const brief = buildPrintableBrief(normalizePrintablePlanInput(base));
  const listing = buildPrintableListing(normalizePrintablePlanInput(base), brief.name);
  assert.equal(guardPrintablePlan(brief, listing, { kind: "coloring" }).quality.ok, true);
  const noRule = brief.masterPrompt.replace(/^- Benimle her zaman Türkçe konuş.*$/m, "");
  assert.ok(guardPrintablePlan({ ...brief, masterPrompt: noRule }, listing, { kind: "coloring" }).quality.issues.some((issue) => issue.code === "language_rule"));
  const englishSteps = brief.masterPrompt.replace("- ADIM 1 - ", "- STEP 1 - ");
  assert.ok(guardPrintablePlan({ ...brief, masterPrompt: englishSteps }, listing, { kind: "coloring" }).quality.issues.some((issue) => issue.code === "english_request"));
});

test("typing a product by hand, without trend data, still gives a clean package for every type", () => {
  const typed: Record<string, string[]> = { planner: ["budget planner", "teacher planner"], digital_planner: ["digital budget planner"], coloring: ["mandala coloring pages", "kids coloring pages", "adult coloring pages"], wall_art: ["horse wall art", "nursery wall art"], party: ["baby shower games", "bachelorette games"], recipe: ["recipe binder"], journal: ["prayer journal"], kids: ["preschool worksheets"], paper_craft: ["digital paper", "scrapbook paper", "christmas junk journal kit"], calendar: ["2027 wall calendar"], stickers: ["cat stickers"], cards: ["thank you cards"], puzzles: ["sudoku"], wallpaper: ["christmas wallpaper"], labels: ["laundry labels"], app_icons: ["christmas app icons"], spreadsheet: ["habit tracker spreadsheet"], slides: ["christmas trivia game", "classroom review game slides"], resume: ["resume template", "nurse resume template"] };
  for (const [kind, list] of Object.entries(typed)) {
    for (const productType of list) {
      const input = normalizePrintablePlanInput({ kind, productType, keyword: productType, seed: "hand" });
      const brief = buildPrintableBrief(input);
      const guarded = guardPrintablePlan(brief, buildPrintableListing(input, brief.name), { kind: kind as never });
      const errors = guarded.quality.issues.filter((issue) => issue.severity === "error");
      assert.deepEqual(errors.map((issue) => `${issue.code}: ${issue.messageTr}`), [], `${kind} / ${productType}`);
      assert.deepEqual(guarded.quality.fixed, [], `${kind} / ${productType}: written clean at the source`);
    }
  }
  // Ürün adındaki konu çizilir: mandala kitabı mandala, çocuk kitabı çocuk konuları alır.
  const mandala = buildPrintableBrief(normalizePrintablePlanInput({ kind: "coloring", productType: "mandala coloring pages", seed: "m" }));
  assert.ok(mandala.artSubjects.every((subject) => /mandala/.test(subject)), mandala.artSubjects.join(" | "));
  const kids = buildPrintableBrief(normalizePrintablePlanInput({ kind: "coloring", productType: "kids coloring pages", seed: "k" }));
  assert.ok(!kids.artSubjects.some((subject) => /tea party|still life/.test(subject)), kids.artSubjects.join(" | "));
});
