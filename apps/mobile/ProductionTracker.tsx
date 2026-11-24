import React,{useEffect,useState} from "react";
import {Alert,AppState,Linking,Modal,Pressable,ScrollView,Share,StyleSheet,Text,TextInput,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ListingMascot from "./ListingMascot";
import {PRINTABLE_WORKSPACE_KEY,generationKey,parsePrintableWorkspace,type PrintableWorkspace} from "./workflow-state";
import {assistantAcc,assistantHome,assistantName,assistantTo} from "./assistants";
import {AgentPipeline,useAgentTeam} from "./AgentTeam";
import {ASSISTANTS,isAssistant} from "./assistants";
import {markPublishedFromEtsy,PRODUCTION_TRACKER_KEY,PRODUCTION_STAGES,EXTERNAL_STAGES,productionId,readProductionRecords,rememberProduction,changeProduction,syncProductionProduct,parseProductionReceipt,productionTrackingPrompt,productionContinuation,savedConversationUrl,setProductionConversation,removeProduction,type ProductionRecord,type ProductionStage} from "./production-tracker";

const ACTIVE_KEY="gxl.productionActive.v1";
const listeners=new Set<(rows:ProductionRecord[])=>void>();
let writes:Promise<unknown>=Promise.resolve();
export function mutateProduction(change:(rows:ProductionRecord[])=>ProductionRecord[]):Promise<ProductionRecord[]> {
  const task=writes.then(async()=>{
    const raw=await AsyncStorage.getItem(PRODUCTION_TRACKER_KEY),rows=readProductionRecords(raw),next=change(rows);
    const encoded=JSON.stringify({version:1,records:next});if(encoded.length>20_000_000)throw new Error("Çalışma kayıtları için telefon depolama sınırına ulaşıldı.");
    if(JSON.stringify(rows)!==JSON.stringify(next))await AsyncStorage.setItem(PRODUCTION_TRACKER_KEY,encoded);
    listeners.forEach(listener=>listener(next));return next;
  });writes=task.catch(()=>undefined);return task;
}
export async function restoreProductions(){
  return mutateProduction(rows=>rows).then(async rows=>{
    const legacy=parsePrintableWorkspace(await AsyncStorage.getItem(PRINTABLE_WORKSPACE_KEY));
    if(legacy&&!rows.some(row=>row.id===productionId(legacy)))return mutateProduction(current=>changeProduction(rememberProduction(current,legacy),productionId(legacy),"status_unknown","app"));
    return rows;
  });
}
// Çalışmayı telefondan kaldırır; açık çalışma buysa geri yüklenmesin diye o kayıt da silinir.
export async function deleteProduction(id:string){
  await mutateProduction(rows=>removeProduction(rows,id));
  const legacy=parsePrintableWorkspace(await AsyncStorage.getItem(PRINTABLE_WORKSPACE_KEY));
  if(legacy&&productionId(legacy)===id)await AsyncStorage.removeItem(PRINTABLE_WORKSPACE_KEY);
  if(await AsyncStorage.getItem(ACTIVE_KEY)===id)await AsyncStorage.removeItem(ACTIVE_KEY);
}
export async function saveProductionWorkspace(workspace:PrintableWorkspace){
  await mutateProduction(rows=>rememberProduction(rows,workspace));
  await AsyncStorage.setItem(PRINTABLE_WORKSPACE_KEY,JSON.stringify(workspace));
  await AsyncStorage.setItem(ACTIVE_KEY,productionId(workspace));
}
export async function activeProduction(rows:ProductionRecord[]){
  const selected=await AsyncStorage.getItem(ACTIVE_KEY);
  return rows.find(row=>row.id===selected&&row.stage!=="published") || [...rows].filter(row=>row.stage!=="published").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
}
export const syncTrackedProduct=(product:any,status?:any,invalidate=false)=>mutateProduction(rows=>syncProductionProduct(rows,product,status,invalidate));
export const markTrackedPublished=(listings:Array<{listingId:number;title:string;state?:string}>)=>mutateProduction(rows=>markPublishedFromEtsy(rows,listings));
export const syncTrackedProducts=(products:any[])=>mutateProduction(rows=>products.reduce((current,product)=>syncProductionProduct(current,product),rows));
export async function shareProductionPackage(workspace:PrintableWorkspace){
  await saveProductionWorkspace(workspace);
  const id=productionId(workspace),rows=await mutateProduction(rows=>rows),record=rows.find(row=>row.id===id);
  if(!record)throw new Error("Bu çalışmanın kaydı okunamadı. Stüdyo'da çalışmayı yeniden aç ve 'Tek paketi gönder'e bas; paket ve ilan bilgileri korunuyor.");
  const opening=record.stage==="package_ready"||record.stage==="status_unknown";
  // Persist before Android can background/kill this process in another app.
  if(opening)await mutateProduction(rows=>changeProduction(rows,id,"share_opened","app"));
  try{await Share.share({message:workspace.plan.brief.masterPrompt+productionTrackingPrompt(record),title:`${workspace.plan.brief.name} - tek paket`});}
  catch(error){if(opening)await mutateProduction(rows=>rows.find(row=>row.id===id)?.stage==="share_opened"?changeProduction(rows,id,record.stage,"app"):rows);throw error;}
}
export function useProductionRecords(){
  const [rows,setRows]=useState<ProductionRecord[]>([]),[loaded,setLoaded]=useState(false);
  useEffect(()=>{let mounted=true;const accept=(value:ProductionRecord[])=>{if(mounted)setRows(value);};listeners.add(accept);restoreProductions().then(value=>{accept(value);if(mounted)setLoaded(true);}).catch(()=>{if(mounted)setLoaded(true);});const listener=AppState.addEventListener("change",state=>{if(state==="active")void restoreProductions().catch(()=>undefined);});return()=>{mounted=false;listeners.delete(accept);listener.remove();};},[]);
  return {rows,loaded};
}
const sourceLabel=(row:ProductionRecord)=>row.source==="app"?"Uygulama kaydı":row.source==="assistant"?"Asistan bildirimi; dosyalar doğrulanmadı":"Senin bildirimin";
type ApiRequest=(path:string,init?:RequestInit)=>Promise<any>;
export function ProductionWorkList({onResume,compact=false,request}:{onResume:(row:ProductionRecord,options?:{upload?:boolean})=>void;compact?:boolean;request?:ApiRequest}){
  const {rows}=useProductionRecords(),[all,setAll]=useState(false),[opened,setOpened]=useState<string>();
  const ordered=[...rows].sort((a,b)=>Number(a.stage==="published")-Number(b.stage==="published")||b.updatedAt.localeCompare(a.updatedAt)),openRows=ordered.filter(row=>row.stage!=="published"),publishedCount=rows.length-openRows.length,latest=openRows[0],selected=rows.find(row=>row.id===opened);
  const close=()=>{setAll(false);setOpened(undefined);};
  const openWork=(row:ProductionRecord)=>{setAll(false);setOpened(row.id);void saveProductionWorkspace(row.workspace).catch(()=>Alert.alert("Çalışma açıldı","Son açılan çalışma telefona kaydedilemedi. Mevcut kayıt silinmedi; depolamayı kontrol edin."));};
  // Yayına giren çalışmalar açık iş sayılmaz; yalnız "Yayınlananlar" altında durur.
  if(!latest)return compact||!publishedCount?null:<View style={s.card} testID="production-work-list">
    <Text style={s.heading}>Açık çalışma yok</Text><Text style={s.small}>Tüm ilan çalışmaların Etsy'de yayında.</Text>
    <Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setAll(true)}><Text style={s.link}>Yayınlananlar ({publishedCount})</Text></Pressable>
    <Modal visible={all||Boolean(selected)} animationType="slide" onRequestClose={close}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
      {selected?<SavedProductionDetails key={selected.id} record={selected} onClose={close} onResume={()=>{close();onResume(selected);}}/>:<><Text style={s.heading}>Yayınlanan çalışmalar</Text><Pressable accessibilityRole="button" onPress={close}><Text style={s.link}>Listeyi kapat</Text></Pressable>{ordered.map(row=><Pressable key={row.id} accessibilityRole="button" style={s.secondary} onPress={()=>openWork(row)}><Text style={s.link}>{row.workspace.plan.brief.name} · {PRODUCTION_STAGES[row.stage]}</Text></Pressable>)}</>}
    </ScrollView></SafeAreaView></Modal>
  </View>;
  return <View style={s.card} testID="production-work-list">
    <Text style={s.heading}>{compact?"Goxi ilanını takip ediyor":"Son kaydedilen çalışma"}</Text><Text style={s.name}>{latest.workspace.plan.brief.name}</Text><Text style={s.status}>{PRODUCTION_STAGES[latest.stage]}</Text>
    <Text style={s.small}>{sourceLabel(latest)} · {new Date(latest.updatedAt).toLocaleString("tr-TR")}</Text>
    <Pressable accessibilityRole="button" style={s.primary} onPress={()=>openWork(latest)}><Text style={s.white}>{compact?"İlan çalışmasına dön":"Son çalışmayı aç"}</Text></Pressable>
    {(openRows.length>1||publishedCount>0)&&<Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setAll(true)}><Text style={s.link}>{openRows.length>1?`Açık çalışmalar (${openRows.length})`:"Tüm çalışmalar"}{publishedCount?` · ${publishedCount} yayında`:""}</Text></Pressable>}
    <Modal visible={all||Boolean(selected)} animationType="slide" onRequestClose={close}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
      {selected?<SavedProductionDetails key={selected.id} record={selected} request={request} onClose={close} onResume={()=>{close();onResume(selected);}} onUpload={()=>{close();onResume(selected,{upload:true});}}/>:<><Text style={s.heading}>İlan çalışmalarım</Text><Pressable accessibilityRole="button" onPress={close}><Text style={s.link}>Çalışma listesini kapat</Text></Pressable>{ordered.map(row=><View style={s.card} key={row.id}><Text style={s.name}>{row.workspace.plan.brief.name}</Text><Text style={s.status}>{PRODUCTION_STAGES[row.stage]}</Text><Text style={s.small}>{sourceLabel(row)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${row.workspace.plan.brief.name} çalışmasına devam et`} style={s.primary} onPress={()=>openWork(row)}><Text style={s.white}>Bu çalışmaya devam et</Text></Pressable></View>)}</>}
    </ScrollView></SafeAreaView></Modal>
  </View>;
}
// Ajan hattındaki aşama: paket hazır → 2 (üretim), indirildi → 3, yüklendi → 4, taslak → 5, yayında → 6.
export function agentStage(record:ProductionRecord):number{
  if(record.stage==="published")return 6;
  if(record.productId)return record.stage==="draft"?5:4;
  return record.stage==="downloaded"||record.stage==="files_ready"?3:2;
}
// Satıcıya kalan tek iş: ajanların beklediği adım ve onu yapan düğme.
export function remainingWork(record:ProductionRecord):{titleTr:string;detailTr:string;action:"share"|"resume"|"none";labelTr:string}{
  const tool=assistantName(record.workspace.input.assistant),toTool=assistantTo(record.workspace.input.assistant);
  if(record.stage==="published")return {titleTr:"Bitti: ilan yayında",detailTr:"Reklam ve Takip ajanları ilanı izliyor. İstersen Dijital bölümünden reklam planını aç.",action:"none",labelTr:""};
  if(record.productId)return {titleTr:"Sırada: Etsy taslağı ve yayın",detailTr:"Dosyalar güvenli depoda. Yayın ajanı Etsy taslağını açar; sen Etsy'de kontrol edip Yayınla'ya basarsın.",action:"resume",labelTr:"Etsy taslağını bitir →"};
  if(record.stage==="downloaded"||record.stage==="files_ready")return {titleTr:"Sırada: dosyaları ajanlara ver",detailTr:"Dosyaları Drive'daki ya da telefondaki GXL klasörüne koy. Kalite ve Denetçi ajanları denetler, Yayın ajanı Etsy taslağını açar.",action:"resume",labelTr:"Dosyalarım hazır, ajanlara ver →"};
  if(["package_ready","status_unknown","share_opened"].includes(record.stage))return {titleTr:`Sırada: Üretim ajanı (${tool})`,detailTr:`Araştırma, seçim, fiyat ve SEO ajanları işini bitirdi. Tek paketi ${toTool} gönder; dosyaları ve ilan görsellerini o üretir. Bittiğinde dosyaları GXL klasörüne koy.`,action:"share",labelTr:`Tek paketi ${toTool} gönder`};
  return {titleTr:`Sırada: ${tool} üretimi bitirsin`,detailTr:`${tool} dosyaları hazırlıyor. Dosyalar bitince GXL klasörüne koy ve aşağıdaki düğmeye bas.`,action:"resume",labelTr:"Dosyalarım hazır, ajanlara ver →"};
}

// Paketin araştırma ve ilan bölümleri (sonradan eklenen kısımlar) yeniden yazımda aynen korunur.
const APPENDIX_MARKERS=["\n\n## Selected product design plan","\n\n## Product recommendation and originality checks","\n\n## Evidence-based market strategy"];
export function packageAppendix(masterPrompt:string):string{
  const at=APPENDIX_MARKERS.map(marker=>masterPrompt.indexOf(marker)).filter(index=>index>=0);
  return at.length?masterPrompt.slice(Math.min(...at)):"";
}
function SavedProductionDetails({record,onClose,onResume,onUpload,request}:{record:ProductionRecord;onClose:()=>void;onResume:()=>void;onUpload?:()=>void;request?:ApiRequest}){
  const {team}=useAgentTeam();
  // Üretimi başka yapay zekâya ver: paket aynı ürün adı, başlık, etiket ve fiyatla o yapay zekâya göre yeniden yazılır.
  const switchProducer=(next:string)=>run(async()=>{
    if(!request||!isAssistant(next)||next===record.workspace.input.assistant)return;
    const {workspace}=record,visual=next!=="claude"&&team.visuals!==next?team.visuals:undefined;
    const research=workspace.plan.research||{};
    const result=await request("/api/printables/repackage",{method:"POST",body:JSON.stringify({name:workspace.plan.brief.name,listing:workspace.plan.listing,input:workspace.input,assistant:next,visualAssistant:visual,priceUsd:workspace.plan.brief.priceUsd,coverColor:research.colorPlan?.coverColor,coverHex:research.colorPlan?.coverHex,crowdedColors:research.colorPlan?.crowded,appendix:packageAppendix(String(workspace.plan.brief.masterPrompt||""))})});
    if(!result?.brief?.masterPrompt||result.quality?.ok===false)throw new Error("Paket bu yapay zekâ için kalite denetiminden geçmedi; mevcut paket korunuyor.");
    // Kayıt, girdinin anahtarıyla (inputKey) doğrulanır: yapay zekâ değişince anahtar da yeniden hesaplanır, yoksa kayıt
    // bozuk sayılıp listeden düşer. Görselci girdide değil planda tutulur (Stüdyo girdisi aynı alanları taşır).
    const input={...workspace.input,assistant:next};
    const updated:PrintableWorkspace={...workspace,savedAt:new Date().toISOString(),input,plan:{...workspace.plan,inputKey:generationKey(input),visualAssistant:visual,brief:result.brief,quality:result.quality}};
    if(!parsePrintableWorkspace(JSON.stringify(updated)))throw new Error("Yeni paket kaydedilemedi; mevcut paket korunuyor.");
    await mutateProduction(rows=>rememberProduction(rows,updated));await saveProductionWorkspace(updated);
    Alert.alert("Paket hazır",`Paket ${assistantName(next)} için yeniden yazıldı. Ürün adı, başlık, etiketler ve fiyat aynı kaldı. Şimdi 'Tek paketi ${assistantTo(next)} gönder'e bas.`);
  });
  const [linkEditing,setLinkEditing]=useState(false),[link,setLink]=useState(record.conversationUrl||""),[details,setDetails]=useState(false),[busy,setBusy]=useState(false);
  const {workspace}=record,tool=assistantName(workspace.input.assistant),toolAcc=assistantAcc(workspace.input.assistant),conversation=savedConversationUrl(record.conversationUrl||"",workspace.input.assistant);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();}catch(error){Alert.alert("Çalışma işlemi tamamlanamadı",error instanceof Error?error.message:"Yeniden deneyin.");}finally{setBusy(false);}};
  return <View testID="saved-production-details">
    <Text accessibilityRole="header" style={s.heading}>Kayıtlı çalışma açıldı</Text>
    <Text style={s.name}>{workspace.plan.brief.name}</Text><Text style={s.status}>{PRODUCTION_STAGES[record.stage]}</Text><Text style={s.small}>{sourceLabel(record)} · {new Date(record.updatedAt).toLocaleString("tr-TR")}</Text>
    {(()=>{const work=remainingWork(record);return <View style={s.card} testID="saved-production-agents">
      <Text style={s.heading}>{work.titleTr}</Text>
      <Text style={s.body}>{work.detailTr}</Text>
      {work.action==="share"&&!!request&&<><Text style={s.label}>Üretimi kim yapsın?</Text><View style={s.chips}>{ASSISTANTS.map(item=><Pressable key={item.id} accessibilityRole="button" disabled={busy} style={[s.chip,workspace.input.assistant===item.id&&s.chipOn]} onPress={()=>switchProducer(item.id)}><Text style={workspace.input.assistant===item.id?s.chipTextOn:s.chipText}>{item.label}</Text></Pressable>)}</View><Text style={s.small}>Seçince paket o yapay zekâya göre yeniden yazılır; ürün adı, başlık, etiketler ve fiyat değişmez.</Text></>}
      {work.action==="share"&&<Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={()=>run(()=>shareProductionPackage(workspace))}><Text style={s.white}>{work.labelTr}</Text></Pressable>}
      {work.action!=="none"&&<Pressable accessibilityRole="button" style={work.action==="share"?s.secondary:s.primary} disabled={busy} onPress={!record.productId&&onUpload?onUpload:onResume}><Text style={work.action==="share"?s.link:s.white}>{work.action==="share"?"Dosyalarım hazır, ajanlara ver →":work.labelTr}</Text></Pressable>}
      <AgentPipeline kind="digital" stage={agentStage(record)} complete={record.stage==="published"} workspaceAssistant={workspace.input.assistant} workspaceVisual={workspace.plan.visualAssistant}/>
    </View>;})()}
    <Text style={s.body}>Bu ürünün kayıtlı paketi açık. Başlık, açıklama, etiketler, fiyat ve kapsam aşağıda korunuyor.</Text>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>Alert.alert("Çalışma silinsin mi?","Bu ilan çalışması uygulamadaki listeden kaldırılır. Etsy'deki taslağa veya ilana dokunulmaz.",[{text:"Vazgeç",style:"cancel"},{text:"Sil",style:"destructive",onPress:()=>run(async()=>{await deleteProduction(record.id);onClose();})}])}><Text style={s.link}>Bu çalışmayı listeden sil</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={()=>run(()=>Linking.openURL(conversation||assistantHome(workspace.input.assistant)))}><Text style={s.white}>{conversation?`Kaydedilmiş ${tool} sohbetini aç`:`${toolAcc} aç (sohbeti listeden seç)`}</Text></Pressable>
    <Text style={s.small}>{conversation?"Bu bağlantı senin bu ürüne bağladığın sohbeti açar. Uygulama sohbeti otomatik okumaz.":`${tool} kendi ana ekranıyla açılır ve yeni sohbet gösterir; bu normal. Bu ürünün sohbetine dönmek için ${tool}'de sol üstteki ☰ menüsünü aç, arama kutusuna "${workspace.plan.brief.name}" yaz ve o sohbeti seç. Bir daha aramamak için: sohbeti telefonda Chrome'da açıp adres çubuğundaki özel bağlantıyı (ör. chatgpt.com/c/…) aşağıdan bu ürüne kaydet; o zaman bu düğme doğrudan o sohbeti açar. Herkese açık "Paylaş" bağlantısı kullanma.`}</Text>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>setLinkEditing(!linkEditing)}><Text style={s.link}>{linkEditing?"Sohbet bağlantısı alanını kapat":conversation?"Kayıtlı sohbet bağlantısını değiştir":"Bu ürüne sohbet bağlantısı ekle"}</Text></Pressable>
    {linkEditing&&<><Text style={s.label}>Bu ürünün özel {tool} sohbet bağlantısı</Text><TextInput accessibilityLabel="Bu ürünün özel sohbet bağlantısı" style={s.input} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false}/><Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>run(async()=>{await mutateProduction(rows=>setProductionConversation(rows,record.id,link));setLinkEditing(false);})}><Text style={s.link}>Sohbet bağlantısını kaydet</Text></Pressable></>}
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>run(async()=>{await saveProductionWorkspace(workspace);await Share.share({message:productionContinuation(record),title:`${workspace.plan.brief.name} - aynı sohbete devam`});})}><Text style={s.link}>Aynı sohbete yapıştırılacak devam metnini aç</Text></Pressable>
    <Text style={s.small}>Bu düğme devam metnini paylaşım ekranında açar. Metni mevcut sohbete yapıştır; paylaşım yeni sohbet açabilir.</Text>
    <View style={s.card}><Text style={s.heading}>Seçili ilan bilgileri</Text><Text style={s.name}>{workspace.plan.listing.title}</Text><Text style={s.status}>{workspace.plan.brief.priceUsd?.toFixed(2)} USD · {workspace.plan.listing.tags.length} etiket · {workspace.input.pageCount} içerik</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setDetails(!details)}><Text style={s.link}>{details?"Çalışmanın ilan ayrıntılarını gizle":"Çalışmanın açıklama ve etiketlerini göster"}</Text></Pressable>{details&&<><Text style={s.label}>Açıklama</Text><Text style={s.body}>{workspace.plan.listing.description}</Text><Text style={s.label}>13 etiket</Text><Text style={s.body}>{workspace.plan.listing.tags.join(", ")}</Text></>}</View>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onResume}><Text style={s.link}>Bu çalışmayı Stüdyo’da sürdür</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} onPress={onClose}><Text style={s.link}>Kayıtlı çalışma ekranını kapat</Text></Pressable>
  </View>;
}
export default function ProductionJourney({workspace,onUpload,onOpenProduct}:{workspace:PrintableWorkspace;onUpload:()=>void;onOpenProduct:()=>void}){
  const {rows}=useProductionRecords(),id=productionId(workspace),record=rows.find(row=>row.id===id) || rememberProduction([],workspace)[0];
  const [statusModal,setStatusModal]=useState(false),[receipt,setReceipt]=useState(""),[metadata,setMetadata]=useState(false),[busy,setBusy]=useState(false);
  const tool=assistantName(workspace.input.assistant),toTool=assistantTo(workspace.input.assistant);
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();}catch(error){Alert.alert("Çalışma kaydedilemedi",error instanceof Error?error.message:"Telefon depolamasını kontrol edin.");}finally{setBusy(false);}};
  const update=(stage:ProductionStage,source:ProductionRecord["source"]="seller")=>run(async()=>{await saveProductionWorkspace(workspace);await mutateProduction(rows=>changeProduction(rows,id,stage,source));setStatusModal(false);setReceipt("");});
  const share=(continuation=false)=>run(async()=>{
    if(!continuation)return shareProductionPackage(workspace);
    await saveProductionWorkspace(workspace);
    await Share.share({message:productionContinuation(record),title:`${workspace.plan.brief.name} - aynı çalışmaya devam`});
  });
  const uploaded=Boolean(record.productId),downloaded=record.stage==="downloaded";
  const instruction=uploaded?record.stage==="published"?"Etsy’den son alınan durum aktif. Son doğrulama zamanı aşağıda; ilanı tekrar kontrol edebilirsin.":"Dosyaların aynı ürün kaydına bağlı. Dosya denetimi, Etsy taslağı ve yayın durumuna Dijital bölümünden devam et.":downloaded?"Son dosyaları indirdiğini bildirdin. Aynı ilan bilgileriyle dosyalarını ve gerçek önizlemeleri yükle; ardından denetim ve Etsy taslağına geçeceğiz.":record.stage==="package_ready"?`Seçili ilan bilgilerin kaydedildi. Tek paketi ${toTool} gönder; aynı sohbette üretimi tamamla.`:`${tool} sohbetini otomatik okuyamam. Aşamayı aşağıdan güncelle veya asistanın GXL durum JSON’unu içe aktar. Devam metnini kopyalayıp mevcut sohbete yapıştır; paylaşım yeni sohbet açabilir. Yeni ürün paketi başlatma.`;
  return <View testID="production-journey">
    <Text style={s.status}>Takip: {PRODUCTION_STAGES[record.stage]}</Text><Text style={s.small}>{sourceLabel(record)} · {new Date(record.updatedAt).toLocaleString("tr-TR")}</Text>
    {record.checkedAt&&<Text style={s.small}>Son Etsy doğrulaması: {record.etsyState} · {new Date(record.checkedAt).toLocaleString("tr-TR")}</Text>}
    <ListingMascot step={uploaded?record.stage==="published"||record.stage==="draft"?5:4:downloaded?3:2} complete={record.stage==="published"} title={uploaded?"Aynı ilanın Etsy adımlarına devam et":downloaded?"Dosyalarını aynı ilana yükleyelim":record.stage==="package_ready"?"Şimdi ürün dosyalarını üretelim":"Aynı ürünü takip ediyorum"} instruction={instruction} actionLabel={uploaded?"Ürün kaydı ve Etsy durumuna git":downloaded?"Dosyalarım hazır, yüklemeye geç":record.stage==="package_ready"?`Tek paketi ${toTool} gönder`:"Aynı sohbet için devam metnini aç"} onAction={uploaded?onOpenProduct:downloaded?onUpload:()=>share(record.stage!=="package_ready")} disabled={busy}/>
    <AgentPipeline kind="digital" stage={agentStage(record)} workspaceAssistant={workspace.input.assistant} workspaceVisual={workspace.plan.visualAssistant}/>
    {!uploaded&&<>
      <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>setStatusModal(true)}><Text style={s.link}>Üretim durumunu güncelle / içe aktar</Text></Pressable>
      {!downloaded&&<Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onUpload}><Text style={s.link}>Dosyalarım hazır, yüklemeye geç</Text></Pressable>}
      {record.stage!=="package_ready"&&<Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={()=>share(false)}><Text style={s.link}>Kaydedilmiş ürün paketini yeniden aç</Text></Pressable>}
    </>}
    <View style={s.card}><Text style={s.heading}>Seçili ilan bilgileri · kayıtlı</Text><Text style={s.name}>{workspace.plan.listing.title}</Text><Text style={s.status}>{workspace.plan.brief.priceUsd?.toFixed(2)} USD · {workspace.plan.listing.tags.length} etiket · {workspace.input.pageCount} içerik</Text><Text style={s.small}>SEO başlığı ve etiketler aynı ürünle korunur. Yükleme formundaki son değişiklikler ayrıca ürün kaydında saklanır.</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setMetadata(!metadata)}><Text style={s.link}>{metadata?"Seçili ilan ayrıntılarını gizle":"Seçili açıklama ve 13 etiketi göster"}</Text></Pressable>{metadata&&<><Text style={s.label}>Açıklama</Text><Text style={s.body}>{workspace.plan.listing.description}</Text><Text style={s.label}>13 etiket</Text><Text style={s.body}>{workspace.plan.listing.tags.join(", ")}</Text></>}</View>
    <Text style={s.small}>Bu çalışma telefonda kalır; uygulamayı kapatmak veya başka ürün seçmek kaydı silmez. Etsy’den aktif durum doğrulanana kadar açık çalışma olarak tutulur. Uygulama verilerini silmek veya telefonu değiştirmek bu yerel kaydı taşımaz.</Text>
    <Modal visible={statusModal} animationType="slide" onRequestClose={()=>setStatusModal(false)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}><Text style={s.heading}>{workspace.plan.brief.name}</Text><Text style={s.name}>Üretim nerede kaldı?</Text><Text style={s.small}>Aşağıdaki seçimler senin bildirimin olarak kaydedilir. İndirme veya yayın otomatik doğrulanmış sayılmaz.</Text>{EXTERNAL_STAGES.map(stage=><Pressable key={stage} accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>update(stage)}><Text style={s.link}>{stage==="generating"?"Sohbete gönderdim, üretim sürüyor":PRODUCTION_STAGES[stage]}</Text></Pressable>)}<Text style={s.label}>Sohbet durumunu içe aktar</Text><Text style={s.small}>Aynı ürüne ait GXL_PROGRESS JSON’unu yapıştır. Başlık, fiyat veya dosyalar bu metinle değiştirilmez.</Text><TextInput accessibilityLabel="GXL üretim durumu JSON" multiline style={s.input} value={receipt} onChangeText={setReceipt} autoCapitalize="none"/><Pressable accessibilityRole="button" style={s.primary} disabled={busy||!receipt.trim()} onPress={()=>{try{const stage=parseProductionReceipt(receipt,record);void update(stage,"assistant");}catch(error){Alert.alert("Durum alınamadı",(error as Error).message);}}}><Text style={s.white}>Bu ürünün durumunu kaydet</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setStatusModal(false)}><Text style={s.link}>Üretim durumunu kapat</Text></Pressable></ScrollView></SafeAreaView></Modal>
  </View>;
}
const s=StyleSheet.create({chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginVertical:6},chip:{borderWidth:1,borderColor:"#B9C7BF",borderRadius:18,paddingHorizontal:12,paddingVertical:6,backgroundColor:"#F5F2E9"},chipOn:{backgroundColor:"#315B4C",borderColor:"#315B4C"},chipText:{color:"#26302B",fontWeight:"600"},chipTextOn:{color:"#FFFFFF",fontWeight:"700"},safe:{flex:1,backgroundColor:"#F5F2E9"},content:{padding:20,gap:10,paddingBottom:45},card:{padding:16,backgroundColor:"white",borderRadius:18,borderWidth:1,borderColor:"#DBE1DA",marginBottom:12},heading:{fontSize:16,fontWeight:"800",color:"#315B4C",marginBottom:8},name:{fontSize:17,fontWeight:"700",color:"#17221E",lineHeight:24},status:{fontSize:14,fontWeight:"700",color:"#315B4C",marginVertical:8},small:{fontSize:12,lineHeight:18,color:"#66716B",marginBottom:8},body:{fontSize:14,lineHeight:21,color:"#344039"},label:{fontSize:14,fontWeight:"700",marginVertical:10,color:"#315B4C"},primary:{backgroundColor:"#315B4C",borderRadius:12,padding:14,alignItems:"center",marginVertical:6},white:{fontWeight:"800",color:"white",textAlign:"center"},secondary:{borderWidth:1,borderColor:"#B7CFC0",borderRadius:12,padding:12,alignItems:"center",marginVertical:6},link:{fontSize:13,fontWeight:"700",color:"#315B4C"},input:{borderWidth:1,borderColor:"#B7CFC0",backgroundColor:"white",borderRadius:12,padding:12,minHeight:110,color:"#17221E"}});
