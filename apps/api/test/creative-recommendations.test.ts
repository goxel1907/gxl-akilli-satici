import assert from "node:assert/strict";
import test from "node:test";
import { contentBudget, effectiveContentCount } from "../../worker/src/content-budget.js";
import { ideaKey, readProductMemory, rememberProduct } from "../../worker/src/product-memory.js";
import { createPatternSeed } from "../../worker/src/pattern-seed.js";
import { scoreTrend, type TrendStore } from "../../worker/src/etsy-trends.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput } from "../../worker/src/printable-studio.js";
import { guardPrintablePlan } from "../../worker/src/output-guard.js";
import { handleRequest } from "../../worker/src/index.js";
import { screens,mount,tap,type,field,act,unmount,buttons,ui } from "./fixtures/mobile-ui.js";

const now=Date.now();
function memory(){const values=new Map<string,string>();return {values,store:{get:async(key:string)=>values.get(key)??null,put:async(key:string,value:string)=>{values.set(key,value);}}};}
const partyRows=(keyword:string)=>Array.from({length:5},(_,i)=>({listing_id:400+i,title:`${keyword}, 30 Pages, Answer Keys, US Letter, A4`,listing_type:"download",state:"active",num_favorers:80+i,original_creation_timestamp:Math.floor(now/1000)-8640000,tags:[keyword.slice(0,20),"answer key","us letter","a4"],price:{amount:699,divisor:100,currency_code:"USD"}}));
const original={kind:"party",keyword:"birthday party games printable",productType:"birthday party games",name:"Earlier Birthday Games",createdAt:new Date(now).toISOString(),state:"prepared" as const};

test("party content can exceed ten; explicit counts stay aligned across brief, description and QA",()=>{
  const input={kind:"party" as const,productType:"birthday party games",pageCount:40,formats:["US Letter","A4"]};
  const brief=buildPrintableBrief(input),listing=buildPrintableListing(input,brief.name);
  assert.match(brief.pdfPrompt,/40/);assert.match(listing.description,/40 core game pages/);
  const budget=contentBudget(input,10,30);assert.equal(budget.suggested,30);assert.equal(budget.effective,40);
  assert.match(budget.noteTr,/Daha fazla sayfa daha fazla satış kanıtı değildir/);
});
test("format-specific actual counts stay consistent and invalid counts cannot silently become ten",()=>{
  assert.equal(effectiveContentCount("calendar",30),12);assert.equal(effectiveContentCount("slides",37),35);
  assert.equal(effectiveContentCount("wall_art",20),6);assert.equal(effectiveContentCount("app_icons",120),96);
  assert.equal(effectiveContentCount("resume",30),4);assert.equal(effectiveContentCount("coloring",40,true),26);
  for(const count of [0,-1,1.2,1001,"not a number"])assert.throws(()=>normalizePrintablePlanInput({kind:"party",productType:"birthday party games",pageCount:count}),/tam sayı/);
  const input={kind:"wall_art" as const,productType:"botanical wall art",pageCount:20};
  const brief=buildPrintableBrief(input),listing=buildPrintableListing(input,brief.name);
  assert.doesNotMatch(listing.description,/20 (artworks|designs|prints)/);assert.match(brief.pdfPrompt,/6 artworks/);
});
test("canonical topics detect renamed/reordered queries and read previously saved Etsy-bound products",async()=>{
  assert.equal(ideaKey("party","Birthday Party Games Printable"),ideaKey("party","printable games birthday party"));
  const {values,store}=memory();values.set("digital:index",JSON.stringify(["existing"]));values.set("digital:product:existing",JSON.stringify({...original,id:"existing",etsy:{listingId:42},listing:{title:"Existing listing"}}));
  const history=await readProductMemory(store);assert.equal(history.length,1);assert.equal(history[0].state,"etsy_record");
  await rememberProduct(store,{...original,name:"Prepared Other Product",keyword:"family game night printable",productType:"family game night"});
  assert.equal((await readProductMemory(store)).length,2);
});
test("automatic ideas do not cycle after three choices and stop clearly when the category is exhausted",async()=>{
  const {store}=memory();const seen=new Set<string>();let stopped=false;
  for(let i=0;i<25;i++){
    try{const seed=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"party"},fetch,now+i);const key=ideaKey("party",seed.keyword);assert.ok(!seen.has(key),`Repeated ${seed.keyword}`);seen.add(key);}
    catch(error){assert.match(String(error),/daha önce kullanılmış/);stopped=true;break;}
  }
  assert.ok(seen.size>=5);assert.equal(stopped,true);
});
test("prepared products are excluded even under reordered names and new candidates can come from observed tags",async()=>{
  const {values,store}=memory();await rememberProduct(store,original);
  const used=["pantry labels printable","spice labels printable","home organization labels printable"];
  values.set("pattern:autopick:printables:labels",JSON.stringify(used));
  const result=scoreTrend(used[0],{count:100,results:partyRows("pantry labels printable")},now,"printables");result.topTags.unshift({tag:"freezer labels printable",count:5});
  values.set("etsy:trend:pantry-labels-printable",JSON.stringify(result));
  const seed=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"labels"},fetch,now);
  assert.equal(seed.keyword,"freezer labels printable");assert.ok(seed.selection!.avoidedCount!>=3);
  values.set("etsy:discovered",JSON.stringify([{keyword:"printable games birthday party",group:"printables",from:"manual",discoveredAt:new Date(now).toISOString()}]));
  const other=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"party"},fetch,now);
  assert.notEqual(ideaKey("party",other.keyword),ideaKey("party",original.keyword));
});
test("cross-category recent subjects yield to close-scoring fresh alternatives",async()=>{
  const {values,store}=memory();await rememberProduct(store,{...original,kind:"cards",keyword:"birthday greeting cards printable",productType:"birthday cards"});
  for(const keyword of ["birthday party games printable","family game night printable"]){const result=scoreTrend(keyword,{count:1000,results:partyRows(keyword)},now,"printables");result.score=keyword.startsWith("birthday")?80:75;values.set(`etsy:trend:${keyword.replaceAll(" ","-")}`,JSON.stringify(result));}
  const seed=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"party"},fetch,now);
  assert.equal(seed.keyword,"family game night printable");
});
test("read-only recommendations drive scope and creative production, remember successful packages and stop recycled approaches",async context=>{
  const {values,store}=memory();const env={APP_ACCESS_TOKEN:"local-test",ETSY_API_KEY:"key",ETSY_SHARED_SECRET:"secret",ETSY_OAUTH:store};
  context.mock.method(globalThis,"fetch",async()=>Response.json({count:100,results:partyRows("birthday party games printable")}));
  const call=(path:string,body:any)=>handleRequest(new Request(`https://local.invalid${path}`,{method:"POST",headers:{authorization:"Bearer local-test","content-type":"application/json"},body:JSON.stringify(body)}),env as any);
  const input={kind:"party",productType:"birthday party games",keyword:"birthday party games printable",pageCount:10,autoScope:true,research:true};
  const preview=await(await call("/api/printables/research",input)).json() as any;
  assert.equal(preview.research.recommendation.contentBudget.suggested,30);assert.equal(preview.research.recommendation.contentBudget.effective,30);
  assert.equal(values.has("studio:product-memory:v1"),false);
  const directions=new Set<string>();
  for(let i=0;i<3;i++){
    const response=await call("/api/printables/plan",{...input,...(i===1?{pageCount:40,autoScope:false}:{})});
    const plan:any=await response.json();assert.equal(response.status,200,JSON.stringify(plan));assert.equal(plan.quality.ok,true,JSON.stringify(plan.quality));
    assert.equal(plan.contentBudget.effective,i===1?40:30);assert.match(plan.listing.description,new RegExp(`${i===1?40:30} core game pages`));
    assert.ok(plan.brief.masterPrompt.includes(plan.research.recommendation.directionEn));assert.match(plan.brief.masterPrompt,/Do not inflate the count/);
    directions.add(plan.research.recommendation.directionEn);
  }
  assert.equal(directions.size,3);assert.equal((await readProductMemory(store)).length,3);
  const fourth=await call("/api/printables/plan",input);assert.equal(fourth.status,422);assert.equal((await fourth.json() as any).code,"PRODUCT_IDEA_EXHAUSTED");
  assert.equal((await readProductMemory(store)).length,3);
});

const seed={kind:"party" as const,keyword:"birthday party games printable",productType:"birthday party games",pageCount:10,colors:[],formats:["US Letter","A4"],basis:[],trendTags:[],trendFeatures:[]};
const preview=(effective=30)=>({research:{recommendation:{productType:seed.productType,contentBudget:{suggested:30,effective,limits:{unitTr:"ana oyun sayfası"},basisTr:"Observed test scope",noteTr:"Test sample"},directionTr:"Takım iş birliği",historyCount:0,evidenceTr:[],previous:[],noveltyTr:"Test history"}}});
test("real Goxi adopts an automatic scope but preserves a seller-entered count",async context=>{
  const bodies:any[]=[];context.mock.method(globalThis,"fetch",async(_input:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));bodies.push(body);return Response.json(preview(body.autoScope?30:body.pageCount));});
  const renderer=await mount(screens.PrintableStudio,{online:true,seed,onUpload:()=>{},onPickKind:()=>{}});
  try{
    await tap(renderer,/^Goxi ile rakipleri araştır$/);assert.equal(field(renderer,/^Sayfa \/ tasarım sayısı$/).props.value,"30");assert.equal(bodies[0].autoScope,true);
    await type(renderer,/^Sayfa \/ tasarım sayısı$/,"40");await tap(renderer,/^İlan hazırlamadan bu ürünün rakiplerini incele$/);
    assert.equal(field(renderer,/^Sayfa \/ tasarım sayısı$/).props.value,"40");assert.equal(bodies[1].autoScope,false);
  }finally{await unmount(renderer);}
});
test("a late generated scope cannot overwrite a new manual count",async context=>{
  let finish!:(response:Response)=>void;let saved=0;
  context.mock.method(globalThis,"fetch",async()=>new Promise<Response>(resolve=>{finish=resolve;}));
  const renderer=await mount(screens.PrintableStudio,{online:true,seed,onUpload:()=>{},onPrepared:()=>saved++});
  try{
    await act(async()=>{void buttons(renderer,/Prompt, görsel ve ilanı hazırla$/)[0].props.onPress();});
    await type(renderer,/^Sayfa \/ tasarım sayısı$/,"45");
    const brief=buildPrintableBrief({...seed,pageCount:30}),listing=buildPrintableListing({...seed,pageCount:30},brief.name);
    await act(async()=>finish(Response.json({...guardPrintablePlan(brief,listing,{kind:"party",formats:seed.formats}),contentBudget:{effective:30}})));
    assert.equal(field(renderer,/^Sayfa \/ tasarım sayısı$/).props.value,"45");assert.equal(saved,0);
  }finally{await unmount(renderer);ui.alerts.length=0;}
});
test("researching again exposes the new recommendation instead of retaining an older shareable plan",async context=>{
  const input={...seed,pageCount:30},brief=buildPrintableBrief(input),listing=buildPrintableListing(input,brief.name);
  const guarded=guardPrintablePlan(brief,listing,{kind:"party",formats:seed.formats});
  context.mock.method(globalThis,"fetch",async(url:unknown)=>Response.json(String(url).endsWith("/plan")?{...guarded,contentBudget:{effective:30}}:String(url).endsWith("/api/explain-tr")?{titleTr:"Deneme başlık",tags:[]}:preview()));
  const renderer=await mount(screens.PrintableStudio,{online:true,seed,onUpload:()=>{},onPrepared:()=>{}});
  try{
    await tap(renderer,/Prompt, görsel ve ilanı hazırla$/);assert.equal(buttons(renderer,/^Goxi ile üretim paketini paylaş$/).length,1);
    await tap(renderer,/^İlan hazırlamadan bu ürünün rakiplerini incele$/);
    assert.equal(buttons(renderer,/^Goxi ile üretim paketini paylaş$/).length,0);
    assert.equal(buttons(renderer,/^Goxi ile ilan paketini hazırla$/).length,1);
  }finally{await unmount(renderer);}
});
