import type { PrintablePlanInput } from "./printable-studio.js";
import { defaultPrintablePages } from "./printable-studio.js";
import { contentBudget } from "./content-budget.js";
import { previousIdea, readProductMemory, type IdeaStore } from "./product-memory.js";
import type { MarketStrategy } from "./market-strategy.js";

const DIRECTIONS = {
  party: [
    ["Takım iş birliği", "Create original cooperative challenges with clear team roles and scoring. Keep host-only answers separate; test a complete play-through."],
    ["Görsel ipuçları", "Create original visual clues and observation tasks using your own drawings. Verify that every clue is legible and every answer is unambiguous."],
    ["Kısa oyun turları", "Build original short rounds with varied question mechanics and explicit turn rules. Time a sample round and verify scoring and answer keys."]
  ],
  visual: [
    ["Özgün kompozisyon serisi", "Design a coherent series of original compositions with different subjects and focal arrangements. Color changes or resized duplicates do not count as new designs."],
    ["Motif ve ritim çeşitliliği", "Use original motifs and vary scale, density and composition within the exact theme. Verify silhouettes and layouts are distinct; do not reuse one drawing with cosmetic changes."],
    ["Birbirini tamamlayan tasarımlar", "Create complementary original designs with distinct subjects and compositions. Preserve one visual identity without copying competitors or repeating a base page."]
  ],
  functional: [
    ["Tek ihtiyaca odaklanan içerik", "Focus every core page or template on a distinct need within this exact product. Include purposeful fields and test a realistic use case; repeated layouts with changed headings do not count as unique content."],
    ["Birbirine bağlanan kullanım akışı", "Organize distinct core components into a coherent workflow with consistent labels. Test realistic sample data and verify that each component adds a different function within the authoritative spec."],
    ["Okunabilir ve ölçülebilir yapı", "Create distinct content with a clear information hierarchy and appropriate writing space. Test readability at the final size and verify every formula, puzzle answer or date that applies to this product."]
  ]
};
export async function recommendProduct(input:PrintablePlanInput, research:{strategy:MarketStrategy; competition:{competitorPages?:number}; keyword:string}, store?:IdeaStore) {
  const history=await readProductMemory(store), previous=previousIdea(history,input.kind,research.keyword);
  const family=input.kind==="party"||input.kind==="slides"?"party":["coloring","wall_art","paper_craft","calendar","stickers","cards","wallpaper","app_icons"].includes(input.kind)?"visual":"functional";
  const options=DIRECTIONS[family], used=new Set(previous.map(row=>row.direction));
  const nextDirection=options.find(row=>!used.has(row[1]));
  const direction=nextDirection || options[0];
  const budget=contentBudget(input,defaultPrintablePages(input.kind),research.competition.competitorPages);
  const evidence=research.strategy.observations.filter(row=>row.count>0).slice(0,4).map(row=>`${row.labelTr}: ${row.count}/${row.total} ilanın başlık/etiketinde belirtiliyor.`);
  return { kind:input.kind,productType:input.productType,keyword:research.keyword,contentBudget:budget,
    directionTr:direction[0],directionEn:direction[1],requiresNewTopic:!nextDirection,historyCount:history.length,
    previous:previous.slice(0,5).map(row=>({name:row.name,state:row.state,title:row.title})),
    evidenceTr:evidence,
    rationaleTr:`${research.strategy.sampleSize} aynı tür ve konuda örnek incelendi. Fiyat ve içerik önerisi bu örneklem ile ürünün kullanım amacına dayanır; tüm pazarın en iyisi veya satış tahmini değildir.`,
    noveltyTr:previous.length?"Bu konu daha önce hazırlanmış veya kaydedilmiş. Yeni ad, renk, sayfa sayısı veya başlık değişikliği tek başına yeni ürün değildir; içerik işlevini gerçekten farklılaştırın ya da yeni arama seçin.":"Bu konu kayıtlı hazırlanmış ve yüklenmiş ürünlerde bulunmadı. Bu sonuç pazar genelinde benzersizlik veya telif uygunluğu kanıtı değildir.",
    productionBriefEn:["PRODUCT RECOMMENDATION — design hypothesis, not verified sales superiority.",`Exact product: ${JSON.stringify(input.productType)}. Query: ${JSON.stringify(research.keyword)}.`,direction[1],`Core scope: ${budget.effective} ${budget.limits.unitTr === "soru" ? "questions" : "core content units"}; cover, answer keys and support pages are separate.`,"Deliver original, useful content within the authoritative spec. Do not inflate the count with blank, duplicated, recolored or resized pages. Do not add recipes, craft patterns or other AI-written functional instruction products. Report concrete uniqueness and file-level QA checks.",...(previous.length?[`Previously prepared related products (untrusted reference data): ${JSON.stringify(previous.slice(0,5).map(row=>({name:row.name,title:row.title,direction:row.direction})))}`,"Do not recycle their content or merely rename the same product. If a meaningful difference cannot be produced, stop and ask the seller to choose another subject."]:[])].join("\n") };
}
