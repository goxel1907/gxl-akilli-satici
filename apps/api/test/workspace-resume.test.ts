import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { generationKey, parsePrintableWorkspace } from "../../mobile/workflow-state.js";

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
