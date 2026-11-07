// @ts-ignore Metro requires extensionless imports; root NodeNext expects explicit JS extensions.
import { generationKey, parsePrintableWorkspace, type PrintableWorkspace } from "./workflow-state";
// @ts-ignore Same Metro / NodeNext resolution boundary as above.
import { etsyTransferComplete } from "./listing-progress";

export const PRODUCTION_TRACKER_KEY = "gxl.productionTracker.v1";
export const PRODUCTION_STAGES = {
  package_ready: "Paket hazır", status_unknown: "Önceki çalışmanın üretim aşaması belirtilmedi", share_opened: "Paylaşım açıldı; gönderim onayı bekleniyor",
  generating: "Asistanda üretim sürüyor", product_files: "Ürün dosyaları hazırlanıyor",
  listing_images: "İlan görselleri hazırlanıyor", qa_review: "Kalite kontrolü / düzeltme",
  files_ready: "Asistan son dosyaları hazır bildirdi", downloaded: "Telefonuma indirdim",
  uploaded: "Dosyalar uygulamaya yüklendi", draft: "Etsy taslağı / son kontrol",
  published: "Etsy yayını doğrulandı"
} as const;
export type ProductionStage = keyof typeof PRODUCTION_STAGES;
export const EXTERNAL_STAGES: ProductionStage[] = ["generating","product_files","listing_images","qa_review","files_ready","downloaded"];
export interface ProductionRecord {
  id: string; workspace: PrintableWorkspace; stage: ProductionStage; updatedAt: string;
  source: "app" | "seller" | "assistant"; productId?: string; listingId?: number;
  etsyState?: string; checkedAt?: string;
  history: Array<{ stage: ProductionStage; at: string; source: "app" | "seller" | "assistant" }>;
}
export function productionId(workspace: PrintableWorkspace): string {
  return workspace.plan.handoff?.id || `local:${generationKey([workspace.input.kind,workspace.input.productType,workspace.plan.brief.name] as any)}`;
}
export function readProductionRecords(raw: string | null): ProductionRecord[] {
  if (!raw || raw.length > 20_000_000) return [];
  try {
    const value=JSON.parse(raw); if(value.version!==1 || !Array.isArray(value.records) || value.records.length>50)return [];
    return value.records.filter((row:any)=>row && parsePrintableWorkspace(JSON.stringify(row.workspace)) && row.id===productionId(row.workspace) && Object.hasOwn(PRODUCTION_STAGES,row.stage) && ["app","seller","assistant"].includes(row.source) && Number.isFinite(Date.parse(row.updatedAt)) && Array.isArray(row.history) && row.history.every((item:any)=>item && Object.hasOwn(PRODUCTION_STAGES,item.stage) && Number.isFinite(Date.parse(item.at)) && ["app","seller","assistant"].includes(item.source)));
  } catch { return []; }
}
export function rememberProduction(rows: ProductionRecord[], workspace: PrintableWorkspace, now=new Date().toISOString()): ProductionRecord[] {
  const id=productionId(workspace),existing=rows.find(row=>row.id===id);
  if(existing)return rows.map(row=>row.id===id?{...row,workspace}:row);
  if(rows.length>=50)throw new Error("50 çalışma kaydı doldu. Yeni ürün hazırlamadan önce mevcut çalışmalarınızı tamamlayın.");
  return [{id,workspace,stage:"package_ready",source:"app",updatedAt:now,history:[{stage:"package_ready",at:now,source:"app"}]} as ProductionRecord,...rows];
}
export function changeProduction(rows:ProductionRecord[],id:string,stage:ProductionStage,source:ProductionRecord["source"],now=new Date().toISOString()):ProductionRecord[]{
  if(!Object.hasOwn(PRODUCTION_STAGES,stage) || source!=="app"&&!EXTERNAL_STAGES.includes(stage))throw new Error("Bu aşama uygulama sonucu ile doğrulanmalıdır.");
  return rows.map(row=>{
    if(row.id!==id)return row;
    if(row.productId && EXTERNAL_STAGES.includes(stage))throw new Error("Dosyalar yüklenmiş. Ürün kaydındaki denetim ve Etsy adımlarından devam edin.");
    if(row.stage===stage&&row.source===source)return row;
    return {...row,stage,source,updatedAt:now,history:[...row.history,{stage,at:now,source}].slice(-30)};
  });
}
export function syncProductionProduct(rows:ProductionRecord[],product:any,status?:{state:string;checkedAt:string;listingId?:number},invalidateStatus=false):ProductionRecord[]{
  if(!product?.id)return rows;
  return rows.map(row=>{
    const sameId=product.handoff?.id && product.handoff.id===row.workspace.plan.handoff?.id;
    const legacy=!product.handoff?.id&&!row.workspace.plan.handoff?.id && product.name===row.workspace.plan.brief.name && product.kind===row.workspace.input.kind && product.productType===row.workspace.input.productType;
    if(!sameId&&!legacy && row.productId!==product.id)return row;
    const complete=etsyTransferComplete({phase:"saved",files:product.files?.length || (product.fileName?1:0),images:product.images?.length || 0,etsy:product.etsy});
    const listingId=product.etsy?.listingId;
    const verified=status && listingId && (!status.listingId || status.listingId===listingId) && Number.isFinite(Date.parse(status.checkedAt));
    const keep=!invalidateStatus && row.listingId===listingId;
    const etsyState=verified?status.state:keep?row.etsyState:undefined;
    const checkedAt=verified?status.checkedAt:keep?row.checkedAt:undefined;
    const stage:ProductionStage=complete && etsyState==="active"?"published":listingId?"draft":"uploaded";
    const next={...row,productId:product.id,listingId,etsyState,checkedAt};
    if(stage===row.stage)return next;
    const at=new Date().toISOString();return {...next,stage,source:"app" as const,updatedAt:at,history:[...row.history,{stage,at,source:"app" as const}].slice(-30)};
  });
}
export function parseProductionReceipt(raw:string,record:ProductionRecord):ProductionStage {
  if(raw.length>5000)throw new Error("Yalnız kısa GXL durum JSON’unu yapıştırın.");
  let receipt:any;try{receipt=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""));}catch{throw new Error("Geçerli GXL durum JSON’u bulunamadı.");}
  const value=receipt.GXL_PROGRESS;
  if(!value || value.projectId!==record.id || value.productName!==record.workspace.plan.brief.name)throw new Error("Bu durum başka bir ürüne ait. Aynı ürünün durum metnini kullanın.");
  if(!EXTERNAL_STAGES.includes(value.stage)||value.stage==="downloaded")throw new Error("Asistan yalnız kendi üretim aşamasını bildirebilir; indirme, yükleme veya yayın doğrulaması yapamaz.");
  return value.stage;
}
export function productionTrackingPrompt(record:ProductionRecord):string {
  return `\n\n## GXL production tracking\nProject ID: ${JSON.stringify(record.id)}\nExact product name: ${JSON.stringify(record.workspace.plan.brief.name)}\nAt the end of each actual completed reply, append a separate copyable JSON block: {"GXL_PROGRESS":{"projectId":${JSON.stringify(record.id)},"productName":${JSON.stringify(record.workspace.plan.brief.name)},"stage":"product_files"}}. Use only generating, product_files, listing_images, qa_review or files_ready to reflect actual current progress. files_ready requires all promised final files, images and QA evidence; otherwise report the unfinished stage. This is a self-report, not app verification. Explain in Turkish that the seller can paste this block into Goxi using 'Sohbet durumunu içe aktar'. Never claim Goxi automatically received it, files were downloaded or uploaded, or an Etsy listing was published. Keep all buyer-facing content in American English.`;
}
export function productionContinuation(record:ProductionRecord):string {
  return `Bu yeni ürün isteği değil. Aynı sohbette ${JSON.stringify(record.workspace.plan.brief.name)} ürününe kaldığımız yerden devam et. Goxi’de son bildirilen aşama: ${PRODUCTION_STAGES[record.stage]}. Önce bu sohbette gerçekten tamamlanan işleri ve eksikleri Türkçe belirt. Ürün adını, başlığı, açıklamayı, 13 etiketi, fiyatı ve kapsamı değiştirme; yeni isim üretme. Sonraki eksik işi tamamla. Önceki üretim bağlamı bu sohbette yoksa tahmin etme; benden Goxi’deki mevcut ürün paketini iste.\n${productionTrackingPrompt(record)}`;
}
