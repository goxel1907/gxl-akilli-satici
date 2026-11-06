import assert from "node:assert/strict";
import test from "node:test";
import { findIpRisks } from "../../worker/src/ip-guard.js";
import { buildCompetition, buildPatternSeed } from "../../worker/src/pattern-seed.js";
import { upcomingSeasons } from "../../worker/src/seasonal.js";
import { addLocalWhatsapp, localWhatsappLink } from "../../mobile/marketing-local.js";
import { screens, mount, unmount, tap, type, field, buttons, ui, waitFor, visible, text } from "./fixtures/mobile-ui.js";
const source: any = { keyword: "amigurumi kpop pattern", group: "patterns", score: 65, verdict: "Yüksek fırsat", scannedAt: new Date().toISOString(), metrics: { activeListings: 812, sampleSize: 48, medianPriceUsd: 6.47, newcomerShare: 0.58, favoritesPerMonth: 10.8 }, topTags: [{ tag: "stray kids mascots", count: 30 }, { tag: "skzoo baby", count: 20 }, { tag: "cotton amigurumi", count: 5 }], risingTags: [{ tag: "stray kids crochet", weight: 40 }], examples: [] };
test("screen 24 protected names are removed from product feature inputs while the generic K-pop genre remains available", () => {
  assert.deepEqual(findIpRisks("Stray Kids mascots and SKZOO baby"), ["stray kids", "skzoo"]);
  assert.deepEqual(findIpRisks("original kpop-inspired color palette"), []);
  const seed = buildPatternSeed(source.keyword, source, { nonce: "screenshots" });
  assert.doesNotMatch(JSON.stringify({ notes: seed.referenceNotes, features: seed.trendFeatures, tags: seed.trendTags }), /stray kids|skzoo/i);
  assert.ok(seed.basis.some(line => line.includes("kendi yazıp yaparak denediğiniz")));
});
test("screen 21 market brief describes observations rather than unmeasured sales or guaranteed demand", () => {
  const seed = buildPatternSeed(source.keyword, source, { nonce: "facts" });
  assert.doesNotMatch(seed.referenceNotes, /fast-selling|To outsell|buyers favor|main buyers/);
  const comp = buildCompetition({ ...source, signals: { formats: [{ id: "letter", share: 0.1 }], bundleShare: 0.4, ipRisks: [] } }, "party", 10, ["party"]);
  assert.match(comp.planEn.join(" "), /sampled titles or tags mention/);
  assert.doesNotMatch(comp.planTr.join(" "), /yeni mağaza için açık niş/);
});
test("screen 14 expired physical preparation targets are not called list-now opportunities", () => {
  const thanksgiving = upcomingSeasons(new Date("2026-11-06T07:00:00Z")).find(s => s.id === "thanksgiving-2026")!;
  assert.equal(thanksgiving.listByProducts, "2026-10-12");
  assert.equal(thanksgiving.listByDigital, "2026-11-12");
  assert.equal(thanksgiving.urgency, "Yalnız dijital için kısa süre");
  assert.equal(upcomingSeasons(new Date("2026-11-21T07:00:00Z")).find(s => s.id === "thanksgiving-2026")?.urgency, "Hazırlık dönemi geçti");
});
const marketing = { headlineTr: "Paylaşım planı", aiCopy: false, rulesTr: [], channels: [{ id: "whatsapp", titleTr: "WhatsApp Business", decision: "now", decisionTr: "Şimdi", whyTr: "Gelen talepleri yanıtlayın.", stepsTr: [], copy: [] }] };
test("WhatsApp links are created locally and never added to an Etsy marketing channel", () => {
  assert.equal(localWhatsappLink("0555 123 45 67"), "https://wa.me/905551234567");
  assert.throws(() => localWhatsappLink("123"));
  assert.equal(addLocalWhatsapp(marketing, "05551234567", "etsy"), marketing);
  assert.equal(addLocalWhatsapp(marketing, "05551234567", "shopier").channels[0].copy[0].text, "https://wa.me/905551234567");
  assert.equal(marketing.channels[0].copy.length, 0);
});
test("screen 39 marketing request omits the phone, creates its link locally and invalidates it after a product edit", async context => {
  ui.storage.clear(); let sent: any;
  context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return Response.json({ plan: marketing }); });
  const renderer = await mount(screens.SalesPlanCard, { online: true, shopierProducts: [{ id: "one", title: "Püsküllü tesbih", price: 1500 }] });
  try {
    await type(renderer, /^Ürün adı$/, "Püsküllü tesbih");
    await type(renderer, /^WhatsApp numaranız/, "05551234567");
    await tap(renderer, /^Planı hazırla$/);
    assert.equal(sent.whatsappNumber, undefined); assert.ok(!JSON.stringify(sent).includes("5551234567"));
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "https://wa.me/905551234567"));
    await type(renderer, /^Ürün adı$/, "Yeni ürün");
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "https://wa.me/905551234567"));
  } finally { await unmount(renderer); ui.storage.clear(); }
});
test("screens 28/30 disable automatic sends without connection and never offer re-send for manually completed pins", async context => {
  let connected = false, sends = 0;
  context.mock.method(globalThis, "fetch", async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/status")) return Response.json({ configured: connected, connected, settings: { auto: true }, queue: { posted: 1 } });
    if (path.endsWith("/queue")) return Response.json({ jobs: [{ id: "manual", listingId: 1, status: "posted", manual: true, pinIndex: 0, dueAt: new Date().toISOString() }, { id: "pending", listingId: 2, status: "scheduled", pinIndex: 1, dueAt: new Date().toISOString() }] });
    if (path.endsWith("/manual")) return Response.json({ items: [] });
    if (path.endsWith("/run")) { sends++; return Response.json({ status: "posted" }); }
    throw Error(path);
  });
  const renderer = await mount(screens.PinterestPanel, { online: true });
  try {
    await waitFor(() => renderer.root.findAllByType("Text" as any).some(n => text(n).includes("Bu kayıt tamamlandı")));
    assert.equal(buttons(renderer, /^Şimdi gönder$/).length, 0); assert.equal(sends, 0);
    assert.ok(renderer.root.findAllByType("Text" as any).some(n => text(n).includes("Pinterest’ten doğrulanmadı")));
    connected = true; await tap(renderer, /^Yenile$/);
    assert.equal(buttons(renderer, /^Şimdi gönder$/).length, 1); assert.equal(sends, 0);
  } finally { await unmount(renderer); }
});
test("screens 38/40 distinguish old saved chat counts from the current opportunity summary", async () => {
  ui.storage.set("gxl.agentChat", JSON.stringify([{ role: "agent", text: "4 pazar sinyali hazır." }]));
  const renderer = await mount(screens.AgentScreen, { online: false, center: { counts: { marketSignals: 14 }, summary: "14 pazar sinyali hazır.", opportunities: [], sources: [], guardrails: [] } });
  try {
    await waitFor(() => renderer.root.findAllByType("Text" as any).some(n => text(n).includes("Önceki oturumdan kayıt")));
    assert.ok(renderer.root.findAllByType("Text" as any).some(n => text(n) === "Güncel özet: 14 pazar sinyali hazır."));
    assert.ok(renderer.root.findAllByType("Text" as any).some(n => text(n) === "4 pazar sinyali hazır."));
  } finally { await unmount(renderer); ui.storage.delete("gxl.agentChat"); }
});
