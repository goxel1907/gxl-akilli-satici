import assert from "node:assert/strict";
import test from "node:test";
import { canAutoReply, canStartConversation, requestsOptOut, requiresHumanHandoff, validateDecision } from "../src/policy.js";
import type { Lead, Product } from "../src/types.js";

const lead: Lead = {
  id: "l1",
  displayName: "Test",
  channel: "whatsapp",
  handle: "x",
  stage: "active",
  consent: true,
  interests: [],
  score: 50,
  autoReplyAllowed: true
};

test("ilk temas için açık rıza gerekir", () => {
  assert.equal(canStartConversation(lead), true);
  assert.equal(canStartConversation({ ...lead, consent: false }), false);
});

test("otomatik cevap için aktif görüşme ve izin gerekir", () => {
  assert.equal(canAutoReply(lead), true);
  assert.equal(canAutoReply({ ...lead, stage: "qualified" }), false);
  assert.equal(canAutoReply({ ...lead, autoReplyAllowed: false }), false);
});

test("iletişimden çıkma talepleri yakalanır", () => {
  assert.equal(requestsOptOut("Lütfen mesaj istemiyorum"), true);
  assert.equal(requestsOptOut("Fiyat nedir?"), false);
});

test("pazarlık ve iade insan devralmasına gider", () => {
  assert.equal(requiresHumanHandoff("Biraz indirim olur mu?"), true);
  assert.equal(requiresHumanHandoff("Ürün stokta mı?"), false);
});

test("çakı önerisi insan kontrolüne gider", () => {
  const product: Product = {
    id: "p1", sku: "C1", name: "Çakı", category: "caki", description: "", priceTry: 10,
    stock: 1, stockVerified: true, material: "çelik", imageUrls: [], videoUrls: [], tags: []
  };
  const result = validateDecision({ reply: "", productIds: ["p1"], action: "reply", reason: "" }, [product]);
  assert.equal(result.action, "handoff");
});
