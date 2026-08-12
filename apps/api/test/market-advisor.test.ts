import assert from "node:assert/strict";
import test from "node:test";
import { rankMarketOpportunities } from "../src/market-advisor.js";

test("pazar fırsatları talep, rekabet ve kanıt gücüne göre sıralanır", () => {
  const now = new Date().toISOString();
  const results = rankMarketOpportunities([
    { marketplace: "letgo", query: "koleksiyon", observedAt: now, sourceUrl: "https://www.letgo.com/", demandScore: 90, competitionScore: 90, salesEvidence: "listing_density" },
    { marketplace: "shopier", query: "hobi seti", observedAt: now, sourceUrl: "https://www.shopier.com/", demandScore: 80, competitionScore: 30, salesEvidence: "own_store_data" }
  ]);
  assert.equal(results[0].query, "hobi seti");
  assert.match(results[1].reason, /Satış değil ilan yoğunluğu/);
});
