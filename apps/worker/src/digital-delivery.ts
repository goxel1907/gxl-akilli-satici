import { etsyRequest, EtsyIntegrationError, getConnectedShop, type EtsyRuntimeEnv } from "./etsy.js";
import type { PatternCraft, PrintableKind } from "./etsy-trends.js";
import { normalizeEtsyTags, normalizeEtsyTitle, validateEtsyListingText } from "./pattern-studio.js";

type Fetcher = typeof fetch;

export interface DigitalStore {
  get(key: string): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export type MediaWriter = (key: string, bytes: ArrayBuffer, mimeType: string) => Promise<void>;
export type MediaReader = (key: string) => Promise<ArrayBuffer | null>;

export interface DigitalImage {
  key: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface DigitalProduct {
  id: string;
  name: string;
  craft?: PatternCraft;
  kind?: PrintableKind;
  productType: string;
  fileName: string;
  fileSize: number;
  images: DigitalImage[];
  listing: { title: string; description: string; tags: string[]; materials: string[] };
  pins?: Array<{ title: string; description: string; overlay?: string }>;
  prices: { usd?: number; try?: number };
  flags: { aiAssisted: boolean; photosAreRenders: boolean; testMade: boolean };
  etsy?: { listingId: number; editUrl: string; createdAt: string; imagesUploaded: number; fileUploaded: boolean; error?: string };
  createdAt: string;
}

export interface DownloadGrant {
  id: string;
  productId: string;
  orderRef: string;
  channel: "shopier" | "etsy" | "direct";
  createdAt: string;
  expiresAt: string;
  maxDownloads: number;
  downloads: number;
  revoked: boolean;
  lastDownloadAt?: string;
}

export class DigitalDeliveryError extends Error {
  constructor(public code: "VALIDATION_FAILED" | "NOT_FOUND" | "STORAGE_NOT_CONFIGURED", message: string, public status = 400) {
    super(message);
    this.name = "DigitalDeliveryError";
  }
}

const PRODUCT_PREFIX = "digital:product:";
const FILE_PREFIX = "digital:file:";
const GRANT_PREFIX = "digital:grant:";
const GRANT_INDEX_PREFIX = "digital:grants:";
const PRODUCT_INDEX = "digital:index";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const CRAFTS = new Set<PatternCraft>(["crochet", "knitting", "embroidery", "cross_stitch", "sewing", "macrame", "punch_needle"]);
const TAXONOMY_WORDS: Record<PatternCraft, string[]> = {
  crochet: ["crochet"],
  knitting: ["knitting", "knit"],
  embroidery: ["embroidery"],
  cross_stitch: ["cross stitch", "cross-stitch"],
  sewing: ["sewing"],
  macrame: ["macrame", "macramé"],
  punch_needle: ["punch needle", "rug"]
};
// PDF ürünleri için Etsy kategori arama kelimeleri (öncelik sırasıyla).
const KIND_TAXONOMY_WORDS: Record<PrintableKind, string[]> = {
  planner: ["calendars & planners", "planners", "planner"],
  digital_planner: ["calendars & planners", "planners", "planner"],
  coloring: ["coloring"],
  wall_art: ["digital prints", "prints"],
  party: ["party games", "games", "party supplies"],
  recipe: ["recipe", "stationery"],
  journal: ["journals", "notebooks", "journal"],
  kids: ["educational", "learning", "flash cards"],
  paper_craft: ["scrapbooking", "digital paper", "paper"]
};

function randomId(bytes = 24): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function imageType(bytes: Uint8Array): { mimeType: string; extension: string } | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { mimeType: "image/png", extension: "png" };
  return undefined;
}

function safeFileName(value: string, fallback: string): string {
  const base = value.replace(/\.pdf$/i, "").normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base || fallback}.pdf`;
}

function positivePrice(value: unknown): number | undefined {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : undefined;
}

async function readJson<T>(store: DigitalStore, key: string): Promise<T | undefined> {
  const raw = await store.get(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function createDigitalProduct(store: DigitalStore, form: FormData, origin: string, writeMedia: MediaWriter): Promise<DigitalProduct> {
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(String(form.get("metadata") || "{}")) as Record<string, unknown>;
  } catch {
    throw new DigitalDeliveryError("VALIDATION_FAILED", "Ürün bilgileri okunamadı.");
  }
  const name = String(metadata.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const kind = KIND_TAXONOMY_WORDS[String(metadata.kind || "") as PrintableKind] ? String(metadata.kind) as PrintableKind : undefined;
  const craft = kind ? undefined : String(metadata.craft || "") as PatternCraft;
  const productType = String(metadata.productType || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
  if (!name) throw new DigitalDeliveryError("VALIDATION_FAILED", "Ürün adı gerekli.");
  if (!kind && !CRAFTS.has(craft!)) throw new DigitalDeliveryError("VALIDATION_FAILED", "El işi veya PDF türü geçersiz.");
  if (productType.length < 3) throw new DigitalDeliveryError("VALIDATION_FAILED", "Ürün türü gerekli.");

  const listingInput = metadata.listing && typeof metadata.listing === "object" ? metadata.listing as Record<string, unknown> : {};
  const listing = {
    title: normalizeEtsyTitle(String(listingInput.title || "")),
    description: String(listingInput.description || "").trim().slice(0, 9_000),
    tags: normalizeEtsyTags(Array.isArray(listingInput.tags) ? listingInput.tags.map(String) : []),
    materials: (Array.isArray(listingInput.materials) ? listingInput.materials.map(String) : [])
      .map((value) => value.replace(/[^\p{L}\p{Nd}\p{Zs}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 45))
      .filter(Boolean)
      .slice(0, 13)
  };
  if (!listing.title || !listing.description) throw new DigitalDeliveryError("VALIDATION_FAILED", "Önce stüdyoda ilan başlığı ve açıklaması hazırlanmalı.");

  const pdf = form.get("pdf");
  if (!pdf || typeof pdf === "string") throw new DigitalDeliveryError("VALIDATION_FAILED", "PDF dosyası seçilmedi.");
  if (pdf.size < 1_024 || pdf.size > MAX_PDF_BYTES) throw new DigitalDeliveryError("VALIDATION_FAILED", "PDF 1 KB ile 20 MB arasında olmalıdır.");
  const pdfBytes = await pdf.arrayBuffer();
  if (!startsWith(new Uint8Array(pdfBytes, 0, 5), [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new DigitalDeliveryError("VALIDATION_FAILED", "Seçilen dosya geçerli bir PDF değil.");

  const imageFiles = form.getAll("images").filter((item): item is File => typeof item !== "string");
  if (imageFiles.length > MAX_IMAGES) throw new DigitalDeliveryError("VALIDATION_FAILED", "En fazla 10 görsel yüklenebilir.");
  const images: DigitalImage[] = [];
  for (const file of imageFiles) {
    if (file.size < 1_024 || file.size > MAX_IMAGE_BYTES) throw new DigitalDeliveryError("VALIDATION_FAILED", "Her görsel 1 KB ile 8 MB arasında olmalıdır.");
    const bytes = await file.arrayBuffer();
    const type = imageType(new Uint8Array(bytes, 0, 4));
    if (!type) throw new DigitalDeliveryError("VALIDATION_FAILED", "Görseller JPG veya PNG olmalıdır.");
    const key = `digital/${crypto.randomUUID()}.${type.extension}`;
    await writeMedia(key, bytes, type.mimeType);
    images.push({ key, url: `${origin}/media/${key}`, mimeType: type.mimeType, size: bytes.byteLength });
  }

  // Stüdyonun hazırladığı Pinterest pin metinleri ürünle saklanır; pin kuyruğu bunları kullanır.
  const pins = (Array.isArray(metadata.pins) ? metadata.pins : [])
    .map((pin) => pin && typeof pin === "object" ? pin as Record<string, unknown> : {})
    .map((pin) => ({ title: String(pin.title || "").trim().slice(0, 100), description: String(pin.description || "").trim().slice(0, 700), ...(pin.overlay ? { overlay: String(pin.overlay).slice(0, 60) } : {}) }))
    .filter((pin) => pin.title && pin.description)
    .slice(0, 3);
  const prices = metadata.prices && typeof metadata.prices === "object" ? metadata.prices as Record<string, unknown> : {};
  const flags = metadata.flags && typeof metadata.flags === "object" ? metadata.flags as Record<string, unknown> : {};
  const product: DigitalProduct = {
    id: crypto.randomUUID(),
    name,
    ...(kind ? { kind } : { craft }),
    productType,
    fileName: safeFileName(pdf.name || name, kind ? "printable" : "pattern"),
    fileSize: pdfBytes.byteLength,
    images,
    listing,
    ...(pins.length ? { pins } : {}),
    prices: { usd: positivePrice(prices.usd), try: positivePrice(prices.try) },
    flags: { aiAssisted: flags.aiAssisted !== false, photosAreRenders: flags.photosAreRenders !== false, testMade: flags.testMade === true },
    createdAt: new Date().toISOString()
  };
  await store.put(`${FILE_PREFIX}${product.id}`, pdfBytes);
  await store.put(`${PRODUCT_PREFIX}${product.id}`, JSON.stringify(product));
  const index = (await readJson<string[]>(store, PRODUCT_INDEX)) || [];
  await store.put(PRODUCT_INDEX, JSON.stringify([product.id, ...index.filter((id) => id !== product.id)].slice(0, 200)));
  return product;
}

export async function getDigitalProduct(store: DigitalStore, id: string): Promise<DigitalProduct> {
  const product = await readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${id}`);
  if (!product) throw new DigitalDeliveryError("NOT_FOUND", "Dijital ürün bulunamadı.", 404);
  return product;
}

export async function listDigitalProducts(store: DigitalStore): Promise<DigitalProduct[]> {
  const index = (await readJson<string[]>(store, PRODUCT_INDEX)) || [];
  const products = await Promise.all(index.slice(0, 50).map((id) => readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${id}`)));
  return products.filter((product): product is DigitalProduct => Boolean(product));
}

export async function listGrants(store: DigitalStore, productId: string): Promise<DownloadGrant[]> {
  const ids = (await readJson<string[]>(store, `${GRANT_INDEX_PREFIX}${productId}`)) || [];
  const grants = await Promise.all(ids.slice(0, 100).map((id) => readJson<DownloadGrant>(store, `${GRANT_PREFIX}${id}`)));
  return grants.filter((grant): grant is DownloadGrant => Boolean(grant));
}

export async function createGrant(store: DigitalStore, productId: string, input: Record<string, unknown>, now = Date.now()): Promise<DownloadGrant> {
  await getDigitalProduct(store, productId);
  const orderRef = String(input.orderRef || "").replace(/[^\p{L}\p{Nd}#\-_. ]/gu, "").trim().slice(0, 60);
  if (!orderRef) throw new DigitalDeliveryError("VALIDATION_FAILED", "Ödemesi alınmış sipariş numarası gerekli.");
  const channel = (["shopier", "etsy", "direct"] as const).find((value) => value === input.channel) || "shopier";
  const maxDownloads = Math.min(10, Math.max(1, Math.round(Number(input.maxDownloads || 3))));
  const expiresInDays = Math.min(60, Math.max(1, Math.round(Number(input.expiresInDays || 14))));
  const grant: DownloadGrant = {
    id: randomId(),
    productId,
    orderRef,
    channel,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + expiresInDays * DAY_MS).toISOString(),
    maxDownloads,
    downloads: 0,
    revoked: false
  };
  await store.put(`${GRANT_PREFIX}${grant.id}`, JSON.stringify(grant), { expirationTtl: Math.round((expiresInDays + 30) * DAY_MS / 1000) });
  const ids = (await readJson<string[]>(store, `${GRANT_INDEX_PREFIX}${productId}`)) || [];
  await store.put(`${GRANT_INDEX_PREFIX}${productId}`, JSON.stringify([grant.id, ...ids].slice(0, 500)));
  return grant;
}

export async function revokeGrant(store: DigitalStore, grantId: string): Promise<DownloadGrant> {
  const grant = await readJson<DownloadGrant>(store, `${GRANT_PREFIX}${grantId}`);
  if (!grant) throw new DigitalDeliveryError("NOT_FOUND", "İndirme bağlantısı bulunamadı.", 404);
  grant.revoked = true;
  await store.put(`${GRANT_PREFIX}${grant.id}`, JSON.stringify(grant), { expirationTtl: 30 * 24 * 60 * 60 });
  return grant;
}

function grantProblem(grant: DownloadGrant | undefined, now: number): string | undefined {
  if (!grant) return "Bu indirme bağlantısı geçersiz. / This download link is not valid.";
  if (grant.revoked) return "Bu bağlantı satıcı tarafından kapatıldı. / This link was closed by the seller.";
  if (Date.parse(grant.expiresAt) <= now) return "Bu bağlantının süresi doldu. / This link has expired.";
  if (grant.downloads >= grant.maxDownloads) return "İndirme hakkı doldu. / The download limit has been reached.";
  return undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f7f2e8;font-family:system-ui,sans-serif;color:#17201d}main{max-width:560px;margin:48px auto;padding:0 16px}section{background:#fff;border-radius:22px;padding:28px;box-shadow:0 8px 30px #00000012}h1{font-size:24px;margin:0 0 12px}p{line-height:1.6}a.button{display:block;text-align:center;background:#176b52;color:#fff;text-decoration:none;font-weight:700;padding:16px;border-radius:14px;margin-top:18px}small{color:#5c6762}</style></head><body><main><section>${body}</section></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" } });
}

export async function grantLandingPage(store: DigitalStore, grantId: string, now = Date.now()): Promise<Response> {
  const grant = await readJson<DownloadGrant>(store, `${GRANT_PREFIX}${grantId}`);
  const problem = grantProblem(grant, now);
  if (problem || !grant) return page("İndirme bağlantısı", `<h1>İndirme bağlantısı</h1><p>${escapeHtml(problem || "")}</p><small>Sorun yaşıyorsanız satıcıyla sipariş numaranızla iletişime geçin.</small>`, problem?.includes("geçersiz") ? 404 : 410);
  const product = await readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${grant.productId}`);
  const remaining = grant.maxDownloads - grant.downloads;
  const expires = new Date(grant.expiresAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  return page(product?.name || "Desen indirme", `<h1>${escapeHtml(product?.name || "Desen")}</h1><p>Bu bağlantı yalnızca <strong>${escapeHtml(grant.orderRef)}</strong> numaralı sipariş içindir. Lütfen paylaşmayın.</p><p>Kalan indirme: <strong>${remaining}</strong> · Son gün: <strong>${escapeHtml(expires)}</strong></p><a class="button" href="/d/${encodeURIComponent(grant.id)}/file">PDF'i indir / Download PDF</a><p><small>This link belongs to one paid order. Remaining downloads: ${remaining}. The PDF is licensed for personal use only.</small></p>`);
}

export async function grantDownload(store: DigitalStore, grantId: string, now = Date.now()): Promise<Response> {
  const grant = await readJson<DownloadGrant>(store, `${GRANT_PREFIX}${grantId}`);
  const problem = grantProblem(grant, now);
  if (problem || !grant) return page("İndirme bağlantısı", `<h1>İndirme yapılamadı</h1><p>${escapeHtml(problem || "")}</p>`, problem?.includes("geçersiz") ? 404 : 410);
  const [product, file] = await Promise.all([
    readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${grant.productId}`),
    store.get(`${FILE_PREFIX}${grant.productId}`, "arrayBuffer")
  ]);
  if (!product || !file) return page("İndirme bağlantısı", "<h1>Dosya bulunamadı</h1><p>Satıcıyla iletişime geçin.</p>", 404);
  grant.downloads += 1;
  grant.lastDownloadAt = new Date(now).toISOString();
  const ttl = Math.max(60, Math.round((Date.parse(grant.expiresAt) - now + 30 * DAY_MS) / 1000));
  await store.put(`${GRANT_PREFIX}${grant.id}`, JSON.stringify(grant), { expirationTtl: ttl });
  return new Response(file, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${product.fileName}"`,
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer"
    }
  });
}

interface TaxonomyNode { id?: number; name?: string; children?: TaxonomyNode[] }

export async function findPatternTaxonomyId(env: EtsyRuntimeEnv, craft: PatternCraft, store: DigitalStore, fetcher: Fetcher = fetch): Promise<number> {
  const cacheKey = `etsy:taxonomy:pattern:${craft}`;
  const cached = Number(await store.get(cacheKey));
  if (cached > 0) return cached;
  const payload = await etsyRequest<{ results?: TaxonomyNode[] }>(env, "/application/seller-taxonomy/nodes", { authenticated: false }, fetcher);
  const words = TAXONOMY_WORDS[craft];
  let best: { id: number; depth: number } | undefined;
  let fallback: { id: number; depth: number } | undefined;
  const visit = (node: TaxonomyNode, path: string[], depth: number) => {
    const name = String(node.name || "").toLowerCase();
    const trail = [...path, name];
    const inPatterns = trail.some((item) => /\bpatterns?\b/.test(item));
    if (node.id && inPatterns && words.some((word) => name.includes(word)) && (!best || depth > best.depth)) best = { id: node.id, depth };
    if (node.id && /\bpatterns?\b/.test(name) && (!fallback || depth < fallback.depth)) fallback = { id: node.id, depth };
    for (const child of node.children || []) visit(child, trail, depth + 1);
  };
  for (const node of payload.results || []) visit(node, [], 0);
  const chosen = best || fallback;
  if (!chosen) throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy desen kategorisi bulunamadı; ilanı Etsy uygulamasında kategori seçerek tamamlayın.", 400);
  await store.put(cacheKey, String(chosen.id), { expirationTtl: 7 * 24 * 60 * 60 });
  return chosen.id;
}

export async function findKindTaxonomyId(env: EtsyRuntimeEnv, kind: PrintableKind, store: DigitalStore, fetcher: Fetcher = fetch): Promise<number> {
  const cacheKey = `etsy:taxonomy:printable:${kind}`;
  const cached = Number(await store.get(cacheKey));
  if (cached > 0) return cached;
  const payload = await etsyRequest<{ results?: TaxonomyNode[] }>(env, "/application/seller-taxonomy/nodes", { authenticated: false }, fetcher);
  const nodes: Array<{ id: number; name: string; depth: number }> = [];
  const visit = (node: TaxonomyNode, depth: number) => {
    if (node.id) nodes.push({ id: node.id, name: String(node.name || "").toLowerCase(), depth });
    for (const child of node.children || []) visit(child, depth + 1);
  };
  for (const node of payload.results || []) visit(node, 0);
  let chosen: { id: number; depth: number } | undefined;
  for (const word of KIND_TAXONOMY_WORDS[kind]) {
    chosen = nodes.filter((node) => node.name.includes(word)).sort((a, b) => b.depth - a.depth)[0];
    if (chosen) break;
  }
  if (!chosen) throw new EtsyIntegrationError("VALIDATION_FAILED", "Etsy kategorisi bulunamadı; ilanı Etsy uygulamasında kategori seçerek tamamlayın.", 400);
  await store.put(cacheKey, String(chosen.id), { expirationTtl: 7 * 24 * 60 * 60 });
  return chosen.id;
}

export async function createEtsyDigitalDraft(
  env: EtsyRuntimeEnv,
  store: DigitalStore,
  productId: string,
  readMedia: MediaReader,
  fetcher: Fetcher = fetch
) {
  const product = await getDigitalProduct(store, productId);
  if (product.etsy?.listingId && product.etsy.fileUploaded) {
    return { product, listingId: product.etsy.listingId, editUrl: product.etsy.editUrl, alreadyCreated: true };
  }
  const check = validateEtsyListingText(product.listing);
  if (check.issues.some((issue) => !issue.startsWith("Etsy 13 etiket"))) {
    throw new DigitalDeliveryError("VALIDATION_FAILED", `İlan metni Etsy kurallarına uymuyor: ${check.issues.join(" ")}`);
  }
  const shop = await getConnectedShop(env, fetcher);
  const currency = (shop.currencyCode || "USD").toUpperCase();
  const price = currency === "TRY" ? product.prices.try : currency === "USD" ? product.prices.usd : undefined;
  if (!price) throw new DigitalDeliveryError("VALIDATION_FAILED", `Etsy mağazanızın para birimi ${currency}. Bu ürüne ${currency === "TRY" ? "TL" : currency} fiyatı girin.`);
  const taxonomyId = product.kind
    ? await findKindTaxonomyId(env, product.kind, store, fetcher)
    : await findPatternTaxonomyId(env, product.craft || "crochet", store, fetcher);

  let listingId = product.etsy?.listingId;
  if (!listingId) {
    const form = new URLSearchParams({
      quantity: "999",
      title: product.listing.title,
      description: product.listing.description,
      price: price.toFixed(2),
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(taxonomyId),
      is_supply: "true",
      type: "download"
    });
    if (product.listing.tags.length) form.set("tags", product.listing.tags.join(","));
    if (product.listing.materials.length) form.set("materials", product.listing.materials.join(","));
    const created = await etsyRequest<{ listing_id?: number }>(env, `/application/shops/${shop.shopId}/listings`, { method: "POST", form }, fetcher);
    listingId = Number(created.listing_id);
    if (!listingId) throw new EtsyIntegrationError("UPSTREAM_FAILED", "Etsy taslak ilan numarası döndürmedi.", 502);
  }
  const editUrl = `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
  product.etsy = { listingId, editUrl, createdAt: product.etsy?.createdAt || new Date().toISOString(), imagesUploaded: product.etsy?.imagesUploaded || 0, fileUploaded: false };
  await store.put(`${PRODUCT_PREFIX}${product.id}`, JSON.stringify(product));

  try {
    for (const [index, image] of product.images.entries()) {
      if (index < product.etsy.imagesUploaded) continue;
      const bytes = await readMedia(image.key);
      if (!bytes) continue;
      const form = new FormData();
      form.set("image", new Blob([bytes], { type: image.mimeType }), image.key.split("/").at(-1));
      form.set("rank", String(index + 1));
      await etsyRequest(env, `/application/shops/${shop.shopId}/listings/${listingId}/images`, { method: "POST", multipart: form }, fetcher);
      product.etsy.imagesUploaded = index + 1;
    }
    const file = await store.get(`${FILE_PREFIX}${product.id}`, "arrayBuffer");
    if (!file) throw new DigitalDeliveryError("NOT_FOUND", "PDF dosyası depoda bulunamadı.", 404);
    const form = new FormData();
    form.set("file", new Blob([file], { type: "application/pdf" }), product.fileName);
    form.set("name", product.fileName);
    form.set("rank", "1");
    await etsyRequest(env, `/application/shops/${shop.shopId}/listings/${listingId}/files`, { method: "POST", multipart: form }, fetcher);
    product.etsy.fileUploaded = true;
    delete product.etsy.error;
  } catch (error) {
    product.etsy.error = error instanceof Error ? error.message : "Etsy yüklemesi tamamlanamadı.";
    await store.put(`${PRODUCT_PREFIX}${product.id}`, JSON.stringify(product));
    throw error;
  }
  await store.put(`${PRODUCT_PREFIX}${product.id}`, JSON.stringify(product));
  return { product, listingId, editUrl, alreadyCreated: false };
}
