import assert from "node:assert/strict";
import test from "node:test";
import { screens, mount, tap, type, unmount, visible, text, ui, buttons, waitFor } from "./fixtures/mobile-ui.js";
import { listingProgress, listingTasks, physicalListingProgress } from "../../mobile/listing-progress.js";

const shown = (renderer: any, value: string) => renderer.root.findAllByType("Text").some((node: any) => visible(node) && text(node) === value);

test("Goxi starts the listing journey from Home before the seller chooses a product", async () => {
  const routes: string[] = [];
  const renderer = await mount(screens.HomeScreen, { online: true, channels: {}, openSell: (route: string) => routes.push(route), setTab: () => {} });
  try {
    assert.ok(shown(renderer, "Goxi · İlan rehberin"));
    assert.ok(shown(renderer, "Merhaba, ben Goxi"));
    await tap(renderer, /^İlan açmaya başlayalım$/);
    assert.deepEqual(routes, ["choose"]);
    await tap(renderer, /^Ayrıntılar ve tüm adımlar$/);
    assert.ok(shown(renderer, "5. Etsy kontrolü ve yayın doğrulaması"));
  } finally { await unmount(renderer); }
});

test("Goxi leads from Trend into Studio and disables online preparation while disconnected", async context => {
  context.mock.method(globalThis, "fetch", async () => { throw Error("Offline guide must not call the API"); });
  const renderer = await mount(screens.EtsyScreen, { online: false, channels: {} });
  try {
    assert.ok(shown(renderer, "Yeni ilanını birlikte hazırlayalım"));
    await tap(renderer, /^Ürünümü seçmek istiyorum$/);
    assert.ok(shown(renderer, "Ne hazırlayalım?"));
    assert.equal(buttons(renderer, /^Araştır ve önerileri getir$/).length, 0);
    await tap(renderer, /^El işi deseni$/);
    assert.ok(renderer.root.findAllByType("Text" as any).some((node: any) => visible(node) && text(node).includes("Yazarlık, bizzat uygulama")));
    assert.equal(buttons(renderer, /^Goxi ile üretim paketini paylaş$/).length, 0);
  } finally { await unmount(renderer); }
});

test("the physical mascot follows wizard validation and never silently analyzes or advances missing information", async context => {
  let apiCalls = 0;
  context.mock.method(globalThis, "fetch", async () => { apiCalls++; throw Error("No API call expected"); });
  ui.alerts.length = 0;
  ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:goxi-product", width: 100, height: 100 }] });
  const renderer = await mount(screens.PhotoListingStudio, { online: true, etsyReady: true, wizard: true });
  try {
    assert.ok(shown(renderer, "Önce ürününün gerçek fotoğraflarını ekle"));
    await tap(renderer, /^Goxi ile galeriden fotoğraf seç$/);
    await tap(renderer, /^İleri$/);
    assert.ok(shown(renderer, "Ürünün bilgilerini doğrula"));
    await tap(renderer, /^Goxi ile sonraki adıma geç$/);
    assert.ok(ui.alerts.some(item => item.title === "Ürün türü"));
    assert.ok(shown(renderer, "Ürünün bilgilerini doğrula"));
    await tap(renderer, /^Tesbih$/);
    await type(renderer, /^Ürün adı \(Türkçe\)$/, "Püsküllü tesbih");
    await tap(renderer, /^Ben \/ atölyem yaptı$/);
    await tap(renderer, /^Goxi ile sonraki adıma geç$/);
    assert.ok(shown(renderer, "Renk ve özellikleri ekle"));
    assert.equal(apiCalls, 0);
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});

test("guidance preserves seller-owned patterns and returns failed file QA to correction", () => {
  const own = { phase: "studio" as const, ownPattern: true, planReady: true };
  assert.equal(listingProgress(own).title, "Kendi denenmiş deseninin dosyalarını hazırla");
  assert.match(listingProgress(own).instruction, /deseni yapay zekâya yazdırma/);
  assert.ok(listingTasks(own).some(line => line.includes("gerçek fotoğraflarını")));
  const failed = listingProgress({ phase: "saved", qaOk: false, verifiedState: "active", files: 1, images: 10 });
  assert.equal(failed.complete, false); assert.equal(failed.step, 3);
  assert.match(failed.title, /yeniden denetle/);
  assert.equal(physicalListingProgress({ photos: 3, kind: "tesbih", name: "Püsküllü tesbih", price: 2500, origin: "made_by_seller" }).step, 4);
});

test("Goxi alone walks every physical product kind from photos to a prepared Etsy listing", async context => {
  const { buildProductPlan, normalizeProductInput } = await import("../../worker/src/product-studio.js");
  const kinds = [
    { chip: /^Örgü \/ tığ işi$/, kind: "knitwear", name: "Krem tığ işi kazak" },
    { chip: /^Tesbih$/, kind: "tesbih", name: "Püsküllü tesbih" },
    { chip: /^Vintage$/, kind: "vintage", name: "Eski bakır tepsi", year: "1975" },
    { chip: /^Diğer el yapımı$/, kind: "other", name: "El yapımı seramik kase" }
  ];
  for (const item of kinds) {
    const plan = buildProductPlan(normalizeProductInput({ titleTr: item.name, productKind: item.kind, origin: item.kind === "vintage" ? "vintage" : "made_by_seller", yearMade: item.year ? Number(item.year) : undefined, priceTry: 2500, shippingTry: 900, usdTryRate: 40, imageUrls: ["https://local.invalid/p.png"] } as any), [], [], { usdTryRate: 40 } as any);
    const paths: string[] = [];
    context.mock.method(globalThis, "fetch", async (url: unknown) => {
      const path = new URL(String(url)).pathname; paths.push(path);
      if (path.endsWith("/etsy-keywords")) return Response.json({ candidates: [] });
      if (path.endsWith("/etsy-plan")) return Response.json({ plan });
      if (path.endsWith("/explain-tr")) return Response.json({ titleTr: item.name, tags: [] });
      return Response.json({});
    });
    ui.alerts.length = 0;
    ui.pickImages = async () => ({ canceled: false, assets: [{ uri: `local:${item.kind}`, width: 100, height: 100 }] });
    const renderer = await mount(screens.PhotoListingStudio, { online: true, etsyReady: true, wizard: true });
    try {
      assert.ok(shown(renderer, "Önce ürününün gerçek fotoğraflarını ekle"), item.kind);
      await tap(renderer, /^Goxi ile galeriden fotoğraf seç$/);
      // Fotoğraf eklenince Goxi aynı düğmeyle tekrar galeri açmaz; sonraki adıma geçirir.
      assert.equal(buttons(renderer, /^Goxi ile galeriden fotoğraf seç$/).length, 0, item.kind);
      await tap(renderer, /^Goxi ile sonraki adıma geç$/);
      assert.ok(shown(renderer, "Ürünün bilgilerini doğrula"), item.kind);
      await tap(renderer, item.chip);
      await type(renderer, /^Ürün adı \(Türkçe\)$/, item.name);
      if (item.year) await type(renderer, /^Üretim yılı/, item.year);
      if (item.kind === "tesbih" || item.kind === "other") {
        // "Kim yaptı?" yanıtlanmadan Goxi 2. adımdan geçirmez.
        await tap(renderer, /^Goxi ile sonraki adıma geç$/);
        assert.ok(ui.alerts.some(alert => alert.title === "Üretim bilgisi"), item.kind);
        assert.ok(shown(renderer, "‘Bu ürünü kim yaptı?’ sorusunu yanıtla"), item.kind);
        await tap(renderer, /^Ben \/ atölyem yaptı$/);
      }
      await tap(renderer, /^Goxi ile sonraki adıma geç$/);
      assert.ok(shown(renderer, "Renk ve özellikleri ekle"), `${item.kind}: ${ui.alerts.map(a => a.title).join(",")}`);
      await tap(renderer, /^Goxi ile sonraki adıma geç$/);
      assert.ok(shown(renderer, "Eline geçecek tutarı ve kargo maliyetini yaz"), item.kind);
      await tap(renderer, /^Goxi ile sonraki adıma geç$/);
      assert.ok(ui.alerts.some(alert => alert.title === "Elinize geçecek tutar"), item.kind);
      assert.ok(shown(renderer, "Eline geçecek tutarı ve kargo maliyetini yaz"), item.kind);
      await type(renderer, /^Elinize geçecek \(TL\)$/, "2500");
      await type(renderer, /^ABD'ye kargo \(TL\)$/, "900");
      await tap(renderer, /^Goxi ile sonraki adıma geç$/);
      assert.ok(shown(renderer, "Rakipleri araştırıp ilanı hazırla"), item.kind);
      assert.equal(paths.length, 0, `${item.kind}: no API call before the seller asks for research`);
      await tap(renderer, /^Goxi ile Etsy araştırmasını başlat$/);
      await waitFor(() => renderer.root.findAllByType(screens.EtsyPlanResult).length === 1).catch(error => { throw new Error(`${item.kind}: ${error.message}; alerts=${JSON.stringify(ui.alerts.map(a => [a.title, a.message]))}; paths=${paths.join(",")}`); });
      assert.ok(paths.some(path => path.endsWith("/etsy-plan")), item.kind);
    } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
  }
});

test("a digital product whose Etsy upload stopped halfway is resumed, not drafted again", () => {
  const half = listingProgress({ phase: "saved", files: 2, images: 10, etsy: { listingId: 123, filesUploaded: 0, imagesUploaded: 3 } as any, qaOk: true });
  assert.equal(half.title, "Etsy aktarımını tamamla");
  assert.match(half.instruction, /Etsy yüklemesini tamamla/);
});

test("Goxi guides the upload of every digital category to a ready-to-save listing with the right test step", async context => {
  const { PRINTABLE_KINDS, buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput } = await import("../../worker/src/printable-studio.js");
  context.mock.method(globalThis, "fetch", async () => Response.json({ products: [] }));
  for (const kind of Object.keys(PRINTABLE_KINDS)) {
    const productType = kind.replace(/_/g, " ");
    const input = normalizePrintablePlanInput({ kind, productType, keyword: productType, seed: "goxi" });
    const brief = buildPrintableBrief(input), listing = buildPrintableListing(input, brief.name);
    const zip = /wallpaper|app_icons|spreadsheet|slides|resume|wall_art|clipart|paper|stickers/.test(kind);
    ui.pickFiles = async () => ({ canceled: false, assets: [{ name: `${brief.name.replaceAll(" ", "-")}.${zip ? "zip" : "pdf"}`, uri: `file:///${kind}.${zip ? "zip" : "pdf"}`, size: 1200, mimeType: zip ? "application/zip" : "application/pdf" }] });
    ui.pickImages = async () => ({ canceled: false, assets: Array.from({ length: 10 }, (_, i) => ({ uri: `file:///${kind}-${i + 1}.jpg`, fileName: `${i + 1}.jpg` })) });
    const prefill = { name: brief.name, kind, productType: input.productType, handoffName: brief.name, handoff: { id: kind, name: brief.name, kind, productType: input.productType }, listing, priceUsd: brief.priceUsd || 6.99 };
    const renderer = await mount(screens.DigitalPanel, { online: true, active: true, prefill, onPrefillUsed: () => {}, onPrepare: () => {} });
    try {
      assert.ok(shown(renderer, "Satılacak dosyaları seç"), kind);
      await tap(renderer, /^Goxi ile ürün dosyalarını seç$/);
      assert.ok(shown(renderer, "İlan görsellerini ekle"), kind);
      await tap(renderer, /^Goxi ile ilan görsellerini seç$/);
      assert.ok(shown(renderer, "Son dosyaları dene"), kind);
      const testToggle = renderer.root.findAllByType("Text" as any).find((node: any) => visible(node) && /denendi|Test baskısı alındı|test edildi/.test(text(node)));
      assert.ok(testToggle, `${kind}: test step label`);
      if (/Test baskısı/.test(text(testToggle))) assert.ok(!/Letter ve A4/.test(text(testToggle)), kind);
      await tap(renderer, new RegExp(`^${text(testToggle).replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`));
      assert.ok(shown(renderer, "Kaydetmeye hazır"), `${kind}: ${listing.title} / ${listing.tags.length} tags`);
      assert.equal(buttons(renderer, /^Goxi ile dosyaları güvenli depoya yükle$/).length, 1, kind);
    } finally { await unmount(renderer); }
  }
  ui.pickFiles = async () => ({ canceled: true }); ui.pickImages = async () => ({ canceled: true });
});

test("Goxi asks the who-made question by name when it is unanswered outside the wizard", () => {
  const guide = physicalListingProgress({ photos: 9, kind: "tesbih", name: "Gümüş tesbih", price: 11000, shipping: 1250, origin: "unknown" });
  assert.equal(guide.step, 2); assert.match(guide.title, /kim yaptı/);
  assert.equal(physicalListingProgress({ photos: 9, kind: "tesbih", name: "Gümüş tesbih", price: 11000, shipping: 1250, origin: "designed_by_seller" }).step, 5);
});
