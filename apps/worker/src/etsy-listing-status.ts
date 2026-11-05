import { etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";

export async function readEtsyListingStatus(env: EtsyRuntimeEnv, listingId: number, fetcher: typeof fetch = fetch, expectedShopId?: number) {
  if (!Number.isInteger(listingId) || listingId <= 0) throw new EtsyIntegrationError("VALIDATION_FAILED", "Geçersiz Etsy ilan numarası.", 400);
  const shopId = expectedShopId ?? (await getConnectedShop(env, fetcher)).shopId;
  const listing = await etsyRequest<{ listing_id?: number; shop_id?: number; state?: string }>(env, `/application/listings/${listingId}`, {}, fetcher);
  if (Number(listing.listing_id) !== listingId || Number(listing.shop_id) !== shopId) throw new EtsyIntegrationError("VALIDATION_FAILED", "İlan bağlı Etsy mağazasıyla uyuşmuyor.", 400);
  if (!listing.state) throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy ilan durumunu döndürmedi; yayın durumu doğrulanamadı.", 502);
  return { listingId, state: listing.state, checkedAt: new Date().toISOString(), url: `https://www.etsy.com/listing/${listingId}` };
}
