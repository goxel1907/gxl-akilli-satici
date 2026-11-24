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

test("five large wall-art ZIPs and ten images upload in parts and save without re-opening the archives (no 503)", async () => {
  const { zipSync } = await import("fflate");
  const { store, values } = memory();
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store as never };
  const auth = { authorization: "Bearer local-test" };
  const noise = (size: number, seed: number) => { const out = new Uint8Array(size); let x = seed; for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; } return out; };
  const png = (seed: number) => { const body = noise(700_000, seed); body.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 16, 0, 0, 0, 16, 0], 0); return body; };
  const stage = async (bytes: Uint8Array, name: string, role: "file" | "image", type: string) => {
    const part = new FormData(); part.set("confirm", "true"); part.set("role", role); part.set("asset", new File([new Uint8Array(bytes)], name, { type }));
    const response = await handleRequest(new Request("https://local.invalid/api/digital/upload-part", { method: "POST", headers: auth, body: part }), env);
    return { status: response.status, body: await response.json() as { id?: string; error?: string } };
  };
  const sizes = ["2x3-ratio", "3x4-ratio", "4x5-ratio", "11x14-in", "More-Sizes"];
  const fileIds: string[] = [];
  for (const [index, size] of sizes.entries()) {
    const zip = Uint8Array.from(zipSync({ [`Print-1-${size}.png`]: png(index * 3 + 1), [`Print-2-${size}.png`]: png(index * 3 + 2), [`Print-3-${size}.png`]: png(index * 3 + 3), [`Print-4-${size}.png`]: png(index * 3 + 4) }, { level: 0 }));
    assert.ok(zip.byteLength > 2.5 * 1024 * 1024, "each ZIP is above the light-QA threshold");
    const staged = await stage(zip, `Green-Uluven-Botanical-Wall-Art-${size}.zip`, "file", "application/zip");
    assert.equal(staged.status, 201, staged.body.error); fileIds.push(staged.body.id!);
  }
  const jpeg = (seed: number) => { const body = noise(200_000, seed); body.set([0xff, 0xd8, 0xff, 0xe0], 0); body.set([0xff, 0xd9], body.length - 2); return body; };
  const imageIds: string[] = [];
  for (let index = 0; index < 10; index++) imageIds.push((await stage(jpeg(100 + index), `${169201 + index}.jpg`, "image", "image/jpeg")).body.id!);
  // Parçalar denetlendikten sonra baytlar bozulsa bile kayıt yeniden açmaz; denetim yüklemede bir kez yapılır.
  const form = new FormData();
  form.set("metadata", JSON.stringify({ confirm: true, kind: "wall_art", name: "Green Uluven Botanical Wall Art", productType: "botanical wall art", prices: { usd: "7.99" }, listing: { title: "Botanical Wall Art Set of 3", description: "WHAT'S INCLUDED\n• 3 art prints\n• Formats: 2:3 ratio, 3:4 ratio, 4:5 ratio, 11x14 in", tags: [], materials: [] } }));
  form.set("parts", JSON.stringify({ files: fileIds, images: imageIds }));
  const saved = await handleRequest(new Request("https://local.invalid/api/digital/products", { method: "POST", headers: auth, body: form }), env);
  assert.equal(saved.status, 201, await saved.clone().text());
  const product = (await saved.json() as { product: { id: string; files: unknown[]; images: unknown[] } }).product;
  assert.equal(product.files.length, 5); assert.equal(product.images.length, 10);
  assert.ok(values.has(`digital:file:${product.id}`) || [...values.keys()].some(key => key.includes(product.id)), "files stored under the product");
  assert.ok(![...values.keys()].some(key => key.startsWith("digital:pending:")), "no temporary copies are left");
  // Büyük ZIP içinde çalıştırılabilir dosya hafif denetimde de reddedilir.
  const bad = Uint8Array.from(zipSync({ "Print.png": png(999), "setup.exe": noise(2_700_000, 7) }, { level: 0 }));
  const rejected = await stage(bad, "Green-Uluven-Botanical-Wall-Art-Extra.zip", "file", "application/zip");
  assert.equal(rejected.status, 400); assert.match(rejected.body.error || "", /çalıştırılabilir/);
});

test("a full daily storage quota gives a clear Turkish message instead of an unexpected server error", async () => {
  const store = { async get() { return null; }, async put() { throw new Error("KV PUT failed: 429 Too Many Requests"); }, async delete() {} };
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store as never };
  const part = new FormData(); part.set("confirm", "true"); part.set("role", "file");
  part.set("asset", new File([validPdf("Animal-US-Letter.pdf")], "Animal-US-Letter.pdf", { type: "application/pdf" }));
  const response = await handleRequest(new Request("https://local.invalid/api/digital/upload-part", { method: "POST", headers: { authorization: "Bearer local-test" }, body: part }), env);
  assert.equal(response.status, 503);
  assert.match((await response.json() as { error: string }).error, /günlük depolama sınırı/);
});

test("a 9 MB ZIP arrives in 4 MB chunks, is checked from its head and tail, saved without copying and downloaded byte for byte", async () => {
  const { zipSync } = await import("fflate");
  const { store, values } = memory();
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store as never };
  const auth = { authorization: "Bearer local-test" };
  const noise = (size: number, seed: number) => { const out = new Uint8Array(size); let x = seed; for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; } return out; };
  const send = async (bytes: Uint8Array, name: string, upload: string) => {
    const chunk = 4 * 1024 * 1024, total = Math.ceil(bytes.length / chunk);
    let last: Response | undefined;
    for (let index = 0; index < total; index++) {
      last = await handleRequest(new Request(`https://local.invalid/api/digital/upload-chunk?upload=${upload}&index=${index}&total=${total}&size=${bytes.length}&name=${encodeURIComponent(name)}&confirm=true`, { method: "POST", headers: { ...auth, "content-type": "application/octet-stream" }, body: bytes.slice(index * chunk, (index + 1) * chunk) }), env);
      if (index < total - 1) assert.equal(last.status, 201, await last.clone().text());
    }
    return { status: last!.status, body: await last!.json() as { id?: string; error?: string } };
  };
  const zip = Uint8Array.from(zipSync({ "Print-1-2x3.png": noise(3_000_000, 1), "Print-2-2x3.png": noise(3_000_000, 2), "Print-3-2x3.png": noise(3_000_000, 3) }, { level: 0 }));
  assert.ok(zip.length > 8 * 1024 * 1024);
  const staged = await send(zip, "Green-Uluven-Botanical-Wall-Art-2x3.zip", "a".repeat(32));
  assert.equal(staged.status, 201, staged.body.error);
  const image = noise(200_000, 9); image.set([0xff, 0xd8, 0xff, 0xe0], 0);
  const part = new FormData(); part.set("confirm", "true"); part.set("role", "image"); part.set("asset", new File([image], "listing-01.jpg", { type: "image/jpeg" }));
  const imageId = (await (await handleRequest(new Request("https://local.invalid/api/digital/upload-part", { method: "POST", headers: auth, body: part }), env)).json() as { id: string }).id;
  // Kayıt parçaları okumaz: depo okuması sayılır.
  let blobReads = 0; const get = store.get.bind(store);
  (store as any).get = async (key: string, type?: string) => { if (/^digital:(chunk|blob):/.test(key)) blobReads++; return (get as any)(key, type); };
  const form = new FormData();
  form.set("metadata", JSON.stringify({ confirm: true, kind: "wall_art", name: "Green Uluven Botanical Wall Art", productType: "botanical wall art", prices: { usd: "7.99" }, listing: { title: "Botanical Wall Art Set of 3", description: "WHAT'S INCLUDED\n• 3 art prints\n• Formats: 2:3 ratio", tags: [], materials: [] } }));
  form.set("parts", JSON.stringify({ files: [staged.body.id], images: [imageId] }));
  const saved = await handleRequest(new Request("https://local.invalid/api/digital/products", { method: "POST", headers: auth, body: form }), env);
  assert.equal(saved.status, 201, await saved.clone().text());
  assert.equal(blobReads, 0, "saving the product never reads the uploaded bytes again");
  (store as any).get = get;
  const product = (await saved.json() as { product: { id: string; files: Array<{ key?: string; size: number }> } }).product;
  assert.match(product.files[0].key!, /^digital:chunked:a{32}:3$/);
  assert.equal(product.files[0].size, zip.length);
  const { readStoredFile } = await import("../../worker/src/digital-delivery.js");
  assert.deepEqual(new Uint8Array((await readStoredFile(store as never, product.files[0].key!))!), zip);
  assert.ok(![...values.keys()].some(key => key.startsWith("digital:pending-part:")), "no abandoned-upload markers are left");
  // Çalıştırılabilir dosya son parçadan okunan içerik listesinde yakalanır; yanlış boyutlu parça reddedilir.
  const bad = Uint8Array.from(zipSync({ "Print.png": noise(4_500_000, 4), "setup.exe": noise(100_000, 5) }, { level: 0 }));
  const rejected = await send(bad, "Green-Uluven-Botanical-Wall-Art-Bad.zip", "b".repeat(32));
  assert.equal(rejected.status, 400); assert.match(rejected.body.error || "", /çalıştırılabilir/);
  const short = await handleRequest(new Request(`https://local.invalid/api/digital/upload-chunk?upload=${"c".repeat(32)}&index=0&total=2&size=${5 * 1024 * 1024}&name=x.zip&confirm=true`, { method: "POST", headers: auth, body: new Uint8Array(1000) }), env);
  assert.equal(short.status, 400);
  const tooBig = await handleRequest(new Request(`https://local.invalid/api/digital/upload-chunk?upload=${"d".repeat(32)}&index=0&total=6&size=${21 * 1024 * 1024}&name=big.zip&confirm=true`, { method: "POST", headers: auth, body: new Uint8Array(10) }), env);
  assert.match((await tooBig.json() as { error: string }).error, /20 MB; bu ZIP'i ikiye bölün/);
});
