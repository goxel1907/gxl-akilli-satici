import { stageDigitalUpload, stageRemoteSaleFile, type DigitalStore, type MediaWriter } from "./digital-delivery.js";

// Google Drive köprüsü: yapay zekânın ürettiği dosyalar satıcının Drive'ındaki "GXL" klasörüne girer, sunucu onları
// Drive'dan kendisi çeker. Telefon dosya yüklemez, mobil veri harcanmaz. İzin: drive.readonly (yalnız okuma; sunucu
// Drive'da hiçbir şeyi değiştirmez veya silmez). Kişisel (test modundaki) Google uygulamalarında bu izin 7 günde bir
// yeniden onaylanır; uygulama kalan günü gösterir ve hatırlatır. Anahtarlar yalnız Cloudflare'de (GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET) ve KV'de durur; telefona veya sohbete gitmez.
export interface DriveEnv { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }
type Env = DriveEnv & { ETSY_OAUTH?: unknown };
interface DriveTokens { refreshToken: string; accessToken?: string; expiresAt?: number; connectedAt: number; expired?: boolean }
export interface DriveEntry { id: string; name: string; size: number; mimeType: string; role: "file" | "image" | "image_zip" | "skip"; noteTr?: string }

const TOKEN_KEY = "google:drive:tokens";
const STATE_PREFIX = "google:drive:state:";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const RENEW_DAYS = 7;
const DAY = 86_400_000;
export const DRIVE_FOLDER = "GXL";
export class DriveError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

type Store = DigitalStore;
const store = (env: Env) => { if (!env.ETSY_OAUTH) throw new DriveError("STORAGE", "Güvenli depo bağlı değil.", 503); return env.ETSY_OAUTH as Store; };
const readJson = async <T>(kv: Store, key: string): Promise<T | undefined> => { const raw = await kv.get(key); if (!raw) return undefined; try { return JSON.parse(raw) as T; } catch { return undefined; } };
export const redirectUri = (origin: string) => `${origin}/google/oauth/callback`;

export async function driveStatus(env: Env, now = Date.now()) {
  const configured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const tokens = env.ETSY_OAUTH ? await readJson<DriveTokens>(store(env), TOKEN_KEY) : undefined;
  const renewBy = tokens ? tokens.connectedAt + RENEW_DAYS * DAY : undefined;
  const daysLeft = renewBy ? Math.max(0, Math.ceil((renewBy - now) / DAY)) : undefined;
  return {
    configured, connected: Boolean(tokens && !tokens.expired && renewBy! > now), expired: Boolean(tokens && (tokens.expired || renewBy! <= now)),
    ...(tokens ? { connectedAt: new Date(tokens.connectedAt).toISOString(), renewBy: new Date(renewBy!).toISOString(), daysLeft } : {}),
    folder: DRIVE_FOLDER,
    missingTr: [!env.GOOGLE_CLIENT_ID && "GOOGLE_CLIENT_ID", !env.GOOGLE_CLIENT_SECRET && "GOOGLE_CLIENT_SECRET"].filter(Boolean)
  };
}

export async function driveConnectUrl(env: Env, origin: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new DriveError("NOT_CONFIGURED", "Google bağlantısı kurulmamış: Cloudflare'e GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET eklenmeli (uygulamadaki kurulum adımlarına bakın).", 409);
  const state = crypto.randomUUID();
  await store(env).put(`${STATE_PREFIX}${state}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 600 });
  const query = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(origin), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` };
}

async function tokenRequest(env: Env, form: URLSearchParams, fetcher: typeof fetch) {
  form.set("client_id", env.GOOGLE_CLIENT_ID || ""); form.set("client_secret", env.GOOGLE_CLIENT_SECRET || "");
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  const body = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  return { ok: response.ok && Boolean(body.access_token), body };
}

const page = (ok: boolean, message: string) => new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive</title><style>body{font-family:system-ui,sans-serif;background:#F5F2E9;color:#1F2A24;padding:32px;max-width:520px;margin:auto}h1{font-size:22px}p{font-size:16px;line-height:1.5}</style></head><body><h1>${ok ? "Google Drive bağlandı" : "Google Drive bağlanamadı"}</h1><p>${message}</p><p>Bu sayfayı kapatıp GXL uygulamasına dönün.</p></body></html>`, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } });

export async function handleDriveCallback(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return page(false, "İzin verilmedi. Uygulamadan yeniden deneyin ve Google ekranında 'Devam'a basın.");
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  const kv = store(env);
  const record = state ? await readJson<{ createdAt: number }>(kv, `${STATE_PREFIX}${state}`) : undefined;
  if (state) await kv.delete(`${STATE_PREFIX}${state}`);
  if (!record || !code) return page(false, "Bağlantı isteğinin süresi doldu. Uygulamadan yeniden deneyin.");
  const { ok, body } = await tokenRequest(env, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(url.origin) }), fetcher);
  if (!ok || !body.refresh_token) return page(false, "Google erişim anahtarı vermedi. Uygulamadan yeniden deneyin; Google ekranında Drive iznini işaretleyin.");
  await kv.put(TOKEN_KEY, JSON.stringify({ refreshToken: body.refresh_token, accessToken: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 - 60_000, connectedAt: Date.now() } satisfies DriveTokens));
  return page(true, `Drive'daki "${DRIVE_FOLDER}" klasörü artık uygulamaya bağlı. Google bu izni 7 günde bir yeniden onaylatır; uygulama sizi zamanında uyarır.`);
}

async function accessToken(env: Env, fetcher: typeof fetch): Promise<string> {
  const kv = store(env);
  const tokens = await readJson<DriveTokens>(kv, TOKEN_KEY);
  if (!tokens || tokens.expired) throw new DriveError("RECONNECT", "Google Drive bağlı değil ya da haftalık onayın süresi doldu. Uygulamada 'Drive'ı yeniden bağla'ya basın.", 409);
  if (tokens.accessToken && Number(tokens.expiresAt) > Date.now()) return tokens.accessToken;
  const { ok, body } = await tokenRequest(env, new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }), fetcher);
  if (!ok) {
    if (body.error === "invalid_grant") await kv.put(TOKEN_KEY, JSON.stringify({ ...tokens, expired: true }));
    throw new DriveError("RECONNECT", "Google Drive haftalık onayı yenilenmeli. Uygulamada 'Drive'ı yeniden bağla'ya basın (yaklaşık 20 saniye).", 409);
  }
  await kv.put(TOKEN_KEY, JSON.stringify({ ...tokens, accessToken: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 - 60_000 }));
  return body.access_token!;
}

async function driveFetch(env: Env, path: string, fetcher: typeof fetch, init: RequestInit = {}) {
  const token = await accessToken(env, fetcher);
  const response = await fetcher(`https://www.googleapis.com/drive/v3/${path}`, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new DriveError("RECONNECT", "Google Drive onayı geçersiz. Uygulamada 'Drive'ı yeniden bağla'ya basın.", 409);
  if (!response.ok && response.status !== 206) throw new DriveError("DRIVE", `Google Drive isteği tamamlanamadı (kod ${response.status}).`, 502);
  return response;
}

const IMAGE = /\.(jpe?g|png)$/i;
const IMAGE_ZIP = /(listing|images?|gorsel|görsel|mockup|gallery|photos?)[^/]*\.zip$/i;
export function classifyDriveEntry(file: { id: string; name: string; size?: string | number; mimeType?: string }): DriveEntry {
  const size = Number(file.size || 0), name = String(file.name || "");
  const base = { id: String(file.id), name, size, mimeType: String(file.mimeType || "") };
  if (IMAGE.test(name)) return { ...base, role: "image", ...(size > 8 * 1024 * 1024 ? { noteTr: "8 MB'tan büyük; telefon küçültüp gönderir." } : {}) };
  if (/\.zip$/i.test(name) && IMAGE_ZIP.test(name)) return { ...base, role: "image_zip", noteTr: "Görsel paketi; telefon açıp görselleri gönderir." };
  if (/\.(pdf|zip)$/i.test(name)) return size > 20 * 1024 * 1024 ? { ...base, role: "skip", noteTr: `${(size / 1048576).toFixed(1)} MB: Etsy sınırı 20 MB. Yapay zekâdan ikiye bölmesini iste.` } : { ...base, role: "file" };
  return { ...base, role: "skip" };
}

// GXL klasöründeki dosyalar (alt klasörler ve "Yuklendi" hariç), ad sırasıyla.
export async function scanDriveFolder(env: Env, fetcher: typeof fetch = fetch) {
  const folderQuery = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const folders = await (await driveFetch(env, `files?q=${folderQuery}&fields=files(id,name)&pageSize=5`, fetcher)).json() as { files?: Array<{ id: string }> };
  const folderId = folders.files?.[0]?.id;
  if (!folderId) throw new DriveError("NO_FOLDER", `Drive'da "${DRIVE_FOLDER}" adlı klasör yok. Drive'da Yeni → Klasör → "${DRIVE_FOLDER}" oluşturun ve dosyaları oraya kaydedin.`, 404);
  const listQuery = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const listing = await (await driveFetch(env, `files?q=${listQuery}&fields=files(id,name,size,mimeType,modifiedTime)&orderBy=name_natural&pageSize=100`, fetcher)).json() as { files?: Array<{ id: string; name: string; size?: string; mimeType?: string }> };
  const entries = (listing.files || []).map(classifyDriveEntry).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { folderId, entries };
}

// Tek dosya tek istekte alınır (ücretsiz planda istek başına süre kısa): küçük dosya tam denetlenir, büyük satış dosyası
// baş/son aralığıyla denetlenip akışla yazılır, görsel medya deposuna gider.
export async function importDriveFile(env: Env, input: { fileId: string; role: "file" | "image" }, writeMedia: MediaWriter, fetcher: typeof fetch = fetch) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(input.fileId)) throw new DriveError("VALIDATION", "Drive dosya numarası geçersiz.");
  const meta = await (await driveFetch(env, `files/${input.fileId}?fields=id,name,size,mimeType`, fetcher)).json() as { name: string; size?: string; mimeType?: string };
  const size = Number(meta.size || 0), name = String(meta.name || "dosya");
  const media = `files/${input.fileId}?alt=media`;
  const kv = store(env);
  if (input.role === "image" || size <= 2.5 * 1024 * 1024) {
    if (input.role === "image" && size > 8 * 1024 * 1024) throw new DriveError("TOO_BIG", `${name}: 8 MB'tan büyük görsel; telefon küçültüp göndermeli.`);
    const bytes = await (await driveFetch(env, media, fetcher)).arrayBuffer();
    return await stageDigitalUpload(kv, new File([bytes], name, { type: meta.mimeType || "application/octet-stream" }), input.role, writeMedia);
  }
  const range = async (start: number, end: number) => new Uint8Array(await (await driveFetch(env, media, fetcher, { headers: { range: `bytes=${start}-${end}` } })).arrayBuffer());
  return await stageRemoteSaleFile(kv, { name, size }, range, async () => (await driveFetch(env, media, fetcher)).body!);
}

// Büyük görsel ve görsel ZIP'i telefona akışla aktarılır (telefon küçültür / açar); sunucu dosyayı işlemez.
export async function streamDriveFile(env: Env, fileId: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new DriveError("VALIDATION", "Drive dosya numarası geçersiz.");
  const response = await driveFetch(env, `files/${fileId}?alt=media`, fetcher);
  return new Response(response.body, { headers: { "content-type": response.headers.get("content-type") || "application/octet-stream" } });
}

export async function disconnectDrive(env: Env) { await store(env).delete(TOKEN_KEY); return { disconnected: true }; }
