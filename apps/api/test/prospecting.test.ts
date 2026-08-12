import assert from "node:assert/strict";
import test from "node:test";
import { scoreProspect } from "../src/prospecting.js";

test("izinsiz etkileşim ilk mesaj için uygun sayılmaz", () => {
  const result = scoreProspect([{ type: "product_favorite", channel: "instagram", occurredAt: new Date().toISOString(), consent: false, productTags: ["oyuncak"] }], ["oyuncak"]);
  assert.equal(result.grade, "ineligible");
  assert.equal(result.canDraftFirstContact, false);
});

test("güncel sepet ve gelen mesaj sıcak müşteri üretir", () => {
  const now = new Date().toISOString();
  const result = scoreProspect([
    { type: "cart", channel: "shopier", occurredAt: now, consent: true, productTags: ["koleksiyon"] },
    { type: "inbound_message", channel: "instagram", occurredAt: now, consent: true, productTags: ["koleksiyon"], text: "Fiyat ve kargo nedir?" }
  ], ["koleksiyon"]);
  assert.equal(result.grade, "hot");
  assert.equal(result.canDraftFirstContact, true);
});
