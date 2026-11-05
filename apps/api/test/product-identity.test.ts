import assert from "node:assert/strict";
import test from "node:test";
import { sameProduct } from "../../mobile/product-identity.js";
import { matchesStoredHandoff, registerProductHandoff } from "../../worker/src/product-handoff.js";
import { createDigitalProduct, safeFileName } from "../../worker/src/digital-delivery.js";
import { matchesPrintableProduct, researchPrintableMarket } from "../../worker/src/printable-research.js";
import { buildPrintableListing } from "../../worker/src/printable-studio.js";
import { handleRequest } from "../../worker/src/index.js";
import { validPdf } from "./fixtures/valid-pdf.js";

function memory() {
  const values = new Map<string, string | ArrayBuffer>();
  const store = { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string | ArrayBuffer) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } };
  return { values, store };
}
const identity = { name: "Forest Alphabet", kind: "coloring" as const, productType: "abc animal coloring book baby shower" };
const digital = (title: string, tags: string[] = []) => ({ title, tags, listing_type: "download" });

test("long deliverable names retain distinct paper formats and the product prefix", () => {
  const prefix = "Forest-Alphabet-Animal-Coloring-Book-Baby-Shower-Printable-Collection";
  const letter = safeFileName(`${prefix}-US-Letter.pdf`, "printable");
  const a4 = safeFileName(`${prefix}-A4.pdf`, "printable");
  assert.notEqual(letter, a4);
  assert.match(letter, /-US-Letter\.pdf$/);
  assert.match(a4, /-A4\.pdf$/);
  for (const name of [letter, a4]) { assert.ok(name.length <= 68); assert.ok(name.startsWith(prefix.slice(0, 24))); }
  assert.match(safeFileName(`${prefix}-A4.zip`, "printable", "zip"), /-A4\.zip$/);
});

test("server handoff checks name, kind and product type and rejects expired or corrupt records", async () => {
  const { store, values } = memory();
  const handoff = await registerProductHandoff(store as never, identity);
  assert.equal(await matchesStoredHandoff(store as never, handoff.id, identity), true);
  assert.equal(sameProduct(identity, { ...identity, productType: " ABC  Animal Coloring Book Baby Shower " }), true);
  for (const changed of [{ name: "Other Product" }, { kind: "party" }, { productType: "adult mandala coloring book" }]) {
    assert.equal(sameProduct(identity, { ...identity, ...changed }), false);
    assert.equal(await matchesStoredHandoff(store as never, handoff.id, { ...identity, ...changed }), false);
  }
  values.set(`digital:handoff:${handoff.id}`, "{}");
  assert.equal(await matchesStoredHandoff(store as never, handoff.id, identity), false);
  values.delete(`digital:handoff:${handoff.id}`);
  assert.equal(await matchesStoredHandoff(store as never, handoff.id, identity), false);
  assert.equal(await matchesStoredHandoff(store as never, "../unexpected", identity), false);
});

test("upload enforces stored identity and accepts long names covering Letter and A4", async () => {
  const { store } = memory();
  const item = { ...identity, name: "Forest Alphabet Animal Coloring Book Baby Shower Printable Collection" };
  const handoff = await registerProductHandoff(store as never, item);
  const makeForm = (changes = {}) => {
    const form = new FormData();
    form.set("metadata", JSON.stringify({ ...item, handoffId: handoff.id, prices: { usd: 6.99 }, flags: { testMade: true }, listing: { ...buildPrintableListing({ kind: "coloring", productType: item.productType }, item.name), description: "Formats: US Letter, A4" }, ...changes }));
    for (const size of ["US-Letter", "A4"]) {
      const name = `${item.name.replaceAll(" ", "-")}-${size}.pdf`;
      form.append("files", new File([validPdf(name)], name, { type: "application/pdf" }));
    }
    form.append("images", new File([new Uint8Array([137, 80, 78, 71, ...Array(1200).fill(0)])], "Preview.png", { type: "image/png" }));
    return form;
  };
  for (const changes of [{ kind: "party" }, { name: "Other Product" }, { productType: "adult mandala coloring book" }]) {
    await assert.rejects(createDigitalProduct(store as never, makeForm(changes), "https://local.invalid", async () => {}), /üretim kaydıyla/);
  }
  const result = await createDigitalProduct(store as never, makeForm(), "https://local.invalid", async () => {});
  assert.equal(result.handoff?.id, handoff.id);
  assert.equal(result.files?.length, 2);
  assert.match(result.files![0].name, /US-Letter.pdf$/);
  assert.match(result.files![1].name, /A4.pdf$/);
});

test("ABC animal baby shower research excludes unrelated coloring and occasions", () => {
  assert.equal(matchesPrintableProduct(identity, digital("Alphabet Animal Coloring Book Baby Shower")), true);
  assert.equal(matchesPrintableProduct(identity, digital("Animal Coloring Pages", ["alphabet", "baby shower"])), true);
  for (const title of ["Adult Mandala Coloring Book", "Animal Coloring Book", "Alphabet Coloring Book Baby Shower", "Animal Alphabet Coloring Book Bridal Shower"]) {
    assert.equal(matchesPrintableProduct(identity, digital(title)), false, title);
  }
  assert.equal(matchesPrintableProduct(identity, { ...digital("ABC Animal Coloring Baby Shower"), listing_type: "physical" }), false);
  const christmas = { kind: "party" as const, productType: "christmas escape room" };
  assert.equal(matchesPrintableProduct(christmas, digital("Xmas Escape Room Printable Game")), true);
  assert.equal(matchesPrintableProduct(christmas, digital("Halloween Christmas Escape Room Game")), false);
  assert.equal(matchesPrintableProduct({ kind: "calendar", productType: "2028 calendar printable" }, digital("2027 Calendar Printable")), false);
  assert.equal(matchesPrintableProduct({ kind: "coloring", productType: "ocean coloring pages" }, digital("Space Coloring Pages")), false);
  assert.equal(matchesPrintableProduct({ kind: "coloring", productType: "christmas ocean coloring pages" }, digital("Christmas Snowman Coloring Pages")), false);
});

test("unrelated coloring prices cannot influence the selected niche median", async () => {
  const result = await researchPrintableMarket({ ETSY_API_KEY: "test", ETSY_SHARED_SECRET: "test" }, identity, async () => Response.json({ count: 1000, results: [
    ...[4, 6, 8].map(price => ({ ...digital("Alphabet Animal Coloring Book Baby Shower"), price: { amount: price * 100, divisor: 100, currency_code: "USD" } })),
    ...[50, 80, 100].map(price => ({ ...digital("Adult Mandala Coloring Book"), price: { amount: price * 100, divisor: 100, currency_code: "USD" } }))
  ] }));
  assert.equal(result.sampleSize, 3);
  assert.equal(result.competition.medianPriceUsd, 6);
  await assert.rejects(researchPrintableMarket({ ETSY_API_KEY: "test", ETSY_SHARED_SECRET: "test" }, identity, async () => Response.json({ results: [digital("Adult Mandala Coloring Book"), digital("Animal Coloring Book"), digital("ABC Coloring Book")] })), /aynı tür ve konuda en az 3/);
});


test("Studio returns a stored handoff matching the canonical product identity", async () => {
  const { store } = memory();
  const response = await handleRequest(new Request("https://local.invalid/api/printables/plan", {
    method: "POST", headers: { authorization: "Bearer local-test", "content-type": "application/json" },
    body: JSON.stringify({ kind: "coloring", productType: " ABC Animal Coloring Book Baby Shower ", assistant: "chatgpt" })
  }), { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store as never });
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json() as { brief: { name: string }; handoff: typeof identity & { id: string } };
  assert.equal(result.handoff.name, result.brief.name);
  assert.equal(result.handoff.kind, identity.kind);
  assert.equal(result.handoff.productType, identity.productType);
  assert.equal(await matchesStoredHandoff(store as never, result.handoff.id, result.handoff), true);
});
