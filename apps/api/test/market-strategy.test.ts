import assert from "node:assert/strict";
import test from "node:test";
import { buildMarketStrategy } from "../../worker/src/market-strategy.js";
import { competitorIds, researchPrintableMarket } from "../../worker/src/printable-research.js";
import { buildProductPlan, normalizeProductInput } from "../../worker/src/product-studio.js";
import { scoreTrend } from "../../worker/src/etsy-trends.js";
import { buildCompetition } from "../../worker/src/pattern-seed.js";
import { createPrintableListing } from "../../worker/src/printable-studio.js";
const now=Date.now();
const row=(id:number,price=6,age=30,favorites=100)=>({listing_id:id,state:"active",title:"Animal Coloring Pages",listing_type:"download",tags:["animal coloring","US Letter","A4"],num_favorers:favorites,original_creation_timestamp:Math.floor((now-age*86400000)/1000),price:{amount:price*100,divisor:100,currency_code:"USD"}});
test("interest leaders retain public sources without inventing bestseller sales and missing ages",()=>{
  const strategy=buildMarketStrategy("animal coloring pages",[row(1,5,600,1000),row(2,7,30,100),{...row(3,9),original_creation_timestamp:undefined,num_favorers:undefined}],now,"product_matched");
  assert.equal(strategy.leaders[0].id,"2");assert.equal(strategy.leaders[0].url,"https://www.etsy.com/listing/2");
  assert.equal(strategy.leaders.find(row=>row.id==="3")?.ageDays,null);
  assert.equal(strategy.leaders.find(row=>row.id==="3")?.favorites,null);
  assert.equal(strategy.salesEvidence.bestsellerVerified,false);assert.equal(strategy.salesEvidence.unitsSold,null);
  assert.equal(strategy.evidenceLevel,"limited");assert.equal(strategy.pricing?.medianUsd,7);
  assert.deepEqual(strategy.pricing?.trialsUsd,[6,7,8]);
  assert.equal(strategy.observations.find(row=>row.id==="letter")?.count,3);
});
test("duplicate IDs, wrong currencies and protected-name products do not bias strategy prices",()=>{
  const strategy=buildMarketStrategy("animal coloring pages",[row(1,5),row(1,500),row(2,7),{...row(3,999),title:"Disney Coloring Pages"},{...row(4,999),price:{amount:999,divisor:100,currency_code:"TRY"}}],now);
  assert.equal(strategy.sampleSize,3);assert.equal(strategy.excludedRisky,1);
  assert.equal(strategy.pricing,undefined);assert.equal(strategy.leaders.filter(row=>row.id==="1").length,1);
  assert.ok(!strategy.productionBriefEn.includes("Disney"));
});
test("a tiny sample is marked insufficient and unsupported bestseller success is never generated",()=>{
  const strategy=buildMarketStrategy("animal coloring pages",[row(1)],now);
  assert.equal(strategy.evidenceLevel,"insufficient");assert.equal(strategy.pricing,undefined);
  assert.match(strategy.productionBriefEn,/Do not invent sales/);
  assert.ok(strategy.experiments.every(item=>item.metricTr && item.stopRuleTr));
});
test("only Etsy listing identifiers are accepted for selected competitor references",()=>{
  assert.deepEqual(competitorIds("https://www.etsy.com/listing/42/test 42 https://www.etsy.com/uk/listing/43/test"),["42","43"]);
  for(const bad of ["https://example.com/listing/42","http://www.etsy.com/listing/42","https://www.etsy.com.evil.test/listing/42","1 2 3 4 5 6"]) assert.throws(()=>competitorIds(bad));
});
test("selected competitors are fetched from Etsy, topic checked and included in the strategy once",async()=>{
  const requests:string[]=[];
  const fetcher=(async(input:unknown)=>{const path=new URL(String(input)).pathname;requests.push(path);return Response.json(path.endsWith("/active")?{count:100,results:[row(10),row(11),row(12),row(10)]}:row(42));}) as typeof fetch;
  const result=await researchPrintableMarket({ETSY_API_KEY:"key",ETSY_SHARED_SECRET:"secret"},{kind:"coloring",productType:"animal coloring pages",competitorLinks:"42"},fetcher);
  assert.ok(requests.some(path=>path.endsWith("/listings/42")));assert.equal(result.strategy.sampleSize,4);
  assert.equal(result.strategy.scope,"product_matched");assert.equal(result.strategy.leaders.filter(row=>row.id==="42").length,1);
  const wrong=(async(input:unknown)=>Response.json(new URL(String(input)).pathname.endsWith("/active")?{results:[row(10),row(11),row(12)]}:{...row(42),title:"Budget Spreadsheet Template"})) as typeof fetch;
  await assert.rejects(researchPrintableMarket({ETSY_API_KEY:"key",ETSY_SHARED_SECRET:"secret"},{kind:"coloring",productType:"animal coloring pages",competitorLinks:"42"},wrong),/aynı tür\/konuda değil/);
});
test("stale physical research cannot choose the keyword or feed a competitor price",()=>{
  const product=normalizeProductInput({titleTr:"Gümüş tesbih",productKind:"tesbih",origin:"made_by_seller",priceTry:2500,shippingTry:900,materialVerified:true});
  const stale=scoreTrend("silver prayer beads",{count:200,results:[{...row(1,500),listing_type:"physical"}]},now-86400000,"tesbih");
  const plan=buildProductPlan(product,["prayer beads"],[stale],{usdTryRate:40});
  assert.equal(plan.primaryKeyword,"prayer beads");assert.equal(plan.strategy,undefined);
  assert.equal(plan.pricing?.medianUsd,undefined);assert.equal(plan.competitors.length,0);
});
test("pricing uses the safe USD evidence cohort and blocks an undersized one",async()=>{
  const rows=[row(1,5),row(2,7),row(3,9),{...row(4,999),title:"Disney Animal Coloring Pages"}];
  const result=scoreTrend("animal coloring pages",{count:100,results:rows},now,"printables","product_matched");
  assert.equal(buildCompetition(result,"coloring",26,[]).medianPriceUsd,7);
  const fetcher=(async()=>Response.json({count:100,results:[row(1),{...row(2),price:{amount:600,divisor:100,currency_code:"TRY"}},row(3)]})) as typeof fetch;
  await assert.rejects(researchPrintableMarket({ETSY_API_KEY:"key",ETSY_SHARED_SECRET:"secret"},{kind:"coloring",productType:"animal coloring pages"},fetcher),/3 karşılaştırılabilir USD fiyatı/);
});
test("configured listing AI receives the same observed strategy without private sales claims",async context=>{
  const strategy=buildMarketStrategy("animal coloring pages",[row(1,5),row(2,7),row(3,9)],now,"product_matched");
  let prompt="";
  context.mock.method(globalThis,"fetch",async(_input:unknown,init?:RequestInit)=>{
    prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text;
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({hook:"Bring animal coloring fun to your next quiet afternoon.",tags:[]})}]}}]});
  });
  const listing=await createPrintableListing({kind:"coloring",productType:"animal coloring pages"},"Meadow Animal Coloring Pages",{GEMINI_API_KEY:"controlled-test"},strategy);
  assert.equal(listing.source,"ai");assert.ok(prompt.includes(strategy.checkedAt));assert.match(prompt,/"bestsellerVerified":false/);
  assert.match(prompt,/never add an observed competitor feature/);assert.equal(listing.tags.length,13);
});
