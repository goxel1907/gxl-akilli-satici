import {crmRequest,type CrmEnv} from "./crm-store.js";
import type {OwnerAlert,OwnerAlertPayload,OwnerAlertSettings,AlertChannel,AlertDeliveryState} from "./owner-alert-store.js";
import type {MessageAssistInput,MessageAssistResult} from "./message-assist.js";
export interface OwnerNotificationEnv extends CrmEnv {
  OWNER_ALERT_RESEND_API_KEY?:string;OWNER_ALERT_EMAIL_FROM?:string;
  OWNER_ALERT_WHATSAPP_TOKEN?:string;OWNER_ALERT_WHATSAPP_PHONE_NUMBER_ID?:string;OWNER_ALERT_WHATSAPP_TEMPLATE?:string;OWNER_ALERT_WHATSAPP_LANGUAGE?:string;OWNER_ALERT_GRAPH_VERSION?:string;
}
const channels:AlertChannel[]=["email","whatsapp"];
export async function ownerStore(env:CrmEnv,path:string,body?:unknown){
  const response=await crmRequest(env,new Request(`https://crm.internal/internal/owner/${path}`,body===undefined?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
  const value=await response.json() as any;if(!response.ok)throw Object.assign(new Error(value.error||"Bildirim kaydı işlenemedi."),{status:response.status});return value;
}
export function ownerChannelReadiness(env:OwnerNotificationEnv,settings:OwnerAlertSettings){
  const emailMissing=[!env.OWNER_ALERT_RESEND_API_KEY&&"E-posta gönderim hizmeti anahtarı",!env.OWNER_ALERT_EMAIL_FROM&&"Doğrulanmış gönderici adresi",!settings.email&&"Bildirim alıcısı e-posta adresi",!settings.consent&&"Size ait alıcı onayı"].filter(Boolean) as string[];
  const whatsappMissing=[!env.OWNER_ALERT_WHATSAPP_TOKEN&&"WhatsApp Business erişim anahtarı",!/^\d{5,30}$/.test(env.OWNER_ALERT_WHATSAPP_PHONE_NUMBER_ID||"")&&"WhatsApp Business gönderici kimliği",!/^v\d{2,3}\.\d+$/.test(env.OWNER_ALERT_GRAPH_VERSION||"")&&"Desteklenen Graph API sürümü",!/^\w{1,100}$/.test(env.OWNER_ALERT_WHATSAPP_TEMPLATE||"")&&"Onaylı altı değişkenli bildirim şablonu",!settings.whatsapp&&"Bildirim alıcısı WhatsApp numarası",!settings.consent&&"Size ait alıcı onayı"].filter(Boolean) as string[];
  return {email:{ready:!emailMissing.length,missingTr:emailMissing},whatsapp:{ready:!whatsappMissing.length,missingTr:whatsappMissing}};
}
export async function ownerNotificationStatus(env:OwnerNotificationEnv){
  const settings=await ownerStore(env,"settings") as OwnerAlertSettings,{alerts}=await ownerStore(env,"alerts");
  return {settings,channels:ownerChannelReadiness(env,settings),alerts:alerts.map((row:OwnerAlert)=>({...row,deliveries:Object.fromEntries(Object.entries(row.deliveries).map(([key,value])=>{const {lease,...safe}=value!;return[key,safe];}))})),source:{etsyInboxConnected:false,noteTr:"Etsy gelen kutusu otomatik bağlı değil. Bildirimler yalnız uygulamada hazırlanmış mesaj taslakları içindir; müşteriye otomatik Etsy cevabı gönderilmez."},deliveryNoteTr:"Sağlayıcı kabulü, telefona veya posta kutusuna teslim edildiğinin kanıtı değildir."};
}
export async function enqueueOwnerDraft(env:OwnerNotificationEnv,input:MessageAssistInput,result:MessageAssistResult,source="Etsy mesajı · elle aktarıldı"){
  if(!result.aiUsed||![result.translationTr,result.replyEn,result.replyTr].every(text=>text?.trim()))return {queued:false,reasonTr:"Tam çeviri ve cevap olmadığı için bildirim oluşturulmadı."};
  const payload:OwnerAlertPayload={originalEn:input.text,translationTr:result.translationTr,replyEn:result.replyEn,replyTr:result.replyTr,productName:input.productName||"Ürün belirtilmedi",source,customerReplyState:"draft"};
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload))),key=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
  const response=await ownerStore(env,"enqueue",{key,payload});return {queued:Boolean(response.queued||response.alert),id:response.alert?.id,duplicate:response.duplicate,reasonTr:response.reasonTr};
}
export function ownerEmailBody(alert:OwnerAlert){
  const p=alert.payload;return [`GXL Market Studio — size özel müşteri bildirimi`,`Ürün: ${p.productName}`,`Kaynak: ${p.source}`,"Durum: TASLAK — müşteriye gönderilmedi.","",`Gelen mesaj (İngilizce):\n${p.originalEn}`,`\nGelen mesajın Türkçesi:\n${p.translationTr}`,`\nHazırlanan cevap (Amerikan İngilizcesi):\n${p.replyEn}`,`\nCevabın Türkçe anlamı:\n${p.replyTr}`,"\nBu bildirim yalnız size gönderilir. Müşteri cevabı Etsy’de ayrıca gönderilmelidir.",`Kayıt: ${alert.id}`].join("\n");
}
export function ownerWhatsappParameters(alert:OwnerAlert){
  const clip=(value:string,max:number)=>value.length>max?`${value.slice(0,max-18)}… (tamamı GXL’de)`:value;
  return [alert.payload.productName,alert.payload.originalEn,alert.payload.translationTr,alert.payload.replyEn,alert.payload.replyTr,"TASLAK — müşteriye gönderilmedi"].map(text=>({type:"text",text:clip(text.replace(/[\r\n\t]+/g," ").trim(),110)}));
}
async function deliver(env:OwnerNotificationEnv,channel:AlertChannel,alert:OwnerAlert,fetcher:typeof fetch):Promise<{state:AlertDeliveryState;providerId?:string;errorTr?:string}>{
  const recipient=alert.deliveries[channel]!.recipient;
  try{
    const response=channel==="email"?await fetcher("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${env.OWNER_ALERT_RESEND_API_KEY}`,"content-type":"application/json","Idempotency-Key":`gxl-owner/${alert.id}/email`},body:JSON.stringify({from:env.OWNER_ALERT_EMAIL_FROM,to:[recipient],subject:`GXL · Cevap taslağı · ${alert.payload.productName.replace(/[\r\n]/g," ").slice(0,100)}`,text:ownerEmailBody(alert)}),signal:AbortSignal.timeout(12000)}):await fetcher(`https://graph.facebook.com/${env.OWNER_ALERT_GRAPH_VERSION}/${env.OWNER_ALERT_WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{authorization:`Bearer ${env.OWNER_ALERT_WHATSAPP_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:recipient.replace(/^\+/,""),type:"template",template:{name:env.OWNER_ALERT_WHATSAPP_TEMPLATE,language:{code:env.OWNER_ALERT_WHATSAPP_LANGUAGE||"tr"},components:[{type:"body",parameters:ownerWhatsappParameters(alert)}]}}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)return {state:response.status>=500?"uncertain":"failed",errorTr:`${channel==="email"?"E-posta":"WhatsApp"} sağlayıcısı HTTP ${response.status} döndürdü. Kabul/teslimat doğrulanmadı.`};
    const body=await response.json() as any,id=channel==="email"?body.id:body.messages?.[0]?.id;
    if(typeof id!=="string"||id.length>180||!id.trim()||channel==="whatsapp"&&!id.startsWith("wamid"))return {state:"uncertain",errorTr:"Sağlayıcı geçerli kabul kimliği döndürmedi; otomatik yeniden gönderilmez."};
    return {state:"accepted",providerId:id};
  }catch{return {state:"uncertain",errorTr:"Bağlantı kesildi; sağlayıcının kabul edip etmediği bilinmiyor. Kanalı kontrol edin; otomatik yeniden gönderilmez."};}
}
export async function processOwnerNotifications(env:OwnerNotificationEnv,options:{id?:string;retry?:boolean}={},fetcher:typeof fetch=fetch){
  if(!env.CRM_STORE)return {processed:0};
  const settings=await ownerStore(env,"settings") as OwnerAlertSettings;if(!settings.autoEnabled||!settings.consent)return {processed:0};
  const readiness=ownerChannelReadiness(env,settings),{alerts}=await ownerStore(env,options.id?"alerts":"pending");
  let processed=0;
  for(const row of (alerts as OwnerAlert[]).filter(row=>!options.id||row.id===options.id).slice(0,4))for(const channel of channels){
    const current=row.deliveries[channel];if(!current||!(options.retry?["pending","blocked","failed"]:["pending"]).includes(current.state))continue;
    let claim:any;try{claim=await ownerStore(env,"claim",{id:row.id,channel,retry:Boolean(options.retry)});}catch(error){if((error as any).status===409)continue;throw error;}
    const result=readiness[channel].ready?await deliver(env,channel,claim.alert,fetcher):{state:"blocked" as const,errorTr:`Bağlantı eksik: ${readiness[channel].missingTr.join(", ")}`};
    await ownerStore(env,"complete",{id:row.id,channel,lease:claim.lease,...result});processed++;
  }
  return {processed};
}
