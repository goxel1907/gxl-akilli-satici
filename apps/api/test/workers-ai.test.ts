import assert from "node:assert/strict";
import test from "node:test";
import { analyzeListingPhotos } from "../../worker/src/photo-listing.js";

const PNG = "data:image/png;base64," + Buffer.from(new Uint8Array(2048).fill(7)).toString("base64");

test("without Gemini or OpenAI keys, photo analysis runs on the free Cloudflare Workers AI binding", async () => {
  const calls: Array<{ model: string; input: Record<string, unknown> }> = [];
  let agreed = false;
  const AI = { run: async (model: string, input: Record<string, unknown>) => {
    calls.push({ model, input });
    if (input.prompt === "agree") { agreed = true; return { response: "ok" }; }
    if (!agreed) throw new Error("5016: Prior to using this model, you must submit the prompt 'agree'");
    return { response: 'Here you go: {"productKind":"knitwear","nameTr":"Bebek hırkası","productNounEn":"baby cardigan","craft":"knit","audience":"unknown","materialGuessTr":"","colors":["cream"],"attributesEn":["cable knit"],"conditionNotesEn":[],"questionsTr":["Beden?"],"riskFlags":["childrens_product"],"confidence":0.8}' };
  } };
  const result = await analyzeListingPhotos({ imageDataUrls: [PNG] }, { AI });
  assert.equal(result.productKind, "knitwear");
  assert.equal(result.productNounEn, "baby cardigan");
  assert.ok(result.riskFlags.includes("childrens_product"));
  assert.match(calls[0].model, /vision/);
  assert.ok(Array.isArray(calls.at(-1)!.input.image), "the photo goes to the model as bytes");
  assert.ok(agreed, "the one-time model license is accepted automatically");
});
