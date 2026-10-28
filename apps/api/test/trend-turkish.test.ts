import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { TrendStore } from "../../worker/src/etsy-trends.js";
import { scoreTrend } from "../../worker/src/etsy-trends.js";
import { turkishForPhrases } from "../../worker/src/phrase-tr.js";
import { phraseTr } from "../../worker/src/tr-glossary.js";
import { handleRequest } from "../../worker/src/index.js";

function memoryKv() {
  const values = new Map<string, string>();
  let writes = 0;
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { writes += 1; values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store: store as TrendStore & { delete(key: string): Promise<void> }, writes: () => writes };
}

// Hiç İngilizce bilmeyen satıcı kartta ürünün Türkçe adını görür; İngilizce arama altında küçük yazar.
test("Etsy search phrases get a natural Turkish name a first-time seller understands", () => {
  const cases: Record<string, string> = {
    "crochet bag pattern": "tığ işi çanta deseni",
    "quilt pattern pdf": "yorgan (kapitone) deseni (PDF)",
    "budget planner printable": "yazdırılabilir bütçe planlayıcı",
    "coloring pages for kids": "çocuklar için boyama sayfaları",
    "christmas gift for him": "erkeğe Noel hediyesi",
    "eid gift for men": "erkekler için Bayram hediyesi",
    "halloween coloring pages": "Cadılar Bayramı boyama sayfaları",
    "sterling silver prayer beads": "925 ayar gümüş tesbih",
    "crochet pumpkin pattern": "tığ işi balkabağı deseni"
  };
  for (const [english, turkish] of Object.entries(cases)) assert.deepEqual(phraseTr(english), { tr: turkish, unknown: [] }, english);
  assert.deepEqual(phraseTr("dhikr counter beads").unknown, ["dhikr", "counter"], "words the dictionary does not know are reported, never guessed");
});

test("unknown words are translated once by AI and kept, so the next screen opens without asking again", async () => {
  const kv = memoryKv();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ en: "dhikr counter beads", tr: "zikir sayaçlı tesbih" }, { en: "invented phrase", tr: "uydurma" }] }) }] } }] });
  }) as typeof fetch;
  try {
    const first = await turkishForPhrases(["Dhikr counter beads", "crochet bag pattern"], { GEMINI_API_KEY: "test" }, kv.store);
    assert.equal(first["dhikr counter beads"], "zikir sayaçlı tesbih");
    assert.equal(first["crochet bag pattern"], "tığ işi çanta deseni", "dictionary phrases never go to AI");
    assert.equal(first["invented phrase"], undefined, "AI answers for phrases that were not asked are ignored");
    assert.equal(calls, 1);
    const second = await turkishForPhrases(["dhikr counter beads"], { GEMINI_API_KEY: "test" }, kv.store);
    assert.equal(second["dhikr counter beads"], "zikir sayaçlı tesbih");
    assert.equal(calls, 1, "a cached translation is not requested again");
    assert.equal(kv.writes(), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const offline = await turkishForPhrases(["dhikr counter beads"], {}, memoryKv().store);
  assert.equal(offline["dhikr counter beads"], "dhikr counter taneler", "without AI the dictionary part is still shown");
});

test("discoveries say in Turkish what was found and from which search", async () => {
  const kv = memoryKv();
  const cached = scoreTrend("eid gift for men", { count: 900, results: [{ title: "Listing", url: "https://www.etsy.com/listing/1", num_favorers: 25, listing_type: "physical", tags: ["silver tasbih"], original_creation_timestamp: Math.round(Date.now() / 1000) - 15 * 86400, price: { amount: 4500, divisor: 100, currency_code: "USD" } }] }, Date.now(), "tesbih");
  await kv.store.put("etsy:trend:eid-gift-for-men", JSON.stringify(cached));
  const env = { APP_ACCESS_TOKEN: "app-token", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: kv.store };
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const scan = await handleRequest(new Request("https://gxl.example/api/etsy/trends/scan", { method: "POST", headers, body: JSON.stringify({ keyword: "eid gift for men", group: "tesbih", track: true }) }), env);
  assert.equal((await scan.json() as { keywordTr: string }).keywordTr, "erkekler için Bayram hediyesi");
  const response = await handleRequest(new Request("https://gxl.example/api/etsy/discoveries", { headers }), env);
  const body = await response.json() as { items: Array<{ keyword: string; keywordTr?: string; from: string; fromTr?: string }> };
  const manual = body.items.find((item) => item.keyword === "eid gift for men");
  assert.equal(manual?.keywordTr, "erkekler için Bayram hediyesi");
  assert.equal(manual?.fromTr, undefined, "a search the seller typed has no source phrase");
  const found = body.items.find((item) => item.keyword === "silver tasbih");
  assert.equal(found?.keywordTr, "gümüş tesbih");
  assert.equal(found?.fromTr, "erkekler için Bayram hediyesi");
});

test("every trend group button explains what is inside for someone who has never used the app", () => {
  const app = readFileSync(new URL("../../mobile/App.tsx", import.meta.url), "utf8");
  for (const id of ["printables", "patterns", "tesbih", "vintage", "discovered", "season"]) assert.match(app, new RegExp(`\\n  ${id}: \\{ icon: "[^"]+", title: "[^"]+ nedir\\?"`), id);
  assert.match(app, /<GroupIntro group=\{group\} \/>/);
  assert.match(app, /Etsy'de aranan: \{keyword\}/);
  assert.match(app, /title=\{item\.keywordTr \|\| item\.keyword\} keyword=\{item\.keyword\} onScan=/, "season cards show the Turkish name and can be scored with one tap");
});
