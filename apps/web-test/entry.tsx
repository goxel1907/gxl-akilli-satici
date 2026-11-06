import React from "react";
import { createRoot } from "react-dom/client";
import Root from "../mobile/App";
import { browserStore } from "./storage";
import { createSandbox, SANDBOX_PREFIX, type Scenario } from "./sandbox";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const origin=location.origin,networkFetch=window.fetch.bind(window),store=browserStore(),sandbox=createSandbox(store,origin);
window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=input instanceof Request&&!init?input:new Request(new URL(input instanceof Request?input.url:String(input),origin),init);
  const url=new URL(request.url);
  if(request.signal.aborted)throw new DOMException("Test isteği iptal edildi.","AbortError");
  if(url.origin===origin && (url.pathname.startsWith(SANDBOX_PREFIX+"/") || url.pathname.startsWith("/media/")))return sandbox.api(request);
  if(url.origin!==origin && ["https:","http:"].includes(url.protocol))return sandbox.upstream(request);
  if(["blob:","data:"].includes(url.protocol) || url.origin===origin && request.method==="GET")return networkFetch(request);
  return Response.json({error:"Web testinde dış yazma işlemleri kapalı.",code:"SANDBOX_WRITE_BLOCKED"},{status:409});
};
// The test app has a separate origin/storage; do not reuse mobile or production workspaces.
createRoot(document.getElementById("app")!).render(<Root/>);

const scenario=document.getElementById("scenario") as HTMLSelectElement;
scenario.onchange=()=>{sandbox.setScenario(scenario.value as Scenario);document.getElementById("scenario-note")!.textContent=`Senaryo değişti: ${scenario.selectedOptions[0].textContent}. İlgili ekranda yeniden dene veya sayfayı yenilemeden bağlantıyı yenile.`;};
const log=document.getElementById("test-log")!,drafts=document.getElementById("test-drafts")!;
const logs=()=>{
  log.textContent=sandbox.events.slice(-40).map(row=>`${row.at.slice(11,19)}  ${row.method}  ${row.status}  ${row.path}`).join("\n")||"Henüz istek yok.";
  drafts.textContent=sandbox.drafts.size?JSON.stringify([...sandbox.drafts.values()],null,2):"Henüz örnek Etsy taslağı oluşturulmadı. Bu liste gerçek Etsy hesabı değildir.";
};
document.getElementById("refresh-log")!.onclick=logs;
document.getElementById("export-log")!.onclick=()=>{download(new Blob([JSON.stringify({scope:"synthetic-web-test-only",note:"Gerçek Etsy veya Android cihaz testi değildir.",events:sandbox.events},null,2)],{type:"application/json"}),"GXL-WEB-TEST-LOG.json");};
document.getElementById("reset-test")!.onclick=async()=>{if(confirm("Yalnız bu web sürümünün test kayıtları silinsin mi? Telefona veya Etsy'ye dokunulmaz.")){await store.clear();localStorage.clear();location.reload();}};
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
document.getElementById("sample-files")!.onclick=async()=>{
  for(const [name,size] of [["WEB-TEST-Planner-US-Letter.pdf",[612,792]],["WEB-TEST-Planner-A4.pdf",[595.28,841.89]]] as const){
    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([...size]);
    page.drawText("WEB TEST ONLY - NOT FOR SALE",{x:40,y:size[1]-60,size:17,font,color:rgb(0.15,0.3,0.23)});
    page.drawText("Sample file for upload and draft testing.",{x:40,y:size[1]-90,size:12,font});
    page.drawText("This is not an AI-generated finished product.",{x:40,y:size[1]-115,size:12,font});
    for(let row=0;row<15;row++){const y=size[1]-160-row*30;page.drawLine({start:{x:40,y},end:{x:size[0]-40,y},thickness:0.4,color:rgb(0.6,0.7,0.6)});}
    download(new Blob([await pdf.save() as BlobPart],{type:"application/pdf"}),name);
  }
};
const errorBox=document.getElementById("fatal-error")!;
window.addEventListener("error",event=>{errorBox.hidden=false;errorBox.textContent=`Web test hatası: ${String(event.error?.message||event.message).slice(0,300)}`;});
window.addEventListener("unhandledrejection",event=>{errorBox.hidden=false;errorBox.textContent=`Web test hatası: ${String(event.reason?.message||event.reason).slice(0,300)}`;});
