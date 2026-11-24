interface LocalFile { uri: string; name?: string; fileName?: string; mimeType?: string; file?: Blob; }

// Satış dosyası 4 MB'lık ham parçalarla gönderilir (sunucunun istek başına işlem süresi kısa; 20 MB'lık tek istek düşüyordu).
// Her parça gerekirse iki kez yeniden denenir; son parçanın yanıtı yükleme parçasının numarasını verir.
export const CHUNK_BYTES = 4 * 1024 * 1024;
const randomId = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
export async function uploadInChunks(asset: LocalFile, options: { apiUrl: string; headers: Record<string, string>; name: string; onProgress?: (part: number, total: number) => void; fetcher?: typeof fetch }): Promise<{ id: string; name: string; size: number }> {
  const send = options.fetcher || fetch;
  const blob = asset.file || await (await send(asset.uri)).blob();
  const size = blob.size;
  if (!size) throw new Error("Seçilen dosya boş.");
  if (size > 20 * 1024 * 1024) throw new Error(`${(size / 1048576).toFixed(1)} MB: Etsy dijital dosya sınırı 20 MB. Yapay zekâdan bu ZIP'i ikiye bölmesini iste.`);
  const total = Math.ceil(size / CHUNK_BYTES), upload = randomId();
  let last: any;
  for (let index = 0; index < total; index += 1) {
    options.onProgress?.(index + 1, total);
    const query = `upload=${upload}&index=${index}&total=${total}&size=${size}&name=${encodeURIComponent(options.name)}&confirm=true`;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await send(`${options.apiUrl}/api/digital/upload-chunk?${query}`, { method: "POST", headers: { ...options.headers, "content-type": "application/octet-stream" }, body: blob.slice(index * CHUNK_BYTES, Math.min(size, (index + 1) * CHUNK_BYTES)) });
        const body = await response.json().catch(() => ({})) as any;
        if (response.ok) { last = body; break; }
        const error = Object.assign(new Error(body.error || `Sunucu parçayı alamadı (kod ${response.status}).`), { status: response.status });
        if (response.status < 500 || attempt >= 2) throw error;
      } catch (error: any) {
        if (error?.status && error.status < 500 || attempt >= 2) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  if (!last?.id) throw new Error("Dosya yüklemesi doğrulanamadı.");
  return last;
}

/** React Native accepts a URI descriptor; browsers require actual file bytes. */
export async function appendLocalFile(form: FormData, field: string, asset: LocalFile, name: string, type: string): Promise<void> {
  if (typeof document !== "undefined") {
    let file=asset.file;
    if(!file){const response=await fetch(asset.uri);if(!response.ok)throw Error("Seçilen dosya okunamadı.");file=await response.blob();}
    if(!file.size)throw Error("Seçilen dosya boş.");
    form.append(field,file.type?file:new Blob([file],{type}),name);
  } else form.append(field,{uri:asset.uri,name,type} as any);
}
