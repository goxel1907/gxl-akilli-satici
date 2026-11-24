import assert from "node:assert/strict";
import test from "node:test";
import { applyOpening, listingReviewPrompt, parseListingReview, planAgentTeam } from "../../mobile/agent-team.js";
import { fullListingPrompt, photoEnhancePrompt } from "../../mobile/photo-assistant.js";
import { buildPrintableBrief, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";

test("the agent team gives files to ChatGPT/Claude, scenes to Gemini and review to a different assistant, skipping low-credit ones", () => {
  const all = planAgentTeam(["chatgpt", "claude", "gemini"]);
  assert.deepEqual([all.producer, all.visuals, all.reviewer], ["chatgpt", "gemini", "gemini"]);
  const lowChatgpt = planAgentTeam(["chatgpt", "claude", "gemini"], ["chatgpt"]);
  assert.equal(lowChatgpt.producer, "claude");
  assert.notEqual(lowChatgpt.reviewer, lowChatgpt.producer);
  const geminiOnly = planAgentTeam(["gemini"]);
  assert.equal(geminiOnly.producer, "gemini");
  assert.ok(geminiOnly.notesTr.some(line => /PDF olarak kaydet/.test(line)));
  const claudeOnly = planAgentTeam(["claude"]);
  assert.equal(claudeOnly.visuals, "claude", "with only Claude the scene prompts stay in the same chat");
});

const context = { kind: "digital" as const, title: "Christmas Bingo Game Printable, 30 Bingo Cards, US Letter", tags: ["christmas bingo"], description: "Thirty cards for your party.\n\nWHAT'S INCLUDED\n30 bingo cards, US Letter and A4.\n\nAI DISCLOSURE\nMade with AI tools.", priceUsd: 4.99, targetSearch: "christmas bingo", provenSellers: ["Holiday Bingo | 1300 reviews | shop sales 25000 | $5.5"] };
const reply = (listing: Record<string, unknown>, requestId = "r1") => JSON.stringify({ version: "GXL_LISTING_REVIEW_V1", requestId, scores: { title: 6, tags: 5, description: 7, images: 4, price: 8 }, issuesTr: ["Kapak rakiplerle aynı renkte"], listing, imageFixesTr: ["Kapağı kırmızı zeminle yeniden yap"] });
const tags = ["christmas bingo", "holiday party game", "xmas bingo cards", "family game night", "printable bingo", "christmas games", "office party game", "classroom bingo", "winter party game", "kids christmas game", "bingo for adults", "christmas activity", "instant download"];

test("the reviewer prompt carries the proven sellers and asks for web research and a strict JSON", () => {
  const prompt = listingReviewPrompt("gemini", context, "r1");
  assert.match(prompt, /1300 reviews/);
  assert.match(prompt, /Search the web/);
  assert.match(prompt, /GXL_LISTING_REVIEW_V1/);
  assert.match(prompt, /Never invent a number/);
});

test("review JSON is applied only when it keeps the counts and Etsy text rules", () => {
  const ok = parseListingReview(`Here:\n${reply({ title: "Christmas Bingo Cards Printable, 30 Cards for Holiday Party, US Letter and A4", tags, openingEn: "A ready-to-print Christmas bingo set with thirty unique cards for family and office parties." })}`, "r1", context);
  assert.equal(ok.tags.length, 13);
  assert.equal(ok.scores.images, 4);
  const description = applyOpening(context.description, ok.openingEn);
  assert.match(description, /^A ready-to-print Christmas bingo set/);
  assert.match(description, /AI DISCLOSURE/);
  assert.throws(() => parseListingReview(reply({ title: "Christmas Bingo Cards, 50 Cards", tags, openingEn: "" }), "r1", context), /olmayan sayı eklendi \(50\)/);
  assert.throws(() => parseListingReview(reply({ title: "Noel tombala kartları", tags, openingEn: "" }), "r1", context), /İngilizce/);
  assert.throws(() => parseListingReview(reply({ title: "Christmas Bingo Cards", tags: tags.slice(0, 10), openingEn: "" }), "r1", context), /13 farklı etiket/);
  assert.throws(() => parseListingReview(reply({ title: "Christmas Bingo Cards", tags, openingEn: "" }, "old"), "r1", context), /son denetim talimatına ait değil/);
});

test("Gemini is a full production option for digital packages and physical listings", () => {
  const brief = buildPrintableBrief(normalizePrintablePlanInput({ kind: "party", productType: "christmas bingo game", seed: "g", assistant: "gemini" }));
  assert.match(brief.masterPrompt, /- Gemini: görselleri yerleşik görsel aracınla üret/);
  assert.match(brief.masterPrompt, /baskıya hazır HTML/);
  assert.match(fullListingPrompt("gemini", { kind: "tesbih", nameTr: "kehribar tesbih" }, "x"), /2\. Research: search the web/);
  assert.match(photoEnhancePrompt("gemini", "tesbih"), /Never use the image generation or image editing tool/);
});
