import assert from "node:assert/strict";
import test from "node:test";
import { mergeLocalProducts, generationKey, uploadPrices } from "../../mobile/workflow-state.js";
import { handleRequest } from "../../worker/src/index.js";
import { enqueueListingPins, processPinQueue, writePinterestSettings } from "../../worker/src/pinterest.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";
import { researchPrintableMarket } from "../../worker/src/printable-research.js";
import { claimedFormats, createDigitalProduct, validateDigitalPdf } from "../../worker/src/digital-delivery.js";
import { validPdf } from "./fixtures/valid-pdf.js";
import { crmFixture } from "./fixtures/crm.js";
import { listShopierProducts } from "../../worker/src/shopier.js";

function memory() {
  const values = new Map<string, string>();
  return { values, store: { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } } };
}

test("local catalog survives refresh without duplicated IDs and prices reset for a new handoff", () => {
  assert.deepEqual(mergeLocalProducts([{ id: "remote" }, { id: "local" }], [{ id: "local" }]), [{ id: "remote" }, { id: "local" }]);
  assert.deepEqual(uploadPrices({ priceUsd: 8.99 }), { usd: "8.99", try: "" });
  assert.deepEqual(uploadPrices(), { usd: "", try: "" });
  assert.notEqual(generationKey({ product: "abc", count: 26 }), generationKey({ product: "abc", count: 30 }));
});

test("management API fails closed when the application key is missing", async () => {
  const response = await handleRequest(new Request("https://local.invalid/api/dashboard"), {});
  assert.equal(response.status, 401);
  assert.equal((await handleRequest(new Request("https://local.invalid/health"), {})).status, 200);
});

test("disabling Pinterest stops existing automatic jobs without contacting external services", async () => {
  const { store } = memory();
  await store.put("pinterest:tokens", JSON.stringify({ accessToken: "test", expiresAt: Date.now() + 3600000 }));
  await enqueueListingPins(store, { listingId: 123456789, boardName: "Test" });
  await writePinterestSettings(store, { auto: false });
  const result = await processPinQueue({ PINTEREST_APP_ID: "test", PINTEREST_APP_SECRET: "test", ETSY_API_KEY: "test" }, store, async () => { throw Error("Must not contact an external service"); });
  assert.deepEqual(result, { skipped: "automation_disabled" });
});

test("an explicit calendar year is consistent in content, title and automated QA", () => {
  const input = normalizePrintablePlanInput({ kind: "calendar", productType: "2028 calendar printable", assistant: "claude" });
  const brief = buildPrintableBrief(input);
  const listing = buildPrintableListing(input, brief.name);
  assert.match(brief.masterPrompt, /every month of 2028/);
  assert.match(brief.pdfPrompt, /12 month pages for 2028/);
  assert.doesNotMatch(listing.title, /2027/);
  assert.throws(() => buildPrintableBrief({ ...input, keyword: "2027 calendar" }), /CALENDAR_YEAR_CONFLICT/);
});

test("ABC handoff explicitly maps every page to one animal and one image", () => {
  const brief = buildPrintableBrief({ kind: "coloring", productType: "abc animal coloring book baby shower", pageCount: 30, assistant: "chatgpt" });
  assert.equal(brief.artPrompts.length, 26);
  assert.equal(brief.artSubjects.length, 26);
  assert.match(brief.pdfPrompt, /A = alligator/);
  assert.match(brief.pdfPrompt, /Z = zebra/);
  assert.match(brief.masterPrompt, /Colored by/);
  assert.match(brief.masterPrompt, /ALPHABET/);
});

test("escape-room title and defaults do not advertise shower games", () => {
  const input = { kind: "party" as const, productType: "christmas escape room" };
  const brief = buildPrintableBrief(input);
  assert.doesNotMatch(buildPrintableListing(input, brief.name).title, /shower/i);
  assert.match(brief.pdfPrompt, /Formats \(deliver each as its own file\): US Letter, A4/);
});

test("unsupported formats fail and file-test success is not claimed before files exist", () => {
  assert.throws(() => buildPrintableBrief({ kind: "coloring", productType: "animal coloring pages", formats: ["nonsense size"] }), /PRINTABLE_FORMAT_INVALID/);
  const input = { kind: "coloring" as const, productType: "animal coloring pages", priceUsd: 6.99 };
  const brief = buildPrintableBrief(input);
  assert.equal(brief.priceUsd, 6.99);
  assert.doesNotMatch(buildPrintableListing(input, brief.name).description, /checked with automated file tests/);
  assert.match(brief.masterPrompt, /UNVERIFIED/);
});

test("PDF parsing rejects invalid files and filename dimensions are checked", async () => {
  const bad = new TextEncoder().encode("%PDF-1.7 not a PDF").buffer;
  await assert.rejects(validateDigitalPdf(bad, "Broken-US-Letter.pdf"), /PDF açılamadı/);
  await validateDigitalPdf(validPdf("Letter.pdf").buffer, "Letter.pdf");
  await assert.rejects(validateDigitalPdf(validPdf("Letter.pdf").buffer, "A4.pdf"), /ölçüsü/);
  assert.deepEqual(claimedFormats("Formats: 5x7 in cards, 4x6 in cards, PNG, PPTX"), ["5x7", "4x6", "png", "pptx"]);
});

test("research uses the selected search and comparable digital products for pricing", async () => {
  let query = "";
  const result = await researchPrintableMarket({ ETSY_API_KEY: "test", ETSY_SHARED_SECRET: "test" }, { kind: "coloring", productType: "animal coloring pages", keyword: "baby animal coloring pages", pageCount: 26 }, async (url) => {
    query = new URL(String(url)).searchParams.get("keywords") || "";
    return Response.json({ count: 100, results: [
      ...[4, 6, 8].map(price => ({ title: "Animal Coloring Pages Printable", listing_type: "download", num_favorers: 10, price: { amount: price * 100, divisor: 100, currency_code: "USD" } })),
      { title: "Animal Coloring Pages Book", listing_type: "physical", price: { amount: 50000, divisor: 100, currency_code: "USD" } },
      { title: "Budget Planner Printable", listing_type: "download", price: { amount: 9000, divisor: 100, currency_code: "USD" } }
    ] });
  });
  assert.equal(query, "baby animal coloring pages");
  assert.equal(result.sampleSize, 3);
  assert.equal(result.competition.medianPriceUsd, 6);
  assert.ok(result.competition.launchPriceUsd);
  await assert.rejects(researchPrintableMarket({ ETSY_API_KEY: "test", ETSY_SHARED_SECRET: "test" }, { kind: "coloring", productType: "animal coloring pages" }, async () => Response.json({ results: [] })), /en az 3/);
});

test("old approval cannot activate a blocked lead or claim an outbound delivery", async () => {
  const fixture = crmFixture();
  try {
    const lead = { id: "workflow-test-lead", displayName: "Test", channel: "email", handle: "test@example.invalid", stage: "blocked", consent: false, interests: [], score: 0, autoReplyAllowed: false };
    fixture.sql.exec("INSERT INTO crm_leads(id,channel,handle,data) VALUES(?,?,?,?)", lead.id, lead.channel, lead.handle, JSON.stringify(lead));
    const approval = { id: "workflow-test-approval", leadId: lead.id, channel: "email", draft: "Local only", productIds: [], status: "pending", createdAt: new Date().toISOString() };
    fixture.sql.exec("INSERT INTO crm_approvals(id,data) VALUES(?,?)", approval.id, JSON.stringify(approval));
    const env = { APP_ACCESS_TOKEN: "local-test", CRM_STORE: fixture.namespace };
    const request = () => new Request("https://local.invalid/api/approvals/workflow-test-approval/approve", { method: "POST", headers: { authorization: "Bearer local-test" } });
    assert.equal((await handleRequest(request(), env)).status, 409);
    lead.stage = "qualified"; lead.consent = true;
    fixture.sql.exec("UPDATE crm_leads SET data=? WHERE id=?", JSON.stringify(lead), lead.id);
    const result = await (await handleRequest(request(), env)).json() as { delivery: { accepted: boolean } };
    assert.equal(result.delivery.accepted, false);
    assert.equal(fixture.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM crm_messages").toArray()[0].count, 0);
    const saved = JSON.parse(fixture.sql.exec<{ data: string }>("SELECT data FROM crm_leads WHERE id=?", lead.id).toArray()[0].data);
    assert.equal(saved.autoReplyAllowed, false);
  } finally { fixture.close(); }
});

test("phone uploads stage files individually and finalize their metadata without reuploading binaries", async () => {
  const { store, values } = memory();
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store as never };
  const part = new FormData();
  part.set("confirm", "true"); part.set("role", "file");
  part.set("asset", new File([validPdf("Animal-US-Letter.pdf")], "Animal-US-Letter.pdf", { type: "application/pdf" }));
  const response = await handleRequest(new Request("https://local.invalid/api/digital/upload-part", { method: "POST", headers: { authorization: "Bearer local-test" }, body: part }), env);
  assert.equal(response.status, 201);
  const asset = await response.json() as { id: string };
  const form = new FormData();
  form.set("metadata", JSON.stringify({ confirm: true, kind: "coloring", name: "Animal", productType: "animal coloring pages", prices: { usd: "6.99" }, listing: { title: "Animal Coloring Pages", description: "Formats: US Letter", tags: [], materials: [] } }));
  form.set("parts", JSON.stringify({ files: [asset.id], images: [] }));
  const saved = await handleRequest(new Request("https://local.invalid/api/digital/products", { method: "POST", headers: { authorization: "Bearer local-test" }, body: form }), env);
  assert.equal(saved.status, 201, await saved.clone().text());
  assert.equal(values.has(`digital:upload-part:${asset.id}:meta`), false);
  const expired = await handleRequest(new Request("https://local.invalid/api/digital/products", { method: "POST", headers: { authorization: "Bearer local-test" }, body: form }), env);
  assert.equal(expired.status, 400);
});

test("Shopier catalogs include subsequent pages", async () => {
  const pages: number[] = [];
  const result = await listShopierProducts({ SHOPIER_ACCESS_TOKEN: "local-test" }, async url => {
    const page = Number(new URL(String(url)).searchParams.get("page")); pages.push(page);
    return Response.json(Array.from({ length: page === 1 ? 50 : 1 }, (_, index) => ({ id: `${page}-${index}`, title: "Test" })));
  });
  assert.equal(result.length, 51);
  assert.deepEqual(pages, [1, 2]);
});

test("returning assistant files must match the product handoff and completed QA acknowledgement", async () => {
  const { store } = memory();
  const input = { kind: "coloring" as const, productType: "animal coloring pages", priceUsd: 6.99 };
  const brief = buildPrintableBrief(input);
  const listing = buildPrintableListing(input, brief.name);
  const makeForm = (tested: boolean, fileName: string) => {
    const form = new FormData();
    form.set("metadata", JSON.stringify({ name: brief.name, handoffName: brief.name, assistant: "chatgpt", kind: input.kind, productType: input.productType, prices: { usd: brief.priceUsd }, flags: { testMade: tested }, listing }));
    form.append("files", new File([validPdf(fileName)], fileName, { type: "application/pdf" }));
    const a4Name = `${brief.name.replace(/[^A-Za-z0-9]+/g, "-")}-A4.pdf`;
    form.append("files", new File([validPdf(a4Name)], a4Name, { type: "application/pdf" }));
    form.set("images", new File([new Uint8Array([137,80,78,71, ...Array(1200).fill(0)])], "Preview.png", { type: "image/png" }));
    return form;
  };
  const correctName = `${brief.name.replace(/[^A-Za-z0-9]+/g, "-")}-US-Letter.pdf`;
  await assert.rejects(createDigitalProduct(store as never, makeForm(false, correctName), "https://local.invalid", async () => {}), /test edildi/);
  await assert.rejects(createDigitalProduct(store as never, makeForm(true, "Different-Product-US-Letter.pdf"), "https://local.invalid", async () => {}), /üretim kaydıyla/);
  const product = await createDigitalProduct(store as never, makeForm(true, correctName), "https://local.invalid", async () => {});
  assert.equal(product.handoff?.name, brief.name);
  assert.equal(product.handoff?.assistant, "chatgpt");
  assert.equal(product.prices.usd, 6.99);
  assert.equal(product.listing.title, listing.title);
  assert.deepEqual(product.listing.tags, listing.tags);
});


test("folded-card and wall-art size notes do not become extra delivery-format claims", () => {
  assert.deepEqual(claimedFormats("Formats: US Letter (folds to 5x7 in), A4 (folds to 5x7 in)"), ["letter", "a4"]);
  assert.deepEqual(claimedFormats("Formats: 2:3 ratio (4x6 to 16x24 in), 3:4 ratio (6x8 to 18x24 in)"), []);
  assert.deepEqual(claimedFormats("Formats: 4x6 in cards, 5x7 in cards"), ["4x6", "5x7"]);
});
