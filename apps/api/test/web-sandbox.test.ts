import assert from "node:assert/strict";
import test from "node:test";
import { createSandbox, SANDBOX_TOKEN, SANDBOX_PREFIX } from "../../web-test/sandbox.js";
import { appendLocalFile } from "../../mobile/upload-file.js";
import { runLiveReads, liveReportText } from "../../mobile/live-check.js";
import { validPdf } from "./fixtures/valid-pdf.js";

function fixture(context:any){
  const values=new Map<string,string|ArrayBuffer>();
  const store={async get(key:string,type?:"arrayBuffer"){const value=values.get(key);return value===undefined?null:type==="arrayBuffer"?value:typeof value==="string"?value:null;},async put(key:string,value:string|ArrayBuffer){values.set(key,value);},async delete(key:string){values.delete(key);}};
  const sandbox=createSandbox(store,"https://sandbox.example");
  context.mock.method(globalThis,"fetch",async(input:any,init?:RequestInit)=>sandbox.upstream(new Request(input,init)));
  const api=(path:string,body?:any)=>sandbox.api(new Request(`https://sandbox.example${SANDBOX_PREFIX}${path}`,{method:body===undefined?"GET":"POST",headers:{authorization:`Bearer ${SANDBOX_TOKEN}`,...(body instanceof FormData?{}:{"content-type":"application/json"})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})}));
  return {sandbox,api,values,store};
}
test("the web sandbox uses real protected Worker routes but reports synthetic status and no customer records",async context=>{
  const {api}=fixture(context);
  const health=await(await api("/health")).json() as any;assert.equal(health.ok,true);assert.equal(health.sandbox,true);
  const dashboard=await(await api("/api/dashboard")).json() as any;assert.deepEqual(dashboard.leads,[]);assert.deepEqual(dashboard.products,[]);
  const catalog=await api("/api/products");assert.equal(catalog.headers.get("x-gxl-sandbox"),"synthetic-only");assert.ok(Array.isArray(await catalog.json()));
  const status=await(await api("/api/channels/status")).json() as any;assert.equal(status.etsy.shopName,"GXLWebTestOnly");assert.equal(status.etsy.authorized,true);assert.equal(status.shopier.connected,false);
});
test("sandbox search runs the production research path with explicit sample rows, never a network fallback",async context=>{
  const {api,sandbox}=fixture(context);
  const response=await api("/api/etsy/trends/scan",{keyword:"animal coloring pages",group:"printables",force:true});
  const body=await response.json() as any;assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.sandbox,true);assert.equal(body.metrics.sampleSize,30);assert.ok(body.examples.every((row:any)=>row.title.includes("TEST SAMPLE")));
  assert.ok(sandbox.events.some(row=>row.path.endsWith("/listings/active")));assert.ok(sandbox.events.every(row=>row.simulated));
});
test("sandbox failure scenarios exercise authorization, rate limits and upload failures independently",async context=>{
  const {api,sandbox}=fixture(context);
  sandbox.setScenario("unauthorized");assert.equal((await api("/api/dashboard")).status,401);assert.equal((await api("/health")).status,200);
  sandbox.setScenario("etsy_disconnected");const status=await(await api("/api/channels/status")).json() as any;assert.equal(status.etsy.connected,false);
  sandbox.setScenario("rate_limited");assert.equal((await api("/api/etsy/trends/scan",{keyword:"test planner",force:true})).status,429);
  sandbox.setScenario("upload_failure");assert.equal((await api("/api/digital/upload-part",new FormData())).status,503);
  sandbox.setScenario("offline");await assert.rejects(api("/health"),/bağlantı kesildi/);
});
test("publication, messages, account connections and unrecognized upstream writes are blocked",async context=>{
  const {api,sandbox}=fixture(context);
  for(const path of ["/api/products/etsy-publish","/api/approvals/test/approve","/api/etsy/connect-session","/api/etsy/shop-settings","/api/etsy/orders/tracking"])assert.equal((await api(path,{confirm:true})).status,409,path);
  assert.equal((await sandbox.upstream(new Request("https://real-unexpected.example/private",{method:"POST",body:"test"}))).status,409);
  assert.equal((await sandbox.upstream(new Request("https://openapi.etsy.com/v3/application/shops/777/listings/900001",{method:"PATCH",body:"state=active"}))).status,409);
});
test("real PDF parsing, storage, structural audit and local Etsy draft creation work inside the sandbox",async context=>{
  const {api,sandbox}=fixture(context),form=new FormData();
  form.set("metadata",JSON.stringify({confirm:true,name:"Web Test Planner",kind:"planner",productType:"planner",prices:{usd:4.99},listing:{title:"Web Test Planner Printable",description:"WEB TEST ONLY. A sample printable planner.",tags:["printable planner"],materials:["pdf"]}}));
  form.append("files",new File([validPdf("WEB-TEST-US-Letter.pdf")],"WEB-TEST-US-Letter.pdf",{type:"application/pdf"}));
  const saved=await api("/api/digital/products",form),body=await saved.json() as any;assert.equal(saved.status,201,JSON.stringify(body));
  const id=body.product.id;
  const audit=await(await api(`/api/digital/products/${id}/qa`)).json() as any;assert.equal(audit.ok,true);assert.equal(audit.files[0].ok,true);
  const draft=await api(`/api/digital/products/${id}/etsy-draft`,{confirm:true});const result=await draft.json() as any;assert.equal(draft.status,201,JSON.stringify(result));assert.equal(result.product.etsy.fileUploaded,true);
  assert.equal(sandbox.drafts.size,1);assert.equal([...sandbox.drafts.values()][0].state,"draft");assert.deepEqual([...sandbox.drafts.values()][0].fileNames,["WEB-TEST-US-Letter.pdf"]);
});
test("web diagnostics cannot turn synthetic service responses into live phone verification",async()=>{
  const report=await runLiveReads({appVersion:"0.8.6",runtimeVersion:"0.8.6",channel:"web-test",embedded:true,testMode:"synthetic-web"},async path=>path==="/health"?{ok:true,service:"gxl-akilli-satici"}:path==="/api/dashboard"?{metrics:{},products:[]}:{});
  assert.equal(report.environment.testMode,"synthetic-web");assert.equal(report.checks.find(row=>row.id==="health")?.status,"warning");assert.ok(report.checks.filter(row=>row.source==="seller").every(row=>row.status==="pending"));assert.match(liveReportText(report),/synthetic-web/);
});
test("synthetic Etsy drafts survive a sandbox restart alongside the stored product metadata",async context=>{
  const {sandbox,store}=fixture(context);
  const form=new URLSearchParams({title:"Restart test draft",price:"4.99"});
  const created=await(await sandbox.upstream(new Request("https://openapi.etsy.com/v3/application/shops/777/listings",{method:"POST",body:form}))).json() as any;
  const restarted=createSandbox(store,"https://sandbox.example");
  const restored=await restarted.upstream(new Request(`https://openapi.etsy.com/v3/application/listings/${created.listing_id}`));
  assert.equal(restored.status,200);assert.equal((await restored.json() as any).title,"Restart test draft");
  assert.equal(restarted.drafts.get(created.listing_id)?.state,"draft");
});
test("browser multipart uploads contain actual file bytes and reject empty or unreadable files",async context=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,"document");Object.defineProperty(globalThis,"document",{value:{},configurable:true});
  try{
    const form=new FormData();await appendLocalFile(form,"asset",{uri:"blob:test",file:new Blob(["PDF-BYTES"],{type:"application/pdf"})},"Test.pdf","application/pdf");
    const file=form.get("asset") as File;assert.equal(file.name,"Test.pdf");assert.equal(await file.text(),"PDF-BYTES");
    await assert.rejects(appendLocalFile(new FormData(),"asset",{uri:"blob:empty",file:new Blob([])},"Empty.pdf","application/pdf"),/boş/);
    context.mock.method(globalThis,"fetch",async()=>new Response("missing",{status:404}));await assert.rejects(appendLocalFile(new FormData(),"asset",{uri:"blob:missing"},"Missing.pdf","application/pdf"),/okunamadı/);
  }finally{if(descriptor)Object.defineProperty(globalThis,"document",descriptor);else delete (globalThis as any).document;}
});
