import assert from "node:assert/strict";
import test from "node:test";
import { createSandbox,SANDBOX_PREFIX,SANDBOX_TOKEN } from "../../web-test/sandbox.js";
import { PRINTABLE_KINDS } from "../../worker/src/printable-studio.js";
const BRAND=/jeopardy|family feud|grinch|rudolph|elf on the shelf|disney|kahoot|pictionary|scattergories|goodnotes|canva|cricut|powerpoint|google|excel|keynote|microsoft/i;
const explicitFor:Record<string,string>={party:"christmas escape room",slides:"christmas trivia game",cards:"christmas cards",coloring:"christmas coloring pages",planner:"wedding planner",resume:"nurse resume template"};
// Her dijital kategoride rakip örneklemi ve seçilebilir öneriler çalışmalı; başlıkta yanlış format, marka ya da test verisi olmamalı.
test("competitor research and listing offers work in every digital category",async context=>{
  const values=new Map<string,any>(),store={get:async(key:string)=>values.get(key)??null,put:async(key:string,value:any)=>{values.set(key,value);},delete:async(key:string)=>{values.delete(key);}};
  const sandbox=createSandbox(store,"https://sandbox.example");
  context.mock.method(globalThis,"fetch",async(input:any,init?:RequestInit)=>sandbox.upstream(new Request(input,init)));
  const api=(body:any)=>sandbox.api(new Request(`https://sandbox.example${SANDBOX_PREFIX}/api/printables/suggestions`,{method:"POST",headers:{authorization:`Bearer ${SANDBOX_TOKEN}`,"content-type":"application/json"},body:JSON.stringify(body)}));
  const report:string[]=[];
  for(const kind of Object.keys(PRINTABLE_KINDS)){
    for(const body of [{kind,assistant:"chatgpt"},...(explicitFor[kind]?[{kind,assistant:"chatgpt",keyword:explicitFor[kind],productType:explicitFor[kind]}]:[])]){
      const r=await api(body),j:any=await r.json().catch(()=>({}));
      const label=`${kind}${(body as any).keyword?" ["+(body as any).keyword+"]":""}`;
      if(r.status!==200){report.push(`FAIL ${label}: ${r.status} ${j.error||""}`);continue;}
      if(!j.offers.length)report.push(`FAIL ${label}: no offers`);
      const problems:string[]=[];
      for(const o of j.offers){
        if(o.tags.length!==13||new Set(o.tags).size!==13||o.tags.some((t:string)=>t.length>20))problems.push("tags");
        if(BRAND.test(o.title+" "+o.tags.join(" ")))problems.push("brand:"+o.title);
        if(!(o.priceUsd>0))problems.push("price");
        if(!/DIGITAL PRODUCT/.test(o.description))problems.push("digital line");
        if(o.title.length>140)problems.push("title len");
        if(/test sample/i.test(o.title))problems.push("test data in title");
        if(["wallpaper","app_icons","spreadsheet","slides","resume"].includes(kind)&&/printable|pdf/i.test(o.title+" "+o.tags.join(" ")))problems.push("print words on a non-print product");
        if(["wallpaper","app_icons","spreadsheet","slides"].includes(kind)&&/\b(a4|us letter)\b/i.test(o.title))problems.push("paper size on a screen product");
        const kw=String(o.keyword).split(" ")[0];
        if(!o.title.toLowerCase().includes(kw.toLowerCase()))problems.push(`title-topic(${o.keyword}|${o.title})`);
      }
      report.push(`${problems.length?"WARN":"OK  "} ${label}: ${j.offers.length} offers · ${j.offers.map((o:any)=>o.title.slice(0,60)+" $"+o.priceUsd+" n="+o.sampleSize).join(" || ")} ${problems.join(", ")}`);
    }
  }
  assert.deepEqual(report.filter(line=>!line.startsWith("OK")),[],report.join("\n"));
});
