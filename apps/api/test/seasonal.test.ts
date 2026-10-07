import assert from "node:assert/strict";
import test from "node:test";
import { nthWeekday, seasonalBoard, upcomingSeasons } from "../../worker/src/seasonal.js";
import { handleRequest } from "../../worker/src/index.js";

test("US holiday dates follow the official rules", () => {
  assert.equal(nthWeekday(2026, 10, 4, 4).toISOString().slice(0, 10), "2026-11-26");
  assert.equal(nthWeekday(2027, 4, 0, 2).toISOString().slice(0, 10), "2027-05-09");
  assert.equal(nthWeekday(2027, 5, 0, 3).toISOString().slice(0, 10), "2027-06-20");
});

test("upcoming seasons are ordered, dated and carry list-by deadlines", () => {
  const seasons = upcomingSeasons(new Date("2026-10-07T09:00:00Z"));
  const ids = seasons.map((season) => season.id);
  assert.equal(ids[0], "halloween-2026");
  assert.ok(ids.includes("thanksgiving-2026") && ids.includes("christmas-2026") && ids.includes("ramadan-2027"));
  assert.ok(!ids.some((id) => id.startsWith("fall-")));
  const christmas = seasons.find((season) => season.id === "christmas-2026")!;
  assert.equal(christmas.daysUntil, 79);
  assert.equal(christmas.listByProducts, "2026-10-11");
  assert.equal(christmas.listByPatterns, "2026-09-20");
  assert.equal(christmas.urgency, "Hemen listele");
  assert.equal(seasons.find((season) => season.id === "valentines-2027")?.urgency, "Planla");
  assert.equal(seasons.find((season) => season.id === "ramadan-2027")?.approximate, true);
  assert.ok(christmas.keywords.some((item) => item.group === "patterns" && item.keyword === "christmas crochet pattern"));
  assert.ok(seasons.find((season) => season.id === "eid-fitr-2027")?.keywords.some((item) => item.group === "tesbih"));
});

test("seasonal board attaches cached Etsy scans and is served by the API", async () => {
  const values = new Map<string, string>();
  values.set("etsy:trend:christmas-crochet-pattern", JSON.stringify({ keyword: "christmas crochet pattern", score: 71, verdict: "Yüksek fırsat", scannedAt: new Date().toISOString() }));
  const store = { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async (key: string) => { values.delete(key); } };
  const board = await seasonalBoard(store, new Date("2026-10-07T09:00:00Z"));
  const christmas = board.events.find((event) => event.id === "christmas-2026")!;
  assert.equal(christmas.keywords.find((item) => item.keyword === "christmas crochet pattern")?.result?.score, 71);

  const response = await handleRequest(new Request("https://gxl.example/api/etsy/seasonal", { headers: { authorization: "Bearer app-token" } }), { APP_ACCESS_TOKEN: "app-token", ETSY_OAUTH: store });
  assert.equal(response.status, 200);
  const body = await response.json() as { events: unknown[]; note: string };
  assert.ok(body.events.length >= 5);
  assert.match(body.note, /Hicri/);
});
