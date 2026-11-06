import { EtsyIntegrationError, type EtsyRuntimeEnv } from "./etsy.js";
import { buildPrintableBrief, buildPrintableListing, normalizePrintablePlanInput, PRINTABLE_KINDS, type PrintablePlanInput } from "./printable-studio.js";
import { createPatternSeed, pickBestKeyword, readUsedNames, rememberName } from "./pattern-seed.js";
import { guardPrintablePlan } from "./output-guard.js";
import { researchPrintableMarket } from "./printable-research.js";
import { recommendProduct } from "./product-recommendation.js";
import { readProductMemory, previousIdea, ideaKey, rememberProduct, type IdeaStore } from "./product-memory.js";
import { registerProductHandoff } from "./product-handoff.js";
import { readCached, type PrintableKind, type TrendStore } from "./etsy-trends.js";
import { canRankTrend } from "../../mobile/trend-priority.js";

interface OfferStore extends IdeaStore { put(key:string,value:string,options?:{expirationTtl?:number}):Promise<void>; }
const PREFIX="studio:listing-offer:";
const TTL=6*3600000;
export interface ListingOffer {
  id:string;kind:PrintableKind;productType:string;keyword:string;title:string;description:string;tags:string[];priceUsd:number;
  contentBudget:any;directionTr:string;reasonTr:string;score?:number;sampleSize:number;strategy:any;scopePlan:string[];
}
function scopePlan(input:PrintablePlanInput):string[] {
  if(input.kind!=="party")return ["Create distinct content for the exact product and verify the full page manifest."];
  const subject=`${input.productType} ${input.keyword || ""}`;
  const count=input.pageCount || 18,first=Math.floor(count/3),second=Math.floor((count-first)/2),last=count-first-second;
  if(/escape room/i.test(subject))return [`Six linked original puzzles distributed across ${count} player-facing pages without padding.`,"A unique final code, tested answer chain, separate host solutions and hint cards."];
  if(/bingo/i.test(subject))return [`${count} distinct playable bingo cards with original theme-specific content.`,"A verified calling set; no duplicate cards, ambiguous matches or reused artwork."];
  if(/trivia|quiz/i.test(subject))return [`${count} distinct trivia round pages with original, fact-checked questions.`,"Separate host answers and scoring; no repeated questions or copyrighted quiz content."];
  return [`${first} distinct icebreaker and conversation game pages.`,`${second} original word, observation or theme-trivia game pages.`,`${last} distinct creative challenge and prediction game pages.`,"Adapt all questions and mechanics to this exact theme and audience; no renamed duplicate pages."];
}
function memoized(fetcher:typeof fetch):typeof fetch {
  const requests=new Map<string,Promise<Response>>();
  return (async(input:any,init?:RequestInit)=>{
    if((init?.method || (input instanceof Request?input.method:"GET")).toUpperCase()!=="GET")return fetcher(input,init);
    const key=String(input instanceof Request?input.url:input);
    if(!requests.has(key))requests.set(key,Promise.resolve(fetcher(input,init)));
    return (await requests.get(key)!).clone();
  }) as typeof fetch;
}
export async function createListingOffers(env:EtsyRuntimeEnv,store:OfferStore|undefined,raw:Record<string,unknown>,fetcher:typeof fetch=fetch,now=Date.now()) {
  if(!store)throw new EtsyIntegrationError("STORAGE_NOT_CONFIGURED","Öneri kaydı için güvenli depo gerekli.",503);
  const kind=String(raw.kind || "planner") as PrintableKind;
  if(!PRINTABLE_KINDS[kind])throw new EtsyIntegrationError("VALIDATION_FAILED","Geçerli bir dijital ürün türü seçin.",400);
  const requestFetch=memoized(fetcher),history=await readProductMemory(store);
  const explicit=String(raw.keyword || "").trim().slice(0,60);
  const anchor=String(raw.includeKeyword || "").trim().slice(0,60);
  const candidates:Array<{keyword:string;score?:number}>=[];
  if(explicit)candidates.push({keyword:explicit});
  else {
    if(anchor&&!previousIdea(history,kind,anchor).length){const result=await readCached(store,anchor);candidates.push({keyword:anchor,...(canRankTrend(result,now)?{score:result!.score}:{})});}
    try {
      const picked=await pickBestKeyword(store,{studio:"printable",kind},now,{env,fetcher:requestFetch});
      const fresh=picked.selection.candidates.filter(row=>row.state==="fresh");
      if(!fresh.length&&picked.selection.candidates.some(row=>row.state==="failed"&&row.errorTr?.includes("istek sınırı")))throw new EtsyIntegrationError("RATE_LIMITED","Etsy istek sınırına ulaşıldı. Biraz sonra yeniden araştırın.",429);
      candidates.push(...fresh.map(row=>({keyword:row.keyword,score:row.score})));
    } catch(error){if(!candidates.length)throw error;}
  }
  const unique=[...new Map(candidates.map(row=>[ideaKey(kind,row.keyword),row])).values()].sort((a,b)=>(b.score??-1)-(a.score??-1));
  const offers:ListingOffer[]=[], failures:string[]=[];
  const usedNames=await readUsedNames(store);
  for(const candidate of unique.slice(0,3)){
    try {
      const seed=await createPatternSeed(env,store,{studio:"printable",kind,keyword:candidate.keyword},requestFetch,now);
      let input=normalizePrintablePlanInput({kind,productType:explicit?String(raw.productType || seed.productType):seed.productType,keyword:candidate.keyword,colors:seed.colors,formats:seed.formats,pageCount:raw.pageCount,assistant:raw.assistant,competitorLinks:explicit?raw.competitorLinks:undefined,trendFeatures:seed.trendFeatures});
      const research=await researchPrintableMarket(env,input,requestFetch);
      const recommendation=await recommendProduct(input,research,store);
      if(recommendation.requiresNewTopic)continue;
      const budget=recommendation.contentBudget;
      input={...input,pageCount:input.pageCount?budget.effective:budget.suggested,priceUsd:research.competition.launchPriceUsd,trendTags:research.trendTags,referenceNotes:research.marketBriefEn,creativeDirection:recommendation.directionEn,seed:crypto.randomUUID(),avoidNames:usedNames};
      budget.effective=input.pageCount!;
      const blueprint=scopePlan(input);
      const brief=buildPrintableBrief(input),listing=buildPrintableListing(input,brief.name);
      const guarded=guardPrintablePlan(brief,listing,{kind,formats:input.formats});
      if(offers.some(offer=>offer.title.toLowerCase()===guarded.listing.title.toLowerCase()))continue;
      guarded.brief.masterPrompt+=`\n\n## Selected product design plan\n${blueprint.join("\n")}\nFollow the authoritative count ${input.pageCount}; adapt this design plan to the selected scope without filler.\n${recommendation.productionBriefEn.replace(/Core scope: \d+/,`Core scope: ${input.pageCount}`)}\n\n## Evidence-based market strategy\n${research.strategy.productionBriefEn}\n\n## Authoritative listing metadata\n${JSON.stringify({productName:brief.name,title:guarded.listing.title,description:guarded.listing.description,tags:guarded.listing.tags,priceUsd:input.priceUsd},null,2)}\nPreserve these exact listing claims. Report FAIL if any promised feature cannot be produced. Do not publish the listing.`;
      const plan=guardPrintablePlan(guarded.brief,guarded.listing,{kind,formats:input.formats});
      if(!plan.quality.ok)continue;
      const id=crypto.randomUUID();
      const offer:ListingOffer={id,kind,productType:input.productType,keyword:candidate.keyword,title:plan.listing.title,description:plan.listing.description,tags:plan.listing.tags,priceUsd:input.priceUsd!,contentBudget:budget,directionTr:recommendation.directionTr,reasonTr:`${research.sampleSize} benzer ilan karşılaştırıldı. ${recommendation.directionTr} yaklaşımıyla özgün içerik denemesi.`,...(candidate.score!==undefined?{score:candidate.score}:{}),sampleSize:research.sampleSize,strategy:research.strategy,scopePlan:blueprint};
      const selectionInput={kind,productType:input.productType,keyword:input.keyword,referenceNotes:input.referenceNotes || "",colors:(input.colors || []).join(", "),formats:(input.formats || []).join(", "),pageCount:String(input.pageCount),audience:input.audience || "",competitorLinks:input.competitorLinks || "",trendTags:input.trendTags || [],trendFeatures:input.trendFeatures || [],assistant:input.assistant || "chatgpt"};
      await store.put(`${PREFIX}${id}`,JSON.stringify({version:1,createdAt:now,offer,input,plan:{...plan,research:{...research,recommendation},contentBudget:budget,selectionInput},name:brief.name}),{expirationTtl:TTL/1000});
      offers.push(offer);usedNames.push(brief.name);
    } catch(error){failures.push(candidate.keyword);if(error instanceof EtsyIntegrationError&&error.code==="RATE_LIMITED"){if(!offers.length)throw error;break;}}
  }
  if(!offers.length)throw new EtsyIntegrationError("VALIDATION_FAILED","Bu tür için yeterli, aynı konuda rakip verisiyle doğrulanabilen öneri hazırlanamadı. Başka konu yazın veya yeniden araştırın; hazır ilan gibi sunulmuş varsayılan sonuç üretilmedi.",400);
  if(!explicit){const key=`pattern:autopick:printables:${kind}`,previous=JSON.parse(await store.get(key)||"[]");await store.put(key,JSON.stringify([...new Set([...offers.map(row=>row.keyword),...(Array.isArray(previous)?previous:[])])].slice(0,120)));}
  return {offers,checkedAt:new Date(now).toISOString(),comparedQueries:offers.length,noteTr:`${offers.length} seçilebilir ürün önerisi. Her öneri aynı tür/konudaki bir Etsy örneklemine dayanır; tüm rakipler veya gerçek satış adetleri incelenmiş değildir.`,...(failures.length?{incomplete:true}:{})};
}
export async function acceptListingOffer(store:OfferStore|undefined,id:string,now=Date.now()) {
  if(!store)throw new EtsyIntegrationError("STORAGE_NOT_CONFIGURED","Güvenli öneri deposu bağlı değil.",503);
  if(!/^[a-f0-9-]{36}$/.test(id))throw new EtsyIntegrationError("VALIDATION_FAILED","Geçerli bir öneri seçin.",400);
  const raw=await store.get(`${PREFIX}${id}`),saved=raw?JSON.parse(raw):undefined;
  if(!saved||saved.version!==1||now-saved.createdAt>TTL||now<saved.createdAt-300000)throw new EtsyIntegrationError("VALIDATION_FAILED","Bu önerinin süresi dolmuş. Rakipleri yeniden araştırın.",400);
  if(saved.accepted)return saved.plan;
  const {input,plan,name}=saved;
  if(!plan.quality?.ok)throw new EtsyIntegrationError("VALIDATION_FAILED","Bu önerinin metin kontrolü geçerli değil.",400);
  const handoff=await registerProductHandoff(store,{name,kind:input.kind,productType:input.productType});
  await rememberName(store,name);
  await rememberProduct(store,{kind:input.kind,keyword:input.keyword,productType:input.productType,name,title:plan.listing.title,direction:plan.research.recommendation.directionEn,pageCount:input.pageCount,createdAt:new Date(now).toISOString(),state:"prepared"});
  saved.plan={...plan,handoff};saved.accepted=true;
  await store.put(`${PREFIX}${id}`,JSON.stringify(saved),{expirationTtl:TTL/1000});
  return saved.plan;
}
