import assert from "node:assert/strict";
import test from "node:test";
import { screens, mount, tap, unmount, visible, text, ui, waitFor } from "./fixtures/mobile-ui.js";

// Her ana sekme ve Etsy alt sekmesi, sunucu boş veri döndürse bile açılmalı ve hata ekranı göstermemeli.
const empty = async (input: any) => {
  const path = new URL(String(input instanceof Request ? input.url : input)).pathname;
  if (path === "/api/dashboard") return Response.json({ products: [], leads: [], approvals: [], messages: [], metrics: { activeLeads: 0, pendingApprovals: 0, catalogProducts: 0, conversations: 0 } });
  if (path === "/api/channels/status") return Response.json({ etsy: { configured: true, connected: true, shopReady: true, shopId: 777, activeListings: 1 }, shopier: { connected: false } });
  if (path === "/api/opportunities") return Response.json({ counts: { realCustomers: 0, permissionedProspects: 0, marketSignals: 0 }, sources: [], opportunities: [], guardrails: [], summary: "" });
  if (path === "/api/shopier/center") return Response.json({ connected: false, products: [], orders: [], counts: { products: 0, recentOrders: 0 }, capabilities: {}, blockers: [], recentWebhookEvents: [] });
  if (path === "/api/etsy/trends") return Response.json({ configured: true, niches: [], groups: [{ id: "printables", labelTr: "Dijital ürünler" }] });
  if (path === "/api/etsy/listings/scorecard") return Response.json({ items: [] });
  if (path === "/api/digital/products") return Response.json({ products: [] });
  if (path === "/api/etsy/orders") return Response.json({ orders: [] });
  return Response.json({ items: [], products: [], orders: [], offers: [] });
};
const crashed = (renderer: any) => renderer.root.findAllByType("Text").some((node: any) => visible(node) && /Something went wrong|Beklenmeyen hata|undefined is not|TypeError/.test(text(node)));

for (const mode of ["expert", "simple"]) {
  test(`every ${mode} tab opens without an error screen`, async context => {
    ui.storage.clear(); ui.storage.set("gxl.appAccessToken", "local-test"); ui.storage.set("gxl.appMode", mode);
    context.mock.method(globalThis, "fetch", empty);
    const renderer = await mount(screens.App, {});
    try {
      const tabs = mode === "expert" ? ["Özet", "Shopier", "Ajan", "Onaylar", "Müşteriler", "Ürünler", "Etsy"] : ["Sat", "Siparişler", "Müşteri", "Yardım", "Başla"];
      for (const tab of tabs) { await tap(renderer, new RegExp(`^${tab}$`)); assert.equal(crashed(renderer), false, `${mode}/${tab}`); }
      if (mode === "expert") for (const sub of ["Stüdyo", "Dijital", "Pinterest", "Kılavuz", "Trend"]) { await tap(renderer, new RegExp(`^${sub}$`)); assert.equal(crashed(renderer), false, `Etsy/${sub}`); }
    } finally { await unmount(renderer); ui.storage.clear(); }
  });
}
