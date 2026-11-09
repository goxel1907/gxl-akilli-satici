import assert from "node:assert/strict";
import test from "node:test";
import { screens, mount, tap, type, unmount, visible, text, ui, buttons } from "./fixtures/mobile-ui.js";
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
    await tap(renderer, /^İlanın tüm adımlarını göster$/);
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
  assert.equal(physicalListingProgress({ photos: 3, kind: "tesbih", name: "Püsküllü tesbih", price: 2500 }).step, 4);
});
