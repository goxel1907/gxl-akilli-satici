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
type Tab = "Özet" | "Shopier" | "Ajan" | "Onaylar" | "Müşteriler" | "Ürünler";
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

const navigationTabs: Tab[] = ["Özet", "Shopier", "Ajan", "Onaylar", "Müşteriler", "Ürünler"];
const navigationIcons: Record<Tab, any> = {
  "Özet": "grid",
  "Shopier": "bag-handle",
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
  const [tab, setTab] = useState<Tab>("Özet");
  const [data, setData] = useState<any>(demo);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [channels, setChannels] = useState<any>({
    shopier: { configured: false, connected: false },
    etsy: { configured: false, storageConfigured: false, connected: false }
  });
  const [opportunityCenter, setOpportunityCenter] = useState<any>(demoOpportunityCenter);
  const [shopierCenter, setShopierCenter] = useState<any>(demoShopierCenter);

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
          {tab === "Özet" && <Overview data={data} setTab={setTab} online={online} channels={channels} />}
          {tab === "Shopier" && <ShopierScreen center={shopierCenter} online={online} onRefresh={refresh} />}
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
      <Channel name="Etsy" status={etsyStatus} icon="storefront-outline" connected={etsyAuthorized} onPress={() => etsyShopReady ? openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy mağaza yöneticisi") : etsyAuthorized ? openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") : connectEtsy()} />
      <Channel name="E-posta" status={SALES_EMAIL} icon="mail-outline" onPress={() => openUrl(`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("GXL Market Studio")}`, "E-posta")} />
    </View>
  </>;
}

function ShopierScreen({ center, online, onRefresh }: any) {
  const [formProduct, setFormProduct] = useState<any>(undefined);
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
