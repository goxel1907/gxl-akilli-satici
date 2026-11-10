import assert from "node:assert/strict";
import test from "node:test";
import { photoAssistantPrompt, parsePhotoAssistant } from "../../mobile/photo-assistant.js";
import { generateStructuredObject } from "../src/structured-ai.js";
import { buildProductPlan, normalizeProductInput } from "../../worker/src/product-studio.js";
import { act, screens, mount, tap, type, field, ui, unmount, buttons, waitFor } from "./fixtures/mobile-ui.js";
const answer = { version: "GXL_PHOTO_ANALYSIS_V1", requestId: "test-request", analysis: { productKind: "tesbih", nameTr: "Püsküllü tesbih", productNounEn: "prayer beads", craft: "none", audience: "unknown", materialGuessTr: "925 gümüş", colors: ["silver"], attributesEn: ["tassel"], conditionNotesEn: [], questionsTr: ["Malzeme belgeniz var mı?"], riskFlags: [], confidence: 0.7 } };

test("photo chat import is bound to the request and does not import a material claim", () => {
  const prompt = photoAssistantPrompt("tesbih", "Gümüş tesbih", "test-request");
  assert.match(prompt, /If no photos are attached/); assert.match(prompt, /test-request/);
  const parsed = parsePhotoAssistant('```json\n' + JSON.stringify(answer) + '\n```', "test-request");
  assert.equal(parsed.materialGuessTr, ""); assert.equal(parsed.productNounEn, "prayer beads");
  assert.throws(() => parsePhotoAssistant(JSON.stringify(answer), "different-item"));
});
test("photo import rejects incompatible, incomplete or wrongly typed replies", () => {
  for (const analysis of [{}, { ...answer.analysis, confidence: "high" }, { ...answer.analysis, riskFlags: ["invented"] }, { ...answer.analysis, colors: "silver" }, { ...answer.analysis, productNounEn: "gümüş tesbih" }]) {
    assert.throws(() => parsePhotoAssistant(JSON.stringify({ ...answer, analysis }), "test-request"));
  }
  assert.throws(() => parsePhotoAssistant("not json", "test-request"));
});
test("Gemini JSON request uses supported MIME configuration and distinguishes a rejected request", async context => {
  const request = { prompt: "test", schemaName: "test", schema: { type: "object", properties: {} } };
  let reject = false;
  context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseJsonSchema, request.schema);
    assert.equal(body.generationConfig.responseFormat, undefined);
    return reject ? Response.json({ error: "Bad request" }, { status: 400 }) : Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] });
  });
  assert.deepEqual(await generateStructuredObject(request, { GEMINI_API_KEY: "test" }), {});
  reject = true; await assert.rejects(generateStructuredObject(request, { GEMINI_API_KEY: "test" }), /AI_PROVIDER_INVALID_REQUEST/);
});

async function photoScreen() {
  ui.alerts.length = 0; ui.shares.length = 0;
  ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:tesbih", width: 100, height: 100 }] });
  const renderer = await mount(screens.PhotoListingStudio, { online: true, etsyReady: true });
  await tap(renderer, /^Galeriden seç$/); await tap(renderer, /^Tesbih$/);
  return renderer;
}
test("structured analysis reports timeout and malformed provider responses without filling any fields", async context => {
  const request = { prompt: "test", schemaName: "test", schema: { type: "object" } };
  let timeout = true;
  context.mock.method(globalThis, "fetch", async () => {
    if (timeout) throw new DOMException("Timed out", "TimeoutError");
    return Response.json({ candidates: [{ content: { parts: [{ text: 'broken json' }] } }] });
  });
  await assert.rejects(generateStructuredObject(request, { GEMINI_API_KEY: "test" }), /AI_PROVIDER_TIMEOUT/);
  timeout = false;
  await assert.rejects(generateStructuredObject(request, { GEMINI_API_KEY: "test" }), /AI_PROVIDER_INVALID_RESPONSE/);
});
test("photo Studio shares a subscription prompt and imports the same product without any API call", async context => {
  context.mock.method(globalThis, "fetch", async () => { throw Error("Subscription flow must not call the API"); });
  const renderer = await photoScreen();
  try {
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.placeholder, "ör. Arpa kesim püsküllü tesbih");
    // Tam ilan kutusu ve analiz kutusu aynı asistan seçimini paylaşır; ikisinden biri yeterlidir.
    await act(async () => { buttons(renderer, /^Claude$/)[0].props.onPress(); }); await tap(renderer, /^Claude için analiz talimatını paylaş$/);
    const message = (ui.shares.at(-1) as { message: string }).message;
    const template = JSON.parse(message.split("\n").at(-1)!);
    await type(renderer, /^Sohbetten gelen analiz JSON'u$/, JSON.stringify({ ...answer, requestId: template.requestId }));
    await tap(renderer, /^Analiz yanıtını uygula$/);
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.value, answer.analysis.nameTr);
    assert.equal(field(renderer, /^Malzeme$/).props.value, "");
    await tap(renderer, /^Etsy'de araştır ve ilanı hazırla$/);
    assert.ok(ui.alerts.some(a => a.title === "Üretim bilgisi"));
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});
test("a chat reply for previous photos cannot be applied to a changed product", async () => {
  const renderer = await photoScreen();
  try {
    await tap(renderer, /^ChatGPT için analiz talimatını paylaş$/);
    const template = JSON.parse((ui.shares.at(-1) as { message: string }).message.split("\n").at(-1)!);
    await type(renderer, /^Ürün adı \(Türkçe\)$/, "Başka ürün");
    await type(renderer, /^Sohbetten gelen analiz JSON'u$/, JSON.stringify({ ...answer, requestId: template.requestId }));
    await tap(renderer, /^Analiz yanıtını uygula$/);
    assert.ok(ui.alerts.some(a => a.title === "Ürün değişti"));
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.value, "Başka ürün");
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});
test("simple photo wizard requires photos but does not silently invoke a separate API", async context => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls++; throw Error("No automatic API call expected"); });
  ui.alerts.length = 0;
  ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:wizard", width: 100, height: 100 }] });
  const renderer = await mount(screens.PhotoListingStudio, { online: true, wizard: true });
  try {
    await tap(renderer, /^İleri$/);
    assert.ok(ui.alerts.some(item => item.title === "Fotoğraf gerekli"));
    await tap(renderer, /^Galeriden seç$/); await tap(renderer, /^İleri$/);
    assert.equal(calls, 0);
    await tap(renderer, /^Tesbih$/); await type(renderer, /^Ürün adı \(Türkçe\)$/, "Püsküllü tesbih");
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.value, "Püsküllü tesbih");
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});
test("simple photo wizard offers an explicit free auto-fill and keeps the chat option folded", async context => {
  const paths: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: unknown) => { paths.push(new URL(String(url)).pathname); return Response.json({ analysis: answer.analysis }); });
  ui.alerts.length = 0;
  ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:auto", width: 100, height: 100, base64: "AAAA" }] });
  const renderer = await mount(screens.PhotoListingStudio, { online: true, wizard: true });
  try {
    assert.equal(buttons(renderer, /^Fotoğraftan otomatik doldur$/).length, 0);
    assert.equal(buttons(renderer, /^Analiz yanıtını uygula$/).length, 0);
    await tap(renderer, /^Galeriden seç$/);
    assert.equal(paths.length, 0);
    await tap(renderer, /^Fotoğraftan otomatik doldur$/);
    await waitFor(() => paths.includes("/api/products/photo-analyze"));
    await tap(renderer, /^İleri$/);
    await waitFor(() => field(renderer, /^Ürün adı \(Türkçe\)$/).props.value === answer.analysis.nameTr);
    await tap(renderer, /^← Geri$/);
    await tap(renderer, /^ChatGPT \/ Claude sohbetiyle analiz \(isteğe bağlı\) →$/);
    assert.equal(buttons(renderer, /^Analiz yanıtını uygula$/).length, 1);
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});
test("a late automatic photo response cannot overwrite changed form fields", async context => {
  let finish!: (response: Response) => void;
  context.mock.method(globalThis, "fetch", () => new Promise(resolve => { finish = resolve; }));
  const renderer = await photoScreen();
  try {
    await act(async () => { void buttons(renderer, /^Fotoğraftan otomatik doldur/)[0].props.onPress(); });
    await waitFor(() => Boolean(finish));
    await type(renderer, /^Ürün adı \(Türkçe\)$/, "Benim seçtiğim ürün");
    await act(async () => finish(Response.json({ analysis: answer.analysis })));
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.value, "Benim seçtiğim ürün");
    assert.equal(field(renderer, /^İngilizce ürün adı/).props.value, "");
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});

test("physical and Shopier listing results are invalidated when their inputs change", async context => {
  const plan = buildProductPlan(normalizeProductInput({ titleTr: "Püsküllü tesbih", productKind: "tesbih", origin: "made_by_seller", priceTry: 2500, usdTryRate: 40, imageUrls: ["https://local.invalid/p.png"] }), ["prayer beads"], [], { usdTryRate: 40, shopCurrency: "USD" });
  context.mock.method(globalThis, "fetch", async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/etsy-keywords")) return Response.json({ candidates: [] });
    if (path.endsWith("/etsy-plan")) return Response.json({ plan });
    if (path.endsWith("/explain-tr")) return Response.json({ titleTr: "Tesbih", tags: [] });
    return Response.json({});
  });
  const renderer = await photoScreen();
  try {
    await type(renderer, /^Ürün adı \(Türkçe\)$/, "Püsküllü tesbih");
    await tap(renderer, /^Ben \/ atölyem yaptı$/);
    await type(renderer, /^Elinize geçecek \(TL\)$/, "2500");
    await tap(renderer, /^Etsy'de araştır ve ilanı hazırla$/);
    assert.equal(renderer.root.findAllByType(screens.EtsyPlanResult).length, 1);
    await type(renderer, /^Elinize geçecek \(TL\)$/, "3500");
    assert.equal(renderer.root.findAllByType(screens.EtsyPlanResult).length, 0);
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
  const shopier = await mount(screens.EtsyProductPlanner, { product: { id: "s1", title: "Püsküllü tesbih", price: 2500 }, etsyReady: true });
  try {
    await tap(shopier, /^Ben \/ atölyem yaptı$/); await tap(shopier, /^Etsy'de araştır ve hazırla$/);
    assert.equal(shopier.root.findAllByType(screens.EtsyPlanResult).length, 1);
    await type(shopier, /^ABD'ye kargo ücreti/, "900");
    assert.equal(shopier.root.findAllByType(screens.EtsyPlanResult).length, 0);
  } finally { await unmount(shopier); }
});

test("the photo-enhancing prompt keeps the real item unchanged and bans misleading additions for both assistants", async () => {
  const { photoEnhancePrompt } = await import("../../mobile/photo-assistant.js");
  for (const assistant of ["chatgpt", "claude"] as const) {
    const prompt = photoEnhancePrompt(assistant, "Gümüş tesbih");
    assert.match(prompt, /never redraw, repaint, replace or generate the item/);
    assert.match(prompt, /listing-01 \(cover\)/);
    assert.match(prompt, /Never add logos, brand names, people's faces, prices, discounts/);
    assert.match(prompt, /never claim a material/);
  }
  assert.match(photoEnhancePrompt("claude", "x"), /You cannot generate or repaint photos/);
});

test("a chat-written physical listing is validated, keeps the app's shipping sections and refuses risky text", async () => {
  const { listingChatPrompt, parseListingChat, mergeListingAbout } = await import("../../mobile/photo-assistant.js");
  const prompt = listingChatPrompt("chatgpt", { nameTr: "Seramik kase", titleEn: "Ceramic Bowl", tags: ["ceramic bowl"], primaryKeyword: "ceramic bowl", competitorTitles: ["Handmade Ceramic Bowl"], facts: ["handmade by the seller in Türkiye"], materialVerified: false }, "req-1");
  assert.match(prompt, /GXL_PHYSICAL_LISTING_V1/); assert.match(prompt, /req-1/); assert.match(prompt, /NOT verified/);
  const tags = ["ceramic bowl", "handmade bowl", "pottery bowl", "serving bowl", "turkish ceramic", "kitchen decor", "housewarming gift", "blue bowl", "rustic bowl", "stoneware bowl", "fruit bowl", "home decor", "unique gift"];
  const good = { version: "GXL_PHYSICAL_LISTING_V1", requestId: "req-1", title: "Handmade Ceramic Bowl, Blue Pottery Serving Bowl, Rustic Kitchen Decor", tags, aboutEn: "A hand-thrown ceramic bowl with a soft blue glaze and gentle ripples that catch the light on any table." };
  const parsed = parseListingChat("```json\n" + JSON.stringify(good) + "\n```", "req-1", false);
  assert.equal(parsed.tags.length, 13);
  const merged = mergeListingAbout("A ceramic bowl, made by hand in Türkiye.\n\nDETAILS\n• Shipping is paid by the buyer.", parsed.aboutEn);
  assert.match(merged, /^A hand-thrown ceramic bowl/); assert.match(merged, /Shipping is paid by the buyer/); assert.doesNotMatch(merged, /made by hand in Türkiye\./);
  assert.throws(() => parseListingChat(JSON.stringify({ ...good, requestId: "other" }), "req-1", false), /başka bir talimata/);
  assert.throws(() => parseListingChat(JSON.stringify({ ...good, tags: tags.slice(0, 12) }), "req-1", false), /13 farklı etiket/);
  assert.throws(() => parseListingChat(JSON.stringify({ ...good, title: "Sterling Silver Bowl" }), "req-1", false), /Doğrulanmamış malzeme/);
  assert.throws(() => parseListingChat(JSON.stringify({ ...good, aboutEn: good.aboutEn + " Free shipping today!" }), "req-1", false), /free shipping/);
});

test("the physical plan screen applies a ChatGPT listing reply to the title, tags and description", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ score: 80, checks: [] }));
  const product = normalizeProductInput({ titleTr: "Seramik kase", productKind: "other", origin: "made_by_seller", priceTry: 1500, usdTryRate: 40, imageUrls: ["https://local.invalid/a.jpg"] });
  const plan = buildProductPlan(product, ["ceramic bowl"], [], { usdTryRate: 40 });
  ui.alerts.length = 0; ui.shares.length = 0;
  const renderer = await mount(screens.EtsyPlanResult, { plan, payload: { titleTr: "Seramik kase", origin: "made_by_seller", materialVerified: false }, etsyReady: true, priceSourceLabel: "Elinize geçecek tutar", photoCount: 6 });
  try {
    await tap(renderer, /^İlan metni talimatını paylaş$/);
    const message = (ui.shares.at(-1) as { message: string }).message;
    const requestId = JSON.parse(message.split("\n").at(-1)!).requestId;
    const tags = ["ceramic bowl", "handmade bowl", "pottery bowl", "serving bowl", "turkish ceramic", "kitchen decor", "housewarming gift", "blue bowl", "rustic bowl", "stoneware bowl", "fruit bowl", "home decor", "unique gift"];
    await type(renderer, /^Sohbetten gelen ilan JSON'u$/, JSON.stringify({ version: "GXL_PHYSICAL_LISTING_V1", requestId, title: "Handmade Ceramic Bowl, Blue Pottery Serving Bowl", tags, aboutEn: "A hand-thrown ceramic bowl with a soft blue glaze that brightens any table." }));
    await tap(renderer, /^İlan metnini uygula$/);
    assert.equal(field(renderer, /^Başlık \(/).props.value, "Handmade Ceramic Bowl, Blue Pottery Serving Bowl");
    assert.equal(field(renderer, /^Etiketler \(13 adet\)$/).props.value, tags.join(", "));
    assert.ok(ui.alerts.some(alert => alert.title === "Uygulandı"), JSON.stringify(ui.alerts));
  } finally { await unmount(renderer); }
});

test("one ChatGPT reply fills every physical field, converts the suggested US price and carries the listing text to the plan", async context => {
  const { buildProductPlan: build, normalizeProductInput: normalize } = await import("../../worker/src/product-studio.js");
  const paths: string[] = [];
  let planBody: any;
  context.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname; paths.push(path);
    if (path.endsWith("/net-from-price")) return Response.json({ priceUsd: 89, usdTryRate: 40, netTry: 2850 });
    if (path.endsWith("/etsy-keywords")) return Response.json({ candidates: ["ceramic bowl"] });
    if (path.endsWith("/etsy-plan")) { planBody = JSON.parse(String(init?.body)); const product = normalize({ ...planBody.product, usdTryRate: 40 }); return Response.json({ plan: build(product, ["ceramic bowl"], [], { usdTryRate: 40 }) }); }
    if (path.endsWith("/explain-tr")) return Response.json({ titleTr: "Seramik kase", tags: [] });
    return Response.json({ score: 80, checks: [] });
  });
  ui.alerts.length = 0; ui.shares.length = 0;
  ui.pickImages = async () => ({ canceled: false, assets: [{ uri: "local:bowl", width: 100, height: 100 }] });
  const renderer = await mount(screens.PhotoListingStudio, { online: true, etsyReady: true, wizard: true });
  try {
    await tap(renderer, /^Galeriden seç$/);
    await tap(renderer, /^Tüm ilan talimatını paylaş$/);
    const message = (ui.shares.at(-1) as { message: string }).message;
    assert.match(message, /50 US states/); assert.match(message, /Alaska and Hawaii/); assert.match(message, /ONLY with Python code/); assert.match(message, /never use an image generation or image editing tool/); assert.match(message, /ONLY in American English/);
    const requestId = JSON.parse(message.split("\n").at(-1)!).requestId;
    const tags = ["ceramic bowl", "handmade bowl", "pottery bowl", "serving bowl", "turkish ceramic", "kitchen decor", "housewarming gift", "blue bowl", "rustic bowl", "stoneware bowl", "fruit bowl", "home decor", "unique gift"];
    const reply = { version: "GXL_PHYSICAL_FULL_V1", requestId,
      product: { productKind: "other", nameTr: "El yapımı seramik kase", productNounEn: "ceramic bowl", origin: "made_by_seller", craft: "none", audience: "unknown", materialTr: "seramik", colors: ["blue"], attributesEn: ["glazed"], conditionNoteEn: "", yearMade: 0, weightGrams: 450, lengthCm: 18, widthCm: 18, chestCm: 0, beadCount: 0 },
      listing: { title: "Handmade Ceramic Bowl, Blue Glazed Pottery Serving Bowl", tags, aboutEn: "A hand-thrown ceramic bowl with a deep blue glaze that pools softly at the rim." },
      pricing: { suggestedPriceUsd: 89, competitorLowUsd: 45, competitorHighUsd: 140, reasonTr: "Benzer kaseler 45-140 USD." },
      shipping: { estimatedUsShippingTry: 950, packageWeightGrams: 900, processingDays: 3, noteTr: "Tahmin." }, questionsTr: ["Kaseyi bulaşık makinesinde denediniz mi?"] };
    await type(renderer, /^Sohbetten gelen tam ilan JSON'u$/, JSON.stringify(reply));
    await tap(renderer, /^Tüm boşlukları doldur$/);
    await waitFor(() => ui.alerts.some(alert => alert.title === "Boşluklar dolduruldu"));
    assert.ok(paths.some(path => path.endsWith("/net-from-price")));
    assert.equal(field(renderer, /^Ürün adı \(Türkçe\)$/).props.value, "El yapımı seramik kase");
    await tap(renderer, /^İleri$/); await tap(renderer, /^İleri/);
    assert.equal(field(renderer, /^Elinize geçecek \(TL\)$/).props.value, "2850");
    assert.equal(field(renderer, /^ABD'ye kargo \(TL\)$/).props.value, "950");
    await tap(renderer, /^İleri$/);
    await tap(renderer, /^Etsy'de araştır ve ilanı hazırla$/);
    await waitFor(() => renderer.root.findAllByType(screens.EtsyPlanResult).length === 1);
    assert.equal(planBody.product.material, "seramik"); assert.equal(planBody.product.weightGrams, 450);
    await waitFor(() => field(renderer, /^Başlık \(/).props.value === reply.listing.title);
    assert.equal(field(renderer, /^Etiketler \(13 adet\)$/).props.value, tags.join(", "));
  } finally { await unmount(renderer); ui.pickImages = async () => ({ canceled: true }); }
});

test("the suggested US price converts to the seller's net and back to the same Etsy price; bad full replies are refused", async () => {
  const { netTryFromPriceUsd, computePricing } = await import("../../worker/src/product-studio.js");
  const { parseFullListing } = await import("../../mobile/photo-assistant.js");
  const net = netTryFromPriceUsd(89, 40, "TRY");
  const back = computePricing({ priceTry: net, usdTryRate: 40, shopCurrency: "TRY" })!;
  assert.ok(Math.abs(back.breakEvenUsd - 89) < 0.5, `${net} TL → ${back.breakEvenUsd} USD`);
  const ok = { version: "GXL_PHYSICAL_FULL_V1", requestId: "r", product: { productKind: "other", nameTr: "Seramik kase", origin: "" }, listing: { title: "Ceramic Bowl", tags: Array.from({ length: 13 }, (_, i) => `bowl tag ${i}`), aboutEn: "A hand-thrown ceramic bowl with a deep blue glaze." }, pricing: {}, shipping: {}, questionsTr: [] };
  assert.equal(parseFullListing(JSON.stringify(ok), "r").product.nameTr, "Seramik kase");
  assert.throws(() => parseFullListing(JSON.stringify({ ...ok, version: "X" }), "r"), /tam ilan JSON/);
  assert.throws(() => parseFullListing(JSON.stringify({ ...ok, requestId: "z" }), "r"), /başka bir talimata/);
  assert.throws(() => parseFullListing(JSON.stringify({ ...ok, product: { ...ok.product, productKind: "car" } }), "r"), /Ürün türü/);
  assert.throws(() => parseFullListing(JSON.stringify({ ...ok, listing: { ...ok.listing, tags: ["a"] } }), "r"), /13 farklı etiket/);
});

test("a Turkish title or tags from the chat are refused and weights are not imported as features", async () => {
  const { parseFullListing, listingTextProblems } = await import("../../mobile/photo-assistant.js");
  const tags = Array.from({ length: 13 }, (_, i) => `prayer beads ${i}`);
  assert.ok(listingTextProblems("925 Damgalı El İşçiliği Gümüş Tesbih", tags, "A handmade string of prayer beads with oval beads.", true).some(line => /İngilizce/.test(line)));
  assert.ok(listingTextProblems("Prayer Beads, Handmade in Türkiye", tags, "A handmade string of prayer beads with oval beads.", true).length === 0, "Türkiye alone is allowed");
  assert.ok(listingTextProblems("Prayer Beads", [...tags.slice(0, 12), "gümüş tesbih"], "A handmade string of prayer beads with oval beads.", true).some(line => /İngilizce/.test(line)));
  const reply = { version: "GXL_PHYSICAL_FULL_V1", requestId: "r", product: { productKind: "tesbih", nameTr: "Gümüş tesbih", origin: "made_by_seller", attributesEn: ["diamond cut beads", "braided tassel", "0.81 oz (23 g) item weight"] }, listing: { title: "Diamond Cut Prayer Beads", tags, aboutEn: "Oval diamond-cut beads that sparkle in the light, finished with a braided tassel." }, pricing: {}, shipping: {}, questionsTr: [] };
  assert.deepEqual(parseFullListing(JSON.stringify(reply), "r").product.attributesEn, ["diamond cut beads", "braided tassel"]);
  assert.throws(() => parseFullListing(JSON.stringify({ ...reply, listing: { ...reply.listing, title: "Gümüş Tesbih, El Yapımı" } }), "r"), /İngilizce/);
});
