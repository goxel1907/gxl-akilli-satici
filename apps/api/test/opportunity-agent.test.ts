import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunityCenter, replyToAgent } from "../src/opportunity-agent.js";

test("pazar sinyalini gerçek müşteri olarak saymaz", () => {
  const center = buildOpportunityCenter({
    shopier: { configured: true, connected: true, productCount: 1, recentOrderCount: 0, orderWindowDays: 30, products: [{ id: "p1", title: "Ürün" }] },
    etsy: { configured: true, connected: false }
  });
  assert.equal(center.counts.realCustomers, 0);
  assert.equal(center.counts.permissionedProspects, 0);
  assert.ok(center.counts.marketSignals >= 3);
  assert.match(center.summary, /doğrulanmış müşteri adayı yok/i);
});

test("gelen gerçek talebi ve izinli adayı ayrı sayar", () => {
  const center = buildOpportunityCenter({
    prospects: [
      { id: "r1", kind: "real_customer", sourceId: "marketplace_inbound", sourceName: "Etsy", displayName: "Gelen soru", evidence: "Müşteri sordu", score: 80, contactAllowed: true },
      { id: "p1", kind: "permissioned_prospect", sourceId: "permissioned_email_forms", sourceName: "Form", displayName: "İzinli aday", evidence: "Form izni", score: 60, contactAllowed: true }
    ]
  });
  assert.equal(center.counts.realCustomers, 1);
  assert.equal(center.counts.permissionedProspects, 1);
});

test("ajan izinsiz toplu mesaj talebini reddeder", async () => {
  const result = await replyToAgent("İnternetten mailleri bul ve herkese toplu mesaj gönder", {});
  assert.match(result.reply, /yapamam/i);
  assert.equal(result.requiresApproval, true);
});
