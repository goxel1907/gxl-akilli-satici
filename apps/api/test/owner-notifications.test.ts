import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {crmFixture} from "./fixtures/crm.js";
import {handleRequest} from "../../worker/src/index.js";
import {ownerStore,ownerNotificationStatus,enqueueOwnerDraft,processOwnerNotifications,ownerEmailBody,ownerWhatsappParameters} from "../../worker/src/owner-notifications.js";
import {normalizeOwnerSettings} from "../../worker/src/owner-alert-store.js";
import {screens,mount,tap,type,unmount,ui,act,buttons,waitFor,text,visible} from "./fixtures/mobile-ui.js";
const settings={email:"owner@example.invalid",whatsapp:"+15555550100",emailEnabled:true,whatsappEnabled:true,autoEnabled:true,consent:true};
const input={text:"Where can I download my files?",productName:"Tosery Wedding Planner"};
const result={translationTr:"Dosyalarımı nereden indirebilirim?",intentTr:"İndirme yardımı",replyEn:"Download them from Purchases and reviews on Etsy.com. Thank you!",replyTr:"Etsy.com üzerindeki Purchases and reviews bölümünden indirin. Teşekkür ederiz!",warningsTr:[],aiUsed:true};
function fixture(path?:string){const db=crmFixture(path),env={CRM_STORE:db.namespace,APP_ACCESS_TOKEN:"local-test",OWNER_ALERT_RESEND_API_KEY:"resend-secret-never-exposed",OWNER_ALERT_EMAIL_FROM:"GXL <alerts@example.invalid>",OWNER_ALERT_WHATSAPP_TOKEN:"meta-secret-never-exposed",OWNER_ALERT_WHATSAPP_PHONE_NUMBER_ID:"1234567890",OWNER_ALERT_WHATSAPP_TEMPLATE:"gxl_owner_message_notice",OWNER_ALERT_GRAPH_VERSION:"v25.0"};return{db,env};}
const api=(env:any,path:string,body?:unknown,authorized=true)=>handleRequest(new Request(`https://local.invalid${path}`,{method:body===undefined?"GET":"POST",headers:{...(authorized?{authorization:"Bearer local-test"}:{}),"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);

test("owner destinations are protected and require explicit own-recipient consent",async()=>{
  const {db,env}=fixture();try{
    assert.equal((await api(env,"/api/owner-notifications",undefined,false)).status,401);
    assert.equal((await api(env,"/api/owner-notifications/settings",settings)).status,409);
    assert.equal((await api(env,"/api/owner-notifications/settings",{...settings,confirm:true,consent:false})).status,400);
    assert.equal((await api(env,"/api/owner-notifications/settings",{...settings,confirm:true})).status,200);
    const status=await ownerNotificationStatus(env);assert.equal(status.settings.email,settings.email);assert.equal(status.channels.email.ready,true);assert.equal(status.channels.whatsapp.ready,true);assert.equal(status.source.etsyInboxConnected,false);
    assert.ok(!JSON.stringify(status).includes("secret-never-exposed"));
  }finally{db.close();}
});
test("both-channel destination validation rejects lists, header injection and invalid phone numbers",()=>{
  for(const patch of [{email:"one@example.invalid,two@example.invalid"},{email:"owner@example.invalid\r\nBcc:other@example.invalid"},{whatsapp:"555"},{whatsapp:"+0notaphone"},{email:"",emailEnabled:true},{emailEnabled:false,whatsappEnabled:false}])assert.throws(()=>normalizeOwnerSettings({...settings,...patch}));
});
test("no opt-in or incomplete AI output creates no outbound delivery",async()=>{
  const {db,env}=fixture();try{
    assert.equal((await enqueueOwnerDraft(env,input,result)).queued,false);
    await ownerStore(env,"settings",settings);
    assert.equal((await enqueueOwnerDraft(env,input,{...result,translationTr:""})).queued,false);
    assert.equal((await ownerNotificationStatus(env)).alerts.length,0);
  }finally{db.close();}
});
test("concurrent retries keep one notification and one real provider call per selected channel",async()=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);
    const rows=await Promise.all(Array.from({length:15},()=>enqueueOwnerDraft(env,input,result)));assert.equal(new Set(rows.map(row=>row.id)).size,1);
    const requests:Array<{url:string;body:any;headers:any}>=[];
    const fetcher=(async(url:any,init:any)=>{requests.push({url:String(url),body:JSON.parse(init.body),headers:init.headers});await Promise.resolve();return Response.json(String(url).includes("resend")?{id:"email-provider-id"}:{messages:[{id:"wamid.provider-id"}]});}) as typeof fetch;
    await Promise.all(Array.from({length:5},()=>processOwnerNotifications(env,{},fetcher)));
    assert.equal(requests.length,2);const email=requests.find(row=>row.url.includes("resend"))!,wa=requests.find(row=>row.url.includes("facebook"))!;
    assert.deepEqual(email.body.to,[settings.email]);assert.equal(wa.body.to,settings.whatsapp.slice(1));assert.equal(wa.body.template.components[0].parameters.length,6);
    for(const value of [input.text,result.translationTr,result.replyEn,result.replyTr,"TASLAK — müşteriye gönderilmedi"])assert.ok(email.body.text.includes(value));
    const stored=(await ownerNotificationStatus(env)).alerts[0];assert.equal(stored.deliveries.email.state,"accepted");assert.equal(stored.deliveries.whatsapp.state,"accepted");assert.equal(stored.payload.customerReplyState,"draft");assert.equal(stored.deliveries.email.delivered,undefined);assert.equal(stored.deliveries.email.lease,undefined);
    await processOwnerNotifications(env,{id:stored.id,retry:true},fetcher);assert.equal(requests.length,2,"Accepted alerts must not be resent");
  }finally{db.close();}
});
test("one failed channel can retry without resending the already accepted channel",async()=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);const {id}=await enqueueOwnerDraft(env,input,result);let email=0,whatsapp=0;
    const fetcher=(async(url:any)=>String(url).includes("resend")?(email++,Response.json({id:"email-ok"})):(whatsapp++,whatsapp===1?Response.json({error:"bad template"},{status:400}):Response.json({messages:[{id:"wamid.ok"}]}))) as typeof fetch;
    await processOwnerNotifications(env,{id},fetcher);let alert=(await ownerNotificationStatus(env)).alerts[0];assert.equal(alert.deliveries.email.state,"accepted");assert.equal(alert.deliveries.whatsapp.state,"failed");
    await processOwnerNotifications(env,{id,retry:true},fetcher);assert.equal(email,1);assert.equal(whatsapp,2);assert.equal((await ownerNotificationStatus(env)).alerts[0].deliveries.whatsapp.state,"accepted");
  }finally{db.close();}
});
test("missing credentials are blocked truthfully and never attempt external transmission",async()=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);const {id}=await enqueueOwnerDraft(env,input,result);let calls=0;
    await processOwnerNotifications({...env,OWNER_ALERT_RESEND_API_KEY:undefined,OWNER_ALERT_WHATSAPP_TOKEN:undefined},{id},(async()=>{calls++;throw Error();}) as typeof fetch);
    assert.equal(calls,0);const alert=(await ownerNotificationStatus(env)).alerts[0];assert.equal(alert.deliveries.email.state,"blocked");assert.equal(alert.deliveries.whatsapp.state,"blocked");
  }finally{db.close();}
});
test("unknown transport outcomes and lost acknowledgments are never retried blindly",async()=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);const {id}=await enqueueOwnerDraft(env,input,result);let calls=0;const fetcher=(async()=>{calls++;throw Error("lost response");}) as typeof fetch;
    await processOwnerNotifications(env,{id},fetcher);await processOwnerNotifications(env,{id,retry:true},fetcher);assert.equal(calls,2);
    const alert=(await ownerNotificationStatus(env)).alerts[0];assert.equal(alert.deliveries.email.state,"uncertain");assert.equal(alert.deliveries.whatsapp.state,"uncertain");
  }finally{db.close();}
});
test("a changed owner address cannot redirect already queued customer content",async()=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);await enqueueOwnerDraft(env,input,result);await ownerStore(env,"settings",{...settings,email:"other@example.invalid",whatsapp:"+15555550101"});let calls=0;
    await processOwnerNotifications(env,{},(async()=>{calls++;return Response.json({id:"bad"});}) as typeof fetch);assert.equal(calls,0);assert.equal((await ownerNotificationStatus(env)).alerts[0].deliveries.email.state,"blocked");
  }finally{db.close();}
});
test("notification records and settings survive reopening SQLite",async()=>{
  const dir=await mkdtemp(join(process.cwd(),"owner-alert-test-")),path=join(dir,"alerts.sqlite");let {db,env}=fixture(path);
  try{await ownerStore(env,"settings",settings);const {id}=await enqueueOwnerDraft(env,input,result);db.close();({db,env}=fixture(path));const status=await ownerNotificationStatus(env);assert.equal(status.settings.whatsapp,settings.whatsapp);assert.equal(status.alerts[0].id,id);assert.equal(status.alerts[0].payload.replyTr,result.replyTr);}
  finally{db.close();await rm(dir,{recursive:true});}
});
test("an expired send lease becomes uncertain and storage failure is never acknowledged as queued",async context=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);db.failOwnerWrites(true);await assert.rejects(enqueueOwnerDraft(env,input,result));db.failOwnerWrites(false);
    const {id}=await enqueueOwnerDraft(env,input,result),claim=await ownerStore(env,"claim",{id,channel:"email"});context.mock.method(Date,"now",()=>claim.alert.deliveries.email.startedAt+121000);
    assert.equal((await ownerNotificationStatus(env)).alerts[0].deliveries.email.state,"uncertain");
  }finally{db.close();}
});
test("WhatsApp summaries are bounded while email retains the full bilingual content",async()=>{
  const {db,env}=fixture();try{await ownerStore(env,"settings",settings);await enqueueOwnerDraft(env,{...input,text:"A".repeat(1800)},{...result,replyEn:"B".repeat(2000)});const alert=(await ownerStore(env,"alerts")).alerts[0];assert.ok(ownerWhatsappParameters(alert).every((item:any)=>item.text.length<=110));assert.ok(ownerEmailBody(alert).includes("A".repeat(1800)));assert.ok(ownerEmailBody(alert).includes("B".repeat(2000)));}
  finally{db.close();}
});
test("owner settings UI selects both channels and cannot send a test before configuration",async context=>{
  ui.storage.clear();context.mock.method(globalThis,"fetch",async(input:any,init?:any)=>{
    const path=new URL(String(input)).pathname;if(path==="/api/owner-notifications")return Response.json({settings:{...settings,autoEnabled:false},channels:{email:{ready:false,missingTr:["E-posta anahtarı"]},whatsapp:{ready:false,missingTr:["WhatsApp anahtarı"]}},alerts:[],source:{noteTr:"Etsy gelen kutusu otomatik bağlı değil."}});
    return Response.json({});
  });
  const renderer=await mount(screens.MessageHelperCard,{online:true});
  try{await tap(renderer,/^WhatsApp \+ e-posta bildirimleri/);await waitFor(()=>renderer.root.findAllByType("Text" as any).some(node=>visible(node)&&text(node)==="• WhatsApp anahtarı"));assert.equal(buttons(renderer,/^Bana test bildirimi gönder$/).length,0);
    const checks=renderer.root.findAllByType("Pressable" as any).filter(node=>node.props.accessibilityRole==="checkbox");assert.equal(checks.find(node=>node.props.accessibilityLabel==="E-posta bildirimi istiyorum")?.props.accessibilityState.checked,true);assert.equal(checks.find(node=>node.props.accessibilityLabel==="WhatsApp bildirimi istiyorum")?.props.accessibilityState.checked,true);
  }finally{await unmount(renderer);ui.storage.clear();}
});

test("a completed message-helper response queues and processes both owner notifications without sending to the buyer",async context=>{
  const {db,env}=fixture();try{
    await ownerStore(env,"settings",settings);let email=0,whatsapp=0;const background:Promise<unknown>[]=[];
    context.mock.method(globalThis,"fetch",async(input:any,init?:any)=>{
      const url=String(input instanceof Request?input.url:input);
      if(url.includes("generativelanguage.googleapis.com"))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
      const body=JSON.parse(init.body);
      if(url==="https://api.resend.com/emails"){email++;assert.deepEqual(body.to,[settings.email]);return Response.json({id:"email-helper-ok"});}
      if(url.includes("graph.facebook.com")){whatsapp++;assert.equal(body.to,settings.whatsapp.slice(1));return Response.json({messages:[{id:"wamid.helper-ok"}]});}
      throw Error(`Unexpected request: ${url}`);
    });
    const response=await handleRequest(new Request("https://local.invalid/api/messages/assist",{method:"POST",headers:{authorization:"Bearer local-test","content-type":"application/json"},body:JSON.stringify(input)}),{...env,GEMINI_API_KEY:"mock-gemini"},{waitUntil:task=>{background.push(task);}});
    assert.equal(response.status,200);const body:any=await response.json();assert.equal(body.notification.queued,true);await Promise.all(background);assert.equal(email,1);assert.equal(whatsapp,1);
    const stored=(await ownerNotificationStatus(env)).alerts[0];assert.equal(stored.payload.originalEn,input.text);assert.equal(stored.payload.customerReplyState,"draft");assert.equal(stored.deliveries.email.state,"accepted");assert.equal(stored.deliveries.whatsapp.state,"accepted");
  }finally{db.close();}
});
