import { Inflate } from "fflate";
import { SyntaxValidator } from "fast-xml-validator";

// Structural checks only: opening a document in its target app and reviewing its
// content/appearance remain required. No archive entry is written to disk.
export class ArchiveQaError extends Error { constructor(message: string) { super(message); this.name = "ArchiveQaError"; } }
export interface ArchiveEntry { name: string; bytes: Uint8Array<ArrayBuffer>; }
interface Budget { bytes: number; entries: number; }
const MAX_TOTAL = 40 * 1024 * 1024, MAX_ENTRY = 20 * 1024 * 1024, MAX_ENTRIES = 1200;
const decoder = new TextDecoder();
const table = Uint32Array.from({length:256}, (_,n) => { let c=n; for(let k=0;k<8;k++) c=c&1 ? 0xedb88320^(c>>>1) : c>>>1; return c>>>0; });
const crc32 = (bytes: Uint8Array) => { let c=0xffffffff; for(const byte of bytes) c=table[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
const fail = (message: string): never => { throw new ArchiveQaError(message); };

export function extractCheckedZip(bytes: Uint8Array, budget: Budget = { bytes:0, entries:0 }): ArchiveEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length) {end=i;break;}
  if(end<0) return fail("ZIP son dizini eksik veya bozuk.");
  const count=view.getUint16(end+10,true), size=view.getUint32(end+12,true), start=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0 || count!==view.getUint16(end+8,true) || count===65535 || !count || count>MAX_ENTRIES || start+size!==end) return fail("Boş, çok parçalı, ZIP64 veya sınır dışı ZIP desteklenmiyor.");
  let offset=start, declaredTotal=0;
  const names=new Set<string>(), records: Array<{name:string;method:number;compressed:number;uncompressed:number;crc:number;dataStart:number;localStart:number}> = [];
  for(let i=0;i<count;i++) {
    if(offset+46>end || view.getUint32(offset,true)!==0x02014b50) return fail("ZIP merkez dizini bozuk.");
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true),uncompressed=view.getUint32(offset+24,true),length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
    if(((view.getUint32(offset+38,true)>>>16)&0xf000)===0xa000) return fail("ZIP içinde sembolik bağlantı olamaz.");
    if(offset+46+length+extra+comment>end || flags&1 || ![0,8].includes(method) || compressed===0xffffffff || uncompressed===0xffffffff || uncompressed>MAX_ENTRY || local+30>start) return fail("Şifreli, desteklenmeyen veya çok büyük ZIP girdisi.");
    const name=decoder.decode(bytes.subarray(offset+46,offset+46+length));
    if(!name || name.includes("\u0000") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").some(part=>part===".." || part===".") || names.has(name.toLowerCase())) return fail("ZIP içinde güvensiz, yinelenen veya geçersiz dosya yolu var.");
    names.add(name.toLowerCase());
    if(view.getUint32(local,true)!==0x04034b50 || view.getUint16(local+8,true)!==method || view.getUint16(local+6,true)!==flags) return fail("ZIP yerel başlığı merkez diziniyle uyuşmuyor.");
    const localName=view.getUint16(local+26,true), localExtra=view.getUint16(local+28,true),dataStart=local+30+localName+localExtra;
    if(dataStart+compressed>start || decoder.decode(bytes.subarray(local+30,local+30+localName))!==name) return fail("ZIP dosya aralığı veya adı uyuşmuyor.");
    if(!(flags&8) && (view.getUint32(local+18,true)!==compressed || view.getUint32(local+22,true)!==uncompressed || view.getUint32(local+14,true)!==view.getUint32(offset+16,true))) return fail("ZIP boyut veya CRC başlıkları uyuşmuyor.");
    declaredTotal+=uncompressed;
    records.push({name,method,compressed,uncompressed,crc:view.getUint32(offset+16,true),dataStart,localStart:local});
    offset+=46+length+extra+comment;
  }
  if(offset!==end || budget.bytes+declaredTotal>MAX_TOTAL || budget.entries+count>MAX_ENTRIES) return fail("ZIP denetim sınırı aşıldı: toplam açılmış içerik en fazla 40 MB ve 1200 girdidir. Daha küçük teslim paketleri hazırlayın.");
  const ranges=[...records].sort((a,b)=>a.localStart-b.localStart);
  if(ranges.some((r,i)=>i>0 && r.localStart<ranges[i-1].dataStart+ranges[i-1].compressed)) return fail("ZIP dosya aralıkları çakışıyor.");
  budget.bytes+=declaredTotal; budget.entries+=count;
  return records.map(record=>{
    const compressed=bytes.subarray(record.dataStart,record.dataStart+record.compressed);
    let content: Uint8Array<ArrayBuffer>;
    if(record.method===0) content=Uint8Array.from(compressed);
    else {
      let total=0,finished=false; const chunks:Uint8Array[]=[];
      const inflator=new Inflate((chunk,final)=>{total+=chunk.length;if(total>record.uncompressed || total>MAX_ENTRY) fail("ZIP açılmış içerik boyutu beyanla uyuşmuyor.");chunks.push(chunk);finished=final;});
      try { for(let i=0;i<compressed.length;i+=4096) inflator.push(compressed.subarray(i,i+4096),i+4096>=compressed.length); }
      catch(error) { if(error instanceof ArchiveQaError) throw error; return fail(`${record.name}: ZIP sıkıştırılmış içeriği açılamadı.`); }
      if(!finished || total!==record.uncompressed) return fail(`${record.name}: ZIP içerik boyutu uyuşmuyor.`);
      content=new Uint8Array(total);let at=0;for(const chunk of chunks){content.set(chunk,at);at+=chunk.length;}
    }
    if(content.length!==record.uncompressed || crc32(content)!==record.crc) return fail(`${record.name}: ZIP içeriği bozuk (boyut/CRC kontrolü).`);
    return {name:record.name,bytes:content};
  });
}

export async function inspectSaleArchive(bytes: Uint8Array, validatePdf: (bytes: ArrayBuffer, name: string)=>Promise<void>, depth=0, budget:Budget={bytes:0,entries:0}): Promise<{ names:string[]; checks:number }> {
  if(depth>2) return fail("ZIP iç içe paket sınırı aşıldı; dış indirme paketini açıp Etsy teslim dosyalarını seçin.");
  const entries=extractCheckedZip(bytes,budget).filter(entry=>!entry.name.endsWith("/"));
  if(!entries.length) return fail("ZIP içinde teslim dosyası yok.");
  const names:string[]=[];let checks=0;
  for(const entry of entries) {
    const name=entry.name, lower=name.toLowerCase(), extension=lower.split('.').at(-1);
    if(/(?:^|\/)(?:vbaproject\.bin|.*\.(?:exe|dll|bat|cmd|ps1|vbs|scr|js|lnk|docm|xlsm|pptm))$/i.test(name)) return fail(`${name}: çalıştırılabilir dosya veya makro teslim paketinde olamaz.`);
    if(lower.startsWith("__macosx/") || /(?:^|\/)\.ds_store$/.test(lower)) continue;
    if(extension==="pdf") { await validatePdf(entry.bytes.buffer,name); checks++; }
    else if(extension==="zip") {
      const nested=await inspectSaleArchive(entry.bytes,validatePdf,depth+1,budget);names.push(...nested.names);checks+=nested.checks;
    } else if(["pptx","docx","xlsx"].includes(extension || "")) {
      if(depth>=2) return fail("Ofis belgesi çok derin iç içe pakette; teslim paketini sadeleştirin.");
      const parts=extractCheckedZip(entry.bytes,budget), partNames=new Set(parts.map(part=>part.name));
      const root=extension==="pptx" ? "ppt/presentation.xml" : extension==="docx" ? "word/document.xml" : "xl/workbook.xml";
      if(!["[Content_Types].xml","_rels/.rels",root].every(part=>partNames.has(part))) return fail(`${name}: gerçek ${extension?.toUpperCase()} belge yapısı eksik.`);
      const rootText=decoder.decode(parts.find(part=>part.name===root)!.bytes);
      const rootTag=extension==="pptx" ? "presentation" : extension==="docx" ? "document" : "workbook";
      const namespace=extension==="pptx" ? "presentationml" : extension==="docx" ? "wordprocessingml" : "spreadsheetml";
      if(!new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${rootTag}(?:\\s|>)`).test(rootText) || !rootText.includes(`${namespace}/2006/main`) && !rootText.includes(`${namespace}/main`)) return fail(`${name}: Ofis XML kökü veya ad alanı dosya türüyle uyuşmuyor.`);
      if(extension==="pptx" && !parts.some(part=>/^ppt\/slides\/slide\d+\.xml$/.test(part.name))) return fail(`${name}: sunumda slayt yok.`);
      if(extension==="xlsx" && !parts.some(part=>/^xl\/worksheets\/sheet\d+\.xml$/.test(part.name))) return fail(`${name}: çalışma sayfası yok.`);
      for(const part of parts) {
        if(/vbaproject|\.bin$/i.test(part.name)) return fail(`${name}: makro veya denetlenemeyen ikili belge bileşeni var.`);
        if(/\.(xml|rels)$/.test(part.name)) {
          const text=decoder.decode(part.bytes);
          if(!text.trim().startsWith("<") || /<!DOCTYPE|<!ENTITY/i.test(text)) return fail(`${name}: XML bileşeni geçersiz veya dış varlık içeriyor.`);
          try { SyntaxValidator.validate(text); } catch { return fail(`${name}: XML bileşeni bozuk (${part.name}).`); }
        }
      }
      checks++;
    } else if(extension==="png") {
      if(entry.bytes.length<33 || new DataView(entry.bytes.buffer).getUint32(0)!==0x89504e47 || !new DataView(entry.bytes.buffer).getUint32(16) || !new DataView(entry.bytes.buffer).getUint32(20)) return fail(`${name}: PNG başlığı veya ölçüsü okunamadı.`);
      checks++;
    } else if(extension==="jpg" || extension==="jpeg") {
      if(entry.bytes.length<4 || entry.bytes[0]!==255 || entry.bytes[1]!==216 || entry.bytes.at(-2)!==255 || entry.bytes.at(-1)!==217) return fail(`${name}: JPEG yapısı eksik.`);
      checks++;
    }
    names.push(name);
  }
  if(!checks) return fail("ZIP içinde denetlenebilir PDF, PNG/JPEG veya PPTX/DOCX/XLSX teslim dosyası bulunamadı.");
  return {names,checks};
}
