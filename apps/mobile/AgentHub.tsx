import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AgentPipeline, AgentTeamCard, AssistantAccounts, useAgentTeam } from "./AgentTeam";
import { DriveCard } from "./DriveConnect";
import { assistantName, type Assistant } from "./assistants";

// Ajan Merkezi: sistemin başladığı yer. Satıcı iki düğmeden birine basar; ajanlar sırayla çalışır.
// Satıcıya kalan işler açıkça yazılır: dijitalde paketi bir kez göndermek ve dosyaları GXL klasörüne koymak,
// fizikselde fotoğraf çekmek ve birkaç soruyu yanıtlamak; ikisinde de Etsy'de Yayınla'ya basmak.
export function AgentHub({ onDigital, onPhysical, request, onOpen, producer, onUseProducer }: { onDigital: () => void; onPhysical: () => void; request: (path: string, init?: RequestInit) => Promise<any>; onOpen: (url: string) => void; producer?: string; onUseProducer?: (value: Assistant) => void }) {
  const { team } = useAgentTeam();
  const digitalSteps = [
    `Trend, Satış Kanıtı, Ürün Seçim, Fiyat ve SEO ajanları talebi kanıtlı ürünü seçer; başlık, 13 etiket ve açıklamayı yazar (Goxi, otomatik).`,
    `Üretim ajanı ${assistantName(team.producer)}, görsel ajanı ${assistantName(team.visuals)}: sen yalnız "Tek paketi gönder"e basarsın, dosyaları ve görselleri o üretir.`,
    "Dosyaları Drive'daki ya da telefondaki GXL klasörüne kaydet; Kalite ve Denetçi ajanları alıp denetler.",
    "Yayın ajanı Etsy taslağını kendisi açar; sen Etsy'de kontrol edip Yayınla'ya basarsın."
  ];
  const physicalSteps = [
    "Ürünün 5-10 fotoğrafını ve kısa videosunu çek.",
    "Tanıma, Uygunluk, SEO ve Kargo ajanları ürünü tanır; İngilizce başlık, etiket, açıklama, ücretsiz kargolu fiyatı doldurur. Sen yalnız fotoğrafta görünmeyenleri yanıtlarsın (kim yaptı, gram, kargo ücreti).",
    "Denetçi ajan ilanı satan rakiplere göre kendiliğinden denetler; düzeltmeleri tek dokunuşla uygularsın.",
    "Yayın ajanı taslağı açar ve eksik Etsy ayarlarını tamamlar; onayınla yayınlanır."
  ];
  return <View testID="agent-hub">
    <View style={s.hero}>
      <Text style={s.eyebrow}>AJAN MERKEZİ</Text>
      <Text style={s.heading}>Ürünü ajanlar hazırlar</Text>
      <Text style={s.lead}>Başlamak için birini seç. Sana kalan işler: dijitalde dosyaları klasöre koymak, fizikselde fotoğraf çekmek ve en sonda Etsy'de Yayınla'ya basmak.</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={onDigital}><Text style={s.primaryText}>Dijital ürün: ajanları başlat →</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.secondary} onPress={onPhysical}><Text style={s.secondaryText}>Fiziksel ürün: fotoğrafla başlat →</Text></Pressable>
    </View>
    <View style={s.card}>
      <Text style={s.title}>Dijital ürün nasıl ilerler?</Text>
      {digitalSteps.map((step, index) => <Text key={step} style={s.line}>{index + 1}. {step}</Text>)}
      <Text style={[s.title, { marginTop: 10 }]}>Fiziksel ürün nasıl ilerler?</Text>
      {physicalSteps.map((step, index) => <Text key={step} style={s.line}>{index + 1}. {step}</Text>)}
    </View>
    <AssistantAccounts />
    <AgentTeamCard producer={producer || team.producer} onUseProducer={onUseProducer || (() => undefined)} />
    <AgentPipeline kind="digital" stage={1} />
    <AgentPipeline kind="physical" stage={1} />
    <DriveCard request={request} onOpen={onOpen} />
  </View>;
}

const s = StyleSheet.create({
  hero: { backgroundColor: "#12261F", borderRadius: 18, padding: 18, gap: 10, marginBottom: 4 },
  eyebrow: { color: "#C88B47", fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  heading: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  lead: { color: "#D9E3DD", fontSize: 14, lineHeight: 20 },
  primary: { backgroundColor: "#C88B47", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  secondary: { backgroundColor: "#FFFFFF", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  secondaryText: { color: "#12261F", fontWeight: "800", fontSize: 16 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#E2DCCB", gap: 6 },
  title: { fontSize: 16, fontWeight: "800", color: "#1F2A24" },
  line: { fontSize: 13, color: "#26302B", lineHeight: 19 }
});
