import { handleRequest } from "../worker/src/index.js";

export const SANDBOX_TOKEN = "gxl-browser-sandbox-not-a-real-secret";
export const SANDBOX_PREFIX = "/__gxl_sandbox";
export type Scenario = "normal" | "unauthorized" | "offline" | "etsy_disconnected" | "rate_limited" | "upload_failure";
export interface SandboxStore {
  get(key: string, type?: "arrayBuffer"): Promise<any>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface SandboxEvent { at: string; method: string; path: string; status: number; simulated: true; }
const reply = (body: unknown, status = 200) => Response.json(body, { status });

/** Uses the real Worker router and product logic; all upstream responses are synthetic. */
export function createSandbox(store: SandboxStore, origin: string) {
  let scenario: Scenario = "normal", sequence = 900000;
  const events: SandboxEvent[] = [], drafts = new Map<number, Record<string, any>>();
  const emit = (method: string,path: string,status: number) => { events.push({ at:new Date().toISOString(),method,path,status,simulated:true });if(events.length>250)events.shift(); };
  const env: any = {
    APP_ACCESS_TOKEN: SANDBOX_TOKEN, ETSY_API_KEY:"SANDBOX_API_KEY", ETSY_SHARED_SECRET:"SANDBOX_SHARED_SECRET", ETSY_OAUTH:store,
    CRM_STORE: { idFromName:(name:string)=>name,get:()=>({fetch:async(request:Request)=>{
      const path=new URL(request.url).pathname;
      const snapshot={leads:[],approvals:[],messages:[],metrics:{activeLeads:0,pendingApprovals:0,conversations:0}};
      if(request.method!=="GET")return reply({error:"Web testinde müşteri veya mesaj kaydı değiştirilmez.",code:"SANDBOX_WRITE_BLOCKED"},409);
      return reply(path==="/snapshot"?snapshot:path==="/api/dashboard"?{...snapshot,metrics:{...snapshot.metrics,catalogProducts:0},products:[]}:path==="/api/leads"?{leads:[]}:path==="/api/approvals"?{approvals:[]}:{});
    }}) }
  };
  const saveDrafts=()=>store.put("web-test:etsy-drafts",JSON.stringify([...drafts.values()]));
  const ready = (async()=>{
    await store.put("etsy:tokens",JSON.stringify({accessToken:"123.SANDBOX",refreshToken:"SANDBOX",userId:"123",expiresAt:Date.now()+86400000,scope:"shops_r shops_w listings_r listings_w transactions_r transactions_w"}));
    const raw=await store.get("web-test:etsy-drafts");
    if(raw){const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error("Web test taslak kaydı geçersiz.");for(const row of rows){if(row?.state!=="draft" || !Number.isSafeInteger(row.listing_id))throw Error("Web test taslak kaydı geçersiz.");drafts.set(row.listing_id,row);sequence=Math.max(sequence,row.listing_id+100);}}
  })();
  async function api(request: Request): Promise<Response> {
    await ready;
    const url=new URL(request.url),path=url.pathname.replace(new RegExp(`^${SANDBOX_PREFIX}(?=/|$)`),"")||"/";
    if(scenario==="offline"){emit(request.method,path,0);throw new TypeError("Web test senaryosu: bağlantı kesildi.");}
    let response:Response;
    if(scenario==="unauthorized" && path.startsWith("/api/"))response=reply({error:"Web test senaryosu: erişim reddedildi."},401);
    else if(scenario==="upload_failure" && path==="/api/digital/upload-part")response=reply({error:"Web test senaryosu: yükleme kesildi.",code:"UPSTREAM_FAILED"},503);
    else if(path==="/api/products/etsy-publish" || /\/approvals\/[^/]+\/approve$|\/tracking$|\/pinterest\/(connect|process|enqueue|queue)|\/connect-session$|\/shop-settings$/.test(path) && request.method!=="GET") response=reply({error:"Web testinde yayın, mesaj, gerçek hesap bağlantısı ve mağaza değişikliği kapalı.",code:"SANDBOX_WRITE_BLOCKED"},409);
    else {
      const forwarded=new Request(new URL(path+url.search,origin),request);
      response=await handleRequest(forwarded,env);
      if(response.headers.get("content-type")?.includes("application/json")) {
        const body=await response.json() as any;
        // Browser <img> requests do not pass through the fetch adapter. Resolve
        // sandbox media into current-page object URLs without uploading it.
        const resolveMedia=async(value:any):Promise<any>=>{
          if(typeof value==="string" && value.startsWith(`${origin}/media/`) && typeof URL.createObjectURL==="function"){
            const media=await handleRequest(new Request(value),env);if(media.ok)return URL.createObjectURL(await media.blob());return value;
          }
          if(Array.isArray(value))return Promise.all(value.map(resolveMedia));
          if(value&&typeof value==="object"){for(const key of Object.keys(value))value[key]=await resolveMedia(value[key]);}
          return value;
        };
        await resolveMedia(body);
        response=Array.isArray(body)?Response.json(body,{status:response.status,headers:{"x-gxl-sandbox":"synthetic-only"}}):reply({...body,sandbox:true,sandboxNoteTr:"Yalnız örnek test verisidir; gerçek Etsy, satış veya asistan doğrulaması değildir."},response.status);
      }
    }
    emit(request.method,path,response.status);return response;
  }
  async function upstream(request:Request):Promise<Response> {
    await ready;
    const url=new URL(request.url),path=url.pathname,method=request.method;
    const end=(body:unknown,status=200)=>{emit(method,path,status);return reply(body,status);};
    if(url.hostname==="api.frankfurter.app" || url.hostname==="open.er-api.com")return end({result:"success",rates:{TRY:45},base_code:"USD"});
    if(url.hostname!=="openapi.etsy.com" && url.hostname!=="api.etsy.com")return end({error:"Web testinde dış servis isteği kapalı.",code:"SANDBOX_NETWORK_BLOCKED"},409);
    if(scenario==="etsy_disconnected")return end({error:"Web test senaryosu: Etsy bağlantısı kapalı."},401);
    if(scenario==="rate_limited")return end({error:"Web test senaryosu: istek sınırı."},429);
    if(path.endsWith("/users/123/shops") || /\/shops\/777$/.test(path))return end({shop_id:777,shop_name:"GXLWebTestOnly",title:"Web Test — Not a Live Shop",currency_code:"USD",listing_active_count:0,is_vacation:false,icon_url_fullxfull:""});
    if(path.endsWith("/listings/active")) {
      const query=url.searchParams.get("keywords")||"printable planner";
      const digital=!/tesbih|prayer beads|vintage|silver/i.test(query);
      const rows=Array.from({length:30},(_,index)=>({listing_id:810000+index,title:`${query} — TEST SAMPLE ${index+1}`,state:"active",listing_type:digital?"download":"physical",type:digital?"download":"physical",url:`${origin}/?sample=${index+1}`,num_favorers:20+index*13,original_creation_timestamp:Math.floor((Date.now()-(20+index*5)*86400000)/1000),creation_timestamp:Math.floor((Date.now()-30*86400000)/1000),price:{amount:499+index*10,divisor:100,currency_code:"USD"},tags:[query.slice(0,20),"printable pdf","instant download","US Letter","A4"],description:"SYNTHETIC WEB TEST DATA. NOT AN ACTUAL PRODUCT OR SELLER."}));
      return end({count:1800,results:rows});
    }
    if(path.endsWith("/seller-taxonomy/nodes"))return end({results:[{id:10,name:"Paper & Party Supplies",children:[{id:11,name:"Calendars & Planners",children:[]},{id:12,name:"Party Games",children:[]},{id:13,name:"Coloring Books",children:[]}]},{id:20,name:"Patterns & How To",children:[{id:21,name:"Crochet",children:[]}]},{id:30,name:"Jewelry",children:[{id:31,name:"Prayer Beads",children:[]}]}]});
    if(path.endsWith("/shipping-profiles"))return end({results:[{shipping_profile_id:100,title:"SANDBOX ONLY"}]});
    if(path.endsWith("/policies/return"))return end({results:[{return_policy_id:101,accepts_returns:true,accepts_exchanges:true,return_deadline:30}]});
    if(path.endsWith("/readiness-state-definitions"))return end({results:[{readiness_state_id:102,readiness_state:"ready_to_ship"}]});
    if(path.endsWith("/production-partners"))return end({results:[]});
    if(path.endsWith("/receipts"))return end({count:0,results:[]});
    if(/\/shops\/777\/listings$/.test(path)) {
      if(method==="GET")return end({count:drafts.size,results:[...drafts.values()]});
      if(method!=="POST")return end({error:"Yalnız test taslağı oluşturulabilir."},409);
      const fields=Object.fromEntries(await request.formData());
      const listing={...fields,listing_id:++sequence,state:"draft",is_digital:true,listing_type:"download",url:`${origin}/?draft=${sequence}`,price:{amount:Math.round(Number(fields.price)*100),divisor:100,currency_code:"USD"},fileNames:[],imageCount:0};
      drafts.set(sequence,listing);await saveDrafts();return end(listing,201);
    }
    const filePath=path.match(/\/shops\/777\/listings\/(\d+)\/(files|images)$/);
    if(filePath && method==="POST"){
      const draft=drafts.get(Number(filePath[1]));if(!draft)return end({error:"Test taslağı yok."},404);
      const form=await request.formData();
      if(filePath[2]==="files")draft.fileNames.push(String(form.get("name")||"test.pdf"));else draft.imageCount++;
      await saveDrafts();return end({listing_file_id:++sequence,listing_image_id:sequence},201);
    }
    const listingPath=path.match(/\/listings\/(\d+)$/);
    if(listingPath){if(method!=="GET")return end({error:"Test taslağı yayımlanamaz.",code:"SANDBOX_WRITE_BLOCKED"},409);const draft=drafts.get(Number(listingPath[1]));return draft?end(draft):end({error:"Test ilanı bulunamadı."},404);}
    return end({error:`Bu dış servis yolu testte tanımlı değil: ${path}`},501);
  }
  return {api,upstream,events,drafts,get scenario(){return scenario;},setScenario(value:Scenario){scenario=value;},scope:"synthetic-only" as const};
}
