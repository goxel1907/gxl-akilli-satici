export function mergeLocalProducts<T extends { id: string }>(remote: T[], local: T[]): T[] {
  return [...new Map([...remote, ...local].map(item => [item.id, item])).values()];
}

export function generationKey(value: Record<string, unknown>): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

export function uploadPrices(prefill?: { priceUsd?: number; priceTry?: number }) {
  return { usd: prefill?.priceUsd ? String(prefill.priceUsd) : "", try: prefill?.priceTry ? String(prefill.priceTry) : "" };
}

export const PRINTABLE_WORKSPACE_KEY = "gxl.printableWorkspace.v1";
export interface PrintableWorkspace {
  version: 1;
  savedAt: string;
  input: Record<string, any>;
  plan: Record<string, any>;
}
export function parsePrintableWorkspace(raw: string | null): PrintableWorkspace | undefined {
  if (!raw || raw.length > 1_500_000) return undefined;
  try {
    const value = JSON.parse(raw) as PrintableWorkspace;
    const input = value.input, plan = value.plan;
    const textFields = ["kind", "productType", "referenceNotes", "colors", "formats", "pageCount", "audience", "keyword", "assistant"];
    if (!input || !textFields.every(key => typeof input[key] === "string") || ![input.trendTags, input.trendFeatures].every(rows => Array.isArray(rows) && rows.every(item => typeof item === "string"))) return undefined;
    if (value.version !== 1 || !Number.isFinite(Date.parse(value.savedAt)) || !input || !plan || plan.quality?.ok !== true
      || typeof input.kind !== "string" || typeof input.productType !== "string" || !["chatgpt", "claude"].includes(input.assistant)
      || typeof plan.brief?.name !== "string" || typeof plan.brief?.masterPrompt !== "string" || typeof plan.listing?.title !== "string" || typeof plan.listing?.description !== "string" || !Array.isArray(plan.listing.tags)
      || plan.listing.tags.length !== 13 || !plan.listing.tags.every((tag: unknown) => typeof tag === "string" && tag.length <= 20) || generationKey(input) !== plan.inputKey) return undefined;
    const strings = (rows: unknown) => Array.isArray(rows) && rows.every(item => typeof item === "string");
    const objects = (rows: unknown, fields: string[]) => Array.isArray(rows) && rows.every(row => row && fields.every(key => typeof row[key] === "string"));
    const brief = plan.brief, listing = plan.listing;
    if (!strings(brief.originalityPlan) || !strings(brief.qualityGate) || typeof brief.pdfPrompt !== "string"
      || !brief.bundleIdea || typeof brief.bundleIdea.titleTr !== "string" || !strings(brief.bundleIdea.items)
      || !objects(brief.pins, ["title", "description"]) || !strings(listing.warnings) || !strings(listing.checks?.issues)
      || !objects(plan.quality.issues, ["severity", "messageTr"]) || !strings(plan.quality.fixed)
      || brief.artPrompts !== undefined && !strings(brief.artPrompts)
      || brief.adVisuals !== undefined && !objects(brief.adVisuals, ["titleTr", "aspect", "useTr", "prompt"])
      || brief.priceUsd !== undefined && !Number.isFinite(brief.priceUsd)) return undefined;
    const competition = plan.research?.competition;
    if (competition && (!strings(competition.planTr) || !objects(competition.topCompetitors, ["title"])
      || [competition.launchPriceUsd, competition.bundlePriceUsd, ...competition.topCompetitors.map((row: any) => row.priceUsd)].some(price => price !== undefined && !Number.isFinite(price)))) return undefined;
    return value;
  } catch { return undefined; }
}
