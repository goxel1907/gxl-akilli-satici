import assert from "node:assert/strict";
import test from "node:test";
import { agentState, digitalPipeline, physicalPipeline } from "../../mobile/agent-pipeline.js";
import { beatCompetitors, planAgentTeam } from "../../mobile/agent-team.js";
import { runListingReview } from "../../worker/src/agent-review.js";
import { buildPrintableBrief, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";

const tags = ["christmas bingo", "holiday party game", "xmas bingo cards", "family game night", "printable bingo", "christmas games", "office party game", "classroom bingo", "winter party game", "kids christmas game", "bingo for adults", "christmas activity", "instant download"];
const listing = { kind: "digital", title: "Christmas Bingo Game Printable, 30 Bingo Cards, US Letter", tags, description: "Thirty cards.\n\n30 bingo cards in US Letter and A4.\n\nAI disclosure: made with AI tools.", priceUsd: 4.99, targetSearch: "christmas bingo", images: 10, video: false,
  sellers: [{ title: "Holiday Bingo", reviews: 1300, shopSales: 25000, priceUsd: 5.5, images: 10, video: true }, { title: "Xmas Bingo", reviews: 300, priceUsd: 3.99, images: 9, video: true }, { title: "Bingo", reviews: 40, priceUsd: 6, images: 10, video: false }] };

test("every step from idea to publish has an agent; AI work goes to the team, seller-only steps stay with the seller", () => {
  const team = planAgentTeam(["chatgpt", "claude", "gemini"], ["chatgpt"]);
  const digital = digitalPipeline(team);
  assert.ok(digital.length >= 14);
  assert.equal(digital.find(agent => agent.id === "produce")!.owner, "claude", "low ChatGPT credit moves production to Claude");
  assert.equal(digital.find(agent => agent.id === "visual")!.owner, "gemini");
  assert.equal(digital.find(agent => agent.id === "publish")!.owner, "seller", "Etsy publish stays with the seller");
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(stage => digital.some(agent => agent.stage === stage)), [true, true, true, true, true, true]);
  const physical = physicalPipeline(team);
  assert.equal(physical.find(agent => agent.id === "photo")!.owner, "claude", "photo edits are code-only, never Gemini first");
  assert.equal(physical.find(agent => agent.id === "full")!.owner, "gemini", "the full listing writer can search the web");
  assert.equal(agentState(digital[0], 3), "done");
  assert.equal(agentState(digital.find(agent => agent.id === "qa")!, 3), "active");
  assert.equal(agentState(digital.at(-1)!, 3), "waiting");
});

test("the 'better than competitors' gate fails on missing video, few images or a buried search phrase", () => {
  const gate = beatCompetitors({ ...listing, kind: "digital" });
  assert.equal(gate.checks.find(check => check.id === "video")!.ok, false, "most proven sellers have a video");
  assert.equal(gate.ok, false);
  assert.equal(beatCompetitors({ ...listing, kind: "digital", video: true }).ok, true);
  const weak = beatCompetitors({ ...listing, kind: "digital", video: true, images: 4, title: "Fun Printable Game for Parties, Christmas Bingo" });
  assert.deepEqual(weak.checks.filter(check => !check.ok).map(check => check.id), ["images"]);
  assert.equal(beatCompetitors({ ...listing, kind: "digital", video: true, description: "Cards." }).checks.find(check => check.id === "ai_note")!.ok, false);
});

test("automatic review runs on the server AI and only returns fixes that pass the rules", async () => {
  const original = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    prompt = JSON.parse(String(init.body)).contents[0].parts[0].text;
    const answer = { scores: { title: 7, tags: 6, description: 8, images: 5, price: 8 }, issuesTr: ["Video yok"], listing: { title: "Christmas Bingo Cards Printable, 30 Cards, US Letter and A4", tags, openingEn: "A ready-to-print Christmas bingo set with thirty unique cards for family parties." }, imageFixesTr: ["Video ekle"] };
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  }) as typeof fetch;
  try {
    const result = await runListingReview(listing, { GEMINI_API_KEY: "test" });
    assert.equal(result.ai, true);
    assert.equal(result.review!.tags.length, 13);
    assert.match(prompt, /You cannot browse/);
    assert.match(prompt, /1300 reviews/);
    assert.equal(result.beat.ok, false);
    globalThis.fetch = (async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ scores: {}, issuesTr: [], listing: { title: "Christmas Bingo, 100 Cards", tags, openingEn: "" }, imageFixesTr: [] }) }] } }] })) as typeof fetch;
    const invented = await runListingReview(listing, { GEMINI_API_KEY: "test" });
    assert.equal(invented.review, undefined);
    assert.match(invented.reviewErrorTr!, /olmayan sayı eklendi \(100\)/);
  } finally { globalThis.fetch = original; }
});

test("with low ChatGPT credit the package tells ChatGPT to leave the scenes to Gemini", () => {
  const brief = buildPrintableBrief(normalizePrintablePlanInput({ kind: "party", productType: "christmas bingo game", seed: "v", assistant: "chatgpt", visualAssistant: "gemini" }));
  assert.match(brief.masterPrompt, /Görsel kredini korumak için C1, C2, C6 görsellerini sen üretme; bunları Gemini'de üreteceğim/);
  const same = buildPrintableBrief(normalizePrintablePlanInput({ kind: "party", productType: "christmas bingo game", seed: "v", assistant: "chatgpt", visualAssistant: "chatgpt" }));
  assert.doesNotMatch(same.masterPrompt, /Görsel kredini korumak/);
});
