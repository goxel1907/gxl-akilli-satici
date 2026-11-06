import React,{useState} from "react";
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import ListingMascot from "./ListingMascot";

interface Offer {id:string;productType:string;title:string;description:string;tags:string[];priceUsd:number;sampleSize:number;reasonTr:string;directionTr:string;contentBudget:any;strategy?:any;}
export default function ListingOfferPicker({offers,busy,offline=false,error,note,kindLabel,onChoose,onRefresh,onChangeKind,onManual,onOpenSource}:{offers:Offer[];busy:boolean;offline?:boolean;error?:string;note?:string;kindLabel:string;onChoose:(id:string)=>void;onRefresh:()=>void;onChangeKind:()=>void;onManual:()=>void;onOpenSource:(url:string)=>void}){
  const [preview,setPreview]=useState<Offer>();
  return <View testID="listing-offer-picker">
    <View style={s.row}><Text style={s.heading}>Ne hazırlayalım?</Text><Pressable accessibilityRole="button" onPress={onChangeKind} disabled={busy||offline}><Text style={s.link}>Türü değiştir</Text></Pressable></View>
    <Text style={s.small}>Seçilen tür: {kindLabel}</Text>
    <ListingMascot step={1} title={offline?"Araştırma için internet gerekli":busy?"Rakipleri karşılaştırıyorum":offers.length?"Bir öneri seç; paketi hazırlayayım":"Ürün önerilerini hazırlayalım"} instruction={busy?"Uygun aramaları, benzer ürünleri ve fiyatları inceliyorum.":"Her kartta ürün, içerik kapsamı, ilan başlığı ve fiyat birlikte hazır. Ayrıntılarda açıklama, 13 etiket ve kaynaklar var."} actionLabel={offers.length?"Yeni öneriler araştır":"Araştır ve önerileri getir"} onAction={onRefresh} disabled={busy||offline}/>
    {busy&&<ActivityIndicator color="#315B4C"/>}
    {!!error&&<View style={s.error}><Text style={s.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={onRefresh} disabled={busy}><Text style={s.link}>Yeniden araştır</Text></Pressable></View>}
    {offers.map((offer,index)=><View key={offer.id} style={[s.card,index===0&&s.first]} testID={`listing-offer-${index+1}`}>
      <Text style={s.badge}>{index===0?"GOXI ÖNERİSİ":"ALTERNATİF"} · {index+1}</Text>
      <Text style={s.product}>{offer.productType}</Text>
      <Text style={s.price}>{offer.contentBudget.effective} {offer.contentBudget.limits.unitTr} · ${offer.priceUsd.toFixed(2)} USD</Text>
      <Text style={s.small}>{offer.reasonTr}</Text>
      <Text style={s.label}>İlan başlığı</Text><Text style={s.title}>{offer.title}</Text>
      <Text style={s.small} numberOfLines={2}>{offer.description}</Text>
      <Text style={s.small}>{offer.tags.length} etiket hazır · {offer.sampleSize} benzer ilan incelendi</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${index+1}. öneriyi seç`} style={[s.primary,(busy||offline)&&s.disabled]} disabled={busy||offline} onPress={()=>onChoose(offer.id)}><Text style={s.primaryText}>Bu öneriyi seç →</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${index+1}. önerinin ilan ayrıntıları`} style={s.secondary} onPress={()=>setPreview(offer)}><Text style={s.link}>Açıklama, etiketler ve rakip dayanağı</Text></Pressable>
    </View>)}
    {!!note&&<Text style={s.small}>{note}</Text>}
    <Pressable accessibilityRole="button" style={s.secondary} onPress={onManual} disabled={busy}><Text style={s.link}>Konumu veya kapsamı kendim belirleyeceğim</Text></Pressable>
    <Modal visible={Boolean(preview)} animationType="slide" onRequestClose={()=>setPreview(undefined)}>
      <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.detail}>
        <View style={s.row}><Text style={s.heading}>İlan önerisi</Text><Pressable accessibilityRole="button" accessibilityLabel="Öneri ayrıntılarını kapat" onPress={()=>setPreview(undefined)}><Text style={s.link}>Kapat</Text></Pressable></View>
        {preview&&<>
          <Text style={s.title}>{preview.title}</Text>
          <Text style={s.price}>{preview.contentBudget.effective} {preview.contentBudget.limits.unitTr} · ${preview.priceUsd.toFixed(2)} USD</Text>
          <Text style={s.small}>{preview.contentBudget.basisTr}</Text>
          <Text style={s.label}>Açıklama</Text><Text style={s.body}>{preview.description}</Text>
          <Text style={s.label}>{preview.tags.length} etiket</Text><Text style={s.body}>{preview.tags.join(", ")}</Text>
          <Text style={s.label}>İçerik farkı</Text><Text style={s.body}>{preview.directionTr}</Text>
          <Text style={s.label}>Karşılaştırılan kaynaklar</Text>
          {(preview.strategy?.leaders || []).slice(0,5).map((row:any)=><View key={row.id} style={s.source}><Text style={s.body}>{row.title}</Text><Text style={s.small}>{row.priceUsd?`$${row.priceUsd} USD · `:""}{row.favorites??"?"} favori</Text>{row.url&&<Pressable accessibilityRole="button" onPress={()=>onOpenSource(row.url)}><Text style={s.link}>Kaynak ilanı aç</Text></Pressable>}</View>)}
          <Text style={s.small}>Gözlenen fiyat ve başlıklar satışın nedenini kanıtlamaz. Fiyat bir deneme adayıdır; bu öneri henüz yayımlanmış ilan değildir.</Text>
          <Pressable accessibilityRole="button" style={[s.primary,(busy||offline)&&s.disabled]} disabled={busy||offline} onPress={()=>{setPreview(undefined);onChoose(preview.id);}}><Text style={s.primaryText}>Bu öneriyi kullan →</Text></Pressable>
        </>}
      </ScrollView></SafeAreaView>
    </Modal>
  </View>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#F5F2E9"},detail:{padding:20,gap:12,paddingBottom:40},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:8},heading:{fontSize:22,fontWeight:"800",color:"#17221E"},small:{fontSize:13,lineHeight:19,color:"#66716B",marginVertical:4},label:{fontSize:13,fontWeight:"700",color:"#315B4C",marginTop:12,marginBottom:4},card:{backgroundColor:"white",borderWidth:1,borderColor:"#E0DED6",borderRadius:20,padding:18,marginVertical:8},first:{borderColor:"#315B4C",borderWidth:2},badge:{fontSize:11,fontWeight:"800",letterSpacing:1,color:"#93662C",marginBottom:8},product:{fontSize:22,fontWeight:"800",color:"#17221E"},price:{fontSize:16,fontWeight:"800",color:"#315B4C",marginVertical:8},title:{fontSize:16,fontWeight:"700",lineHeight:23,color:"#17221E"},body:{fontSize:14,lineHeight:21,color:"#344039"},primary:{backgroundColor:"#315B4C",padding:15,borderRadius:14,alignItems:"center",marginTop:14},primaryText:{fontSize:15,fontWeight:"800",color:"white"},secondary:{paddingVertical:12,alignItems:"center"},link:{fontSize:13,fontWeight:"700",color:"#315B4C"},disabled:{opacity:.45},error:{padding:14,borderRadius:12,backgroundColor:"#FFF3E8",marginVertical:10},errorText:{fontSize:14,lineHeight:21,color:"#8A4729"},source:{borderTopWidth:1,borderColor:"#E0DED6",paddingVertical:12}});
