import { PRINTABLE_WORKSPACE_KEY } from "../../mobile/workflow-state.js";
import { readFile } from "node:fs/promises";
import { handleRequest } from "../../worker/src/index.js";
import { validPdf } from "./fixtures/valid-pdf.js";
import type { DigitalProduct, DigitalStore } from "../../worker/src/digital-delivery.js";
import assert from "node:assert/strict";
import test from "node:test";
import { scoreTrend } from "../../worker/src/etsy-trends.js";
import { buildDigitalListing } from "../../worker/src/pattern-studio.js";
import { buttons, screens, mount, tap, field, type, unmount, visible, text, ui, waitFor, act } from "./fixtures/mobile-ui.js";

const seed = { studio: "printable", kind: "coloring", keyword: "animal coloring pages", productType: "animal coloring pages", colors: [], formats: ["US Letter", "A4"], basis: [], trendTags: [], trendFeatures: [] };
function router(handler?: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (handler) return handler(path, init);
    if (path === "/api/patterns/seed") return Response.json(seed);
    if (path === "/api/etsy/trends") return Response.json({ configured: true, groups: [], niches: [] });
    if (path === "/api/digital/products") return Response.json({ products: [] });
    throw Error(`Unexpected request ${path}`);
  }) as typeof fetch;
}

test("Trend custom input survives visits to Studio, Digital and another main tab", async context => {
  context.mock.method(globalThis, "fetch", router());
  const props = { online: true, active: true, channels: { etsy: { shopReady: true, shopId: 777 } } };
  const renderer = await mount(screens.EtsyScreen, props);
  try {
    const input = renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!;
    await act(async () => input.props.onChangeText("abc animal coloring pages"));
    await tap(renderer, /^Stüdyo$/); await tap(renderer, /^Dijital$/); await tap(renderer, /^Trend$/);
    assert.equal(renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!.props.value, "abc animal coloring pages");
    await act(async () => renderer.update((await import("react")).createElement(screens.EtsyScreen, { ...props, active: false })));
    await act(async () => renderer.update((await import("react")).createElement(screens.EtsyScreen, props)));
    assert.equal(renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!.props.value, "abc animal coloring pages");
  } finally { await unmount(renderer); }
});

test("a late seed response cannot switch Studio back from the physical mode", async context => {
  let finish!: (response: Response) => void;
  context.mock.method(globalThis, "fetch", router(() => new Promise(resolve => { finish = resolve; })));
  const renderer = await mount(screens.StudioPanel, { online: true, active: true, onUpload: () => {} });
  try {
    await tap(renderer, /^Elimdeki ürün \(fotoğraf\)$/);
    await act(async () => finish(Response.json(seed)));
    assert.equal(visible(renderer.root.findByProps({ testID: "studio-mode-physical" })), true);
    assert.equal(visible(renderer.root.findByProps({ testID: "studio-mode-printable" })), false);
  } finally { await unmount(renderer); }
});

test("printable form edits survive a round trip through another Studio mode", async context => {
  context.mock.method(globalThis, "fetch", router((_path, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    return Response.json(body.studio === "pattern" ? { studio: "pattern", craft: "crochet", productType: "doily", keyword: "crochet doily pattern", colors: [], basis: [], trendTags: [], trendFeatures: [], skillLevel: "easy" } : seed);
  }));
  const renderer = await mount(screens.StudioPanel, { online: true, active: true, onUpload: () => {} });
  try {
    await waitFor(() => buttons(renderer, /^Konumu veya kapsamı kendim belirleyeceğim$/).length === 1);
    await tap(renderer, /^Konumu veya kapsamı kendim belirleyeceğim$/);
    await waitFor(() => field(renderer, /^Ürün \(İngilizce\)$/).props.value === seed.productType);
    await type(renderer, /^Ürün \(İngilizce\)$/, "ocean animal coloring pages");
    await tap(renderer, /^El işi deseni$/); await tap(renderer, /^Dijital ürün$/);
    assert.equal(field(renderer, /^Ürün \(İngilizce\)$/).props.value, "ocean animal coloring pages");
  } finally { await unmount(renderer); }
});

test("actual main navigation keeps the Etsy workspace mounted when visiting Overview", async context => {
  ui.storage.clear(); ui.storage.set("gxl.appAccessToken", "local-test"); ui.storage.set("gxl.appMode", "expert");
  const basic = router();
  context.mock.method(globalThis, "fetch", router((path, init) => {
    if (path === "/api/dashboard") return Response.json({ products: [], leads: [], approvals: [], messages: [], metrics: { activeLeads: 0, pendingApprovals: 0, catalogProducts: 0, conversations: 0 } });
    if (path === "/api/channels/status") return Response.json({ etsy: { configured: true, connected: true, shopReady: true, shopId: 777 }, shopier: { connected: false } });
    if (path === "/api/opportunities") return Response.json({ counts: { realCustomers: 0, permissionedProspects: 0, marketSignals: 0 }, sources: [], opportunities: [], guardrails: [], summary: "Local test" });
    if (path === "/api/shopier/center") return Response.json({ connected: false, products: [], orders: [], counts: { products: 0, recentOrders: 0 }, capabilities: {}, blockers: [], recentWebhookEvents: [] });
    return basic(`https://local.invalid${path}`, init);
  }));
  const renderer = await mount(screens.App, {});
  try {
    await waitFor(() => renderer.root.findAllByType("TextInput" as any).some(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara")));
    const input = renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!;
    await act(async () => input.props.onChangeText("ocean alphabet coloring"));
    await tap(renderer, /^Özet$/); await tap(renderer, /^Etsy$/);
    assert.equal(renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!.props.value, "ocean alphabet coloring");
  } finally { await unmount(renderer); ui.storage.clear(); }
});

test("discovery group filters persist through nested tab changes", async context => {
  let onlyDigital = false;
  context.mock.method(globalThis, "fetch", router(path => {
    if (path === "/api/etsy/trends") return Response.json({ configured: true, niches: [], groups: [{ id: "printables", labelTr: "Dijital ürünler" }] });
    if (path === "/api/etsy/discoveries") return Response.json({ items: [{ keyword: "animal coloring pages", keywordTr: "Hayvan boyama", group: "printables", from: "abc coloring" }, { keyword: "vintage silver brooch", keywordTr: "Vintage gümüş broş", group: "vintage", from: "vintage jewelry" }].filter(row => !onlyDigital || row.group === "printables"), autopilot: { enabled: true } });
    if (path === "/api/etsy/seasonal") return Response.json({ events: [] });
    throw Error(`Unexpected request ${path}`);
  }));
  const renderer = await mount(screens.TrendPanel, { online: true, onUse: () => {} });
  try {
    await tap(renderer, /^Keşfedilenler$/); await tap(renderer, /^Vintage$/);
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Hayvan boyama"));
    await tap(renderer, /^Sezon fırsatları$/); await tap(renderer, /^Keşfedilenler$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Vintage gümüş broş"));
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Hayvan boyama"));
    onlyDigital = true; await tap(renderer, /^Yenile$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Hayvan boyama"));
  } finally { await unmount(renderer); }
});

function sample(keyword: string, group: "printables" | "patterns" | "tesbih" | "vintage", score = 70, count = 3) {
  return { ...scoreTrend(keyword, { count: 1000, results: Array.from({ length: count }, () => ({ title: keyword, listing_type: group === "printables" || group === "patterns" ? "download" : "physical", tags: ["sample tag"], num_favorers: 20, price: { amount: 600, divisor: 100, currency_code: "USD" } })) }, Date.now(), group), score };
}

test("each main Trend group exposes its matching action and transfers the selected kind", async context => {
  const rows = [
    { id: "c", labelTr: "Hayvan boyama", keyword: "animal coloring pages", group: "printables", kind: "coloring" },
    { id: "p", labelTr: "Kendi dantel desenim", keyword: "crochet doily pattern", group: "patterns", craft: "crochet" },
    { id: "t", labelTr: "Gümüş tesbihler", keyword: "silver prayer beads", group: "tesbih" },
    { id: "v", labelTr: "Eski broşlar", keyword: "vintage silver brooch", group: "vintage" }
  ];
  const groups = [{ id: "printables", labelTr: "Dijital ürünler" }, { id: "patterns", labelTr: "Hobi desenleri" }, { id: "tesbih", labelTr: "Tesbih ve gümüş" }, { id: "vintage", labelTr: "Vintage ürünler" }];
  const used: any[] = [];
  context.mock.method(globalThis, "fetch", router(path => path === "/api/etsy/trends" ? Response.json({ configured: true, groups, niches: rows.map(row => ({ ...row, result: sample(row.keyword, row.group as any) })) }) : Response.json({ items: [], events: [] })));
  const renderer = await mount(screens.TrendPanel, { online: true, onUse: (value: unknown) => used.push(value) });
  try {
    for (const [index, row] of rows.entries()) {
      await tap(renderer, new RegExp(`^${groups[index].labelTr}$`));
      await tap(renderer, new RegExp(`^${row.labelTr}`));
      if (index < 2) {
        await tap(renderer, index === 0 ? /^Bu nişte dijital ürün hazırla$/ : /^Bu nişte kendi desenimi listele$/);
        assert.equal(used.at(-1).group, row.group); assert.equal(used.at(-1).keyword, row.keyword);
        if (index === 0) assert.equal(used.at(-1).kind, "coloring");
      } else {
        assert.equal(buttons(renderer, /^Bu nişte dijital ürün hazırla$/).length, 0);
        await tap(renderer, /^Üst etiketleri kopyala$/);
        await tap(renderer, /^Kendi fiziksel ürünümle devam et$/);
        assert.equal(used.at(-1).studio, "physical");
        assert.equal(used.at(-1).group, row.group);
      }
    }
    assert.equal(used.length, 4);
  } finally { await unmount(renderer); }
});

test("season scans preserve the declared group and tiny samples are not called the strongest", async context => {
  const requests: any[] = [];
  const items = [{ keyword: "christmas printables", group: "printables", result: sample("christmas printables", "printables", 99, 1) }, { keyword: "christmas coloring pages", group: "printables", result: sample("christmas coloring pages", "printables", 70) }];
  context.mock.method(globalThis, "fetch", router((path, init) => {
    if (path === "/api/etsy/seasonal") return Response.json({ events: [{ id: "christmas", nameTr: "Noel", date: "2026-12-25", daysUntil: 50, listByProducts: "2026-11-10", listByPatterns: "2026-10-20", urgency: "Bu ay hazırla", keywords: items }] });
    const body = JSON.parse(String(init?.body)); requests.push(body); return Response.json(sample(body.keyword, body.group));
  }));
  const renderer = await mount(screens.SeasonalPanel, { online: true, onUse: () => {} });
  try {
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node).includes("En güçlü arama: christmas coloring pages (70 puan)")));
    await tap(renderer, /^Yeniden tara$/);
    assert.equal(requests.length, 2); assert.ok(requests.every(body => body.group === "printables"));
  } finally { await unmount(renderer); }
});

test("editing a seller-written pattern invalidates the old listing before upload", async context => {
  const uploads: any[] = [];
  context.mock.method(globalThis, "fetch", router((path, init) => {
    if (path === "/api/patterns/seed") return Response.json({ studio: "pattern", craft: "crochet", productType: "doily", keyword: "crochet doily pattern", colors: [], basis: [], trendTags: [], trendFeatures: [], skillLevel: "easy", competition: { launchPriceUsd: 6.5, planTr: [], topCompetitors: [] } });
    const body = JSON.parse(String(init?.body));
    return Response.json({ listing: buildDigitalListing({ ...body, name: body.name || "Ocean Lace Doily" }), quality: { ok: true, issues: [], fixes: [] } });
  }));
  const renderer = await mount(screens.StudioPanel, { online: true, active: true, seed: { group: "patterns", keyword: "crochet doily pattern" }, onUpload: (value: unknown) => uploads.push(value) });
  try {
    await type(renderer, /^Desenin adı/, "Ocean Lace Doily");
    await tap(renderer, /^Deseni ben veya mağaza üyem yazdı/);
    await tap(renderer, /^Desenle ürünü bizzat yaptık/);
    await tap(renderer, /^Bitmiş ürünün gerçek/);
    await tap(renderer, /^Kendi desenim için ilanı hazırla$/);
    assert.equal(buttons(renderer, /^Dosyalar hazırsa yükle →$/).length, 1);
    await tap(renderer, /^Dosyalar hazırsa yükle →$/);
    assert.equal(uploads[0].priceUsd, 6.5);
    await type(renderer, /^Ürün türü \(İngilizce\)$/, "cardigan");
    assert.equal(buttons(renderer, /^Dosyalar hazırsa yükle →$/).length, 0);
    await tap(renderer, /^Kendi desenim için ilanı hazırla$/);
    assert.equal(buttons(renderer, /^Dosyalar hazırsa yükle →$/).length, 0, "A new product needs new ownership and testing confirmations");
    await tap(renderer, /^Deseni ben veya mağaza üyem yazdı/); await tap(renderer, /^Desenle ürünü bizzat yaptık/); await tap(renderer, /^Bitmiş ürünün gerçek/);
    await tap(renderer, /^Kendi desenim için ilanı hazırla$/); await tap(renderer, /^Dosyalar hazırsa yükle →$/);
    assert.equal(uploads[1].priceUsd, undefined, "The previous product's competitor price cannot carry over");
  } finally { await unmount(renderer); }
});

test("a discovered result can be explicitly rescanned without leaving its tab", async context => {
  let scans = 0;
  context.mock.method(globalThis, "fetch", router((path, init) => {
    if (path === "/api/etsy/discoveries") return Response.json({ items: [{ keyword: "animal coloring pages", keywordTr: "Hayvan boyama", group: "printables", from: "alphabet coloring" }], autopilot: { enabled: true } });
    const body = JSON.parse(String(init?.body)); assert.equal(body.group, "printables"); assert.equal(body.force, true); scans++;
    return Response.json(sample(body.keyword, body.group, 60 + scans));
  }));
  const renderer = await mount(screens.DiscoveryPanel, { online: true, onUse: () => {} });
  try {
    await tap(renderer, /^Hayvan boyama/);
    assert.equal(scans, 1);
    await tap(renderer, /^Bu aramayı yeniden tara$/);
    assert.equal(scans, 2);
  } finally { await unmount(renderer); }
});

async function confirm(title: RegExp, button: RegExp) {
  const alert = [...ui.alerts].reverse().find(item => title.test(item.title));
  assert.ok(alert, `Expected alert ${title}; saw ${ui.alerts.map(item => item.title).join(" | ")}`);
  const action = alert.buttons.find(item => button.test(item.text)); assert.ok(action, `Expected action ${button}`);
  await act(async () => { await action.onPress?.(); });
}

test("real screen buttons drive Trend → Studio → Digital → draft → verified active through the Worker", async context => {
  ui.alerts.length = 0; ui.assets.clear();
  const values = new Map<string, string | ArrayBuffer>();
  const store = { async get(key: string, type?: string) { const value = values.get(key); return value === undefined ? null : type === "arrayBuffer" ? value : typeof value === "string" ? value : new TextDecoder().decode(value); }, async put(key: string, value: string | ArrayBuffer) { values.set(key, value); }, async delete(key: string) { values.delete(key); } } as DigitalStore;
  await store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", userId: "123", expiresAt: Date.now() + 3600000 }));
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store };
  let plan: any, saved: DigitalProduct | undefined, state = "draft", draftWrites = 0, imageWrites = 0, fileWrites = 0, publishWrites = 0;
  let sent: URLSearchParams | undefined;
  const NativeFormData = globalThis.FormData;
  // RN's native transport resolves URI parts into bytes. Model that boundary,
  // then run the actual Worker, validation and storage code in this test.
  class UriFormData extends NativeFormData {
    append(name: string, value: any, fileName?: string): void {
      if (value && typeof value === "object" && "uri" in value) {
        const asset = ui.assets.get(value.uri); if (!asset) throw Error(`Unknown local asset ${value.uri}`);
        value = new File([Uint8Array.from(asset.bytes)], value.name || asset.name, { type: value.type || asset.type });
      }
      if (fileName === undefined) super.append(name, value); else super.append(name, value, fileName);
    }
  }
  globalThis.FormData = UriFormData;
  context.mock.method(globalThis, "fetch", (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "local.invalid") {
      const response = await handleRequest(new Request(url, init), env);
      if (url.pathname === "/api/printables/plan" && response.ok) plan = await response.clone().json();
      if (url.pathname === "/api/digital/products" && init?.method === "POST" && response.ok) saved = (await response.clone().json() as { product: DigitalProduct }).product;
      return response;
    }
    if (url.pathname.endsWith("/listings/active")) return Response.json({ count: 1000, results: [4,6,8].map(price => ({ title: "ABC Animal Coloring Book Baby Shower", listing_type: "download", tags: ["alphabet", "animals", "baby shower"], num_favorers: 30, price: { amount: price * 100, divisor: 100, currency_code: "USD" } })) });
    if (url.pathname.endsWith("/users/123/shops")) return Response.json({ shop_id: 777, shop_name: "GXLMarketStudio", currency_code: "USD" });
    if (url.pathname.endsWith("/seller-taxonomy/nodes")) return Response.json({ results: [{ id: 10, name: "Coloring Books", children: [] }] });
    if (url.pathname === "/v3/application/shops/777/listings") { draftWrites++; sent = init?.body as URLSearchParams; return Response.json({ listing_id: 901 }, { status: 201 }); }
    if (init?.method === "PATCH") { publishWrites++; throw Error("The test must not publish a listing"); }
    if (url.pathname.endsWith("/images")) { imageWrites++; return Response.json({ listing_image_id: 1 }, { status: 201 }); }
    if (url.pathname.endsWith("/files")) { fileWrites++; return Response.json({ listing_file_id: fileWrites }, { status: 201 }); }
    if (url.pathname.endsWith("/listings/901")) return Response.json({ listing_id: 901, shop_id: 777, state });
    throw Error(`Unexpected external request ${url}`);
  }) as typeof fetch);
  let renderer = await mount(screens.EtsyScreen, { online: true, channels: { etsy: { shopReady: true, shopId: 777 } } });
  try {
    const search = renderer.root.findAllByType("TextInput" as any).find(node => visible(node) && String(node.props.placeholder).startsWith("Arama tara"))!;
    await act(async () => search.props.onChangeText("abc animal coloring book baby shower"));
    const searchButton = renderer.root.findAllByType("Pressable" as any).find(node => visible(node) && node.findAllByType("Icon" as any).some(icon => icon.props.name === "search"))!;
    await act(async () => { await searchButton.props.onPress(); });
    await tap(renderer, /^Bu nişte dijital ürün hazırla$/);
    await waitFor(() => buttons(renderer, /^Bu öneriyi seç →$/).length === 1);
    assert.equal(Boolean(plan), false, "Suggestion previews must not prepare or publish the selected product");
    await tap(renderer, /^Açıklama, etiketler ve rakip dayanağı$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node).includes("Gözlenen fiyat ve başlıklar satışın nedenini kanıtlamaz")));
    await tap(renderer, /^Kapat$/);
    await tap(renderer, /^Bu öneriyi seç →$/);
    assert.ok(plan?.quality.ok, JSON.stringify(ui.alerts));
    await tap(renderer, /^Tek paketi ChatGPT’ye gönder$/);
    assert.ok((ui.shares.at(-1) as { message: string }).message.startsWith(plan.brief.masterPrompt));
    assert.match((ui.shares.at(-1) as { message: string }).message,/GXL production tracking/);
    assert.ok(ui.storage.has(PRINTABLE_WORKSPACE_KEY), "Prepared handoff must survive leaving the app");
    await unmount(renderer);
    renderer = await mount(screens.EtsyScreen, { online: true, channels: { etsy: { shopReady: true, shopId: 777 } } });
    await tap(renderer, /^Stüdyo$/); await tap(renderer, /^Son çalışmayı aç$/);
    assert.equal(visible(renderer.root.findByProps({testID:"saved-production-details"})),true);
    await tap(renderer,/^Bu çalışmayı Stüdyo’da sürdür$/);
    assert.equal(visible(renderer.root.findByProps({ testID: "listing-offer-production" })), true);
    await tap(renderer, /^Dosyalarım hazır, yüklemeye geç$/);
    assert.equal(field(renderer, /^Ürün adı$/).props.value, plan.brief.name);
    assert.equal(field(renderer, /^Başlık \(/).props.value, plan.listing.title);
    assert.equal(field(renderer, /^Etiketler \(/).props.value, plan.listing.tags.join(", "));
    assert.equal(Number(field(renderer, /^Etsy fiyatı \(USD\)$/).props.value), plan.brief.priceUsd);
    const assets = ["US-Letter", "A4"].map(size => {
      const name = `${plan.brief.name.replaceAll(" ", "-")}-${size}.pdf`, bytes = validPdf(name), uri = `local:${name}`;
      ui.assets.set(uri, { name, bytes, type: "application/pdf" }); return { uri, name, size: bytes.length, mimeType: "application/pdf" };
    });
    const png = Uint8Array.from(await readFile("apps/mobile/assets/icon.png"));
    ui.assets.set("local:preview.png", { name: "Preview.png", bytes: png, type: "image/png" });
    ui.pickFiles = async () => ({ canceled: false, assets });
    ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:preview.png", fileName: "Preview.png", fileSize: png.length, mimeType: "image/png" }] });
    await tap(renderer, /^Goxi ile ürün dosyalarını seç$/); await tap(renderer, /^Goxi ile ilan görsellerini seç$/);
    await tap(renderer, /^Test baskısı alındı/);
    await tap(renderer, /^Goxi ile dosyaları güvenli depoya yükle$/); await confirm(/^Dosyalar güvenli/, /^Yükle$/);
    await waitFor(() => Boolean(saved) && buttons(renderer, /^Etsy taslağı oluştur$/).length === 1);
    assert.equal(saved!.files?.length, 2); assert.equal(saved!.images.length, 1);
    await tap(renderer, /^Goxi ile dosyaları denetle$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Dosya yapısı kontrolleri geçti"));
    assert.equal(draftWrites + imageWrites + fileWrites + publishWrites, 0, "Read-only file QA must not send a listing to Etsy");
    await tap(renderer, /^Goxi ile taslağı hazırla$/); await confirm(/^Etsy'de taslak/, /^Taslak oluştur$/);
    await waitFor(() => buttons(renderer, /^Yayın durumunu denetle$/).length === 1);
    assert.equal(draftWrites, 1); assert.equal(imageWrites, 1); assert.equal(fileWrites, 2);
    assert.equal(sent?.get("title"), plan.listing.title); assert.equal(sent?.get("description"), plan.listing.description);
    assert.equal(sent?.get("tags"), plan.listing.tags.join(",")); assert.equal(sent?.get("price"), plan.brief.priceUsd.toFixed(2));
    await tap(renderer, /^Yayın durumunu denetle$/);
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Etsy’de yayında olduğu doğrulandı"));
    state = "active"; // Simulate the seller's separate Etsy-side publication.
    await tap(renderer, /^Yayın durumunu denetle$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Etsy’de yayında olduğu doğrulandı"));
    assert.equal(publishWrites, 0);
  } finally { await unmount(renderer); globalThis.FormData = NativeFormData; ui.assets.clear(); ui.storage.delete(PRINTABLE_WORKSPACE_KEY); ui.pickFiles = async () => ({ canceled: true }); ui.pickImages = async () => ({ canceled: true }); }
});

test("Digital resumes a partial draft after an error and clears an unverified active badge", async context => {
  ui.alerts.length = 0;
  const product = {
    id: "partial-product", name: "Animal Coloring Pages", kind: "coloring", productType: "animal coloring pages",
    fileName: "Animal-US-Letter.pdf", fileSize: 100,
    files: [{ name: "Animal-US-Letter.pdf", size: 100 }, { name: "Animal-A4.pdf", size: 100 }],
    images: [{ url: "https://local.invalid/preview.png" }],
    listing: { title: "Animal Coloring Pages", description: "Printable pages.", tags: [], materials: [] },
    prices: { usd: 6.5 }, flags: { testMade: true },
    etsy: { listingId: 901, editUrl: "https://www.etsy.com/your/shops/me/listing-editor/edit/901", imagesUploaded: 1, filesUploaded: 1, fileUploaded: false, error: "Temporary failure" }
  };
  let attempts = 0, statusFails = false;
  context.mock.method(globalThis, "fetch", router((path, init) => {
    if (path === "/api/digital/products") return Response.json({ products: [product] });
    if (path.endsWith("/etsy-draft")) {
      assert.equal(path, "/api/digital/products/partial-product/etsy-draft");
      assert.equal(init?.method, "POST");
      attempts++;
      if (attempts === 1) return Response.json({ error: "Temporary failure" }, { status: 502 });
      Object.assign(product.etsy, { filesUploaded: 2, fileUploaded: true, error: "" });
      return Response.json({ editUrl: product.etsy.editUrl });
    }
    if (path.endsWith("/etsy-status")) return statusFails
      ? Response.json({ error: "Connection failed" }, { status: 502 })
      : Response.json({ state: "active", checkedAt: new Date().toISOString(), url: "https://www.etsy.com/listing/901" });
    throw Error(`Unexpected request ${path}`);
  }));
  const renderer = await mount(screens.DigitalPanel, { online: true, shopReady: true, onPrefillUsed: () => {} });
  try {
    await waitFor(() => buttons(renderer, /^Etsy yüklemesini tamamla$/).length === 1);
    await tap(renderer, /^Etsy yüklemesini tamamla$/); await confirm(/^Etsy'de taslak/, /^Taslak oluştur$/);
    assert.ok(ui.alerts.some(item => item.title === "Etsy taslağı oluşturulamadı"));
    assert.equal(buttons(renderer, /^Etsy yüklemesini tamamla$/).length, 1);
    await tap(renderer, /^Etsy yüklemesini tamamla$/); await confirm(/^Etsy'de taslak/, /^Taslak oluştur$/);
    assert.equal(attempts, 2); assert.equal(buttons(renderer, /^Etsy ilanını aç$/).length, 1);
    await tap(renderer, /^Yayın durumunu denetle$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node => text(node) === "Etsy’de yayında olduğu doğrulandı"));
    statusFails = true; await tap(renderer, /^Yayın durumunu denetle$/);
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node => text(node) === "Etsy’de yayında olduğu doğrulandı"));
    assert.ok(ui.alerts.some(item => item.title === "Yayın durumu doğrulanamadı"));
  } finally { await unmount(renderer); }
});

test("physical Trend groups open the photo workflow without generating a crochet or printable seed", async context => {
  let seedRequests = 0;
  context.mock.method(globalThis, "fetch", router(path => {
    if (path === "/api/patterns/seed") { seedRequests++; throw Error("A physical product must not generate a pattern"); }
    if (path === "/api/etsy/trends") return Response.json({ configured: true, groups: [{ id: "tesbih", labelTr: "Tesbih ve gümüş" }], niches: [{ id: "silver", labelTr: "Gümüş tesbih", keyword: "silver prayer beads", group: "tesbih", result: sample("silver prayer beads", "tesbih") }] });
    if (path === "/api/digital/products") return Response.json({ products: [] });
    return Response.json({ items: [], events: [] });
  }));
  const renderer = await mount(screens.EtsyScreen, { online: true, channels: { etsy: { shopReady: true } } });
  try {
    await tap(renderer, /^Tesbih ve gümüş$/); await tap(renderer, /^Gümüş tesbih/);
    await tap(renderer, /^Kendi fiziksel ürünümle devam et$/);
    assert.equal(visible(renderer.root.findByProps({ testID: "studio-mode-physical" })), true);
    assert.equal(seedRequests, 0);
  } finally { await unmount(renderer); }
});

test("resuming a saved workspace prevents a late preparation response from replacing it", async context => {
  const { buildPrintableBrief, buildPrintableListing } = await import("../../worker/src/printable-studio.js");
  const { guardPrintablePlan } = await import("../../worker/src/output-guard.js");
  const { generationKey } = await import("../../mobile/workflow-state.js");
  const input = { kind: "coloring", productType: "animal coloring pages", assistant: "claude", referenceNotes: "", colors: "", formats: "US Letter, A4", pageCount: "26", audience: "", keyword: "animal coloring pages", trendTags: [], trendFeatures: [] };
  const brief = buildPrintableBrief({ kind: "coloring", productType: input.productType, assistant: "claude" });
  const prepared = guardPrintablePlan(brief, buildPrintableListing({ kind: "coloring", productType: input.productType }, brief.name), { kind: "coloring" });
  const resume = { version: 1, savedAt: new Date().toISOString(), input, plan: { ...prepared, inputKey: generationKey(input) } };
  let finish!: (response: Response) => void;
  context.mock.method(globalThis, "fetch", router(path => path === "/api/printables/plan" ? new Promise(resolve => { finish = resolve; }) : Response.json({ titleTr: "Yerel açıklama", tags: [] })));
  const props = { online: true, resumeWorkspace: resume, onUpload: () => {}, onPrepared: () => {} };
  const renderer = await mount(screens.PrintableStudio, props);
  try {
    await type(renderer, /^Ürün \(İngilizce\)$/, "ocean coloring pages");
    const generate = buttons(renderer, /^Yeni adla yeniden hazırla$/)[0];
    await act(async () => { void generate.props.onPress(); });
    await act(async () => renderer.update((await import("react")).createElement(screens.PrintableStudio, { ...props, resumeWorkspace: { ...resume } })));
    await act(async () => finish(Response.json(prepared)));
    assert.equal(field(renderer, /^Ürün \(İngilizce\)$/).props.value, input.productType);
    assert.equal(buttons(renderer, /^Dosyalar hazırsa yükle →$/).length, 1);
  } finally { await unmount(renderer); }
});

test("Trend lists searches with buyer demand first and hides weak-demand ones until asked", async context => {
  const rows = [
    { id: "w", labelTr: "Zayıf talepli ürün", keyword: "weak demand item", group: "printables", kind: "planner", result: { ...sample("weak demand item", "printables", 30), verdict: "Talep zayıf" } },
    { id: "s", labelTr: "İlgi gören ürün", keyword: "strong demand item", group: "printables", kind: "planner", result: sample("strong demand item", "printables", 70) }
  ];
  context.mock.method(globalThis, "fetch", router(path => path === "/api/etsy/trends" ? Response.json({ configured: true, groups: [{ id: "printables", labelTr: "Dijital ürünler" }], niches: rows }) : Response.json({ items: [], events: [] })));
  const renderer = await mount(screens.TrendPanel, { online: true, onUse: () => {} });
  try {
    await waitFor(() => renderer.root.findAllByType("Text" as any).some(node => visible(node) && text(node) === "Alıcı ilgisi olan en iyi fırsatlar"));
    const shown = () => renderer.root.findAllByType("Text" as any).filter(node => visible(node)).map(node => text(node)).join(" | ");
    assert.match(shown(), /İlgi gören ürün/);
    assert.doesNotMatch(shown(), /Zayıf talepli ürün/);
    await tap(renderer, /^Talebi zayıf 1 aramayı göster$/);
    assert.match(shown(), /Zayıf talepli ürün/);
  } finally { await unmount(renderer); }
});

test("Discovery hides searches whose buyer demand is weak until the seller asks to see them", async context => {
  const summary = (score: number, verdict: string) => ({ score, verdict, activeListings: 500, favoritesPerMonth: 3, scannedAt: new Date().toISOString() });
  const items = [
    { keyword: "weak discovery item", group: "printables", from: "x", rising: false, discoveredAt: new Date().toISOString(), summary: summary(30, "Talep zayıf") },
    { keyword: "strong discovery item", group: "printables", from: "x", rising: false, discoveredAt: new Date().toISOString(), summary: summary(70, "Yüksek fırsat") }
  ];
  context.mock.method(globalThis, "fetch", router(path => path === "/api/etsy/discoveries" ? Response.json({ items, autopilot: { enabled: true, runs: 1, tracked: 2 } }) : Response.json({})));
  const renderer = await mount(screens.DiscoveryPanel, { online: true, onUse: () => {} });
  try {
    const shown = () => renderer.root.findAllByType("Text" as any).filter(node => visible(node)).map(node => text(node)).join(" | ");
    await waitFor(() => shown().includes("strong discovery item"));
    assert.doesNotMatch(shown(), /weak discovery item/);
    await tap(renderer, /^Talebi zayıf 1 keşfi göster$/);
    assert.match(shown(), /weak discovery item/);
  } finally { await unmount(renderer); }
});

test("Trend explains a group where every scanned search has weak demand and never calls a sub-45 search a strong opportunity", async context => {
  const rows = [
    { id: "a", labelTr: "Vintage bakır", keyword: "vintage copper", group: "vintage", kind: "planner", result: { ...sample("vintage copper", "vintage", 23), verdict: "Talep zayıf" } },
    { id: "b", labelTr: "Vintage broş", keyword: "vintage brooch", group: "vintage", kind: "planner", result: { ...sample("vintage brooch", "vintage", 14), verdict: "Talep zayıf" } }
  ];
  context.mock.method(globalThis, "fetch", router(path => path === "/api/etsy/trends" ? Response.json({ configured: true, groups: [{ id: "vintage", labelTr: "Vintage" }], niches: rows }) : Response.json({ items: [], events: [] })));
  const renderer = await mount(screens.TrendPanel, { online: true, onUse: () => {} });
  try {
    await tap(renderer, /^Vintage$/);
    const shown = () => renderer.root.findAllByType("Text" as any).filter(node => visible(node)).map(node => text(node)).join(" | ");
    await waitFor(() => shown().includes("Bu gruptaki aramaların hepsinde alıcı ilgisi zayıf"));
    assert.doesNotMatch(shown(), /Vintage bakır/);
    assert.doesNotMatch(shown(), /Alıcı ilgisi olan en iyi fırsatlar/);
  } finally { await unmount(renderer); }
});
