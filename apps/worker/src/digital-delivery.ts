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

export interface DigitalFile {
  name: string;
  size: number;
  mimeType: "application/pdf" | "application/zip";
}

export interface DigitalProduct {
  id: string;
  name: string;
  craft?: PatternCraft;
  kind?: PrintableKind;
  productType: string;
  // İlk dosya (geriye uyum için ayrıca fileName/fileSize olarak da tutulur).
  fileName: string;
  fileSize: number;
  // Etsy dijital ilana en fazla 5 dosya eklenebilir: her format ayrı PDF, fazlası ZIP.
  files?: DigitalFile[];
  images: DigitalImage[];
  listing: { title: string; description: string; tags: string[]; materials: string[] };
  pins?: Array<{ title: string; description: string; overlay?: string }>;
  prices: { usd?: number; try?: number };
  flags: { aiAssisted: boolean; photosAreRenders: boolean; testMade: boolean };
  etsy?: { listingId: number; editUrl: string; createdAt: string; imagesUploaded: number; fileUploaded: boolean; filesUploaded?: number; error?: string };
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
  // Çok dosyalı üründe indirme hakkı dosya başınadır; downloads en çok indirilen dosyanın sayısıdır.
  fileDownloads?: number[];
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
const MAX_FILES = 5;
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

function safeFileName(value: string, fallback: string, extension = "pdf"): string {
  const base = value.replace(/\.(pdf|zip)$/i, "").normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base || fallback}.${extension}`;
}

// İlanda vaat edilen formatların dosyalarda gerçekten olduğunu doğrulamak için dosya adından format çıkarılır.
type FormatId = "letter" | "a4" | "a5" | "half_letter" | "tablet" | "bw";
const FORMAT_LABELS: Record<FormatId, string> = { letter: "US Letter", a4: "A4", a5: "A5", half_letter: "Half Letter", tablet: "Tablet", bw: "Black & white" };

function formatOfText(value: string): FormatId | undefined {
  const text = value.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/\b(bw|b w|black|grayscale|greyscale|printer friendly|ink saving)\b/.test(text)) return "bw";
  if (/half ?letter|\bhl\b/.test(text)) return "half_letter";
  if (/tablet|hyperlink|ipad|goodnotes/.test(text)) return "tablet";
  if (/\ba4\b/.test(text)) return "a4";
  if (/\ba5\b/.test(text)) return "a5";
  if (/\bletter\b/.test(text)) return "letter";
  return undefined;
}

// "• Formats: US Letter, A4, ..." satırındaki vaatler; satır yoksa (ör. desenler) kontrol atlanır.
export function claimedFormats(description: string): FormatId[] {
  const line = description.split("\n").find((item) => /^\W*formats?\s*:/i.test(item.trim()));
  if (!line) return [];
  const items = line.replace(/^\W*formats?\s*:/i, "").split(/,(?![^()]*\))/);
  return [...new Set(items.map((item) => formatOfText(item)).filter((item): item is FormatId => Boolean(item)))];
}

// ZIP'in merkez dizininden dosya adları okunur (açmadan, yalnız dosya sonundaki dizin).
export function zipEntryNames(bytes: ArrayBuffer): string[] {
  const view = new DataView(bytes);
  const data = new Uint8Array(bytes);
  for (let end = data.length - 22; end >= Math.max(0, data.length - 65_557); end -= 1) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const names: string[] = [];
    for (let index = 0; index < count && offset + 46 <= data.length; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      names.push(new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength)));
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return names.filter((name) => !name.endsWith("/"));
  }
  return [];
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fileKey(productId: string, index: number): string {
  return index === 0 ? `${FILE_PREFIX}${productId}` : `${FILE_PREFIX}${productId}:${index}`;
}

export function productFiles(product: DigitalProduct): DigitalFile[] {
  return product.files?.length ? product.files : [{ name: product.fileName, size: product.fileSize, mimeType: "application/pdf" }];
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

  // "files" alanı birden çok PDF/ZIP taşır; eski uygulama sürümleri tek "pdf" alanı gönderir.
  const uploads = [...form.getAll("files"), ...form.getAll("pdf")].filter((item): item is File => typeof item !== "string");
  if (!uploads.length) throw new DigitalDeliveryError("VALIDATION_FAILED", "PDF dosyası seçilmedi.");
  if (uploads.length > MAX_FILES) throw new DigitalDeliveryError("VALIDATION_FAILED", "Etsy bir dijital ilana en fazla 5 dosya kabul eder. Fazla formatları bir ZIP dosyasında birleştirin.");
  const files: DigitalFile[] = [];
  const fileBytes: ArrayBuffer[] = [];
  const usedNames = new Set<string>();
  for (const upload of uploads) {
    if (upload.size < 1_024 || upload.size > MAX_PDF_BYTES) throw new DigitalDeliveryError("VALIDATION_FAILED", `${upload.name || "Dosya"}: her dosya 1 KB ile 20 MB arasında olmalıdır.`);
    const bytes = await upload.arrayBuffer();
    const head = new Uint8Array(bytes, 0, 5);
    const isPdf = startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    const isZip = startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
    if (!isPdf && !isZip) throw new DigitalDeliveryError("VALIDATION_FAILED", `${upload.name || "Dosya"} geçerli bir PDF veya ZIP değil.`);
    let fileName = safeFileName(upload.name || name, kind ? "printable" : "pattern", isPdf ? "pdf" : "zip");
    for (let copy = 2; usedNames.has(fileName.toLowerCase()); copy += 1) fileName = fileName.replace(/(-\d+)?\.(pdf|zip)$/, `-${copy}.$2`);
    usedNames.add(fileName.toLowerCase());
    files.push({ name: fileName, size: bytes.byteLength, mimeType: isPdf ? "application/pdf" : "application/zip" });
    fileBytes.push(bytes);
  }
  // Kalite kapısı: aynı dosya iki kez yüklenmez; ilanda yazan her format dosyalarda (veya ZIP içinde) bulunur.
  const hashes = await Promise.all(fileBytes.map((bytes) => sha256(bytes)));
  const duplicate = hashes.findIndex((hash, index) => hashes.indexOf(hash) !== index);
  if (duplicate >= 0) throw new DigitalDeliveryError("VALIDATION_FAILED", `${files[duplicate].name} ile ${files[hashes.indexOf(hashes[duplicate])].name} aynı dosya. Her format ayrı dosya olmalı.`);
  const claimed = claimedFormats(listing.description);
  if (claimed.length) {
    const covered = new Set<FormatId>();
    files.forEach((file, index) => {
      const names = file.mimeType === "application/zip" ? zipEntryNames(fileBytes[index]) : [file.name];
      for (const entry of names) {
        const format = formatOfText(entry);
        if (format) covered.add(format);
      }
    });
    const missing = claimed.filter((format) => !covered.has(format));
    if (missing.length) {
      throw new DigitalDeliveryError("VALIDATION_FAILED", `İlan açıklaması şu formatları vaat ediyor ama dosyalarda yok: ${missing.map((format) => FORMAT_LABELS[format]).join(", ")}. Eksik dosyayı ekleyin (dosya adında format geçsin, ör. Planner-US-Letter.pdf) ya da açıklamadaki "Formats" satırını düzeltin.`);
    }
  }

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
    fileName: files[0].name,
    fileSize: files[0].size,
    files,
    images,
    listing,
    ...(pins.length ? { pins } : {}),
    prices: { usd: positivePrice(prices.usd), try: positivePrice(prices.try) },
    flags: { aiAssisted: flags.aiAssisted !== false, photosAreRenders: flags.photosAreRenders !== false, testMade: flags.testMade === true },
    createdAt: new Date().toISOString()
  };
  for (const [index, bytes] of fileBytes.entries()) await store.put(fileKey(product.id, index), bytes);
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

function fileDownloads(grant: DownloadGrant, index: number): number {
  return grant.fileDownloads ? grant.fileDownloads[index] || 0 : index === 0 ? grant.downloads : 0;
}

function grantProblem(grant: DownloadGrant | undefined, now: number, fileCount = 1, fileIndex?: number): string | undefined {
  if (!grant) return "Bu indirme bağlantısı geçersiz. / This download link is not valid.";
  if (grant.revoked) return "Bu bağlantı satıcı tarafından kapatıldı. / This link was closed by the seller.";
  if (Date.parse(grant.expiresAt) <= now) return "Bu bağlantının süresi doldu. / This link has expired.";
  const used = fileIndex === undefined
    ? Math.min(...Array.from({ length: fileCount }, (_, index) => fileDownloads(grant, index)))
    : fileDownloads(grant, fileIndex);
  if (used >= grant.maxDownloads) return "İndirme hakkı doldu. / The download limit has been reached.";
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
  const product = grant ? await readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${grant.productId}`) : undefined;
  const files = product ? productFiles(product) : [];
  const problem = grantProblem(grant, now, Math.max(1, files.length));
  if (problem || !grant) return page("İndirme bağlantısı", `<h1>İndirme bağlantısı</h1><p>${escapeHtml(problem || "")}</p><small>Sorun yaşıyorsanız satıcıyla sipariş numaranızla iletişime geçin.</small>`, problem?.includes("geçersiz") ? 404 : 410);
  const expires = new Date(grant.expiresAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  const buttons = (files.length ? files : [{ name: "PDF", size: 0, mimeType: "application/pdf" as const }]).map((file, index) => {
    const remaining = Math.max(0, grant.maxDownloads - fileDownloads(grant, index));
    const href = `/d/${encodeURIComponent(grant.id)}/file${index ? `/${index}` : ""}`;
    return remaining > 0
      ? `<a class="button" href="${href}">${escapeHtml(file.name)} · indir / download (${remaining})</a>`
      : `<p><small>${escapeHtml(file.name)}: indirme hakkı doldu / download limit reached</small></p>`;
  }).join("");
  return page(product?.name || "Dijital ürün", `<h1>${escapeHtml(product?.name || "Dijital ürün")}</h1><p>Bu bağlantı yalnızca <strong>${escapeHtml(grant.orderRef)}</strong> numaralı sipariş içindir. Lütfen paylaşmayın.</p><p>Her dosya <strong>${grant.maxDownloads}</strong> kez indirilebilir · Son gün: <strong>${escapeHtml(expires)}</strong></p>${buttons}<p><small>This link belongs to one paid order. Each file can be downloaded ${grant.maxDownloads} times. The files are licensed for personal use only.</small></p>`);
}

export async function grantDownload(store: DigitalStore, grantId: string, now = Date.now(), fileIndex = 0): Promise<Response> {
  const grant = await readJson<DownloadGrant>(store, `${GRANT_PREFIX}${grantId}`);
  const product = grant ? await readJson<DigitalProduct>(store, `${PRODUCT_PREFIX}${grant.productId}`) : undefined;
  const files = product ? productFiles(product) : [];
  const problem = grantProblem(grant, now, Math.max(1, files.length), fileIndex);
  if (problem || !grant) return page("İndirme bağlantısı", `<h1>İndirme yapılamadı</h1><p>${escapeHtml(problem || "")}</p>`, problem?.includes("geçersiz") ? 404 : 410);
  const meta = files[fileIndex];
  const file = product && meta ? await store.get(fileKey(product.id, fileIndex), "arrayBuffer") : null;
  if (!product || !meta || !file) return page("İndirme bağlantısı", "<h1>Dosya bulunamadı</h1><p>Satıcıyla iletişime geçin.</p>", 404);
  const counts = Array.from({ length: files.length }, (_, index) => fileDownloads(grant, index));
  counts[fileIndex] += 1;
  grant.fileDownloads = counts;
  grant.downloads = Math.max(...counts);
  grant.lastDownloadAt = new Date(now).toISOString();
  const ttl = Math.max(60, Math.round((Date.parse(grant.expiresAt) - now + 30 * DAY_MS) / 1000));
  await store.put(`${GRANT_PREFIX}${grant.id}`, JSON.stringify(grant), { expirationTtl: ttl });
  return new Response(file, {
    headers: {
      "content-type": meta.mimeType,
      "content-disposition": `attachment; filename="${meta.name}"`,
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
  product.etsy = { listingId, editUrl, createdAt: product.etsy?.createdAt || new Date().toISOString(), imagesUploaded: product.etsy?.imagesUploaded || 0, fileUploaded: false, filesUploaded: product.etsy?.filesUploaded || 0 };
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
    // Tüm dosyalar sırayla ilana eklenir; yarıda kalırsa bir sonraki denemede kaldığı dosyadan devam eder.
    for (const [index, meta] of productFiles(product).entries()) {
      if (index < (product.etsy.filesUploaded || 0)) continue;
      const file = await store.get(fileKey(product.id, index), "arrayBuffer");
      if (!file) throw new DigitalDeliveryError("NOT_FOUND", `${meta.name} depoda bulunamadı.`, 404);
      const form = new FormData();
      form.set("file", new Blob([file], { type: meta.mimeType }), meta.name);
      form.set("name", meta.name);
      form.set("rank", String(index + 1));
      await etsyRequest(env, `/application/shops/${shop.shopId}/listings/${listingId}/files`, { method: "POST", multipart: form }, fetcher);
      product.etsy.filesUploaded = index + 1;
    }
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
