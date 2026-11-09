import assert from "node:assert/strict";
import test from "node:test";
import { auditLiveProduct,isLiveReadPath,LIVE_READ_PATHS,LIVE_REPORT_KEY,liveReportText,MANUAL_LIVE_CHECKS,newLiveReport,parseLiveReport,reportManualResult,runLiveReads,summarizeLiveReport } from "../../mobile/live-check.js";
import { screens,mount,tap,unmount,ui,buttons,visible,text,waitFor,act } from "./fixtures/mobile-ui.js";

const environment={appVersion:"0.8.6",runtimeVersion:"0.8.6",channel:"preview",embedded:false};
const id="12345678-1234-1234-1234-123456789012";
const bodies:Record<string,any>={
  "/health":{ok:true,service:"gxl-akilli-satici"},
  "/api/dashboard":{metrics:{catalogProducts:1},products:[],privateToken:"DO-NOT-EXPORT",leads:[{phone:"PRIVATE-PHONE"}]},
  "/api/channels/status":{etsy:{authorized:true,shopReady:true,shopId:777},shopier:{connected:false,upstreamMessage:"DO-NOT-EXPORT"}},
  "/api/etsy/readiness":{items:[{state:"done"},{state:"manual"},{state:"optional"}]},
  "/api/etsy/trends":{configured:true,groups:[],niches:[]},
  "/api/digital/products":{products:[{id,name:"Private product name",fileName:"private-deliverable.pdf"}]},
  "/api/pinterest/status":{configured:false,connected:false,username:"PRIVATE-USER"},
  [`/api/digital/products/${id}/qa`]:{ok:true,files:[{name:"private-deliverable.pdf",ok:true,checks:1,entries:1}],missingFormats:[]}
};
const memory=()=>{const values=new Map<string,string>();return{values,async getItem(key:string){return values.get(key)||null;},async setItem(key:string,value:string){values.set(key,value);},async removeItem(key:string){values.delete(key);}};};

test("live probes read the actual response shape and keep all unperformed phone steps pending",async()=>{
  const paths:string[]=[],storage=memory();
  const report=await runLiveReads(environment,async path=>{paths.push(path);return bodies[path];},{storage});
  assert.deepEqual(paths,[...LIVE_READ_PATHS]);
  assert.equal(report.state,"completed");
  assert.ok(report.checks.filter(row=>row.source==="seller").every(row=>row.status==="pending"));
  assert.equal(report.checks.find(row=>row.id==="readiness")?.status,"warning");
  assert.equal(report.checks.find(row=>row.id==="pinterest_connection")?.status,"warning");
  assert.equal(report.checks.find(row=>row.id==="health")?.status,"verified");
  assert.equal(storage.values.size,0);
  assert.ok(summarizeLiveReport(report).pending>=MANUAL_LIVE_CHECKS.length);
});
test("a successful public health request does not prove authenticated app access",async()=>{
  const paths:string[]=[];
  const report=await runLiveReads(environment,async path=>{paths.push(path);if(path==="/health")return bodies[path];throw Object.assign(Error("PRIVATE-TOKEN"),{status:401});});
  assert.deepEqual(paths,["/health","/api/dashboard"]);
  assert.equal(report.checks.find(row=>row.id==="app_auth")?.status,"failed");
  assert.equal(report.checks.find(row=>row.id==="etsy_connection")?.status,"pending");
  assert.doesNotMatch(liveReportText(report),/PRIVATE-TOKEN/);
});
test("HTTP 200 with the wrong service/schema and cleanup errors cannot become a clean pass",async()=>{
  const report=await runLiveReads(environment,async path=>path==="/health"?{ok:true,service:"another-service"}:path==="/api/etsy/readiness"?{items:[]}:bodies[path],{storage:{async setItem(){},async getItem(){throw Error();},async removeItem(){throw Error();}}});
  for(const id of ["health","device_storage","readiness"])assert.equal(report.checks.find(row=>row.id===id)?.status,"failed");
});
test("cancelling probes leaves unread services pending and never calls a write route",async()=>{
  const controller=new AbortController(),paths:string[]=[];
  const report=await runLiveReads(environment,async path=>{paths.push(path);controller.abort();return bodies[path];},{signal:controller.signal});
  assert.equal(report.state,"cancelled");assert.deepEqual(paths,["/health"]);
  assert.equal(report.checks.find(row=>row.id==="app_auth")?.status,"pending");
  for(const path of ["/api/products/etsy-publish","/api/approvals/1/approve","/api/pinterest/send","https://evil.test/health",`/api/digital/products/${id}/etsy-draft`])assert.equal(isLiveReadPath(path),false);
});
test("stored file audits fail on a broken package, a fabricated empty pass and an invalid product reference",async()=>{
  assert.equal((await auditLiveProduct(async path=>bodies[path],id)).status,"verified");
  assert.equal((await auditLiveProduct(async()=>({ok:false,files:[{ok:false}],missingFormats:["A4"]}),id)).status,"failed");
  assert.equal((await auditLiveProduct(async()=>({ok:true,files:[],missingFormats:[]}),id)).status,"failed");
  assert.equal((await auditLiveProduct(async()=>({ok:true,files:[{ok:false}],missingFormats:[]}),id)).status,"failed");
  assert.equal((await auditLiveProduct(async()=>{throw Error("Must not fetch");},"../publish")).status,"failed");
});
test("manual reports are distinguished from live verification and corrupt/partial reports are rejected",async()=>{
  let report=await runLiveReads(environment,async path=>bodies[path]);
  report=reportManualResult(report,"assistant_files","reported");
  assert.equal(report.checks.find(row=>row.id==="assistant_files")?.source,"seller");
  assert.equal(report.checks.find(row=>row.id==="assistant_files")?.status,"reported");
  assert.ok(parseLiveReport(liveReportText(report)));
  assert.equal(parseLiveReport(JSON.stringify({...report,checks:[]})),undefined);
  assert.equal(parseLiveReport(JSON.stringify({...report,checks:report.checks.map(row=>row.id==="assistant_files"?{...row,status:"verified"}:row)})),undefined);
  assert.equal(parseLiveReport(JSON.stringify({...report,checks:[...report.checks,report.checks[0]]})),undefined);
});
test("report exports exclude raw provider objects, contacts, paths, filenames and unexpected fields",async()=>{
  const report=await runLiveReads(environment,async path=>bodies[path]);
  const json=liveReportText({...report,privateToken:"DO-NOT-EXPORT",fileName:"private-deliverable.pdf",raw:bodies} as any);
  assert.doesNotMatch(json,/DO-NOT-EXPORT|PRIVATE-PHONE|PRIVATE-USER|Private product name|private-deliverable/);
  assert.match(json,/prepublication/);assert.match(json,/yayın onayı/i);
});
test("the actual live request adapter only sends bounded same-origin GET requests",async context=>{
  const methods:string[]=[],paths:string[]=[];
  context.mock.method(globalThis,"fetch",async(input:unknown,init?:RequestInit)=>{const url=new URL(String(input));assert.equal(url.origin,"https://local.invalid");methods.push(init?.method||"");paths.push(url.pathname);return Response.json(bodies[url.pathname]);});
  await screens.liveCheckRequest("/health");
  await screens.liveCheckRequest(`/api/digital/products/${id}/qa`);
  await assert.rejects(screens.liveCheckRequest("/api/products/etsy-publish"));
  assert.deepEqual(methods,["GET","GET"]);assert.equal(paths.length,2);
});
test("the phone panel runs, preserves pending steps and exports no selected-file URI or implicit publication",async()=>{
  ui.storage.delete(LIVE_REPORT_KEY);ui.shares.length=0;
  const paths:string[]=[];
  ui.pickFiles=async()=>({canceled:false,assets:[{uri:"file:///PRIVATE/secret.pdf",name:"PRIVATE-FILE.pdf",size:100}]});
  const renderer=await mount(screens.LiveCheckPanel,{environment,request:async(path:string)=>{paths.push(path);return bodies[path];}});
  try{
    await tap(renderer,/^Yayın öncesi canlı kontrol/);
    await tap(renderer,/^Canlı okumaları başlat$/);
    await waitFor(()=>buttons(renderer,/^Dosya seçiciyi dene$/).length===1);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node).includes("Telefon adımları ve gerçek dosya incelemesi ayrıca bekliyor")));
    await tap(renderer,/^Dosya seçiciyi dene$/);
    const manual=renderer.root.findAllByType("Pressable" as any).find(node=>node.props.accessibilityLabel==="Üretim ve telefona indirme: Deneyip doğruladım")!;
    await (await import("./fixtures/mobile-ui.js")).act(async()=>{await manual.props.onPress();});
    await tap(renderer,/^Kontrol raporunu paylaş$/);
    const value=JSON.parse((ui.shares.at(-1) as any).message);
    assert.equal(value.checks.find((row:any)=>row.id==="assistant_files").status,"reported");
    assert.equal(value.checks.find((row:any)=>row.id==="draft_review").status,"pending");
    assert.equal(value.checks.find((row:any)=>row.id==="file_picker").status,"verified");
    assert.doesNotMatch(JSON.stringify(value),/PRIVATE|secret\.pdf/);
    assert.ok(paths.every(path=>isLiveReadPath(path)));
  }finally{await unmount(renderer);ui.pickFiles=async()=>({canceled:true});ui.storage.delete(LIVE_REPORT_KEY);}
});

test("a late result from another panel cannot overwrite the newer live report",async()=>{
  ui.storage.delete(LIVE_REPORT_KEY);
  let finish!: (value:unknown)=>void;
  const older=await mount(screens.LiveCheckPanel,{environment,request:async(path:string)=>path==="/health"?new Promise(resolve=>{finish=resolve;}):bodies[path]});
  const newer=await mount(screens.LiveCheckPanel,{environment,request:async(path:string)=>bodies[path]});
  try{
    await tap(older,/^Yayın öncesi canlı kontrol/);
    await act(async()=>{void buttons(older,/^Canlı okumaları başlat$/)[0].props.onPress();});
    await waitFor(()=>Boolean(finish));
    const oldId=JSON.parse(ui.storage.get(LIVE_REPORT_KEY)!).id;
    await tap(newer,/^Yayın öncesi canlı kontrol/);
    await tap(newer,/^(Yeni canlı kontrol başlat|Canlı okumaları başlat)$/);
    await waitFor(()=>JSON.parse(ui.storage.get(LIVE_REPORT_KEY)||"{}").state==="completed");
    const newId=JSON.parse(ui.storage.get(LIVE_REPORT_KEY)!).id;
    assert.notEqual(oldId,newId);
    await act(async()=>{finish(bodies["/health"]);});
    await waitFor(()=>buttons(older,/^Yeni canlı kontrol başlat$/).length===1);
    assert.equal(JSON.parse(ui.storage.get(LIVE_REPORT_KEY)!).id,newId);
  }finally{await unmount(older);await unmount(newer);ui.storage.delete(LIVE_REPORT_KEY);}
});
