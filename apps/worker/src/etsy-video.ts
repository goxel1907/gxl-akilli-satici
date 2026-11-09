import { etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";

// İlan videosu: Etsy her ilana bir video alır (5-15 sn, en fazla 100 MB, MP4 ya da MOV).
// Video sunucuda saklanmaz; telefondan gelir gelmez satıcının kendi ilanına Etsy'ye gönderilir.
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const VIDEO_TYPES = /^video\/(mp4|quicktime|x-m4v)$/;

export async function uploadEtsyListingVideo(env: EtsyRuntimeEnv, listingId: number, video: unknown, fetcher: typeof fetch = fetch) {
  if (!(video instanceof File)) throw new EtsyIntegrationError("VALIDATION_FAILED", "Video dosyası seçilmedi.", 400);
  if (video.size < 10_000 || video.size > MAX_VIDEO_BYTES) throw new EtsyIntegrationError("VALIDATION_FAILED", "Video en fazla 100 MB olmalı (Etsy sınırı).", 400);
  if (!VIDEO_TYPES.test(video.type || "") && !/\.(mp4|mov|m4v)$/i.test(video.name || "")) throw new EtsyIntegrationError("VALIDATION_FAILED", "Video MP4 ya da MOV olmalı.", 400);
  const shop = await getConnectedShop(env, fetcher);
  const name = (video.name || "listing-video.mp4").replace(/[^\w.-]+/g, "-").slice(0, 100);
  const form = new FormData();
  form.set("video", video, name);
  form.set("name", name);
  const result = await etsyRequest<Record<string, unknown>>(env, `/application/shops/${shop.shopId}/listings/${listingId}/videos`, { method: "POST", multipart: form }, fetcher);
  return { listingId, videoId: Number(result.video_id) || undefined, state: String(result.video_state || "uploaded") };
}
