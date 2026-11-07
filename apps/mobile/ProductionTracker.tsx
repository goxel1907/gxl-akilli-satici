import React,{useEffect,useState} from "react";
import {Alert,AppState,Modal,Pressable,ScrollView,Share,StyleSheet,Text,TextInput,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ListingMascot from "./ListingMascot";
import {PRINTABLE_WORKSPACE_KEY,parsePrintableWorkspace,type PrintableWorkspace} from "./workflow-state";
import {PRODUCTION_TRACKER_KEY,PRODUCTION_STAGES,EXTERNAL_STAGES,productionId,readProductionRecords,rememberProduction,changeProduction,syncProductionProduct,parseProductionReceipt,productionTrackingPrompt,productionContinuation,type ProductionRecord,type ProductionStage} from "./production-tracker";

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
export const syncTrackedProducts=(products:any[])=>mutateProduction(rows=>products.reduce((current,product)=>syncProductionProduct(current,product),rows));
export async function shareProductionPackage(workspace:PrintableWorkspace){
  await saveProductionWorkspace(workspace);
  const id=productionId(workspace),rows=await mutateProduction(rows=>rows),record=rows.find(row=>row.id===id)!;
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
export function ProductionWorkList({onResume,compact=false}:{onResume:(row:ProductionRecord)=>void;compact?:boolean}){
  const {rows}=useProductionRecords(),[all,setAll]=useState(false);
  const ordered=[...rows].sort((a,b)=>Number(a.stage==="published")-Number(b.stage==="published")||b.updatedAt.localeCompare(a.updatedAt)),latest=ordered[0];
  if(!latest)return null;
  return <View style={s.card} testID="production-work-list">
    <Text style={s.heading}>{compact?"Goxi ilanını takip ediyor":"Son kaydedilen çalışma"}</Text><Text style={s.name}>{latest.workspace.plan.brief.name}</Text><Text style={s.status}>{PRODUCTION_STAGES[latest.stage]}</Text>
    <Text style={s.small}>{sourceLabel(latest)} · {new Date(latest.updatedAt).toLocaleString("tr-TR")}</Text>
    <Pressable accessibilityRole="button" style={s.primary} onPress={()=>onResume(latest)}><Text style={s.white}>{compact?"İlan çalışmasına dön":"Son çalışmayı aç"}</Text></Pressable>
    {rows.length>1&&<Pressable accessibilityRole="button" style={s.secondary} onPress={()=>setAll(true)}><Text style={s.link}>Tüm çalışmalar ({rows.length})</Text></Pressable>}
    <Modal visible={all} animationType="slide" onRequestClose={()=>setAll(false)}><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}><Text style={s.heading}>İlan çalışmalarım</Text><Pressable accessibilityRole="button" onPress={()=>setAll(false)}><Text style={s.link}>Çalışma listesini kapat</Text></Pressable>{ordered.map(row=><View style={s.card} key={row.id}><Text style={s.name}>{row.workspace.plan.brief.name}</Text><Text style={s.status}>{PRODUCTION_STAGES[row.stage]}</Text><Text style={s.small}>{sourceLabel(row)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${row.workspace.plan.brief.name} çalışmasına devam et`} style={s.primary} onPress={()=>{setAll(false);onResume(row);}}><Text style={s.white}>Bu çalışmaya devam et</Text></Pressable></View>)}</ScrollView></SafeAreaView></Modal>
  </View>;
}
export default function ProductionJourney({workspace,onUpload,onOpenProduct}:{workspace:PrintableWorkspace;onUpload:()=>void;onOpenProduct:()=>void}){
  const {rows}=useProductionRecords(),id=productionId(workspace),record=rows.find(row=>row.id===id) || rememberProduction([],workspace)[0];
  const [statusModal,setStatusModal]=useState(false),[receipt,setReceipt]=useState(""),[metadata,setMetadata]=useState(false),[busy,setBusy]=useState(false);
  const tool=workspace.input.assistant==="claude"?"Claude":"ChatGPT",toTool=workspace.input.assistant==="claude"?"Claude’a":"ChatGPT’ye";
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
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#F5F2E9"},content:{padding:20,gap:10,paddingBottom:45},card:{padding:16,backgroundColor:"white",borderRadius:18,borderWidth:1,borderColor:"#DBE1DA",marginBottom:12},heading:{fontSize:16,fontWeight:"800",color:"#315B4C",marginBottom:8},name:{fontSize:17,fontWeight:"700",color:"#17221E",lineHeight:24},status:{fontSize:14,fontWeight:"700",color:"#315B4C",marginVertical:8},small:{fontSize:12,lineHeight:18,color:"#66716B",marginBottom:8},body:{fontSize:14,lineHeight:21,color:"#344039"},label:{fontSize:14,fontWeight:"700",marginVertical:10,color:"#315B4C"},primary:{backgroundColor:"#315B4C",borderRadius:12,padding:14,alignItems:"center",marginVertical:6},white:{fontWeight:"800",color:"white",textAlign:"center"},secondary:{borderWidth:1,borderColor:"#B7CFC0",borderRadius:12,padding:12,alignItems:"center",marginVertical:6},link:{fontSize:13,fontWeight:"700",color:"#315B4C"},input:{borderWidth:1,borderColor:"#B7CFC0",backgroundColor:"white",borderRadius:12,padding:12,minHeight:110,color:"#17221E"}});
