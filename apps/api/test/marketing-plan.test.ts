import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMarketingPlan, normalizeMarketingInput, type ChannelAdvice } from "../../worker/src/marketing-plan.js";
import { handleRequest } from "../../worker/src/index.js";

const byId = (channels: ChannelAdvice[], id: string) => channels.find((item) => item.id === id)!;

test("Etsy ads are only suggested when the listing can turn a click into a sale", async () => {
  const base = { productName: "925 gümüş tesbih", kind: "tesbih", channel: "etsy" };
  const noShop = await buildMarketingPlan(normalizeMarketingInput({ ...base, activeEtsyListings: 0 }));
  assert.equal(byId(noShop.channels, "etsy_ads").decision, "later", "no active listing, nothing to advertise");
  const fewPhotos = await buildMarketingPlan(normalizeMarketingInput({ ...base, activeEtsyListings: 3, photoCount: 2 }));
  assert.match(byId(fewPhotos.channels, "etsy_ads").whyTr, /2 fotoğraf/);
  const cheap = await buildMarketingPlan(normalizeMarketingInput({ ...base, kind: "pdf", priceUsd: 3, activeEtsyListings: 3 }));
  assert.equal(byId(cheap.channels, "etsy_ads").decision, "later");
  const thin = await buildMarketingPlan(normalizeMarketingInput({ ...base, priceTry: 2000, profitTry: 300, activeEtsyListings: 3 }));
  assert.equal(byId(thin.channels, "etsy_ads").decision, "skip", "15% margin cannot pay for ads");
  assert.equal(byId(thin.channels, "offsite_ads").decision, "skip", "Offsite Ads 15% fee would turn the sale into a loss");
  const ready = await buildMarketingPlan(normalizeMarketingInput({ ...base, priceTry: 3000, profitTry: 1500, priceUsd: 70, activeEtsyListings: 4, photoCount: 8 }));
  const ads = byId(ready.channels, "etsy_ads");
  assert.equal(ads.decision, "now");
  assert.match(ads.budgetTr || "", /1–3 USD, 30 gün/);
  assert.match(ads.stopRuleTr || "", /30 gün sonra/);
  assert.equal(byId(ready.channels, "offsite_ads").decision, "always");
  assert.equal(byId(ready.channels, "etsy_offers").decision, "always", "offers to buyers who favourited or left the cart cost nothing");
});

test("Etsy buyers are never sent to WhatsApp; Shopier buyers get a one-tap WhatsApp link and quick replies", async () => {
  const etsy = await buildMarketingPlan(normalizeMarketingInput({ productName: "Tığ işi hırka", kind: "knitwear", channel: "etsy", whatsappNumber: "0532 123 45 67" }));
  const etsyWhatsapp = byId(etsy.channels, "whatsapp");
  assert.equal(etsyWhatsapp.decision, "skip");
  assert.equal(etsyWhatsapp.openUrl, undefined);
  assert.ok(etsy.rulesTr.some((rule) => rule.includes("Etsy ilanına") && rule.includes("WhatsApp")));

  const shopier = await buildMarketingPlan(normalizeMarketingInput({ productName: "Kehribar tesbih", kind: "tesbih", channel: "shopier", priceTry: 1800, link: "https://www.shopier.com/goxsel/1", whatsappNumber: "0532 123 45 67" }));
  const whatsapp = byId(shopier.channels, "whatsapp");
  assert.equal(whatsapp.decision, "now");
  assert.match(whatsapp.openUrl || "", /^https:\/\/wa\.me\/905321234567\?text=/);
  assert.ok(whatsapp.copy.some((block) => block.labelTr.includes("/fiyat") && block.text.includes("1.800 TL") && block.text.includes("https://www.shopier.com/goxsel/1")));
  assert.equal(shopier.channels[0].id, "instagram", "for Shopier, Instagram comes first");
  assert.ok(!shopier.channels.some((item) => item.id === "etsy_ads"));
  assert.ok(shopier.rulesTr.some((rule) => rule.includes("İYS")), "mass messaging rules are stated");
  assert.equal(normalizeMarketingInput({ productName: "Tesbih", whatsappNumber: "12345" }).whatsappNumber, undefined, "a broken number never becomes a link");
});

test("AI writes the share texts; without AI the plan still comes with templates", async () => {
  const offline = await buildMarketingPlan(normalizeMarketingInput({ productName: "Bütçe planlayıcı", kind: "pdf", channel: "etsy" }), {});
  assert.equal(offline.aiCopy, false);
  assert.ok(byId(offline.channels, "instagram").copy[0].text.includes("#printableplanner"));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    captionTr: "Yeni planlayıcı", captionEn: "New planner", hashtagsTr: ["planlayıcı", "#ajanda", "düzen<script>"], hashtagsEn: ["planner", "printable", "etsy"],
    storyTr: "Hikâye", whatsappTr: "Merhaba", pinTitleEn: "Budget Planner", pinDescriptionEn: "Printable budget planner"
  }) }] } }] })) as typeof fetch;
  try {
    const plan = await buildMarketingPlan(normalizeMarketingInput({ productName: "Bütçe planlayıcı", kind: "pdf", channel: "etsy" }), { GEMINI_API_KEY: "test" });
    assert.equal(plan.aiCopy, true);
    const text = byId(plan.channels, "instagram").copy[0].text;
    assert.match(text, /^New planner\n\n#planner #printable #etsy$/);
    assert.match(byId(plan.channels, "pinterest").copy[0].text, /Budget Planner/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the plan endpoint needs the app key and a product name", async () => {
  const env = { APP_ACCESS_TOKEN: "app-token" };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const missing = await handleRequest(new Request("https://gxl.example/api/marketing/plan", { method: "POST", headers, body: JSON.stringify({ productName: "" }) }), env);
  assert.equal(missing.status, 400);
  const denied = await handleRequest(new Request("https://gxl.example/api/marketing/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productName: "Tesbih" }) }), env);
  assert.equal(denied.status, 401);
  const ok = await handleRequest(new Request("https://gxl.example/api/marketing/plan", { method: "POST", headers, body: JSON.stringify({ productName: "Oltu tesbih", kind: "tesbih", channel: "shopier" }) }), env);
  assert.equal(ok.status, 200);
  const body = await ok.json() as { plan: { channels: Array<{ id: string }> } };
  assert.deepEqual(body.plan.channels.map((item) => item.id), ["instagram", "whatsapp", "facebook", "pinterest"]);
});

test("the agent screen opens with the sales plan card", () => {
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  assert.match(app, /<SalesPlanCard online=\{online\} shopierProducts=\{shopierProducts\} etsyActiveListings=\{etsyActiveListings\} \/>/);
  assert.match(app, /apiJson\("\/api\/marketing\/plan"/);
  assert.match(app, /WhatsApp numaranız \(yalnız bu telefonda saklanır\)/);
});
