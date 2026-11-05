import assert from "node:assert/strict";
import test from "node:test";
import { inferPrintableKind } from "../../worker/src/etsy-trends.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";
import { printableOutputs } from "./fixtures/output-matrix.js";

// Program şablonları: alıcı dosyayı kendi programında (PowerPoint/Google Slides, Word/Google Docs) açar ve düzenler.
const plan = (kind: string, productType: string, extra: Record<string, unknown> = {}) => {
  const input = normalizePrintablePlanInput({ kind, productType, keyword: productType, seed: "p", ...extra });
  const brief = buildPrintableBrief(input);
  const listing = buildPrintableListing(input, brief.name);
  return { brief, listing, guarded: guardPrintablePlan(brief, listing, { kind: kind as never }) };
};

test("program template searches are recognized", () => {
  assert.equal(inferPrintableKind("trivia game slides"), "slides");
  assert.equal(inferPrintableKind("powerpoint trivia game"), "slides");
  assert.equal(inferPrintableKind("google slides review game"), "slides");
  assert.equal(inferPrintableKind("resume template"), "resume");
  assert.equal(inferPrintableKind("cover letter template word"), "resume");
  // Basılan parti oyunu yine parti oyunudur.
  assert.equal(inferPrintableKind("bridal shower games printable"), "party");
});

test("a slide game is a clickable .pptx with checked answers and no game-show brand", () => {
  const { brief, listing, guarded } = plan("slides", "christmas trivia game");
  assert.equal(guarded.quality.ok, true, JSON.stringify(guarded.quality.issues));
  const spec = brief.masterPrompt.split("\n---\n")[1];
  assert.match(spec, /56 slides in all/);
  assert.match(spec, /every board tile links to its question slide/i);
  assert.match(spec, /LINKS — read every shape's click action with python-pptx/);
  assert.match(spec, /ANSWERS — every question has exactly one answer slide/);
  assert.match(spec, /SLIDES — the file is \.pptx \(not \.pptm\)/);
  assert.match(spec, /Theme: one theme for the whole product: Christmas/);
  assert.match(spec, /Never offer or mention a commercial-use license or a video; this product has none\. The files are editable templates/);
  assert.match(brief.masterPrompt.split("\n---\n")[0], /"Jeopardy", "Family Feud"/);
  assert.deepEqual(listing.materials, ["pptx file", "pdf host guide", "digital download"]);
  assert.ok(!listing.tags.some((tag) => /powerpoint|google|keynote|jeopardy|printable|pdf/.test(tag)), listing.tags.join(", "));
  assert.match(listing.description, /• 25 questions in 5 categories/);
  // Üç pin aynı başlıkla paylaşılmaz.
  assert.equal(new Set(brief.pins.map((pin) => pin.title)).size, 3);
});

test("a resume template follows US resume rules and never carries the shop's product name on the resume", () => {
  const { brief, listing, guarded } = plan("resume", "resume template");
  assert.equal(guarded.quality.ok, true, JSON.stringify(guarded.quality.issues));
  const [tr, spec] = brief.masterPrompt.split("\n---\n");
  assert.match(tr, /Maaş bilgisi yazılmaz: California ve New York/);
  assert.match(tr, /"City, ST"/);
  assert.match(spec, /no photo, date of birth, age, marital status or salary/);
  assert.match(spec, /PAGE FIT — converted to PDF with LibreOffice headless/);
  assert.match(spec, /US RESUME — /);
  assert.match(spec, /never on the resume, cover letter or references pages/);
  assert.match(spec, /fonts that come with the buyer's program/);
  assert.match(spec, /One-Page-Resume-US-Letter\.docx/);
  assert.match(listing.title, /US Letter, A4/);
  assert.deepEqual(listing.materials, ["docx file", "pdf guide", "digital download"]);
  assert.ok(listing.tags.includes("editable resume"));
  assert.ok(!listing.tags.some((tag) => /\bword\b|docs|google|printable|pdf/.test(tag)), listing.tags.join(", "));
});

test("'editable' is true only for program templates", () => {
  const editable = { title: "Planner", tags: ["editable planner"], description: "x\n\nTHIS IS A DIGITAL PRODUCT. NO PHYSICAL ITEM WILL BE SHIPPED.\n\n© 2026 GXL Market Studio. For personal use only." };
  const planner = plan("planner", "daily planner");
  const plannerGuard = guardPrintablePlan(planner.brief, { ...planner.listing, ...editable }, { kind: "planner" });
  assert.ok(plannerGuard.quality.issues.some((issue) => issue.code === "misleading"));
  const resume = plan("resume", "resume template");
  const resumeGuard = guardPrintablePlan(resume.brief, { ...resume.listing, tags: [...resume.listing.tags.slice(0, 12), "editable cv"] }, { kind: "resume" });
  assert.ok(!resumeGuard.quality.issues.some((issue) => issue.code === "misleading"));
});

test("competitor tags with program brands never reach the listing or the product name", () => {
  for (const row of printableOutputs().filter((item) => /slides|resume/.test(item.id))) {
    const text = [row.brief.name, row.listing.title, ...row.listing.tags, ...row.brief.pins.map((pin) => pin.title)].join(" | ").toLowerCase();
    assert.doesNotMatch(text, /powerpoint|google|keynote|jeopardy|\bword\b|microsoft/, `${row.id}: ${text}`);
    assert.equal(guardPrintablePlan(row.brief, row.listing, { kind: row.kind }).quality.ok, true, row.id);
  }
});

test("a main search over 20 characters stays in the tags as the parts that fit", () => {
  const trivia = plan("slides", "christmas trivia game");
  assert.ok(trivia.listing.tags.includes("christmas trivia"), trivia.listing.tags.join(", "));
  assert.ok(trivia.listing.tags.includes("trivia game"), trivia.listing.tags.join(", "));
  const coloring = plan("coloring", "christmas coloring pages");
  assert.ok(coloring.listing.tags.includes("christmas coloring"), coloring.listing.tags.join(", "));
  assert.ok(plan("resume", "nurse resume template").listing.tags.includes("nurse resume"));
  for (const row of [trivia, coloring]) assert.ok(row.listing.tags.every((tag) => tag.length <= 20));
});

test("shower tags go only on shower games", () => {
  const bachelorette = plan("party", "bachelorette party games");
  assert.equal(bachelorette.listing.tags.length, 13);
  assert.ok(!bachelorette.listing.tags.some((tag) => /shower/.test(tag)), bachelorette.listing.tags.join(", "));
  assert.ok(plan("party", "baby shower games").listing.tags.some((tag) => /shower/.test(tag)));
});

test("a holiday product carries the holiday in several tags, never as a cut-off phrase", () => {
  const trivia = plan("slides", "christmas trivia game").listing.tags;
  assert.ok(trivia.filter((tag) => /christmas|holiday/.test(tag)).length >= 4, trivia.join(", "));
  assert.ok(trivia.includes("holiday trivia game"), trivia.join(", "));
  const kit = plan("paper_craft", "christmas junk journal kit").listing.tags;
  assert.ok(!kit.includes("christmas junk"), kit.join(", "));
  assert.ok(kit.some((tag) => /christmas/.test(tag)), kit.join(", "));
  const words = plan("puzzles", "christmas word search").listing.tags;
  assert.ok(!words.some((tag) => /^christmas (word|search)$/.test(tag)), words.join(", "));
  // Bayramsız üründe bayram etiketi olmaz.
  assert.ok(!plan("planner", "daily planner").listing.tags.some((tag) => /christmas|holiday/.test(tag)));
});

test("a printable escape room gets linked puzzles, checked single answers and no spoilers", () => {
  assert.equal(inferPrintableKind("christmas escape room"), "party");
  const { brief, listing, guarded } = plan("party", "christmas escape room", { pageCount: 16 });
  assert.equal(guarded.quality.ok, true, JSON.stringify(guarded.quality.issues));
  const spec = brief.masterPrompt.split("\n---\n")[1];
  assert.match(spec, /6 linked puzzles in order/);
  assert.match(spec, /exactly one answer/);
  assert.match(spec, /PUZZLES — solve every puzzle in code/);
  assert.match(spec, /SPOILERS — /);
  assert.doesNotMatch(spec, /welcome sign/);
  assert.match(listing.description, /• 6 linked puzzles and a final lock/);
  assert.ok(listing.tags.includes("holiday escape room"), listing.tags.join(", "));
  assert.ok(!listing.tags.some((tag) => /^(printable room|room\b)/.test(tag)), listing.tags.join(", "));
});

test("every package tells the assistant how to work in small saved parts and resume without starting over", () => {
  const tr = plan("planner", "daily planner").brief.masterPrompt.split("\n---\n")[0];
  assert.match(tr, /Donmamak için işi küçük parçalara böl/);
  assert.match(tr, /'kaldığın yerden devam et'/);
});
