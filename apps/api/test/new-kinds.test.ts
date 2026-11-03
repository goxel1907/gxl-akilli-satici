import assert from "node:assert/strict";
import test from "node:test";
import { calendarYear, inferPrintableKind } from "../../worker/src/etsy-trends.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput, printableKindOptions } from "../../worker/src/printable-studio.js";
import { printableOutputs } from "./fixtures/output-matrix.js";

const outputs = printableOutputs();
const first = (id: string) => outputs.find((row) => row.id === `${id}/a`)!;

test("every AI-allowed digital type is recognized from a buyer search", () => {
  assert.equal(inferPrintableKind("2027 calendar printable"), "calendar");
  assert.equal(inferPrintableKind("printable planner stickers"), "stickers");
  assert.equal(inferPrintableKind("printable christmas cards"), "cards");
  assert.equal(inferPrintableKind("christmas gift tags printable"), "cards");
  assert.equal(inferPrintableKind("large print word search"), "puzzles");
  assert.equal(inferPrintableKind("christmas phone wallpaper"), "wallpaper");
  assert.equal(inferPrintableKind("pantry labels printable"), "labels");
  assert.equal(inferPrintableKind("aesthetic app icons"), "app_icons");
  assert.equal(inferPrintableKind("home screen icons widgets"), "app_icons");
  assert.equal(inferPrintableKind("budget spreadsheet"), "spreadsheet");
  assert.equal(inferPrintableKind("google sheets budget template"), "spreadsheet");
  // Eski türler bozulmaz.
  assert.equal(inferPrintableKind("recipe card printable"), "recipe");
  assert.equal(inferPrintableKind("budget planner printable"), "planner");
  assert.equal(inferPrintableKind("coloring pages for kids"), "coloring");
  assert.equal(calendarYear(Date.UTC(2026, 10, 3)), 2027);
  assert.equal(calendarYear(Date.UTC(2027, 2, 1)), 2027);
});

test("the calendar is next year's 12 months with code-made dates and seasonal art in one style", () => {
  const { brief, listing } = first("calendar");
  const year = calendarYear();
  assert.match(brief.masterPrompt, new RegExp(`DATES — for every month of ${year}`));
  for (const month of ["January", "June", "December"]) assert.match(brief.masterPrompt, new RegExp(`^B\\d+\\. ${month} artwork: `, "m"));
  assert.match(brief.masterPrompt, /Generate every date grid in code/);
  assert.match(brief.masterPrompt, /@page \{ size: 11in 8\.5in/);
  assert.match(brief.masterPrompt, /Theme: one consistent style and palette across all 12 months/);
  assert.ok(listing.tags.includes(`${year} calendar`), listing.tags.join(", "));
  assert.match(listing.description, /12 month pages for \d{4}/);
});

test("phone wallpapers are sold as screen sizes with no print words", () => {
  const { brief, listing } = first("phone-wallpaper");
  assert.ok(!listing.tags.some((tag) => /\b(printable|pdf|iphone)\b/.test(tag)), listing.tags.join(", "));
  assert.doesNotMatch(listing.description, /print at home|Actual size/i);
  assert.match(listing.description, /Unzip the size that fits your phone/);
  assert.match(brief.masterPrompt, /Phone-1290x2796-px\.zip \(every wallpaper at 1290x2796 px\)/);
  assert.match(brief.masterPrompt, /WALLPAPER SIZES —/);
  assert.doesNotMatch(brief.masterPrompt, /COVER — page 1/);
  assert.ok(brief.pins.every((pin) => /Instant digital download for your phone\./.test(pin.description)));
});

test("stickers, cards, puzzles and labels each get their own files and checks", () => {
  const stickers = first("planner-stickers").brief.masterPrompt;
  assert.match(stickers, /Stickers-PNG\.zip \(every sticker as a transparent PNG\)/);
  assert.match(stickers, /STICKERS — every sticker PNG has a transparent background/);
  assert.match(stickers, /2 functional sticker sheets made in code/);
  const cards = first("christmas-cards");
  assert.match(cards.brief.masterPrompt, /folds to 5x7 in/);
  assert.match(cards.brief.masterPrompt, /CARDS — every card sheet has a fold line and crop marks/);
  assert.match(cards.listing.description, /folded card designs \(5x7 in, fit an A7 envelope\)/);
  const puzzles = first("word-search");
  assert.equal(puzzles.input.productType, "word search");
  assert.match(puzzles.brief.masterPrompt, /PUZZLES — a script re-solves every puzzle/);
  assert.ok(puzzles.listing.title.startsWith("Large Print Word Search"), puzzles.listing.title);
  assert.ok(!puzzles.listing.tags.some((tag) => /^(word printable|search pdf|christmas search)$/.test(tag)), puzzles.listing.tags.join(", "));
  const labels = first("pantry-labels");
  assert.match(labels.brief.masterPrompt, /LABELS — every label word is in an English dictionary/);
  assert.doesNotMatch(labels.brief.masterPrompt, /PAGE NUMBERS —/);
});

test("the package is written for the assistant the seller picked", () => {
  const base = { kind: "coloring", productType: "adult coloring pages", keyword: "adult coloring pages", trendFeatures: ["cozy"], colors: ["sage", "cream"], pageCount: 30, seed: "x" };
  const claude = buildPrintableBrief(normalizePrintablePlanInput({ ...base, assistant: "claude" })).masterPrompt;
  assert.match(claude, /Draw the artworks in Brief B as clean vector SVG in code/);
  assert.match(claude, /you cannot generate photos or raster images/);
  assert.doesNotMatch(claude, /built-in image generator/);
  const chatgpt = buildPrintableBrief(normalizePrintablePlanInput({ ...base, assistant: "chatgpt" })).masterPrompt;
  assert.match(chatgpt, /make images with the built-in image generator/);
  assert.doesNotMatch(chatgpt, /- Claude:/);
  // Seçim yoksa iki aracın notu da yazılır.
  const any = buildPrintableBrief(normalizePrintablePlanInput(base)).masterPrompt;
  assert.match(any, /- ChatGPT:/);
  assert.match(any, /- Claude:/);
  for (const prompt of [claude, chatgpt]) {
    const listing = buildPrintableListing(normalizePrintablePlanInput(base), "Cozy Test Coloring Pages");
    assert.equal(guardPrintablePlan({ masterPrompt: prompt, pdfPrompt: "", pins: [] }, listing, { kind: "coloring" }).quality.ok, true);
  }
});

test("every type fills all 13 Etsy tags even without trend data", () => {
  const products: Record<string, string> = { planner: "daily planner", digital_planner: "digital planner", coloring: "adult coloring pages", wall_art: "wall art", party: "bridal shower games", recipe: "recipe card", journal: "gratitude journal", kids: "kids activity pages", paper_craft: "junk journal kit", calendar: "calendar", stickers: "planner stickers", cards: "christmas cards", puzzles: "word search", wallpaper: "phone wallpaper", labels: "pantry labels", app_icons: "app icons", spreadsheet: "budget spreadsheet" };
  assert.equal(printableKindOptions().length, 17);
  for (const option of printableKindOptions()) {
    const listing = buildPrintableListing(normalizePrintablePlanInput({ kind: option.id, productType: products[option.id], seed: "z" }), "Test Name");
    assert.equal(listing.tags.length, 13, `${option.id}: ${listing.tags.join(", ")}`);
  }
});

test("phone app icons and spreadsheets are delivered as phone-ready files, never as print", () => {
  const icons = outputs.find((row) => row.id === "app-icons/a")!;
  assert.match(icons.brief.masterPrompt, /Icon sheet 1: 16 app icons in a 4x4 grid/);
  assert.match(icons.brief.masterPrompt, /never a company logo, a letter, a number or an app name/);
  assert.match(icons.brief.masterPrompt, /ICONS — every icon has the same size/);
  assert.ok(!icons.listing.tags.some((tag) => /\b(ios|iphone|android|printable|pdf)\b/.test(tag)), icons.listing.tags.join(", "));
  assert.doesNotMatch(icons.listing.description, /print at home|Actual size/i);
  const sheet = outputs.find((row) => row.id === "budget-spreadsheet/a")!;
  assert.match(sheet.brief.masterPrompt, /FORMULAS — in a copy, fill every input cell with sample numbers/);
  assert.match(sheet.brief.masterPrompt, /NO MACROS — the file is \.xlsx/);
  assert.match(sheet.brief.masterPrompt, /Upload set: .*\.zip \(the \.xlsx workbook and the quick-start PDF\)/);
  assert.ok(!sheet.listing.tags.some((tag) => /\b(excel|google sheets|printable|pdf)\b/.test(tag)), sheet.listing.tags.join(", "));
  assert.match(sheet.listing.description, /15 tabs|\d+ tabs/);
  // Bütçe dışı tablo bütçe etiketi almaz.
  const habit = buildPrintableListing(normalizePrintablePlanInput({ kind: "spreadsheet", productType: "habit tracker spreadsheet", seed: "h" }), "Habit Test Spreadsheet");
  assert.ok(!habit.tags.some((tag) => /budget|debt|bill/.test(tag)), habit.tags.join(", "));
  assert.equal(habit.tags.length, 13);
});
