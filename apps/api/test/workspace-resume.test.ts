import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { generationKey, parsePrintableWorkspace } from "../../mobile/workflow-state.js";
import { buildMarketStrategy } from "../../worker/src/market-strategy.js";

const input = { kind: "coloring", productType: "animal coloring pages", assistant: "claude", referenceNotes: "", colors: "sage, cream", formats: "US Letter, A4", pageCount: "26", audience: "", keyword: "animal coloring pages", trendTags: [], trendFeatures: [] };
const brief = buildPrintableBrief({ kind: "coloring", productType: input.productType, assistant: "claude" });
const guarded = guardPrintablePlan(brief, buildPrintableListing({ kind: "coloring", productType: input.productType }, brief.name), { kind: "coloring" });
const workspace = { version: 1, savedAt: new Date().toISOString(), input, plan: { ...guarded, inputKey: generationKey(input) } };


test("saved workspace retains assistant, listing and identity rather than regenerating a new product", () => {
  const restored = parsePrintableWorkspace(JSON.stringify(workspace));
  assert.equal(restored?.input.assistant, "claude");
  assert.equal(restored?.plan.brief.name, brief.name);
  assert.deepEqual(restored?.plan.listing, workspace.plan.listing);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(generationKey(reordered), generationKey(input));
  assert.ok(parsePrintableWorkspace(JSON.stringify({ ...workspace, input: reordered })));
});

test("corrupt, incompatible or mismatched workspaces are ignored safely", () => {
  for (const raw of [null, "bad json", "null", "{}", JSON.stringify({ ...workspace, version: 2 }), JSON.stringify({ ...workspace, input: { ...input, productType: "another product" } }), JSON.stringify({ ...workspace, input: { ...input, colors: ["sage"] } }), JSON.stringify({ ...workspace, plan: { ...workspace.plan, quality: { ok: false } } })]) {
    assert.equal(parsePrintableWorkspace(raw), undefined);
  }
});

test("selected competitor references and their evidence survive a bound workspace resume", () => {
  const nextInput = { ...input, competitorLinks: "42" };
  const strategy = buildMarketStrategy(input.keyword, [{ listing_id: 42, title: "Animal Coloring Pages" }]);
  const nextPlan = { ...workspace.plan, inputKey: generationKey(nextInput), research: { strategy } };
  const next = { ...workspace, input: nextInput, plan: nextPlan };
  assert.equal(parsePrintableWorkspace(JSON.stringify(next))?.input.competitorLinks, "42");
  assert.equal(parsePrintableWorkspace(JSON.stringify(next))?.plan.research.strategy.leaders[0].url, "https://www.etsy.com/listing/42");
  assert.equal(parsePrintableWorkspace(JSON.stringify({ ...next, input: { ...nextInput, competitorLinks: "43" } })), undefined);
  const unsafe = { ...nextPlan, research: { strategy: { ...strategy, leaders: [{ id: "42", title: "Animal Coloring Pages", url: "https://unsafe.example/listing/42" }] } } };
  assert.equal(parsePrintableWorkspace(JSON.stringify({ ...next, plan: unsafe })), undefined);
});
