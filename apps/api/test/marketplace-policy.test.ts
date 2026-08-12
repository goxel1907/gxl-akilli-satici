import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMarketplacePolicies } from "../src/marketplace-policy.js";

test("cep çakısı Letgo ve Etsy için kesin engellenir", () => {
  const result = evaluateMarketplacePolicies({ origin: "commercial_resale", authenticityVerified: true, riskFlags: ["pocket_knife"] });
  assert.equal(result.find((item) => item.marketplace === "letgo")?.status, "blocked");
  assert.equal(result.find((item) => item.marketplace === "etsy")?.status, "blocked");
  assert.equal(result.find((item) => item.marketplace === "shopier")?.status, "review");
});

test("20 yıldan yeni ticari yeniden satış Etsy için engellenir", () => {
  const result = evaluateMarketplacePolicies({ origin: "commercial_resale", yearMade: 2020, authenticityVerified: true, riskFlags: ["branded_product"] });
  assert.equal(result.find((item) => item.marketplace === "etsy")?.status, "blocked");
});

test("kanıtsız markalı koleksiyon ürünü otomatik yayınlanmaz", () => {
  const result = evaluateMarketplacePolicies({ origin: "vintage", yearMade: 1998, authenticityVerified: false, riskFlags: ["branded_product"] });
  assert.equal(result.every((item) => item.status !== "allowed"), true);
  assert.equal(result.every((item) => item.autoPublishAllowed === false), true);
});

test("doğrulanmış el yapımı risksiz ürün ön kontrolü geçer", () => {
  const result = evaluateMarketplacePolicies({ origin: "made_by_seller", authenticityVerified: true, riskFlags: ["none"] });
  assert.equal(result.every((item) => item.status === "allowed"), true);
});
