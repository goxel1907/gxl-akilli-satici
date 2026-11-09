import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ListingMascotProps {
  title: string;
  instruction: string;
  step?: number;
  complete?: boolean;
  tasks?: string[];
  roadmap?: string[];
  actionLabel?: string;
  onAction?: () => unknown;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => unknown;
}
const DIGITAL_PATH = ["Ürün ve rakip araştırması", "Üretim ve telefona indirme", "Dosya, görsel ve son kontrol", "Etsy taslağına aktarım", "Etsy kontrolü ve yayın doğrulaması"];

// A code-native character: no image download, new native package or paid API.
// Current instructions stay visible; the full roadmap is optional.
export default function ListingMascot({ title, instruction, step = 1, complete = false, tasks = [], roadmap = DIGITAL_PATH, actionLabel, onAction, disabled, secondaryLabel, onSecondary }: ListingMascotProps) {
  const [expanded, setExpanded] = useState(false);
  return <View style={s.card} testID="listing-mascot">
    <View style={s.top}>
      <View style={s.character} accessible accessibilityLabel="Goxi, GXL ilan rehberi">
        <View style={s.antenna}><View style={[s.light, complete && s.lightDone]} /></View>
        <View style={s.head}><View style={s.face}><View style={s.eyes}><View style={s.eye} /><View style={s.eye} /></View><View style={s.smile} /></View></View>
        <View style={s.body}><Text style={s.badge}>GXL</Text></View>
        <View style={s.feet}><View style={s.foot} /><View style={s.foot} /></View>
      </View>
      <View style={s.bubble}>
        <Text style={s.name}>Goxi · İlan rehberin</Text>
        <Text style={s.stage}>{complete ? "Yayın doğrulandı" : `Adım ${step}/${roadmap.length} · Şimdi bunu yap`}</Text>
        <Text style={s.title} accessibilityRole="header">{title}</Text>
      </View>
    </View>
    <Text style={s.instruction}>{instruction}</Text>
    {tasks.map((task, index) => <View style={s.task} key={task}><Text style={s.number}>{index + 1}.</Text><Text style={s.taskText}>{task}</Text></View>)}
    {!!onAction && !!actionLabel && <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onAction} style={[s.action, disabled && s.disabled]}><Text style={s.actionText}>{actionLabel}</Text></Pressable>}
    {!!onSecondary && !!secondaryLabel && <Pressable accessibilityRole="button" disabled={disabled} onPress={onSecondary} style={[s.secondary, disabled && s.disabled]}><Text style={s.secondaryText}>{secondaryLabel}</Text></Pressable>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={s.roadmapButton}><Text style={s.roadmapText}>{expanded ? "Adım listesini kapat" : "İlanın tüm adımlarını göster"}</Text></Pressable>
    {expanded && <View style={s.roadmap}>{roadmap.map((label, index) => <Text key={label} style={[s.roadmapLine, index + 1 === step && s.current]}>{index + 1}. {label}{index + 1 === step ? complete ? " · doğrulandı" : " · buradasın" : ""}</Text>)}</View>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: "#EAF2EC", borderColor: "#B7CFC0", borderWidth: 1, borderRadius: 22, padding: 14, marginBottom: 16 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  character: { width: 66, height: 90, alignItems: "center", flexShrink: 0 },
  antenna: { height: 12, width: 4, backgroundColor: "#315B4C", alignItems: "center" },
  light: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#C88B47", marginTop: -3 },
  lightDone: { backgroundColor: "#2F865E" },
  head: { width: 64, height: 45, padding: 6, borderRadius: 17, backgroundColor: "#315B4C" },
  face: { flex: 1, borderRadius: 11, backgroundColor: "#FFF9E9", alignItems: "center", paddingTop: 6 },
  eyes: { flexDirection: "row", gap: 17 }, eye: { width: 6, height: 7, borderRadius: 4, backgroundColor: "#193C31" },
  smile: { width: 16, height: 8, borderBottomWidth: 2, borderColor: "#193C31", borderRadius: 8, marginTop: 2 },
  body: { width: 40, height: 23, marginTop: 3, borderRadius: 8, backgroundColor: "#C88B47", alignItems: "center", justifyContent: "center" },
  badge: { fontSize: 11, color: "#193C31", fontWeight: "900" }, feet: { flexDirection: "row", gap: 12, marginTop: 2 }, foot: { width: 16, height: 5, borderRadius: 3, backgroundColor: "#315B4C" },
  bubble: { flex: 1, minWidth: 0 }, name: { fontSize: 13, fontWeight: "800", color: "#315B4C" }, stage: { fontSize: 11, color: "#52685B", marginTop: 4 }, title: { fontSize: 18, lineHeight: 24, fontWeight: "800", color: "#152D24", marginTop: 5 },
  instruction: { fontSize: 14, lineHeight: 21, color: "#294D3F", marginTop: 12 }, task: { flexDirection: "row", gap: 6, marginTop: 8 }, number: { fontSize: 13, lineHeight: 19, color: "#315B4C", fontWeight: "800" }, taskText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#294D3F" },
  action: { backgroundColor: "#315B4C", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", marginTop: 14 }, actionText: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: "white", textAlign: "center" }, disabled: { opacity: 0.45 },
  secondary: { borderWidth: 1, borderColor: "#90B09C", borderRadius: 12, padding: 11, alignItems: "center", marginTop: 8 }, secondaryText: { fontSize: 13, fontWeight: "800", color: "#315B4C", textAlign: "center" }, roadmapButton: { paddingVertical: 12, alignSelf: "flex-start" }, roadmapText: { fontSize: 12, fontWeight: "700", color: "#315B4C" }, roadmap: { borderTopWidth: 1, borderColor: "#C6D8CB", paddingTop: 8 }, roadmapLine: { fontSize: 12, lineHeight: 19, color: "#52685B", marginTop: 4 }, current: { fontWeight: "800", color: "#193C31" }
});
