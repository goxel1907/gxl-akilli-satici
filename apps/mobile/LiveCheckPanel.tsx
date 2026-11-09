import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { auditLiveProduct, LIVE_REPORT_KEY, liveReportText, MANUAL_LIVE_CHECKS, parseLiveReport, reportManualResult, runLiveReads, summarizeLiveReport, updateLiveRow, type LiveCheckReport, type LiveCheckStatus, type LiveEnvironment, type LiveReader } from "./live-check";

const LABEL: Record<LiveCheckStatus,string> = {pending:"Bekliyor",verified:"Canlı doğrulandı",warning:"Sınırlı / dikkat",failed:"Hata",reported:"Sen doğruladın",skipped:"Uygulanmadı"};
let reportWrites: Promise<void> = Promise.resolve();
let activeGeneration = 0;
let activeController: AbortController | undefined;
export default function LiveCheckPanel({ request, environment }: { request: LiveReader; environment: LiveEnvironment }) {
  const [open,setOpen]=useState(false),[report,setReport]=useState<LiveCheckReport>(),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [products,setProducts]=useState<Array<{id:string;name:string}>>([]),[selected,setSelected]=useState("");
  const runId=useRef(0),controller=useRef<AbortController | undefined>(undefined),latest=useRef<LiveCheckReport | undefined>(undefined);
  useEffect(()=>()=>{runId.current++;controller.current?.abort();},[]);
  const remember=(next:LiveCheckReport)=>{ latest.current=next;setReport(next);reportWrites=reportWrites.then(()=>AsyncStorage.setItem(LIVE_REPORT_KEY,liveReportText(next))).catch(()=>{setNotice("Rapor telefona kaydedilemedi. Ekranı kapatmadan sonucu paylaş.");}); };
  const toggle=async()=>{
    if(open){setOpen(false);return;}setOpen(true);
    if(busy)return;
    const identity=runId.current;
    try { await reportWrites;const restored=parseLiveReport(await AsyncStorage.getItem(LIVE_REPORT_KEY));if(identity===runId.current && restored){latest.current=restored;setReport(restored);setNotice("Önceki rapor gösteriliyor. Güncel canlı sonuç için yeni kontrol başlat.");} }
    catch {setNotice("Önceki rapor okunamadı; yeni kontrol başlatabilirsin.");}
  };
  const start=async()=>{
    const identity=++runId.current,generation=++activeGeneration;activeController?.abort();controller.current?.abort();const abort=new AbortController();controller.current=abort;activeController=abort;
    setBusy(true);setProducts([]);setSelected("");setNotice("Canlı okumalar çalışıyor. Bu ekran ilan, mesaj veya pin yayımlamaz.");
    try {
      const next=await runLiveReads(environment,request,{signal:abort.signal,storage:AsyncStorage,onProgress:value=>{if(identity===runId.current && generation===activeGeneration)remember(value);}});
      if(identity!==runId.current || generation!==activeGeneration)return;
      remember(next);setNotice(next.state==="cancelled"?"Kontrol durduruldu; denenmeyen adımlar bekliyor.":"Canlı okumalar bitti. Telefon adımları ve gerçek dosya incelemesi ayrıca bekliyor.");
      if(!abort.signal.aborted && next.checks.some(row=>row.id==="app_auth" && (row.status==="verified" || environment.testMode && row.status==="warning"))) {
        try { const body=await request("/api/digital/products",abort.signal);if(identity===runId.current && generation===activeGeneration && Array.isArray(body?.products)) setProducts(body.products.filter((row:any)=>/^[a-f0-9-]{36}$/.test(row.id) && typeof row.name==="string").map((row:any)=>({id:row.id,name:row.name.slice(0,100)}))); }
        catch {setNotice("Canlı okumalar kaydedildi; seçilebilir ürün listesi bu kez alınamadı.");}
      }
    } catch {if(identity===runId.current)setNotice("Kontrol tamamlanamadı. Son görünen sonuçlar korunuyor; yeniden deneyebilirsin.");}
    finally {if(activeController===abort)activeController=undefined;if(identity===runId.current){setBusy(false);if(generation!==activeGeneration)setNotice("Başka ekranda yeni kontrol başlatıldı; buradaki eski okuma durduruldu.");}}
  };
  const selectProduct=(id:string)=>{
    setSelected(id);
    if(latest.current)remember({...latest.current,productId:id,checks:latest.current.checks.filter(row=>row.id!=="stored_file_qa")});
  };
  const audit=async()=>{
    if(!latest.current || !selected || busy)return;
    const identity=runId.current,generation=activeGeneration,id=selected;setBusy(true);
    try {const result=await auditLiveProduct(request,id);if(identity!==runId.current || generation!==activeGeneration || !latest.current)return;
      const base={...latest.current,productId:id,checks:[...latest.current.checks.filter(row=>row.id!=="stored_file_qa"),{id:"stored_file_qa",labelTr:"Depodaki seçili ürünün dosya yapısı",source:"live_read" as const,status:"pending" as const,detailTr:""}]};
      remember(updateLiveRow(base,"stored_file_qa",environment.testMode && result.status==="verified"?"warning":result.status,`${environment.testMode?"WEB TESTİ: Yalnız tarayıcının test deposu incelendi. ":""}${result.detailTr}`));
    } finally {if(identity===runId.current)setBusy(false);}
  };
  const picker=async(kind:"file"|"image")=>{
    if(!latest.current || busy)return;const identity=runId.current,generation=activeGeneration;setBusy(true);
    try {
      const value=kind==="file"?await DocumentPicker.getDocumentAsync({type:["application/pdf","application/zip","application/x-zip-compressed"],multiple:true,copyToCacheDirectory:true}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:true,selectionLimit:10,quality:0.7});
      if(identity!==runId.current || generation!==activeGeneration || !latest.current)return;
      const count=value.canceled?0:value.assets?.length||0;
      remember(updateLiveRow(latest.current,kind==="file"?"file_picker":"image_picker",count&&!environment.testMode?"verified":"warning",count?`${environment.testMode?"WEB TESTİ: Tarayıcı seçicisidir; Android doğrulanmadı. ":""}Telefondaki seçici ${count} öğe döndürdü. İçerik veya yükleme doğrulanmadı; bu denemede dosya sunucuya gönderilmedi.`:"Seçim iptal edildi veya öğe gelmedi; başarılı dosya seçimi doğrulanmadı."));
    }catch {if(identity===runId.current && generation===activeGeneration && latest.current)remember(updateLiveRow(latest.current,kind==="file"?"file_picker":"image_picker","failed","Telefondaki seçici açılamadı veya seçim sonucu okunamadı. İzinleri ve gerçek uygulama akışını kontrol et."));}
    finally {if(identity===runId.current)setBusy(false);}
  };
  const manual=(id:string,status:"reported"|"failed"|"skipped"|"pending")=>{if(latest.current && !busy)remember(reportManualResult(latest.current,id,status));};
  const share=async()=>{if(!report)return;try{await Share.share({title:"GXL yayın öncesi canlı kontrol raporu",message:liveReportText(report)});}catch{setNotice("Paylaşım açılmadı; rapor telefonda saklanıyor.");}};
  const summary=report?summarizeLiveReport(report):undefined;
  return <View style={s.card} testID="prepublication-live-check">
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{expanded:open}}><Text style={s.title}>Yayın öncesi canlı kontrol</Text><Text style={s.body}>{open?"Kontrol ekranını kapat":"Gerçek bağlantıları telefonunda dene; sonuçları ve bekleyen adımları gör."}</Text></Pressable>
    {open && <>
      <Text style={s.note}>Otomatik bölüm canlı servisleri okur. Telefon ve asistandaki denemeler senin ayrı bildirimin olarak kaydedilir. Bu rapor yayın onayı veya tüm uygulamanın hatasızlık belgesi değildir. Yayınla düğmelerine basma.</Text>
      <Pressable style={[s.button,busy&&s.disabled]} disabled={busy} onPress={start}><Text style={s.buttonText}>{report?"Yeni canlı kontrol başlat":"Canlı okumaları başlat"}</Text></Pressable>
      {busy && <View style={s.row}><ActivityIndicator color="#315B4C"/><Text style={s.body}>Denetleniyor…</Text>{report?.state==="running"&&<Pressable style={s.smallButton} onPress={()=>controller.current?.abort()}><Text style={s.link}>Okumaları durdur</Text></Pressable>}</View>}
      {!!notice && <Text style={s.note}>{notice}</Text>}
      {report && summary && <>
        <Text style={s.label}>Rapor: {new Date(report.startedAt).toLocaleString("tr-TR")}</Text>
        <Text style={s.body}>{summary.verified} canlı doğrulama · {summary.reported} senin bildirimin · {summary.failed} hata · {summary.warning} sınırlı · {summary.pending} bekleyen · {summary.skipped} uygulanmadı</Text>
        {report.checks.filter(row=>row.source!=="seller").map(row=><View style={s.result} key={row.id}><Text style={s.label}>{row.labelTr} · {LABEL[row.status]}</Text><Text style={[s.body,row.status==="failed"&&s.error]}>{row.detailTr}</Text>{!!row.checkedAt&&<Text style={s.date}>{new Date(row.checkedAt).toLocaleString("tr-TR")}</Text>}</View>)}
        <Text style={s.label}>Gerçek telefon seçicilerini dene</Text>
        <Text style={s.body}>Seçilen öğeler bu denemede yüklenmez. Dosya adı, yolu ve görseller rapora eklenmez.</Text>
        <View style={s.row}><Pressable disabled={busy} style={s.smallButton} onPress={()=>picker("file")}><Text style={s.link}>Dosya seçiciyi dene</Text></Pressable><Pressable disabled={busy} style={s.smallButton} onPress={()=>picker("image")}><Text style={s.link}>Görsel seçiciyi dene</Text></Pressable></View>
        {!!products.length&&<><Text style={s.label}>Depodaki ürünün gerçek dosya yapısı</Text><Text style={s.body}>Bir ürün seç. Bu denetim dosyayı açar; cevap doğruluğu, tasarım ve baskı ayrıca incelenmeli.</Text>{products.map(product=><Pressable key={product.id} disabled={busy} style={[s.smallButton,selected===product.id&&s.selected]} onPress={()=>selectProduct(product.id)}><Text style={s.link}>{selected===product.id?"● ":"○ "}{product.name}</Text></Pressable>)}<Pressable disabled={busy||!selected} style={[s.button,(!selected||busy)&&s.disabled]} onPress={audit}><Text style={s.buttonText}>Seçili ürünün dosyalarını denetle</Text></Pressable></>}
        <Text style={s.title}>Tek tek gerçek akış denemeleri</Text>
        <Text style={s.note}>Yalnız gerçekten yaptığın adımı işaretle. “Sen doğruladın” otomatik veya benim bağımsız doğrulamam değildir. Bekleyen adımlar geçmiş sayılmaz.</Text>
        {MANUAL_LIVE_CHECKS.map(([id,label,instruction])=>{const row=report.checks.find(item=>item.id===id);return <View style={s.result} key={id}><Text style={s.label}>{label} · {LABEL[row?.status||"pending"]}</Text><Text style={s.body}>{instruction}</Text><View style={s.row}>{([ ["reported","Deneyip doğruladım"],["failed","Hata var"],["skipped","Bu denemede uygulanmıyor"],["pending","Sıfırla"] ] as const).map(([status,text])=><Pressable key={status} disabled={busy} style={[s.smallButton,row?.status===status&&s.selected]} onPress={()=>manual(id,status)} accessibilityLabel={`${label}: ${text}`}><Text style={s.link}>{text}</Text></Pressable>)}</View></View>;})}
        <Pressable style={[s.button,busy&&s.disabled]} disabled={busy} onPress={share}><Text style={s.buttonText}>Kontrol raporunu paylaş</Text></Pressable>
        <Text style={s.note}>Paylaşım ekranında ChatGPT’yi seçip bu konuşmaya gönder. Anahtarlar, müşteri bilgileri, ürün adları, dosya yolları ve ham servis yanıtları rapora eklenmez. Seçili ürünün kimliği yalnız ilgili denetimi eşleştirmek için bulunur.</Text>
      </>}
    </>}
  </View>;
}
const s=StyleSheet.create({card:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#B9CFC2",borderRadius:20,padding:16,marginBottom:16},title:{fontSize:18,fontWeight:"800",color:"#193C31",marginVertical:6},body:{fontSize:13,lineHeight:20,color:"#405D4F"},note:{fontSize:12,lineHeight:19,color:"#74613E",marginVertical:10},label:{fontSize:13,fontWeight:"800",lineHeight:20,color:"#193C31",marginVertical:7},button:{backgroundColor:"#315B4C",padding:13,borderRadius:12,alignItems:"center",marginVertical:9},buttonText:{color:"white",fontWeight:"800",fontSize:14,textAlign:"center"},smallButton:{padding:9,borderWidth:1,borderColor:"#CBD9CF",borderRadius:10,marginVertical:4},selected:{backgroundColor:"#DFEDE2",borderColor:"#315B4C"},link:{color:"#315B4C",fontSize:12,fontWeight:"700"},row:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"},result:{borderTopWidth:1,borderColor:"#E2E9E3",paddingTop:7,marginTop:8},error:{color:"#9B2C2C"},date:{fontSize:10,color:"#6D7B71",marginTop:5},disabled:{opacity:0.45}});
