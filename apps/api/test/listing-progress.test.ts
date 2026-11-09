import assert from "node:assert/strict";
import test from "node:test";
import { listingProgress, etsyTransferComplete } from "../../mobile/listing-progress.js";
import { readEtsyListingStatus } from "../../worker/src/etsy-listing-status.js";
import { publishEtsyListing } from "../../worker/src/product-studio.js";

const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: { get: async () => JSON.stringify({ accessToken: "123.token", refreshToken: "refresh", userId: "123", expiresAt: Date.now() + 3600000 }), put: async () => {}, delete: async () => {} } };
const fetcher = (patch: object, state: object = { listing_id: 901, shop_id: 777, state: "draft" }) => (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("/users/123/shops")) return Response.json({ shop_id: 777, currency_code: "USD" });
  if (init?.method === "PATCH") return Response.json(patch);
  if (url.endsWith("/listings/901")) return Response.json(state);
  throw Error(`Unexpected request ${url}`);
}) as typeof fetch;

test("guide distinguishes preparation, production, QA, draft transfer and verified publication", () => {
  assert.equal(listingProgress({ phase: "studio" }).step, 1);
  assert.equal(listingProgress({ phase: "studio", planReady: true }).step, 2);
  assert.equal(listingProgress({ phase: "upload", files: 2 }).step, 3);
  const saved = { phase: "saved" as const, files: 2, images: 3, etsy: { listingId: 901, fileUploaded: true, filesUploaded: 2, imagesUploaded: 2 } };
  assert.equal(etsyTransferComplete(saved), false);
  assert.equal(listingProgress(saved).step, 4);
  saved.etsy.imagesUploaded = 3;
  assert.equal(etsyTransferComplete(saved), true);
  assert.equal(listingProgress(saved).complete, false);
  assert.equal(listingProgress({ ...saved, verifiedState: "draft" }).complete, false);
  assert.equal(listingProgress({ ...saved, verifiedState: "active" }).complete, true);
});

test("guide does not accept unchecked files, duplicate tags or invalid prices", () => {
  const input = { phase: "upload" as const, files: 2, images: 3, tested: true, title: "ABC Animal Coloring Book", description: "Digital download", tags: Array.from({ length: 13 }, (_, i) => `animal ${i}`), priceUsd: "6.99" };
  assert.equal(listingProgress(input).title, "Kaydetmeye hazır");
  assert.equal(listingProgress({ ...input, tested: false }).title, "Son dosyaları dene");
  assert.equal(listingProgress({ ...input, tags: Array(13).fill("duplicate") }).title, "İlan bilgilerini kontrol et");
  assert.equal(listingProgress({ ...input, priceUsd: "Infinity" }).title, "İlan bilgilerini kontrol et");
});

test("an empty publication response requires an independent active-state confirmation", async () => {
  await assert.rejects(publishEtsyListing(env, 901, fetcher({})), /aktif olarak doğrulamadı/);
  const result = await publishEtsyListing(env, 901, fetcher({}, { listing_id: 901, shop_id: 777, state: "active" }));
  assert.equal(result.state, "active");
});

test("listing status rejects missing state and listings belonging to another shop", async () => {
  await assert.rejects(readEtsyListingStatus(env, 901, fetcher({}, { listing_id: 901, shop_id: 778, state: "active" })), /mağazasıyla uyuşmuyor/);
  await assert.rejects(readEtsyListingStatus(env, 901, fetcher({}, { listing_id: 901, shop_id: 777 })), /doğrulanamadı/);
  const result = await readEtsyListingStatus(env, 901, fetcher({}));
  assert.equal(result.state, "draft"); assert.ok(result.checkedAt);
});
