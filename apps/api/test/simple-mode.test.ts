import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");

// Hiç bilmeyen biri için: dört kapı, adım adım satış, düz Türkçe. Uzman mod bugünkü ekranları korur.
test("the app opens in simple mode with four plain doors and keeps expert mode one tap away", () => {
  assert.match(app, /const simpleTabs: Tab\[\] = \["Başla", "Sat", "Siparişler", "Müşteri", "Yardım"\];/);
  assert.match(app, /const \[mode, setMode\] = useState<AppMode>\("simple"\);/);
  assert.match(app, /\(mode === "simple" \? simpleTabs : navigationTabs\)\.map/);
  assert.match(app, /onExpert=\{\(\) => changeMode\("expert"\)\}/);
  assert.match(app, /onSimple=\{\(\) => changeMode\("simple"\)\}/);
  assert.match(app, /\{online \? "Bağlı" : "Bağlantı yok"\}/, "no 'Ajan' or 'Yerel mod' jargon in the header");
});

test("selling is a five-step wizard that stops on missing information", () => {
  assert.match(app, /const WIZARD_STEPS = \["Fotoğraflar", "Ürün bilgisi", "Renk ve özellikler", "Fiyat ve kargo", "Önizleme ve gönder"\];/);
  assert.match(app, /<PhotoListingStudio online=\{online\} etsyReady=\{etsyReady\} wizard onStepChange=\{onStepChange\} \/>/);
  assert.match(app, /if \(!photos\.length\) return Alert\.alert\("Fotoğraf gerekli"/);
  assert.match(app, /if \(online && !analysis && !analyzing\) await analyze\(\);/, "photos are analysed when the seller moves on");
  assert.match(app, /Vintage ürün en az 20 yıllık olmalı/);
  assert.match(app, /if \(!parseAmount\(shippingTry\)\) return Alert\.alert\("ABD'ye kargo ücreti"/, "a missing shipping cost would make the seller lose money");
  assert.match(app, /route === "choose" && current === "photo" \? current : route/, "a half-filled listing is not lost when going back home");
});
