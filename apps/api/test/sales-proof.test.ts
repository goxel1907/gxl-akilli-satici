import assert from "node:assert/strict";
import test from "node:test";
import { researchPrintableMarket } from "../../worker/src/printable-research.js";

const env = { ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret" };
const now = Math.floor(Date.now() / 1000);
const listing = (id: number, favorites: number) => ({ listing_id: id, url: `https://www.etsy.com/listing/${id}/x`, title: `Christmas Bingo Game Printable ${id}`, tags: ["christmas bingo", "sage green"], listing_type: "download", num_favorers: favorites, original_creation_timestamp: now - 86400 * 200, price: { amount: 400 + id, divisor: 100, currency_code: "USD" } });

test("competitors are ranked by sales proof (listing reviews, shop sales) and cover colors come from the real cover images", async () => {
  const urls: string[] = [];
  const fetcher = (async (input: string) => {
    const url = new URL(input); urls.push(url.pathname);
    if (url.pathname.endsWith("/listings/active")) return Response.json({ count: 900, results: [1, 2, 3, 4, 5, 6].map(id => listing(id, id === 1 ? 500 : 20)) });
    if (url.pathname.endsWith("/listings/batch")) {
      assert.match(url.searchParams.get("includes") || "", /Shop,Images/);
      return Response.json({ results: [1, 2, 3, 4, 5, 6].map(id => ({ ...listing(id, 0), shop: { transaction_sold_count: id === 4 ? 25000 : 50, review_average: 4.9 }, images: Array.from({ length: id === 4 ? 10 : 5 }, (_, rank) => ({ rank: rank + 1, hue: 90, saturation: 12, brightness: 85, hex_code: "D8DCC8" })), videos: id === 4 ? [{}] : [] })) });
    }
    const reviews = url.pathname.match(/\/listings\/(\d+)\/reviews$/);
    if (reviews) return Response.json({ count: reviews[1] === "4" ? 1300 : reviews[1] === "1" ? 0 : 12, results: [] });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  const result = await researchPrintableMarket(env, { kind: "party", productType: "christmas bingo game", keyword: "christmas bingo" }, fetcher);
  assert.ok(urls.some(path => path.endsWith("/listings/batch")));
  assert.equal(result.strategy.leaders[0].id, "4", "the listing with the most buyer reviews leads, not the most favorited");
  assert.equal(result.strategy.leaders[0].reviews, 1300);
  assert.equal(result.strategy.salesEvidence.status, "proxy");
  assert.equal(result.strategy.salesEvidence.bestsellerVerified, false);
  assert.match(result.strategy.productionBriefEn, /PROVEN SELLERS/);
  assert.ok(result.salesProof!.summaryTr.some(line => /1300 yorum/.test(line)));
  assert.ok(result.salesProof!.summaryTr.some(line => /%100'i soluk\/nötr/.test(line)));
  assert.notEqual(result.colorPlan.coverColor, "sage green");
});

test("research still works when the sales-proof calls fail", async () => {
  const fetcher = (async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/listings/active")) return Response.json({ count: 900, results: [1, 2, 3, 4].map(id => listing(id, 10)) });
    return Response.json({ error: "down" }, { status: 500 });
  }) as typeof fetch;
  const result = await researchPrintableMarket(env, { kind: "party", productType: "christmas bingo game", keyword: "christmas bingo" }, fetcher);
  assert.equal(result.salesProof, undefined);
  assert.equal(result.strategy.salesEvidence.status, "unavailable");
});
