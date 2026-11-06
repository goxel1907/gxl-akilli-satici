import assert from "node:assert/strict";
import test from "node:test";
import { createSandbox,SANDBOX_PREFIX,SANDBOX_TOKEN } from "../../web-test/sandbox.js";
import { acceptListingOffer,createListingOffers } from "../../worker/src/listing-offers.js";
import { printableSearches } from "../../worker/src/printable-searches.js";
import { readProductMemory,ideaKey } from "../../worker/src/product-memory.js";
import { contentBudget } from "../../worker/src/content-budget.js";
import { pickBestKeyword } from "../../worker/src/pattern-seed.js";
import { screens,mount,tap,unmount,visible,text,buttons,waitFor,ui } from "./fixtures/mobile-ui.js";

function fixture(context:any){
  const values=new Map<string,any>(),store={get:async(key:string,type?:string)=>values.get(key)??null,put:async(key:string,value:any)=>{values.set(key,value);},delete:async(key:string)=>{values.delete(key);}};
  const sandbox=createSandbox(store,"https://sandbox.example");
  context.mock.method(globalThis,"fetch",async(input:any,init?:RequestInit)=>sandbox.upstream(new Request(input,init)));
  const api=(path:string,body:any,token=SANDBOX_TOKEN)=>sandbox.api(new Request(`https://sandbox.example${SANDBOX_PREFIX}${path}`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)}));
  return{values,store,sandbox,api};
}
test("party fallback follows the game structure instead of a universal ten-page value",()=>{
  assert.equal(contentBudget({kind:"party",productType:"birthday party games"},10).suggested,18);
  assert.equal(contentBudget({kind:"party",productType:"escape room game"},10).suggested,12);
  assert.equal(contentBudget({kind:"party",productType:"bingo game"},10).suggested,24);
  assert.equal(contentBudget({kind:"party",productType:"trivia game"},10).suggested,15);
  assert.equal(contentBudget({kind:"party",productType:"birthday party games"},10,10).suggested,18);
  assert.match(contentBudget({kind:"party",productType:"party games"},10).basisTr,/tasarım önerisidir; satış verisi değildir/);
  assert.equal(ideaKey("party","minimal pink birthday party games"),ideaKey("party","birthday party games"));
});
test("suggestion previews provide complete selectable listings without preparing products or sending messages",async context=>{
  const {values,store,sandbox,api}=fixture(context);
  assert.equal((await api("/api/printables/suggestions",{kind:"party"},"wrong")).status,401);
  const response=await api("/api/printables/suggestions",{kind:"party",assistant:"chatgpt"}),body:any=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.offers.length,3);
  assert.equal(new Set(body.offers.map((row:any)=>row.title)).size,3);
  for(const offer of body.offers){assert.ok(offer.title&&offer.description&&offer.priceUsd>0);assert.equal(offer.tags.length,13);assert.equal(new Set(offer.tags).size,13);assert.ok(offer.tags.every((tag:string)=>tag.length<=20));assert.ok(offer.sampleSize>=3);assert.notEqual(offer.contentBudget.effective,10);}
  assert.equal((await readProductMemory(store)).length,0);assert.equal(values.has("pattern:names"),false);assert.equal(sandbox.drafts.size,0);
  const queries=sandbox.events.filter(row=>row.path.includes("/listings/active"));assert.ok(queries.length<=6,`${queries.length} duplicate upstream searches`);
  assert.ok(sandbox.events.filter(row=>row.path.startsWith("/application/")).every(row=>row.method==="GET"));
});
test("choosing a preview retains its exact metadata and retry returns the same product handoff",async context=>{
  const {store,sandbox,api}=fixture(context);const result:any=await(await api("/api/printables/suggestions",{kind:"party"})).json();const offer=result.offers[0];
  const response=await api("/api/printables/plan",{suggestionId:offer.id,title:"Ignore this client override"}),plan:any=await response.json();
  assert.equal(response.status,200,JSON.stringify(plan));assert.equal(plan.listing.title,offer.title);assert.equal(plan.listing.description,offer.description);assert.deepEqual(plan.listing.tags,offer.tags);assert.equal(plan.brief.priceUsd,offer.priceUsd);assert.equal(plan.contentBudget.effective,offer.contentBudget.effective);
  assert.ok(plan.brief.masterPrompt.includes(offer.title));assert.match(plan.brief.masterPrompt,/Selected product design plan/);
  const retry:any=await(await api("/api/printables/plan",{suggestionId:offer.id})).json();assert.deepEqual(retry.handoff,plan.handoff);assert.equal(retry.brief.name,plan.brief.name);assert.equal((await readProductMemory(store)).length,1);assert.equal(sandbox.drafts.size,0);
  await assert.rejects(acceptListingOffer(store,offer.id,Date.now()+6*3600000+1000),/süresi dolmuş/);
});
test("new batches avoid prior proposed topics; failed research returns an error instead of ten-page cards",async context=>{
  const {sandbox,api}=fixture(context);const first:any=await(await api("/api/printables/suggestions",{kind:"party"})).json();const next:any=await(await api("/api/printables/suggestions",{kind:"party"})).json();
  assert.ok(next.offers?.length,JSON.stringify(next));const keys=new Set(first.offers.map((row:any)=>ideaKey("party",row.keyword)));assert.ok(next.offers.every((row:any)=>!keys.has(ideaKey("party",row.keyword))));
  sandbox.setScenario("rate_limited");const response=await api("/api/printables/suggestions",{kind:"party",keyword:"new birthday party games printable",productType:"birthday party games"});assert.equal(response.status,429);assert.equal((await response.json() as any).offers,undefined);
});
test("truncated competitor tags and old discoveries cannot become separate product topics",async context=>{
  const {store,api}=fixture(context);
  await api("/api/etsy/trends/scan",{keyword:"christmas games printable",group:"printables"});
  await store.put("etsy:discovered",JSON.stringify([{keyword:"christmas games prin",group:"printables",discoveredAt:new Date().toISOString()}]));
  const result=await pickBestKeyword(store,{studio:"printable",kind:"party"});
  assert.ok(!result.selection.candidates.some(row=>/\b(?:pr|pri|prin|printa|printab|printabl)$/.test(row.keyword)),JSON.stringify(result.selection.candidates));
  const first:any=await(await api("/api/printables/suggestions",{kind:"party"})).json();
  assert.ok(first.offers?.length,JSON.stringify(first));
  assert.ok(first.offers.every((row:any)=>!/[a-z]+ games prin\b/i.test(row.title)));
});
for(const kind of Object.keys(printableSearches()))test(`${kind}: the category produces a complete usable offer`,async context=>{
  const {api}=fixture(context);const response=await api("/api/printables/suggestions",{kind});const body:any=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.ok(body.offers.length>=1&&body.offers.length<=3);assert.ok(body.offers.every((row:any)=>row.kind===kind&&row.tags.length===13&&row.priceUsd>0&&row.contentBudget.effective>0));
});

const offer={id:"offer-1",kind:"party",productType:"birthday party games",keyword:"birthday party games printable",title:"Birthday Party Games Printable",description:"Original birthday party games. Digital download; no physical item.",tags:["birthday party","party games","game cards","printable games","party activities","team games","party printable","birthday games","game bundle","us letter","a4 games","instant download","printable pdf"],priceUsd:5.49,sampleSize:30,reasonTr:"30 benzer ilan karşılaştırıldı.",directionTr:"Takım iş birliği",contentBudget:{effective:18,limits:{unitTr:"ana oyun sayfası"}},strategy:{leaders:[]}};
for(const mode of ["simple","expert"])test(`${mode}: the shared entry shows choices first and keeps analysis out of the main screen`,async context=>{
  ui.storage.delete("gxl.printableWorkspace.v1");
  const seed={studio:"printable",kind:"party",keyword:"birthday party games printable",productType:"birthday party games",colors:[],formats:["US Letter","A4"],pageCount:18,basis:["A very long analysis that should not be on the choice screen"],trendTags:[],trendFeatures:[]};
  context.mock.method(globalThis,"fetch",async(input:unknown)=>{const path=new URL(String(input)).pathname;if(path==="/api/patterns/seed")return Response.json(seed);if(path==="/api/printables/suggestions")return Response.json({offers:[offer],noteTr:"A product-matched sample"});if(path==="/api/etsy/trends")return Response.json({configured:true,niches:[],groups:[]});if(path==="/api/digital/products")return Response.json({products:[]});return Response.json({});});
  const props={online:true,channels:{etsy:{shopReady:true,shopId:777}},...(mode==="simple"?{route:"digital",setRoute:()=>{},setTab:()=>{}}:{initialSection:"Stüdyo"})};
  const renderer=await mount(mode==="simple"?screens.SellScreen:screens.EtsyScreen,props);
  try{
    await waitFor(()=>buttons(renderer,/^Bu öneriyi seç →$/).length===1);
    assert.equal(visible(renderer.root.findByProps({testID:"listing-offer-picker"})),true);
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node).includes("A very long analysis")));
    assert.ok(!renderer.root.findAllByType("TextInput" as any).some(node=>visible(node)&&node.props.placeholder==="30"));
    await tap(renderer,/^Açıklama, etiketler ve rakip dayanağı$/);assert.ok(renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node)===offer.tags.join(", ")));
    await tap(renderer,/^Kapat$/);assert.equal(buttons(renderer,/^Bu öneriyi seç →$/).length,1);
  }finally{await unmount(renderer);ui.storage.delete("gxl.printableWorkspace.v1");}
});
