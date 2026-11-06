import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { handleRequest } from "../../worker/src/index.js";
import { explainListingTr } from "../../worker/src/tr-glossary.js";
import { generationKey, parsePrintableWorkspace } from "../../mobile/workflow-state.js";

const input = { kind: "party" as const, productType: "bridal shower games", keyword: "bridal shower games", pageCount: 10, trendFeatures: ["wedding", "party", "groom"], colors: ["dusty blue", "lavender", "oatmeal"], formats: ["US Letter", "A4", "5x7 in cards"] };
const brief = buildPrintableBrief(input), listing = buildPrintableListing(input, brief.name);

test("bridal package distinguishes core game pages, support pages and real game names", () => {
  assert.equal(brief.productionContractVersion, 2);
  assert.match(brief.pdfPrompt, /10 core game pages; this is not the total PDF page count/);
  assert.match(brief.pdfPrompt, /file manifest/);
  assert.match(brief.pdfPrompt, /one complete game per core page/);
  assert.match(brief.pdfPrompt, /Do not also impose multiple cards per page/);
  assert.match(brief.pdfPrompt, /Count answer-key pages separately/);
  assert.match(listing.description, /10 core game pages, plus separately listed support and extras/);
  assert.ok(!listing.tags.some(tag => /^(party|groom) shower games$/.test(tag)));
  for (const pin of brief.pins) assert.doesNotMatch(pin.description, /with a "(?:Wedding|Party|Groom)" game/);
  assert.doesNotMatch(brief.masterPrompt, /buyer-favored|most competing bundles do not offer/);
  assert.equal(guardPrintablePlan(brief, listing, { kind: "party" }).quality.ok, true);
});

test("gallery delivery has ten Etsy visuals and separately labeled marketing assets", () => {
  assert.equal(brief.adVisuals.filter(visual => visual.channel === "etsy").length, 10);
  assert.ok(brief.adVisuals.filter(visual => visual.channel === "etsy").every(visual => visual.aspect.startsWith("4:3")));
  assert.equal(brief.adVisuals.find(visual => visual.channel === "pinterest")?.slot, 11);
  assert.equal(brief.adVisuals.find(visual => visual.channel === "social")?.slot, 12);
  assert.match(brief.masterPrompt, /C1, C4, C2, C3, C5, C6, C7, C8, C9, C10/);
  assert.match(brief.masterPrompt, /C11 görseline/);
  assert.match(brief.adVisuals[0].overlay!, /10 CORE GAME PAGES/);
  assert.doesNotMatch(brief.masterPrompt, /largest outside traffic|best-selling Etsy covers/);
});

test("the output guard rejects the supplied package's semantic defects instead of certifying them", () => {
  const conflicted = { ...brief, masterPrompt: brief.masterPrompt + '\nEtsy market brief (median price 7.24 USD).\nObserved USD price quartiles: 4.94, 6.99, 9.5.' };
  assert.ok(guardPrintablePlan(conflicted, listing, { kind: "party" }).quality.issues.some(issue => issue.code === "conflicting_market_median"));
  const invented = { ...brief, pins: [{ title: "Bridal Shower Games", description: 'Includes a set with a "Wedding" game.', overlay: "WEDDING" }] };
  assert.ok(guardPrintablePlan(invented, listing, { kind: "party" }).quality.issues.some(issue => issue.code === "invented_game_claim"));
  assert.ok(guardPrintablePlan({ ...brief, name: "Lavender Winery Bridal Shower Games" }, listing, { kind: "party" }).quality.issues.some(issue => issue.code === "unintended_name_meaning"));
});

test("fresh matched research replaces the stale machine summary in the actual production request", async context => {
  const values = new Map<string, string>();
  const store = { async get(key: string) { return values.get(key) || null; }, async put(key: string, value: string) { values.set(key, value); }, async delete(key: string) { values.delete(key); } };
  context.mock.method(globalThis, "fetch", async (input: unknown) => {
    assert.ok(new URL(String(input)).pathname.endsWith("/listings/active"));
    return Response.json({ count: 128097, results: [5, 7, 9].map((price, index) => ({ listing_id: index + 1, title: "Bridal Shower Games", listing_type: "download", state: "active", tags: ["bridal shower games"], num_favorers: 100, original_creation_timestamp: Math.floor(Date.now() / 1000) - 864000, price: { amount: price * 100, divisor: 100, currency_code: "USD" } })) });
  });
  const response = await handleRequest(new Request("https://local.invalid/api/printables/plan", { method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" }, body: JSON.stringify({ ...input, research: true, referenceNotes: 'Etsy market brief for "bridal shower games" (128,097 live listings, median price 7.24 USD): stale observations.' }) }), { APP_ACCESS_TOKEN: "test-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store });
  assert.equal(response.status, 200);
  const plan = await response.json() as any;
  assert.equal(plan.quality.ok, true, JSON.stringify(plan.quality.issues));
  assert.doesNotMatch(plan.brief.masterPrompt, /7\.24/);
  assert.match(plan.research.marketBriefEn, /Comparable USD median: 7.00 USD/);
  assert.match(plan.brief.masterPrompt, /Comparable USD median: 7.00 USD/);
});

test("the seller gloss explains shower context and the listing preserves actual buyer rights", () => {
  const gloss = explainListingTr({ title: "Bridal Shower Games, Wedding Shower Games", tags: ["bride to be games", "bridal party games"] });
  assert.doesNotMatch(gloss.titleTr, /shower|bridal/i);
  assert.ok(gloss.tags.every(row => !/bride to be|bridal/i.test(row.tr)));
  assert.match(listing.description, /Your rights under applicable law and Etsy policies are unaffected/);
  assert.doesNotMatch(listing.description, /all sales are final/i);
  assert.ok(brief.qualityGate.some(line => line.includes("ilan açıklamasında açıkça belirt")));
});

test("obsolete production contracts cannot resume as ready while current bound workspaces can", () => {
  const savedInput = { kind: "party", productType: input.productType, referenceNotes: "", colors: "", formats: "", pageCount: "10", audience: "", keyword: input.keyword, assistant: "chatgpt", trendTags: [], trendFeatures: [] };
  const guarded = guardPrintablePlan(brief, listing, { kind: "party" });
  const workspace = { version: 1, savedAt: new Date().toISOString(), input: savedInput, plan: { ...guarded, inputKey: generationKey(savedInput) } };
  assert.ok(parsePrintableWorkspace(JSON.stringify(workspace)));
  assert.equal(parsePrintableWorkspace(JSON.stringify({ ...workspace, plan: { ...workspace.plan, brief: { ...brief, productionContractVersion: undefined } } })), undefined);
});
