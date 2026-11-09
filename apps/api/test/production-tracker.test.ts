import assert from "node:assert/strict";
import test from "node:test";
import {buildPrintableBrief,buildPrintableListing} from "../../worker/src/printable-studio.js";
import {guardPrintablePlan} from "../../worker/src/output-guard.js";
import {generationKey,PRINTABLE_WORKSPACE_KEY,type PrintableWorkspace} from "../../mobile/workflow-state.js";
import {rememberProduction,changeProduction,syncProductionProduct,readProductionRecords,parseProductionReceipt,productionTrackingPrompt,productionContinuation,productionId,PRODUCTION_TRACKER_KEY,savedConversationUrl,setProductionConversation} from "../../mobile/production-tracker.js";
import {registerProductHandoff} from "../../worker/src/product-handoff.js";
import {screens,mount,tap,unmount,ui,buttons,text,visible,waitFor,act} from "./fixtures/mobile-ui.js";

function workspace(name="Tosery Wedding Planner",assistant:"chatgpt"|"claude"="chatgpt"):PrintableWorkspace{
  const input={kind:"planner",productType:"wedding planner",assistant,referenceNotes:"",colors:"sage, cream",formats:"US Letter, A4",pageCount:"30",audience:"",keyword:"wedding planner printable",trendTags:[],trendFeatures:[]};
  const brief=buildPrintableBrief({...input,kind:"planner",assistant,colors:["sage","cream"],formats:["US Letter","A4"],seed:name,pageCount:30,priceUsd:7.49});
  const guarded=guardPrintablePlan(brief,buildPrintableListing({...input,kind:"planner",colors:["sage","cream"],formats:["US Letter","A4"],pageCount:30,priceUsd:7.49},brief.name),{kind:"planner"});
  return {version:1,savedAt:new Date().toISOString(),input,plan:{...guarded,handoff:{id:name,name:brief.name,kind:"planner",productType:input.productType},inputKey:generationKey(input)}};
}
function stored(rows:any[]){return JSON.stringify({version:1,records:rows});}

test("multiple unfinished products retain exact selected metadata and external progress across persistence",()=>{
  const first=workspace(),second=workspace("Other Wedding Planner","claude");
  let rows=rememberProduction([],first);rows=changeProduction(rows,productionId(first),"listing_images","seller");rows=rememberProduction(rows,second);
  const restored=readProductionRecords(stored(rows));assert.equal(restored.length,2);const original=restored.find(row=>row.id===productionId(first))!;
  assert.equal(original.stage,"listing_images");assert.deepEqual(original.workspace.plan.listing,first.plan.listing);assert.equal(original.workspace.plan.brief.priceUsd,7.49);assert.deepEqual(original.workspace.input,first.input);
  assert.equal(rememberProduction(restored,first).find(row=>row.id===original.id)?.stage,"listing_images");
});
test("share and imported assistant reports cannot claim download, upload or Etsy publication",()=>{
  const rows=rememberProduction([],workspace()),row=rows[0];
  const receipt=(stage:string,projectId=row.id)=>JSON.stringify({GXL_PROGRESS:{projectId,productName:row.workspace.plan.brief.name,stage}});
  assert.equal(parseProductionReceipt(receipt("listing_images"),row),"listing_images");
  for(const stage of ["downloaded","uploaded","draft","published"])assert.throws(()=>parseProductionReceipt(receipt(stage),row));
  assert.throws(()=>parseProductionReceipt(receipt("files_ready","another"),row),/başka bir ürüne/);
  assert.throws(()=>changeProduction(rows,row.id,"published","seller"),/doğrulanmalıdır/);
  assert.equal(changeProduction(rows,row.id,"share_opened","app")[0].stage,"share_opened");
  assert.match(productionTrackingPrompt(row),/Never claim Goxi automatically received it/);assert.match(productionTrackingPrompt(row),/do not repeat it while a step is still in progress/);assert.match(productionContinuation(row),/yeni ürün isteği değil/);
});
test("only matching uploaded identity and a successful Etsy read can complete the same production",()=>{
  const rows=rememberProduction([],workspace()),row=rows[0],product={id:"p1",handoff:{id:row.id},files:[{},{}],images:[{}],etsy:{listingId:42,fileUploaded:true,filesUploaded:2,imagesUploaded:1}};
  assert.equal(syncProductionProduct(rows,{...product,handoff:{id:"wrong"}})[0].stage,"package_ready");
  assert.equal(syncProductionProduct(rows,product)[0].stage,"draft");
  const published=syncProductionProduct(rows,product,{state:"active",checkedAt:new Date().toISOString(),listingId:42});assert.equal(published[0].stage,"published");
  assert.equal(syncProductionProduct(rows,{...product,etsy:{...product.etsy,filesUploaded:1}},{state:"active",checkedAt:new Date().toISOString()})[0].stage,"draft");
  assert.equal(syncProductionProduct(rows,product,{state:"active",checkedAt:new Date().toISOString(),listingId:999})[0].stage,"draft");
  assert.equal(syncProductionProduct(published,product,undefined,true)[0].stage,"draft");
  assert.equal(syncProductionProduct(published,product,{state:"inactive",checkedAt:new Date().toISOString()})[0].stage,"draft");
});
test("production identity is not expired while the seller is still making the files",async()=>{
  let options:any="unset";await registerProductHandoff({get:async()=>null,put:async(_k,_v,value)=>{options=value;}},{name:"Tosery Wedding Planner",kind:"planner",productType:"wedding planner"});assert.equal(options,undefined);
});
test("reopening Studio restores the unfinished product without another research or metadata choice",async context=>{
  ui.storage.clear();ui.shares.length=0;const work=workspace();let rows=rememberProduction([],work);rows=changeProduction(rows,productionId(work),"qa_review","seller");ui.storage.set(PRODUCTION_TRACKER_KEY,stored(rows));ui.storage.set(PRINTABLE_WORKSPACE_KEY,JSON.stringify(work));
  let searches=0;context.mock.method(globalThis,"fetch",async(input:any)=>{if(/patterns\/seed|printables\/suggestions/.test(String(input)))searches++;return Response.json({});});
  let renderer=await mount(screens.StudioPanel,{online:true,active:true,onUpload:()=>{}});
  try{
    await waitFor(()=>buttons(renderer,/^Seçili açıklama ve 13 etiketi göster$/).length===1);assert.equal(searches,0);
    assert.ok(renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node).includes("Kalite kontrolü / düzeltme")));
    await tap(renderer,/^Seçili açıklama ve 13 etiketi göster$/);assert.ok(renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node)===work.plan.listing.tags.join(", ")));
    await tap(renderer,/^Aynı sohbet için devam metnini aç$/);assert.ok((ui.shares.at(-1) as any).message.includes(work.plan.brief.name));assert.equal(readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)!)[0].stage,"qa_review");
    await tap(renderer,/^Üretim durumunu güncelle \/ içe aktar$/);await tap(renderer,/^Telefonuma indirdim$/);
    await unmount(renderer);renderer=await mount(screens.StudioPanel,{online:false,active:true,onUpload:()=>{}});
    await waitFor(()=>buttons(renderer,/^Dosyalarım hazır, yüklemeye geç$/).length===1);
    assert.equal(searches,0);assert.equal(readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)!)[0].stage,"downloaded");
    assert.deepEqual(readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)!)[0].workspace.plan.listing,work.plan.listing);
  }finally{await unmount(renderer);ui.storage.clear();}
});
test("an older single saved workspace is migrated and resumed on app startup",async context=>{
  ui.storage.clear();ui.storage.set(PRINTABLE_WORKSPACE_KEY,JSON.stringify(workspace()));ui.storage.set("gxl.appAccessToken","test");
  context.mock.method(globalThis,"fetch",async()=>Response.json({metrics:{},approvals:[],leads:[],products:[],channels:{},niches:[],groups:[]}));
  const renderer=await mount(screens.App,{});
  try{await waitFor(()=>readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)||null).length===1);await waitFor(()=>buttons(renderer,/^Seçili açıklama ve 13 etiketi göster$/).length===1);}
  finally{await unmount(renderer);ui.storage.clear();}
});

test("failed persistence prevents opening an assistant handoff with untracked context",async context=>{
  ui.storage.clear();ui.shares.length=0;const set=ui.storage.set.bind(ui.storage);
  context.mock.method(ui.storage,"set",(key:string,value:string)=>{if(key===PRODUCTION_TRACKER_KEY)throw new Error("Disk full");return set(key,value);});
  await assert.rejects(screens.shareProductionPackage(workspace()),/Disk full/);assert.equal(ui.shares.length,0);assert.equal(ui.storage.has(PRINTABLE_WORKSPACE_KEY),false);
});

test("share progress is already durable when the operating-system handoff starts",async context=>{
  ui.storage.clear();const push=ui.shares.push;let observed=false;
  ui.shares.push=(...items:unknown[])=>{const rows=readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)||null);assert.equal(rows[0]?.stage,"share_opened");assert.ok(ui.storage.has(PRINTABLE_WORKSPACE_KEY));observed=true;return push.apply(ui.shares,items);};
  try{await screens.shareProductionPackage(workspace());assert.equal(observed,true);}finally{ui.shares.push=push;ui.storage.clear();}
});

test("last-work opens a distinct visible details screen with the exact existing listing",async context=>{
  ui.storage.clear();const work=workspace();const rows=rememberProduction([],work);ui.storage.set(PRODUCTION_TRACKER_KEY,stored(rows));let searches=0;
  context.mock.method(globalThis,"fetch",async(input:any)=>{if(/patterns\/seed|printables\/suggestions/.test(String(input)))searches++;return Response.json({});});
  const renderer=await mount(screens.StudioPanel,{online:false,active:true,onUpload:()=>{}});
  try{
    await waitFor(()=>buttons(renderer,/^Son çalışmayı aç$/).length===1);await tap(renderer,/^Son çalışmayı aç$/);
    const panel=renderer.root.findByProps({testID:"saved-production-details"});assert.equal(visible(panel),true);assert.ok(text(panel).includes(work.plan.brief.name));assert.ok(text(panel).includes(work.plan.listing.title));assert.equal(searches,0);
    await tap(renderer,/^Çalışmanın açıklama ve etiketlerini göster$/);assert.ok(text(panel).includes(work.plan.listing.description));assert.ok(text(panel).includes(work.plan.listing.tags.join(", ")));
    await tap(renderer,/^Kayıtlı çalışma ekranını kapat$/);assert.equal(buttons(renderer,/^Kayıtlı çalışma ekranını kapat$/).length,0);
    await tap(renderer,/^Son çalışmayı aç$/);assert.equal(buttons(renderer,/^Kayıtlı çalışma ekranını kapat$/).length,1);
    await tap(renderer,/^Bu çalışmayı Stüdyo’da sürdür$/);assert.equal(buttons(renderer,/^Kayıtlı çalışma ekranını kapat$/).length,0);
    assert.deepEqual(readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)!)[0].workspace.plan.listing,work.plan.listing);
  }finally{await unmount(renderer);ui.storage.clear();}
});
test("private conversation links are bound to one product and reject public-share, login and foreign destinations",()=>{
  const first=workspace(),second=workspace("Other Planner","claude"),url="https://chatgpt.com/c/11111111-1111-4111-8111-111111111111";let rows=rememberProduction(rememberProduction([],first),second);rows=setProductionConversation(rows,productionId(first),url);
  assert.equal(readProductionRecords(stored(rows)).find(row=>row.id===productionId(first))?.conversationUrl,url);assert.equal(rows.find(row=>row.id===productionId(second))?.conversationUrl,undefined);
  for(const value of ["https://evil.example/c/11111111","https://chatgpt.com/share/11111111","https://chatgpt.com/auth/login","javascript:alert(1)","https://chatgpt.com/c/11111111?token=secret","https://chatgpt.com@evil.example/c/11111111"]){assert.equal(savedConversationUrl(value,"chatgpt"),undefined);assert.throws(()=>setProductionConversation(rows,productionId(first),value));}
  assert.equal(savedConversationUrl(url,"claude"),undefined);
  const corrupt=rows.map(row=>row.id===productionId(first)?{...row,conversationUrl:"https://evil.example"}:row);assert.equal(readProductionRecords(stored(corrupt)).length,2);assert.equal(readProductionRecords(stored(corrupt)).find(row=>row.id===productionId(first))?.conversationUrl,undefined);
});
test("saved chat action opens the exact stored conversation after restart without sharing or regenerating",async context=>{
  ui.storage.clear();ui.links.length=0;ui.shares.length=0;const work=workspace(),url="https://chatgpt.com/c/11111111-1111-4111-8111-111111111111";ui.storage.set(PRODUCTION_TRACKER_KEY,stored(rememberProduction([],work)));context.mock.method(globalThis,"fetch",async()=>Response.json({}));
  let renderer=await mount(screens.StudioPanel,{online:false,active:true,onUpload:()=>{}});
  try{
    await waitFor(()=>buttons(renderer,/^Son çalışmayı aç$/).length===1);await tap(renderer,/^Son çalışmayı aç$/);await tap(renderer,/^Bu ürüne sohbet bağlantısı ekle$/);
    const field=renderer.root.findAllByType("TextInput" as any).find(node=>visible(node)&&node.props.accessibilityLabel==="Bu ürünün özel sohbet bağlantısı")!;await act(async()=>{field.props.onChangeText(url);});await tap(renderer,/^Sohbet bağlantısını kaydet$/);
    await unmount(renderer);renderer=await mount(screens.StudioPanel,{online:false,active:true,onUpload:()=>{}});await waitFor(()=>buttons(renderer,/^Son çalışmayı aç$/).length===1);await tap(renderer,/^Son çalışmayı aç$/);await tap(renderer,/^Kaydedilmiş ChatGPT sohbetini aç$/);assert.deepEqual(ui.links,[url]);assert.equal(ui.shares.length,0);assert.deepEqual(readProductionRecords(ui.storage.get(PRODUCTION_TRACKER_KEY)!)[0].workspace.plan.listing,work.plan.listing);
  }finally{await unmount(renderer);ui.storage.clear();}
});
