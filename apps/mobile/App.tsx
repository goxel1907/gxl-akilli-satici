import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Modal, Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || "https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev";
const ACCESS_TOKEN_KEY = "gxl.appAccessToken";
let activeApiToken = "";
const SALES_EMAIL = "gxl.marketstudio@gmail.com";
const apiHeaders = (json = false) => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(activeApiToken ? { authorization: `Bearer ${activeApiToken}` } : {})
});
type Tab = "Özet" | "Shopier" | "Etsy" | "Ajan" | "Onaylar" | "Müşteriler" | "Ürünler";
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

const demoOpportunityCenter = {
  counts: { realCustomers: 0, permissionedProspects: 0, marketSignals: 3 },
  summary: "Şu an doğrulanmış müşteri adayı yok; 3 pazar sinyali ve test önerisi hazır.",
  guardrails: [
    "Kişisel veri kazıma, sahte hesap veya izinsiz toplu mesaj yok.",
    "İlk dış temas, açık izin ya da gerçek bir gelen talep yoksa işletme sahibi onayı ister.",
    "Pazar sinyalleri müşteri gibi gösterilmez."
  ],
  sources: [
    { id: "shopier", name: "Shopier", category: "Mağaza ve sipariş", status: "ready", kind: "real_customer", note: "Canlı bağlantı geldiğinde ürün ve sipariş verisi okunur." },
    { id: "etsy", name: "Etsy", category: "Uluslararası pazar yeri", status: "planned", kind: "real_customer", note: "Mağaza açılışı ve yetkilendirme sonrasında canlı çalışır." },
    { id: "permissioned_email_forms", name: "İzinli e-posta ve formlar", category: "İzinli aday", status: "ready", kind: "permissioned_prospect", note: "Yalnızca açık izin veren kişiler puanlanır." },
    { id: "search_trends", name: "Arama ve topluluk sinyalleri", category: "Talep araştırması", status: "planned", kind: "market_signal", note: "Kişi listesi değil ürün ve içerik fırsatı üretir." },
    { id: "public_b2b_requests", name: "Açık B2B alım talepleri", category: "Kurumsal fırsat", status: "manual", kind: "market_signal", note: "Talep ve işletme doğrulanmadan müşteri sayılmaz." },
    { id: "meta_channels", name: "Meta, WhatsApp ve Instagram", category: "Sosyal ve mesajlaşma", status: "planned", kind: "permissioned_prospect", note: "Kaynaklardan yalnızca biridir." }
  ],
  opportunities: [
    { id: "local-shopier-test", kind: "market_signal", sourceName: "Shopier", title: "Canlı ürün için talep testi", evidence: "Yerel modda gerçek performans verisi okunamıyor.", nextAction: "Canlı bağlantıyı yenileyip ürün bağlantısı dönüşümünü ölç.", confidence: "medium", approvalRequired: true },
    { id: "local-form", kind: "market_signal", sourceName: "İzinli form", title: "Ürün talep formu", evidence: "Henüz doğrulanmış izinli aday yok.", nextAction: "İletişim izni içeren kısa talep formu yayınla.", confidence: "high", approvalRequired: true }
  ]
};

const demoShopierCenter = {
  connected: false,
  ready: false,
  counts: { products: 0, recentOrders: 0, orderWindowDays: 30 },
  products: [],
  orders: [],
  capabilities: { readProducts: false, readOrders: false, createProducts: false, updateProducts: false, deleteProducts: false, signedWebhooks: false },
  blockers: ["Canlı Shopier satış merkezi bağlantısı bekleniyor."],
  recentWebhookEvents: []
};

const navigationTabs: Tab[] = ["Etsy", "Özet", "Shopier", "Ajan", "Onaylar", "Müşteriler", "Ürünler"];
const navigationIcons: Record<Tab, any> = {
  "Özet": "grid",
  "Shopier": "bag-handle",
  "Etsy": "color-palette",
  "Ajan": "sparkles",
  "Onaylar": "checkmark-circle",
  "Müşteriler": "people",
  "Ürünler": "cube"
};

const productImages: Record<string, any> = {
  "gxl-gumus-24g": require("./assets/products/gxl-24g-1.jpg"),
  "gxl-gumus-17g": require("./assets/products/gxl-17g-1.jpg"),
  "gxl-gumus-telkari": require("./assets/products/gxl-telkari-1.jpg")
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Etsy");
  const [data, setData] = useState<any>(demo);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [channels, setChannels] = useState<any>({
    shopier: { configured: false, connected: false },
    etsy: { configured: false, storageConfigured: false, connected: false }
  });
  const [opportunityCenter, setOpportunityCenter] = useState<any>(demoOpportunityCenter);
  const [shopierCenter, setShopierCenter] = useState<any>(demoShopierCenter);
  const [tokenReady, setTokenReady] = useState(false);
  const [apiToken, setApiToken] = useState("");

  const refresh = async () => {
    if (!API_URL) {
      setData(demo);
      setOnline(false);
      setLoading(false);
      return;
    }
    try {
      const [response, channelResponse, opportunityResponse, shopierResponse] = await Promise.all([
        fetch(`${API_URL}/api/dashboard`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/channels/status`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/opportunities`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/shopier/center`, { headers: apiHeaders() })
      ]);
      if (!response.ok) throw new Error();
      setData(await response.json());
      if (channelResponse.ok) setChannels(await channelResponse.json());
      else setChannels({
        shopier: { configured: true, connected: false, message: "Shopier durumu alınamadı." },
        etsy: { configured: true, storageConfigured: true, connected: false, message: "Etsy durumu alınamadı." }
      });
      if (opportunityResponse.ok) setOpportunityCenter(await opportunityResponse.json());
      else setOpportunityCenter(demoOpportunityCenter);
      if (shopierResponse.ok) setShopierCenter(await shopierResponse.json());
      else setShopierCenter(demoShopierCenter);
      setOnline(true);
    } catch {
      setData(demo);
      setOpportunityCenter(demoOpportunityCenter);
      setShopierCenter(demoShopierCenter);
      setOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY).then((stored) => {
      activeApiToken = stored?.trim() || "";
      setApiToken(activeApiToken);
      setTokenReady(true);
    }).catch(() => setTokenReady(true));
  }, []);
  useEffect(() => {
    if (!tokenReady) return;
    if (apiToken) refresh();
    else setLoading(false);
  }, [tokenReady, apiToken]);
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
      if (!response.ok) throw new Error();
      const result = await response.json() as any;
      await refresh();
      if (action === "approve" && result.delivery?.accepted !== true && item) {
        Alert.alert("Onaylandı", "Kanalın otomatik gönderim anahtarı bağlı değil. Onaylı taslak paylaşım ekranına aktarılıyor.");
        await handoffMessage(item);
      } else {
        Alert.alert(action === "approve" ? "Gönderildi" : "Reddedildi", action === "approve" ? "İlk mesaj bağlı kanal üzerinden gönderildi." : "Taslak iptal edildi.");
      }
    } catch {
      setOnline(false);
      Alert.alert("Bağlantı kesildi", "Mesaj otomatik gönderilmedi. Kanal bağlantısı yeniden kurulmalı.");
    }
  };

  const saveApiToken = async (value: string) => {
    const token = value.trim();
    if (token.length < 24) return Alert.alert("Anahtar çok kısa", "Cloudflare'a kaydettiğiniz APP_ACCESS_TOKEN değerini eksiksiz girin.");
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    activeApiToken = token;
    setLoading(true);
    setApiToken(token);
  };

  const resetApiToken = async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    activeApiToken = "";
    setApiToken("");
    setOnline(false);
  };

  if (!tokenReady) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 80 }} color="#C88B47" /></SafeAreaView>;
  }
  if (!apiToken) return <AccessSetup onSave={saveApiToken} />;

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
          {!online && <Pressable style={styles.tokenReset} onPress={resetApiToken}><Ionicons name="key-outline" size={16} color="#8A521F" /><Text style={styles.tokenResetText}>Bağlantı anahtarını yeniden gir</Text></Pressable>}
          {tab === "Özet" && <Overview data={data} setTab={setTab} online={online} channels={channels} />}
          {tab === "Shopier" && <ShopierScreen center={shopierCenter} online={online} onRefresh={refresh} etsyReady={Boolean(channels?.etsy?.shopReady || channels?.etsy?.shopId)} />}
          {tab === "Etsy" && <EtsyScreen online={online} channels={channels} />}
          {tab === "Ajan" && <AgentScreen center={opportunityCenter} online={online} onRefresh={refresh} />}
          {tab === "Onaylar" && <Approvals items={pending} decide={decide} />}
          {tab === "Müşteriler" && <Leads items={data.leads} />}
          {tab === "Ürünler" && <Products items={data.products} addProduct={addProduct} />}
        </ScrollView>
      )}
      <View style={styles.nav}>
        {navigationTabs.map((item) => (
          <Pressable key={item} style={styles.navItem} onPress={() => setTab(item)}>
            <Ionicons name={navigationIcons[item]} size={21} color={tab === item ? "#C88B47" : "#748079"} />
            <Text style={[styles.navText, tab === item && styles.navTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function AccessSetup({ onSave }: { onSave: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <SafeAreaView style={styles.setupSafe}>
      <StatusBar barStyle="light-content" backgroundColor="#12261F" />
      <View style={styles.setupCard}>
        <View style={styles.setupIcon}><Ionicons name="shield-checkmark" size={34} color="#F1B875" /></View>
        <Text style={styles.setupTitle}>GXL güvenli bağlantı</Text>
        <Text style={styles.setupText}>Cloudflare'a kaydettiğiniz APP_ACCESS_TOKEN değerini bir kez girin. Anahtar APK'ye gömülmez; yalnızca bu telefonun güvenli kasasında tutulur.</Text>
        <TextInput value={value} onChangeText={setValue} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="APP_ACCESS_TOKEN" style={styles.setupInput} />
        <Pressable disabled={saving} style={[styles.setupButton, saving && styles.primaryDisabled]} onPress={async () => { setSaving(true); try { await onSave(value); } finally { setSaving(false); } }}>
          <Text style={styles.setupButtonText}>{saving ? "Kaydediliyor…" : "Güvenli bağlan"}</Text>
        </Pressable>
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

function Overview({ data, setTab, online, channels }: any) {
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
      ? "Hesap yetkili · mağaza kurulumunu tamamla"
      : etsy?.message || (!etsy?.configured
        ? "API anahtarları bekleniyor"
        : !etsy?.storageConfigured
          ? "Güvenli token deposu bekleniyor"
          : "Bağlanmak için dokun");
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
    <Pressable style={styles.primary} onPress={() => setTab("Ajan")}><Text style={styles.primaryText}>Ajana sor ve fırsatları aç</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable>
    <Text style={styles.sectionTitle}>Kanallar</Text>
    <View style={styles.card}>
      <Channel name="WhatsApp" status="Uygulamayı aç" icon="logo-whatsapp" onPress={() => openUrl("https://wa.me/", "WhatsApp")} />
      <Channel name="Instagram / Facebook" status="Meta gelen kutusunu aç" icon="logo-instagram" onPress={() => openUrl("https://business.facebook.com/latest/inbox/all/", "Meta Business Suite")} />
      <Channel name="Shopier" status={shopierStatus} icon="bag-handle" connected={Boolean(shopier?.connected)} onPress={() => openUrl("https://www.shopier.com/goxsel/49555980", "Shopier")} />
      <Channel name="Letgo" status="İlanı aç · manuel devralma" icon="open-outline" onPress={() => openUrl("https://www.letgo.com/ad/1732503836", "Letgo")} />
      <Channel name="Etsy" status={etsyStatus} icon="storefront-outline" connected={etsyAuthorized} onPress={() => etsyShopReady ? Alert.alert("Etsy mağazası", "Mağaza henüz açılmadıysa kuruluma devam edin; açıldıysa mağaza yöneticisine gidin.", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kuruluma devam et", onPress: () => openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") },
        { text: "Mağaza yöneticisi", onPress: () => openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy mağaza yöneticisi") }
      ]) : etsyAuthorized ? openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") : connectEtsy()} />
      <Channel name="E-posta" status={SALES_EMAIL} icon="mail-outline" onPress={() => openUrl(`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("GXL Market Studio")}`, "E-posta")} />
    </View>
  </>;
}

function ShopierScreen({ center, online, onRefresh, etsyReady }: any) {
  const [formProduct, setFormProduct] = useState<any>(undefined);
  const [etsyProduct, setEtsyProduct] = useState<any>(undefined);
  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const products = center?.products || [];
  const orders = center?.orders || [];
  const capabilities = center?.capabilities || {};

  const openCreate = () => { setFormProduct(undefined); setFormVisible(true); };
  const openEdit = (product: any) => { setFormProduct(product); setFormVisible(true); };
  const commit = (payload: any) => {
    if (!online || !API_URL) return Alert.alert("Shopier bağlı değil", "Canlı mağazada değişiklik yapmak için GXL sunucusu bağlı olmalıdır.");
    const editing = Boolean(formProduct?.id);
    Alert.alert(
      editing ? "Shopier ürünü güncellensin mi?" : "Shopier'de ürün oluşturulsun mu?",
      editing
        ? `${formProduct.title} ürününün fiyat, stok ve ilan bilgileri canlı mağazada değişecek.`
        : `${payload.title} canlı Shopier mağazasında satışa açılacak.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: editing ? "Güncellemeyi onayla" : "Oluşturmayı onayla",
          onPress: async () => {
            setSaving(true);
            try {
              const response = await fetch(editing ? `${API_URL}/api/shopier/products/${encodeURIComponent(formProduct.id)}` : `${API_URL}/api/shopier/products`, {
                method: editing ? "PUT" : "POST",
                headers: apiHeaders(true),
                body: JSON.stringify({ ...payload, confirm: true })
              });
              const result = await response.json() as any;
              if (!response.ok) throw new Error(result.error || "Shopier ürünü kaydedilemedi.");
              setFormVisible(false);
              setFormProduct(undefined);
              await onRefresh();
              Alert.alert("Shopier güncellendi", editing ? "Canlı ürün bilgileri güncellendi." : "Yeni ürün canlı Shopier mağazasında oluşturuldu.");
            } catch (error) {
              Alert.alert("Shopier işlemi tamamlanamadı", error instanceof Error ? error.message : "Bağlantıyı kontrol edin.");
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  return <>
    <View style={[styles.shopierHero, center?.ready && styles.shopierHeroReady]}>
      <View style={styles.agentHeroTop}><View style={styles.shopierLogo}><Ionicons name="bag-handle" size={24} color="white" /></View><View style={{ flex: 1 }}><Text style={styles.agentHeroTitle}>Shopier Satış Merkezi</Text><Text style={styles.agentHeroText}>{center?.connected ? "Canlı katalog ve sipariş verisi bağlı." : "Canlı Shopier bağlantısı bekleniyor."}</Text></View><Pressable onPress={onRefresh}><Ionicons name="refresh" size={22} color="#F1B875" /></Pressable></View>
      <View style={styles.agentCounts}>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.counts?.products || 0}</Text><Text style={styles.agentCountLabel}>Canlı ürün</Text></View>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.counts?.recentOrders || 0}</Text><Text style={styles.agentCountLabel}>30 günlük sipariş</Text></View>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.ready ? "✓" : "!"}</Text><Text style={styles.agentCountLabel}>{center?.ready ? "Tam hazır" : "Eksik var"}</Text></View>
      </View>
    </View>

    <Text style={styles.sectionTitle}>Bağlantı hazırlığı</Text>
    <View style={styles.card}>
      <ReadinessRow label="Ürünleri okuma" ready={capabilities.readProducts} />
      <ReadinessRow label="Siparişleri okuma" ready={capabilities.readOrders} />
      <ReadinessRow label="Ürün oluşturma" ready={capabilities.createProducts} />
      <ReadinessRow label="Ürün ve stok güncelleme" ready={capabilities.updateProducts} />
      <ReadinessRow label="İmzalı anlık bildirimler" ready={capabilities.signedWebhooks} />
      <ReadinessRow label="Telefondan fotoğraf yükleme" ready={capabilities.mediaUpload} />
      {(center?.blockers || []).map((blocker: string) => <Text style={styles.shopierBlocker} key={blocker}>• {blocker}</Text>)}
    </View>

    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Canlı Shopier ürünleri</Text><Pressable style={[styles.addButton, !capabilities.createProducts && styles.primaryDisabled]} disabled={!capabilities.createProducts} onPress={openCreate}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>Canlı ürün</Text></Pressable></View>
    {!products.length ? <Empty icon="bag-outline" title="Canlı ürün görünmüyor" text="Shopier'e ürün eklendiğinde veya bağlantı yenilendiğinde burada görünür." /> : products.map((product: any) => <View style={styles.card} key={product.id}>
      <View style={styles.shopierProductTop}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.title}</Text><Text style={styles.small}>#{product.id} · {product.stockStatus === "outOfStock" ? "Stokta yok" : `${product.stockQuantity ?? "?"} stok`}</Text></View><Pressable style={styles.editButton} onPress={() => openEdit(product)} disabled={!capabilities.updateProducts}><Ionicons name="create-outline" size={19} color={capabilities.updateProducts ? "#315B4C" : "#A8ADA9"} /></Pressable></View>
      <Text style={styles.price}>{product.price ? `${product.price} ${product.currency || "TRY"}` : "Fiyat alınamadı"}</Text>
      {!!product.description && <Text style={styles.evidence} numberOfLines={3}>{product.description}</Text>}
      <View style={styles.inlineActions}>
        {!!product.url && <Pressable style={styles.secondaryButton} onPress={() => openUrl(product.url, product.title)}><Text style={styles.secondaryButtonText}>Satış sayfası</Text></Pressable>}
        <Pressable style={styles.secondaryButton} onPress={() => openEdit(product)} disabled={!capabilities.updateProducts}><Text style={styles.secondaryButtonText}>Fiyat / stok düzenle</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setEtsyProduct(product)} disabled={!online}><Text style={styles.secondaryButtonText}>Etsy ilanı hazırla</Text></Pressable>
      </View>
    </View>)}

    <Text style={styles.sectionTitle}>Son 30 günlük siparişler</Text>
    {!orders.length ? <Empty icon="receipt-outline" title="Henüz sipariş yok" text="Yeni Shopier siparişleri imzalı olaylarla ve yenileme sırasında burada gösterilir." /> : orders.map((order: any) => <View style={styles.card} key={order.id}>
      <View style={styles.shopierProductTop}><Text style={styles.cardTitle}>Sipariş #{order.id}</Text><Text style={styles.sourceStatus}>{order.paymentStatus || order.status || "Durum bekleniyor"}</Text></View>
      <Text style={styles.price}>{order.total || "—"} {order.currency || "TRY"}</Text>
      {(order.items || []).map((item: any, index: number) => <Text style={styles.small} key={`${order.id}-${index}`}>• {item.title || "Ürün"} × {item.quantity || 1}</Text>)}
      {!!order.dateCreated && <Text style={styles.formHint}>{new Date(order.dateCreated).toLocaleString("tr-TR")}</Text>}
    </View>)}
    <Text style={styles.formHint}>{center?.privacy || "Müşteri kişisel bilgileri bu ekranda gösterilmez."}</Text>
    <ShopierProductForm visible={formVisible} product={formProduct} saving={saving} online={online} onClose={() => setFormVisible(false)} onSave={commit} />
    <EtsyProductPlanner product={etsyProduct} etsyReady={etsyReady} onClose={() => setEtsyProduct(undefined)} />
  </>;
}

function ReadinessRow({ label, ready }: any) {
  return <View style={styles.readinessRow}><Ionicons name={ready ? "checkmark-circle" : "alert-circle"} size={20} color={ready ? "#2B7A50" : "#B06B28"} /><Text style={styles.rowTitle}>{label}</Text><Text style={[styles.readinessState, ready && styles.connectedText]}>{ready ? "Hazır" : "Bekliyor"}</Text></View>;
}

function ShopierProductForm({ visible, product, saving, online, onClose, onSave }: any) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("");
  const [shippingPrice, setShippingPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [dispatchDuration, setDispatchDuration] = useState("1");
  const [shippingPayer, setShippingPayer] = useState<"sellerPays" | "buyerPays">("sellerPays");
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(product?.title || "");
    setDescription(product?.description || "");
    setImageUrl(product?.media?.[0]?.url || "");
    setPrice(product?.basePrice || product?.price || "");
    setShippingPrice(product?.shippingPrice || "");
    setStock(String(product?.stockQuantity ?? 1));
    setDispatchDuration(String(product?.dispatchDuration || 1));
    setShippingPayer(product?.shippingPayer || "sellerPays");
  }, [visible, product]);

  const pickAndUploadImage = async () => {
    if (!online || !API_URL) return Alert.alert("Sunucu bağlantısı gerekli", "Fotoğrafı Shopier için yüklemek üzere GXL sunucusu bağlı olmalıdır.");
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.78, base64: true });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset.base64) return Alert.alert("Fotoğraf okunamadı", "Başka bir JPG veya PNG fotoğraf deneyin.");
    setUploadingImage(true);
    try {
      const response = await fetch(`${API_URL}/api/shopier/media`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ confirm: true, imageBase64: asset.base64, mimeType: asset.mimeType || "image/jpeg" })
      });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error || "Fotoğraf yüklenemedi.");
      setImageUrl(result.url);
    } catch (error) {
      Alert.alert("Fotoğraf yüklenemedi", error instanceof Error ? error.message : "Bağlantıyı kontrol edin.");
    } finally {
      setUploadingImage(false);
    }
  };

  const save = () => {
    if (!title.trim() || !price.trim()) return Alert.alert("Eksik bilgi", "Ürün adı ve fiyat gereklidir.");
    if (!product?.id && !imageUrl.trim()) return Alert.alert("Görsel bağlantısı gerekli", "Yeni Shopier ürünü için herkese açık HTTPS görsel bağlantısı gereklidir.");
    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      priceData: { currency: "TRY", price: price.trim(), ...(shippingPrice.trim() ? { shippingPrice: shippingPrice.trim() } : {}) },
      stockQuantity: Number(stock),
      shippingPayer,
      dispatchDuration: Number(dispatchDuration)
    };
    if (!product?.id) payload.type = "physical";
    if (imageUrl.trim()) payload.media = [{ type: "image", url: imageUrl.trim(), placement: 1 }];
    onSave(payload);
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={styles.sectionTitle}>{product?.id ? "Shopier ürününü düzenle" : "Shopier'de canlı ürün oluştur"}</Text><Pressable onPress={onClose}><Ionicons name="close" size={28} color="#17221E" /></Pressable></View>
      <Text style={styles.formHint}>Bu form yalnızca Shopier mağazasını değiştirir; Etsy'ye veri göndermez.</Text>
      <Field label="Ürün adı" value={title} onChangeText={setTitle} placeholder="Shopier'de görünecek başlık" />
      <Field label="Açıklama" value={description} onChangeText={setDescription} placeholder="Doğrulanmış ürün bilgileri" multiline />
      {!!imageUrl && <Image source={{ uri: imageUrl }} style={styles.shopierImagePreview} />}
      <Pressable style={[styles.secondaryButton, uploadingImage && styles.primaryDisabled]} disabled={uploadingImage} onPress={pickAndUploadImage}>{uploadingImage ? <ActivityIndicator color="#315B4C" /> : <Ionicons name="image-outline" size={18} color="#315B4C" />}<Text style={styles.secondaryButtonText}>{uploadingImage ? "Fotoğraf yükleniyor..." : "Telefondan fotoğraf seç"}</Text></Pressable>
      <Field label="Görsel URL'si (isteğe bağlı alternatif)" value={imageUrl} onChangeText={setImageUrl} placeholder="https://.../urun.jpg" autoCapitalize="none" />
      <Field label="Fiyat (TRY)" value={price} onChangeText={setPrice} placeholder="2500.00" keyboardType="decimal-pad" />
      <Field label="Kargo fiyatı (isteğe bağlı)" value={shippingPrice} onChangeText={setShippingPrice} placeholder="0.00" keyboardType="decimal-pad" />
      <Field label="Stok" value={stock} onChangeText={setStock} placeholder="1" keyboardType="number-pad" />
      <Text style={styles.fieldLabel}>Kargo ücretini kim öder?</Text>
      <View style={styles.chips}><Pressable style={[styles.chip, shippingPayer === "sellerPays" && styles.chipActive]} onPress={() => setShippingPayer("sellerPays")}><Text style={[styles.chipText, shippingPayer === "sellerPays" && styles.chipTextActive]}>Satıcı</Text></Pressable><Pressable style={[styles.chip, shippingPayer === "buyerPays" && styles.chipActive]} onPress={() => setShippingPayer("buyerPays")}><Text style={[styles.chipText, shippingPayer === "buyerPays" && styles.chipTextActive]}>Alıcı</Text></Pressable></View>
      <Text style={styles.fieldLabel}>Kargoya verme süresi</Text>
      <View style={styles.chips}>{["1", "2", "3"].map((day) => <Pressable key={day} style={[styles.chip, dispatchDuration === day && styles.chipActive]} onPress={() => setDispatchDuration(day)}><Text style={[styles.chipText, dispatchDuration === day && styles.chipTextActive]}>{day} gün</Text></Pressable>)}</View>
      <Pressable style={[styles.primary, saving && styles.primaryDisabled]} disabled={saving} onPress={save}>{saving ? <ActivityIndicator color="white" /> : <Ionicons name="shield-checkmark" size={20} color="white" />}<Text style={styles.primaryText}>{saving ? "Shopier kaydediliyor..." : "Kontrol et ve onaya sun"}</Text></Pressable>
      <Text style={styles.formHint}>Sonraki ekranda canlı Shopier mağazasında yapılacak değişiklik ayrıca sorulur. Ürün silme bu uygulamada kapalıdır.</Text>
    </ScrollView></SafeAreaView>
  </Modal>;
}

function AgentScreen({ center, online, onRefresh }: any) {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<Array<{ role: "owner" | "agent"; text: string; warnings?: string[]; actions?: string[] }>>([
    { role: "agent", text: center?.summary || "Fırsat kaynaklarını kontrol etmeye hazırım." }
  ]);

  const ask = async (preset?: string) => {
    const message = (preset || question).trim();
    if (!message || sending) return;
    setQuestion("");
    setChat((current) => [...current, { role: "owner", text: message }]);
    if (!online || !API_URL) {
      setChat((current) => [...current, {
        role: "agent",
        text: `${center?.summary || "Canlı kaynak verisi yok."} Canlı bağlantı kurulana kadar yalnızca doğrulanabilir satış testleri önerebilirim; kişi bulmuş gibi davranmam.`,
        actions: center?.opportunities?.slice(0, 2).map((item: any) => item.nextAction) || []
      }]);
      return;
    }
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/agent/chat`, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ message })
      });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error || "Ajan yanıt veremedi.");
      setChat((current) => [...current, { role: "agent", text: result.reply, warnings: result.warnings, actions: result.suggestedActions }]);
    } catch (error) {
      setChat((current) => [...current, { role: "agent", text: error instanceof Error ? error.message : "Bağlantı kesildi; tekrar deneyin." }]);
    } finally {
      setSending(false);
    }
  };

  const kindLabel: Record<string, string> = {
    real_customer: "GERÇEK MÜŞTERİ",
    permissioned_prospect: "İZİNLİ ADAY",
    market_signal: "PAZAR SİNYALİ"
  };
  const statusLabel: Record<string, string> = { live: "Canlı", ready: "Hazır", planned: "Bağlantı bekliyor", manual: "Manuel", paused: "Beklemede" };

  return <>
    <View style={styles.agentHero}>
      <View style={styles.agentHeroTop}><View style={styles.agentAvatar}><Ionicons name="sparkles" size={23} color="white" /></View><View style={{ flex: 1 }}><Text style={styles.agentHeroTitle}>Ajana Sor</Text><Text style={styles.agentHeroText}>Gerçek müşteri, izinli aday ve pazar sinyali ayrı değerlendirilir.</Text></View><Pressable onPress={onRefresh}><Ionicons name="refresh" size={22} color="#C88B47" /></Pressable></View>
      <View style={styles.agentCounts}>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.counts?.realCustomers || 0}</Text><Text style={styles.agentCountLabel}>Gerçek müşteri</Text></View>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.counts?.permissionedProspects || 0}</Text><Text style={styles.agentCountLabel}>İzinli aday</Text></View>
        <View style={styles.agentCount}><Text style={styles.agentCountValue}>{center?.counts?.marketSignals || 0}</Text><Text style={styles.agentCountLabel}>Pazar sinyali</Text></View>
      </View>
    </View>

    <Text style={styles.sectionTitle}>Ajanla konuş</Text>
    <View style={styles.chatCard}>
      {chat.map((message, index) => <View key={`${message.role}-${index}`} style={[styles.chatBubble, message.role === "owner" ? styles.ownerBubble : styles.agentBubble]}>
        <Text style={message.role === "owner" ? styles.ownerMessage : styles.agentMessage}>{message.text}</Text>
        {message.warnings?.map((warning) => <Text style={styles.chatWarning} key={warning}>⚠ {warning}</Text>)}
        {message.actions?.map((action) => <Text style={styles.chatAction} key={action}>→ {action}</Text>)}
      </View>)}
      {sending && <ActivityIndicator style={{ alignSelf: "flex-start", margin: 10 }} color="#C88B47" />}
      <View style={styles.chatInputRow}><TextInput value={question} onChangeText={setQuestion} style={styles.chatInput} placeholder="Ajana Türkçe sorun..." placeholderTextColor="#9AA39F" multiline /><Pressable style={[styles.sendButton, (!question.trim() || sending) && styles.primaryDisabled]} disabled={!question.trim() || sending} onPress={() => ask()}><Ionicons name="send" size={19} color="white" /></Pressable></View>
      <View style={styles.quickPrompts}>
        {["Bugünkü durum ne?", "Meta dışındaki fırsatları göster", "Shopier ürünü için ne yapalım?"].map((prompt) => <Pressable key={prompt} style={styles.quickPrompt} onPress={() => ask(prompt)}><Text style={styles.quickPromptText}>{prompt}</Text></Pressable>)}
      </View>
    </View>

    <Text style={styles.sectionTitle}>Doğrulanmış fırsatlar</Text>
    {!center?.opportunities?.length ? <Empty icon="radar-outline" title="Henüz fırsat kaydı yok" text="Canlı kaynaklardan kanıt geldiğinde burada görünecek." /> : center.opportunities.map((item: any) => <View style={styles.card} key={item.id}>
      <View style={styles.opportunityTop}><View style={[styles.kindPill, item.kind === "real_customer" ? styles.kindReal : item.kind === "permissioned_prospect" ? styles.kindPermissioned : styles.kindSignal]}><Text style={styles.kindText}>{kindLabel[item.kind] || item.kind}</Text></View><Text style={styles.confidence}>{item.confidence === "high" ? "Yüksek kanıt" : item.confidence === "medium" ? "Orta kanıt" : "Düşük kanıt"}</Text></View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.small}>{item.sourceName}</Text>
      <Text style={styles.evidence}>{item.evidence}</Text>
      <Text style={styles.nextAction}>Sonraki adım: {item.nextAction}</Text>
    </View>)}

    <Text style={styles.sectionTitle}>Kaynak radarı</Text>
    <View style={styles.card}>{center?.sources?.map((source: any) => <View style={styles.sourceRow} key={source.id}><View style={[styles.sourceDot, source.status === "live" && styles.sourceLive, source.status === "ready" && styles.sourceReady]} /><View style={{ flex: 1 }}><View style={styles.sourceTitleRow}><Text style={styles.rowTitle}>{source.name}</Text><Text style={styles.sourceStatus}>{statusLabel[source.status] || source.status}</Text></View><Text style={styles.small}>{source.category} · {kindLabel[source.kind] || source.kind}</Text><Text style={styles.sourceNote}>{source.note}</Text></View></View>)}</View>
    <View style={styles.guardrail}><Ionicons name="shield-checkmark" size={21} color="#315B4C" /><View style={{ flex: 1 }}>{center?.guardrails?.map((rule: string) => <Text style={styles.guardrailText} key={rule}>• {rule}</Text>)}</View></View>
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

const CRAFT_OPTIONS = [
  { id: "crochet", label: "Tığ işi" },
  { id: "knitting", label: "Şiş örgü" },
  { id: "embroidery", label: "Nakış" },
  { id: "cross_stitch", label: "Kanaviçe" },
  { id: "sewing", label: "Dikiş" },
  { id: "macrame", label: "Makrome" },
  { id: "punch_needle", label: "Punch" }
];
const SKILL_OPTIONS = [
  { id: "beginner", label: "Başlangıç" },
  { id: "easy", label: "Kolay" },
  { id: "intermediate", label: "Orta" },
  { id: "experienced", label: "İleri" }
];
const CRAFT_WORDS = /\b(crochet|knitting|knit|embroidery|cross stitch|sewing|macrame|punch needle|amigurumi|pattern|pdf)\b/gi;

async function apiJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body.error || "İstek tamamlanamadı.");
  return body;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Bağlantıyı kontrol edin.";
}

type EtsySection = "Trend" | "Stüdyo" | "Dijital" | "Kılavuz";

function EtsyScreen({ online, channels }: any) {
  const [section, setSection] = useState<EtsySection>("Trend");
  const [studioSeed, setStudioSeed] = useState<any>();
  const [uploadPrefill, setUploadPrefill] = useState<any>();
  const etsy = channels?.etsy || {};
  const shopReady = Boolean(etsy.shopReady || etsy.shopId);
  const authorized = Boolean(etsy.authorized || etsy.connected);
  return <>
    <View style={styles.agentHero}>
      <View style={styles.agentHeroTop}><View style={styles.shopierLogo}><Ionicons name="color-palette" size={22} color="white" /></View><View style={{ flex: 1 }}><Text style={styles.agentHeroTitle}>Etsy Merkezi</Text><Text style={styles.agentHeroText}>{shopReady ? `Mağaza bağlı${etsy.shopName ? ` · ${etsy.shopName}` : ""} · otomatik keşif açık` : "Trend, otomatik keşif ve stüdyo mağaza açılmadan da çalışır. Taslak ve yayınlama mağaza açılınca etkinleşir."}</Text></View></View>
    </View>
    {!shopReady && section !== "Kılavuz" && <Pressable style={styles.guardrail} onPress={() => setSection("Kılavuz")}><Ionicons name="storefront-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{authorized ? "Etsy hesabı yetkili, mağaza açılışı bekleniyor. Adımlar için dokunun: Kılavuz → Mağaza açılışı." : "Etsy mağazası henüz bağlı değil. Adımlar için dokunun: Kılavuz → Mağaza açılışı."}</Text><Ionicons name="chevron-forward" size={18} color="#315B4C" /></Pressable>}
    <View style={styles.segment}>
      {(["Trend", "Stüdyo", "Dijital", "Kılavuz"] as const).map((item) => <Pressable key={item} style={[styles.segmentItem, section === item && styles.segmentActive]} onPress={() => setSection(item)}><Text style={[styles.segmentText, section === item && styles.segmentTextActive]}>{item}</Text></Pressable>)}
    </View>
    {!online && section !== "Kılavuz" && <Text style={styles.shopierBlocker}>Sunucu bağlantısı yok. Trend tarama, prompt üretimi ve PDF yükleme için uygulamanın sunucuya bağlı olması gerekir.</Text>}
    {section === "Trend" && <TrendPanel online={online} onUse={(seed: any) => { setStudioSeed(seed); setSection("Stüdyo"); }} />}
    {section === "Stüdyo" && <StudioPanel online={online} seed={studioSeed} onUpload={(prefill: any) => { setUploadPrefill(prefill); setSection("Dijital"); }} />}
    {section === "Dijital" && <DigitalPanel online={online} shopReady={shopReady} prefill={uploadPrefill} onPrefillUsed={() => setUploadPrefill(undefined)} />}
    {section === "Kılavuz" && <EtsyGuide shopReady={shopReady} authorized={authorized} />}
  </>;
}

function scoreStyle(score?: number) {
  if (score === undefined) return styles.scoreNone;
  return score >= 65 ? styles.scoreHigh : score >= 45 ? styles.scoreMid : styles.scoreLow;
}

function TrendCard({ title, result, expanded, onToggle, onUse, scanning, group, trendsRange = "today 12-m" }: any) {
  const activeGroup = result?.group || group || "patterns";
  const isPattern = activeGroup === "patterns";
  const isPrintable = activeGroup === "printables";
  const keyword = result?.keyword || "";
  return <View style={styles.card}>
    <Pressable style={styles.shopierProductTop} onPress={onToggle}>
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.small}>{result?.keyword || ""}{result?.cached ? " · önbellek" : ""}</Text></View>
      {scanning ? <ActivityIndicator color="#A86B2E" /> : <View style={[styles.scoreBadge, scoreStyle(result?.score)]}><Text style={styles.scoreBadgeText}>{result ? result.score : "—"}</Text></View>}
    </Pressable>
    {!!result && <>
      <Text style={styles.trendVerdict}>{result.verdict}</Text>
      {!!result.signals?.ipRisks?.length && <Text style={styles.shopierBlocker}>Marka/telif riski: {result.signals.ipRisks.join(", ")}. Bu kelimeleri başlıkta, etikette ve tasarımda kullanma.</Text>}
      <Text style={styles.small}>Rakip: {Number(result.metrics.activeListings).toLocaleString("tr-TR")} ilan · Talep: {result.metrics.favoritesPerMonth} favori/ay · Yeni ilan payı: %{Math.round(result.metrics.newcomerShare * 100)}{result.metrics.medianPriceUsd ? ` · Ortanca ${result.metrics.medianPriceUsd} USD` : ""}</Text>
      {expanded && <>
        {result.reasons.map((reason: string) => <Text style={styles.evidence} key={reason}>• {reason}</Text>)}
        {!!result.advice?.length && <View style={styles.adviceBox}>
          <Text style={styles.cardTitle}>Öne geçmek için ne yapmalı?</Text>
          {result.advice.map((item: any) => <View key={item.titleTr} style={styles.adviceRow}>
            <View style={[styles.adviceDot, item.priority === "high" ? styles.adviceHigh : item.priority === "medium" ? styles.adviceMedium : styles.adviceLow]} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.titleTr}</Text><Text style={styles.evidence}>{item.detailTr}</Text></View>
          </View>)}
        </View>}
        {(isPattern || isPrintable) && !!result.signals?.formats && <Text style={styles.small}>Rakiplerde format: {result.signals.formats.filter((item: any) => item.share > 0).map((item: any) => `${item.labelTr} %${Math.round(item.share * 100)}`).join(" · ") || "belirgin format bilgisi yok"} · Paket/set: %{Math.round((result.signals.bundleShare || 0) * 100)}{result.signals.pageCountMedian ? ` · Ortanca ${result.signals.pageCountMedian} sayfa` : ""}</Text>}
        <Text style={styles.warningTitle}>Üst ilanlarda en çok geçen etiketler</Text>
        <View style={styles.chips}>{result.topTags.slice(0, 14).map((tag: any) => <View style={styles.chip} key={tag.tag}><Text style={styles.chipText}>{tag.tag} · {tag.count}</Text></View>)}</View>
        {!!result.risingTags?.length && <>
          <Text style={styles.warningTitle}>Yeni ilanlarda yükselen etiketler</Text>
          <View style={styles.chips}>{result.risingTags.slice(0, 10).map((tag: any) => <View style={[styles.chip, styles.risingChip]} key={tag.tag}><Text style={styles.chipText}>↑ {tag.tag}</Text></View>)}</View>
        </>}
        {!!result.discovered?.length && <Text style={styles.evidence}>Keşif listesine eklenen yeni aramalar: {result.discovered.join(", ")}</Text>}
        <Text style={styles.warningTitle}>Öne çıkan rakip ilanlar</Text>
        {result.examples.map((example: any, index: number) => <Pressable key={`${example.url}-${index}`} onPress={() => example.url && openUrl(example.url, "Etsy ilanı")}><Text style={styles.linkNote} numberOfLines={2}>{example.favorites} favori · {example.ageDays} gün · {example.priceUsd ? `${example.priceUsd.toFixed(2)} USD · ` : ""}{example.title}</Text></Pressable>)}
        <Pressable style={[styles.secondaryButton, { marginTop: 12 }]} onPress={() => openUrl(`https://trends.google.com/trends/explore?geo=US&date=${encodeURIComponent(trendsRange)}&q=${encodeURIComponent(keyword)}`, "Google Trends")}><Text style={styles.secondaryButtonText}>{trendsRange === "today 5-y" ? "ABD eyaletleri ve sezon zirveleri (Google Trends)" : "ABD'de hangi eyaletlerde aranıyor? (Google Trends)"}</Text></Pressable>
        {isPattern || isPrintable
          ? <Pressable style={[styles.primary, { marginTop: 14, marginBottom: 0 }]} onPress={onUse}><Text style={styles.primaryText}>{isPrintable ? "Bu nişte PDF hazırla" : "Bu nişte desen hazırla"}</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable>
          : <Pressable style={[styles.primary, { marginTop: 14, marginBottom: 0 }]} onPress={() => Share.share({ message: result.topTags.map((tag: any) => tag.tag).slice(0, 13).join(", "), title: `${keyword} etiketleri` })}><Text style={styles.primaryText}>Üst etiketleri kopyala</Text><Ionicons name="copy-outline" size={18} color="white" /></Pressable>}
      </>}
    </>}
  </View>;
}

function SeasonalPanel({ online, onUse }: any) {
  const [board, setBoard] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const load = async () => {
    setLoading(true);
    try { setBoard(await apiJson("/api/etsy/seasonal", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Sezonlar alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const scanSeason = async (event: any) => {
    for (const item of event.keywords) {
      setScanning(`${event.id}:${item.keyword}`);
      try {
        const result = await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: item.keyword }) });
        setBoard((current: any) => ({ ...current, events: current.events.map((row: any) => row.id === event.id ? { ...row, keywords: row.keywords.map((entry: any) => entry.keyword === item.keyword ? { ...entry, result } : entry) } : row) }));
      } catch (error) {
        Alert.alert("Tarama durdu", errorText(error));
        break;
      }
    }
    setScanning(undefined);
  };
  const dateText = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return <>
    <View style={styles.guardrail}><Ionicons name="calendar-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{board?.note || "ABD'de yaklaşan alışveriş dönemleri ve bu dönemlerde aranan ürünler."}</Text></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {(board?.events || []).map((event: any) => {
      const scanned = event.keywords.filter((item: any) => item.result);
      const best = [...scanned].sort((a: any, b: any) => b.result.score - a.result.score)[0];
      return <View style={styles.card} key={event.id}>
        <View style={styles.shopierProductTop}>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{event.nameTr}</Text><Text style={styles.small}>{dateText(event.date)}{event.approximate ? " (yaklaşık)" : ""} · {event.daysUntil} gün kaldı</Text></View>
          <View style={[styles.kindPill, event.urgency === "Hemen listele" ? styles.scoreLow : event.urgency === "Bu ay hazırla" ? styles.scoreMid : styles.scoreHigh]}><Text style={styles.kindText}>{event.urgency}</Text></View>
        </View>
        <Text style={styles.evidence}>{event.tipTr}</Text>
        <Text style={styles.analysisLine}>Fiziksel ürün son listeleme: {dateText(event.listByProducts)} · Desen son listeleme: {dateText(event.listByPatterns)}</Text>
        {best && <Text style={styles.trendVerdict}>En güçlü arama: {best.keyword} ({best.result.score} puan)</Text>}
        {event.keywords.map((item: any) => <TrendCard key={item.keyword} title={item.keyword} group={item.group} result={item.result} trendsRange="today 5-y" scanning={scanning === `${event.id}:${item.keyword}`} expanded={expanded === `${event.id}:${item.keyword}`} onToggle={() => setExpanded(expanded === `${event.id}:${item.keyword}` ? undefined : `${event.id}:${item.keyword}`)} onUse={() => onUse({ keyword: item.keyword, group: item.group }, item.result)} />)}
        <Pressable style={[styles.addButton, { alignSelf: "flex-start" }, (!online || Boolean(scanning)) && styles.primaryDisabled]} disabled={!online || Boolean(scanning)} onPress={() => scanSeason(event)}><Ionicons name="pulse" size={16} color="white" /><Text style={styles.addButtonText}>{scanned.length ? "Yeniden tara" : "Bu sezonu tara"}</Text></Pressable>
      </View>;
    })}
  </>;
}

function TrendPanel({ online, onUse }: any) {
  const [board, setBoard] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [custom, setCustom] = useState<any[]>([]);
  const [group, setGroup] = useState("printables");
  const groups = [...(board?.groups || [{ id: "printables", labelTr: "PDF ürünleri" }, { id: "patterns", labelTr: "Hobi desenleri" }, { id: "tesbih", labelTr: "Tesbih ve gümüş" }, { id: "vintage", labelTr: "Vintage" }]), { id: "discovered", labelTr: "Keşfedilenler" }, { id: "season", labelTr: "Sezon fırsatları" }];
  const topOverall = (board?.niches || []).filter((row: any) => row.result).sort((a: any, b: any) => b.result.score - a.result.score).slice(0, 5);
  const visibleNiches = (board?.niches || []).filter((row: any) => (row.group || "patterns") === group);
  const sortNiches = (rows: any[]) => [...rows].sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1));
  const load = async () => {
    setLoading(true);
    try { setBoard(await apiJson("/api/etsy/trends", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Trendler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const scan = (body: any) => apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify(body) });
  const scanAll = async () => {
    for (const niche of visibleNiches) {
      setScanning(niche.id);
      try {
        const result = await scan({ nicheId: niche.id });
        setBoard((current: any) => ({ ...current, niches: sortNiches(current.niches.map((row: any) => row.id === niche.id ? { ...row, result } : row)) }));
      } catch (error) {
        Alert.alert("Tarama durdu", errorText(error));
        break;
      }
    }
    setScanning(undefined);
  };
  const scanKeyword = async () => {
    if (keyword.trim().length < 3) return Alert.alert("Anahtar kelime", "İngilizce bir arama yazın (ör. crochet bag pattern).");
    setScanning("custom");
    try {
      const result = await scan({ keyword: keyword.trim(), track: true });
      setCustom((current) => [result, ...current.filter((item) => item.keyword !== result.keyword)].slice(0, 5));
      setExpanded(`custom:${result.keyword}`);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  const inferCraft = (keyword: string) => /cross stitch/i.test(keyword) ? "cross_stitch" : /knit/i.test(keyword) ? "knitting" : /embroider/i.test(keyword) ? "embroidery" : /sewing/i.test(keyword) ? "sewing" : /macrame/i.test(keyword) ? "macrame" : /punch needle/i.test(keyword) ? "punch_needle" : "crochet";
  const use = (row: any, result: any) => onUse({
    craft: row.craft || result?.craft || inferCraft(String(result?.keyword || row.keyword || "")),
    keyword: result?.keyword || row.keyword,
    productType: String(result?.keyword || row.keyword).replace(CRAFT_WORDS, " ").replace(/\s+/g, " ").trim(),
    trendTags: (result?.topTags || []).map((tag: any) => tag.tag),
    group: result?.group || row.group,
    kind: row.kind || result?.kind
  });
  return <>
    <View style={styles.guardrail}><Ionicons name="information-circle-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{board?.method || "Etsy resmî aramasındaki üst ilanlar puanlanır. Etsy satış adedini paylaşmadığı için puan tahmindir."}</Text></View>
    {board && !board.configured && <Text style={styles.shopierBlocker}>Etsy API anahtarı (keystring ve shared secret) sunucuya eklenince tarama başlar.</Text>}
    <View style={styles.chatInputRow}>
      <TextInput style={styles.chatInput} value={keyword} onChangeText={setKeyword} placeholder="Arama tara (Google Trends ifadesi de olur): crochet bag pattern, misbaha" placeholderTextColor="#9AA39F" autoCapitalize="none" />
      <Pressable style={styles.sendButton} onPress={scanKeyword} disabled={!online || Boolean(scanning)}><Ionicons name="search" size={19} color="white" /></Pressable>
    </View>
    {custom.map((result) => <TrendCard key={`custom:${result.keyword}`} title={`Arama: ${result.keyword}`} result={result} expanded={expanded === `custom:${result.keyword}`} onToggle={() => setExpanded(expanded === `custom:${result.keyword}` ? undefined : `custom:${result.keyword}`)} onUse={() => use({ keyword: result.keyword }, result)} />)}
    <View style={[styles.chips, { marginTop: 14 }]}>{groups.map((item: any) => <Pressable key={item.id} style={[styles.chip, group === item.id && styles.chipActive]} onPress={() => setGroup(item.id)}><Text style={[styles.chipText, group === item.id && styles.chipTextActive]}>{item.labelTr}</Text></Pressable>)}</View>
    {group === "season" ? <SeasonalPanel online={online} onUse={use} /> : group === "discovered" ? <DiscoveryPanel online={online} onUse={use} /> : <>
    {!!topOverall.length && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Taranan nişlerde en yüksek puanlar</Text>
      {topOverall.map((row: any) => <Text style={styles.analysisLine} key={row.id}>{row.result.score} · {row.labelTr} ({row.result.verdict})</Text>)}
    </View>}
    <InterestRanking rows={visibleNiches} />
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{groups.find((item: any) => item.id === group)?.labelTr || "Nişler"}</Text><Pressable style={[styles.addButton, (!online || !board?.configured || Boolean(scanning)) && styles.primaryDisabled]} disabled={!online || !board?.configured || Boolean(scanning)} onPress={scanAll}><Ionicons name="pulse" size={16} color="white" /><Text style={styles.addButtonText}>{scanning ? "Taranıyor…" : "Tümünü tara"}</Text></Pressable></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {visibleNiches.map((row: any) => <TrendCard key={row.id} title={row.labelTr} group={row.group} result={row.result} scanning={scanning === row.id} expanded={expanded === row.id} onToggle={() => setExpanded(expanded === row.id ? undefined : row.id)} onUse={() => use(row, row.result)} />)}
    </>}
  </>;
}

const GROUP_LABELS: Record<string, string> = { patterns: "Desen", tesbih: "Tesbih", vintage: "Vintage", other: "Diğer" };

function timeAgo(value?: string) {
  if (!value) return "henüz çalışmadı";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} saat önce` : `${Math.round(hours / 24)} gün önce`;
}

function DiscoveryPanel({ online, onUse }: any) {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState<Record<string, any>>({});
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/discoveries", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Keşifler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const all = data?.items || [];
  const items = all.filter((item: any) => filter === "all" || item.group === filter);
  const filters = [{ id: "all", label: "Tümü" }, ...["patterns", "tesbih", "vintage", "other"].filter((id) => all.some((item: any) => item.group === id)).map((id) => ({ id, label: GROUP_LABELS[id] }))];
  const autopilot = data?.autopilot;
  const toggle = (key: string) => setExpanded(expanded === key ? undefined : key);
  const open = async (item: any) => {
    if (results[item.keyword]) return toggle(item.keyword);
    setScanning(item.keyword);
    try {
      const result = await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: item.keyword, group: item.group }) });
      setResults((current) => ({ ...current, [item.keyword]: result }));
      setExpanded(item.keyword);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  return <>
    <View style={styles.analysisCard}>
      <View style={styles.shopierProductTop}><Ionicons name="sync-circle-outline" size={22} color="#315B4C" /><Text style={[styles.cardTitle, { flex: 1 }]}>Otomatik keşif</Text><Pressable style={styles.secondaryButton} disabled={loading || !online} onPress={load}><Text style={styles.secondaryButtonText}>Yenile</Text></Pressable></View>
      <Text style={styles.analysisLine}>{!autopilot ? "Durum alınıyor…" : autopilot.enabled ? `Son çalışma: ${timeAgo(autopilot.lastRunAt)}${autopilot.lastKeyword ? ` · ${autopilot.lastKeyword}` : ""}` : "Otomatik keşif için sunucu deposu bağlı değil."}</Text>
      {!!autopilot?.runs && <Text style={styles.analysisLine}>{autopilot.runs} otomatik tarama · {autopilot.tracked} arama izleniyor · {all.length} keşfedilen arama</Text>}
      {!!autopilot?.lastError && <Text style={styles.warningText}>Son hata: {autopilot.lastError}</Text>}
      <Text style={styles.evidence}>Sunucu her 30 dakikada bir sıradaki aramayı Etsy'de tarar. Son 120 günde açılıp hızla favori toplayan ilanların etiketlerinden alıcıların kullandığı yeni arama ifadelerini çıkarır ve buraya ekler. Liste sabit kelimelerle sınırlı kalmaz.</Text>
    </View>
    {filters.length > 2 && <ChipGroup options={filters} value={filter} onChange={setFilter} />}
    {loading && <ActivityIndicator color="#C88B47" />}
    {!loading && !items.length && <Empty icon="compass-outline" title="Henüz keşif yok" text="İlk keşifler otomatik taramalarla birkaç saat içinde gelir. Hızlandırmak için diğer gruplarda 'Tümünü tara' düğmesine basın." />}
    {items.map((item: any) => results[item.keyword]
      ? <TrendCard key={item.keyword} title={item.keyword} group={item.group} result={results[item.keyword]} expanded={expanded === item.keyword} onToggle={() => toggle(item.keyword)} onUse={() => onUse({ keyword: item.keyword, group: item.group }, results[item.keyword])} />
      : <Pressable key={item.keyword} style={styles.card} disabled={!online || Boolean(scanning)} onPress={() => open(item)}>
        <View style={styles.shopierProductTop}>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.keyword}</Text><Text style={styles.small}>{GROUP_LABELS[item.group] || "Diğer"}{item.rising ? " · ↑ yükselen" : ""} · kaynak: {item.from}</Text></View>
          {scanning === item.keyword ? <ActivityIndicator color="#A86B2E" /> : <View style={[styles.scoreBadge, scoreStyle(item.summary?.score)]}><Text style={styles.scoreBadgeText}>{item.summary ? item.summary.score : "—"}</Text></View>}
        </View>
        {item.summary
          ? <><Text style={styles.trendVerdict}>{item.summary.verdict}</Text><Text style={styles.small}>Rakip: {Number(item.summary.activeListings).toLocaleString("tr-TR")} ilan · Talep: {item.summary.favoritesPerMonth} favori/ay{item.summary.medianPriceUsd ? ` · Ortanca ${item.summary.medianPriceUsd} USD` : ""} · {timeAgo(item.summary.scannedAt)}</Text></>
          : <Text style={styles.small}>Henüz puanlanmadı. Dokunun, Etsy'de taransın.</Text>}
      </Pressable>)}
  </>;
}

// Alıcı ilgisi (üst ilanların aylık favori hızı) çubukla, fırsat puanı yanında gösterilir.
function InterestRanking({ rows }: any) {
  const scanned = rows.filter((row: any) => row.result).sort((a: any, b: any) => b.result.metrics.favoritesPerMonth - a.result.metrics.favoritesPerMonth);
  if (scanned.length < 2) return null;
  const max = Math.max(...scanned.map((row: any) => row.result.metrics.favoritesPerMonth), 1);
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>İlgi sıralaması</Text>
    <Text style={styles.small}>Çubuk: alıcı ilgisi (üst ilanların aylık favori hızı). Sağdaki rozet: fırsat puanı. Önce ilgisi yüksek ve puanı 45+ olanlara gir.</Text>
    {scanned.map((row: any) => <View key={row.id} style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{row.labelTr}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, Math.round(100 * row.result.metrics.favoritesPerMonth / max))}%` }]} /></View>
      <Text style={styles.barValue}>{row.result.metrics.favoritesPerMonth}</Text>
      <View style={[styles.miniScore, scoreStyle(row.result.score)]}><Text style={styles.miniScoreText}>{row.result.score}</Text></View>
    </View>)}
  </View>;
}

// Reklam tadında görseller: her biri nerede kullanılacağı, ölçüsü ve görsel üstü yazı önerisiyle.
function AdVisualsPanel({ visuals }: any) {
  const [open, setOpen] = useState<number | undefined>(1);
  if (!visuals?.length) return null;
  const all = visuals.map((item: any) => `${item.slot}. ${item.titleTr} (${item.aspect})\nNerede: ${item.useTr}${item.overlay ? `\nGörsel üstü yazı: ${item.overlay}` : ""}\n${item.prompt}`).join("\n\n");
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Reklam tadında görseller</Text><Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: all, title: "Görsel promptları" })}><Text style={styles.secondaryButtonText}>Tümünü kopyala</Text></Pressable></View>
    <Text style={styles.small}>ChatGPT gibi bir görsel aracında üret; ürün sayfalarını referans görsel olarak yükle. Görsel üstü yazıyı Canva ile ekle; görsel modelleri yazıyı bozar.</Text>
    {visuals.map((item: any) => <View key={item.slot} style={styles.visualRow}>
      <Pressable style={styles.shopierProductTop} onPress={() => setOpen(open === item.slot ? undefined : item.slot)}>
        <Text style={[styles.rowTitle, { flex: 1 }]}>{item.slot}. {item.titleTr}</Text>
        <Text style={styles.small}>{String(item.aspect).split(" · ")[0]}</Text>
        <Ionicons name={open === item.slot ? "chevron-up" : "chevron-down"} size={16} color="#68736E" />
      </Pressable>
      <Text style={styles.small}>Nerede: {item.useTr}</Text>
      {open === item.slot && <>
        <Text style={styles.small}>Ölçü: {item.aspect}</Text>
        {!!item.overlay && <Text style={styles.trendVerdict}>Görsel üstü yazı: {item.overlay}</Text>}
        <Text style={styles.promptText}>{item.prompt}</Text>
        <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => Share.share({ message: item.prompt, title: item.titleTr })}><Text style={styles.secondaryButtonText}>Bu promptu kopyala</Text></Pressable>
      </>}
    </View>)}
  </View>;
}

const PRINTABLE_KIND_OPTIONS = [
  { id: "planner", label: "Planlayıcı" },
  { id: "digital_planner", label: "Dijital planlayıcı" },
  { id: "coloring", label: "Boyama" },
  { id: "wall_art", label: "Duvar sanatı" },
  { id: "party", label: "Parti / oyun" },
  { id: "recipe", label: "Tarif" },
  { id: "journal", label: "Günlük" },
  { id: "kids", label: "Çocuk etkinlik" },
  { id: "paper_craft", label: "Kâğıt işi" }
];
const STUDIO_MODES = [
  { id: "printable", label: "PDF ürünü" },
  { id: "pattern", label: "El işi deseni" }
];

function PrintableStudio({ online, seed, seeding, onReseed, onUpload }: any) {
  const [kind, setKind] = useState("planner");
  const [productType, setProductType] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [colors, setColors] = useState("");
  const [formats, setFormats] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [audience, setAudience] = useState("");
  const [keyword, setKeyword] = useState("");
  const [trendTags, setTrendTags] = useState<string[]>([]);
  const [trendFeatures, setTrendFeatures] = useState<string[]>([]);
  const [basis, setBasis] = useState<string[]>([]);
  const [plan, setPlan] = useState<any>();
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!seed) return;
    setKind(seed.kind || "planner");
    setProductType(seed.productType || "");
    setReferenceNotes(seed.referenceNotes || "");
    setColors((seed.colors || []).join(", "));
    setFormats((seed.formats || []).join(", "));
    setPageCount(seed.pageCount ? String(seed.pageCount) : "");
    setKeyword(seed.keyword || "");
    setTrendTags(seed.trendTags || []);
    setTrendFeatures(seed.trendFeatures || []);
    setBasis(seed.basis || []);
    setPlan(undefined);
  }, [seed]);
  const generate = async () => {
    if (productType.trim().length < 3) return Alert.alert("Ürün", "Ürünü İngilizce yazın (ör. budget planner, adult coloring pages).");
    setWorking(true);
    try {
      setPlan(await apiJson("/api/printables/plan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ kind, productType, referenceNotes, colors, formats, pageCount: pageCount ? Number(pageCount) : undefined, audience, keyword, trendTags, trendFeatures, seed: String(Date.now()) }) }));
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setWorking(false); }
  };
  const brief = plan?.brief;
  const listing = plan?.listing;
  return <>
    {!!basis.length && !seeding && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Trendden otomatik dolduruldu: {keyword}</Text>
      {basis.map((line) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      <Text style={styles.formHint}>İsterseniz alanları değiştirin; değilse doğrudan aşağıdaki düğmeye basın.</Text>
      <View style={styles.inlineActions}><Pressable style={styles.secondaryButton} disabled={!online} onPress={onReseed}><Text style={styles.secondaryButtonText}>Başka trend kombinasyonu</Text></Pressable></View>
    </View>}
    <Text style={styles.fieldLabel}>PDF türü</Text>
    <ChipGroup options={PRINTABLE_KIND_OPTIONS} value={kind} onChange={setKind} />
    <Field label="Ürün (İngilizce)" value={productType} onChangeText={setProductType} placeholder="budget planner, adult coloring pages, recipe cards" autoCapitalize="none" />
    <Field label="Trend özeti (Etsy üst ilanlarından)" value={referenceNotes} onChangeText={setReferenceNotes} placeholder="Trendden gelince otomatik dolar" multiline />
    <Field label="Renkler" value={colors} onChangeText={setColors} placeholder="sage green, cream, terracotta" autoCapitalize="none" />
    <Field label="Formatlar (virgülle)" value={formats} onChangeText={setFormats} placeholder="US Letter, A4, A5" />
    <Field label="Sayfa / tasarım sayısı" value={pageCount} onChangeText={setPageCount} keyboardType="number-pad" placeholder="30" />
    <Field label="Hedef kitle (isteğe bağlı)" value={audience} onChangeText={setAudience} placeholder="busy moms, teachers, brides-to-be" />
    <Field label="Hedef Etsy araması" value={keyword} onChangeText={setKeyword} placeholder="budget planner printable" autoCapitalize="none" />
    <Pressable style={[styles.analyzeButton, (working || seeding || !online) && styles.primaryDisabled]} disabled={working || seeding || !online} onPress={generate}>{working ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "Yeni adla yeniden hazırla" : "Prompt, görsel ve ilanı hazırla"}</Text></Pressable>
    {brief && <>
      <View style={styles.analysisCard}>
        <Text style={styles.small}>Sistemin seçtiği ürün adı</Text>
        <Text style={styles.studioName}>{brief.name}</Text>
        <Text style={styles.warningTitle}>Özgünlük planı</Text>
        {brief.originalityPlan.map((line: string) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      </View>
      <PromptBox title="1) PDF promptu (Claude / ChatGPT)" text={brief.pdfPrompt} shareTitle={`${brief.name} PDF prompt`} />
      {!!brief.artPrompts?.length && <PromptBox title="2) Sayfa görselleri promptları" text={brief.artPrompts.join("\n\n")} shareTitle={`${brief.name} artwork prompts`} />}
      <AdVisualsPanel visuals={brief.adVisuals} />
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Pinterest pinleri</Text>
        <Text style={styles.small}>Dijital PDF ürünlerinde en büyük dış trafik Pinterest'ten gelir. Pinleri farklı günlerde paylaş; görsel için 9. görsel promptunu kullan.</Text>
        {brief.pins.map((pin: any) => <View key={pin.title} style={styles.visualRow}>
          <Text style={styles.rowTitle}>{pin.title}</Text>
          <Text style={styles.trendVerdict}>Görsel üstü yazı: {pin.overlay}</Text>
          <Text style={styles.evidence}>{pin.description}</Text>
          <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => Share.share({ message: `${pin.title}\n\n${pin.description}` })}><Text style={styles.secondaryButtonText}>Pin metnini kopyala</Text></Pressable>
        </View>)}
      </View>
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>{brief.bundleIdea.titleTr}</Text>
        {brief.bundleIdea.items.map((item: string) => <Text style={styles.analysisLine} key={item}>• {item}</Text>)}
        <Text style={styles.evidence}>{brief.bundleIdea.priceNoteTr}</Text>
      </View>
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Satışa açmadan önce kalite kapısı</Text>
        {brief.qualityGate.map((line: string) => <Text style={styles.warningText} key={line}>• {line}</Text>)}
      </View>
    </>}
    {listing && <View style={styles.analysisCard}>
      <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Etsy ilanı ({listing.source === "ai" ? "yapay zekâ + kurallar" : "kurallar"})</Text><Text style={[styles.readinessState, listing.checks.ok && styles.connectedText]}>{listing.checks.ok ? "Etsy kurallarına uygun" : "Kontrol et"}</Text></View>
      <Text style={styles.listingTitle}>{listing.title}</Text>
      <Text style={styles.small}>{listing.checks.titleLength}/140 karakter · {listing.checks.tagCount}/13 etiket</Text>
      <View style={[styles.chips, { marginTop: 8 }]}>{listing.tags.map((tag: string) => <View style={styles.chip} key={tag}><Text style={styles.chipText}>{tag}</Text></View>)}</View>
      {listing.checks.issues.map((issue: string) => <Text style={styles.warningText} key={issue}>• {issue}</Text>)}
      {listing.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: `${listing.title}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}` })}><Text style={styles.secondaryButtonText}>İlan metnini kopyala</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => onUpload({ name: brief?.name, kind, productType, listing })}><Text style={styles.secondaryButtonText}>PDF hazırsa yükle →</Text></Pressable>
      </View>
    </View>}
  </>;
}

function ChipGroup({ options, value, onChange }: any) {
  return <View style={styles.chips}>{options.map((option: any) => <Pressable key={option.id} style={[styles.chip, value === option.id && styles.chipActive]} onPress={() => onChange(option.id)}><Text style={[styles.chipText, value === option.id && styles.chipTextActive]}>{option.label}</Text></Pressable>)}</View>;
}

function PromptBox({ title, text, shareTitle }: any) {
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>{title}</Text><Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: text, title: shareTitle })}><Text style={styles.secondaryButtonText}>Kopyala / gönder</Text></Pressable></View>
    <Text style={styles.promptText} numberOfLines={8}>{text}</Text>
  </View>;
}

function StudioPanel({ online, seed, onUpload }: any) {
  const [craft, setCraft] = useState("crochet");
  const [productType, setProductType] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [referenceRepeatCount, setReferenceRepeatCount] = useState("");
  const [referenceColors, setReferenceColors] = useState("");
  const [skillLevel, setSkillLevel] = useState("easy");
  const [sizeNote, setSizeNote] = useState("");
  const [yarnNote, setYarnNote] = useState("");
  const [colors, setColors] = useState("");
  const [keyword, setKeyword] = useState("");
  const [trendTags, setTrendTags] = useState<string[]>([]);
  const [trendFeatures, setTrendFeatures] = useState<string[]>([]);
  const [trendBasis, setTrendBasis] = useState<string[]>([]);
  const [fromTrend, setFromTrend] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [mode, setMode] = useState<"pattern" | "printable">("printable");
  const [printableSeed, setPrintableSeed] = useState<any>();
  const [plan, setPlan] = useState<any>();
  const [working, setWorking] = useState(false);
  // Trendden gelindiğinde tüm alanlar sunucunun trend verisinden çıkardığı değerlerle dolar; her çağrı yeni bir kombinasyon getirir.
  const fillFromTrend = async (source: any) => {
    if (!source?.keyword) return;
    setSeeding(true);
    setPlan(undefined);
    try {
      const filled = await apiJson("/api/patterns/seed", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: source.keyword, craft: source.craft }) });
      if (filled.studio === "printable") {
        setPrintableSeed(filled);
        setMode("printable");
        return;
      }
      setMode("pattern");
      setCraft(filled.craft);
      setProductType(filled.productType);
      setReferenceNotes(filled.referenceNotes);
      setReferenceRepeatCount("");
      setReferenceColors((filled.referenceColors || []).join(", "));
      setSkillLevel(filled.skillLevel);
      setSizeNote(filled.sizeNote || "");
      setYarnNote(filled.yarnNote || "");
      setColors((filled.colors || []).join(", "));
      setKeyword(filled.keyword);
      setTrendTags(filled.trendTags || []);
      setTrendFeatures(filled.trendFeatures || []);
      setTrendBasis(filled.basis || []);
      setFromTrend(true);
    } catch (error) {
      setCraft(source.craft || "crochet");
      setProductType(source.productType || "");
      setKeyword(source.keyword || "");
      setTrendTags(source.trendTags || []);
      setFromTrend(false);
      Alert.alert("Trend verisi alınamadı", `${errorText(error)}\nAlanları elle tamamlayabilirsiniz.`);
    } finally { setSeeding(false); }
  };
  useEffect(() => { if (seed) fillFromTrend(seed); }, [seed]);
  const useOwnModel = () => {
    setFromTrend(false);
    setTrendFeatures([]);
    setTrendBasis([]);
    setReferenceNotes("");
    setReferenceColors("");
  };
  const generate = async () => {
    if (productType.trim().length < 3) return Alert.alert("Ürün türü", "Ürün türünü İngilizce yazın (ör. doily, ballet slippers, tote bag).");
    setWorking(true);
    try {
      setPlan(await apiJson("/api/patterns/plan", {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ craft, productType, referenceNotes, referenceRepeatCount: referenceRepeatCount ? Number(referenceRepeatCount) : undefined, referenceColors, skillLevel, sizeNote, yarnNote, colors, keyword, trendTags, seed: String(Date.now()), ...(fromTrend ? { referenceSource: "trend", trendFeatures } : {}) })
      }));
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setWorking(false); }
  };
  const brief = plan?.brief;
  const listing = plan?.listing;
  return <>
    <Text style={styles.sectionTitle}>Yeni ürün fikri</Text>
    <ChipGroup options={STUDIO_MODES} value={mode} onChange={setMode} />
    {seeding && <View style={styles.guardrail}><ActivityIndicator color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Etsy trend verisi okunuyor; tüm alanlar otomatik dolduruluyor…</Text></View>}
    {mode === "printable" ? <PrintableStudio online={online} seed={printableSeed} seeding={seeding} onReseed={() => printableSeed?.keyword && fillFromTrend({ keyword: printableSeed.keyword })} onUpload={onUpload} /> : <>
    {fromTrend && !seeding && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Trendden otomatik dolduruldu: {keyword}</Text>
      {trendBasis.map((line) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      <Text style={styles.formHint}>İsterseniz alanları değiştirin; değilse doğrudan "Prompt ve ilanı hazırla"ya basın.</Text>
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} disabled={!online} onPress={() => fillFromTrend({ keyword, craft })}><Text style={styles.secondaryButtonText}>Başka trend kombinasyonu</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={useOwnModel}><Text style={styles.secondaryButtonText}>Kendi modelimden hazırla</Text></Pressable>
      </View>
    </View>}
    <Text style={styles.fieldLabel}>El işi türü</Text>
    <ChipGroup options={CRAFT_OPTIONS} value={craft} onChange={setCraft} />
    <Field label="Ürün türü (İngilizce)" value={productType} onChangeText={setProductType} placeholder="doily, ballet slippers, tote bag" autoCapitalize="none" />
    <Field label={fromTrend ? "Trend özeti (Etsy üst ilanlarından)" : "Seçtiğin modelde neyi beğendin?"} value={referenceNotes} onChangeText={setReferenceNotes} placeholder="8 yeşil yaprak, turuncu küçük çiçekler, beyaz dantel yelpazeler" multiline />
    {!fromTrend && <Field label="Modeldeki tekrar sayısı (varsa)" value={referenceRepeatCount} onChangeText={setReferenceRepeatCount} placeholder="8" keyboardType="number-pad" />}
    <Field label={fromTrend ? "Trendde görülen renkler" : "Modelin renkleri"} value={referenceColors} onChangeText={setReferenceColors} placeholder={fromTrend ? "Trendde renk sinyali yok" : "white, green, orange"} autoCapitalize="none" />
    <Text style={styles.fieldLabel}>Zorluk</Text>
    <ChipGroup options={SKILL_OPTIONS} value={skillLevel} onChange={setSkillLevel} />
    <Field label="Hedef ölçü / beden" value={sizeNote} onChangeText={setSizeNote} placeholder={fromTrend ? "Trendde ölçü yok; promptta yapay zekâ standart ölçüyü seçer" : "16 in / 41 cm veya EU 36-41"} />
    <Field label="İplik / malzeme" value={yarnNote} onChangeText={setYarnNote} placeholder="Size 10 cotton crochet thread" />
    <Field label="İstediğin renkler (boşsa sistem önerir)" value={colors} onChangeText={setColors} placeholder="sage, honey, cream" autoCapitalize="none" />
    <Field label="Hedef Etsy araması" value={keyword} onChangeText={setKeyword} placeholder="crochet doily pattern" autoCapitalize="none" />
    {!!trendTags.length && <Text style={styles.formHint}>Trendden {trendTags.length} etiket sinyali eklendi.</Text>}
    <Pressable style={[styles.analyzeButton, (working || seeding || !online) && styles.primaryDisabled]} disabled={working || seeding || !online} onPress={generate}>{working ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "Yeni isimle yeniden hazırla" : "Prompt ve ilanı hazırla"}</Text></Pressable>
    {brief && <>
      <View style={styles.analysisCard}>
        <Text style={styles.small}>Sistemin seçtiği desen adı</Text>
        <Text style={styles.studioName}>{brief.name}</Text>
        <Text style={styles.warningTitle}>Modelden farklılaştırma planı</Text>
        {brief.originalityPlan.map((line: string) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      </View>
      <PromptBox title="1) PDF desen promptu (Claude / ChatGPT)" text={brief.patternPrompt} shareTitle={`${brief.name} pattern prompt`} />
      <PromptBox title="2) 3D render promptu" text={brief.renderPrompt} shareTitle={`${brief.name} render prompt`} />
      <AdVisualsPanel visuals={brief.adVisuals} />
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Etsy fotoğraf planı (10 görsel)</Text>
        {brief.photoPlan.map((item: any) => <Text style={styles.analysisLine} key={item.slot}>{item.slot}. {item.title}: {item.detail}</Text>)}
      </View>
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Satışa açmadan önce kalite kapısı</Text>
        {brief.qualityGate.map((line: string) => <Text style={styles.warningText} key={line}>• {line}</Text>)}
      </View>
    </>}
    {listing && <View style={styles.analysisCard}>
      <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Etsy ilanı ({listing.source === "ai" ? "yapay zekâ + kurallar" : "kurallar"})</Text><Text style={[styles.readinessState, listing.checks.ok && styles.connectedText]}>{listing.checks.ok ? "Etsy kurallarına uygun" : "Kontrol et"}</Text></View>
      <Text style={styles.listingTitle}>{listing.title}</Text>
      <Text style={styles.small}>{listing.checks.titleLength}/140 karakter · {listing.checks.tagCount}/13 etiket</Text>
      <View style={[styles.chips, { marginTop: 8 }]}>{listing.tags.map((tag: string) => <View style={styles.chip} key={tag}><Text style={styles.chipText}>{tag}</Text></View>)}</View>
      {listing.checks.issues.map((issue: string) => <Text style={styles.warningText} key={issue}>• {issue}</Text>)}
      {listing.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: `${listing.title}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}` })}><Text style={styles.secondaryButtonText}>İlan metnini kopyala</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => onUpload({ name: brief?.name, craft, productType, listing })}><Text style={styles.secondaryButtonText}>PDF hazırsa yükle →</Text></Pressable>
      </View>
    </View>}
    </>}
  </>;
}

function Toggle({ label, value, onChange }: any) {
  return <Pressable style={styles.readinessRow} onPress={() => onChange(!value)}><Ionicons name={value ? "checkbox" : "square-outline"} size={21} color={value ? "#315B4C" : "#8A948F"} /><Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text></Pressable>;
}

function DigitalUploadForm({ visible, prefill, onClose, onSaved }: any) {
  const [name, setName] = useState("");
  const [craft, setCraft] = useState("crochet");
  const [kind, setKind] = useState("pattern");
  const [productType, setProductType] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState<string[]>([]);
  const [priceUsd, setPriceUsd] = useState("");
  const [priceTry, setPriceTry] = useState("");
  const [testMade, setTestMade] = useState(false);
  const [photosAreRenders, setPhotosAreRenders] = useState(true);
  const [aiAssisted, setAiAssisted] = useState(true);
  const [pdf, setPdf] = useState<any>();
  const [images, setImages] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setName(prefill?.name || "");
    setCraft(prefill?.craft || "crochet");
    setKind(prefill?.kind || "pattern");
    setProductType(prefill?.productType || "");
    setTitle(prefill?.listing?.title || "");
    setTags((prefill?.listing?.tags || []).join(", "));
    setDescription(prefill?.listing?.description || "");
    setMaterials(prefill?.listing?.materials || []);
    setPdf(undefined);
    setImages([]);
  }, [visible, prefill]);
  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 20 * 1024 * 1024) return Alert.alert("PDF çok büyük", "Etsy en fazla 20 MB dosya kabul eder.");
    setPdf(asset);
  };
  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.7 });
    if (!result.canceled) setImages(result.assets.slice(0, 10));
  };
  const save = () => {
    if (!name.trim() || !productType.trim() || !title.trim() || !description.trim()) return Alert.alert("Eksik bilgi", "Ürün adı, ürün türü, başlık ve açıklama gerekli. Önce Stüdyo'da ilanı hazırlayın.");
    if (!pdf) return Alert.alert("PDF seçin", "Satılacak PDF'i seçin.");
    if (!priceUsd && !priceTry) return Alert.alert("Fiyat", "Etsy mağaza para birimine göre USD veya TL fiyatı girin.");
    Alert.alert("PDF güvenli depoya yüklensin mi?", "Dosya herkese açık değildir. Müşteri yalnızca Etsy'de ödeme yaptıktan sonra Etsy üzerinden veya sizin oluşturduğunuz kişiye özel bağlantıyla indirebilir.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Yükle", onPress: async () => {
        setSaving(true);
        try {
          const form = new FormData();
          form.append("metadata", JSON.stringify({
            confirm: true,
            name: name.trim(),
            ...(kind === "pattern" ? { craft } : { kind }),
            productType: productType.trim(),
            prices: { usd: priceUsd, try: priceTry },
            flags: { testMade, photosAreRenders, aiAssisted },
            listing: { title: title.trim(), description: description.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), materials }
          }));
          form.append("pdf", { uri: pdf.uri, name: pdf.name || "pattern.pdf", type: "application/pdf" } as any);
          images.forEach((image, index) => form.append("images", { uri: image.uri, name: image.fileName || `render-${index + 1}.jpg`, type: image.mimeType || "image/jpeg" } as any));
          const response = await fetch(`${API_URL}/api/digital/products`, { method: "POST", headers: apiHeaders(), body: form });
          const body = await response.json().catch(() => ({})) as any;
          if (!response.ok) throw new Error(body.error || "Yükleme tamamlanamadı.");
          onSaved(body.product);
        } catch (error) { Alert.alert("Yüklenemedi", errorText(error)); }
        finally { setSaving(false); }
      } }
    ]);
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={styles.sectionTitle}>Dijital PDF yükle</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color="#315B4C" /></Pressable></View>
      <Pressable style={styles.uploadRow} onPress={pickPdf}><Ionicons name="document-text-outline" size={22} color="#315B4C" /><Text style={[styles.rowTitle, { flex: 1 }]}>{pdf ? `${pdf.name} · ${Math.round((pdf.size || 0) / 1024)} KB` : "PDF seç (en fazla 20 MB)"}</Text></Pressable>
      <Pressable style={styles.uploadRow} onPress={pickImages}><Ionicons name="images-outline" size={22} color="#315B4C" /><Text style={[styles.rowTitle, { flex: 1 }]}>{images.length ? `${images.length} görsel seçildi` : "3D render / ürün fotoğrafları (en fazla 10)"}</Text></Pressable>
      {!!images.length && <ScrollView horizontal style={{ marginBottom: 12 }}>{images.map((image) => <Image key={image.uri} source={{ uri: image.uri }} style={styles.thumb} />)}</ScrollView>}
      <Field label="Ürün adı" value={name} onChangeText={setName} />
      <Text style={styles.fieldLabel}>Ürün tipi</Text>
      <ChipGroup options={[{ id: "pattern", label: "El işi deseni" }, ...PRINTABLE_KIND_OPTIONS]} value={kind} onChange={setKind} />
      {kind === "pattern" && <><Text style={styles.fieldLabel}>El işi türü</Text><ChipGroup options={CRAFT_OPTIONS} value={craft} onChange={setCraft} /></>}
      <Field label="Ürün türü (İngilizce)" value={productType} onChangeText={setProductType} autoCapitalize="none" />
      <Field label="Etsy fiyatı (USD)" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" placeholder="6.50" />
      <Field label="Etsy fiyatı (TL, mağaza TL ise)" value={priceTry} onChangeText={setPriceTry} keyboardType="decimal-pad" placeholder="249" />
      <Field label={`Başlık (${title.length}/140)`} value={title} onChangeText={setTitle} multiline />
      <Field label="Etiketler (virgülle, 13 adet, her biri en fazla 20 karakter)" value={tags} onChangeText={setTags} multiline autoCapitalize="none" />
      <Field label="Açıklama" value={description} onChangeText={setDescription} multiline style={[styles.input, { minHeight: 160, textAlignVertical: "top" }]} />
      <View style={styles.card}>
        <Toggle label={kind === "pattern" ? "Desen bizzat örülerek / yapılarak test edildi" : "Test baskısı alındı (Letter ve A4)"} value={testMade} onChange={setTestMade} />
        <Toggle label="Görseller render (gerçek fotoğraf değil)" value={photosAreRenders} onChange={setPhotosAreRenders} />
        <Toggle label="PDF hazırlanırken yapay zekâ kullanıldı" value={aiAssisted} onChange={setAiAssisted} />
      </View>
      {!testMade && <Text style={styles.warningText}>{kind === "pattern" ? "Test edilmemiş desenler Etsy'de en çok kötü yorum alan ürünlerdir. Satışa açmadan önce bir kez örmeniz önerilir." : "Satıştan önce her formattan bir sayfayı %100 ölçekte yazdırıp kenar boşluklarını kontrol edin."}</Text>}
      <Pressable style={[styles.analyzeButton, { marginTop: 14 }, saving && styles.primaryDisabled]} disabled={saving} onPress={save}>{saving ? <ActivityIndicator color="white" /> : <Ionicons name="cloud-upload-outline" size={18} color="white" />}<Text style={styles.primaryText}>Güvenli depoya yükle</Text></Pressable>
    </ScrollView></SafeAreaView>
  </Modal>;
}

function GrantForm({ product, onClose }: any) {
  const [orderRef, setOrderRef] = useState("");
  const [channel, setChannel] = useState("shopier");
  const [maxDownloads, setMaxDownloads] = useState("3");
  const [expiresInDays, setExpiresInDays] = useState("14");
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!orderRef.trim()) return Alert.alert("Sipariş numarası", "Ödemesi alınmış siparişin numarasını girin.");
    setSaving(true);
    try {
      const { grant } = await apiJson(`/api/digital/products/${product.id}/grants`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, orderRef, channel, maxDownloads: Number(maxDownloads), expiresInDays: Number(expiresInDays) }) });
      onClose(true);
      await Share.share({ message: `Merhaba, ${product.name} desen PDF'iniz hazır: ${grant.url}\nBu bağlantı size özeldir; ${grant.maxDownloads} kez indirilebilir ve ${new Date(grant.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar geçerlidir. İyi örgüler!` });
    } catch (error) { Alert.alert("Bağlantı oluşturulamadı", errorText(error)); }
    finally { setSaving(false); }
  };
  return <Modal visible={Boolean(product)} animationType="slide" transparent onRequestClose={() => onClose(false)}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard}>
      <Text style={styles.cardTitle}>Ödeme sonrası indirme bağlantısı</Text>
      <Text style={styles.small}>Yalnızca ödemesi alınmış sipariş için oluşturun. Bağlantı sipariş numarasına bağlanır, indirme sayısı ve süresi sınırlıdır; iade olursa kapatabilirsiniz.</Text>
      <Field label="Sipariş numarası" value={orderRef} onChangeText={setOrderRef} placeholder="Shopier sipariş no" />
      <ChipGroup options={[{ id: "shopier", label: "Shopier" }, { id: "etsy", label: "Etsy" }, { id: "direct", label: "Doğrudan" }]} value={channel} onChange={setChannel} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="İndirme hakkı" value={maxDownloads} onChangeText={setMaxDownloads} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Geçerlilik (gün)" value={expiresInDays} onChangeText={setExpiresInDays} keyboardType="number-pad" /></View>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.reject} onPress={() => onClose(false)}><Text style={styles.rejectText}>Vazgeç</Text></Pressable>
        <Pressable style={[styles.approve, saving && styles.primaryDisabled]} disabled={saving} onPress={create}><Text style={styles.primaryText}>Oluştur ve paylaş</Text></Pressable>
      </View>
    </View></View>
  </Modal>;
}

function DigitalPanel({ online, shopReady, prefill, onPrefillUsed }: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [grantProduct, setGrantProduct] = useState<any>();
  const [details, setDetails] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string>();
  const load = async () => {
    setLoading(true);
    try { setProducts((await apiJson("/api/digital/products", { headers: apiHeaders() })).products || []); }
    catch (error) { Alert.alert("Dijital ürünler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  useEffect(() => { if (prefill) setFormVisible(true); }, [prefill]);
  const loadDetail = async (id: string) => {
    try { const detail = await apiJson(`/api/digital/products/${id}`, { headers: apiHeaders() }); setDetails((current) => ({ ...current, [id]: detail })); }
    catch (error) { Alert.alert("Bağlantılar alınamadı", errorText(error)); }
  };
  const etsyDraft = (product: any) => {
    if (product.etsy?.fileUploaded) return openUrl(product.etsy.editUrl, "Etsy taslak ilanı");
    if (!shopReady) return Alert.alert("Etsy mağazası hazır değil", "Mağaza açılıp uygulamada Etsy bağlantısı 'Bağlı' görünene kadar taslak oluşturulamaz.");
    Alert.alert("Etsy'de taslak ilan oluşturulsun mu?", "Başlık, açıklama, etiketler, görseller ve PDF Etsy'ye taslak olarak gönderilir. İlan yayına girmez; kontrol edip Etsy'de siz yayınlarsınız. Yayınlarken Etsy ilan ücreti alır.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Taslak oluştur", onPress: async () => {
        setBusy(product.id);
        try {
          const result = await apiJson(`/api/digital/products/${product.id}/etsy-draft`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) });
          await load();
          Alert.alert("Etsy taslağı hazır", "Taslağı açıp yapay zekâ kutusunu, kategoriyi ve fiyatı kontrol ettikten sonra yayınlayın.", [{ text: "Taslağı aç", onPress: () => openUrl(result.editUrl, "Etsy taslak ilanı") }, { text: "Tamam" }]);
        } catch (error) { Alert.alert("Etsy taslağı oluşturulamadı", errorText(error)); await load(); }
        finally { setBusy(undefined); }
      } }
    ]);
  };
  const revoke = (grant: any, productId: string) => Alert.alert("Bağlantı kapatılsın mı?", `${grant.orderRef} siparişinin indirme bağlantısı hemen çalışmaz hale gelir.`, [
    { text: "Vazgeç", style: "cancel" },
    { text: "Kapat", style: "destructive", onPress: async () => {
      try { await apiJson(`/api/digital/grants/${grant.id}/revoke`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) }); await loadDetail(productId); }
      catch (error) { Alert.alert("Kapatılamadı", errorText(error)); }
    } }
  ]);
  return <>
    <View style={styles.guardrail}><Ionicons name="lock-closed-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>PDF herkese açık değildir. Etsy'de dosyayı Etsy yalnızca ödeme yapan alıcıya verir. Shopier ve doğrudan satışlarda her sipariş için sınırlı indirmeli, süreli ve kapatılabilir özel bağlantı oluşturulur.</Text></View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Dijital desenler</Text><Pressable style={[styles.addButton, !online && styles.primaryDisabled]} disabled={!online} onPress={() => setFormVisible(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>PDF yükle</Text></Pressable></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {!loading && !products.length && <Empty icon="document-text-outline" title="Henüz dijital desen yok" text="Stüdyo'da ilanı hazırlayıp PDF ve render görsellerini buradan yükleyin." />}
    {products.map((product) => <View style={styles.card} key={product.id}>
      <View style={styles.shopierProductTop}>
        {product.images?.[0] ? <Image source={{ uri: product.images[0].url }} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="document-text" size={26} color="#C88B47" /></View>}
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.small}>{product.fileName} · {Math.round(product.fileSize / 1024)} KB · {product.images?.length || 0} görsel</Text><Text style={styles.price}>{[product.prices?.usd ? `${product.prices.usd} USD` : "", product.prices?.try ? `${product.prices.try} TL` : ""].filter(Boolean).join(" · ")}</Text></View>
      </View>
      <Text style={styles.small} numberOfLines={2}>{product.listing?.title}</Text>
      {!product.flags?.testMade && <Text style={styles.warningText}>• Test edilmedi</Text>}
      {!!product.etsy?.error && <Text style={styles.warningText}>• Etsy: {product.etsy.error}</Text>}
      <View style={styles.inlineActions}>
        <Pressable style={[styles.secondaryButton, busy === product.id && styles.primaryDisabled]} disabled={busy === product.id} onPress={() => etsyDraft(product)}><Text style={styles.secondaryButtonText}>{product.etsy?.fileUploaded ? "Etsy taslağını aç" : product.etsy?.listingId ? "Etsy yüklemesini tamamla" : "Etsy taslağı oluştur"}</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setGrantProduct(product)}><Text style={styles.secondaryButtonText}>Satış bağlantısı</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => loadDetail(product.id)}><Text style={styles.secondaryButtonText}>Bağlantılar</Text></Pressable>
      </View>
      {(details[product.id]?.grants || []).map((grant: any) => <View style={styles.grantRow} key={grant.id}>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{grant.orderRef} · {grant.channel}</Text><Text style={styles.small}>{grant.revoked ? "Kapatıldı" : `${grant.downloads}/${grant.maxDownloads} indirme · ${new Date(grant.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar`}</Text></View>
        {!grant.revoked && <Pressable onPress={() => Share.share({ message: grant.url })}><Ionicons name="share-outline" size={20} color="#315B4C" /></Pressable>}
        {!grant.revoked && <Pressable onPress={() => revoke(grant, product.id)}><Ionicons name="close-circle-outline" size={21} color="#A84A3A" /></Pressable>}
      </View>)}
    </View>)}
    <DigitalUploadForm visible={formVisible} prefill={prefill} onClose={() => { setFormVisible(false); onPrefillUsed(); }} onSaved={async () => { setFormVisible(false); onPrefillUsed(); await load(); Alert.alert("Yüklendi", "PDF güvenli depoya alındı. Etsy mağazası hazırsa 'Etsy taslağı oluştur' ile ilana dönüştürebilirsiniz."); }} />
    <GrantForm product={grantProduct} onClose={async (created: boolean) => { const id = grantProduct?.id; setGrantProduct(undefined); if (created && id) await loadDetail(id); }} />
  </>;
}

const ETSY_GUIDE: Array<{ id: string; title: string; icon: any; steps: string[] }> = [
  { id: "daily", title: "Her gün 10 dakika", icon: "today-outline", steps: [
    "Uygulama Etsy sekmesiyle açılır. Trend → PDF ürünleri'ndeki 'İlgi sıralaması'na ve Keşfedilenler'e bakın. Sunucu siz uygulamayı açmasanız da her 30 dakikada bir Etsy'yi tarar.",
    "65 ve üstü puan (Yüksek fırsat) olan aramaları açın. 'Talep zayıf' ve 'Rekabet yoğun' yazanları şimdilik atlayın.",
    "Sezon fırsatları'nda 'Hemen listele' yazan bir dönem varsa önce ona hazırlanın.",
    "PDF aramasında 'Bu nişte PDF hazırla', desen aramasında 'Bu nişte desen hazırla' düğmesine basın. Fiziksel ürün için Shopier sekmesinde ürünün 'Etsy ilanı hazırla' düğmesini kullanın.",
    "Siparişleri ve mesajları Etsy'nin 'Sell on Etsy' uygulamasından takip edin. Mesajlara 24 saat içinde dönmek Star Seller rozetini korur."
  ] },
  { id: "discovery", title: "Otomatik keşif nasıl çalışır?", icon: "sync-circle-outline", steps: [
    "Başlangıç listesi: 28 sabit niş ve yaklaşan ABD sezonlarının aramaları.",
    "Her taramada Etsy'de son 120 günde açılıp hızla favori toplayan ilanların etiketleri okunur. Bu etiketlerdeki 2+ kelimelik arama ifadeleri 'Keşfedilenler' listesine eklenir. Böylece liste sabit kalıpta kalmaz; alıcıların yeni kullanmaya başladığı ifadelerle büyür.",
    "Sunucu her 30 dakikada bir, en uzun süredir taranmamış aramayı tarar (günde 48 tarama). Liste en çok 80 arama tutar; puanı düşenler sona düşer.",
    "Google Trends'in herkese açık bir API'si yoktur. Kartlardaki Google Trends düğmesi ABD eyaletlerini ve 'İlgili sorgular'ı gösterir. Orada gördüğünüz ifadeyi Trend'deki arama kutusuna yazıp taratın; ifade otomatik keşif listesine de girer ve düzenli taranır."
  ] },
  { id: "score", title: "Puanlar ne anlama gelir?", icon: "speedometer-outline", steps: [
    "Puan 0–100 arasıdır: talep (aylık favori) %40, açıklık (rakip ilan sayısı) %25, yeni ilanların başarısı %20, fiyat seviyesi %15.",
    "65+ Yüksek fırsat · 45–64 Denenebilir · 'Talep zayıf' alıcı az demektir · 'Rekabet yoğun' ilan çok demektir.",
    "Etsy satış adedini paylaşmaz. Puan favori ve ilan verisinden yapılan bir tahmindir. Karar vermeden önce kartı açıp rakip ilanlara bakın.",
    "Pahalı fiziksel ürünlerde (gümüş tesbih vb.) favori sayısı doğal olarak düşüktür. Az satış da yüksek kazanç demektir."
  ] },
  { id: "printables", title: "PDF ürün satışı adım adım (planlayıcı, boyama, duvar sanatı…)", icon: "document-attach-outline", steps: [
    "Trend → PDF ürünleri: planlayıcı, dijital planlayıcı, boyama, duvar sanatı, tarif kartı, parti oyunları, günlük, çocuk etkinlikleri ve kâğıt işi nişleri puanlanır. 'İlgi sıralaması' alıcı ilgisini çubukla gösterir.",
    "Bir kartı açıp 'Öne geçmek için ne yapmalı?' önerilerini okuyun, sonra 'Bu nişte PDF hazırla'ya basın.",
    "Stüdyo PDF türünü, ürünü, trend özelliklerini, renkleri, formatları ve sayfa sayısını kendisi doldurur. Sayfa sayısı rakiplerin ortancasından biraz fazladır. Siz 'Prompt, görsel ve ilanı hazırla'ya basarsınız.",
    "1) PDF promptunu Claude veya ChatGPT'ye verin; prompt yazdırmaya hazır dosyaları her format için ayrı üretir. Boyama, duvar sanatı ve kâğıt işinde 2) sayfa görseli promptlarıyla görselleri üretin.",
    "Reklam tadında 10 görselin her birinde nerede kullanılacağı (Etsy kapak, galeri, Pinterest, Instagram), ölçüsü ve üstüne yazılacak kısa metin yazar. Görseli üretirken PDF sayfalarınızı referans olarak yükleyin, yazıyı Canva ile ekleyin.",
    "Pinterest pinlerini farklı günlerde paylaşın. Paket fikriyle aynı stilde bir set hazırlayın.",
    "Dijital → PDF'i ve görselleri yükleyin → 'Etsy taslağı oluştur'. Etsy'de yapay zekâ beyanını ve kategoriyi kontrol edip yayınlayın."
  ] },
  { id: "pdf-win", title: "PDF satışında öne geçmek", icon: "trophy-outline", steps: [
    "Kapak görseli satışın yarısıdır: küçük görünümde okunan 3-5 kelimelik başlık ve sayfa sayısı ya da format rozeti ekleyin.",
    "10 görselin hepsini kullanın. 'Neler var?', 'Ölçü/format' ve 'Nasıl çalışır' görselleri yanlış beklentiyi, iadeyi ve kötü yorumu azaltır.",
    "ABD alıcısı US Letter kullanır: Letter ve A4'ü birlikte sunun. Rakiplerin az sunduğu formatı (A5, düzenlenebilir, tablet) Trend kartındaki boşluk önerisine göre ekleyin.",
    "Aynı stilde ürün ailesi kurun (ör. planlayıcı + takip sayfası + günlük) ve paket satın; tekli ilanların açıklamasında pakete yönlendirin.",
    "Pinterest'i açın; dijital PDF ürünlerinde en büyük dış trafik kaynağıdır. Her ürün için Stüdyo'nun hazırladığı 3 pini kullanın.",
    "Düzenli yeni ürün ekleyin: yeni ilanlar aramada kısa süreli görünürlük kazanır ve mağazanız daha çok aramada yer alır.",
    "Marka, karakter ve ünlü adı kullanmayın; sistem bu kelimeleri ilanlarınızdan otomatik çıkarır. İhlal, ilan kaldırma ve mağaza kapanmasının en sık nedenidir.",
    "PDF'in içine 'Nasıl yazdırılır' sayfası ve teşekkür sayfası koyun; satıştan sonra kısa bir teşekkür mesajı gönderin. Etsy kuralları gereği yorum karşılığında indirim veya hediye vermeyin."
  ] },
  { id: "pattern", title: "El işi deseni satışı adım adım", icon: "document-text-outline", steps: [
    "Trend'de bir desen araması açın → 'Bu nişte desen hazırla'.",
    "Stüdyo tüm alanları o aramanın güncel Etsy verisinden kendisi doldurur: ürün, trend özellikleri, renkler, zorluk, malzeme ve varsa ölçü. Siz yalnızca 'Prompt ve ilanı hazırla'ya basarsınız.",
    "Her seferinde o arama için daha önce kullanılmamış bir özellik kombinasyonu, yeni bir palet ve daha önce verilmemiş bir desen adı seçilir. Trendin en güçlü özelliği ve ana rengi korunur. 'Başka trend kombinasyonu' yeni seçenek getirir; kendi modeliniz varsa 'Kendi modelimden hazırla'ya basın.",
    "Promptu 'Kopyala / gönder' ile Claude veya ChatGPT'ye verin. PDF'i ve render görsellerini telefona kaydedin.",
    "Kalite kapısındaki maddeleri kontrol edin: ölçüler, ilmek sayıları, kısaltmalar, en az bir deneme örneği.",
    "Dijital → PDF'i ve görselleri yükleyin → 'Etsy taslağı oluştur'. Başlık, 13 etiket ve açıklama otomatik gelir.",
    "Etsy'de taslağı açın, yapay zekâ beyanını ve kategoriyi kontrol edip yayınlayın. Dijital desenlerde bu beyan Etsy'de elle işaretlendiği için son adım Etsy'dedir."
  ] },
  { id: "physical", title: "Tesbih, gümüş, vintage (fiziksel ürün)", icon: "diamond-outline", steps: [
    "Ürünü fotoğraf, TL fiyat ve açıklamayla Shopier'e ekleyin. Shopier sekmesinde ürünün 'Etsy ilanı hazırla' düğmesine basın.",
    "'Bu ürünü kim yaptı?' sorusunu doğru cevaplayın. Hazır alınıp yeniden satılan ürün Etsy'de yasaktır; sistem yayınlamaz. Ustaya yaptırılan tasarım üretim ortağıyla listelenir. Vintage ürün en az 20 yıllık olmalıdır.",
    "925 damgası veya ayar belgesi yoksa ilanda 'gümüş' yazılmaz; sistem uyarır.",
    "Ağırlık, tane sayısı ve ABD kargo ücretini girin → 'Etsy'de araştır ve hazırla'. Sistem arama ifadelerini bulur, rakipleri ve etiketleri okur, TL fiyatı güncel kurla USD'ye çevirir, Etsy kesintileri ve kargoyla birlikte ortanca fiyatla karşılaştırır.",
    "Başlığı, etiketleri ve fiyatı isterseniz düzeltin → 'Etsy taslağı oluştur' → 'Taslağı kontrol et' → 'Etsy'de yayınla'. Yayınlamada Etsy 0,20 USD ilan ücreti keser."
  ] },
  { id: "delivery", title: "PDF teslimi ve koruma", icon: "lock-closed-outline", steps: [
    "Etsy satışında PDF'i Etsy teslim eder. Alıcı ödeme yaptıktan sonra dosyayı Etsy'deki 'Purchases' sayfasından indirir. Ödeme yapmayan erişemez.",
    "Shopier veya doğrudan satışta: ödeme gelince Dijital → ürün → 'Satış bağlantısı' ile siparişe özel bir bağlantı oluşturun (varsayılan 3 indirme, 14 gün) ve alıcıya gönderin.",
    "İade olursa veya bağlantının paylaşıldığından şüphelenirseniz bağlantıyı 'Bağlantılar' bölümünden kapatın.",
    "İndirilmiş bir dosyanın kopyalanmasını hiçbir sistem tamamen engelleyemez. PDF'teki telif altbilgisi ve lisans sayfası caydırıcıdır. Kopyayı görürseniz Etsy'nin fikrî mülkiyet bildirim formunu kullanın."
  ] },
  { id: "rules", title: "Etsy kuralları: dikkat edilecekler", icon: "shield-checkmark-outline", steps: [
    "Hazır alınıp yeniden satılan ürün listelenmez (vintage ve el işi malzemesi hariç).",
    "Başkasının desenini, fotoğrafını veya metnini kopyalamayın. Stüdyo her desen için bir farklılaştırma planı üretir.",
    "Başlıkta başka markaların adını ve abartılı iddiaları kullanmayın, aynı kelimeyi üst üste tekrarlamayın. Sistem başlığın uzunluğunu ve özel karakterlerini Etsy kurallarına göre düzeltir.",
    "Yapay zekâyla üretilen görselleri ve desenleri ilanda belirtin.",
    "Fiziksel üründe gerçek ürün fotoğrafı kullanın. Render tek başına alıcıyı yanıltabilir.",
    "Başlıklara eyalet adı doldurmayın. Etsy ilanı tüm ABD'de gösterir; bölge hedeflemesi doğru arama ifadesi ve sezon seçimiyle yapılır."
  ] },
  { id: "setup", title: "Mağaza açılışı ve bir kez yapılacak ayarlar", icon: "storefront-outline", steps: [
    "etsy.com/sell adresinde mağaza açılışını tamamlayın. Mağaza adı GXLMarketStudio'dur. Kimlik, banka ve kart bilgilerini yalnızca Etsy'nin kendi sayfasına girin.",
    "Kargo profili: Shop Manager → Settings → Shipping settings. ABD için ücretsiz kargo seçin; kargo bedeli fiyata zaten dahil edilir.",
    "Üretim ortağı: ustaya yaptırdığınız ürünler için Shop Manager → Settings → Production partners bölümünden usta veya atölyeyi ekleyin.",
    "Mağaza politikaları: iade koşullarını yazın ve dijital ürünlerin iade edilmediğini belirtin.",
    "Açılıştan sonra Özet sekmesindeki Etsy kanalı 'Bağlı' görünür. Taslak ve yayınlama düğmeleri o zaman açılır."
  ] },
  { id: "trouble", title: "Sorun giderme", icon: "construct-outline", steps: [
    "'Etsy mağazası hazır değil': mağaza açılışı bitmemiş ya da yetki yenilenmesi gerekiyor. Aşağıdaki düğmelerle kuruluma devam edin.",
    "'Tarama durdu' veya 'çok fazla istek': Etsy'nin istek sınırına takıldınız. Birkaç dakika sonra tekrar deneyin; otomatik keşif kendi hızında devam eder.",
    "'Yayınlanamadı': ilanda en az bir fotoğraf, bir kargo profili ve fiyat olmalıdır. Taslağı Etsy'de açıp eksik alanı tamamlayın.",
    "'Keşfedilenler' boş görünüyorsa ilk otomatik taramalar birkaç saat sürer. Hızlandırmak için gruplarda 'Tümünü tara' düğmesine basın.",
    "Üstte 'Yerel mod' görünüyorsa sunucuya bağlanılamıyordur. 'Bağlantı anahtarını yeniden gir' ile anahtarı tekrar girin."
  ] }
];

function EtsyGuide({ shopReady, authorized }: any) {
  const [open, setOpen] = useState<string>(shopReady ? "daily" : "setup");
  return <>
    <View style={styles.guardrail}><Ionicons name="book-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Etsy önceliklidir; Shopier ve Letgo ikinci plandadır. Sistem trendleri bulur, arama ifadelerini keşfeder, başlığı, etiketleri ve fiyatı hazırlar. Yayınlama gibi para harcatan adımlar tek dokunuşla sizin onayınızla yapılır.</Text></View>
    {ETSY_GUIDE.map((section) => <View style={styles.card} key={section.id}>
      <Pressable style={styles.shopierProductTop} onPress={() => setOpen(open === section.id ? "" : section.id)}>
        <Ionicons name={section.icon} size={20} color="#315B4C" />
        <Text style={[styles.cardTitle, { flex: 1 }]}>{section.title}</Text>
        <Ionicons name={open === section.id ? "chevron-up" : "chevron-down"} size={18} color="#68736E" />
      </Pressable>
      {open === section.id && <>
        {section.steps.map((step, index) => <Text style={styles.analysisLine} key={index}>{index + 1}. {step}</Text>)}
        {(section.id === "setup" || section.id === "trouble") && <View style={[styles.chips, { marginTop: 10 }]}>
          {!authorized && <Pressable style={styles.secondaryButton} onPress={connectEtsy}><Text style={styles.secondaryButtonText}>Etsy'yi bağla</Text></Pressable>}
          {!shopReady && <Pressable style={styles.secondaryButton} onPress={() => openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu")}><Text style={styles.secondaryButtonText}>Mağaza kurulumuna devam et</Text></Pressable>}
          <Pressable style={styles.secondaryButton} onPress={() => openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy mağaza yöneticisi")}><Text style={styles.secondaryButtonText}>Mağaza yöneticisi</Text></Pressable>
        </View>}
        {section.id === "rules" && <Pressable style={[styles.secondaryButton, { marginTop: 10, alignSelf: "flex-start" }]} onPress={() => openUrl("https://www.etsy.com/legal/sellers/", "Etsy satıcı kuralları")}><Text style={styles.secondaryButtonText}>Etsy satıcı kurallarını aç</Text></Pressable>}
      </>}
    </View>)}
  </>;
}

const ORIGIN_OPTIONS = [
  { id: "made_by_seller", label: "Ben / atölyem yaptı" },
  { id: "designed_by_seller", label: "Tasarım benim, ustaya yaptırdım" },
  { id: "vintage", label: "Vintage (20+ yıllık)" },
  { id: "commercial_resale", label: "Hazır aldım, yeniden satıyorum" }
];

function EtsyProductPlanner({ product, etsyReady, onClose }: any) {
  const [origin, setOrigin] = useState("designed_by_seller");
  const [yearMade, setYearMade] = useState("");
  const [materialVerified, setMaterialVerified] = useState(false);
  const [weightGrams, setWeightGrams] = useState("");
  const [beadCount, setBeadCount] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [shippingTry, setShippingTry] = useState("");
  const [productNounEn, setProductNounEn] = useState("");
  const [usdTryRate, setUsdTryRate] = useState("");
  const [readyToShip, setReadyToShip] = useState(true);
  const [progress, setProgress] = useState("");
  const [plan, setPlan] = useState<any>();
  const [payload, setPayload] = useState<any>();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<any>();
  const [published, setPublished] = useState<any>();
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    setPlan(undefined);
    setDraft(undefined);
    setPublished(undefined);
    setProgress("");
    const weight = String(product?.title || "").match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\b/i);
    setWeightGrams(weight ? weight[1].replace(",", ".") : "");
  }, [product]);
  const analyze = async () => {
    const base: any = {
      sourceId: product.id,
      titleTr: product.title,
      descriptionTr: product.description,
      priceTry: (product.currency || "TRY") === "TRY" ? product.price : undefined,
      origin,
      yearMade: yearMade || undefined,
      materialVerified,
      weightGrams: weightGrams || undefined,
      beadCount: beadCount || undefined,
      lengthCm: lengthCm || undefined,
      shippingTry: shippingTry || undefined,
      productNounEn: productNounEn || undefined,
      usdTryRate: usdTryRate || undefined,
      readyToShip,
      quantity: product.stockQuantity || 1,
      imageUrls: (product.media || []).map((item: any) => item.url).filter(Boolean)
    };
    setPlan(undefined);
    try {
      setProgress("Alıcıların kullandığı arama ifadeleri bulunuyor…");
      const suggestion = await apiJson("/api/products/etsy-keywords", { method: "POST", headers: apiHeaders(true), body: JSON.stringify(base) });
      if (!base.productNounEn && suggestion.signals?.noun && suggestion.signals.noun !== "item") base.productNounEn = suggestion.signals.noun;
      for (const keyword of suggestion.candidates) {
        setProgress(`Etsy'de araştırılıyor: ${keyword}`);
        try { await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword }) }); }
        catch { /* bir arama başarısız olursa diğerleriyle devam edilir */ }
      }
      setProgress("Başlık, etiket, açıklama ve fiyat hazırlanıyor…");
      const result = await apiJson("/api/products/etsy-plan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ product: base, keywords: suggestion.candidates }) });
      setPayload(base);
      setPlan(result.plan);
      setTitle(result.plan.title);
      setTags(result.plan.tags.join(", "));
      setPriceUsd(result.plan.pricing ? String(result.plan.pricing.recommendedUsd) : "");
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setProgress(""); }
  };
  const createDraft = () => {
    if (!etsyReady) return Alert.alert("Etsy mağazası hazır değil", "Mağaza açılıp Etsy bağlantısı 'Bağlı' görünene kadar taslak oluşturulamaz.");
    Alert.alert("Etsy'de taslak ilan oluşturulsun mu?", "İlan önce taslak olarak oluşturulur, yayına girmez. Kontrol ettikten sonra buradan veya Etsy'den yayınlayabilirsiniz.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Taslak oluştur", onPress: async () => {
        setSaving(true);
        try {
          const result = await apiJson("/api/products/etsy-draft", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, product: payload, listing: { title, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), description: plan.description, materials: plan.materials, priceUsd: Number(priceUsd.replace(",", ".")) } }) });
          setDraft(result);
          Alert.alert(result.alreadyCreated ? "Taslak zaten var" : "Etsy taslağı hazır", [...(result.warnings || []), "Taslağı kontrol ettikten sonra 'Etsy'de yayınla' düğmesine basın."].join("\n"), [{ text: "Taslağı aç", onPress: () => openUrl(result.editUrl, "Etsy taslak ilanı") }, { text: "Tamam" }]);
        } catch (error) { Alert.alert("Taslak oluşturulamadı", errorText(error)); }
        finally { setSaving(false); }
      } }
    ]);
  };
  const publish = () => {
    if (!draft) return;
    Alert.alert("Etsy'de yayınlansın mı?", "İlan alıcılara açılır ve Etsy 0,20 USD ilan ücreti keser. Fotoğrafları, fiyatı ve kargo profilini taslakta kontrol ettiyseniz devam edin.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Taslağı aç", onPress: () => openUrl(draft.editUrl, "Etsy taslak ilanı") },
      { text: "Yayınla", onPress: async () => {
        setPublishing(true);
        try {
          const result = await apiJson("/api/products/etsy-publish", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, listingId: draft.listingId }) });
          setPublished(result);
          Alert.alert("İlan yayında", "Etsy ilanı alıcılara açıldı.", [{ text: "İlanı aç", onPress: () => openUrl(result.url, "Etsy ilanı") }, { text: "Tamam" }]);
        } catch (error) { Alert.alert("Yayınlanamadı", `${errorText(error)}\nTaslağı Etsy'de açıp eksik alanı tamamlayın, sonra tekrar deneyin.`); }
        finally { setPublishing(false); }
      } }
    ]);
  };
  const eligibility = plan?.eligibility;
  const pricing = plan?.pricing;
  const bannerStyle = eligibility?.status === "allowed" ? styles.policyAllowed : eligibility?.status === "blocked" ? styles.policyBlocked : styles.policyReview;
  return <Modal visible={Boolean(product)} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={[styles.sectionTitle, { flex: 1 }]}>Etsy ilanı hazırla</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color="#315B4C" /></Pressable></View>
      <Text style={styles.cardTitle}>{product?.title}</Text>
      <Text style={styles.price}>{product?.price} {product?.currency || "TRY"}</Text>
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Bu ürünü kim yaptı?</Text>
      <ChipGroup options={ORIGIN_OPTIONS} value={origin} onChange={setOrigin} />
      {origin === "vintage" && <Field label="Üretim yılı (yaklaşık)" value={yearMade} onChangeText={setYearMade} keyboardType="number-pad" placeholder="1985" />}
      <View style={styles.card}>
        <Toggle label="Ayar damgası veya malzeme belgesi var (925 vb.)" value={materialVerified} onChange={setMaterialVerified} />
        <Toggle label="Hazır stokta, hemen gönderilebilir" value={readyToShip} onChange={setReadyToShip} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Ağırlık (g)" value={weightGrams} onChangeText={setWeightGrams} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Tane sayısı" value={beadCount} onChangeText={setBeadCount} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Uzunluk (cm)" value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" /></View>
      </View>
      <Field label="ABD'ye kargo ücreti (TL)" value={shippingTry} onChangeText={setShippingTry} keyboardType="decimal-pad" placeholder="ör. 1200" />
      <Field label="İngilizce ürün adı (boşsa sistem bulur)" value={productNounEn} onChangeText={setProductNounEn} autoCapitalize="none" placeholder="prayer beads, brooch, rug" />
      <Field label="Dolar kuru (boşsa güncel kur alınır)" value={usdTryRate} onChangeText={setUsdTryRate} keyboardType="decimal-pad" />
      <Pressable style={[styles.analyzeButton, Boolean(progress) && styles.primaryDisabled]} disabled={Boolean(progress)} onPress={analyze}>{progress ? <ActivityIndicator color="white" /> : <Ionicons name="search" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "Yeniden araştır" : "Etsy'de araştır ve hazırla"}</Text></Pressable>
      {!!progress && <Text style={styles.formHint}>{progress}</Text>}
      {plan && <>
        <View style={[styles.policyBox, bannerStyle, { marginBottom: 14 }]}>
          <Text style={styles.policyName}>ETSY KURAL KONTROLÜ</Text>
          <Text style={styles.policyLabel}>{eligibility.status === "allowed" ? "Etsy'de satılabilir" : eligibility.status === "blocked" ? "Etsy'de yayınlanmaz" : "Eksik bilgi var"}</Text>
          {eligibility.reasons.map((reason: string) => <Text style={styles.analysisLine} key={reason}>• {reason}</Text>)}
          {eligibility.requiredEvidence.map((item: string) => <Text style={styles.warningText} key={item}>• Gerekli: {item}</Text>)}
        </View>
        <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>Alıcıların aradığı ifadeler</Text>
          {plan.keywordScores.map((row: any) => <Text style={styles.analysisLine} key={row.keyword}>{row.keyword === plan.primaryKeyword ? "★ " : "• "}{row.keyword} — {row.score ?? "veri yok"} puan{row.activeListings ? ` · ${Number(row.activeListings).toLocaleString("tr-TR")} ilan` : ""}{row.medianPriceUsd ? ` · ortanca ${row.medianPriceUsd} USD` : ""}</Text>)}
          <Text style={styles.formHint}>★ işaretli ifade başlığın başına yerleştirildi.</Text>
        </View>
        {pricing && <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>Fiyat analizi</Text>
          <Text style={styles.analysisLine}>Shopier fiyatı: {pricing.priceTry} TL ≈ {pricing.targetNetUsd} USD (kur {pricing.usdTryRate})</Text>
          <Text style={styles.analysisLine}>Etsy kesintileri: %{pricing.feePercent} + {pricing.fixedFeesUsd} USD sabit</Text>
          <Text style={styles.analysisLine}>ABD kargosu (fiyata dahil): {pricing.shippingUsd} USD</Text>
          <Text style={styles.analysisLine}>Başabaş Etsy fiyatı: {pricing.breakEvenUsd} USD</Text>
          <Text style={styles.analysisLine}>Etsy ortancası: {pricing.medianUsd ?? "—"} USD</Text>
          <Text style={styles.listingTitle}>Önerilen: {pricing.recommendedUsd} USD ≈ {pricing.recommendedTry} TL · elinize ≈ {pricing.netAtRecommendedTry} TL</Text>
          <Text style={styles.warningText}>{pricing.note}</Text>
        </View>}
        <Field label={`Başlık (${title.length}/140)`} value={title} onChangeText={setTitle} multiline />
        <Field label="Etiketler (13 adet)" value={tags} onChangeText={setTags} multiline autoCapitalize="none" />
        <Field label="Etsy fiyatı (USD)" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" />
        <View style={styles.analysisCard}>
          <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Açıklama (İngilizce)</Text><Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: `${title}\n\n${plan.description}\n\nTags: ${tags}` })}><Text style={styles.secondaryButtonText}>Kopyala</Text></Pressable></View>
          <Text style={styles.promptText} numberOfLines={12}>{plan.description}</Text>
        </View>
        {!!plan.competitors.length && <View style={styles.analysisCard}>
          <Text style={styles.cardTitle}>Öne çıkan rakip ilanlar</Text>
          {plan.competitors.map((item: any, index: number) => <Pressable key={`${item.url}-${index}`} onPress={() => item.url && openUrl(item.url, "Etsy ilanı")}><Text style={styles.linkNote} numberOfLines={2}>{item.priceUsd ? `${item.priceUsd.toFixed(2)} USD · ` : ""}{item.favorites} favori · {item.title}</Text></Pressable>)}
        </View>}
        {plan.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
        <Pressable style={[styles.analyzeButton, { marginTop: 14 }, (eligibility.status !== "allowed" || saving || Boolean(draft)) && styles.primaryDisabled]} disabled={eligibility.status !== "allowed" || saving || Boolean(draft)} onPress={createDraft}>{saving ? <ActivityIndicator color="white" /> : <Ionicons name="storefront-outline" size={18} color="white" />}<Text style={styles.primaryText}>{eligibility.status === "blocked" ? "Etsy'de yayınlanamaz" : draft ? "Taslak oluşturuldu" : "Etsy taslağı oluştur"}</Text></Pressable>
        {draft && <View style={[styles.policyBox, published ? styles.policyAllowed : styles.policyReview, { marginTop: 14 }]}>
          <Text style={styles.policyName}>ETSY İLANI #{draft.listingId}</Text>
          <Text style={styles.policyLabel}>{published ? "Yayında" : "Taslak hazır · henüz yayında değil"}</Text>
          <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => published ? openUrl(published.url, "Etsy ilanı") : openUrl(draft.editUrl, "Etsy taslak ilanı")}><Text style={styles.secondaryButtonText}>{published ? "İlanı aç" : "Taslağı kontrol et"}</Text></Pressable>
          {!published && <Pressable style={[styles.analyzeButton, { marginTop: 12 }, publishing && styles.primaryDisabled]} disabled={publishing} onPress={publish}>{publishing ? <ActivityIndicator color="white" /> : <Ionicons name="rocket-outline" size={18} color="white" />}<Text style={styles.primaryText}>Etsy'de yayınla</Text></Pressable>}
        </View>}
      </>}
    </ScrollView></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F2EA" },
  setupSafe: { flex: 1, backgroundColor: "#12261F", justifyContent: "center", padding: 22 },
  setupCard: { backgroundColor: "white", borderRadius: 24, padding: 24 },
  setupIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: "#1E382F", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  setupTitle: { color: "#17221E", fontSize: 25, fontWeight: "900", marginBottom: 10 },
  setupText: { color: "#5A655F", fontSize: 14, lineHeight: 21, marginBottom: 16 },
  setupInput: { backgroundColor: "#F7F6F2", borderWidth: 1, borderColor: "#D8D4CA", borderRadius: 13, paddingHorizontal: 14, paddingVertical: 14, color: "#17221E", marginBottom: 12 },
  setupButton: { backgroundColor: "#315B4C", borderRadius: 13, padding: 15, alignItems: "center" },
  setupButtonText: { color: "white", fontWeight: "900", fontSize: 15 },
  tokenReset: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#FFF0D8", borderRadius: 12, padding: 11, marginBottom: 12 },
  tokenResetText: { color: "#8A521F", fontWeight: "800", fontSize: 12 },
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
  shopierHero: { backgroundColor: "#4A3524", borderRadius: 20, padding: 16, marginBottom: 16 },
  shopierHeroReady: { backgroundColor: "#173E31" },
  shopierLogo: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#C88B47", alignItems: "center", justifyContent: "center" },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F0EDE6" },
  readinessState: { marginLeft: "auto", color: "#B06B28", fontSize: 11, fontWeight: "800" },
  shopierBlocker: { color: "#8A521F", backgroundColor: "#FFF5E8", borderRadius: 8, padding: 9, marginTop: 9, fontSize: 11, lineHeight: 16 },
  shopierProductTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  shopierImagePreview: { width: "100%", height: 220, borderRadius: 14, resizeMode: "cover", marginBottom: 10, backgroundColor: "#EEF0ED" },
  editButton: { width: 38, height: 38, borderRadius: 11, backgroundColor: "#EDF2EF", alignItems: "center", justifyContent: "center" },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  secondaryButton: { borderWidth: 1, borderColor: "#C8D2CD", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  secondaryButtonText: { color: "#315B4C", fontWeight: "800", fontSize: 11 },
  agentHero: { backgroundColor: "#12261F", borderRadius: 20, padding: 16, marginBottom: 16 },
  agentHeroTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  agentAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#A86B2E", alignItems: "center", justifyContent: "center" },
  agentHeroTitle: { color: "white", fontSize: 19, fontWeight: "900" },
  agentHeroText: { color: "#C5D2CC", fontSize: 11, lineHeight: 16, marginTop: 2 },
  agentCounts: { flexDirection: "row", marginTop: 15, gap: 8 },
  agentCount: { flex: 1, backgroundColor: "#1E382F", borderRadius: 12, padding: 10 },
  agentCountValue: { color: "#F1B875", fontSize: 21, fontWeight: "900" },
  agentCountLabel: { color: "#D7E0DC", fontSize: 9, marginTop: 2 },
  chatCard: { backgroundColor: "white", borderRadius: 16, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#E7E3D9" },
  chatBubble: { maxWidth: "92%", borderRadius: 14, padding: 11, marginBottom: 8 },
  ownerBubble: { alignSelf: "flex-end", backgroundColor: "#315B4C", borderBottomRightRadius: 4 },
  agentBubble: { alignSelf: "flex-start", backgroundColor: "#F1EEE7", borderBottomLeftRadius: 4 },
  ownerMessage: { color: "white", lineHeight: 19 },
  agentMessage: { color: "#2F3934", lineHeight: 19 },
  chatWarning: { color: "#8A521F", fontSize: 11, lineHeight: 16, marginTop: 7 },
  chatAction: { color: "#315B4C", fontSize: 11, lineHeight: 16, marginTop: 6, fontWeight: "700" },
  chatInputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 5 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: "#F7F6F2", borderWidth: 1, borderColor: "#DDD8CE", borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, color: "#17221E" },
  sendButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#A86B2E", alignItems: "center", justifyContent: "center" },
  quickPrompts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  quickPrompt: { borderWidth: 1, borderColor: "#D8D4CA", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 7 },
  quickPromptText: { color: "#56615C", fontSize: 10, fontWeight: "700" },
  opportunityTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  kindPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5 },
  kindReal: { backgroundColor: "#DDF3E5" },
  kindPermissioned: { backgroundColor: "#E7EEF8" },
  kindSignal: { backgroundColor: "#FFF0D8" },
  kindText: { color: "#315B4C", fontSize: 9, fontWeight: "900" },
  confidence: { color: "#7A847F", fontSize: 10 },
  evidence: { color: "#5A655F", fontSize: 12, lineHeight: 18, marginTop: 9 },
  nextAction: { color: "#315B4C", fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 9 },
  sourceRow: { flexDirection: "row", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F0EDE6" },
  sourceDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#B5B0A6", marginTop: 5 },
  sourceLive: { backgroundColor: "#48A66D" },
  sourceReady: { backgroundColor: "#D59A4D" },
  sourceTitleRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  sourceStatus: { color: "#8A5C28", fontSize: 10, fontWeight: "800" },
  sourceNote: { color: "#68736E", fontSize: 11, lineHeight: 16, marginTop: 4 },
  guardrail: { flexDirection: "row", gap: 10, backgroundColor: "#E7EEE9", borderRadius: 15, padding: 14, marginBottom: 12 },
  guardrailText: { color: "#4C5A54", fontSize: 11, lineHeight: 17 },
  primary: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, backgroundColor: "#315B4C", padding: 15, borderRadius: 14, marginBottom: 20 },
  primaryText: { color: "white", fontWeight: "800" },
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
  risingChip: { backgroundColor: "#FBEFD9", borderColor: "#E2B676" },
  adviceBox: { backgroundColor: "#F6F2EA", borderRadius: 13, padding: 12, marginTop: 12 },
  adviceRow: { flexDirection: "row", gap: 10, marginTop: 9 },
  adviceDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  adviceHigh: { backgroundColor: "#C0563B" },
  adviceMedium: { backgroundColor: "#C88B47" },
  adviceLow: { backgroundColor: "#7C9A8A" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  barLabel: { width: 112, fontSize: 11, color: "#303B36", fontWeight: "700" },
  barTrack: { flex: 1, height: 10, backgroundColor: "#E7E3D9", borderRadius: 5, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: "#315B4C", borderRadius: 5 },
  barValue: { width: 34, fontSize: 11, color: "#56615C", textAlign: "right" },
  miniScore: { minWidth: 30, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  miniScoreText: { fontSize: 11, fontWeight: "900", color: "#17221E" },
  visualRow: { borderTopWidth: 1, borderTopColor: "#ECE8DF", paddingTop: 10, marginTop: 10 },
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
  segment: { flexDirection: "row", backgroundColor: "#E7E3D9", borderRadius: 13, padding: 4, marginBottom: 14 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  segmentActive: { backgroundColor: "white" },
  segmentText: { color: "#68736E", fontWeight: "800", fontSize: 12 },
  segmentTextActive: { color: "#17221E" },
  scoreBadge: { minWidth: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  scoreHigh: { backgroundColor: "#DDF3E5" },
  scoreMid: { backgroundColor: "#FFF0D8" },
  scoreLow: { backgroundColor: "#F8E1DC" },
  scoreNone: { backgroundColor: "#EEF0ED" },
  scoreBadgeText: { color: "#17221E", fontSize: 17, fontWeight: "900" },
  trendVerdict: { color: "#315B4C", fontWeight: "900", fontSize: 12, marginTop: 4, marginBottom: 3 },
  promptText: { color: "#3B4641", fontSize: 11, lineHeight: 17, backgroundColor: "#F7F6F2", padding: 10, borderRadius: 10, marginTop: 8, fontFamily: "monospace" },
  studioName: { color: "#17221E", fontSize: 22, fontWeight: "900", marginTop: 2 },
  listingTitle: { color: "#17221E", fontSize: 14, fontWeight: "800", lineHeight: 20, marginTop: 8 },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EDF2EF", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "#AEB9B4" },
  thumb: { width: 84, height: 84, borderRadius: 12, marginRight: 8 },
  grantRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F0EDE6", marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#F5F2EA", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  navText: { color: "#748079", fontSize: 9, fontWeight: "600" },
  navTextActive: { color: "#A86B2E" }
});
