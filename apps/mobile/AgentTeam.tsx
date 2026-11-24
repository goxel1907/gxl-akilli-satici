import React, { useEffect, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ASSISTANTS, assistantName, assistantTo, isAssistant, type Assistant } from "./assistants";
import { applyOpening, listingReviewPrompt, parseListingReview, planAgentTeam, type ListingReview, type ReviewContext } from "./agent-team";

export const AGENT_TEAM_KEY = "gxl.agentTeam";
interface Saved { members: Assistant[]; low: Assistant[] }
const DEFAULT: Saved = { members: ["chatgpt", "claude", "gemini"], low: [] };

export function useAgentTeam() {
  const [saved, setSaved] = useState<Saved>(DEFAULT);
  useEffect(() => {
    AsyncStorage.getItem(AGENT_TEAM_KEY).then((raw) => {
      if (!raw) return;
      const data = JSON.parse(raw);
      const members = (Array.isArray(data?.members) ? data.members : []).filter(isAssistant);
      const low = (Array.isArray(data?.low) ? data.low : []).filter(isAssistant);
      if (members.length) setSaved({ members, low });
    }).catch(() => undefined);
  }, []);
  const update = (next: Saved) => { setSaved(next); AsyncStorage.setItem(AGENT_TEAM_KEY, JSON.stringify(next)).catch(() => undefined); };
  return { ...saved, team: planAgentTeam(saved.members, saved.low), update };
}

// Üyelikler ve "kredisi az" işaretine göre görev dağıtımı; öneri üretim aracını tek dokunuşla seçer.
export function AgentTeamCard({ producer, onUseProducer, disabled }: { producer: string; onUseProducer: (value: Assistant) => void; disabled?: boolean }) {
  const { members, low, team, update } = useAgentTeam();
  const [open, setOpen] = useState(false);
  const toggle = (list: Assistant[], id: Assistant) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return <View style={s.card} testID="agent-team-card">
    <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}><Text style={s.title}>Ajan ekibi {open ? "▲" : "▼"}</Text></Pressable>
    <Text style={s.small}>{team.notesTr[0]} Denetim: {assistantName(team.reviewer)}.</Text>
    {open && <>
      <Text style={s.label}>Üyeliğim olanlar</Text>
      <View style={s.row}>{ASSISTANTS.map((item) => <Pressable key={item.id} accessibilityRole="button" style={[s.chip, members.includes(item.id) && s.chipOn]} onPress={() => { const next = toggle(members, item.id); if (next.length) update({ members: next, low: low.filter((row) => next.includes(row)) }); }}><Text style={members.includes(item.id) ? s.chipTextOn : s.chipText}>{item.label}</Text></Pressable>)}</View>
      <Text style={s.label}>Kredisi az olanlar (mümkünse kullanılmaz)</Text>
      <View style={s.row}>{ASSISTANTS.filter((item) => members.includes(item.id)).map((item) => <Pressable key={item.id} accessibilityRole="button" style={[s.chip, low.includes(item.id) && s.chipLow]} onPress={() => update({ members, low: toggle(low, item.id) })}><Text style={s.chipText}>{item.label}</Text></Pressable>)}</View>
      {team.notesTr.map((line) => <Text key={line} style={s.line}>• {line}</Text>)}
      {team.producer !== producer && <Pressable accessibilityRole="button" style={[s.button, disabled && s.disabled]} disabled={disabled} onPress={() => onUseProducer(team.producer)}><Text style={s.buttonText}>Üretimi {assistantName(team.producer)} yapsın</Text></Pressable>}
    </>}
  </View>;
}

// Denetçi ajan: bitmiş ilanı ikinci bir yapay zekâ denetler; başlık, 13 etiket ve açılış paragrafı denetimden geçerse uygulanır.
export function ListingReviewCard({ context, producer, onApply }: { context: ReviewContext; producer?: string; onApply: (next: { title: string; tags: string[]; description: string }) => void }) {
  const { team } = useAgentTeam();
  const fallback = team.reviewer !== producer ? team.reviewer : ASSISTANTS.map((item) => item.id).find((id) => id !== producer) || team.reviewer;
  const [reviewer, setReviewer] = useState<Assistant>(fallback);
  useEffect(() => setReviewer(fallback), [fallback]);
  const [requestId, setRequestId] = useState("");
  const [reply, setReply] = useState("");
  const [result, setResult] = useState<ListingReview>();
  const [error, setError] = useState("");
  const share = async () => {
    if (!context.title.trim() || context.tags.length === 0) return Alert.alert("Önce ilan bilgisi gerekli", "Başlık ve etiketler dolunca denetime gönder.");
    const id = `review-${Date.now()}`;
    try { await Share.share({ message: listingReviewPrompt(reviewer, context, id) }); setRequestId(id); setReply(""); setResult(undefined); setError(""); }
    catch (shareError) { Alert.alert("Paylaşılamadı", String((shareError as Error)?.message || shareError)); }
  };
  const read = () => {
    try { setResult(parseListingReview(reply, requestId, context)); setError(""); }
    catch (parseError) { setResult(undefined); setError(String((parseError as Error).message)); }
  };
  return <View style={s.card} testID="listing-review-card">
    <Text style={s.title}>Denetçi ajan (ikinci görüş)</Text>
    <Text style={s.small}>İlanı yayından önce başka bir yapay zekâ en çok satan rakiplere ve Etsy kurallarına göre denetler. İlan görsellerini de sohbete ekle.</Text>
    <View style={s.row}>{ASSISTANTS.map((item) => <Pressable key={item.id} accessibilityRole="button" style={[s.chip, reviewer === item.id && s.chipOn]} onPress={() => setReviewer(item.id)}><Text style={reviewer === item.id ? s.chipTextOn : s.chipText}>{item.label}</Text></Pressable>)}</View>
    {reviewer === producer && <Text style={s.warn}>Bu ilanı hazırlayan da {assistantName(reviewer)}; daha tarafsız denetim için başka bir araç seç.</Text>}
    <Pressable accessibilityRole="button" style={s.button} onPress={share}><Text style={s.buttonText}>Denetim talimatını {assistantTo(reviewer)} gönder</Text></Pressable>
    {!!requestId && <>
      <TextInput style={s.input} multiline value={reply} onChangeText={setReply} placeholder="Denetçinin verdiği JSON'u buraya yapıştır" autoCapitalize="none" />
      <Pressable accessibilityRole="button" style={s.button} onPress={read}><Text style={s.buttonText}>Denetim sonucunu oku</Text></Pressable>
    </>}
    {!!error && <Text style={s.warn}>{error}</Text>}
    {result && <>
      <Text style={s.label}>Puanlar</Text>
      <Text style={s.line}>{Object.entries(result.scores).map(([key, value]) => `${({ title: "Başlık", tags: "Etiket", description: "Açıklama", images: "Görsel", price: "Fiyat" } as Record<string, string>)[key]} ${value}/10`).join(" · ")}</Text>
      {result.issuesTr.map((line) => <Text key={line} style={s.line}>• {line}</Text>)}
      {!!result.imageFixesTr.length && <Text style={s.label}>Görselde yapılacaklar</Text>}
      {result.imageFixesTr.map((line) => <Text key={line} style={s.line}>• {line}</Text>)}
      <Text style={s.label}>Önerilen başlık</Text><Text style={s.line}>{result.title}</Text>
      <Text style={s.label}>Önerilen 13 etiket</Text><Text style={s.line}>{result.tags.join(", ")}</Text>
      {!!result.openingEn && <><Text style={s.label}>Yeni açılış paragrafı</Text><Text style={s.line}>{result.openingEn}</Text></>}
      <Pressable accessibilityRole="button" style={s.button} onPress={() => { onApply({ title: result.title, tags: result.tags, description: applyOpening(context.description, result.openingEn) }); Alert.alert("Uygulandı", "Başlık, etiketler ve açılış paragrafı güncellendi. Dosya listesi, kullanım bilgisi ve yapay zekâ beyanı aynen kaldı."); }}><Text style={s.buttonText}>Düzeltmeleri uygula</Text></Pressable>
    </>}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#E2DCCB", gap: 6 },
  title: { fontSize: 16, fontWeight: "800", color: "#1F2A24" },
  label: { fontSize: 13, fontWeight: "700", color: "#315B4C", marginTop: 6 },
  small: { fontSize: 12, color: "#5C6660" },
  line: { fontSize: 13, color: "#26302B" },
  warn: { fontSize: 13, color: "#9A3412" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#B9C7BF", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#F5F2E9" },
  chipOn: { backgroundColor: "#315B4C", borderColor: "#315B4C" },
  chipLow: { backgroundColor: "#FDE7D8", borderColor: "#E9A27A" },
  chipText: { color: "#26302B", fontWeight: "600" },
  chipTextOn: { color: "#FFFFFF", fontWeight: "700" },
  button: { backgroundColor: "#315B4C", borderRadius: 12, paddingVertical: 11, alignItems: "center", marginTop: 6 },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#D5CFBF", borderRadius: 10, padding: 10, minHeight: 90, textAlignVertical: "top", backgroundColor: "#FBFAF6" }
});
