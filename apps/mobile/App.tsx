import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();
const API_TOKEN = process.env.EXPO_PUBLIC_GXL_APP_TOKEN?.trim();
const SALES_EMAIL = "gxl.marketstudio@gmail.com";
const apiHeaders = (json = false) => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(API_TOKEN ? { authorization: `Bearer ${API_TOKEN}` } : {})
});
type Tab = "Özet" | "Onaylar" | "Fırsatlar" | "Ürünler" | "Ajan";
type ProductOrigin = "made_by_seller" | "designed_by_seller" | "vintage" | "craft_supply" | "commercial_resale" | "unknown";

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

const fallbackRadar = {
  generatedAt: "",
  policy: {
    firstContactApprovalRequired: true,
    unsolicitedBulkMessaging: false,
    automaticSendEnabled: false
  },
  sources: [
    { id: "shopier-inbound", name: "Shopier soru ve siparişleri", status: "ready", mode: "inbound", explanation: "Ürünü gören ve size ulaşan gerçek alıcı sinyalleri.", nextStep: "Soruları ve siparişleri düzenli kontrol et." },
    { id: "email-inbound", name: "E-posta talepleri", status: "ready", mode: "inbound", explanation: "GXL adresine gelen ürün soruları ve teklif talepleri.", nextStep: "Gelen mesajları izinli aday havuzuna al." },
    { id: "forms-referrals", name: "Formlar ve referanslar", status: "ready", mode: "opt_in", explanation: "Kampanya formu, QR kodu ve müşteri tavsiyesiyle gelen izinli adaylar.", nextStep: "Ürün gruplarına özel ilgi formu oluştur." },
    { id: "public-trends", name: "Açık web eğilimleri", status: "research_only", mode: "research", explanation: "Ürün, kategori ve ülke talebini araştırır; kişi kimliği toplamaz.", nextStep: "Talep gören kategori ve içerik fikirlerini Ajana Sor." },
    { id: "letgo-manual", name: "Letgo ilanları", status: "deferred", mode: "manual", explanation: "Ücretli ilan nedeniyle şimdilik manuel devirde.", nextStep: "Hazır başlık ve açıklamayı kopyalayıp ilanı elle yönet." }
  ],
  matches: demo.products.map((product) => ({
    productId: product.id,
    productName: product.name,
    audienceSegments: ["Ürünün kategorisiyle ilgilenen alıcılar", "Hediye arayan müşteriler", "Koleksiyon ve el işi meraklıları"],
    recommendedSources: ["Shopier soru ve siparişleri", "E-posta talepleri", "Formlar ve referanslar", "Açık web eğilimleri"],
    firstContactNeedsApproval: true
  }))
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Özet");
  const [data, setData] = useState<any>(demo);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [channels, setChannels] = useState<any>({
    shopier: { configured: false, connected: false },
    etsy: { configured: false, storageConfigured: false, connected: false }
  });
  const [radar, setRadar] = useState<any>(fallbackRadar);
  const [agentInput, setAgentInput] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMessages, setAgentMessages] = useState<any[]>([
    {
      role: "assistant",
      text: "Merhaba. Ürün, hedef kitle, kanal, ilan metni ve güvenli satış adımları hakkında Türkçe sorabilirsiniz. Gerçek kişi bulunmadığında bunu açıkça söylerim; izinsiz mesaj göndermem."
    }
  ]);

  const refresh = async () => {
    if (!API_URL) {
      setData(demo);
      setOnline(false);
      setLoading(false);
      return;
    }
    try {
      const [response, channelResponse, opportunityResponse] = await Promise.all([
        fetch(`${API_URL}/api/dashboard`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/channels/status`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/opportunities`, { headers: apiHeaders() })
      ]);
      if (!response.ok) throw new Error();
      setData(await response.json());
      if (opportunityResponse.ok) setRadar(await opportunityResponse.json());
      if (channelResponse.ok) setChannels(await channelResponse.json());
      else setChannels({
        shopier: { configured: true, connected: false, message: "Shopier durumu alınamadı." },
        etsy: { configured: true, storageConfigured: true, connected: false, message: "Etsy durumu alınamadı." }
      });
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
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, []);
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
      const response = await fetch(`${API_URL}/api/approvals/${id}/${action}`, { method: "POST", headers: apiHeaders() });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error || "Onay işlemi tamamlanamadı.");
      await refresh();
      if (action === "approve" && item) {
        await handoffMessage(item);
        Alert.alert("Onaylandı", "Mesaj otomatik gönderilmedi. Telefonun paylaşım ekranından doğru alıcıyı seçerek manuel gönderin.");
      } else {
        Alert.alert("Reddedildi", "Taslak iptal edildi.");
      }
    } catch {
      setOnline(false);
      Alert.alert("Bağlantı kesildi", "Mesaj otomatik gönderilmedi. Kanal bağlantısı yeniden kurulmalı.");
    }
  };

  const askAgent = async (suggestedMessage?: string) => {
    const message = (suggestedMessage || agentInput).trim();
    if (!message || agentBusy) return;
    setAgentMessages((current) => [...current, { role: "user", text: message }]);
    setAgentInput("");
    setAgentBusy(true);
    try {
      if (!API_URL) throw new Error("Canlı ajan sunucusu bağlı değil.");
      const response = await fetch(`${API_URL}/api/agent/chat`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ message })
      });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error || "Ajan yanıt veremedi.");
      setAgentMessages((current) => [...current, {
        role: "assistant",
        text: result.answer,
        actions: result.actions || [],
        warnings: result.warnings || [],
        requiresApproval: Boolean(result.requiresApproval)
      }]);
    } catch (error) {
      setAgentMessages((current) => [...current, {
        role: "assistant",
        text: `${error instanceof Error ? error.message : "Bağlantı kurulamadı."} Ürün kataloğu ve fırsat radarı kullanılabilir; canlı yapay zekâ yanıtı için sunucu bağlantısını yenileyin.`
      }]);
    } finally {
      setAgentBusy(false);
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
        <View style={[styles.agentBadge, !online && styles.localBadge]}><View style={[styles.dot, !online && styles.localDot]} /><Text style={styles.agentText}>{online ? "Sunucu bağlı" : "Yerel mod"}</Text></View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#C88B47" /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {tab === "Özet" && <Overview data={data} setTab={setTab} online={online} channels={channels} radar={radar} />}
          {tab === "Onaylar" && <Approvals items={pending} decide={decide} />}
          {tab === "Fırsatlar" && <Leads items={data.leads} radar={radar} />}
          {tab === "Ürünler" && <Products items={data.products} addProduct={addProduct} />}
          {tab === "Ajan" && <AgentScreen messages={agentMessages} input={agentInput} setInput={setAgentInput} onSend={askAgent} busy={agentBusy} />}
        </ScrollView>
      )}
      <View style={styles.nav}>
        {(["Özet", "Onaylar", "Fırsatlar", "Ürünler", "Ajan"] as Tab[]).map((item) => (
          <Pressable key={item} style={styles.navItem} onPress={() => setTab(item)}>
            <Ionicons name={item === "Özet" ? "grid" : item === "Onaylar" ? "checkmark-circle" : item === "Fırsatlar" ? "compass" : item === "Ürünler" ? "cube" : "sparkles"} size={21} color={tab === item ? "#C88B47" : "#748079"} />
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

async function connectEtsy() {
  if (!API_URL) {
    Alert.alert("Sunucu bağlı değil", "Önce GXL API bağlantısını yapılandırın.");
    return;
  }
  try {
    const response = await fetch(`${API_URL}/api/etsy/connect-session`, {
      method: "POST",
      headers: apiHeaders(true),
      body: JSON.stringify({ source: "gxl-mobile" })
    });
    const result = await response.json() as any;
    if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "Etsy bağlantısı başlatılamadı.");
    await openUrl(result.authorizationUrl, "Etsy yetkilendirme");
  } catch (error) {
    Alert.alert("Etsy bağlantısı", error instanceof Error ? error.message : "Bağlantı başlatılamadı.");
  }
}

function Overview({ data, setTab, online, channels, radar }: any) {
  const shopier = channels?.shopier;
  const shopierStatus = shopier?.connected
    ? `Bağlı · ${shopier.productCount} ürün · 30 günde ${shopier.recentOrderCount} sipariş`
    : shopier?.message || (shopier?.configured ? "Bağlantı doğrulanamadı" : "Bağlantı bekliyor");
  const etsy = channels?.etsy;
  const etsyAuthorized = Boolean(etsy?.authorized || etsy?.connected);
  const etsyShopReady = Boolean(etsy?.shopReady || etsy?.shopId);
  const etsyStatus = etsyShopReady
    ? `Bağlı${etsy.shopName ? ` · ${etsy.shopName}` : ""}`
    : etsyAuthorized
      ? "Hesap yetkili · mağaza kurulumu/ücret adımı bekliyor"
      : etsy?.message || (!etsy?.configured
        ? "API anahtarları bekleniyor"
        : !etsy?.storageConfigured
          ? "Güvenli token deposu bekleniyor"
          : "API hazır · Etsy hesabını yetkilendir");
  const usableSources = (radar?.sources || []).filter((source: any) => source.status === "active" || source.status === "ready" || source.status === "research_only").length;
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
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Ajan özeti</Text><Text style={styles.muted}>{data.metrics.activeLeads > 0 ? `${data.metrics.activeLeads} gerçek müşteri adayı ve ${data.metrics.pendingApprovals} onay bekleyen mesaj var.` : `Henüz gerçek müşteri adayı yok. ${usableSources} güvenli kaynak ürün ve hedef kitle fırsatları için hazır.`}</Text></View>
    </View>
    <View style={styles.homeActions}>
      <Pressable style={[styles.primary, styles.homeButton]} onPress={() => setTab("Fırsatlar")}><Text style={styles.primaryText}>Fırsat radarını aç</Text><Ionicons name="compass" size={18} color="white" /></Pressable>
      <Pressable style={[styles.secondaryButton, styles.homeButton]} onPress={() => setTab("Ajan")}><Ionicons name="sparkles" size={18} color="#315B4C" /><Text style={styles.secondaryButtonText}>Ajana Sor</Text></Pressable>
    </View>
    <Text style={styles.sectionTitle}>Kanallar</Text>
    <View style={styles.card}>
      <Channel name="WhatsApp" status="Bağlı değil · yalnızca manuel paylaşım" icon="logo-whatsapp" onPress={() => openUrl("https://wa.me/", "WhatsApp")} />
      <Channel name="Instagram / Facebook" status="Bağlı değil · yalnızca gelen kutusu açılır" icon="logo-instagram" onPress={() => openUrl("https://business.facebook.com/latest/inbox/all/", "Meta Business Suite")} />
      <Channel name="Shopier" status={shopierStatus} icon="bag-handle" connected={Boolean(shopier?.connected)} onPress={() => openUrl("https://www.shopier.com/goxsel/49555980", "Shopier")} />
      <Channel name="Letgo" status="İlanı aç · manuel devralma" icon="open-outline" onPress={() => openUrl("https://www.letgo.com/ad/1732503836", "Letgo")} />
      <Channel name="Etsy" status={etsyStatus} icon="storefront-outline" connected={etsyShopReady} onPress={() => etsyShopReady ? openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy mağaza yöneticisi") : etsyAuthorized ? openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") : connectEtsy()} />
      <Channel name="E-posta" status={SALES_EMAIL} icon="mail-outline" onPress={() => openUrl(`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("GXL Market Studio")}`, "E-posta")} />
    </View>
  </>;
}

function Metric({ value, label, icon, accent }: any) {
  return <View style={[styles.metric, accent && styles.metricAccent]}><Ionicons name={icon} size={21} color={accent ? "#C88B47" : "#315B4C"} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function Channel({ name, status, icon, onPress, connected }: any) {
  return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={onPress}><View style={styles.rowIcon}><Ionicons name={icon} size={20} color="#315B4C" /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{name}</Text><Text style={[styles.small, connected && styles.connectedText]}>{connected ? "● " : ""}{status}</Text></View><Ionicons name="chevron-forward" size={18} color="#9AA39F" /></Pressable>;
}

function Approvals({ items, decide }: any) {
  if (!items.length) return <Empty icon="checkmark-done" title="Kuyruk temiz" text="Onay bekleyen ilk mesaj bulunmuyor." />;
  return <><Text style={styles.sectionTitle}>İlk temas onayları</Text>{items.map((item: any) => <View style={styles.card} key={item.id}><View style={styles.pill}><Text style={styles.pillText}>{item.channel}</Text></View><Text style={styles.cardTitle}>Gönderilecek mesaj</Text><Text style={styles.quote}>{item.draft}</Text><View style={styles.actions}><Pressable style={styles.reject} onPress={() => decide(item.id, "reject")}><Text style={styles.rejectText}>Reddet</Text></Pressable><Pressable style={styles.approve} onPress={() => decide(item.id, "approve")}><Text style={styles.primaryText}>Onayla ve devret</Text></Pressable></View></View>)}</>;
}

function Leads({ items, radar }: any) {
  const sourceLabels: Record<string, string> = {
    active: "Canlı",
    ready: "Hazır",
    setup_required: "Bağlantı gerekli",
    deferred: "Arka planda",
    research_only: "Araştırma"
  };
  return <>
    <Text style={styles.sectionTitle}>Gerçek müşteri adayları</Text>
    {!items.length
      ? <View style={styles.truthCard}><Ionicons name="shield-checkmark-outline" size={24} color="#315B4C" /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Henüz kişi kaydı yok</Text><Text style={styles.muted}>Ajan hayali müşteri üretmez. Shopier/Etsy soruları, e-posta, formlar, referanslar ve izinli kanal etkileşimleri geldikçe gerçek kişiler burada görünür.</Text></View></View>
      : items.map((lead: any) => <View style={styles.card} key={lead.id}><View style={styles.leadTop}><View style={styles.avatar}><Text style={styles.avatarText}>{lead.displayName[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{lead.displayName}</Text><Text style={styles.small}>{lead.channel} · {lead.stage}</Text></View><View style={styles.score}><Text style={styles.scoreText}>{lead.score}</Text></View></View><Text style={styles.muted}>İlgi: {lead.interests.join(", ")}</Text></View>)}
    <Text style={styles.sectionTitle}>Çok kaynaklı fırsat radarı</Text>
    {(radar?.sources || []).map((source: any) => <View style={styles.sourceCard} key={source.id}>
      <View style={styles.sourceHeader}><Text style={styles.cardTitle}>{source.name}</Text><View style={[styles.statusPill, source.status === "active" || source.status === "ready" ? styles.statusReady : source.status === "research_only" ? styles.statusResearch : styles.statusWaiting]}><Text style={styles.statusText}>{sourceLabels[source.status] || source.status}</Text></View></View>
      <Text style={styles.muted}>{source.explanation}</Text>
      <Text style={styles.nextStep}>Sonraki adım: {source.nextStep}</Text>
    </View>)}
    <Text style={styles.sectionTitle}>Ürün–hedef kitle eşleşmeleri</Text>
    {(radar?.matches || []).map((match: any) => <View style={styles.card} key={match.productId}>
      <Text style={styles.cardTitle}>{match.productName}</Text>
      <Text style={styles.fieldLabel}>Hedef kitle</Text>
      <Text style={styles.muted}>{match.audienceSegments.join(" · ")}</Text>
      <Text style={styles.fieldLabel}>Önerilen kaynaklar</Text>
      <Text style={styles.muted}>{match.recommendedSources.join(" · ")}</Text>
      <Text style={styles.approvalNote}>İlk temas: sizin onayınız gerekir</Text>
    </View>)}
  </>;
}

function AgentScreen({ messages, input, setInput, onSend, busy }: any) {
  const suggestions = [
    "Shopier ürünlerim için hedef kitle öner",
    "Bugün hangi satış fırsatlarına odaklanmalıyım?",
    "Bir ürün için güvenli ilk mesaj taslağı yaz",
    "Etsy açılınca ilk hangi ürünü hazırlayalım?"
  ];
  return <>
    <Text style={styles.sectionTitle}>Ajana Sor</Text>
    <View style={styles.agentNotice}>
      <Ionicons name="information-circle-outline" size={22} color="#315B4C" />
      <Text style={[styles.muted, { flex: 1 }]}>Ajan katalog ve bağlı kanal verilerini kullanır. İlk mesajı siz onaylamadan göndermez; anonim ziyaretçilerin kimliğini çıkarmaz.</Text>
    </View>
    <View style={styles.quickWrap}>{suggestions.map((suggestion) => <Pressable key={suggestion} style={styles.quickButton} disabled={busy} onPress={() => onSend(suggestion)}><Text style={styles.quickText}>{suggestion}</Text></Pressable>)}</View>
    {messages.map((message: any, index: number) => <View key={`${message.role}-${index}`} style={[styles.messageBubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}>
      <Text style={message.role === "user" ? styles.userMessageText : styles.assistantMessageText}>{message.text}</Text>
      {!!message.actions?.length && <View style={styles.messageExtras}>{message.actions.map((action: string) => <Text key={action} style={styles.actionLine}>• {action}</Text>)}</View>}
      {!!message.warnings?.length && <View style={styles.messageWarning}>{message.warnings.map((warning: string) => <Text key={warning} style={styles.warningText}>• {warning}</Text>)}</View>}
      {message.requiresApproval && <Text style={styles.approvalNote}>Bu işlem ilk temas onayı gerektirir.</Text>}
    </View>)}
    {busy && <View style={[styles.messageBubble, styles.assistantBubble]}><ActivityIndicator color="#315B4C" /><Text style={styles.small}>Ajan katalog ve fırsatları inceliyor…</Text></View>}
    <View style={styles.composer}>
      <TextInput
        style={styles.agentInput}
        value={input}
        onChangeText={setInput}
        placeholder="Ajana Türkçe bir soru yazın"
        placeholderTextColor="#8D9792"
        multiline
      />
      <Pressable accessibilityRole="button" style={[styles.sendButton, (!input.trim() || busy) && styles.primaryDisabled]} disabled={!input.trim() || busy} onPress={() => onSend()}><Ionicons name="send" size={18} color="white" /></Pressable>
    </View>
  </>;
}

function Products({ items, addProduct }: any) {
  const [showForm, setShowForm] = useState(false);
  return <><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>GXL ürün kataloğu</Text><Pressable style={styles.addButton} onPress={() => setShowForm(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>Ürün ekle</Text></Pressable></View>{items.map((product: any) => { const url = product.shopierUrl || product.letgoUrl || product.etsyUrl; const imageSource = product.localImageUri ? { uri: product.localImageUri } : productImages[product.id]; return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.product, pressed && styles.rowPressed]} onPress={() => url && openUrl(url, product.name)} key={product.id}>{imageSource ? <Image source={imageSource} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="diamond-outline" size={28} color="#C88B47" /></View>}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.small}>{product.category}{product.weightGrams ? ` · ${product.weightGrams} g` : ""}</Text><Text style={styles.price}>{product.priceTry ? `${Number(product.priceTry).toLocaleString("tr-TR")} TL` : "Güncel fiyat satış sayfasında"}</Text><Text style={styles.stockNote}>{product.stockVerified ? `${product.stock} stok` : "Stok sipariş öncesi doğrulanır"}</Text>{url && <Text style={styles.linkNote}>Satış sayfasını aç →</Text>}</View></Pressable>; })}<ProductForm visible={showForm} onClose={() => setShowForm(false)} onSave={async (product: any) => { await addProduct(product); setShowForm(false); Alert.alert("Ürün eklendi", "Ürün GXL yerel kataloğuna kaydedildi."); }} /></>;
}

function ProductForm({ visible, onClose, onSave }: any) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("ürün");
  const [material, setMaterial] = useState("");
  const [origin, setOrigin] = useState<ProductOrigin>("unknown");
  const [yearMade, setYearMade] = useState("");
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [imageUri, setImageUri] = useState<string | undefined>();
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<any>();
  const [analyzing, setAnalyzing] = useState(false);

  const chooseImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Galeri izni gerekli", "Ürün fotoğrafı seçmek için galeri izni verin.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.65, base64: true });
    if (!result.canceled) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageDataUrl(asset.base64 ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}` : undefined);
      setAnalysis(undefined);
    }
  };
  const analyze = async () => {
    if (!imageDataUrl) return Alert.alert("Fotoğraf gerekli", "Önce galeriden ürünün net fotoğrafını seçin.");
    if (!API_URL) return Alert.alert("Canlı ajan bağlantısı gerekli", "Görsel analiz için güvenli GXL sunucusu ve API bağlantısı kurulmalıdır. API anahtarı telefona kaydedilmez.");
    setAnalyzing(true);
    try {
      const response = await fetch(`${API_URL}/api/products/analyze-images`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ imageDataUrls: [imageDataUrl], sellerFacts: { name, category, material, origin, yearMade: Number(yearMade) || undefined, authenticityVerified: false } })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analiz tamamlanamadı.");
      setAnalysis(result);
      setName((current) => current.trim() || result.product.genericNameTr);
      setCategory(result.product.categoryTr || category);
    } catch (error) {
      Alert.alert("Analiz yapılamadı", error instanceof Error ? error.message : "Sunucu bağlantısını kontrol edin.");
    } finally {
      setAnalyzing(false);
    }
  };
  const save = () => {
    if (!name.trim()) return Alert.alert("Ürün adı gerekli", "Lütfen ürün adını yazın.");
    onSave({ id: `gxl-local-${Date.now()}`, name: name.trim(), category: category.trim() || "ürün", material: material.trim(), origin, yearMade: Number(yearMade) || undefined, weightGrams: Number(weight) || undefined, priceTry: Number(price) || undefined, stock: Number(stock) || 0, stockVerified: true, localImageUri: imageUri, analysis });
    setName(""); setCategory("ürün"); setMaterial(""); setOrigin("unknown"); setYearMade(""); setWeight(""); setPrice(""); setStock("1"); setImageUri(undefined); setImageDataUrl(undefined); setAnalysis(undefined);
  };
  const origins: Array<[ProductOrigin, string]> = [["made_by_seller", "Ben ürettim"], ["designed_by_seller", "Ben tasarladım"], ["vintage", "Vintage"], ["craft_supply", "El işi malzemesi"], ["commercial_resale", "Hazır ürün"], ["unknown", "Bilmiyorum"]];
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={styles.sectionTitle}>Akıllı ürün ekle</Text><Pressable onPress={onClose}><Ionicons name="close" size={28} color="#17221E" /></Pressable></View>
      <Pressable style={styles.imagePicker} onPress={chooseImage}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.formImage} /> : <><Ionicons name="camera-outline" size={32} color="#315B4C" /><Text style={styles.rowTitle}>Ürün fotoğrafını seç</Text><Text style={styles.small}>Etiket, damga ve kusurlar net görünsün</Text></>}</Pressable>
      <Text style={styles.fieldLabel}>Ürün kaynağı</Text>
      <View style={styles.chips}>{origins.map(([value, label]) => <Pressable key={value} style={[styles.chip, origin === value && styles.chipActive]} onPress={() => setOrigin(value)}><Text style={[styles.chipText, origin === value && styles.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <Field label="Üretim yılı" value={yearMade} onChangeText={setYearMade} placeholder="Vintage ise doğrulanmış yıl" keyboardType="number-pad" />
      <Field label="Ürün adı" value={name} onChangeText={setName} placeholder="Boş bırakılırsa ajan önerir" />
      <Field label="Kategori" value={category} onChangeText={setCategory} placeholder="Ajan gerçek kategoriyi önerir" />
      <Field label="Malzeme" value={material} onChangeText={setMaterial} placeholder="Etiket/damga ile doğrulanmışsa yazın" />
      <Pressable style={[styles.analyzeButton, analyzing && styles.primaryDisabled]} disabled={analyzing} onPress={analyze}>{analyzing ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={19} color="white" />}<Text style={styles.primaryText}>{analyzing ? "Fotoğraf inceleniyor..." : "Ajanla analiz et ve ilanları hazırla"}</Text></Pressable>
      {analysis && <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Görsel analiz sonucu</Text>
        <Text style={styles.muted}>{analysis.product.genericNameTr} · %{Math.round(analysis.product.confidence * 100)} güven</Text>
        {analysis.product.observedFacts.map((fact: any, index: number) => <Text style={styles.analysisLine} key={`${fact.label}-${index}`}>• {fact.label}: {fact.value}</Text>)}
        {!!analysis.questions.length && <><Text style={styles.warningTitle}>Doğrulanması gerekenler</Text>{analysis.questions.map((question: string) => <Text style={styles.warningText} key={question}>• {question}</Text>)}</>}
        <Text style={styles.warningTitle}>Platform güvenlik kontrolü</Text>
        {analysis.policies.map((policy: any) => <View style={[styles.policyBox, policy.status === "blocked" ? styles.policyBlocked : policy.status === "review" ? styles.policyReview : styles.policyAllowed]} key={policy.marketplace}><Text style={styles.policyName}>{policy.marketplace.toUpperCase()}</Text><Text style={styles.policyLabel}>{policy.label}</Text><Text style={styles.small}>{policy.reasons.join(" ")}</Text>{policy.requiredEvidence.map((evidence: string) => <Text style={styles.small} key={evidence}>• {evidence}</Text>)}</View>)}
        <Text style={styles.cardTitle}>Hazır ilan başlıkları</Text>
        <Text style={styles.analysisLine}>Etsy: {analysis.listings.etsy.title}</Text>
        <Text style={styles.analysisLine}>Shopier: {analysis.listings.shopier.title}</Text>
        <Text style={styles.analysisLine}>Letgo: {analysis.listings.letgo.title}</Text>
        <Text style={styles.formHint}>{analysis.taxonomyNotice}</Text>
      </View>}
      <Field label="Ağırlık (g)" value={weight} onChangeText={setWeight} placeholder="Varsa" keyboardType="decimal-pad" />
      <Field label="Fiyat (TL)" value={price} onChangeText={setPrice} placeholder="2500" keyboardType="decimal-pad" />
      <Field label="Stok" value={stock} onChangeText={setStock} placeholder="1" keyboardType="number-pad" />
      <Pressable style={styles.primary} onPress={save}><Text style={styles.primaryText}>Onaylı bilgileri kataloğa kaydet</Text></Pressable>
      <Text style={styles.formHint}>YASAK sonucu alan ürün yayımlanamaz. İNCELEME GEREKLİ sonucu alan ürün belge veya insan onayı olmadan otomatik yayımlanmaz.</Text>
    </ScrollView></SafeAreaView>
  </Modal>;
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
  homeActions: { flexDirection: "row", gap: 9, marginBottom: 16 },
  homeButton: { flex: 1, marginBottom: 0 },
  secondaryButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#315B4C", borderRadius: 14, padding: 14, backgroundColor: "white" },
  secondaryButtonText: { color: "#315B4C", fontWeight: "800" },
  card: { backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E7E3D9" },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#17221E", marginBottom: 4 },
  muted: { color: "#68736E", lineHeight: 20 },
  small: { color: "#7A847F", fontSize: 12 },
  connectedText: { color: "#2B7A50", fontWeight: "700" },
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
  truthCard: { flexDirection: "row", gap: 12, backgroundColor: "#E7EEE9", padding: 15, borderRadius: 16, marginBottom: 14 },
  sourceCard: { backgroundColor: "white", borderRadius: 16, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: "#E7E3D9" },
  sourceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  statusReady: { backgroundColor: "#DDF2E5" },
  statusResearch: { backgroundColor: "#E8ECF7" },
  statusWaiting: { backgroundColor: "#F4E8D8" },
  statusText: { color: "#315B4C", fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  nextStep: { color: "#315B4C", fontSize: 11, fontWeight: "700", marginTop: 8 },
  approvalNote: { color: "#8A5A25", fontSize: 11, fontWeight: "800", marginTop: 9 },
  agentNotice: { flexDirection: "row", gap: 10, backgroundColor: "#E7EEE9", borderRadius: 14, padding: 13, marginBottom: 12 },
  quickWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  quickButton: { backgroundColor: "white", borderWidth: 1, borderColor: "#D9D5CB", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 8 },
  quickText: { color: "#315B4C", fontSize: 10, fontWeight: "700" },
  messageBubble: { maxWidth: "92%", borderRadius: 15, padding: 13, marginBottom: 9 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#315B4C" },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: "white", borderWidth: 1, borderColor: "#E1DDD4" },
  userMessageText: { color: "white", lineHeight: 20 },
  assistantMessageText: { color: "#27332E", lineHeight: 20 },
  messageExtras: { marginTop: 9, backgroundColor: "#EEF4F0", borderRadius: 10, padding: 9 },
  actionLine: { color: "#315B4C", fontSize: 12, lineHeight: 18 },
  messageWarning: { marginTop: 9, backgroundColor: "#FFF7E8", borderRadius: 10, padding: 9 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 8, backgroundColor: "white", borderRadius: 16, padding: 8, borderWidth: 1, borderColor: "#D9D5CB" },
  agentInput: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 8, paddingVertical: 9, color: "#17221E" },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#315B4C", alignItems: "center", justifyContent: "center" },
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
  analyzeButton: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9, backgroundColor: "#A86B2E", padding: 15, borderRadius: 14, marginBottom: 16 },
  primaryDisabled: { opacity: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: "#D8D4CA", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "white" },
  chipActive: { backgroundColor: "#315B4C", borderColor: "#315B4C" },
  chipText: { color: "#56615C", fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: "white" },
  analysisCard: { backgroundColor: "white", borderRadius: 16, padding: 15, marginBottom: 16, borderWidth: 1, borderColor: "#DCD8CF" },
  analysisLine: { color: "#47514C", fontSize: 12, lineHeight: 18, marginBottom: 4 },
  warningTitle: { color: "#8A521F", fontWeight: "800", marginTop: 12, marginBottom: 5 },
  warningText: { color: "#805D38", fontSize: 12, lineHeight: 18 },
  policyBox: { borderRadius: 11, padding: 10, marginTop: 8, borderWidth: 1 },
  policyBlocked: { backgroundColor: "#FFF0F0", borderColor: "#D96060" },
  policyReview: { backgroundColor: "#FFF8E8", borderColor: "#D6A04E" },
  policyAllowed: { backgroundColor: "#ECF7F0", borderColor: "#64A47A" },
  policyName: { color: "#17221E", fontSize: 11, fontWeight: "900" },
  policyLabel: { color: "#303B36", fontSize: 12, fontWeight: "800", marginVertical: 3 },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 78, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#E3E0D8", flexDirection: "row", paddingBottom: 10 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navText: { color: "#748079", fontSize: 9, fontWeight: "600" },
  navTextActive: { color: "#A86B2E" }
});
