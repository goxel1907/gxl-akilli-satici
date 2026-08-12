import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();
const SALES_EMAIL = "gxl.marketstudio@gmail.com";
type Tab = "Özet" | "Onaylar" | "Müşteriler" | "Ürünler";

const demo = {
  metrics: { activeLeads: 0, pendingApprovals: 0, catalogProducts: 3, conversations: 0 },
  approvals: [],
  leads: [],
  products: [
    { id: "gxl-gumus-24g", name: "925 Ayar Ay Yıldızlı Oksitli Tesbih", stock: 1, stockVerified: false, weightGrams: 24, category: "gümüş tesbih", letgoUrl: "https://www.letgo.com/ad/1732503836" },
    { id: "gxl-gumus-17g", name: "925 Ayar Arpa Kesim Tesbih", stock: 1, stockVerified: false, weightGrams: 17, category: "gümüş tesbih", letgoUrl: "https://www.letgo.com/ad/1732517403" },
    { id: "gxl-gumus-telkari", name: "925 Ayar Telkâri Tesbih", stock: 1, stockVerified: false, category: "gümüş tesbih", shopierUrl: "https://www.shopier.com/goxsel/49555980" }
  ]
};

const productImages: Record<string, any> = {
  "gxl-gumus-24g": require("./assets/products/gxl-24g-1.jpg"),
  "gxl-gumus-17g": require("./assets/products/gxl-17g-1.jpg"),
  "gxl-gumus-telkari": require("./assets/products/gxl-telkari-1.jpg")
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Özet");
  const [data, setData] = useState<any>(demo);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);

  const refresh = async () => {
    if (!API_URL) {
      setData(demo);
      setOnline(false);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/dashboard`);
      if (!response.ok) throw new Error();
      setData(await response.json());
      setOnline(true);
    } catch {
      setData(demo);
      setOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    AsyncStorage.getItem("gxl.localProducts").then((stored) => {
      if (!stored) return;
      const localProducts = JSON.parse(stored);
      setData((current: any) => ({
        ...current,
        products: [...current.products, ...localProducts],
        metrics: { ...current.metrics, catalogProducts: current.products.length + localProducts.length }
      }));
    }).catch(() => undefined);
  }, []);

  const addProduct = async (product: any) => {
    const stored = await AsyncStorage.getItem("gxl.localProducts");
    const localProducts = stored ? JSON.parse(stored) : [];
    const next = [...localProducts, product];
    await AsyncStorage.setItem("gxl.localProducts", JSON.stringify(next));
    setData((current: any) => ({
      ...current,
      products: [...current.products, product],
      metrics: { ...current.metrics, catalogProducts: current.products.length + 1 }
    }));
  };

  const pending = useMemo(() => data.approvals.filter((item: any) => item.status === "pending"), [data]);
  const handoffMessage = async (item: any) => {
    await Share.share({ message: item.draft, title: "GXL müşteri mesajı" });
  };
  const decide = async (id: string, action: "approve" | "reject") => {
    const item = data.approvals.find((approval: any) => approval.id === id);
    if (!online) {
      setData((current: any) => ({ ...current, approvals: current.approvals.map((approval: any) => approval.id === id ? { ...approval, status: action === "approve" ? "approved" : "rejected" } : approval) }));
      if (action === "approve" && item) await handoffMessage(item);
      else Alert.alert("Reddedildi", "Taslak yerel listeden kaldırıldı.");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/approvals/${id}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error();
      await refresh();
      Alert.alert(action === "approve" ? "Onaylandı" : "Reddedildi", action === "approve" ? "İlk mesaj gönderim kuyruğuna alındı." : "Taslak iptal edildi.");
    } catch {
      setOnline(false);
      Alert.alert("Bağlantı kesildi", "Mesaj otomatik gönderilmedi. Kanal bağlantısı yeniden kurulmalı.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12261F" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SATIŞ MERKEZİ</Text>
          <Text style={styles.title}>GXL Akıllı Satıcı</Text>
        </View>
        <View style={[styles.agentBadge, !online && styles.localBadge]}><View style={[styles.dot, !online && styles.localDot]} /><Text style={styles.agentText}>{online ? "Ajan bağlı" : "Yerel mod"}</Text></View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#C88B47" /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === "Özet" && <Overview data={data} setTab={setTab} online={online} />}
          {tab === "Onaylar" && <Approvals items={pending} decide={decide} />}
          {tab === "Müşteriler" && <Leads items={data.leads} />}
          {tab === "Ürünler" && <Products items={data.products} addProduct={addProduct} />}
        </ScrollView>
      )}
      <View style={styles.nav}>
        {(["Özet", "Onaylar", "Müşteriler", "Ürünler"] as Tab[]).map((item) => (
          <Pressable key={item} style={styles.navItem} onPress={() => setTab(item)}>
            <Ionicons name={item === "Özet" ? "grid" : item === "Onaylar" ? "checkmark-circle" : item === "Müşteriler" ? "people" : "cube"} size={22} color={tab === item ? "#C88B47" : "#748079"} />
            <Text style={[styles.navText, tab === item && styles.navTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

async function openUrl(url: string, label: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Açılamadı", `${label} bağlantısı bu cihazda açılamadı.`);
  }
}

function Overview({ data, setTab, online }: any) {
  return <>
    <Text style={styles.sectionTitle}>Bugünün görünümü</Text>
    <View style={styles.metrics}>
      <Metric value={data.metrics.activeLeads} label="Aktif müşteri" icon="people" />
      <Metric value={data.metrics.pendingApprovals} label="Onay bekliyor" icon="time" accent />
      <Metric value={data.metrics.catalogProducts} label="Ürün" icon="cube" />
      <Metric value={data.metrics.conversations} label="Görüşme" icon="chatbubbles" />
    </View>
    <View style={styles.callout}>
      <View style={styles.calloutIcon}><Ionicons name="sparkles" size={24} color="#C88B47" /></View>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Ajan özeti</Text><Text style={styles.muted}>{online ? `${data.metrics.activeLeads} müşteri adayı ve ${data.metrics.pendingApprovals} onay bekleyen mesaj var.` : "Yerel katalog modu. Otomatik müşteri bulma ve mesajlaşma için işletme kanallarını yetkilendirin."}</Text></View>
    </View>
    <Pressable style={styles.primary} onPress={() => setTab("Onaylar")}><Text style={styles.primaryText}>Onay kuyruğunu aç</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable>
    <Text style={styles.sectionTitle}>Kanallar</Text>
    <View style={styles.card}>
      <Channel name="WhatsApp" status="Uygulamayı aç" icon="logo-whatsapp" onPress={() => openUrl("https://wa.me/", "WhatsApp")} />
      <Channel name="Instagram / Facebook" status="Meta gelen kutusunu aç" icon="logo-instagram" onPress={() => openUrl("https://business.facebook.com/latest/inbox/all/", "Meta Business Suite")} />
      <Channel name="Shopier" status="Satış sayfasını aç" icon="bag-handle" onPress={() => openUrl("https://www.shopier.com/goxsel/49555980", "Shopier")} />
      <Channel name="Letgo" status="İlanı aç · manuel devralma" icon="open-outline" onPress={() => openUrl("https://www.letgo.com/ad/1732503836", "Letgo")} />
      <Channel name="Etsy" status="Mağaza yöneticisini aç · bağlantı gerekli" icon="storefront-outline" onPress={() => openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy")} />
      <Channel name="E-posta" status={SALES_EMAIL} icon="mail-outline" onPress={() => openUrl(`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("GXL Market Studio")}`, "E-posta")} />
    </View>
  </>;
}

function Metric({ value, label, icon, accent }: any) {
  return <View style={[styles.metric, accent && styles.metricAccent]}><Ionicons name={icon} size={21} color={accent ? "#C88B47" : "#315B4C"} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Channel({ name, status, icon, onPress }: any) {
  return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}><View style={styles.rowIcon}><Ionicons name={icon} size={20} color="#315B4C" /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{name}</Text><Text style={styles.small}>{status}</Text></View><Ionicons name="chevron-forward" size={18} color="#9AA39F" /></Pressable>;
}

function Approvals({ items, decide }: any) {
  if (!items.length) return <Empty icon="checkmark-done" title="Kuyruk temiz" text="Onay bekleyen ilk mesaj bulunmuyor." />;
  return <><Text style={styles.sectionTitle}>İlk temas onayları</Text>{items.map((item: any) => <View style={styles.card} key={item.id}><View style={styles.pill}><Text style={styles.pillText}>{item.channel}</Text></View><Text style={styles.cardTitle}>Gönderilecek mesaj</Text><Text style={styles.quote}>{item.draft}</Text><View style={styles.actions}><Pressable style={styles.reject} onPress={() => decide(item.id, "reject")}><Text style={styles.rejectText}>Reddet</Text></Pressable><Pressable style={styles.approve} onPress={() => decide(item.id, "approve")}><Text style={styles.primaryText}>Onayla ve gönder</Text></Pressable></View></View>)}</>;
}

function Leads({ items }: any) {
  if (!items.length) return <Empty icon="people-outline" title="Henüz gerçek müşteri yok" text="Meta ve WhatsApp bağlantıları tamamlanınca izinli müşteri adayları burada gösterilecek." />;
  return <><Text style={styles.sectionTitle}>Müşteri adayları</Text>{items.map((lead: any) => <View style={styles.card} key={lead.id}><View style={styles.leadTop}><View style={styles.avatar}><Text style={styles.avatarText}>{lead.displayName[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{lead.displayName}</Text><Text style={styles.small}>{lead.channel} · {lead.stage}</Text></View><View style={styles.score}><Text style={styles.scoreText}>{lead.score}</Text></View></View><Text style={styles.muted}>İlgi: {lead.interests.join(", ")}</Text></View>)}</>;
}

function Products({ items, addProduct }: any) {
  const [showForm, setShowForm] = useState(false);
  return <><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>GXL ürün kataloğu</Text><Pressable style={styles.addButton} onPress={() => setShowForm(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>Ürün ekle</Text></Pressable></View>{items.map((product: any) => { const url = product.shopierUrl || product.letgoUrl || product.etsyUrl; const imageSource = product.localImageUri ? { uri: product.localImageUri } : productImages[product.id]; return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.product, pressed && styles.rowPressed]} onPress={() => url && openUrl(url, product.name)} key={product.id}>{imageSource ? <Image source={imageSource} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="diamond-outline" size={28} color="#C88B47" /></View>}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.small}>{product.category}{product.weightGrams ? ` · ${product.weightGrams} g` : ""}</Text><Text style={styles.price}>{product.priceTry ? `${Number(product.priceTry).toLocaleString("tr-TR")} TL` : "Güncel fiyat satış sayfasında"}</Text><Text style={styles.stockNote}>{product.stockVerified ? `${product.stock} stok` : "Stok sipariş öncesi doğrulanır"}</Text>{url && <Text style={styles.linkNote}>Satış sayfasını aç →</Text>}</View></Pressable>; })}<ProductForm visible={showForm} onClose={() => setShowForm(false)} onSave={async (product: any) => { await addProduct(product); setShowForm(false); Alert.alert("Ürün eklendi", "Ürün GXL yerel kataloğuna kaydedildi."); }} /></>;
}

function ProductForm({ visible, onClose, onSave }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("ürün");
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [imageUri, setImageUri] = useState<string | undefined>();

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Galeri izni gerekli", "Ürün fotoğrafı seçmek için galeri izni verin.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };
  const save = () => {
    if (!name.trim()) return Alert.alert("Ürün adı gerekli", "Lütfen ürün adını yazın.");
    onSave({ id: `gxl-local-${Date.now()}`, name: name.trim(), category: category.trim() || "ürün", weightGrams: Number(weight) || undefined, priceTry: Number(price) || undefined, stock: Number(stock) || 0, stockVerified: true, localImageUri: imageUri });
    setName(""); setWeight(""); setPrice(""); setStock("1"); setImageUri(undefined);
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}><View style={styles.formHeader}><Text style={styles.sectionTitle}>Yeni ürün ekle</Text><Pressable onPress={onClose}><Ionicons name="close" size={28} color="#17221E" /></Pressable></View><Pressable style={styles.imagePicker} onPress={chooseImage}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.formImage} /> : <><Ionicons name="camera-outline" size={32} color="#315B4C" /><Text style={styles.rowTitle}>Galeriden fotoğraf seç</Text></>}</Pressable><Field label="Ürün adı" value={name} onChangeText={setName} placeholder="Ürünün doğrulanmış adı" /><Field label="Kategori" value={category} onChangeText={setCategory} placeholder="Ürünün gerçek kategorisi" /><Field label="Ağırlık (g)" value={weight} onChangeText={setWeight} placeholder="Varsa" keyboardType="decimal-pad" /><Field label="Fiyat (TL)" value={price} onChangeText={setPrice} placeholder="2500" keyboardType="decimal-pad" /><Field label="Stok" value={stock} onChangeText={setStock} placeholder="1" keyboardType="number-pad" /><Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Kataloğa kaydet</Text></Pressable><Text style={styles.formHint}>GXL hiçbir ürün grubuyla sınırlı değildir. Ajan her ürünü kendi kategorisi, talebi ve platform kurallarına göre ayrı değerlendirir.</Text></ScrollView></SafeAreaView></Modal>;
}

function Field({ label, ...props }: any) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#9AA39F" {...props} /></View>; }

function Empty({ icon, title, text }: any) { return <View style={styles.empty}><Ionicons name={icon} size={42} color="#315B4C" /><Text style={styles.cardTitle}>{title}</Text><Text style={styles.muted}>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F2EA" },
  header: { backgroundColor: "#12261F", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: "#C5D2CC", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  title: { color: "white", fontSize: 26, fontWeight: "800", marginTop: 3 },
  agentBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#244438", paddingVertical: 7, paddingHorizontal: 10, borderRadius: 99 },
  localBadge: { backgroundColor: "#5A4A2F" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#57D18B", marginRight: 6 },
  localDot: { backgroundColor: "#F0B35B" },
  agentText: { color: "white", fontSize: 12, fontWeight: "600" },
  content: { padding: 18, paddingBottom: 110 },
  sectionTitle: { fontSize: 19, color: "#17221E", fontWeight: "800", marginBottom: 12, marginTop: 7 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#315B4C", borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
  addButtonText: { color: "white", fontWeight: "800", fontSize: 11 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  metric: { width: "48%", backgroundColor: "white", borderRadius: 16, padding: 15, borderWidth: 1, borderColor: "#E7E3D9" },
  metricAccent: { borderColor: "#D6A368", backgroundColor: "#FFF9F0" },
  metricValue: { fontSize: 27, fontWeight: "800", color: "#17221E", marginTop: 8 },
  metricLabel: { color: "#68736E", fontSize: 12 },
  callout: { flexDirection: "row", gap: 12, backgroundColor: "#E7EEE9", padding: 15, borderRadius: 16, marginBottom: 12 },
  calloutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  primary: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, backgroundColor: "#315B4C", padding: 15, borderRadius: 14, marginBottom: 20 },
  primaryText: { color: "white", fontWeight: "800" },
  card: { backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E7E3D9" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#17221E", marginBottom: 4 },
  muted: { color: "#68736E", lineHeight: 20 },
  small: { color: "#7A847F", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0EDE6" },
  rowPressed: { opacity: 0.55 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#EDF2EF", alignItems: "center", justifyContent: "center", marginRight: 10 },
  rowTitle: { color: "#17221E", fontWeight: "700" },
  pill: { alignSelf: "flex-start", backgroundColor: "#E7EEE9", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 12 },
  pillText: { color: "#315B4C", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  quote: { color: "#3B4641", lineHeight: 21, backgroundColor: "#F7F6F2", padding: 12, borderRadius: 10, marginVertical: 8 },
  actions: { flexDirection: "row", gap: 9, marginTop: 10 },
  reject: { flex: 1, alignItems: "center", padding: 13, borderRadius: 12, borderWidth: 1, borderColor: "#D9D5CB" },
  rejectText: { color: "#5E6863", fontWeight: "700" },
  approve: { flex: 2, alignItems: "center", padding: 13, borderRadius: 12, backgroundColor: "#315B4C" },
  leadTop: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#315B4C", alignItems: "center", justifyContent: "center", marginRight: 11 },
  avatarText: { color: "white", fontWeight: "800" },
  score: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFF1D9", alignItems: "center", justifyContent: "center" },
  scoreText: { color: "#9A5C19", fontWeight: "800" },
  product: { flexDirection: "row", backgroundColor: "white", borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#E7E3D9" },
  productImage: { width: 64, height: 64, borderRadius: 13, backgroundColor: "#F2EEE5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  productImagePhoto: { width: 76, height: 76, borderRadius: 13, marginRight: 12, resizeMode: "cover" },
  price: { color: "#315B4C", fontWeight: "800", marginTop: 7 },
  stockNote: { color: "#8B6F47", fontSize: 10, marginTop: 3 },
  linkNote: { color: "#315B4C", fontSize: 11, fontWeight: "700", marginTop: 6 },
  empty: { alignItems: "center", padding: 45, gap: 8 },
  formSafe: { flex: 1, backgroundColor: "#F5F2EA" },
  formContent: { padding: 20, paddingBottom: 50 },
  formHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  imagePicker: { height: 180, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: "#AEB9B4", backgroundColor: "#EDF2EF", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 18, overflow: "hidden" },
  formImage: { width: "100%", height: "100%", resizeMode: "cover" },
  field: { marginBottom: 14 },
  fieldLabel: { color: "#315B4C", fontWeight: "800", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: "#DDD8CE", paddingHorizontal: 14, paddingVertical: 12, color: "#17221E" },
  formHint: { color: "#7A847F", fontSize: 11, lineHeight: 16, textAlign: "center" },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 78, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#E3E0D8", flexDirection: "row", paddingBottom: 10 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navText: { color: "#748079", fontSize: 10, fontWeight: "600" },
  navTextActive: { color: "#A86B2E" }
});
