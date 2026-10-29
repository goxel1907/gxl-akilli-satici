import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allOutputSamples } from "./output-matrix.js";

// Kullanım: node --import tsx apps/api/test/fixtures/dump-outputs.ts <klasör>
// Her üretilmiş metni okunabilir dosyalara yazar (ajan incelemesi ve göz kontrolü için).
const dir = process.argv[2];
if (!dir) throw new Error("output directory required");
mkdirSync(dir, { recursive: true });
// --first: talimat paketlerinden her senaryonun yalnız ilkini yazar (ilanlar ve pinler hep tam).
const first = process.argv.includes("--first");
const samples = (await allOutputSamples()).filter((sample) => !first || sample.field !== "masterPrompt" || sample.id.endsWith("/a"));
const groups = new Map<string, string[]>();
for (const sample of samples) {
  const file = `${sample.studio}.md`;
  const list = groups.get(file) || [];
  list.push(`\n\n======== ${sample.id} · ${sample.field} ========\n${sample.text}`);
  groups.set(file, list);
}
for (const [file, parts] of groups) writeFileSync(join(dir, file), parts.join(""));
console.log(`${samples.length} samples → ${[...groups.keys()].join(", ")}`);
