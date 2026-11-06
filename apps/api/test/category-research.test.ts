import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { printableSearches } from "../../worker/src/printable-searches.js";
import { createPatternSeed } from "../../worker/src/pattern-seed.js";
import { inferPrintableKind, type PrintableKind, type TrendStore } from "../../worker/src/etsy-trends.js";
import { buildMarketStrategy } from "../../worker/src/market-strategy.js";
import { buildPrintableBrief, buildPrintableListing } from "../../worker/src/printable-studio.js";
import { createSandbox, SANDBOX_PREFIX, SANDBOX_TOKEN } from "../../web-test/sandbox.js";
import { screens, mount, tap, type, field, text, visible, unmount, act, buttons } from "./fixtures/mobile-ui.js";

const now = Date.now();
const env = { ETSY_API_KEY: "test-key", ETSY_SHARED_SECRET: "test-secret" };
function memory() {
  const values = new Map<string, any>();
  return { values, store: { get: async (key: string) => values.get(key) ?? null, put: async (key: string, value: any) => { values.set(key,value); }, delete: async (key: string) => { values.delete(key); } } };
}
const listing = (query: string, index: number) => ({ listing_id: 100 + index, title: `${query}, US Letter, A4, Answer Key`, state: "active", listing_type: "download", tags: [query.slice(0,20), "US Letter", "A4", "answer key"], num_favorers: 20+index, original_creation_timestamp: Math.floor(now/1000)-8640000, price: { amount: 599, divisor: 100, currency_code: "USD" } });

for (const [kind, keywords] of Object.entries(printableSearches(now))) {
  test(`${kind}: compares multiple category queries, exposes evidence and replaces the previous query`, async () => {
    const {store} = memory(), queries: string[] = [];
    assert.ok(new Set(keywords).size >= 3);
    assert.ok(keywords.every(keyword => inferPrintableKind(keyword) === kind));
    const fetcher = (async (input: unknown) => { const query = new URL(String(input)).searchParams.get("keywords")!; queries.push(query); return Response.json({count: 1000, results: Array.from({length:5}, (_, i) => listing(query,i))}); }) as typeof fetch;
    const first = await createPatternSeed(env, store as TrendStore, {studio:"printable",kind},fetcher,now);
    assert.equal(first.kind,kind); assert.equal(queries.length,3);
    assert.ok(first.selection!.comparedCount >= 3); assert.ok(first.selection!.candidates.filter(row => row.state === "fresh").length >= 3);
    assert.equal(first.marketStrategy!.keyword,first.keyword); assert.equal(first.marketStrategy!.leaders.length,5);
    const second = await createPatternSeed(env,store as TrendStore,{studio:"printable",kind,avoidKeyword:first.keyword},fetcher,now+1000);
    assert.notEqual(second.keyword,first.keyword);
    assert.equal(second.kind,kind);
  });
}

test("explicit product searches are preserved and do not trigger unrelated category probes",async()=>{
  const queries: string[]=[]; const {store}=memory();
  const fetcher=(async(input:unknown)=>{const keyword=new URL(String(input)).searchParams.get("keywords")!;queries.push(keyword);return Response.json({count:100,results:Array.from({length:3},(_,i)=>listing(keyword,i))});}) as typeof fetch;
  const seed=await createPatternSeed(env,store as TrendStore,{studio:"printable",kind:"party",keyword:"christmas escape room game"},fetcher,now);
  assert.deepEqual(queries,["christmas escape room game"]);assert.equal(seed.keyword,queries[0]);assert.equal(seed.selection,undefined);
});
test("different party subjects produce subject-specific titles rather than the same bridal title",async()=>{
  const titles:string[]=[];
  for(const keyword of ["family game night printable","birthday party games printable","printable escape room game"]){
    const {store}=memory();const fetcher=(async()=>Response.json({count:100,results:Array.from({length:4},(_,i)=>listing(keyword,i))})) as typeof fetch;
    const seed=await createPatternSeed(env,store as TrendStore,{studio:"printable",kind:"party",keyword},fetcher,now);
    const input={...seed,kind:"party" as const,seed:keyword};
    const brief=buildPrintableBrief(input),title=buildPrintableListing(input,brief.name).title;
    assert.doesNotMatch(title,/bridal|baby shower/i);titles.push(title);
  }
  assert.equal(new Set(titles).size,3);
});
test("missing evidence rotates research ideas without fabricated points; rate limiting stops the comparison batch",async()=>{
  const {store}=memory();const unavailable=(async()=>{throw Error("Should not call external service without keys");}) as typeof fetch;
  const first=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"party"},unavailable,now);
  const second=await createPatternSeed({},store as TrendStore,{studio:"printable",kind:"party"},unavailable,now+1);
  assert.notEqual(first.keyword,second.keyword);assert.equal(first.selection!.comparedCount,0);
  assert.ok(first.selection!.candidates.every(row=>row.score===undefined));assert.match(first.selection!.noteTr,/yetersiz/);
  let calls=0; const limited=(async()=>{calls++;return Response.json({error:"limit"},{status:429});}) as typeof fetch;
  const failed=await createPatternSeed(env,store as TrendStore,{studio:"printable",kind:"party"},limited,now+2);
  assert.equal(calls,1);assert.ok(failed.selection!.candidates.some(row=>row.state==="failed"&&/sınırı/.test(row.errorTr!)));
});
test("seller-selected sources stay visible even with low favorites and feed original-execution instructions",()=>{
  const rows=Array.from({length:20},(_,i)=>listing("birthday party games printable",i));
  const strategy=buildMarketStrategy("birthday party games printable",rows,now,"product_matched",["100"]);
  assert.equal(strategy.leaders[0].id,"100");assert.equal(strategy.leaders[0].selectedBySeller,true);
  assert.equal(strategy.salesEvidence.bestsellerVerified,false);
  assert.equal(strategy.actions[1].id,"feature-answer_key");
  assert.match(strategy.productionBriefEn,/ORIGINAL EXECUTION/);assert.match(strategy.productionBriefEn,/Never copy a competitor/);
  assert.match(strategy.productionBriefEn,/"id":"100"/);assert.match(strategy.productionBriefEn,/file-level QA/);
});
test("protected research preview returns exact-topic sources without creating a listing, name or draft",async context=>{
  const {store,values}=memory(), sandbox=createSandbox(store,"https://sandbox.example");
  context.mock.method(globalThis,"fetch",async(input:any,init?:RequestInit)=>sandbox.upstream(new Request(input,init)));
  const call=(token:string)=>sandbox.api(new Request(`https://sandbox.example${SANDBOX_PREFIX}/api/printables/research`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({kind:"party",productType:"birthday party games",keyword:"birthday party games printable"})}));
  assert.equal((await call("wrong")).status,401);
  const response=await call(SANDBOX_TOKEN),data:any=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(data.research.strategy.scope,"product_matched");assert.equal(data.research.keyword,"birthday party games printable");assert.equal(data.brief,undefined);assert.equal(data.listing,undefined);
  assert.equal(sandbox.drafts.size,0);assert.ok(![...values.keys()].some(key=>/pattern:names|digital:product|handoff:/.test(key)));
  assert.ok(sandbox.events.filter(event=>event.path.startsWith("/application/")).every(event=>event.method==="GET"));
  const selected=data.research.strategy.leaders[0].id;
  const preparedResponse=await sandbox.api(new Request(`https://sandbox.example${SANDBOX_PREFIX}/api/printables/plan`,{method:"POST",headers:{authorization:`Bearer ${SANDBOX_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({kind:"party",productType:"birthday party games",keyword:"birthday party games printable",competitorLinks:selected,research:true,assistant:"claude"})}));
  const prepared:any=await preparedResponse.json();assert.equal(preparedResponse.status,200,JSON.stringify(prepared));
  assert.equal(prepared.research.strategy.leaders[0].id,selected);assert.equal(prepared.research.strategy.leaders[0].selectedBySeller,true);
  assert.match(prepared.brief.masterPrompt,/ORIGINAL EXECUTION/);assert.ok(prepared.brief.masterPrompt.includes(`"id":"${selected}"`));
  assert.match(prepared.listing.title,/birthday/i);assert.doesNotMatch(prepared.listing.title,/bridal/i);assert.equal(sandbox.drafts.size,0);
});
test("real Studio shows seed evidence before generation, previews exact-product research and invalidates it on edits",async context=>{
  const strategy=buildMarketStrategy("birthday party games printable",Array.from({length:4},(_,i)=>listing("birthday party games printable",i)),now,"product_matched");
  const seed={kind:"party",keyword:strategy.keyword,productType:"birthday party games",colors:[],formats:[],basis:[],marketStrategy:strategy,competition:{planTr:["Observed party sample"],topCompetitors:[]}};
  const research={keyword:strategy.keyword,sampleSize:4,scannedAt:new Date(now).toISOString(),noteTr:"Test sample",strategy,competition:seed.competition};
  const requests:string[]=[];
  context.mock.method(globalThis,"fetch",async(input:unknown)=>{const path=new URL(String(input)).pathname;requests.push(path);assert.equal(path,"/api/printables/research");return Response.json({research});});
  const choices:any[]=[];const props={online:true,seed,onPickKind:(...args:any[])=>choices.push(args),onPickQuery:()=>{},onUpload:()=>{}};
  const renderer=await mount(screens.PrintableStudio,props);
  try{
    assert.ok(renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node)===strategy.leaders[0].title));
    assert.equal(requests.length,0);
    await tap(renderer,/^Goxi ile rakipleri araştır$/);
    assert.deepEqual(requests,["/api/printables/research"]);assert.equal(buttons(renderer,/^Goxi ile ilan paketini hazırla$/).length,1);
    await type(renderer,/^Ürün \(İngilizce\)$/,"family game night");
    assert.equal(field(renderer,/^Hedef Etsy araması$/).props.value,"");
    assert.equal(buttons(renderer,/^Goxi ile ilan paketini hazırla$/).length,0);
    assert.ok(!renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node)===strategy.leaders[0].title));
    await act(async()=>renderer.update(React.createElement(screens.PrintableStudio,{...props,seed:{...seed,basis:["Test basis"]}})));
    await tap(renderer,/^Başka arama seç$/);assert.deepEqual(choices.at(-1),["party",strategy.keyword]);
  }finally{await unmount(renderer);}
});
