import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";
import { beatCompetitors, listingReviewPrompt, parseListingReview, type BeatInput, type ListingReview } from "../../mobile/agent-team.js";

// Otomatik denetçi ajan: sunucudaki yapay zekâ (Gemini API, yedek Workers AI) ilanı satan rakiplere göre denetler.
// Sonuç telefondaki elle denetimle aynı kurallardan geçer (sayı uydurma yok, İngilizce, 13 etiket); geçmezse düzeltme
// önerilmez. "Rakipten iyi mi?" kapısı kurallarla, yapay zekâsız hesaplanır; yapay zekâ kapalıyken de çalışır.
const SCHEMA = {
  type: "object",
  properties: {
    scores: { type: "object", properties: { title: { type: "number" }, tags: { type: "number" }, description: { type: "number" }, images: { type: "number" }, price: { type: "number" } } },
    issuesTr: { type: "array", items: { type: "string" } },
    listing: { type: "object", properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, openingEn: { type: "string" } } },
    imageFixesTr: { type: "array", items: { type: "string" } }
  },
  required: ["scores", "issuesTr", "listing", "imageFixesTr"]
};

const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const count = (value: unknown) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

export function normalizeReviewInput(raw: Record<string, unknown>): BeatInput & { provenSellers: string[] } {
  const tags = (Array.isArray(raw.tags) ? raw.tags : String(raw.tags || "").split(",")).map((tag) => text(tag, 40)).filter(Boolean).slice(0, 20);
  const sellers = (Array.isArray(raw.sellers) ? raw.sellers : []).slice(0, 8).map((row: any) => ({
    title: text(row?.title, 140), priceUsd: Number(row?.priceUsd) > 0 ? Number(row.priceUsd) : undefined,
    images: count(row?.images), video: row?.video === true, reviews: count(row?.reviews), shopSales: count(row?.shopSales)
  }));
  return {
    kind: raw.kind === "physical" ? "physical" : "digital",
    title: text(raw.title, 200), tags, description: String(raw.description || "").slice(0, 6000),
    priceUsd: Number(raw.priceUsd) > 0 ? Math.round(Number(raw.priceUsd) * 100) / 100 : undefined,
    images: Math.max(0, Math.min(20, Math.floor(Number(raw.images) || 0))), video: raw.video === true,
    targetSearch: text(raw.targetSearch, 80) || undefined,
    sellers,
    provenSellers: sellers.filter((row) => row.reviews !== null || row.shopSales !== null).map((row) => `${row.title} | ${row.reviews ?? "?"} reviews | shop sales ${row.shopSales ?? "?"}${row.priceUsd ? ` | $${row.priceUsd}` : ""}${row.images !== null ? ` | ${row.images} images${row.video ? " + video" : ""}` : ""}`)
  };
}

export async function runListingReview(raw: Record<string, unknown>, env: AiRuntimeEnv): Promise<{ beat: ReturnType<typeof beatCompetitors>; ai: boolean; review?: ListingReview; reviewErrorTr?: string }> {
  const input = normalizeReviewInput(raw);
  const beat = beatCompetitors(input);
  if (!input.title) return { beat, ai: false, reviewErrorTr: "Başlık boş." };
  if (!hasAiProvider(env)) return { beat, ai: false, reviewErrorTr: "Sunucuda yapay zekâ bağlı değil; denetimi ChatGPT, Claude veya Gemini ile elle yap." };
  const context = { kind: input.kind, title: input.title, tags: input.tags, description: input.description, priceUsd: input.priceUsd, targetSearch: input.targetSearch, provenSellers: input.provenSellers };
  const requestId = `auto-${crypto.randomUUID()}`;
  try {
    // Sunucu modeli internete ve görsellere bakamaz: talimat buna göre daraltılır (satan rakip verisi ve görsel sayısı verilir).
    const prompt = listingReviewPrompt("gemini", context, requestId)
      .replace(/İlan görsellerini \(önce kapak\) bu mesaja ekliyorum; ekli değilse önce iste\. /, "")
      .replace(/^1\. Search the web:.*$/m, "1. You cannot browse: judge the listing against provenSellers and the rules below.")
      .replace(/^4\. Images:.*$/m, `4. Images: you cannot see them; the listing has ${input.images} images${input.video ? " and a video" : " and no video"}. In imageFixesTr (Turkish) say what to add if that is fewer than 10 images or there is no video, and remind me that the cover must be bolder than the competitors'.`);
    const result = await generateStructuredObject<Record<string, unknown>>({ schemaName: "gxl_listing_review", schema: SCHEMA, prompt }, env);
    const review = parseListingReview(JSON.stringify({ version: "GXL_LISTING_REVIEW_V1", requestId, ...result }), requestId, context);
    return { beat, ai: true, review };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { beat, ai: true, reviewErrorTr: /^AI_/.test(message) ? "Sunucudaki yapay zekâ şu an yanıt vermedi (kota veya bağlantı). Denetimi başka bir yapay zekâyla elle yap." : `Yapay zekânın önerisi kurallardan geçmedi, uygulanmadı:\n${message}` };
  }
}
