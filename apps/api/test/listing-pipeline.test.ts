import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { handleRequest } from "../../worker/src/index.js";
import type { DigitalProduct, DigitalStore } from "../../worker/src/digital-delivery.js";
import { validPdf } from "./fixtures/valid-pdf.js";

test("product plan, staged assets, Etsy draft retry and publication verification preserve the same listing", async () => {
  const values = new Map<string, string | ArrayBuffer>();
  const store = {
    async get(key: string, type?: string) { const value = values.get(key); if (value === undefined) return null; return type === "arrayBuffer" ? value : typeof value === "string" ? value : new TextDecoder().decode(value); },
    async put(key: string, value: string | ArrayBuffer) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  } as DigitalStore;
  await store.put("etsy:tokens", JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", userId: "123", expiresAt: Date.now() + 3600000 }));
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store };
  const headers = { authorization: "Bearer local-test" };
  const post = (path: string, body: BodyInit, json = false) => handleRequest(new Request(`https://local.invalid${path}`, { method: "POST", headers: { ...headers, ...(json ? { "content-type": "application/json" } : {}) }, body }), env);
  const originalFetch = globalThis.fetch;
  let draftCalls = 0, imageCalls = 0, fileCalls = 0, failA4 = true, state = "draft";
  let sentListing: URLSearchParams | undefined;
  const uploadedNames: string[] = [];
  globalThis.fetch = (async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/listings/active")) return Response.json({ count: 1000, results: [4,6,8].map(price => ({ title: "ABC Animal Coloring Book Baby Shower", listing_type: "download", tags: ["animal alphabet", "baby shower"], num_favorers: 10, price: { amount: price * 100, divisor: 100, currency_code: "USD" } })) });
    if (path.endsWith("/users/123/shops")) return Response.json({ shop_id: 777, shop_name: "GXLMarketStudio", currency_code: "USD" });
    if (path.endsWith("/seller-taxonomy/nodes")) return Response.json({ results: [{ id: 10, name: "Coloring Books", children: [] }] });
    if (path === "/v3/application/shops/777/listings") { draftCalls++; sentListing = init?.body as URLSearchParams; return Response.json({ listing_id: 901 }, { status: 201 }); }
    if (path.endsWith("/images")) { imageCalls++; return Response.json({ listing_image_id: 1 }, { status: 201 }); }
    if (path.endsWith("/files")) {
      const persisted = [...values.entries()].find(([key]) => key.startsWith("digital:product:"))?.[1];
      const checkpoint = JSON.parse(String(persisted)) as DigitalProduct;
      assert.equal(checkpoint.etsy?.imagesUploaded, 1, "Accepted images must be checkpointed before starting files");
      if (fileCalls === 1) assert.equal(checkpoint.etsy?.filesUploaded, 1, "Accepted files must be checkpointed before the next request");
      fileCalls++; const form = init?.body as FormData; const name = String(form.get("name"));
      if (name.includes("A4") && failA4) { failA4 = false; return Response.json({ error: "Simulated temporary upload failure" }, { status: 500 }); }
      uploadedNames.push(name); return Response.json({ listing_file_id: fileCalls }, { status: 201 });
    }
    if (path === "/v3/application/listings/901") return Response.json({ listing_id: 901, shop_id: 777, state });
    throw Error(`Unexpected external call ${path}`);
  }) as typeof fetch;
  try {
    const planResponse = await post("/api/printables/plan", JSON.stringify({ kind: "coloring", productType: "abc animal coloring book baby shower", assistant: "chatgpt", research: true }), true);
    assert.equal(planResponse.status, 200, await planResponse.clone().text());
    const plan = await planResponse.json() as { brief: { name: string; priceUsd: number }; listing: DigitalProduct["listing"]; handoff: { id: string }; quality: { ok: boolean } };
    assert.equal(plan.quality.ok, true); assert.equal(plan.listing.tags.length, 13);
    const parts: { files: string[]; images: string[] } = { files: [], images: [] };
    const stage = async (file: File, role: "file" | "image") => {
      const form = new FormData(); form.set("confirm", "true"); form.set("role", role); form.set("asset", file);
      const response = await post("/api/digital/upload-part", form); assert.equal(response.status, 201);
      parts[role === "file" ? "files" : "images"].push((await response.json() as { id: string }).id);
    };
    for (const size of ["US-Letter", "A4"]) { const name = `${plan.brief.name.replaceAll(" ", "-")}-${size}.pdf`; await stage(new File([validPdf(name)], name, { type: "application/pdf" }), "file"); }
    await stage(new File([await readFile("apps/mobile/assets/icon.png")], "Pipeline-Preview.png", { type: "image/png" }), "image");
    const form = new FormData();
    form.set("metadata", JSON.stringify({ confirm: true, kind: "coloring", productType: "abc animal coloring book baby shower", name: plan.brief.name, handoffName: plan.brief.name, handoffId: plan.handoff.id, assistant: "chatgpt", listing: plan.listing, prices: { usd: plan.brief.priceUsd }, flags: { testMade: true, aiAssisted: true, photosAreRenders: true } }));
    form.set("parts", JSON.stringify(parts));
    const saved = await post("/api/digital/products", form); assert.equal(saved.status, 201, await saved.clone().text());
    const { product } = await saved.json() as { product: DigitalProduct };
    const draftPath = `/api/digital/products/${product.id}/etsy-draft`;
    assert.equal((await post(draftPath, JSON.stringify({ confirm: true }), true)).status, 502);
    const resumed = await post(draftPath, JSON.stringify({ confirm: true }), true);
    assert.equal(resumed.status, 201, await resumed.clone().text());
    const result = await resumed.json() as { product: DigitalProduct };
    assert.equal(result.product.etsy?.filesUploaded, 2); assert.equal(result.product.etsy?.imagesUploaded, 1);
    assert.equal(draftCalls, 1); assert.equal(imageCalls, 1); assert.equal(fileCalls, 3);
    assert.equal(new Set(uploadedNames).size, 2);
    assert.equal(sentListing?.get("title"), plan.listing.title);
    assert.equal(sentListing?.get("description"), plan.listing.description);
    assert.equal(sentListing?.get("tags"), plan.listing.tags.join(","));
    assert.equal(sentListing?.get("price"), plan.brief.priceUsd.toFixed(2));
    const statusPath = `https://local.invalid/api/digital/products/${product.id}/etsy-status`;
    assert.equal((await (await handleRequest(new Request(statusPath, { headers }), env)).json() as { state: string }).state, "draft");
    state = "active";
    assert.equal((await (await handleRequest(new Request(statusPath, { headers }), env)).json() as { state: string }).state, "active");
    assert.equal(draftCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
