import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import type { TrendStore } from "./etsy-trends.js";
import { phraseTr } from "./tr-glossary.js";

// Trend, keşif ve sezon kartlarındaki İngilizce arama ifadelerinin Türkçe adı.
// Önce sözlük; sözlüğün bilmediği kelime içeren ifadeler yapay zekâyla bir kez çevrilir ve saklanır
// (KV'ye yalnız yeni çeviri olduğunda yazılır). Yapay zekâ yoksa ya da hata verirse sözlük karşılığı kalır.
const CACHE_KEY = "tr:phrases:v1";
const MAX_AI_BATCH = 25;
const MAX_CACHE_ENTRIES = 1500;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { en: { type: "string" }, tr: { type: "string" } },
        required: ["en", "tr"]
      }
    }
  },
  required: ["items"]
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export function turkishFor(map: Record<string, string>, phrase: string): string | undefined {
  return map[normalize(phrase)] || undefined;
}

export async function turkishForPhrases(phrases: string[], env: AiRuntimeEnv, store?: TrendStore): Promise<Record<string, string>> {
  const unique = [...new Set(phrases.map(normalize).filter(Boolean))];
  const out: Record<string, string> = {};
  const partial: string[] = [];
  for (const phrase of unique) {
    const { tr, unknown } = phraseTr(phrase);
    out[phrase] = tr;
    if (unknown.length) partial.push(phrase);
  }
  if (!partial.length) return out;

  let cache: Record<string, string> = {};
  try {
    const parsed = JSON.parse((await store?.get(CACHE_KEY)) || "{}");
    if (parsed && typeof parsed === "object") cache = parsed;
  } catch { cache = {}; }
  const ask = partial.filter((phrase) => {
    if (typeof cache[phrase] === "string") { out[phrase] = cache[phrase]; return false; }
    return true;
  });
  if (!ask.length || !hasAiProvider(env)) return out;

  const batch = ask.slice(0, MAX_AI_BATCH);
  try {
    const raw = await generateStructuredObject<{ items?: Array<{ en?: unknown; tr?: unknown }> }>({
      schemaName: "gxl_search_phrases_tr",
      schema: SCHEMA,
      prompt: [
        "These are Etsy search phrases used by US buyers. Give each one a short, plain Turkish name that a Turkish seller with no English understands.",
        "Say what the product is. Keep Turkish word order natural (\"crochet bag pattern\" → \"tığ işi çanta deseni\").",
        "For a style or trend word with no Turkish equivalent, explain it briefly and keep the English in parentheses (\"cottagecore\" → \"kır evi tarzı (cottagecore)\").",
        "Never add claims that are not in the phrase. Max 8 words each. Return every phrase exactly as given in \"en\".",
        JSON.stringify(batch)
      ].join("\n")
    }, env);
    let added = 0;
    for (const item of raw.items || []) {
      const en = normalize(String(item.en || ""));
      const tr = String(item.tr || "").replace(/\s+/g, " ").trim();
      if (!batch.includes(en) || !tr || tr.length > 90 || /[\n<>{}]/.test(tr)) continue;
      out[en] = tr;
      cache[en] = tr;
      added += 1;
    }
    if (added && store) {
      const entries = Object.entries(cache);
      await store.put(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_CACHE_ENTRIES))));
    }
  } catch {
    // Sözlük karşılığı kalır; sonraki açılışta yeniden denenir.
  }
  return out;
}
