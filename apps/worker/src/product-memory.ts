import type { PrintableKind } from "./etsy-trends.js";
export interface IdeaStore { get(key: string): Promise<string | null>; put(key: string,value: string): Promise<void>; }
export interface PriorProduct { kind: string; keyword: string; productType: string; name: string; title?: string; direction?: string; pageCount?: number; createdAt: string; state: "prepared" | "saved" | "etsy_record"; }
const KEY = "studio:product-memory:v1";
const GENERIC = new Set("a an the and for of with printable printables digital download instant pdf us letter a4 a5 template templates page pages game games party card cards journal planner calendar coloring colour coloringbook art wall wallpaper icon icons spreadsheet worksheets worksheet stickers sticker labels label print prints kit pack bundle set book sheets sheet recipe resume greeting invitation invitations".split(" "));
const words=(value:string)=>value.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(Boolean).map(word=>word.length>3?word.replace(/s$/,""):word);
export function ideaKey(kind:string, query:string):string { return `${kind}:${[...new Set(words(query).filter(word=>!GENERIC.has(word)))].sort().join(" ") || words(query).sort().join(" ")}`; }
export function topicKey(query:string):string { return ideaKey("",query).slice(1); }
async function read(store: IdeaStore, key:string):Promise<any> { const raw=await store.get(key); if(!raw)return undefined; try{return JSON.parse(raw);}catch{throw new Error("Ürün geçmişi okunamadı; tekrar kontrolü yapılmadan yeni öneri oluşturulmadı.");} }
export async function readProductMemory(store?: IdeaStore):Promise<PriorProduct[]> {
  if(!store)return [];
  const stored=await read(store,KEY);
  if(stored!==undefined&&!Array.isArray(stored))throw new Error("Ürün geçmişi geçersiz.");
  const history:PriorProduct[]=(stored || []).filter((row:any)=>row&&typeof row.kind==="string"&&typeof row.keyword==="string"&&typeof row.name==="string").slice(0,300);
  const index=await read(store,"digital:index");
  if(index!==undefined&&!Array.isArray(index))throw new Error("Dijital ürün geçmişi geçersiz.");
  for(const id of (index || []).slice(0,200)) {
    if(typeof id!=="string")continue;
    const product=await read(store,`digital:product:${id}`);
    if(product?.kind&&product?.productType&&product?.name)history.push({kind:product.kind,keyword:product.handoff?.researchKeyword || product.productType,productType:product.productType,name:product.name,title:product.listing?.title,createdAt:product.createdAt,state:product.etsy?.listingId?"etsy_record":"saved"});
  }
  return [...new Map(history.map(row=>[`${row.kind}:${row.name}`,row])).values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,400);
}
export async function rememberProduct(store:IdeaStore|undefined, product:PriorProduct):Promise<void> {
  if(!store)return;
  const history=await readProductMemory(store);
  await store.put(KEY,JSON.stringify([product,...history.filter(row=>row.name!==product.name)].slice(0,300)));
}
export function previousIdea(history:PriorProduct[],kind:PrintableKind|string,keyword:string):PriorProduct[] {
  const key=ideaKey(kind,keyword);
  return history.filter(row=>ideaKey(row.kind,row.keyword)===key||ideaKey(row.kind,row.productType)===key);
}
