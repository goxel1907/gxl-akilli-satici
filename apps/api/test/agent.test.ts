import assert from "node:assert/strict";
import test from "node:test";
import { decideReply } from "../src/agent.js";
import type { Lead } from "../src/types.js";

test("fiyat bilinmiyorsa ajan fiyat uydurmaz ve doğru Letgo bağlantısını verir", async () => {
  const lead: Lead = {
    id: "gxl-test",
    displayName: "Müşteri",
    channel: "whatsapp",
    handle: "test",
    stage: "active",
    consent: true,
    interests: ["24 gram", "ay yıldız", "oksitli"],
    score: 90,
    autoReplyAllowed: true
  };

  const decision = await decideReply("24 gram olan model hakkında bilgi alabilir miyim?", lead);
  assert.equal(decision.action, "reply");
  assert.match(decision.reply, /güncel fiyatı satış sayfasında/i);
  assert.match(decision.reply, /1732503836/);
  assert.doesNotMatch(decision.reply, /0 TL/);
});
