import type { CrmSql } from "./crm-store.js";
export type AlertChannel="email"|"whatsapp";
export type AlertDeliveryState="pending"|"sending"|"accepted"|"blocked"|"failed"|"uncertain";
export interface OwnerAlertSettings {email:string;whatsapp:string;emailEnabled:boolean;whatsappEnabled:boolean;autoEnabled:boolean;consent:boolean;updatedAt?:string;}
export interface OwnerAlertPayload {originalEn:string;translationTr:string;replyEn:string;replyTr:string;productName:string;source:string;customerReplyState:"draft";}
export interface OwnerAlert {id:string;key:string;createdAt:string;payload:OwnerAlertPayload;deliveries:Partial<Record<AlertChannel,{state:AlertDeliveryState;recipient:string;attempts:number;lease?:string;startedAt?:number;providerId?:string;errorTr?:string}>>;}
export const emptyOwnerSettings=():OwnerAlertSettings=>({email:"",whatsapp:"",emailEnabled:true,whatsappEnabled:true,autoEnabled:false,consent:false});
const short=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
export function normalizeOwnerSettings(raw:Record<string,unknown>):OwnerAlertSettings{
  const email=short(raw.email,254),whatsapp=short(raw.whatsapp,25).replace(/[\s()-]/g,"");
  for(const key of ["emailEnabled","whatsappEnabled","autoEnabled","consent"])if(typeof raw[key]!=="boolean")throw Error("Bildirim seçeneklerini doğrulayın.");
  if(email&&!/^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+\.[^\s@<>\r\n,;]+$/.test(email))throw Error("Geçerli tek bir e-posta adresi yazın.");
  if(whatsapp&&!/^\+[1-9]\d{7,14}$/.test(whatsapp))throw Error("WhatsApp numarasını ülke koduyla yazın: +90…");
  if(raw.autoEnabled===true&&(!raw.consent || raw.emailEnabled&&!email || raw.whatsappEnabled&&!whatsapp || !raw.emailEnabled&&!raw.whatsappEnabled))throw Error("Otomatik bildirim için seçili alıcıları ve size ait oldukları onayını tamamlayın.");
  return {email,whatsapp,emailEnabled:raw.emailEnabled as boolean,whatsappEnabled:raw.whatsappEnabled as boolean,autoEnabled:raw.autoEnabled as boolean,consent:raw.consent as boolean,updatedAt:new Date().toISOString()};
}
export function initOwnerAlerts(sql:CrmSql){
  sql.exec("CREATE TABLE IF NOT EXISTS owner_alert_settings (id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
  sql.exec("CREATE TABLE IF NOT EXISTS owner_alerts (id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, data TEXT NOT NULL)");
}
export function ownerStoreRoute(sql:CrmSql,method:string,path:string,input:Record<string,unknown>):Response{
  const json=(status:number,value:unknown)=>Response.json(value,{status});
  const settings=()=>{const row=sql.exec<{data:string}>("SELECT data FROM owner_alert_settings WHERE id=1").toArray()[0];return row?JSON.parse(row.data) as OwnerAlertSettings:emptyOwnerSettings();};
  const get=(id:string)=>{const row=sql.exec<{data:string}>("SELECT data FROM owner_alerts WHERE id=?",id).toArray()[0];return row?JSON.parse(row.data) as OwnerAlert:undefined;};
  const save=(row:OwnerAlert)=>sql.exec("UPDATE owner_alerts SET data=? WHERE id=?",JSON.stringify(row),row.id);
  if(path==="/internal/owner/settings"){
    if(method==="GET")return json(200,settings());
    if(method==="POST"){try{const next=normalizeOwnerSettings(input);sql.exec("INSERT INTO owner_alert_settings(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",JSON.stringify(next));return json(200,next);}catch(error){return json(400,{error:(error as Error).message});}}
  }
  if(path==="/internal/owner/pending"&&method==="GET")return json(200,{alerts:sql.exec<{data:string}>("SELECT data FROM owner_alerts WHERE json_extract(data,'$.deliveries.email.state')='pending' OR json_extract(data,'$.deliveries.whatsapp.state')='pending' ORDER BY rowid LIMIT 10").toArray().map(row=>JSON.parse(row.data))});
  if(path==="/internal/owner/alerts"&&method==="GET"){
    const rows=sql.exec<{data:string}>("SELECT data FROM owner_alerts ORDER BY rowid DESC LIMIT 100").toArray().map(row=>JSON.parse(row.data) as OwnerAlert);
    for(const row of rows)for(const delivery of Object.values(row.deliveries))if(delivery?.state==="sending" && Date.now()-(delivery.startedAt||0)>120000){delivery.state="uncertain";delete delivery.lease;delivery.errorTr="Gönderim sonucu kaydedilemedi. Kanalı kontrol edin; otomatik tekrar gönderilmez.";save(row);}
    return json(200,{alerts:rows});
  }
  if(path==="/internal/owner/enqueue"&&method==="POST"){
    const key=short(input.key,100),raw=input.payload as any;if(!/^[a-f0-9]{64}$/.test(key)||!raw||!["originalEn","translationTr","replyEn","replyTr"].every(field=>typeof raw[field]==="string"&&raw[field].trim()&&raw[field].length<=4000)||raw.customerReplyState!=="draft")return json(400,{error:"Bildirim metni veya taslak durumu geçersiz."});
    const previous=sql.exec<{data:string}>("SELECT data FROM owner_alerts WHERE dedupe_key=?",key).toArray()[0];if(previous)return json(200,{alert:JSON.parse(previous.data),duplicate:true});
    const config=settings();if(!config.autoEnabled||!config.consent)return json(200,{queued:false,reasonTr:"Size özel bildirim kapalı."});
    const deliveries:OwnerAlert["deliveries"]={};if(config.emailEnabled&&config.email)deliveries.email={state:"pending",recipient:config.email,attempts:0};if(config.whatsappEnabled&&config.whatsapp)deliveries.whatsapp={state:"pending",recipient:config.whatsapp,attempts:0};
    if(!Object.keys(deliveries).length)return json(409,{error:"Bildirim alıcısı yok."});
    const alert:OwnerAlert={id:crypto.randomUUID(),key,createdAt:new Date().toISOString(),payload:{originalEn:raw.originalEn,translationTr:raw.translationTr,replyEn:raw.replyEn,replyTr:raw.replyTr,productName:short(raw.productName,120),source:short(raw.source,80),customerReplyState:"draft"},deliveries};
    sql.exec("INSERT INTO owner_alerts(id,dedupe_key,data) VALUES(?,?,?)",alert.id,key,JSON.stringify(alert));return json(201,{alert,queued:true});
  }
  if(path==="/internal/owner/claim"&&method==="POST"){
    const row=get(short(input.id,40)),channel=input.channel as AlertChannel,delivery=row?.deliveries[channel];if(!row||!delivery)return json(404,{error:"Bildirim bulunamadı."});
    const allowed=input.retry===true?["pending","blocked","failed"]:["pending"];
    if(!allowed.includes(delivery.state))return json(409,{error:"Bu bildirim gönderimde, kabul edildi veya sonucu belirsiz; yeniden gönderilmedi."});
    const config=settings(),enabled=config.autoEnabled&&config.consent&&(channel==="email"?config.emailEnabled:config.whatsappEnabled),recipient=channel==="email"?config.email:config.whatsapp;
    if(!enabled||recipient!==delivery.recipient){delivery.state="blocked";delivery.errorTr="Bildirim kapalı veya alıcı değişmiş. Eski içerik başka alıcıya otomatik gönderilmez.";save(row);return json(409,{error:delivery.errorTr});}
    delivery.state="sending";delivery.lease=crypto.randomUUID();delivery.startedAt=Date.now();delivery.attempts++;delete delivery.errorTr;save(row);return json(200,{alert:row,lease:delivery.lease});
  }
  if(path==="/internal/owner/complete"&&method==="POST"){
    const row=get(short(input.id,40)),channel=input.channel as AlertChannel,delivery=row?.deliveries[channel];
    if(!row||!delivery||delivery.state!=="sending"||delivery.lease!==input.lease)return json(409,{error:"Bildirim gönderim kaydı değişti."});
    if(!["accepted","blocked","failed","uncertain"].includes(String(input.state)))return json(400,{error:"Bildirim sonucu geçersiz."});
    if(input.state==="accepted"&&!short(input.providerId,180))return json(400,{error:"Sağlayıcı kabul kimliği yok."});
    delivery.state=input.state as AlertDeliveryState;delivery.providerId=short(input.providerId,180)||undefined;delivery.errorTr=short(input.errorTr,250)||undefined;delete delivery.lease;save(row);return json(200,{alert:row});
  }
  return json(404,{error:"Bildirim işlemi bulunamadı."});
}
