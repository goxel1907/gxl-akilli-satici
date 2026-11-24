import assert from "node:assert/strict";
import test from "node:test";
import { colorShares, planCoverColor } from "../../worker/src/color-standout.js";
import { buildPrintableBrief, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";

const sameLook = [
  "Christmas Bingo Sage Green Neutral Holiday Game", "Beige Christmas Party Game Printable", "Sage Christmas Trivia Cards Cream",
  "Neutral Christmas Bingo Cards Beige", "Christmas Word Search Sage Green", "Minimal Christmas Game Cream and Beige"
];

test("competitor colors are counted once per listing and the cover backdrop avoids them", () => {
  const shares = colorShares(sameLook);
  assert.equal(shares.find((item) => item.name === "sage green")?.share, 2 / 6);
  assert.ok(!shares.some((item) => item.name === "green"), "sage green is not also counted as green");
  const plan = planCoverColor({ competitorTexts: sameLook, theme: "christmas bingo" });
  assert.ok(plan.crowded.includes("beige") && plan.crowded.includes("sage green"));
  assert.equal(plan.coverColor, "cherry red", "a Christmas cover takes a theme color far from the crowded sage/beige look");
  assert.match(plan.coverHex, /^#[0-9A-F]{6}$/);
  assert.match(plan.noteTr, /ayrışan cherry red/);
  const red = planCoverColor({ competitorTexts: ["Red Christmas Bingo", "Red Holiday Trivia", "Christmas Red Plaid Game"], theme: "christmas" });
  assert.notEqual(red.coverColor, "cherry red", "when competitors are red, the cover moves to another theme color");
});

test("the package names the stand-out cover color and batches code-made images so the chat does not stop for every image", () => {
  for (const assistant of ["chatgpt", "claude"] as const) {
    const brief = buildPrintableBrief(normalizePrintablePlanInput({ kind: "party", productType: "christmas bingo game", keyword: "christmas bingo", pageCount: 20, seed: "x", assistant, coverColor: "cherry red", coverHex: "#C8102E", crowdedColors: ["sage green", "beige"] }));
    assert.match(brief.adVisuals[0].prompt, /cherry red \(#C8102E\)/);
    assert.match(brief.adVisuals[0].prompt, /most competing covers use sage green, beige/);
    assert.match(brief.masterPrompt, /Cover backdrop: cherry red \(#C8102E\)/);
    const image = brief.adVisuals.filter((visual) => visual.tool === "image").map((visual) => visual.slot);
    assert.deepEqual(image, [1, 2, 6], assistant);
    assert.match(brief.masterPrompt, /C3, C4, C5, C7, C8, C9, C10, C11, C12 görsellerini gerçek dosyalardan TEK bir Python betiğiyle/);
    if (assistant === "chatgpt") assert.match(brief.masterPrompt, /önce C1 için görsel aracıyla yalnız temalı zemini üret[^]*AYNI yanıtta durmadan[^]*Sonra C2 ve C6 sahnelerini/);
    assert.match(brief.masterPrompt, /### C3\. .*\[code\]/);
  }
  const plain = buildPrintableBrief(normalizePrintablePlanInput({ kind: "planner", productType: "budget planner", seed: "y" }));
  assert.match(plain.adVisuals[0].prompt, /rich, saturated [a-z ]+ \(#[0-9A-F]{6}\) themed backdrop/, "without research the cover still gets a bold theme color");
});
