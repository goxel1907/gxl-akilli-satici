import { unzipSync } from "fflate";

// GXL klasörü: satıcı yapay zekâdan indirdiği ZIP'leri ve ilan görsellerini telefonunda tek bir klasöre koyar
// (ör. İndirilenler/GXL). Uygulama bu klasöre bir kez izin alır, sonra her üründe dosyaları kendisi bulur ve ayırır:
// PDF/ZIP → satılacak dosya, JPG/PNG → ilan görseli (adına göre sıralı). İlan görselleri tek ZIP'te geldiyse
// (ör. listing-images.zip) uygulama ZIP'i telefonda açar. Yüklenenler "Yuklendi" alt klasörüne taşınır.
// Dosya sistemi modülü uygulamanın içinde (Expo) gelir; yoksa özellik gizlenir, eski seçiciler çalışır.
let FS: any;
try { FS = require("expo-file-system/legacy"); } catch { FS = undefined; }

export const GXL_FOLDER_KEY = "gxl.folderUri";
export interface FolderAsset { uri: string; name: string; fileName: string; size?: number; mimeType: string; source: string }
export interface FolderScan { files: FolderAsset[]; images: FolderAsset[]; notesTr: string[] }

// Klasör izni (Storage Access Framework) yalnız Android'de vardır; modül yoksa özellik gizlenir.
export const folderSupported = () => Boolean(FS?.StorageAccessFramework?.requestDirectoryPermissionsAsync);

export async function chooseFolder(): Promise<string | undefined> {
  const saf = FS.StorageAccessFramework;
  const initial = typeof saf.getUriForDirectoryInRoot === "function" ? saf.getUriForDirectoryInRoot("Download") : undefined;
  const result = await saf.requestDirectoryPermissionsAsync(initial);
  return result?.granted ? result.directoryUri as string : undefined;
}

// "content://…/document/primary%3ADownload%2FGXL%2Fplanner.zip" → "planner.zip"
export function entryName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  return decoded.split(/[/:]/).filter(Boolean).at(-1) || "dosya";
}
const IMAGE = /\.(jpe?g|png)$/i;
const SALE = /\.(pdf|zip)$/i;
// Görsel paketi ZIP'i (satılacak dosya değil): adında listing/images/görsel geçer ya da içi yalnız görseldir.
const IMAGE_ZIP = /(listing|images?|gorsel|görsel|mockup|gallery|photos?)[^/]*\.zip$/i;
export const byNaturalName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

async function sizeOf(uri: string): Promise<number | undefined> {
  try { const info = await FS.getInfoAsync(uri, { size: true }); return typeof info?.size === "number" ? info.size : undefined; } catch { return undefined; }
}

// Görsel ZIP'ini telefonda açar; görseller önbelleğe yazılır (adı korunur, sıralama bozulmaz).
export async function unzipImages(uri: string, label: string): Promise<FolderAsset[]> {
  const base64: string = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
  const bytes = Uint8Array.from(globalThis.atob(base64), (char) => char.charCodeAt(0));
  const entries = unzipSync(bytes, { filter: (file) => IMAGE.test(file.name) && !/(^|\/)(__MACOSX|\.)/.test(file.name) });
  const folder = `${FS.cacheDirectory}gxl-${Date.now()}/`;
  await FS.makeDirectoryAsync(folder, { intermediates: true });
  const out: FolderAsset[] = [];
  for (const [path, data] of Object.entries(entries)) {
    const name = path.split("/").at(-1)!;
    let binary = ""; for (let index = 0; index < data.length; index += 0x8000) binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
    const target = `${folder}${name}`;
    await FS.writeAsStringAsync(target, globalThis.btoa(binary), { encoding: FS.EncodingType.Base64 });
    out.push({ uri: target, name, fileName: name, size: data.length, mimeType: /\.png$/i.test(name) ? "image/png" : "image/jpeg", source: label });
  }
  return out;
}

export async function scanFolder(folderUri: string): Promise<FolderScan> {
  const entries: string[] = await FS.StorageAccessFramework.readDirectoryAsync(folderUri);
  const files: FolderAsset[] = [], images: FolderAsset[] = [], notesTr: string[] = [];
  for (const uri of entries) {
    const name = entryName(uri);
    if (/^yuklendi$/i.test(name)) continue;
    if (IMAGE.test(name)) { images.push({ uri, name, fileName: name, size: await sizeOf(uri), mimeType: /\.png$/i.test(name) ? "image/png" : "image/jpeg", source: name }); continue; }
    if (!SALE.test(name)) continue;
    const size = await sizeOf(uri);
    if (/\.zip$/i.test(name) && IMAGE_ZIP.test(name)) {
      try {
        const opened = await unzipImages(uri, name);
        if (opened.length) { images.push(...opened); notesTr.push(`${name} görsel paketi telefonda açıldı: ${opened.length} görsel.`); continue; }
      } catch { notesTr.push(`${name} açılamadı; görselleri ZIP'ten çıkarıp klasöre koy.`); continue; }
    }
    if (size && size > 20 * 1024 * 1024) { notesTr.push(`${name} ${(size / 1048576).toFixed(1)} MB: Etsy sınırı 20 MB. Yapay zekâdan bu ZIP'i ikiye bölmesini iste.`); continue; }
    files.push({ uri, name, fileName: name, size, mimeType: /\.zip$/i.test(name) ? "application/zip" : "application/pdf", source: name });
  }
  files.sort(byNaturalName); images.sort(byNaturalName);
  if (files.length > 5) notesTr.push(`Klasörde ${files.length} satış dosyası var; Etsy 5 dosya alır. İlk 5 tanesi seçildi, fazlasını tek ZIP'te birleştir.`);
  if (images.length > 10) notesTr.push(`Klasörde ${images.length} görsel var; Etsy 10 görsel alır, ilk 10 tanesi (ad sırasıyla) seçildi.`);
  if (!files.length) notesTr.push("Klasörde PDF veya ZIP bulunamadı. Yapay zekâdan indirdiğin satış dosyalarını bu klasöre koy.");
  if (!images.length) notesTr.push("Klasörde ilan görseli bulunamadı (JPG/PNG ya da listing-images.zip).");
  return { files: files.slice(0, 5), images: images.slice(0, 10), notesTr };
}

// Yüklenen dosyalar "Yuklendi" klasörüne taşınır; bir sonraki ürün karışmaz. Taşınamazsa dosyalar yerinde kalır.
export async function archiveUploaded(folderUri: string, uris: string[]): Promise<number> {
  const saf = FS?.StorageAccessFramework;
  if (!saf?.moveAsync) return 0;
  let done = 0;
  try {
    const entries: string[] = await saf.readDirectoryAsync(folderUri);
    const existing = entries.find((uri) => /^yuklendi$/i.test(entryName(uri)));
    const target = existing || await saf.makeDirectoryAsync(folderUri, "Yuklendi");
    for (const uri of uris.filter((item) => item.startsWith("content://"))) {
      try { await saf.moveAsync({ from: uri, to: target }); done += 1; } catch { /* dosya yerinde kalır */ }
    }
  } catch { /* klasör yazılamıyorsa dokunulmaz */ }
  return done;
}

// Drive'daki büyük görsel ve görsel paketi telefona sunucu üzerinden indirilir (telefon küçültür/açar).
export async function downloadToCache(url: string, headers: Record<string, string>, name: string): Promise<string> {
  if (!FS?.downloadAsync) throw new Error("Bu telefonda dosya indirme desteklenmiyor; görselleri GXL klasörüne koy.");
  const target = `${FS.cacheDirectory}gxl-drive-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  const result = await FS.downloadAsync(url, target, { headers });
  if (result?.status && result.status >= 400) throw new Error(`${name} Drive'dan indirilemedi (kod ${result.status}).`);
  return result?.uri || target;
}
