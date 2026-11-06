import assert from "node:assert/strict";
import test from "node:test";
import { strToU8,zipSync } from "fflate";
import { extractCheckedZip,inspectSaleArchive } from "../../worker/src/archive-qa.js";
import { validateDigitalPdf } from "../../worker/src/digital-delivery.js";
import { validPdf } from "./fixtures/valid-pdf.js";
const zip=(entries:Record<string,Uint8Array>,level:0|6=0)=>Uint8Array.from(zipSync(entries,{level}));
const office=(kind:"pptx"|"docx"|"xlsx",badXml=false)=>zip({
  "[Content_Types].xml":strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  "_rels/.rels":strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
  [kind==="pptx"?"ppt/presentation.xml":kind==="docx"?"word/document.xml":"xl/workbook.xml"]:strToU8(`<${kind==="pptx"?"presentation":kind==="docx"?"document":"workbook"} xmlns="http://schemas.openxmlformats.org/${kind==="pptx"?"presentationml":kind==="docx"?"wordprocessingml":"spreadsheetml"}/2006/main">${badXml?"<broken>":""}</${kind==="pptx"?"presentation":kind==="docx"?"document":"workbook"}>`),
  ...(kind==="pptx"?{"ppt/slides/slide1.xml":strToU8("<slide/>")}:kind==="xlsx"?{"xl/worksheets/sheet1.xml":strToU8("<sheet/>")}:{} )
});
test("stored and deflated ZIPs are actually opened, CRC checked and their PDF pages validated",async()=>{
  for(const level of [0,6] as const){const report=await inspectSaleArchive(zip({"Product-US-Letter.pdf":validPdf(),"Product-A4.pdf":validPdf("Product-A4.pdf")},level),validateDigitalPdf);assert.equal(report.checks,2);assert.equal(report.names.length,2);}
});
test("a valid filename cannot disguise a corrupt PDF or a wrong paper size inside a ZIP",async()=>{
  await assert.rejects(inspectSaleArchive(zip({"Product-A4.pdf":strToU8("%PDF-not-a-document")}),validateDigitalPdf),/PDF açılamadı/);
  await assert.rejects(inspectSaleArchive(zip({"Product-A4.pdf":validPdf("Product-US-Letter.pdf")}),validateDigitalPdf),/sayfa ölçüsü/);
});
test("ZIP CRC corruption, traversal and duplicate paths are rejected",()=>{
  const corrupt=zip({"Product.pdf":validPdf()});const view=new DataView(corrupt.buffer);const data=30+view.getUint16(26,true)+view.getUint16(28,true);corrupt[data+20]^=1;
  assert.throws(()=>extractCheckedZip(corrupt),/CRC/);
  assert.throws(()=>extractCheckedZip(zip({"../Product.pdf":validPdf()})),/dosya yolu/);
  assert.throws(()=>extractCheckedZip(zip({"Product.pdf":validPdf(),"product.pdf":validPdf()})),/dosya yolu/);
});
test("declared and actual decompression sizes must agree and oversized output is rejected",()=>{
  const forged=zip({"Product.pdf":validPdf()},6),view=new DataView(forged.buffer);let central=-1;
  for(let i=0;i<forged.length-4;i++)if(view.getUint32(i,true)===0x02014b50){central=i;break;}
  assert.ok(central>=0);view.setUint32(22,1,true);view.setUint32(central+24,1,true);
  assert.throws(()=>extractCheckedZip(forged),/boyutu/);
  const huge=zip({"Product.pdf":validPdf()}),v=new DataView(huge.buffer);let c=0;while(v.getUint32(c,true)!==0x02014b50)c++;
  v.setUint32(c+24,50*1024*1024,true);assert.throws(()=>extractCheckedZip(huge),/çok büyük/);
});
test("real office package parts and well-formed XML are required for PPTX, XLSX and DOCX",async()=>{
  for(const kind of ["pptx","docx","xlsx"] as const){assert.equal((await inspectSaleArchive(zip({[`Product.${kind}`]:office(kind)}),validateDigitalPdf)).checks,1);await assert.rejects(inspectSaleArchive(zip({[`Product.${kind}`]:office(kind,true)}),validateDigitalPdf),/XML/);}
  await assert.rejects(inspectSaleArchive(zip({"Product.pptx":zip({"Fake.txt":strToU8("not a presentation")})}),validateDigitalPdf),/belge yapısı/);
});
test("macro/executable payloads, empty deliverables and excessive nesting fail the quality gate",async()=>{
  await assert.rejects(inspectSaleArchive(zip({"README.txt":strToU8("Nothing delivered")}),validateDigitalPdf),/denetlenebilir/);
  await assert.rejects(inspectSaleArchive(zip({"Product.pdf":validPdf(),"run.exe":strToU8("MZ")}),validateDigitalPdf),/çalıştırılabilir/);
  let payload=zip({"Product.pdf":validPdf()});for(let i=0;i<4;i++)payload=zip({"Nested.zip":payload});
  await assert.rejects(inspectSaleArchive(payload,validateDigitalPdf),/iç içe/);
});
