export type LiveCheckStatus = "pending" | "verified" | "warning" | "failed" | "reported" | "skipped";
export interface LiveCheckRow { id: string; labelTr: string; source: "live_read" | "device" | "seller"; status: LiveCheckStatus; detailTr: string; checkedAt?: string; }
export interface LiveEnvironment { appVersion: string; runtimeVersion: string; channel: string; embedded: boolean; updateId?: string; updateCreatedAt?: string; testMode?: "synthetic-web"; }
export interface LiveCheckReport { version: 1; id: string; startedAt: string; finishedAt?: string; productId?: string; state: "running" | "completed" | "cancelled"; environment: LiveEnvironment; checks: LiveCheckRow[]; }
export type LiveReader = (path: string, signal?: AbortSignal) => Promise<any>;
interface ProbeStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>; }
export const LIVE_REPORT_KEY = "gxl.prepublicationLiveCheck.v1";
export const MANUAL_LIVE_CHECKS = [
  ["main_tabs", "Ana sekmeler", "Etsy, Özet, Shopier, Ajan, Onaylar, Müşteriler ve Ürünler’i aç. Basit modda Başla, Sat, Siparişler, Müşteri ve Yardım’ı da dene."],
  ["trend_tabs", "Trend alt sekmeleri", "Dijital, el işi deseni, fiziksel ürün, keşfedilenler ve sezon ekranlarını aç. Boş liste, eski veri ve bağlantı hatasının doğru belirtildiğini kontrol et."],
  ["studio_modes", "Stüdyo ve ürün yolları", "Dijital ürün, kendi desenin ve fotoğraflı ürün yollarını dene. Goxi’nin doğru işi söylediğini ve ürün değişince eski hazırlığın geçersiz olduğunu kontrol et."],
  ["market_match", "Gerçek rakip araştırması", "Kendi hedef aramanla araştır. Kaynak ilanları aç; tür/konu, analiz tarihi, örneklem ve para birimini karşılaştır. Puanı veya favoriyi satış sayma."],
  ["photo_origin", "Fotoğraf ve fiziksel ürün bilgileri", "Gerçek fotoğraflarla ilerle. Köken, malzeme, vintage yılı, ölçü, net tutar ve kargo eksikse doğru uyarı çıkmalı. Bilinmeyen bilgiler doğrulanmış sayılmamalı."],
  ["assistant_handoff", "ChatGPT / Claude’a aktarım", "Paketi seçtiğin asistana gönder. Aynı ürün adı, konu, formatlar ve ilan bilgileriyle doğru sohbete ulaştığını kontrol et. Paylaşım penceresinin açılması yeterli değil."],
  ["assistant_files", "Üretim ve telefona indirme", "Gerçek ürün dosyalarını ve doğru görselleri asistandan indir. Dosyaların telefonda bulunduğunu ve açıldığını kontrol et; yalnız prompt hazırlanmasını üretim sayma."],
  ["content_review", "Ürünün gerçek içeriği", "Her sayfayı ve cevabı oku. Yazım, eksik içerik, sayı, lisans, özgünlük, baskı, bağlantı ve varsa formülleri gerçek dosyalarda dene. Yapısal dosya kontrolü bunların yerini tutmaz."],
  ["upload_metadata", "Dosya yükleme ve ilan bilgileri", "Aynı çalışmadan yüklemeyi aç. Başlık, açıklama, 13 etiket, fiyat, dosyalar ve görsellerin aynı ürüne ait olduğunu kayıttan sonra da karşılaştır."],
  ["resume_retry", "Geri dönüş ve kesilen yükleme", "Başka sekmeye geçip geri dön; uygulamayı kapatıp aç. Çalışmanın korunduğunu kontrol et. Kesilen aktarımda aynı taslaktan devam edildiğini ve kopya ilan oluşmadığını dene."],
  ["draft_review", "Etsy taslağına kadar gerçek deneme", "Gerçek son dosyalarla taslak oluşturmayı onayla. Etsy’de taslağı açıp başlık, açıklama, etiket, fiyat, kategori, görsel sırası, dosyalar ve gerekiyorsa kargo/üretim ortağını kontrol et. Yayınla’ya basma."],
  ["other_channels", "Ajan ve diğer kanallar", "Ajanın güncel kaynak ve eksik bağlantıları doğru anlattığını; Pinterest, Shopier, onaylar ve müşteri ekranlarının gerçek durumu gösterdiğini kontrol et. Mesaj veya pin gönderme."],
  ["device_layout", "Gerçek telefon görünümü", "Küçük ekran, büyük yazı, klavye, geri tuşu, yatay/dikey dönüş ve uzun başlıklarda kesilme, üst üste binme veya veri kaybı olmadığını kontrol et."]
] as const;
const AUTO = [
  ["environment", "Çalışan sürüm ve güncelleme kanalı", "device"], ["device_storage", "Telefonda yerel yaz/oku", "device"],
  ["health", "Canlı sunucu yanıtı", "live_read"], ["app_auth", "Uygulama yetkisi ve katalog okuma", "live_read"],
  ["etsy_connection", "Etsy hesabı ve mağaza bağlantısı", "live_read"], ["shopier_connection", "Shopier bağlantısı (isteğe bağlı)", "live_read"],
  ["readiness", "Etsy hazırlık bilgilerinin okunması", "live_read"], ["trend_board", "Trend tablosunun okunması", "live_read"],
  ["digital_catalog", "Dijital ürün kayıtlarının okunması", "live_read"], ["pinterest_connection", "Pinterest bağlantısı (isteğe bağlı)", "live_read"],
  ["file_picker", "Telefondaki dosya seçici", "device"], ["image_picker", "Telefondaki görsel seçici", "device"]
] as const;
export const LIVE_READ_PATHS = ["/health", "/api/dashboard", "/api/channels/status", "/api/etsy/readiness", "/api/etsy/trends", "/api/digital/products", "/api/pinterest/status"] as const;
export function isLiveReadPath(path: string): boolean { return (LIVE_READ_PATHS as readonly string[]).includes(path) || /^\/api\/digital\/products\/[a-f0-9-]{36}\/qa$/.test(path); }
function safeEnvironment(env: LiveEnvironment): LiveEnvironment {
  const version = (value: string) => /^\d+(?:\.\d+){1,3}$/.test(value) ? value : "unknown";
  return { appVersion: version(env.appVersion), runtimeVersion: version(env.runtimeVersion), channel: ["preview", "production", "development", "web-test"].includes(env.channel) ? env.channel : "unknown", embedded: env.embedded === true,
    ...(env.testMode === "synthetic-web" ? {testMode: "synthetic-web" as const}: {}),
    ...(typeof env.updateId==="string" && /^[a-f0-9-]{36}$/i.test(env.updateId)?{updateId:env.updateId}:{}),
    ...(typeof env.updateCreatedAt==="string" && Number.isFinite(Date.parse(env.updateCreatedAt))?{updateCreatedAt:new Date(env.updateCreatedAt).toISOString()}: {}) };
}
export function newLiveReport(env: LiveEnvironment): LiveCheckReport {
  return { version: 1, id: `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`, startedAt: new Date().toISOString(), state: "running", environment: safeEnvironment(env), checks: [
    ...AUTO.map(([id,labelTr,source]) => ({ id,labelTr,source,status:"pending" as const,detailTr:"Henüz denenmedi." })),
    ...MANUAL_LIVE_CHECKS.map(([id,labelTr]) => ({ id,labelTr,source:"seller" as const,status:"pending" as const,detailTr:"Telefonda gerçek akışla denenmeli." }))
  ] };
}
export function updateLiveRow(report: LiveCheckReport, id: string, status: LiveCheckStatus, detailTr: string): LiveCheckReport {
  return { ...report, checks: report.checks.map(row => row.id === id ? { ...row,status,detailTr,checkedAt:new Date().toISOString() } : row) };
}
export function reportManualResult(report: LiveCheckReport, id: string, status: "reported" | "failed" | "skipped" | "pending"): LiveCheckReport {
  if (!MANUAL_LIVE_CHECKS.some(row => row[0] === id)) return report;
  return updateLiveRow(report,id,status,status === "reported" ? "Satıcı bu adımı telefonda denediğini bildirdi; bağımsız otomatik doğrulama değildir." : status === "failed" ? "Satıcı gerçek denemede hata bildirdi; inceleme gerekli." : status === "skipped" ? "Satıcı bu denemede uygulanmadığını bildirdi; test edilmiş sayılmaz." : "Telefonda gerçek akışla denenmeli.");
}
export function summarizeLiveReport(report: LiveCheckReport) {
  const count = (status: LiveCheckStatus) => report.checks.filter(row => row.status === status).length;
  return { verified:count("verified"),reported:count("reported"),failed:count("failed"),warning:count("warning"),pending:count("pending"),skipped:count("skipped") };
}
function errorDetail(error: unknown): string {
  const status = Number((error as any)?.status), code = String((error as any)?.code || "");
  if (status === 403) return "HTTP 403 erişim reddi. Sunucu, ağ veya yetki kaynaklı olabilir; bu sonuç tek başına sunucunun kapalı olduğunu göstermez.";
  if (status === 401 || ["AUTH_FAILED","NOT_CONNECTED"].includes(code)) return "Yetki veya bağlantı reddedildi; uygulama/Etsy bağlantısını kontrol et.";
  if (status === 429 || code === "RATE_LIMITED") return "İstek sınırına ulaşıldı; daha sonra yeniden dene.";
  return "Canlı yanıt okunamadı veya beklenen yapıda değil. Bu kontrol doğrulanmadı.";
}
export async function runLiveReads(env: LiveEnvironment, request: LiveReader, options: { signal?: AbortSignal; storage?: ProbeStorage; onProgress?: (report: LiveCheckReport)=>void } = {}): Promise<LiveCheckReport> {
  let report = newLiveReport(env);
  const change = (id: string,status: LiveCheckStatus,detail: string) => { report=updateLiveRow(report,id,report.environment.testMode && status==="verified" ? "warning" : status,report.environment.testMode ? `WEB TESTİ: Örnek servis/ortam; gerçek Etsy veya Android doğrulaması değildir. ${detail}` : detail);options.onProgress?.(report); };
  change("environment",report.environment.channel === "unknown" || report.environment.runtimeVersion === "unknown" ? "warning" : "verified",`Sürüm ${report.environment.appVersion}; kanal ${report.environment.channel}; çalışma sürümü ${report.environment.runtimeVersion}. Bu, en yeni güncellemenin kurulu olduğunu kanıtlamaz.`);
  if (options.storage) {
    const key=`gxl.liveQaProbe.${report.id}`;
    try { await options.storage.setItem(key,report.id); if(await options.storage.getItem(key)!==report.id) throw Error("Read mismatch"); change("device_storage","verified","Bu oturumda yerel yazma ve okuma doğrulandı; uygulamayı yeniden açınca kalıcılık ayrıca denenmeli."); }
    catch { change("device_storage","failed","Telefonda yerel yazma/okuma doğrulanamadı."); }
    finally { try {await options.storage.removeItem(key);}catch{change("device_storage",report.checks.find(row=>row.id==="device_storage")?.status==="failed"?"failed":"warning","Yerel yaz/oku ve geçici deneme anahtarının temizlenmesi tam olarak doğrulanamadı.");} }
  }
  const probe = async (path: string,id: string,check: (body:any)=>{status:LiveCheckStatus;detail:string}) => {
    if(options.signal?.aborted) return;
    if(!isLiveReadPath(path)) throw Error("Read path not permitted");
    try { const result=check(await request(path,options.signal));change(id,result.status,result.detail); }
    catch(error) { if(!options.signal?.aborted) change(id,"failed",errorDetail(error)); }
  };
  await probe("/health","health",body=>{if(body?.ok!==true || body.service!=="gxl-akilli-satici")throw Error();return{status:"verified",detail:"Canlı sunucu bu isteğe yanıt verdi. Bu, tüm servislerin çalıştığını tek başına kanıtlamaz."};});
  let authorized=false;
  await probe("/api/dashboard","app_auth",body=>{if(!body?.metrics || !Array.isArray(body.products))throw Error();authorized=true;return{status:"verified",detail:"Uygulama anahtarıyla korunan katalog yanıtı okunabildi; özel katalog verileri rapora eklenmedi."};});
  if(authorized) {
    await probe("/api/channels/status","etsy_connection",body=>{
      if(!body?.etsy || !body?.shopier)throw Error();
      change("shopier_connection",body.shopier.connected===true?"verified":"warning",body.shopier.connected===true?"Shopier bağlantısı bu istekte doğrulandı; ürün yazma/sipariş akışı denenmedi.":"Shopier bağlantısı doğrulanmadı. Etsy akışından ayrı, isteğe bağlı bir kanaldır.");
      const ok=body.etsy.authorized===true && Boolean(body.etsy.shopId || body.etsy.shopReady);
      return {status:ok?"verified":"failed",detail:ok?"Etsy yetkisi ve mağaza kaydı bu istekte okundu; taslak yükleme/yayın henüz denenmedi.":"Etsy yetkisi veya mağaza kaydı doğrulanmadı; taslak akışına geçmeden bağlantıyı kontrol et."};
    });
    await probe("/api/etsy/readiness","readiness",body=>{
      if(!Array.isArray(body?.items) || !body.items.length || !body.items.every((row:any)=>["done","todo","manual","optional"].includes(row?.state)))throw Error();
      const todo=body.items.filter((row:any)=>row.state==="todo").length,manual=body.items.filter((row:any)=>row.state==="manual").length,optional=body.items.filter((row:any)=>row.state==="optional").length;
      return{status:todo||manual||optional?"warning":"verified",detail:`Hazırlık kaydı okundu: ${todo} eksik, ${optional} ürüne göre isteğe bağlı, ${manual} satıcının Etsy’de tamamlayacağı madde. Bu kontrol kimlik/banka işlemlerini onaylamaz.`};
    });
    await probe("/api/etsy/trends","trend_board",body=>{
      if(!Array.isArray(body?.niches) || !Array.isArray(body.groups))throw Error();
      return{status:body.configured===true?"verified":"warning",detail:`Trend tablosu okundu: ${body.niches.length} aday. Yeni bir arama, doğru sıralama veya gerçek satış başarısı bu okumayla doğrulanmış değildir.`};
    });
    await probe("/api/digital/products","digital_catalog",body=>{
      if(!Array.isArray(body?.products))throw Error();
      return{status:"verified",detail:`${body.products.length} dijital ürün kaydı okundu. Dosya içerikleri ayrıca denetlenmeli; ürün adları, linkler ve müşteri bilgileri rapora eklenmedi.`};
    });
    await probe("/api/pinterest/status","pinterest_connection",body=>{
      if(typeof body?.configured!=="boolean" || typeof body.connected!=="boolean")throw Error();
      return{status:body.configured&&body.connected?"verified":"warning",detail:body.configured&&body.connected?"Pinterest bağlantısı okundu; pin gönderimi ve hesabın yayın erişimi denenmedi.":"Pinterest bağlı değil veya ayar eksik. Test pin göndermedi; bu, Etsy ilanı testinden ayrı bir kanaldır."};
    });
  }
  report={...report,state:options.signal?.aborted?"cancelled":"completed",finishedAt:new Date().toISOString()};options.onProgress?.(report);return report;
}
export async function auditLiveProduct(request: LiveReader,id: string,signal?: AbortSignal): Promise<Pick<LiveCheckRow,"status"|"detailTr">> {
  const path=`/api/digital/products/${id}/qa`;
  if(!isLiveReadPath(path)) return{status:"failed",detailTr:"Geçerli ürün kaydı seçilmedi."};
  try { const body=await request(path,signal);if(typeof body?.ok!=="boolean" || !Array.isArray(body.files) || !body.files.length || body.files.length>5 || !body.files.every((row:any)=>typeof row?.ok==="boolean") || !Array.isArray(body.missingFormats) || body.ok && (body.files.some((row:any)=>row.ok!==true || !(row.checks>0) || !(row.entries>0)) || body.missingFormats.length))throw Error();
    const codes=[...new Set(body.files.filter((row:any)=>!row.ok).map((row:any)=>{
      const message=String(row.error||"");
      return /CRC/.test(message)?"ZIP_CRC":/sayfa ölçüsü/.test(message)?"PDF_GEOMETRY":/PDF açılamadı/.test(message)?"PDF_PARSE":/XML/.test(message)?"OFFICE_XML":/ZIP son|merkez dizin|yerel başlık/.test(message)?"ZIP_DIRECTORY":/boyut|sınırı|çok büyük/.test(message)?"FILE_SIZE_LIMIT":/aynı içerik|tekrar/i.test(message)?"DUPLICATE_FILE":"FILE_QA_ERROR";
    }))];
    return{status:body.ok?"verified":"failed",detailTr:`Depodaki ${body.files.length} dosyada yapısal denetim: ${body.files.filter((row:any)=>!row.ok).length} hata, ${body.missingFormats.length} eksik format.${codes.length?` Kodlar: ${codes.join(", ")}.`:""} Cevaplar, formüller, görünüm ve baskı ayrıca denenmeli.`}; }
  catch(error) { return{status:"failed",detailTr:errorDetail(error)}; }
}
export function liveReportText(report: LiveCheckReport): string {
  // Never serialize arbitrary API objects, errors, filenames, URIs or credentials.
  const allowed=new Set([...AUTO.map(row=>row[0]),...MANUAL_LIVE_CHECKS.map(row=>row[0]),"stored_file_qa"]);
  const clean={version:1,id:report.id,startedAt:report.startedAt,finishedAt:report.finishedAt,...(report.productId && /^[a-f0-9-]{36}$/.test(report.productId)?{productId:report.productId}:{}),state:report.state,scope:"prepublication",environment:safeEnvironment(report.environment),summary:summarizeLiveReport(report),note:"Canlı okumalar ve satıcının ayrı bildirimleri. Yayın onayı veya tüm uygulamanın hatasızlığı değildir. Bu kontrol ekranı ilan, mesaj veya pin yayımlamaz; diğer uygulamalardaki eylemler bağımsız doğrulanmadı.",checks:report.checks.filter(row=>allowed.has(row.id as any)).map(row=>({id:row.id,labelTr:row.labelTr,source:row.source,status:row.status,detailTr:row.detailTr,checkedAt:row.checkedAt}))};
  return JSON.stringify(clean,null,2);
}
export function parseLiveReport(raw: string | null): LiveCheckReport | undefined {
  if(!raw || raw.length>80000)return;
  try { const value=JSON.parse(raw);if(value.version!==1 || !/^qa-[a-z0-9-]+$/.test(value.id) || !Number.isFinite(Date.parse(value.startedAt)) || !["running","completed","cancelled"].includes(value.state) || !Array.isArray(value.checks) || value.checks.length>50 || !value.environment)return;
    const known=new Map(newLiveReport(value.environment).checks.map(row=>[row.id,row]));known.set("stored_file_qa",{id:"stored_file_qa",labelTr:"Depodaki seçili ürünün dosya yapısı",source:"live_read",status:"pending",detailTr:""});
    const seen=new Set<string>();
    for(const row of value.checks){const expected=known.get(row.id);if(!expected || seen.has(row.id) || expected.source!==row.source || typeof row.detailTr!=="string" || row.detailTr.length>1000 || !["pending","verified","warning","failed","reported","skipped"].includes(row.status) || expected.source==="seller" && !["pending","reported","failed","skipped"].includes(row.status))return;seen.add(row.id);row.labelTr=expected.labelTr;}
    if([...known.keys()].some(id=>id!=="stored_file_qa"&&!seen.has(id)))return;
    if(value.productId!==undefined && (typeof value.productId!=="string" || !/^[a-f0-9-]{36}$/.test(value.productId)))return;
    return{version:1,id:value.id,startedAt:value.startedAt,finishedAt:value.finishedAt,...(value.productId?{productId:value.productId}:{}),state:value.state,environment:safeEnvironment(value.environment),checks:value.checks};
  }catch{return;}
}
