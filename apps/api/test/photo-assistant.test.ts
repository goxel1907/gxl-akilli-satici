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
    await tap(renderer, /^Claude$/); await tap(renderer, /^Claude için analiz talimatını paylaş$/);
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
test("a late automatic photo response cannot overwrite changed form fields", async context => {
  let finish!: (response: Response) => void;
  context.mock.method(globalThis, "fetch", () => new Promise(resolve => { finish = resolve; }));
  const renderer = await photoScreen();
  try {
    await act(async () => { void buttons(renderer, /^Sunucuyla otomatik analiz/)[0].props.onPress(); });
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
