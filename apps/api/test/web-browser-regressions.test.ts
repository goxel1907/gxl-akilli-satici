import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { normalizeEtsyTitle } from "../../worker/src/pattern-studio.js";
import { scoreTrend } from "../../worker/src/etsy-trends.js";
import { buildAdvice } from "../../worker/src/advice.js";
import { screens,mount,unmount,visible,act,waitFor,ui,tap,type,field,text } from "./fixtures/mobile-ui.js";

test("the browser XML dependency boots without a Node Buffer global and rejects malformed XML",async()=>{
  const result=await build({stdin:{contents:'export {SyntaxValidator} from "fast-xml-validator";',resolveDir:process.cwd()},bundle:true,write:false,format:"iife",globalName:"Xml",platform:"browser",inject:[resolve("apps/web-test/polyfills.ts")]});
  const context:any={TextDecoder,TextEncoder,Uint8Array,Uint16Array,Uint32Array,ArrayBuffer,DataView};
  runInNewContext(result.outputFiles[0].text,context);
  assert.doesNotThrow(()=>context.Xml.SyntaxValidator.validate('<document><page title="Valid"/></document>'));
  assert.throws(()=>context.Xml.SyntaxValidator.validate('<document><page></document>'));
});
test("repeated title format phrases are removed without dropping distinct product details",()=>{
  assert.equal(normalizeEtsyTitle("Reading Journal Printable, A4, US Letter, a4, Instant Download"),"Reading Journal Printable, A4, US Letter, Instant Download");
});
test("listing ages and keyword observations do not become shop success, rising demand or bestseller advice",()=>{
  const now=Date.now(),result=scoreTrend("reading journal printable",{count:1800,results:Array.from({length:30},(_,i)=>({listing_id:100+i,title:"Reading Journal Printable US Letter A4",listing_type:"download",num_favorers:30+i,original_creation_timestamp:Math.floor((now-30*86400000)/1000),tags:["reading journal","us letter","a4"],price:{amount:699,divisor:100,currency_code:"USD"}}))},now);
  const text=buildAdvice(result).map(row=>`${row.titleTr} ${row.detailTr}`).join("\n");
  assert.match(text,/İlan yaşı mağaza yaşı değildir/);assert.match(text,/Zaman içindeki artış/);
  assert.doesNotMatch(text,/Yeni mağazaya açık|Eski ve yorumlu|Yükselen özellikleri|Paketler satıyor|Hemen gir|mutlaka bulunsun/);
  const withoutPrices={...result,strategy:{...result.strategy!,pricing:undefined}};
  assert.ok(!buildAdvice(withoutPrices).some(row=>row.titleTr==="Fiyat denemesi"));
});
test("submitting the real Trend search field scans once and keeps the button accessible",async context=>{
  const scans:any[]=[];let finish!:(value:Response)=>void;
  context.mock.method(globalThis,"fetch",async(input:unknown,init?:RequestInit)=>{
    const path=new URL(String(input)).pathname;
    if(path==="/api/etsy/trends")return Response.json({configured:true,groups:[],niches:[]});
    if(path==="/api/etsy/trends/scan"){scans.push(JSON.parse(String(init?.body)));return new Promise<Response>(resolve=>{finish=resolve;});}
    return Response.json({});
  });
  const renderer=await mount(screens.TrendPanel,{online:true,active:true});
  try{
    const input=()=>renderer.root.findAllByType("TextInput" as any).find(node=>visible(node)&&String(node.props.placeholder).startsWith("Arama tara"))!;
    await act(async()=>input().props.onChangeText("reading journal printable"));
    await act(async()=>{void input().props.onSubmitEditing();});await waitFor(()=>scans.length===1);
    await act(async()=>{void input().props.onSubmitEditing();});assert.equal(scans.length,1);
    assert.equal(scans[0].keyword,"reading journal printable");
    const button=renderer.root.findAllByType("Pressable" as any).find(node=>node.props.accessibilityLabel==="Aramayı tara")!;
    assert.equal(button.props.accessibilityRole,"button");assert.equal(button.props.disabled,true);
    await act(async()=>finish(Response.json({keyword:"reading journal printable",group:"printables",score:0,verdict:"Denenebilir",parts:{},metrics:{},topTags:[],risingTags:[],examples:[],reasons:[]})));
  }finally{await unmount(renderer);}
});

test("an unfinished upload keeps metadata, files and handoff on close/reopen; a different product resets it",async context=>{
  context.mock.method(globalThis,"fetch",async()=>Response.json({products:[]}));
  ui.pickFiles=async()=>({canceled:false,assets:[{name:"Test-Letter.pdf",uri:"file:///test.pdf",size:1200}]});
  ui.pickImages=async()=>({canceled:false,assets:[{uri:"file:///preview.png",fileName:"preview.png"}]});
  let used=0;
  const seed={name:"Seed Journal",kind:"journal",productType:"journal",handoffName:"Seed Journal",handoff:{id:"first",name:"Seed Journal",kind:"journal",productType:"journal"},listing:{title:"Original title",description:"Original description",tags:[]}};
  const props={online:true,active:true,prefill:seed,onPrefillUsed:()=>used++,onPrepare:()=>{}};
  const renderer=await mount(screens.DigitalPanel,props);
  try{
    await type(renderer,/^Başlık/,"Edited title");
    await tap(renderer,/^Dosyaları seç:/);await tap(renderer,/^İlan görselleri/);
    const form=()=>renderer.root.findByType(screens.DigitalUploadForm);
    await act(async()=>form().props.onClose());assert.equal(used,0);
    await tap(renderer,/^Dosya yükle$/);
    assert.equal(field(renderer,/^Başlık/).props.value,"Edited title");
    assert.ok(renderer.root.findAllByType("Text" as any).some(n=>visible(n)&&text(n).includes("1/5 dosya seçildi")));
    assert.ok(renderer.root.findAllByType("Text" as any).some(n=>visible(n)&&text(n)==="1 görsel seçildi"));
    await act(async()=>renderer.update(React.createElement(screens.DigitalPanel,{...props,prefill:JSON.parse(JSON.stringify(seed))})));
    assert.equal(field(renderer,/^Başlık/).props.value,"Edited title");
    await act(async()=>renderer.update(React.createElement(screens.DigitalPanel,{...props,prefill:{...seed,name:"Other Journal",handoffName:"Other Journal",handoff:{...seed.handoff,id:"second",name:"Other Journal"},listing:{...seed.listing,title:"Other title"}}})));
    assert.equal(field(renderer,/^Ürün adı$/).props.value,"Other Journal");
    assert.equal(field(renderer,/^Başlık/).props.value,"Other title");
    assert.ok(renderer.root.findAllByType("Text" as any).some(n=>visible(n)&&text(n).startsWith("Dosyaları seç:")));
    assert.ok(!renderer.root.findAllByType("Text" as any).some(n=>visible(n)&&text(n)==="1 görsel seçildi"));
  }finally{ui.pickFiles=async()=>({canceled:true});ui.pickImages=async()=>({canceled:true});await unmount(renderer);}
});
