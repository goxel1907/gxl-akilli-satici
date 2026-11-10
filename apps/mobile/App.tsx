import { addLocalWhatsapp, localWhatsappLink } from "./marketing-local";
import { photoAssistantPrompt, photoEnhancePrompt, parsePhotoAssistant, listingChatPrompt, parseListingChat, mergeListingAbout } from "./photo-assistant";
import { canRankTrend, compareTrendEvidence, hasBuyerDemand, trendFreshness } from "./trend-priority";
import { listingProgress, listingTasks, physicalListingProgress, etsyTransferComplete, type ListingProgressInput } from "./listing-progress";
import ListingMascot, { type ListingMascotProps } from "./ListingMascot";
import LiveCheckPanel from "./LiveCheckPanel";
import ListingOfferPicker from "./ListingOfferPicker";
import OwnerNotificationsPanel from "./OwnerNotificationsPanel";
import ProductionJourney, { ProductionWorkList, useProductionRecords, saveProductionWorkspace, activeProduction, syncTrackedProduct, syncTrackedProducts, shareProductionPackage, restoreProductions } from "./ProductionTracker";
import { type ProductionRecord } from "./production-tracker";
import { appendLocalFile } from "./upload-file";
import { isLiveReadPath } from "./live-check";
import { sameProduct } from "./product-identity";
import { mergeLocalProducts, generationKey, uploadPrices, PRINTABLE_WORKSPACE_KEY, parsePrintableWorkspace, type PrintableWorkspace } from "./workflow-state";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, Linking, Modal, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || "https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev";
const ACCESS_TOKEN_KEY = "gxl.appAccessToken";
let activeApiToken = "";
const SALES_EMAIL = "gxl.marketstudio@gmail.com";
const apiHeaders = (json = false) => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(activeApiToken ? { authorization: `Bearer ${activeApiToken}` } : {})
});
type Tab = "Özet" | "Shopier" | "Etsy" | "Ajan" | "Onaylar" | "Müşteriler" | "Ürünler" | "Başla" | "Sat" | "Siparişler" | "Müşteri" | "Yardım";
type AppMode = "simple" | "expert";
type SellRoute = "choose" | "where" | "photo" | "shopier" | "digital" | "trend";
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
// Basit mod: hiç bilmeyen biri için dört kapı. Uzman mod bugünkü tüm sekmeleri gösterir.
const simpleTabs: Tab[] = ["Başla", "Sat", "Siparişler", "Müşteri", "Yardım"];
const APP_MODE_KEY = "gxl.appMode";
const navigationIcons: Record<Tab, any> = {
  "Başla": "home",
  "Sat": "camera",
  "Siparişler": "receipt",
  "Müşteri": "megaphone",
  "Yardım": "help-circle",
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

// Ekran kenarları (durum çubuğu, alt gezinme çubuğu) her telefonda farklı; güvenli alan ölçüsü kütüphaneden okunur.
export default function Root() {
  return <SafeAreaProvider><App /></SafeAreaProvider>;
}

// Uygulama açılınca ve öne gelince yeni sürümü denetler. APK yeniden kurulmadan gelen düzeltmeler (EAS Update)
// indirilir ve kullanıcıya yeniden başlatma sorulur. Aynı oturumda bir kez sorulur.
let updateOffered = false;

type UpdateCheckResult = "offered" | "none" | "disabled";

// Arka plandaki denetim ve "Güncellemeyi denetle" aynı anda çalışırsa tek indirme yapılır; indirilmiş güncelleme
// yeniden indirilmez, yalnız yeniden başlatma sorulur.
let updateCheckRunning: Promise<UpdateCheckResult> | null = null;

function offerRestart() {
  Alert.alert("Güncelleme hazır", "Uygulamanın yeni sürümü indirildi. Kaydedilmemiş form bilgileri yeniden başlatmada kaybolabilir. Açık formu tamamladıktan sonra yeniden başlatın.", [
    { text: "Sonra", style: "cancel" },
    { text: "Yeniden başlat", onPress: () => { Updates.reloadAsync().catch(() => undefined); } }
  ]);
}

function checkAndOfferUpdate(): Promise<UpdateCheckResult> {
  if (updateOffered) { offerRestart(); return Promise.resolve("offered"); }
  if (!updateCheckRunning) updateCheckRunning = runUpdateCheck().finally(() => { updateCheckRunning = null; });
  return updateCheckRunning;
}

async function runUpdateCheck(): Promise<UpdateCheckResult> {
  if (__DEV__ || !Updates.isEnabled) return "disabled";
  const result = await Updates.checkForUpdateAsync();
  if (!result.isAvailable) return "none";
  await Updates.fetchUpdateAsync();
  updateOffered = true;
  offerRestart();
  return "offered";
}

function useAppUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let busy = false;
    const check = async () => {
      if (busy || updateOffered) return;
      busy = true;
      try {
        await checkAndOfferUpdate();
      } catch {
        // İnternet yoksa veya sunucu yanıt vermezse bir sonraki açılışta yeniden denenir.
      } finally {
        busy = false;
      }
    };
    check();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") check(); });
    return () => subscription.remove();
  }, []);
}

// Hangi sürümün çalıştığı ekran görüntüsünden anlaşılsın diye Özet'in altında gösterilir.
function appVersionText(): string {
  if (process.env.EXPO_PUBLIC_WEB_SANDBOX === "true") return "Web test · 0.8.6 ortak ekranları · örnek servis verisi";
  const version = Constants.expoConfig?.version || "";
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return `Uygulama ${version} · APK ile gelen sürüm`;
  return `Uygulama ${version} · güncelleme ${Updates.createdAt.toLocaleDateString("tr-TR")} ${Updates.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Güncelleme gelmediğinde nedenini görmek için: hangi kanalı dinlediği ve elle denetleme düğmesi.
function updateChannelText(): string {
  if (!Updates.isEnabled) return "Uzaktan güncelleme kapalı";
  return `Kanal ${Updates.channel || "-"} · çalışma sürümü ${Updates.runtimeVersion || "-"}`;
}

function UpdateCheckButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const result = await checkAndOfferUpdate();
      if (result === "disabled") Alert.alert("Güncelleme", "Bu kurulumda uzaktan güncelleme kapalı. Yeni sürüm APK ile kurulur.");
      if (result === "none") Alert.alert("Güncel", "Telefondaki sürüm en yenisi; indirilecek güncelleme yok.");
    } catch (error: any) {
      Alert.alert("Güncelleme denetlenemedi", `İnternet veya VPN bağlantısını kontrol edip yeniden deneyin.\n\nAyrıntı: ${String(error?.message || error).slice(0, 160)}`);
    } finally {
      setBusy(false);
    }
  };
  return <Pressable style={styles.updateCheck} onPress={run} disabled={busy}>
    {busy ? <ActivityIndicator size="small" color="#315B4C" /> : <Ionicons name="cloud-download-outline" size={15} color="#315B4C" />}
    <Text style={styles.updateCheckText}>{busy ? "Denetleniyor…" : "Güncellemeyi denetle"}</Text>
  </Pressable>;
}

type OfflineReason = "" | "network" | "key" | "server";

// Bağlantı koptuğunda nedenini söyler. Anahtarı silme seçeneği yalnız sunucu anahtarı reddettiğinde çıkar;
// geçici internet kesintisinde kayıtlı anahtar silinmez.
function OfflineNotice({ reason, busy, onRetry, onResetKey }: { reason: OfflineReason; busy: boolean; onRetry: () => void; onResetKey: () => void }) {
  const text = reason === "key"
    ? "Sunucu kayıtlı bağlantı anahtarını kabul etmedi."
    : reason === "server"
      ? "Sunucu şu an yanıt vermiyor. Biraz sonra yeniden deneyin."
      : "Sunucuya ulaşılamadı. İnternet veya VPN bağlantısını kontrol edip yeniden deneyin.";
  return <View style={styles.offlineCard}>
    <Text style={styles.offlineText}>{text}</Text>
    <View style={styles.offlineActions}>
      <Pressable style={styles.offlineButton} onPress={onRetry} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color="#8A521F" /> : <Ionicons name="refresh" size={16} color="#8A521F" />}
        <Text style={styles.tokenResetText}>{busy ? "Bağlanıyor…" : "Yeniden bağlan"}</Text>
      </Pressable>
      {reason === "key" && <Pressable style={styles.offlineButton} onPress={onResetKey}>
        <Ionicons name="key-outline" size={16} color="#8A521F" />
        <Text style={styles.tokenResetText}>Anahtarı yeniden gir</Text>
      </Pressable>}
    </View>
  </View>;
}

function App() {
  const insets = useSafeAreaInsets();
  useAppUpdates();
  const [mode, setMode] = useState<AppMode>("simple");
  const [tab, setTab] = useState<Tab>("Başla");
  const [sellRoute, setSellRoute] = useState<SellRoute>("choose");
  const {rows:productionRows,loaded:productionLoaded}=useProductionRecords();
  const [productionResume,setProductionResume]=useState<any>();
  const startupProduction=useRef(false);
  const resumeProduction=(row:ProductionRecord)=>{setProductionResume({id:row.id,revision:Date.now()});if(mode==="simple"){setSellRoute("digital");setTab("Sat");}else setTab("Etsy");};
  useEffect(()=>{if(!productionLoaded||startupProduction.current)return;startupProduction.current=true;void activeProduction(productionRows).then(row=>{if(row)resumeProduction(row);}).catch(()=>undefined);},[productionLoaded]);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    AsyncStorage.getItem(APP_MODE_KEY).then((value) => { if (value === "expert") { setMode("expert"); setTab("Etsy"); } }).catch(() => undefined);
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab]);
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  const changeMode = (next: AppMode) => {
    setMode(next);
    setTab(next === "simple" ? "Başla" : "Etsy");
    AsyncStorage.setItem(APP_MODE_KEY, next).catch(() => undefined);
  };
  // Yarım kalan fotoğraflı ilan, ana sayfadan "Ürün sat"a dönünce silinmez.
  const openSell = (route: SellRoute) => { setSellRoute((current) => route === "choose" && current === "photo" ? current : route); setTab("Sat"); };
  const [data, setData] = useState<any>(demo);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const productionRefresh=useRef(false);
  useEffect(()=>{
    if(!online||!productionLoaded)return;
    const refresh=async()=>{
      if(productionRefresh.current)return;productionRefresh.current=true;
      try{
        const current=await activeProduction(await restoreProductions());if(!current)return;
        const result=await apiJson("/api/digital/products",{headers:apiHeaders()});
        const product=(result.products || []).find((product:any)=>product.id===current.productId || product.handoff?.id && product.handoff.id===current.workspace.plan.handoff?.id);
        if(!product)return;
        await syncTrackedProduct(product);
        if(product.etsy?.listingId){try{await syncTrackedProduct(product,await apiJson(`/api/digital/products/${product.id}/etsy-status`,{headers:apiHeaders()}));}catch{await syncTrackedProduct(product,undefined,true);}}
      }catch{/* Offline or missing server evidence never completes a project. */}
      finally{productionRefresh.current=false;}
    };
    void refresh();const listener=AppState.addEventListener("change",state=>{if(state==="active")void refresh();});return()=>listener.remove();
  },[online,productionLoaded]);
  const [offlineReason, setOfflineReason] = useState<OfflineReason>("");
  const [reconnecting, setReconnecting] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [channels, setChannels] = useState<any>({
    shopier: { configured: false, connected: false },
    etsy: { configured: false, storageConfigured: false, connected: false }
  });
  const [opportunityCenter, setOpportunityCenter] = useState<any>(demoOpportunityCenter);
  const [shopierCenter, setShopierCenter] = useState<any>(demoShopierCenter);
  const [tokenReady, setTokenReady] = useState(false);
  const [apiToken, setApiToken] = useState("");

  const refresh = async (attempt = 0) => {
    if (!API_URL) {
      setData(demo);
      setOnline(false);
      setLoading(false);
      return;
    }
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
    }
    let reason: OfflineReason = "network";
    try {
      const [response, channelResponse, opportunityResponse, shopierResponse] = await Promise.all([
        fetch(`${API_URL}/api/dashboard`, { headers: apiHeaders() }),
        fetch(`${API_URL}/api/channels/status`, { headers: apiHeaders() }).catch(() => undefined),
        fetch(`${API_URL}/api/opportunities`, { headers: apiHeaders() }).catch(() => undefined),
        fetch(`${API_URL}/api/shopier/center`, { headers: apiHeaders() }).catch(() => undefined)
      ]);
      if (!response.ok) {
        reason = response.status === 401 ? "key" : "server";
        throw new Error();
      }
      // Bundan sonraki hata (bozuk yanıt) internet değil sunucu kaynaklıdır.
      reason = "server";
      const remote = await response.json();
      const local = JSON.parse(await AsyncStorage.getItem("gxl.localProducts") || "[]");
      const merged = mergeLocalProducts(remote.products || [], Array.isArray(local) ? local : []);
      setData({ ...remote, products: merged, metrics: { ...remote.metrics, catalogProducts: merged.length } });
      if (channelResponse?.ok) setChannels(await channelResponse.json());
      else setChannels({
        shopier: { configured: true, connected: false, message: "Shopier durumu alınamadı." },
        etsy: { configured: true, storageConfigured: true, connected: false, message: "Etsy durumu alınamadı." }
      });
      if (opportunityResponse?.ok) setOpportunityCenter(await opportunityResponse.json());
      else setOpportunityCenter(demoOpportunityCenter);
      if (shopierResponse?.ok) setShopierCenter(await shopierResponse.json());
      else setShopierCenter(demoShopierCenter);
      setOnline(true);
      setOfflineReason("");
    } catch {
      const local = await AsyncStorage.getItem("gxl.localProducts").then(value => JSON.parse(value || "[]")).catch(() => []);
      const products = mergeLocalProducts(demo.products, Array.isArray(local) ? local : []);
      setData({ ...demo, products, metrics: { ...demo.metrics, catalogProducts: products.length } });
      setOpportunityCenter(demoOpportunityCenter);
      setShopierCenter(demoShopierCenter);
      setOnline(false);
      setOfflineReason(reason);
      setChannels({ shopier: { connected: false, message: "Bağlantı doğrulanamadı." }, etsy: { connected: false, message: "Bağlantı doğrulanamadı." } });
      // Uygulama öne gelirken veya VPN bağlanırken ilk istek düşebilir; bir kez kendiliğinden yeniden denenir.
      if (reason === "network" && attempt === 0) retryTimer.current = setTimeout(() => { refresh(1); }, 4000);
    } finally {
      setLoading(false);
    }
  };

  const reconnect = async () => {
    setReconnecting(true);
    try {
      await refresh(1);
    } finally {
      setReconnecting(false);
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
        products: mergeLocalProducts(current.products, localProducts),
        metrics: { ...current.metrics, catalogProducts: mergeLocalProducts(current.products, localProducts).length }
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
        Alert.alert(action === "approve" ? "Gönderildi" : "Reddedildi", action === "approve" ? "Mesajın teslim durumu doğrulandı." : "Taslak iptal edildi.");
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

  const confirmResetToken = () => process.env.EXPO_PUBLIC_WEB_SANDBOX === "true" ? Alert.alert("Web test anahtarı", "Bu ortam gerçek anahtar kabul etmez. Test araçlarından normal senaryoya dönüp bağlantıyı yeniden dene.") : Alert.alert("Bağlantı anahtarı", "Kayıtlı anahtar silinip giriş ekranı açılacak. Cloudflare'a kaydettiğiniz APP_ACCESS_TOKEN değerini yeniden girmeniz gerekir. Devam edilsin mi?", [
    { text: "Vazgeç", style: "cancel" },
    { text: "Sil ve yeniden gir", style: "destructive", onPress: () => { resetApiToken(); } }
  ]);

  if (!tokenReady) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 80 }} color="#C88B47" /></SafeAreaView>;
  }
  if (!apiToken) return <AccessSetup onSave={saveApiToken} />;

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#12261F" />
      <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
        <View>
          <Text style={styles.eyebrow}>SATIŞ MERKEZİ</Text>
          <Text style={styles.title}>GXL Akıllı Satıcı</Text>
        </View>
        <View style={[styles.agentBadge, !online && styles.localBadge]}><View style={[styles.dot, !online && styles.localDot]} /><Text style={styles.agentText}>{online ? process.env.EXPO_PUBLIC_WEB_SANDBOX === "true" ? "Web test" : "Bağlı" : "Bağlantı yok"}</Text></View>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color="#C88B47" /> : (
        <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
          {!online && <OfflineNotice reason={offlineReason} busy={reconnecting} onRetry={reconnect} onResetKey={confirmResetToken} />}
          {tab!=="Etsy"&&tab!=="Sat"&&<ProductionWorkList compact onResume={resumeProduction}/>}
          {tab === "Başla" && <HomeScreen online={online} channels={channels} setTab={setTab} openSell={openSell} />}
          {mode === "simple" && <View style={tab === "Sat" ? undefined : styles.hidden}><SellScreen online={online} active={tab==="Sat"} productionResume={productionResume} channels={channels} route={sellRoute} setRoute={setSellRoute} onStepChange={scrollTop} setTab={setTab} /></View>}
          {tab === "Siparişler" && <EtsyOrdersPanel online={online} />}
          {tab === "Müşteri" && <><SalesPlanCard online={online} shopierProducts={shopierCenter?.products} etsyActiveListings={channels?.etsy?.activeListings} /><MessageHelperCard online={online} /></>}
          {tab === "Yardım" && <HelpScreen online={online} channels={channels} onExpert={() => changeMode("expert")} onSell={() => openSell("choose")} />}
          {tab === "Özet" && <Overview data={data} setTab={setTab} online={online} channels={channels} onSimple={() => changeMode("simple")} />}
          {tab === "Shopier" && <ShopierScreen center={shopierCenter} online={online} onRefresh={refresh} etsyReady={Boolean(channels?.etsy?.shopReady || channels?.etsy?.shopId)} />}
          <View style={tab === "Etsy" ? undefined : styles.hidden}><EtsyScreen online={online} active={tab === "Etsy"} channels={channels} productionResume={productionResume} /></View>
          {tab === "Ajan" && <AgentScreen center={opportunityCenter} online={online} onRefresh={refresh} shopierProducts={shopierCenter?.products} etsyActiveListings={channels?.etsy?.activeListings} />}
          {tab === "Onaylar" && <Approvals items={pending} decide={decide} />}
          {tab === "Müşteriler" && <Leads items={data.leads} />}
          {tab === "Ürünler" && <Products items={data.products} addProduct={addProduct} />}
        </ScrollView>
      )}
      <View style={[styles.nav, { height: 78 + insets.bottom, paddingBottom: 10 + insets.bottom }]}>
        {(mode === "simple" ? simpleTabs : navigationTabs).map((item) => (
          <Pressable key={item} style={styles.navItem} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)}>
            <Ionicons name={navigationIcons[item]} size={21} color={tab === item ? "#C88B47" : "#748079"} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2} style={[styles.navText, tab === item && styles.navTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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

// Shopier açıklaması HTML olarak gelir; kartta düz metin gösterilir. Editörden yapıştırmayla kalan yorum parçaları ("<!--TgQPHd...-->") atılır.
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/&lt;!--[\s\S]*?--(?:&gt;|>)/g, "");
}

function plainText(html?: string): string {
  return stripHtmlComments(String(html || ""))
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// Etsy mağaza kaydı açılışın ilk adımında oluşur; ödeme kurulumu ve aktif ilan sayısı mağazanın gerçekten açılıp açılmadığını gösterir.
// Etsy mağaza kaydı mağaza adı seçilince oluşur. Etsy API'si "Open your shop" adımının bittiğini vermez; bu yüzden
// "açık" yalnız yayında ilan varken söylenir, ilan yokken "kapalı" denmez. Etsy'nin ödeme bilgisi de kullanılmaz.
function etsyShopOpen(etsy: any): boolean {
  return typeof etsy?.activeListings === "number" && etsy.activeListings > 0;
}

function etsyShopLine(etsy: any): string {
  const name = etsy?.shopName ? ` (${etsy.shopName})` : "";
  return etsyShopOpen(etsy) ? `Mağaza açık${name} · ${etsy.activeListings} ilan yayında` : `Mağaza kayıtlı${name} · yayında ilan yok`;
}

function Overview({ data, setTab, online, channels, onSimple }: any) {
  const shopier = channels?.shopier;
  const shopierStatus = shopier?.connected
    ? `Bağlı · ${shopier.productCount} ürün · 30 günde ${shopier.recentOrderCount} sipariş`
    : shopier?.message || (shopier?.configured ? "Bağlantı doğrulanamadı" : "Bağlantı bekliyor");
  const etsy = channels?.etsy;
  const etsyAuthorized = Boolean(etsy?.authorized || etsy?.connected);
  const etsyShopReady = Boolean(etsy?.shopReady || etsy?.shopId);
  const etsyStatus = etsyShopReady
    ? etsyShopLine(etsy)
    : etsyAuthorized
      ? "Hesap yetkili · mağaza kurulumunu tamamla"
      : etsy?.message || (!etsy?.configured
        ? "API anahtarları bekleniyor"
        : !etsy?.storageConfigured
          ? "Güvenli token deposu bekleniyor"
          : "Bağlanmak için dokun");
  return <>
    <ListingMascot title="İlan açmak mı istiyorsun?" instruction="Ürününü seç, rakiplerini incele ve ilanını hazırla. Stüdyo, dosya yükleme ve Etsy taslağı aşamalarında sana ne yapacağını göstereceğim." actionLabel="Goxi ile yeni ilana başla" onAction={() => setTab("Etsy")} />
    <LiveDeviceCheck />
    <EtsyOrdersPanel online={online} compact />
    <Text style={styles.sectionTitle}>Bugünün görünümü</Text>
    <View style={styles.metrics}>
      <Metric value={data.metrics.activeLeads} label="Aktif müşteri" icon="people" />
      <Metric value={data.metrics.pendingApprovals} label="Onay bekliyor" icon="time" accent />
      <Metric value={shopier?.connected ? shopier.productCount : data.metrics.catalogProducts} label={shopier?.connected ? "Shopier ürünü" : "Ürün"} icon="cube" />
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
      <Channel name="Etsy" status={etsyStatus} icon="storefront-outline" connected={etsyAuthorized} onPress={() => etsyShopReady ? Alert.alert("Etsy mağazası", "Etsy'de 'Open your shop' adımını bitirmediyseniz kuruluma devam edin; bitirdiyseniz mağaza yöneticisine gidin.", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Kuruluma devam et", onPress: () => openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") },
        { text: "Mağaza yöneticisi", onPress: () => openUrl("https://www.etsy.com/your/shops/me/dashboard", "Etsy mağaza yöneticisi") }
      ]) : etsyAuthorized ? openUrl("https://www.etsy.com/sell", "Etsy mağaza kurulumu") : connectEtsy()} />
      <Channel name="E-posta" status={SALES_EMAIL} icon="mail-outline" onPress={() => openUrl(`mailto:${SALES_EMAIL}?subject=${encodeURIComponent("GXL Market Studio")}`, "E-posta")} />
    </View>
    <Text style={styles.versionText}>{appVersionText()}</Text>
    <Text style={styles.versionMeta}>{updateChannelText()}</Text>
    <UpdateCheckButton />
    {!!onSimple && <Pressable style={styles.updateCheck} onPress={onSimple}><Ionicons name="happy-outline" size={15} color="#315B4C" /><Text style={styles.updateCheckText}>Basit moda geç</Text></Pressable>}
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
      {!!plainText(product.description) && <Text style={styles.evidence} numberOfLines={3}>{plainText(product.description)}</Text>}
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
    setDescription(stripHtmlComments(product?.description || ""));
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
      priceData: { currency: product?.currency || "TRY", price: price.trim(), ...(shippingPrice.trim() ? { shippingPrice: shippingPrice.trim() } : {}) },
      stockQuantity: Number(stock),
      shippingPayer,
      dispatchDuration: Number(dispatchDuration)
    };
    if (!product?.id) payload.type = "physical";
    if (imageUrl.trim() && (!product?.id || imageUrl.trim() !== product?.media?.[0]?.url)) {
      payload.media = [{ type: "image", url: imageUrl.trim(), placement: 1 }, ...(product?.media || []).slice(1).map((item: any, index: number) => ({ type: item.type || "image", url: item.url, placement: index + 2 }))].slice(0, 5);
    }
    onSave(payload);
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><StatusBar barStyle="dark-content" /><ScrollView contentContainerStyle={styles.formContent}>
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

// Müşteri bul ve reklam planı: seçilen ürün için kanal kanal ne yapılacağı, reklamın ne zaman açılacağı, bütçe,
// durdurma kuralı ve kopyalanacak hazır metinler. Uygulama kimseye kendiliğinden mesaj atmaz.
const SALES_KINDS = [
  { id: "tesbih", label: "Tesbih" }, { id: "vintage", label: "Vintage" }, { id: "knitwear", label: "Örgü giyim" },
  { id: "pdf", label: "Dijital ürün" }, { id: "pattern", label: "Hobi deseni" }, { id: "other", label: "Diğer" }
];
const SALES_CHANNELS = [{ id: "shopier", label: "Shopier'de (Türkiye)" }, { id: "etsy", label: "Etsy'de (ABD)" }];
const WHATSAPP_NUMBER_KEY = "gxl.whatsappNumber";

function guessSalesKind(title: string): string {
  if (/tesbih|tespih|kehribar|oltu|misbaha/i.test(title)) return "tesbih";
  if (/vintage|antika|eski|nostalji/i.test(title)) return "vintage";
  // Desen, el örgüsü üründen önce bakılır ("Crochet Pattern PDF" bir desendir, örgü ürün değil).
  if (/desen|pattern/i.test(title) && /crochet|knit|sew|embroider|cross stitch|macrame|punch needle|amigurumi|quilt|tığ|örgü|dikiş|nakış|kanaviçe|makrome/i.test(title)) return "pattern";
  if (/kazak|hırka|yelek|bere|atkı|örgü|tığ/i.test(title)) return "knitwear";
  // Uygulamanın 19 dijital ürün türü: basılan, telefona yüklenen ve programda açılan şablonlar.
  if (/planlayıcı|planner|pdf|boyama|coloring|printable|digital|calendar|takvim|sticker|çıkartma|card|kart|trivia|game|oyun|resume|özgeçmiş|spreadsheet|tablo|wallpaper|duvar kâğıdı|icon|ikon|template|şablon|journal|günlük|label|etiket|puzzle|bulmaca|word search|wall art|recipe|tarif|worksheet/i.test(title)) return "pdf";
  if (/desen|pattern/i.test(title)) return "pattern";
  return "other";
}

function SalesPlanCard({ online, shopierProducts, etsyActiveListings }: any) {
  const products = (shopierProducts || []).filter((item: any) => item?.title).slice(0, 8);
  const [productId, setProductId] = useState<string>();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("tesbih");
  const [channel, setChannel] = useState(products.length ? "shopier" : "etsy");
  const [price, setPrice] = useState("");
  const [profit, setProfit] = useState("");
  const [link, setLink] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [preparedPlan, setPlan] = useState<any>();
  const inputKey = generationKey({ productId, name, kind, channel, price, profit, link, whatsapp, etsyActiveListings });
  const plan = preparedPlan?.inputKey === inputKey ? preparedPlan : undefined;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string>();
  useEffect(() => { AsyncStorage.getItem(WHATSAPP_NUMBER_KEY).then((value) => value && setWhatsapp(value)).catch(() => undefined); }, []);
  const choose = (item: any) => {
    setProductId(String(item.id));
    setName(String(item.title));
    setLink(item.url ? String(item.url) : "");
    if (item.price) setPrice(String(item.price));
    setKind(guessSalesKind(String(item.title)));
    setChannel("shopier");
    setPlan(undefined);
  };
  const decisionStyle = (decision: string) => decision === "skip" ? styles.scoreLow : decision === "later" ? styles.scoreMid : styles.scoreHigh;
  const prepare = async () => {
    if (name.trim().length < 3) return Alert.alert("Ürün adı", "Ürünü seçin ya da adını yazın (ör. 925 gümüş tesbih).");
    setBusy(true);
    try {
      if (channel === "shopier") localWhatsappLink(whatsapp);
      if (whatsapp.trim()) await AsyncStorage.setItem(WHATSAPP_NUMBER_KEY, whatsapp.trim()).catch(() => undefined);
      else await AsyncStorage.removeItem(WHATSAPP_NUMBER_KEY).catch(() => undefined);
      const result = await apiJson("/api/marketing/plan", {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({
          productName: name.trim(), kind, channel, priceTry: parseAmount(price), profitTry: parseAmount(profit), link: link.trim() || undefined,
          activeEtsyListings: channel === "etsy" && typeof etsyActiveListings === "number" ? etsyActiveListings : undefined
        })
      });
      setPlan({ ...addLocalWhatsapp(result.plan, whatsapp, channel), quality: result.quality, inputKey });
      setOpen(result.plan?.channels?.find((item: any) => item.decision === "now" || item.decision === "always")?.id);
    } catch (error) { Alert.alert("Plan hazırlanamadı", errorText(error)); }
    finally { setBusy(false); }
  };
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Ionicons name="megaphone-outline" size={22} color="#315B4C" /><Text style={[styles.cardTitle, { flex: 1 }]}>Müşteri bul ve reklam planı</Text></View>
    <Text style={styles.evidence}>Ürününüzü seçin; uygulama her kanal için ne yapılacağını, reklamın açılıp açılmayacağını, bütçeyi, ne zaman durdurulacağını ve kopyalanacak hazır metinleri verir. Uygulama kimseye kendiliğinden mesaj atmaz; ürününüzü doğru kişilerin görmesini sağlar.</Text>
    {!!products.length && <>
      <Text style={styles.fieldLabel}>Shopier ürünlerinizden seçin</Text>
      <View style={styles.chips}>{products.map((item: any) => <Pressable key={item.id} style={[styles.chip, productId === String(item.id) && styles.chipActive]} onPress={() => choose(item)}><Text style={[styles.chipText, productId === String(item.id) && styles.chipTextActive]} numberOfLines={1}>{item.title}</Text></Pressable>)}</View>
    </>}
    <Field label="Ürün adı" value={name} onChangeText={(value: string) => { setName(value); setProductId(undefined); }} placeholder="ör. 925 gümüş tesbih, tığ işi hırka" />
    <Text style={styles.fieldLabel}>Ürün türü</Text>
    <ChipGroup options={SALES_KINDS} value={kind} onChange={setKind} />
    <Text style={styles.fieldLabel}>Nerede satılıyor?</Text>
    <ChipGroup options={SALES_CHANNELS} value={channel} onChange={setChannel} />
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}><Field label="Satış fiyatı (TL)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="1500" /></View>
      <View style={{ flex: 1 }}><Field label="Size kalan kâr (TL, isteğe bağlı)" value={profit} onChangeText={setProfit} keyboardType="decimal-pad" placeholder="600" /></View>
    </View>
    <Field label={channel === "etsy" ? "Etsy ilan bağlantısı (isteğe bağlı)" : "Shopier ürün bağlantısı"} value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://..." />
    {channel === "shopier" && <Field label="WhatsApp numaranız (yalnız bu telefonda saklanır)" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="05xx xxx xx xx" />}
    <Pressable style={[styles.primary, { marginTop: 12, marginBottom: 0 }, (busy || !online) && styles.primaryDisabled]} disabled={busy || !online} onPress={prepare}>
      {busy ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}
      <Text style={styles.primaryText}>{busy ? "Hazırlanıyor…" : "Planı hazırla"}</Text>
    </Pressable>
    {!!plan && <>
      <Text style={[styles.trendVerdict, { marginTop: 14 }]}>{plan.headlineTr}</Text>
      <QualityNote quality={plan.quality} />
      {plan.channels.map((item: any) => <View key={item.id} style={styles.card}>
        <Pressable style={styles.shopierProductTop} onPress={() => setOpen(open === item.id ? undefined : item.id)}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{item.titleTr}</Text>
          <View style={[styles.kindPill, decisionStyle(item.decision)]}><Text style={styles.kindText}>{item.decisionTr}</Text></View>
        </Pressable>
        <Text style={styles.evidence}>{item.whyTr}</Text>
        {!!item.budgetTr && <Text style={styles.analysisLine}>Bütçe: {item.budgetTr}</Text>}
        {open === item.id && <>
          {item.stepsTr.map((step: string, index: number) => <Text style={styles.analysisLine} key={step}>{index + 1}. {step}</Text>)}
          {!!item.stopRuleTr && <Text style={styles.warningText}>Ne zaman durdurulur: {item.stopRuleTr}</Text>}
          {item.copy.map((block: any) => <View key={block.labelTr} style={styles.adviceBox}>
            <Text style={styles.rowTitle}>{block.labelTr}</Text>
            <Text selectable style={styles.evidence}>{block.text}</Text>
            <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={() => Share.share({ message: block.text })}><Text style={styles.secondaryButtonText}>Kopyala / paylaş</Text></Pressable>
          </View>)}
          {!!item.openUrl && <Pressable style={[styles.primary, { marginTop: 12, marginBottom: 0 }]} onPress={() => openUrl(item.openUrl, item.titleTr)}><Text style={styles.primaryText}>{item.openLabelTr || "Aç"}</Text><Ionicons name="open-outline" size={18} color="white" /></Pressable>}
        </>}
        <Pressable onPress={() => setOpen(open === item.id ? undefined : item.id)}><Text style={styles.linkNote}>{open === item.id ? "Kapat" : "Adımlar ve hazır metinler için dokunun"}</Text></Pressable>
      </View>)}
      {!plan.aiCopy && <Text style={styles.small}>Hazır metinler şablondan yazıldı (yapay zekâ bağlı değil ya da yanıt vermedi). Paylaşmadan önce ürüne göre düzenleyin.</Text>}
      <View style={styles.guardrail}><Ionicons name="shield-checkmark" size={21} color="#315B4C" /><View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Yapılmaması gerekenler</Text>
        {plan.rulesTr.map((rule: string) => <Text style={styles.guardrailText} key={rule}>• {rule}</Text>)}
      </View></View>
    </>}
  </View>;
}

function AgentScreen({ center, online, onRefresh, shopierProducts, etsyActiveListings }: any) {
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<Array<{ role: "owner" | "agent"; text: string; warnings?: string[]; actions?: string[]; archived?: boolean }>>([
    { role: "agent", text: center?.summary || "Fırsat kaynaklarını kontrol etmeye hazırım." }
  ]);

  const [chatReady, setChatReady] = useState(false);
  useEffect(() => { AsyncStorage.getItem("gxl.agentChat").then(value => { if (value) { const stored = JSON.parse(value); if (Array.isArray(stored) && stored.length) setChat(stored.filter(item => item && (item.role === "owner" || item.role === "agent") && typeof item.text === "string").slice(-30).map(item => ({ role: item.role, text: item.text, archived: true, warnings: Array.isArray(item.warnings) ? item.warnings.filter((value: unknown) => typeof value === "string") : [], actions: Array.isArray(item.actions) ? item.actions.filter((value: unknown) => typeof value === "string") : [] }))); } }).catch(() => undefined).finally(() => setChatReady(true)); }, []);
  useEffect(() => { if (chatReady) AsyncStorage.setItem("gxl.agentChat", JSON.stringify(chat.slice(-30))).catch(() => undefined); }, [chat, chatReady]);
  const ask = async (preset?: string) => {
    const message = (preset || question).trim();
    if (!message || sending || !chatReady) return;
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
        body: JSON.stringify({ message, history: chat.slice(-10).map(item => ({ role: item.role, text: item.text.slice(0, 1500) })) })
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

    <SalesPlanCard online={online} shopierProducts={shopierProducts} etsyActiveListings={etsyActiveListings} />
    <MessageHelperCard online={online} />

    <Text style={styles.sectionTitle}>Ajanla konuş</Text>
    <Text style={styles.evidence}>Güncel özet: {center?.summary || "Canlı veri alınamadı."}</Text>
    <View style={styles.chatCard}>
      {chat.map((message, index) => <View key={`${message.role}-${index}`} style={[styles.chatBubble, message.role === "owner" ? styles.ownerBubble : styles.agentBubble]}>
        {message.archived && <Text style={styles.small}>Önceki oturumdan kayıt · güncel durum için yukarıdaki özete bakın</Text>}
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
  if (!items.length) return <Empty icon="people-outline" title="Henüz gerçek müşteri yok" text="Gerçek gelen talepler ve açık izinle kaydedilen müşteri adayları burada gösterilir. Pazar sinyalleri müşteri sayılmaz." />;
  return <><Text style={styles.sectionTitle}>Müşteri adayları</Text>{items.map((lead: any) => <View style={styles.card} key={lead.id}><View style={styles.leadTop}><View style={styles.avatar}><Text style={styles.avatarText}>{lead.displayName[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{lead.displayName}</Text><Text style={styles.small}>{lead.channel} · {lead.stage}</Text></View><View style={styles.score}><Text style={styles.scoreText}>{lead.score}</Text></View></View><Text style={styles.muted}>İlgi: {lead.interests.join(", ")}</Text></View>)}</>;
}

// Etsy'deki yayında ve taslak ilanlar: Ürünler sekmesinde Shopier kataloğunun üstünde gösterilir.
function EtsyListingsSection() {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/listings/scorecard", { headers: apiHeaders() })); setError(""); }
    catch (err) { setError(errorCode(err) === "NOT_CONNECTED" ? "Etsy mağazası bağlanınca ilanlarınız burada görünür." : errorText(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const items = [...(data?.items || [])].sort((a: any, b: any) => (a.state === b.state ? 0 : a.state === "active" ? -1 : 1));
  return <>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Etsy ilanlarım</Text><Pressable style={[styles.secondaryButton, loading && styles.primaryDisabled]} disabled={loading} onPress={load}><Text style={styles.secondaryButtonText}>{loading ? "…" : "Yenile"}</Text></Pressable></View>
    {!!error && <Text style={styles.shopierBlocker}>{error}</Text>}
    {!!data && !items.length && <Text style={styles.small}>Etsy'de henüz ilan yok. Etsy → Stüdyo'dan ilk ilanı hazırlayın.</Text>}
    {items.map((item: any) => <View style={styles.product} key={item.listingId}>
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="storefront-outline" size={26} color="#C88B47" /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.small}>{item.state === "active" ? "Yayında" : "Taslak"}{typeof item.views === "number" ? ` · ${item.views} görüntülenme` : ""}{typeof item.favorites === "number" ? ` · ${item.favorites} favori` : ""}{typeof item.sales === "number" ? ` · son 100 satış kaleminde ${item.sales} adet` : ""}</Text>
        {!!item.price && <Text style={styles.price}>{item.price}</Text>}
        <Text style={styles.stockNote}>İlan içerik puanı: {item.score}/100 · {item.state === "active" ? "Yayın durumu yukarıda gösterilir" : item.gradeTr}</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
          {!!item.url && item.state === "active" && <Pressable onPress={() => openUrl(item.url, "Etsy ilanı")}><Text style={styles.linkNote}>Etsy'de aç →</Text></Pressable>}
          <Pressable onPress={() => openUrl(item.editUrl, "Etsy ilan düzenleme")}><Text style={styles.linkNote}>Düzenle →</Text></Pressable>
        </View>
      </View>
    </View>)}
  </>;
}

function Products({ items, addProduct }: any) {
  const [showForm, setShowForm] = useState(false);
  return <><EtsyListingsSection /><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>GXL ürün kataloğu</Text><Pressable style={styles.addButton} onPress={() => setShowForm(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>Ürün ekle</Text></Pressable></View>{items.map((product: any) => { const url = product.shopierUrl || product.letgoUrl || product.etsyUrl; const imageSource = product.localImageUri ? { uri: product.localImageUri } : productImages[product.id]; return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.product, pressed && styles.rowPressed]} onPress={() => url && openUrl(url, product.name)} key={product.id}>{imageSource ? <Image source={imageSource} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="diamond-outline" size={28} color="#C88B47" /></View>}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.small}>{product.category}{product.weightGrams ? ` · ${product.weightGrams} g` : ""}</Text><Text style={styles.price}>{product.priceTry ? `${Number(product.priceTry).toLocaleString("tr-TR")} TL` : "Güncel fiyat satış sayfasında"}</Text><Text style={styles.stockNote}>{product.stockVerified ? `${product.stock} stok` : "Stok sipariş öncesi doğrulanır"}</Text>{url && <Text style={styles.linkNote}>Satış sayfasını aç →</Text>}</View></Pressable>; })}<ProductForm visible={showForm} onClose={() => setShowForm(false)} onSave={async (product: any) => { await addProduct(product); setShowForm(false); Alert.alert("Ürün eklendi", "Ürün GXL yerel kataloğuna kaydedildi."); }} /></>;
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
    <SafeAreaView style={styles.formSafe}><StatusBar barStyle="dark-content" /><ScrollView contentContainerStyle={styles.formContent}>
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
      <Text style={styles.formHint}>Bu ürünü Etsy'de satmak için: Etsy → Stüdyo → "Elimdeki ürün (fotoğraf)". Başlık, etiket, açıklama ve fiyat orada hazırlanır; Shopier gerekmez.</Text>
    </ScrollView></SafeAreaView>
  </Modal>;
}

// Alanların çoğu İngilizce ilan metni taşır; telefonun Türkçe yazım denetimi her kelimenin altını kırmızı çizip
// hata varmış gibi gösterir, otomatik düzeltme de İngilizce kelimeyi Türkçeye çevirebilir. İkisi de kapalı.
function Field({ label, ...props }: any) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} placeholderTextColor="#9AA39F" spellCheck={false} autoCorrect={false} {...props} /></View>; }

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

// Hata, sunucunun Türkçe mesajını ve türünü (code, ör. NOT_CONNECTED) taşır; ekranlar türe göre davranır.
async function apiJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = await response.json().catch(() => ({})) as any;
  // Sunucu Türkçe hata vermeden düştüyse (ör. büyük dosyada işlem süresi sınırı) kod numarasıyla anlaşılır mesaj verilir.
  const fallback = response.status >= 500 ? `Sunucu bu isteği zamanında bitiremedi (kod ${response.status}). Birkaç dakika sonra tekrar deneyin.` : `İstek tamamlanamadı (kod ${response.status}).`;
  if (!response.ok) throw Object.assign(new Error(body.error || fallback), { code: body.code ? String(body.code) : undefined, status: response.status });
  return body;
}

// Diagnostics reuse the existing app credential, with a bounded same-origin GET only.
async function liveCheckRequest(path: string, signal?: AbortSignal) {
  if (!isLiveReadPath(path)) throw new Error("Bu işlem canlı okuma kapsamında değil.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 18000);
  try { return await apiJson(path, { method: "GET", headers: apiHeaders(), signal: controller.signal }); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
function LiveDeviceCheck() {
  return <LiveCheckPanel request={liveCheckRequest} environment={{ appVersion: Constants.expoConfig?.version || "unknown", runtimeVersion: String(Updates.runtimeVersion || "unknown"), channel: Updates.channel || "unknown", embedded: Updates.isEmbeddedLaunch, updateId: Updates.updateId || undefined, updateCreatedAt: Updates.createdAt?.toISOString(), testMode: process.env.EXPO_PUBLIC_WEB_SANDBOX === "true" ? "synthetic-web" : undefined }} />;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? (error as any).code : undefined;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Bağlantıyı kontrol edin.";
}

type EtsySection = "Trend" | "Stüdyo" | "Dijital" | "Pinterest" | "Kılavuz";

function EtsyScreen({ online, channels, active = true, initialSection = "Trend", productionResume }: any) {
  const [section, setSection] = useState<EtsySection>(initialSection);
  const [studioSeed, setStudioSeed] = useState<any>();
  useEffect(()=>{if(productionResume)setSection("Stüdyo");},[productionResume]);
  const [uploadPrefill, setUploadPrefill] = useState<any>();
  const etsy = channels?.etsy || {};
  const shopReady = Boolean(etsy.shopReady || etsy.shopId);
  const authorized = Boolean(etsy.authorized || etsy.connected);
  return <>
    <View style={styles.agentHero}>
      <View style={styles.agentHeroTop}><View style={styles.shopierLogo}><Ionicons name="color-palette" size={22} color="white" /></View><View style={{ flex: 1 }}><Text style={styles.agentHeroTitle}>Etsy Merkezi</Text><Text style={styles.agentHeroText}>{shopReady ? `${etsyShopLine(etsy)} · Trend, Stüdyo ve Dijital ürünler` : "Trend, otomatik keşif ve stüdyo mağaza açılmadan da çalışır. Taslak ve yayınlama mağaza açılınca etkinleşir."}</Text></View></View>
    </View>
    {!shopReady && online && section !== "Kılavuz" && <Pressable style={styles.guardrail} onPress={() => setSection("Kılavuz")}><Ionicons name="storefront-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{authorized ? "Etsy hesabı yetkili, mağaza açılışı bekleniyor. Adımlar için dokunun: Kılavuz → Mağaza açılışı." : "Etsy mağazası henüz bağlı değil. Adımlar için dokunun: Kılavuz → Mağaza açılışı."}</Text><Ionicons name="chevron-forward" size={18} color="#315B4C" /></Pressable>}
    <View style={styles.segment}>
      {(["Trend", "Stüdyo", "Dijital", "Pinterest", "Kılavuz"] as const).map((item) => <Pressable key={item} style={[styles.segmentItem, section === item && styles.segmentActive]} onPress={() => setSection(item)}><Text style={[styles.segmentText, section === item && styles.segmentTextActive]}>{item}</Text></Pressable>)}
    </View>
    {!online && section !== "Kılavuz" && <Text style={styles.shopierBlocker}>Sunucu bağlantısı yok. Trend tarama, prompt üretimi, mağaza durumu ve dosya yükleme için sunucuya bağlanmak gerekir; üstteki "Yeniden bağlan" düğmesine basın.</Text>}
    <View testID="etsy-section-trend" style={section === "Trend" ? undefined : styles.hidden}>
      <ListingMascot title="Yeni ilanını birlikte hazırlayalım" instruction="Ne satacağını biliyorsan Stüdyo’ya geç. Kararsızsan aşağıdaki Trend kartlarını incele; puan bir satış garantisi değildir." tasks={["Dijital ürün, kendi desenin veya elindeki fiziksel ürün için doğru yolu seç.", "Bir trend seçersen karttaki hazırlama düğmesi aynı konuyu Stüdyo’ya taşır."]} actionLabel="Ürünümü seçmek istiyorum" onAction={() => setSection("Stüdyo")} />
      <TrendPanel online={online} active={active && section === "Trend"} onUse={(seed: any) => { setStudioSeed(seed); setSection("Stüdyo"); }} /></View>
    <View style={section === "Stüdyo" ? undefined : styles.hidden}><StudioPanel online={online} active={active && section === "Stüdyo"} etsyReady={shopReady} seed={studioSeed} productionResume={productionResume} onOpenProduct={()=>setSection("Dijital")} onUpload={(prefill: any) => { setUploadPrefill(prefill); setSection("Dijital"); }} /></View>
    <View testID="etsy-section-digital" style={section === "Dijital" ? undefined : styles.hidden}><DigitalPanel online={online} active={active && section === "Dijital"} shopReady={shopReady} prefill={uploadPrefill} onPrefillUsed={() => setUploadPrefill(undefined)} onPrepare={() => setSection("Stüdyo")} /></View>
    {section === "Pinterest" && <PinterestPanel online={online} />}
    {section === "Kılavuz" && <><LiveDeviceCheck /><ShopReadinessCard online={online} onSell={() => setSection("Stüdyo")} /><ShopSettingsCard online={online} shopReady={shopReady} /><ShopListingsScorecard online={online} /><EtsyGuide shopReady={shopReady} authorized={authorized} /></>}
  </>;
}

function scoreStyle(score?: number) {
  if (score === undefined) return styles.scoreNone;
  return score >= 65 ? styles.scoreHigh : score >= 45 ? styles.scoreMid : styles.scoreLow;
}

// Otomatik keşif her aramayı 1-2 günde bir yeniler; puanın ne kadar eski olduğu kartta yazılır.
function scanAgeText(scannedAt?: string): string {
  const time = scannedAt ? Date.parse(scannedAt) : NaN;
  if (!Number.isFinite(time)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
  return hours < 1 ? " · az önce taranmış" : hours < 24 ? ` · ${hours} saat önce taranmış` : ` · ${Math.floor(hours / 24)} gün önce taranmış`;
}

// Başlık Türkçe ad, altında Etsy'de aranan İngilizce ifade. Puanlanmamış kart dokununca taranır.
function TrendCard({ title, keyword: plannedKeyword, result, expanded, onToggle, onUse, onScan, scanning, group, canScan = true, trendsRange = "today 12-m" }: any) {
  const activeGroup = result?.group || group || "patterns";
  const isPattern = activeGroup === "patterns";
  const isPrintable = activeGroup === "printables";
  const keyword = result?.keyword || plannedKeyword || "";
  return <View style={styles.card}>
    <Pressable style={styles.shopierProductTop} onPress={() => (!result && onScan ? onScan() : onToggle())}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!keyword && keyword.toLowerCase() !== String(title).toLowerCase() && <Text style={styles.small}>Etsy'de aranan: {keyword}{scanAgeText(result?.scannedAt)}</Text>}
        {!result && !scanning && !!onScan && <Text style={styles.small}>Henüz puanlanmadı · dokunun, Etsy'de taransın</Text>}
      </View>
      {scanning ? <ActivityIndicator color="#A86B2E" /> : <View style={[styles.scoreBadge, scoreStyle(result?.score)]}><Text style={styles.scoreBadgeText}>{result ? result.score : "?"}</Text></View>}
    </Pressable>
    {result && trendFreshness(result) !== "fresh" && <Text style={styles.warningText}>Eski tarama · yeniden tara</Text>}
    {!!result && <>
      {expanded && <MarketStrategyCard strategy={result.strategy} />}
      <Text style={styles.trendVerdict}>{result.verdict}</Text>
      {!!result.signals?.ipRisks?.length && <Text style={styles.shopierBlocker}>Marka/telif riski: {result.signals.ipRisks.join(", ")}. Bu kelimeleri başlıkta, etikette ve tasarımda kullanma.</Text>}
      <Text style={styles.small}>Rakip: {Number(result.metrics.activeListings).toLocaleString("tr-TR")} ilan · Talep: {demandText(result.metrics)} · Yeni ilan payı: %{Math.round(result.metrics.newcomerShare * 100)}{result.metrics.medianPriceUsd ? ` · Ortanca ${result.metrics.medianPriceUsd} USD` : ""}</Text>
      {expanded && <>
        {result.reasons.map((reason: string) => <Text style={styles.evidence} key={reason}>• {reason}</Text>)}
        {!!result.advice?.length && <View style={styles.adviceBox}>
          <Text style={styles.cardTitle}>Öne geçmek için ne yapmalı?</Text>
          {result.advice.map((item: any) => <View key={item.titleTr} style={styles.adviceRow}>
            <View style={[styles.adviceDot, item.priority === "high" ? styles.adviceHigh : item.priority === "medium" ? styles.adviceMedium : styles.adviceLow]} />
            <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.titleTr}</Text><Text style={styles.evidence}>{item.detailTr}</Text></View>
          </View>)}
        </View>}
        {(isPattern || isPrintable) && !!result.signals?.formats && <Text style={styles.small}>Rakiplerin başlık/etiketinde geçen format: {result.signals.formats.filter((item: any) => item.share > 0).map((item: any) => `${item.labelTr} %${Math.round(item.share * 100)}`).join(" · ") || "belirgin format bilgisi yok"} · Paket/set: %{Math.round((result.signals.bundleShare || 0) * 100)}{result.signals.pageCountMedian ? ` · Ortanca ${result.signals.pageCountMedian} sayfa` : ""}</Text>}
        <Text style={styles.warningTitle}>Üst ilanlarda en çok geçen etiketler</Text>
        <Text style={styles.small}>Rakiplerde görülen İngilizce etiketlerdir. Yalnız ürününüze uyan, korunan isim içermeyen ifadeleri seçin; doğrudan kopyalamayın.</Text>
        <View style={styles.chips}>{result.topTags.slice(0, 14).map((tag: any) => <View style={styles.chip} key={tag.tag}><Text style={styles.chipText}>{tag.tag} · {tag.count}</Text></View>)}</View>
        {!!result.risingTags?.length && <>
          <Text style={styles.warningTitle}>Yeni ilanlarda öne çıkan etiketler</Text>
          <View style={styles.chips}>{result.risingTags.slice(0, 10).map((tag: any) => <View style={[styles.chip, styles.risingChip]} key={tag.tag}><Text style={styles.chipText}>↑ {tag.tag}</Text></View>)}</View>
        </>}
        {!!result.discovered?.length && <Text style={styles.evidence}>Keşif listesine eklenen yeni aramalar: {result.discovered.join(", ")}</Text>}
        {!!onScan && <Pressable style={[styles.secondaryButton, (scanning || !canScan) && styles.primaryDisabled]} disabled={scanning || !canScan} onPress={onScan}><Text style={styles.secondaryButtonText}>Bu aramayı yeniden tara</Text></Pressable>}
        <Text style={styles.warningTitle}>Öne çıkan rakip ilanlar</Text>
        {result.examples.map((example: any, index: number) => <Pressable key={`${example.url}-${index}`} onPress={() => example.url && openUrl(example.url, "Etsy ilanı")}><Text style={styles.linkNote} numberOfLines={2}>{example.favorites} favori · {example.ageDays} gün · {example.priceUsd ? `${example.priceUsd.toFixed(2)} USD · ` : ""}{example.title}</Text></Pressable>)}
        <Pressable style={[styles.secondaryButton, { marginTop: 12 }]} onPress={() => openUrl(`https://trends.google.com/trends/explore?geo=US&date=${encodeURIComponent(trendsRange)}&q=${encodeURIComponent(keyword)}`, "Google Trends")}><Text style={styles.secondaryButtonText}>{trendsRange === "today 5-y" ? "ABD eyaletleri ve sezon zirveleri (Google Trends)" : "ABD'de hangi eyaletlerde aranıyor? (Google Trends)"}</Text></Pressable>
        {isPattern || isPrintable
          ? <Pressable style={[styles.primary, { marginTop: 14, marginBottom: 0 }]} onPress={onUse}><Text style={styles.primaryText}>{isPrintable ? "Bu nişte dijital ürün hazırla" : "Bu nişte kendi desenimi listele"}</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable>
          : <>{!!onUse && <Pressable style={[styles.primary, { marginTop: 14, marginBottom: 0 }]} onPress={onUse}><Text style={styles.primaryText}>Kendi fiziksel ürünümle devam et</Text><Ionicons name="camera-outline" size={18} color="white" /></Pressable>}<Pressable style={[styles.secondaryButton, { marginTop: 12 }]} onPress={() => Share.share({ message: result.topTags.map((tag: any) => tag.tag).slice(0, 13).join(", "), title: `${keyword} etiketleri` })}><Text style={styles.secondaryButtonText}>Üst etiketleri kopyala</Text></Pressable></>}
      </>}
    </>}
  </View>;
}

function SeasonalPanel({ online, active = true, onUse }: any) {
  const [board, setBoard] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [showWeak, setShowWeak] = useState<Record<string, boolean>>({});
  const load = async () => {
    setLoading(true);
    try { setBoard(await apiJson("/api/etsy/seasonal", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Sezonlar alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online && active) load(); }, [online, active]);
  const scanSeason = async (event: any) => {
    for (const item of event.keywords) {
      setScanning(`${event.id}:${item.keyword}`);
      try {
        const result = await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: item.keyword, group: item.group, force: true }) });
        setBoard((current: any) => ({ ...current, events: current.events.map((row: any) => row.id === event.id ? { ...row, keywords: row.keywords.map((entry: any) => entry.keyword === item.keyword ? { ...entry, result } : entry) } : row) }));
      } catch (error) {
        Alert.alert("Tarama durdu", errorText(error));
        break;
      }
    }
    setScanning(undefined);
  };
  const scanOne = async (event: any, item: any) => {
    const key = `${event.id}:${item.keyword}`;
    if (!online || scanning) return;
    setScanning(key);
    try {
      const result = await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: item.keyword, group: item.group, force: true }) });
      setBoard((current: any) => ({ ...current, events: current.events.map((row: any) => row.id === event.id ? { ...row, keywords: row.keywords.map((entry: any) => entry.keyword === item.keyword ? { ...entry, result } : entry) } : row) }));
      setExpanded(key);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  const dateText = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return <>
    <View style={styles.guardrail}><Ionicons name="calendar-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{board?.note || "ABD'de yaklaşan alışveriş dönemleri ve bu dönemlerde aranan ürünler."}</Text></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {(board?.events || []).map((event: any) => {
      const scanned = event.keywords.filter((item: any) => item.result);
      const best = [...scanned].filter((row: any) => canRankTrend(row.result) && hasBuyerDemand(row.result)).sort((a: any, b: any) => compareTrendEvidence(a.result, b.result))[0];
      const weakRows = scanned.filter((row: any) => !hasBuyerDemand(row.result));
      const shown = showWeak[event.id] ? event.keywords : event.keywords.filter((row: any) => !weakRows.includes(row) || expanded === `${event.id}:${row.keyword}`);
      return <View style={styles.card} key={event.id}>
        <View style={styles.shopierProductTop}>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{event.nameTr}</Text><Text style={styles.small}>{dateText(event.date)}{event.approximate ? " (yaklaşık)" : ""} · {event.daysUntil} gün kaldı</Text></View>
        </View>
        <View style={[styles.kindPill, { alignSelf: "flex-start", maxWidth: "100%", marginTop: 8 }, event.urgency === "Hemen listele" ? styles.scoreLow : styles.scoreMid]}><Text style={styles.kindText}>{event.urgency}</Text></View>
        <Text style={styles.evidence}>{event.tipTr}</Text>
        <Text style={styles.analysisLine}>Fiziksel ürün hazırlık hedefi: {dateText(event.listByProducts)} · Desen hazırlık hedefi: {dateText(event.listByPatterns)}</Text>
        {event.listByDigital && <Text style={styles.analysisLine}>Hazır dijital ürün hazırlık hedefi: {dateText(event.listByDigital)} · Bu tarihler yaklaşık; kargo ve satış garantisi değildir.</Text>}
        {best && <Text style={styles.trendVerdict}>En güçlü arama: {best.keywordTr || best.keyword} ({best.result.score} puan)</Text>}
        {!best && scanned.length > 0 && scanned.length === weakRows.length && <Text style={styles.warningText}>Bu dönemin taranan aramalarında alıcı ilgisi zayıf; bu dönem için ürün hazırlamayı erteleyin.</Text>}
        {shown.map((item: any) => <TrendCard key={item.keyword} title={item.keywordTr || item.keyword} keyword={item.keyword} onScan={() => scanOne(event, item)} group={item.group} result={item.result} trendsRange="today 5-y" canScan={online && !scanning} scanning={scanning === `${event.id}:${item.keyword}`} expanded={expanded === `${event.id}:${item.keyword}`} onToggle={() => setExpanded(expanded === `${event.id}:${item.keyword}` ? undefined : `${event.id}:${item.keyword}`)} onUse={() => onUse({ keyword: item.keyword, group: item.group }, item.result)} />)}
        {!!weakRows.length && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginBottom: 6 }]} onPress={() => setShowWeak(current => ({ ...current, [event.id]: !current[event.id] }))}><Text style={styles.secondaryButtonText}>{showWeak[event.id] ? "Talebi zayıf aramaları gizle" : `Talebi zayıf ${weakRows.length} aramayı göster`}</Text></Pressable>}
        <Pressable style={[styles.addButton, { alignSelf: "flex-start" }, (!online || Boolean(scanning)) && styles.primaryDisabled]} disabled={!online || Boolean(scanning)} onPress={() => scanSeason(event)}><Ionicons name="pulse" size={16} color="white" /><Text style={styles.addButtonText}>{scanned.length ? "Yeniden tara" : "Bu sezonu tara"}</Text></Pressable>
      </View>;
    })}
  </>;
}

function TrendPanel({ online, active = true, onUse }: any) {
  const [board, setBoard] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [custom, setCustom] = useState<any[]>([]);
  const [group, setGroup] = useState("printables");
  const groups = [...(board?.groups || [{ id: "printables", labelTr: "Dijital ürünler" }, { id: "patterns", labelTr: "Hobi desenleri" }, { id: "tesbih", labelTr: "Tesbih ve gümüş" }, { id: "vintage", labelTr: "Vintage" }]), { id: "discovered", labelTr: "Keşfedilenler" }, { id: "season", labelTr: "Sezon fırsatları" }];
  const visibleNiches = [...(board?.niches || [])].filter((row: any) => (row.group || "patterns") === group).sort((a: any, b: any) => compareTrendEvidence(a.result, b.result));
  // En yüksek puanlar seçili grubun içinden gelir (Dijital ürünler seçiliyken örgü deseni gösterilmez).
  // Yalnız alıcı ilgisi olan (talebi zayıf olmayan) ürünler öne çıkar; talebi zayıf olanlar listenin altında, kapalı durur.
  const topOverall = visibleNiches.filter((row: any) => canRankTrend(row.result) && hasBuyerDemand(row.result)).sort((a: any, b: any) => compareTrendEvidence(a.result, b.result)).slice(0, 5);
  const strongTop = topOverall.filter((row: any) => row.result.score >= 45);
  const [showWeak, setShowWeak] = useState(false);
  const weakNiches = visibleNiches.filter((row: any) => trendFreshness(row.result) !== "unscanned" && !hasBuyerDemand(row.result));
  const listedNiches = showWeak ? visibleNiches : visibleNiches.filter((row: any) => !weakNiches.includes(row) || expanded === row.id);
  const sortNiches = (rows: any[]) => [...rows].sort((a, b) => compareTrendEvidence(a.result, b.result));
  const load = async () => {
    setLoading(true);
    try { setBoard(await apiJson("/api/etsy/trends", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Trendler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online && active) load(); }, [online, active]);
  const scan = (body: any) => apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify(body) });
  const scanAll = async () => {
    for (const niche of visibleNiches) {
      setScanning(niche.id);
      try {
        const result = await scan({ nicheId: niche.id, force: true });
        setBoard((current: any) => ({ ...current, niches: sortNiches(current.niches.map((row: any) => row.id === niche.id ? { ...row, result } : row)) }));
      } catch (error) {
        Alert.alert("Tarama durdu", errorText(error));
        break;
      }
    }
    setScanning(undefined);
  };
  const scanOne = async (niche: any) => {
    if (!online || !board?.configured || scanning) return;
    setScanning(niche.id);
    try {
      const result = await scan({ nicheId: niche.id, force: true });
      setBoard((current: any) => ({ ...current, niches: sortNiches(current.niches.map((row: any) => row.id === niche.id ? { ...row, result } : row)) }));
      setExpanded(niche.id);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  const scanKeyword = async (target?: { keyword: string; group?: string }) => {
    if (!online || scanning) return;
    const query = target?.keyword || keyword.trim();
    if (query.length < 3) return Alert.alert("Anahtar kelime", "İngilizce bir arama yazın (ör. crochet bag pattern).");
    setScanning(`custom:${query}`);
    try {
      const result = await scan({ keyword: query, group: target?.group, track: true, force: true });
      setCustom((current) => [result, ...current.filter((item) => item.keyword !== result.keyword)].slice(0, 5));
      setExpanded(`custom:${result.keyword}`);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  const inferCraft = (keyword: string) => /cross stitch/i.test(keyword) ? "cross_stitch" : /knit/i.test(keyword) ? "knitting" : /embroider/i.test(keyword) ? "embroidery" : /sewing/i.test(keyword) ? "sewing" : /macrame/i.test(keyword) ? "macrame" : /punch needle/i.test(keyword) ? "punch_needle" : "crochet";
  const use = (row: any, result: any) => {
    const group = result?.group || row.group;
    if (group !== "printables" && group !== "patterns") return onUse({ studio: "physical", keyword: result?.keyword || row.keyword, group });
    return onUse({
    craft: row.craft || result?.craft || inferCraft(String(result?.keyword || row.keyword || "")),
    keyword: result?.keyword || row.keyword,
    productType: String(result?.keyword || row.keyword).replace(CRAFT_WORDS, " ").replace(/\s+/g, " ").trim(),
    trendTags: (result?.topTags || []).map((tag: any) => tag.tag),
    group: result?.group || row.group,
    kind: row.kind || result?.kind
  });
  };
  return <>
    <View style={styles.guardrail}><Ionicons name="information-circle-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>{board?.method || "Etsy resmî aramasındaki üst ilanlar puanlanır. Etsy satış adedini paylaşmadığı için puan tahmindir."}</Text></View>
    {board && !board.configured && <Text style={styles.shopierBlocker}>Etsy API anahtarı (keystring ve shared secret) sunucuya eklenince tarama başlar.</Text>}
    <View style={styles.chatInputRow}>
      <TextInput style={styles.chatInput} value={keyword} onChangeText={setKeyword} onSubmitEditing={() => scanKeyword()} returnKeyType="search" placeholder="Arama tara (Google Trends ifadesi de olur): crochet bag pattern, misbaha" placeholderTextColor="#9AA39F" spellCheck={false} autoCorrect={false} autoCapitalize="none" />
      <Pressable accessibilityRole="button" accessibilityLabel="Aramayı tara" style={styles.sendButton} onPress={() => scanKeyword()} disabled={!online || Boolean(scanning)}><Ionicons name="search" size={19} color="white" /></Pressable>
    </View>
    {custom.map((result) => <TrendCard key={`custom:${result.keyword}`} title={result.keywordTr || `Arama: ${result.keyword}`} result={result} canScan={online && !scanning} scanning={scanning === `custom:${result.keyword}`} onScan={() => scanKeyword({ keyword: result.keyword, group: result.group })} expanded={expanded === `custom:${result.keyword}`} onToggle={() => setExpanded(expanded === `custom:${result.keyword}` ? undefined : `custom:${result.keyword}`)} onUse={() => use({ keyword: result.keyword }, result)} />)}
    <View style={[styles.chips, { marginTop: 14 }]}>{groups.map((item: any) => <Pressable key={item.id} style={[styles.chip, group === item.id && styles.chipActive]} onPress={() => setGroup(item.id)}><Text style={[styles.chipText, group === item.id && styles.chipTextActive]}>{item.labelTr}</Text></Pressable>)}</View>
    <GroupIntro group={group} />
    <View style={group === "season" ? undefined : styles.hidden}><SeasonalPanel online={online} active={active && group === "season"} onUse={use} /></View>
    <View style={group === "discovered" ? undefined : styles.hidden}><DiscoveryPanel online={online} active={active && group === "discovered"} onUse={use} /></View>
    <View style={group !== "season" && group !== "discovered" ? undefined : styles.hidden}>
    {!!topOverall.length && <View style={styles.analysisCard}>
      {strongTop.length
        ? <><Text style={styles.cardTitle}>Alıcı ilgisi olan en iyi fırsatlar</Text><Text style={styles.small}>Yalnız 45 ve üstü puanlı (Denenebilir / Yüksek fırsat) aramalar. Son 6 saatlik Etsy örneklemi içindir; satış adedi değildir.</Text></>
        : <><Text style={styles.cardTitle}>Bu grupta şu an güçlü fırsat yok</Text><Text style={styles.small}>45 ve üstü puanlı arama çıkmadı. Aşağıdakiler alıcı ilgisi olan en yakın adaylardır ama rekabet yoğun ya da zor; Keşfedilenler ve Sezon fırsatları sekmelerine de bakın.</Text></>}
      {(strongTop.length ? strongTop : topOverall.slice(0, 3)).map((row: any) => <Text style={styles.analysisLine} key={row.id}>{row.result.score} · {row.labelTr} ({row.result.verdict})</Text>)}
    </View>}
    {!loading && !scanning && !!weakNiches.length && weakNiches.length === visibleNiches.filter((row: any) => trendFreshness(row.result) !== "unscanned").length && !visibleNiches.some((row: any) => trendFreshness(row.result) === "unscanned") && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Bu gruptaki aramaların hepsinde alıcı ilgisi zayıf</Text>
      <Text style={styles.small}>Etsy'de bu gruptaki {weakNiches.length} aramada şu an az alıcı ilgisi var; burada yeni ürün hazırlamayı erteleyin. Keşfedilenler ve Sezon fırsatları sekmelerine bakın ya da yukarıdan kendi aramanızı tarayın. Yine de görmek isterseniz aşağıdan açabilirsiniz.</Text>
    </View>}
    <InterestRanking rows={visibleNiches.filter((row: any) => !weakNiches.includes(row))} />
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{groups.find((item: any) => item.id === group)?.labelTr || "Nişler"}</Text><Pressable style={[styles.addButton, (!online || !board?.configured || Boolean(scanning)) && styles.primaryDisabled]} disabled={!online || !board?.configured || Boolean(scanning)} onPress={scanAll}><Ionicons name="pulse" size={16} color="white" /><Text style={styles.addButtonText}>{scanning ? "Taranıyor…" : "Tümünü tara"}</Text></Pressable></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {listedNiches.map((row: any) => <TrendCard key={row.id} title={row.labelTr} keyword={row.keyword} onScan={() => scanOne(row)} canScan={online && !scanning} group={row.group} result={row.result} scanning={scanning === row.id} expanded={expanded === row.id} onToggle={() => setExpanded(expanded === row.id ? undefined : row.id)} onUse={() => use(row, row.result)} />)}
    {!!weakNiches.length && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => setShowWeak(!showWeak)}><Text style={styles.secondaryButtonText}>{showWeak ? "Talebi zayıf aramaları gizle" : `Talebi zayıf ${weakNiches.length} aramayı göster`}</Text></Pressable>}
    </View>
  </>;
}

const GROUP_LABELS: Record<string, string> = { patterns: "Hobi deseni", printables: "Dijital ürün", tesbih: "Tesbih", vintage: "Vintage", other: "Diğer" };

// Her grup düğmesinin altında: içinde ne var, kim alır, nasıl teslim edilir. Hiç kullanmamış biri için.
const GROUP_INTROS: Record<string, { title: string; text: string; icon: string }> = {
  printables: { icon: "document-text-outline", title: "Dijital ürünler nedir?", text: "Alıcının satın alıp indirdiği dosyalar. Bir kısmı yazıcıda basılır: planlayıcı, takvim, boyama sayfası, duvar posteri, tarif kartı, tebrik kartı, çıkartma, etiket, bulmaca, parti oyunu. Bir kısmı telefona ve tablete yüklenir: telefon duvar kâğıdı, ikon ve widget paketi, dijital planlayıcı. Bir kısmı alıcının programında açılır: bütçe tablosu (Excel), sunum oyunu (PowerPoint) ve özgeçmiş şablonu (Word). Kargo yok; bir kez hazırlanır, defalarca satılır. Etsy'de çoğu 2–15 USD." },
  patterns: { icon: "color-palette-outline", title: "Hobi desenleri nedir?", text: "Örgü, tığ işi, nakış, kanaviçe, dikiş ve makrome için adım adım yapım tarifi (PDF). Alıcı ürünü kendisi yapar; siz yalnız tarifi satarsınız. Kargo yok. Etsy'de çoğu 2–12 USD. Dikkat: Etsy yapay zekâyla yazılmış deseni yasakladı; yalnız kendi yazıp denediğiniz deseni satabilirsiniz." },
  tesbih: { icon: "ellipse-outline", title: "Tesbih ve gümüş nedir?", text: "Elinizdeki gerçek tesbihler: 925 gümüş, kehribar, oltu, kuka ve İslami hediyeler. Fiziksel ürün: fotoğrafını çekip satarsınız, ABD'ye kargolarsınız. Etsy'de çoğu 15–250 USD." },
  vintage: { icon: "time-outline", title: "Vintage nedir?", text: "En az 20 yıllık eski eşyalar: gümüş takı, broş, halı, kilim, bakır. Etsy kuralı: 20 yıldan yeni ürün 'vintage' diye satılamaz, 100 yıldan yeni ürüne 'antika' denmez. Fiziksel ürün, kargo gerekir." },
  discovered: { icon: "compass-outline", title: "Keşfedilenler nedir?", text: "Sunucunun kendi bulduğu yeni aramalar. Her 30 dakikada Etsy’de bir arama taranır; örneklemdeki etiketlerden yeni adaylar çıkarılır. Son 120 günde açılan ilanlardaki etiketler ayrıca işaretlenir; gerçek arama hacmi ölçülmez. Her kartta ne olduğu Türkçe, nereden bulunduğu altında yazar." },
  season: { icon: "calendar-outline", title: "Sezon fırsatları nedir?", text: "ABD'de yaklaşan özel günler (Sevgililer Günü, Anneler Günü, Noel, Ramazan…) ve o günlerde aranan ürünler. Kartta son listeleme tarihi yazar; bu tarihler yaklaşık hazırlık hedefidir; teslimat garantisi değildir." }
};

function GroupIntro({ group }: { group: string }) {
  const intro = GROUP_INTROS[group];
  if (!intro) return null;
  return <View style={styles.guardrail}>
    <Ionicons name={intro.icon as any} size={20} color="#315B4C" />
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{intro.title}</Text>
      <Text style={styles.guardrailText}>{intro.text}</Text>
      <Text style={[styles.small, { marginTop: 6 }]}>Puan (0–100): 65 ve üstü güçlü fırsat · 45–64 denenebilir · 45 altı zor (alıcı az ya da rakip çok). Puan, Etsy'deki üst ilanlardan hesaplanan tahmindir.</Text>
    </View>
  </View>;
}

function discoveryReason(item: any): string {
  if (item.from === "elle arandı") return "Sizin yaptığınız aramadan eklendi; otomatik keşif bunu izlemeye devam eder.";
  const source = item.fromTr && item.fromTr.toLowerCase() !== String(item.from).toLowerCase() ? `"${item.fromTr}" (${item.from})` : `"${item.from}"`;
  return item.rising ? `Nasıl bulundu: ${source} aramasında son 120 günde açılan ilanların etiketlerinde görüldü. Favori/ilan yaşı göstergesiyle seçildi; gerçek zamanlı artış ölçülmedi.` : `Nasıl bulundu: ${source} aramasının etiketlerinde görüldü. Henüz bağımsız bir talep veya yükseliş doğrulaması değildir.`;
}

function timeAgo(value?: string) {
  if (!value) return "henüz çalışmadı";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} saat önce` : `${Math.round(hours / 24)} gün önce`;
}

function DiscoveryPanel({ online, active = true, onUse }: any) {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState<Record<string, any>>({});
  const [scanning, setScanning] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [showWeak, setShowWeak] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/discoveries", { headers: apiHeaders() })); }
    catch (error) { Alert.alert("Keşifler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online && active) load(); }, [online, active]);
  const all = data?.items || [];
  useEffect(() => { if (data && filter !== "all" && !all.some((item: any) => item.group === filter)) setFilter("all"); }, [data, filter]);
  const currentResults = Object.fromEntries(Object.entries(results).filter(([keyword, result]) => {
    const summary = all.find((row: any) => row.keyword === keyword)?.summary;
    return !summary?.scannedAt || Date.parse(result.scannedAt) >= Date.parse(summary.scannedAt);
  }));
  const sorted = [...all].filter((item: any) => filter === "all" || item.group === filter).sort((a: any, b: any) => compareTrendEvidence(currentResults[a.keyword] || a.summary, currentResults[b.keyword] || b.summary));
  // Alıcı ilgisi zayıf çıkan keşifler öneri olarak gösterilmez; istenirse açılır.
  const weak = sorted.filter((item: any) => { const evidence = currentResults[item.keyword] || item.summary; return Boolean(evidence) && !hasBuyerDemand(evidence); });
  const items = showWeak ? sorted : sorted.filter((item: any) => !weak.includes(item) || expanded === item.keyword);
  const filters = [{ id: "all", label: "Tümü" }, ...["printables", "patterns", "tesbih", "vintage", "other"].filter((id) => all.some((item: any) => item.group === id)).map((id) => ({ id, label: GROUP_LABELS[id] }))];
  const autopilot = data?.autopilot;
  const toggle = (key: string) => setExpanded(expanded === key ? undefined : key);
  const open = async (item: any, refresh = false) => {
    if (currentResults[item.keyword] && !refresh) return toggle(item.keyword);
    setScanning(item.keyword);
    try {
      const result = await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: item.keyword, group: item.group, force: true }) });
      setResults((current) => ({ ...current, [item.keyword]: result }));
      setExpanded(item.keyword);
    } catch (error) { Alert.alert("Tarama yapılamadı", errorText(error)); }
    finally { setScanning(undefined); }
  };
  return <>
    <View style={styles.analysisCard}>
      <View style={styles.shopierProductTop}><Ionicons name="sync-circle-outline" size={22} color="#315B4C" /><Text style={[styles.cardTitle, { flex: 1 }]}>Otomatik keşif</Text><Pressable style={styles.secondaryButton} disabled={loading || !online} onPress={load}><Text style={styles.secondaryButtonText}>Yenile</Text></Pressable></View>
      <Text style={styles.analysisLine}>{!autopilot ? "Durum alınıyor…" : autopilot.enabled ? `Son çalışma: ${timeAgo(autopilot.lastRunAt)}${autopilot.lastKeyword ? ` · ${autopilot.lastKeyword}` : ""}` : autopilot.disabledReason || "Otomatik keşif için sunucu deposu bağlı değil."}</Text>
      {!!autopilot?.runs && <Text style={styles.analysisLine}>{autopilot.runs} otomatik deneme · {autopilot.tracked} arama izleniyor · {all.length} keşfedilen arama</Text>}
      {!!autopilot?.lastError && <Text style={styles.warningText}>Son hata: {autopilot.lastError}</Text>}
      <Text style={styles.evidence}>Sunucu her 30 dakikada bir sıradaki aramayı Etsy'de tarar. Arama örnekleminin etiketlerinden aday ifadeler çıkarır; yeni ilanlarda görülen etiketleri ayrıca işaretler. Etiketin keşfi, bağımsız talep veya gerçek zamanlı yükseliş kanıtı değildir. Liste sabit kelimelerle sınırlı kalmaz.</Text>
    </View>
    {filters.length > 2 && <ChipGroup options={filters} value={filter} onChange={setFilter} />}
    {loading && <ActivityIndicator color="#C88B47" />}
    {!loading && !items.length && !!weak.length && <Text style={styles.formHint}>Bu gruptaki keşiflerin hepsinde alıcı ilgisi zayıf çıktı; yenileri otomatik taramayla gelir.</Text>}
    {!loading && !items.length && !weak.length && <Empty icon="compass-outline" title="Henüz keşif yok" text="İlk keşifler otomatik taramalarla birkaç saat içinde gelir. Hızlandırmak için diğer gruplarda 'Tümünü tara' düğmesine basın." />}
    {items.map((item: any) => currentResults[item.keyword]
      ? <TrendCard key={item.keyword} title={item.keywordTr || item.keyword} group={item.group} result={currentResults[item.keyword]} canScan={online && !scanning} scanning={scanning === item.keyword} onScan={() => open(item, true)} expanded={expanded === item.keyword} onToggle={() => toggle(item.keyword)} onUse={() => onUse({ keyword: item.keyword, group: item.group }, currentResults[item.keyword])} />
      : <Pressable key={item.keyword} style={styles.card} disabled={!online || Boolean(scanning)} onPress={() => open(item)}>
        <View style={styles.shopierProductTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.keywordTr || item.keyword}</Text>
            {item.keywordTr && item.keywordTr.toLowerCase() !== item.keyword.toLowerCase() && <Text style={styles.small}>Etsy'de aranan: {item.keyword}</Text>}
            <Text style={styles.small}>{GROUP_LABELS[item.group] || "Diğer"}{item.rising ? " · yeni ilanlarda öne çıkan etiket" : ""}{item.discoveredAt ? ` · ${timeAgo(item.discoveredAt)} bulundu` : ""}</Text>
            <Text style={styles.evidence}>{discoveryReason(item)}</Text>
          </View>
          {scanning === item.keyword ? <ActivityIndicator color="#A86B2E" /> : <View style={[styles.scoreBadge, scoreStyle(item.summary?.score)]}><Text style={styles.scoreBadgeText}>{item.summary ? item.summary.score : "—"}</Text></View>}
        </View>
        {item.summary
          ? <><Text style={styles.trendVerdict}>{item.summary.verdict}</Text><Text style={styles.small}>Rakip: {Number(item.summary.activeListings).toLocaleString("tr-TR")} ilan · Talep: {demandText(item.summary)}{item.summary.medianPriceUsd ? ` · Ortanca ${item.summary.medianPriceUsd} USD` : ""} · {timeAgo(item.summary.scannedAt)}</Text></>
          : <Text style={styles.small}>Henüz puanlanmadı · dokunun, Etsy'de taransın.</Text>}
      </Pressable>)}
    {!!weak.length && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => setShowWeak(!showWeak)}><Text style={styles.secondaryButtonText}>{showWeak ? "Talebi zayıf keşifleri gizle" : `Talebi zayıf ${weak.length} keşfi göster`}</Text></Pressable>}
  </>;
}

// Talep: ortanca ilan ve öne çıkan çeyrek birlikte; eski önbellek kayıtlarında yalnızca ortanca vardır.
function demandText(metrics: any) {
  const leaders = metrics?.leaderFavoritesPerMonth;
  return typeof leaders === "number" ? `ortanca ${metrics.favoritesPerMonth}, öne çıkanlar ${leaders} favori/ay` : `${metrics?.favoritesPerMonth ?? 0} favori/ay`;
}

// Alıcı ilgisi (talep puanı: ortanca ilan + öne çıkan çeyreğin aylık favori hızı) çubukla, fırsat puanı yanında gösterilir.
function InterestRanking({ rows }: any) {
  const scanned = rows.filter((row: any) => canRankTrend(row.result)).sort((a: any, b: any) => b.result.parts.demand - a.result.parts.demand);
  if (scanned.length < 2) return null;
  const max = Math.max(...scanned.map((row: any) => row.result.parts.demand), 1);
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>İlgi sıralaması</Text>
    <Text style={styles.small}>Son 6 saatte tarananlar gösterilir. Favori/ay, ilan yaşına göre ortalamadır; son ayın gerçek artışı değildir. Çubuk: talep göstergesi. Sayı: öne çıkan ilanların aylık favorisi. Sağdaki rozet: fırsat puanı. Önce ilgisi yüksek ve puanı 45+ olanlara gir; ilgisi yüksek ama puanı düşükse rekabet yoğundur, dar bir alt ifadeyle gir.</Text>
    {scanned.map((row: any) => <View key={row.id} style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{row.labelTr}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, Math.round(100 * row.result.parts.demand / max))}%` }]} /></View>
      <Text style={styles.barValue}>{row.result.metrics.leaderFavoritesPerMonth ?? row.result.metrics.favoritesPerMonth}</Text>
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
    <Text style={styles.small}>ChatGPT gibi bir görsel aracında üret; ürün sayfalarını referans görsel olarak yükle. Görsel üstü yazıyı yapay zekâ görsel bitince kodla ekler; görsel aracına yazı çizdirilmez, çünkü görsel modelleri yazıyı bozar.</Text>
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
  { id: "paper_craft", label: "Kâğıt işi" },
  { id: "calendar", label: "Takvim" },
  { id: "stickers", label: "Çıkartma" },
  { id: "cards", label: "Kart / etiket" },
  { id: "puzzles", label: "Bulmaca" },
  { id: "wallpaper", label: "Duvar kâğıdı" },
  { id: "labels", label: "Düzen etiketi" },
  { id: "app_icons", label: "Telefon ikonu" },
  { id: "spreadsheet", label: "Bütçe tablosu" },
  { id: "slides", label: "Sunum oyunu (PowerPoint)" },
  { id: "resume", label: "Özgeçmiş (Word)" }
];

// Her türün kısa açıklaması: ne olduğu, kime satıldığı, Etsy'deki fiyat aralığı ve dikkat edilecek kural.
const KIND_HELP: Record<string, string> = {
  planner: "Yazdırılabilir planlayıcı (günlük, haftalık, bütçe, yemek). Alıcı: düzen arayan kadınlar, anneler. Etsy'de çoğu 3–12 USD.",
  digital_planner: "Tablette (not uygulamasında) kullanılan, sekmeli dijital planlayıcı. Basılmaz. Etsy'de çoğu 5–20 USD.",
  coloring: "Boyama sayfaları (yetişkin veya çocuk). Çizimler yazısız, kapalı çizgili. Etsy'de çoğu 3–8 USD.",
  wall_art: "Çerçeveye konacak duvar sanatı seti; her oran ayrı dosya. Etsy'de çoğu 3–15 USD.",
  party: "Parti, düğün ve bebek partisi oyunları; cevap anahtarlı. Etsy'de çoğu 3–10 USD.",
  recipe: "Boş, doldurulabilir tarif kartı ve tarif defteri sayfaları. Tarif yazılmaz (Etsy yapay zekâ tarifini yasakladı). 3–8 USD.",
  journal: "Rehberli günlük (okuma, öz bakım, şükran). Etsy'de çoğu 3–10 USD.",
  kids: "Çocuk etkinlik ve çalışma sayfaları; tek sınıf kullanım lisansı. Etsy'de çoğu 3–8 USD.",
  paper_craft: "Junk journal kiti ve dijital kâğıt paketi (desenli kâğıt, süs parçaları). Etsy'de çoğu 3–9 USD.",
  calendar: "Gelecek yılın 12 aylık yazdırılabilir takvimi; her ay kendi mevsim resmiyle. Tarihler kodla üretilip kontrol edilir. Ağustos–ocak arası çok satar; 4–10 USD.",
  stickers: "Basılıp kesilen çıkartma sayfaları ve tablet planlayıcılar için şeffaf PNG çıkartmalar. Etsy'de çoğu 2–7 USD.",
  cards: "Yazdırılıp katlanan 5x7 tebrik kartları (Noel, doğum günü, teşekkür) ve eşleşen hediye etiketleri. Etsy'de çoğu 3–8 USD.",
  puzzles: "Büyük puntolu kelime avı ve sudoku kitabı; bulmacalar kodla üretilir, çözülür ve cevap anahtarı eklenir. Yaşlılar ve yetişkinler alır; 3–8 USD.",
  wallpaper: "Telefon kilit ekranı ve ana ekran duvar kâğıtları; 3 ekran ölçüsü. Basılmaz, kargo yok. Etsy'de çoğu 2–6 USD.",
  labels: "Kiler, mutfak ve ev düzeni etiketleri; hazır yazılı ve boş etiketler, 3 ölçü. Etsy'de çoğu 3–8 USD.",
  app_icons: "Telefona yüklenir: ana ekran ikon paketi (64–96 ikon), widget görselleri ve eşleşen duvar kâğıtları. İkonlar sade semboldür; hiçbir şirket logosu kullanılmaz. Etsy'de çoğu 3–9 USD.",
  spreadsheet: "Telefona ve bilgisayara yüklenir: formüllü bütçe/takip tablosu (.xlsx). Excel, Google Sheets ve telefon tablo uygulamalarında çalışır; makro yok. Etsy'de çok satar; 4–15 USD.",
  slides: "Bilgisayarda açılır, televizyona veya projeksiyona yansıtılır: tıklanabilir bilgi yarışması oyunu (.pptx). PowerPoint, Google Slides ve Keynote'ta çalışır; aileler, öğretmenler ve ofis partileri alır. Etsy'de çoğu 4–12 USD.",
  resume: "Word, Google Docs ve Pages'te düzenlenir: tek ve iki sayfalık özgeçmiş, ön yazı ve referans sayfası (.docx), US Letter ve A4. ABD özgeçmiş kurallarına uyar. Etsy'de çok aranır; çoğu 5–15 USD."
};

// Satıcının kullandığı yapay zekâ: paket o araca göre yazılır. Seçim telefonda hatırlanır.
const ASSISTANT_KEY = "gxl.assistant";
const ASSISTANT_OPTIONS = [{ id: "chatgpt", label: "ChatGPT" }, { id: "claude", label: "Claude" }];
const STUDIO_MODES = [
  { id: "printable", label: "Dijital ürün" },
  { id: "pattern", label: "El işi deseni" },
  { id: "physical", label: "Elimdeki ürün (fotoğraf)" }
];

// Rakipleri geçmek için plan: fiyat, içerik miktarı, format boşlukları, paket ve öne çıkan rakipler.
function MarketStrategyCard({ strategy }: any) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(true); }, [strategy?.id]);
  if (strategy?.version !== 1 || !Array.isArray(strategy.leaders) || !Array.isArray(strategy.actions) || !Array.isArray(strategy.experiments) || !Array.isArray(strategy.limitationsTr)) return null;
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>Kanıta dayalı rakip stratejisi</Text>
    <Text style={styles.small}>{strategy.keyword} · {strategy.sampleSize} örnek · {strategy.linkedSampleSize} bağlantılı ilan · {new Date(strategy.checkedAt).toLocaleString("tr-TR")}</Text>
    <Text style={styles.evidence}>Kapsam: {strategy.scope === "product_matched" ? "aynı tür ve konuda ürünler" : "arama örneklemi"} · Kanıt: {strategy.evidenceLevel === "supported" ? "örneklem destekli" : strategy.evidenceLevel === "limited" ? "sınırlı" : "yetersiz"}</Text>
    <Pressable style={styles.secondaryButton} onPress={() => setExpanded(!expanded)}><Text style={styles.secondaryButtonText}>{expanded ? "Rakip stratejisini kapat" : "Rakip kanıtlarını ve stratejiyi göster"}</Text></Pressable>
    {expanded && <>
    {strategy.limitationsTr.map((line: string) => <Text key={line} style={styles.warningText}>• {line}</Text>)}
    {strategy.pricing && <Text style={styles.listingTitle}>Fiyat deneme referansları: {strategy.pricing.trialsUsd.join(" / ")} USD · maliyet ve ücretleri ayrıca kontrol edin</Text>}
    {strategy.actions.map((action: any) => <View key={action.id} style={styles.visualRow}><Text style={styles.rowTitle}>{action.titleTr}</Text><Text style={styles.analysisLine}>{action.instructionTr}</Text>{!!action.evidenceIds?.length && <Text style={styles.small}>Dayanak: {action.evidenceIds.slice(0, 5).join(", ")} numaralı örnek ilanlar</Text>}</View>)}
    <Text style={styles.warningTitle}>İncelenen rakipler</Text>
    {strategy.leaders.map((row: any) => <View key={row.id} style={styles.visualRow}>
      <Text style={styles.rowTitle}>{row.title}</Text>
      {row.selectedBySeller && <Text style={styles.evidence}>Senin karşılaştırmaya eklediğin ilan</Text>}
      <Text style={styles.small}>{row.priceUsd ? `${row.priceUsd} USD · ` : ""}{row.favorites ?? "?"} favori · {row.ageDays === null ? "yaş bilinmiyor" : `${row.ageDays} gün`}{row.monthlyFavoriteAverage !== null ? ` · aylık ortalama ${row.monthlyFavoriteAverage} favori` : ""}</Text>
      {!!row.url && <Pressable style={styles.secondaryButton} onPress={() => openUrl(row.url, "Rakip ilanı")}><Text style={styles.secondaryButtonText}>Kaynak ilanı aç</Text></Pressable>}
    </View>)}
    <Text style={styles.warningTitle}>Yayın sonrası ölçüm</Text>
    {strategy.experiments.map((experiment: any) => <View key={experiment.id} style={styles.visualRow}><Text style={styles.rowTitle}>{experiment.changeTr}</Text><Text style={styles.analysisLine}>{experiment.metricTr}</Text><Text style={styles.small}>{experiment.stopRuleTr}</Text></View>)}
    </>}
  </View>;
}

function SearchSelectionCard({ selection, onSelect, disabled }: any) {
  if (!selection?.candidates?.length) return null;
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>Kategori aramaları karşılaştırması</Text>
    <Text style={styles.small}>{selection.comparedCount} güncel örneklem · {selection.totalCandidates} araştırma fikri · {new Date(selection.checkedAt).toLocaleString("tr-TR")}</Text>
    {!!selection.avoidedCount && <Text style={styles.evidence}>{selection.avoidedCount} önceki konu / arama tekrar önerilmedi.</Text>}
    <Text style={styles.warningText}>{selection.noteTr}</Text>
    <Text style={styles.formHint}>Bunlar Etsy aramalarıdır. İlan başlığı, seçtiğin ürünün özellikleriyle sonraki aşamada hazırlanır.</Text>
    {selection.candidates.map((row: any) => <View key={row.keyword} style={styles.visualRow}>
      <Text style={styles.rowTitle}>{row.keyword}{row.keyword === selection.selectedKeyword ? " · seçilen arama" : ""}</Text>
      <Text style={styles.small}>{row.state === "fresh" && Number.isFinite(row.score) ? `${row.score} puan · ${row.sampleSize ?? "?"} örnek ilan` : row.state === "failed" ? row.errorTr : row.state === "stale" ? "Veri eski; güncel sıralamaya katılmadı" : "Henüz yeterli güncel veri yok; kazanan sayılmaz"}</Text>
      {row.keyword !== selection.selectedKeyword && <Pressable style={styles.secondaryButton} disabled={disabled} onPress={() => onSelect(row.keyword)}><Text style={styles.secondaryButtonText}>{row.keyword} aramasını seç</Text></Pressable>}
    </View>)}
  </View>;
}

function ProductRecommendationCard({ recommendation, onNewIdea, disabled }: any) {
  if (!recommendation?.contentBudget) return null;
  const budget=recommendation.contentBudget;
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>Goxi’nin ürün ve içerik önerisi</Text>
    <Text style={styles.rowTitle}>{recommendation.productType}</Text>
    <Text style={styles.analysisLine}>{recommendation.rationaleTr}</Text>
    <Text style={styles.listingTitle}>Önerilen kapsam: {budget.suggested} {budget.limits.unitTr}</Text>
    <Text style={styles.rowTitle}>Bu çalışmanın kapsamı: {budget.effective} {budget.limits.unitTr}</Text>
    <Text style={styles.analysisLine}>{budget.basisTr}</Text>
    <Text style={styles.warningText}>{budget.noteTr}</Text>
    <Text style={styles.rowTitle}>Özgün yaklaşım: {recommendation.directionTr}</Text>
    {recommendation.evidenceTr?.map((line:string)=><Text style={styles.small} key={line}>• {line}</Text>)}
    <Text style={styles.evidence}>{recommendation.historyCount} önceki ürün kaydı karşılaştırıldı.</Text>
    <Text style={styles.warningText}>{recommendation.noveltyTr}</Text>
    {recommendation.requiresNewTopic && <Text style={styles.warningText}>Bu konudaki içerik yaklaşımları kullanılmış. Yeni ürün için başka konu seç; mevcut paketi Son çalışmayı aç ile sürdürebilirsin.</Text>}
    {recommendation.previous?.map((row:any)=><Text style={styles.small} key={row.name}>• {row.name} · {row.state === "prepared" ? "paketi hazırlanmış" : row.state === "saved" ? "dosyaları kaydedilmiş" : "Etsy kaydı var; yayın durumu ayrıca doğrulanmalı"}</Text>)}
    <Pressable style={styles.secondaryButton} disabled={disabled} onPress={onNewIdea}><Text style={styles.secondaryButtonText}>Goxi ile başka ürün öner</Text></Pressable>
  </View>;
}

function CompetitionCard({ competition }: any) {
  if (!competition || (!competition.planTr?.length && !competition.topCompetitors?.length)) return null;
  return <View style={styles.adviceBox}>
    <Text style={styles.cardTitle}>Rakip gözlemleri ve deneme planı</Text>
    {!!competition.launchPriceUsd && <Text style={styles.listingTitle}>Önerilen fiyat: {competition.launchPriceUsd.toFixed(2)} USD · set: {competition.bundlePriceUsd?.toFixed(2)} USD</Text>}
    {(competition.planTr || []).map((line: string) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
    {!!competition.topCompetitors?.length && <>
      <Text style={styles.warningTitle}>İlgi göstergesi yüksek örnekler (satış sıralaması değil)</Text>
      {competition.topCompetitors.map((item: any, index: number) => <Text style={styles.small} key={`${item.title}-${index}`}>{item.favorites} favori · {item.ageDays} gün{item.priceUsd ? ` · ${item.priceUsd.toFixed(2)} USD` : ""} · {item.title}</Text>)}
    </>}
  </View>;
}

function PrintableStudio({ online, seed, seeding, resumeWorkspace, onPrepared, onReseed, onPickKind, onPickQuery, onUpload, onOpenProduct, guided = false }: any) {
  const [flow,setFlow]=useState<"offers"|"production"|"manual">("offers");
  const [kindPicker,setKindPicker]=useState(false);
  const [offers,setOffers]=useState<any[]>([]);
  const [offersNote,setOffersNote]=useState("");
  const [offersError,setOffersError]=useState("");
  const [offersBusy,setOffersBusy]=useState(false);
  const [researchDetails,setResearchDetails]=useState(!guided);
  const offerRequest=useRef(0),autoOfferKey=useRef("");
  const [kind, setKind] = useState("planner");
  const [assistant, setAssistant] = useState("chatgpt");
  const assistantPreferenceChanged = useRef(false);
  useEffect(() => { AsyncStorage.getItem(ASSISTANT_KEY).then((value) => { if (!assistantPreferenceChanged.current && (value === "claude" || value === "chatgpt")) setAssistant(value); }).catch(() => undefined); }, []);
  const chooseAssistant = (next: string) => { generationRequest.current += 1; offerRequest.current+=1; setOffersBusy(false); setWorking(false); assistantPreferenceChanged.current = true; setAssistant(next); setPlan(undefined); if(guided&&flow!=="manual")setFlow("offers"); AsyncStorage.setItem(ASSISTANT_KEY, next).catch(() => undefined); };
  const [productType, setProductType] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [colors, setColors] = useState("");
  const [formats, setFormats] = useState("");
  const [pageCount, setPageCount] = useState("");
  const pageCountEdited = useRef(false);
  const [audience, setAudience] = useState("");
  const [keyword, setKeyword] = useState("");
  const [competitorLinks, setCompetitorLinks] = useState("");
  const [trendTags, setTrendTags] = useState<string[]>([]);
  const [trendFeatures, setTrendFeatures] = useState<string[]>([]);
  const [basis, setBasis] = useState<string[]>([]);
  const [plan, setPlan] = useState<any>();
  const [researchPreview, setResearchPreview] = useState<any>();
  const [working, setWorking] = useState(false);
  const generationRequest = useRef(0);
  useEffect(() => {
    if (!seed) return;
    generationRequest.current += 1; setWorking(false);
    setKind(seed.kind || "planner");
    setProductType(seed.productType || "");
    setReferenceNotes(seed.referenceNotes || "");
    setColors((seed.colors || []).join(", "));
    setFormats((seed.formats || []).join(", "));
    setPageCount(seed.pageCount ? String(seed.pageCount) : "");
    pageCountEdited.current = false;
    setKeyword(seed.keyword || ""); setCompetitorLinks("");
    setTrendTags(seed.trendTags || []);
    setTrendFeatures(seed.trendFeatures || []);
    setBasis(seed.basis || []);
    setAudience(seed.audience || "");
    setPlan(undefined);
    setResearchPreview(undefined);
    if(guided){offerRequest.current+=1;autoOfferKey.current="";setOffersBusy(false);setOffers([]);setOffersError("");setFlow("offers");}
  }, [seed]);
  useEffect(() => {
    if (!resumeWorkspace) return;
    generationRequest.current += 1; setWorking(false);
    const input = resumeWorkspace.input;
    assistantPreferenceChanged.current = true;
    setKind(input.kind); setProductType(input.productType); setReferenceNotes(input.referenceNotes || "");
    setColors(input.colors || ""); setFormats(input.formats || ""); setPageCount(input.pageCount || ""); setAudience(input.audience || "");
    pageCountEdited.current = true;
    setKeyword(input.keyword || ""); setTrendTags(input.trendTags || []); setTrendFeatures(input.trendFeatures || []); setAssistant(input.assistant);
    setCompetitorLinks(input.competitorLinks || ""); setBasis([]); setPlan(resumeWorkspace.plan);
    if(guided){offerRequest.current+=1;setOffersBusy(false);setFlow("production");}
  }, [resumeWorkspace]);
  const workspaceInput = { kind, productType, referenceNotes, colors, formats, pageCount, audience, keyword, ...(competitorLinks ? { competitorLinks } : {}), trendTags, trendFeatures, assistant };
  const inputKey = generationKey(workspaceInput);
  const researchKey = generationKey({ kind, productType, keyword, competitorLinks });
  const liveInputKey = useRef(inputKey); liveInputKey.current=inputKey;
  const liveResearchKey = useRef(researchKey); liveResearchKey.current=researchKey;
  const currentPreview = researchPreview?.inputKey === researchKey ? researchPreview.research : undefined;
  const analyze = async () => {
    if (productType.trim().length < 3) return Alert.alert("Ürün", "Önce araştırılacak ürünü ve hedef Etsy aramasını yazın.");
    const requestId = ++generationRequest.current;
    setPlan(undefined);
    setWorking(true);
    try {
      const result = await apiJson("/api/printables/research", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ kind, productType, keyword, competitorLinks, pageCount: pageCount ? Number(pageCount) : undefined, autoScope: !pageCountEdited.current }) });
      if (requestId === generationRequest.current && liveResearchKey.current === researchKey) {
        setResearchPreview({ inputKey: researchKey, research: result.research });
        if (!pageCountEdited.current && result.research?.recommendation?.contentBudget?.suggested) setPageCount(String(result.research.recommendation.contentBudget.suggested));
      }
    } catch (error) { if (requestId === generationRequest.current) { setResearchPreview(undefined); Alert.alert("Rakip araştırması alınamadı", errorText(error)); } }
    finally { if (requestId === generationRequest.current) setWorking(false); }
  };
  const generate = async () => {
    if (productType.trim().length < 3) return Alert.alert("Ürün", "Ürünü İngilizce yazın (ör. budget planner, adult coloring pages).");
    const requestId = ++generationRequest.current;
    setWorking(true);
    try {
      const result = await apiJson("/api/printables/plan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ kind, productType, referenceNotes, colors, formats, pageCount: pageCount ? Number(pageCount) : undefined, autoScope: !pageCountEdited.current, audience, keyword, competitorLinks, trendTags, trendFeatures, assistant, research: true, seed: String(Date.now()) }) });
      if (requestId !== generationRequest.current || liveInputKey.current !== inputKey) return;
      const effectivePages = result.contentBudget?.effective;
      const savedInput = effectivePages ? { ...workspaceInput,pageCount:String(effectivePages) } : workspaceInput;
      if (effectivePages) setPageCount(String(effectivePages));
      const prepared = { ...result, inputKey:generationKey(savedInput) };
      setPlan(prepared);
      if (result.quality?.ok) {
        const workspace: PrintableWorkspace = { version: 1, savedAt: new Date().toISOString(), input: savedInput, plan: prepared };
        try { await saveProductionWorkspace(workspace); if (requestId === generationRequest.current) onPrepared?.(workspace); }
        catch { Alert.alert("Paket hazır", "Bu çalışma telefonda saklanamadı. Uygulamayı kapatmadan paketi paylaşın ve dosyaları yükleyin."); }
      }
    } catch (error) { if (requestId === generationRequest.current) Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { if (requestId === generationRequest.current) setWorking(false); }
  };
  const currentPlan = plan?.inputKey === inputKey ? plan : undefined;
  const brief = currentPlan?.brief;
  const listing = currentPlan?.listing;
  const seedEvidenceCurrent = seed?.kind === kind && seed?.keyword === keyword && seed?.productType === productType;
  const research = currentPlan?.research || currentPreview;
  const loadOffers=async(includeSeed=false)=>{
    const requestId=++offerRequest.current;
    setOffersBusy(true);setOffersError("");setOffers([]);
    const chosenKind=includeSeed?(seed?.kind || kind):kind;
    try{
      const body={kind:chosenKind,assistant,...(includeSeed&&seed?.keyword?(seed.selection?{includeKeyword:seed.keyword}:{keyword:seed.keyword,productType:seed.productType}):{})};
      const result=await apiJson("/api/printables/suggestions",{method:"POST",headers:apiHeaders(true),body:JSON.stringify(body)});
      if(requestId!==offerRequest.current)return;
      if(!Array.isArray(result.offers)||!result.offers.length)throw new Error("Seçilebilir öneri hazırlanamadı. Konuyu kendiniz yazabilir veya yeniden araştırabilirsiniz.");
      setOffers(result.offers);setOffersNote(result.noteTr || "");
    }catch(error){if(requestId===offerRequest.current)setOffersError(errorText(error));}
    finally{if(requestId===offerRequest.current)setOffersBusy(false);}
  };
  useEffect(()=>{
    if(!guided||flow!=="offers"||resumeWorkspace||seeding||!online||!seed?.kind)return;
    const stamp=JSON.stringify([seed.kind,seed.keyword,seed.selection?.checkedAt,assistant]);
    if(autoOfferKey.current===stamp)return;
    autoOfferKey.current=stamp;void loadOffers(true);
  },[guided,flow,resumeWorkspace,seeding,online,seed,assistant]);
  useEffect(()=>()=>{offerRequest.current+=1;},[]);
  const chooseOffer=async(id:string)=>{
    const requestId=++generationRequest.current;offerRequest.current+=1;
    setOffersBusy(true);setOffersError("");
    try{
      const result=await apiJson("/api/printables/plan",{method:"POST",headers:apiHeaders(true),body:JSON.stringify({suggestionId:id})});
      if(requestId!==generationRequest.current)return;
      const input={...result.selectionInput};if(!input.competitorLinks)delete input.competitorLinks;
      if(!result.quality?.ok||!input.kind||!input.productType)throw new Error("Seçilen önerinin paket bilgileri doğrulanamadı.");
      setKind(input.kind);setProductType(input.productType);setKeyword(input.keyword || "");setReferenceNotes(input.referenceNotes || "");setColors(input.colors || "");setFormats(input.formats || "");setPageCount(input.pageCount || "");setAudience(input.audience || "");setCompetitorLinks(input.competitorLinks || "");setTrendTags(input.trendTags || []);setTrendFeatures(input.trendFeatures || []);pageCountEdited.current=true;setBasis([]);setResearchPreview(undefined);
      const prepared={...result,inputKey:generationKey(input)};setPlan(prepared);setFlow("production");
      const workspace:PrintableWorkspace={version:1,savedAt:new Date().toISOString(),input,plan:prepared};
      try{await saveProductionWorkspace(workspace);onPrepared?.(workspace);}
      catch{Alert.alert("Paket hazır","Çalışma bu oturumda açık, ancak telefona kaydedilemedi. Uygulamayı kapatmadan paketi paylaşın ve dosyaları yükleyin.");}
    }catch(error){if(requestId===generationRequest.current)setOffersError(errorText(error));}
    finally{if(requestId===generationRequest.current)setOffersBusy(false);}
  };
  if(guided&&flow!=="manual"){
    if(flow==="production"&&currentPlan?.quality?.ok)return <View testID="listing-offer-production">
      <Text style={styles.sectionTitle}>Seçili ilan çalışması</Text>
      <Text style={styles.listingTitle}>{listing.title}</Text>
      <Text style={styles.rowTitle}>{currentPlan.contentBudget?.effective || pageCount} {currentPlan.contentBudget?.limits?.unitTr || "içerik"} · {brief.priceUsd?.toFixed(2)} USD · {listing.tags.length} etiket</Text>
      <ProductionJourney workspace={{version:1,savedAt:new Date().toISOString(),input:workspaceInput,plan:currentPlan}} onOpenProduct={()=>onOpenProduct?.()} onUpload={()=>onUpload({name:currentPlan.handoff?.name || brief.name,kind:currentPlan.handoff?.kind || kind,productType:currentPlan.handoff?.productType || productType,listing,pins:brief.pins,priceUsd:brief.priceUsd,research:currentPlan.research,handoffName:brief.name,handoff:currentPlan.handoff,assistant})}/>
      <Pressable style={styles.secondaryButton} onPress={()=>setFlow("manual")}><Text style={styles.secondaryButtonText}>İlan metnini ve ayarları incele</Text></Pressable>
      <Pressable style={styles.secondaryButton} onPress={()=>setFlow("offers")}><Text style={styles.secondaryButtonText}>Başka ürün seç</Text></Pressable>
    </View>;
    return <View>
      <Text style={styles.fieldLabel}>Üretim aracı</Text><ChipGroup options={ASSISTANT_OPTIONS} value={assistant} onChange={chooseAssistant} disabled={offersBusy||Boolean(seeding)}/>
      <ListingOfferPicker offers={offers} busy={offersBusy||Boolean(seeding)} offline={!online} error={offersError} note={offersNote} kindLabel={PRINTABLE_KIND_OPTIONS.find(row=>row.id===kind)?.label || kind} onChoose={chooseOffer} onRefresh={()=>loadOffers(false)} onChangeKind={()=>setKindPicker(true)} onManual={()=>setFlow("manual")} onOpenSource={(url:string)=>openUrl(url,"Rakip ilanı")}/>
      <Modal visible={kindPicker} animationType="slide" onRequestClose={()=>setKindPicker(false)}><SafeAreaView style={styles.formSafe}><ScrollView contentContainerStyle={styles.formContent}><Text style={styles.sectionTitle}>Ne tür ürün hazırlayalım?</Text><ChipGroup options={PRINTABLE_KIND_OPTIONS} value={kind} onChange={(next:string)=>{setKindPicker(false);setKind(next);onPickKind(next);}}/><Pressable style={styles.secondaryButton} onPress={()=>setKindPicker(false)}><Text style={styles.secondaryButtonText}>Kapat</Text></Pressable></ScrollView></SafeAreaView></Modal>
    </View>;
  }
  return <>
    {guided&&<View style={styles.inlineActions}><Pressable style={styles.secondaryButton} onPress={()=>setFlow(currentPlan?.quality?.ok?"production":"offers")}><Text style={styles.secondaryButtonText}>{currentPlan?.quality?.ok?"Üretim adımını göster":"Ürün önerilerine dön"}</Text></Pressable><Pressable style={styles.secondaryButton} onPress={()=>setResearchDetails(!researchDetails)}><Text style={styles.secondaryButtonText}>{researchDetails?"Araştırma ayrıntılarını gizle":"Araştırma ayrıntılarını göster"}</Text></Pressable></View>}
    <ListingGuide input={{ phase: "studio", planReady: Boolean(currentPlan?.quality?.ok), assistant: assistant === "claude" ? "claude" : "chatgpt" }}
      actionLabel={currentPlan?.quality?.ok ? "Goxi ile üretim paketini paylaş" : currentPreview?.recommendation?.requiresNewTopic ? "Goxi ile yeni konu bul" : currentPreview ? "Goxi ile ilan paketini hazırla" : "Goxi ile rakipleri araştır"}
      onAction={() => currentPlan?.quality?.ok ? shareChecked(currentPlan.quality, currentPlan.brief.masterPrompt, `${currentPlan.brief.name} - tek paket`) : currentPreview?.recommendation?.requiresNewTopic ? onPickKind(kind,keyword) : currentPreview ? generate() : analyze()}
      disabled={!online || working || seeding}
      secondaryLabel="Dosyalarım hazır, yüklemeye geç"
      onSecondary={currentPlan?.quality?.ok ? () => onUpload({ name: currentPlan.handoff?.name || brief.name, kind: currentPlan.handoff?.kind || kind, productType: currentPlan.handoff?.productType || productType, listing, pins: brief.pins, priceUsd: brief.priceUsd, research: currentPlan.research, handoffName: brief.name, handoff: currentPlan.handoff, assistant }) : undefined} />
    {researchDetails&&<>
    {!!basis.length && !seeding && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Trendden otomatik dolduruldu: {keyword}</Text>
      {basis.map((line) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      <Text style={styles.formHint}>İsterseniz alanları değiştirin; değilse doğrudan aşağıdaki düğmeye basın.</Text>
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} disabled={!online} onPress={onReseed}><Text style={styles.secondaryButtonText}>Başka trend kombinasyonu</Text></Pressable>
        <Pressable style={styles.secondaryButton} disabled={!online || seeding || working} onPress={() => onPickKind(kind, keyword)}><Text style={styles.secondaryButtonText}>Başka arama seç</Text></Pressable>
      </View>
    </View>}
    {!seeding && seedEvidenceCurrent && <SearchSelectionCard selection={seed.selection} onSelect={onPickQuery} disabled={!online || working} />}
    {!seeding && <CompetitionCard competition={research?.competition || (seedEvidenceCurrent ? seed.competition : undefined)} />}
    {research && <Text style={styles.formHint}>Rakip analizi: {research.keyword} · {research.sampleSize} benzer dijital ilan · {new Date(research.scannedAt).toLocaleString("tr-TR")}. {research.noteTr}</Text>}
    <MarketStrategyCard strategy={research?.strategy || (seedEvidenceCurrent ? seed.marketStrategy : undefined)} />
    <ProductRecommendationCard recommendation={research?.recommendation} onNewIdea={()=>onPickKind(kind,keyword)} disabled={!online || working || seeding} />
    </>}
    <Text style={styles.fieldLabel}>Dijital ürün türü</Text>
    <ChipGroup options={PRINTABLE_KIND_OPTIONS} value={kind} onChange={(next: string) => { setKind(next); onPickKind(next); }} />
    {!!KIND_HELP[kind] && <Text style={styles.formHint}>{KIND_HELP[kind]}</Text>}
    <Text style={styles.fieldLabel}>Hangi yapay zekâyla üreteceksiniz?</Text>
    <ChipGroup options={ASSISTANT_OPTIONS} value={assistant} onChange={chooseAssistant} />
    <Text style={styles.formHint}>{assistant === "claude" ? "Claude: dosyaları ve vektör (SVG) çizimleri kendisi yapar; fotoğraf üretemez. Fotoğraf gibi sahneler için size görsel promptunu verir, onu bir görsel aracında çalıştırırsınız." : "ChatGPT: görselleri kendi görsel aracıyla, dosyaları Python ile hazırlar ve indirme bağlantısı verir."}</Text>
    <Field label="Ürün (İngilizce)" value={productType} onChangeText={(value: string) => { setProductType(value); setKeyword(""); setTrendTags([]); setTrendFeatures([]); setReferenceNotes(""); }} placeholder="budget planner, adult coloring pages, recipe cards" autoCapitalize="none" />
    <Field label="Trend özeti (Etsy üst ilanlarından)" value={currentPlan?.research?.marketBriefEn || referenceNotes} onChangeText={setReferenceNotes} placeholder="Trendden gelince otomatik dolar" multiline />
    <Field label="Renkler" value={colors} onChangeText={setColors} placeholder="sage green, cream, terracotta" autoCapitalize="none" />
    <Field label="Formatlar (virgülle)" value={formats} onChangeText={setFormats} placeholder="US Letter, A4, A5" />
    <Field label="Sayfa / tasarım sayısı" value={pageCount} onChangeText={(value:string)=>{pageCountEdited.current=true;setPageCount(value);}} keyboardType="number-pad" placeholder="30" />
    <Text style={styles.formHint}>10 sabit sınır değildir. Goxi araştırmadan sonra kapsam önerir; buraya kendi sayını yazarsan onu korur. Ana içerik ile kapak, rehber ve cevaplar ayrı sayılır. Takvim 12 ay, ABC boyama 26 harf, özgeçmiş 4 şablondur; sunum oyunu 15–50 soru ve 5’in katıdır.</Text>
    <Field label="Hedef kitle (isteğe bağlı)" value={audience} onChangeText={setAudience} placeholder="busy moms, teachers, brides-to-be" />
    <Field label="Hedef Etsy araması" value={keyword} onChangeText={setKeyword} placeholder="budget planner printable" autoCapitalize="none" />
    <Field label="Bu ürünün rakip ilanları (isteğe bağlı, en fazla 5)" value={competitorLinks} onChangeText={setCompetitorLinks} placeholder="Etsy ilan linkleri veya numaraları; boşlukla ayırın" multiline autoCapitalize="none" />
    <Text style={styles.formHint}>Etsy'de bu ürüne bakarken altta önerilen veya çok satan olarak gördüğün ilanların linklerini ekle. Aynı tür ve konu denetlenir; eklediğin ilanlar raporda işaretlenir. Satış adedi, rozet ve satışın nedeni doğrulanmış sayılmaz.</Text>
    <Pressable style={[styles.secondaryButton, (working || seeding || !online) && styles.primaryDisabled]} disabled={working || seeding || !online} onPress={analyze}><Text style={styles.secondaryButtonText}>İlan hazırlamadan bu ürünün rakiplerini incele</Text></Pressable>
    <Pressable style={[styles.analyzeButton, (working || seeding || !online) && styles.primaryDisabled]} disabled={working || seeding || !online} onPress={generate}>{working ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "Yeni adla yeniden hazırla" : "Prompt, görsel ve ilanı hazırla"}</Text></Pressable>
    {brief && <>
      <View style={styles.analysisCard}>
        <Text style={styles.small}>Sistemin seçtiği ürün adı</Text>
        <Text style={styles.studioName}>{brief.name}</Text>
        {!!brief.priceUsd && <Text style={styles.listingTitle}>Önerilen fiyat: {brief.priceUsd.toFixed(2)} USD · yükleme formunda değiştirebilirsiniz</Text>}
        <Text style={styles.warningTitle}>Özgünlük planı</Text>
        {brief.originalityPlan.map((line: string) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      </View>
      <MasterPromptCard brief={brief} quality={plan?.quality} assistant={assistant} trackingWorkspace={currentPlan?.quality?.ok?{version:1,savedAt:new Date().toISOString(),input:workspaceInput,plan:currentPlan}:undefined} />
      <PromptBox quality={plan?.quality} title="1) Ürün dosyası şartnamesi (İngilizce; tek pakette zaten var)" text={brief.pdfPrompt} shareTitle={`${brief.name} PDF prompt`} />
      {!!brief.artPrompts?.length && <PromptBox quality={plan?.quality} title="2) Sayfa görselleri promptları (İngilizce)" text={brief.artPrompts.join("\n\n")} shareTitle={`${brief.name} artwork prompts`} />}
      <AdVisualsPanel visuals={brief.adVisuals} />
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Pinterest pinleri</Text>
        <Text style={styles.small}>Pinterest ölçülerek denenebilecek bir trafik kanalıdır. Pinleri farklı günlerde paylaş; Pinterest için ayrılan dikey görsel promptunu kullan. C1-C10 Etsy galerisine, C11-C12 ayrı pazarlama kanallarına aittir.</Text>
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
      <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Etsy ilanı ({listing.source === "ai" ? "yapay zekâ + kurallar" : "kurallar"})</Text><Text style={[styles.readinessState, listing.checks.ok && styles.connectedText]}>{listing.checks.ok ? "İlan metni kontrolleri geçti" : "Metni kontrol et"}</Text></View>
      <Text style={styles.listingTitle}>{listing.title}</Text>
      <Text style={styles.small}>{listing.checks.titleLength}/140 karakter · {listing.checks.tagCount}/13 etiket</Text>
      <View style={[styles.chips, { marginTop: 8 }]}>{listing.tags.map((tag: string) => <View style={styles.chip} key={tag}><Text style={styles.chipText}>{tag}</Text></View>)}</View>
      {listing.checks.issues.map((issue: string) => <Text style={styles.warningText} key={issue}>• {issue}</Text>)}
      <TurkishGloss title={listing.title} tags={listing.tags} />
      {listing.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} onPress={() => shareChecked(plan?.quality, `${listing.title}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}`)}><Text style={styles.secondaryButtonText}>İlan metnini kopyala</Text></Pressable>
        <Pressable style={[styles.secondaryButton, !currentPlan?.quality?.ok && styles.primaryDisabled]} disabled={!currentPlan?.quality?.ok} onPress={() => onUpload({ name: currentPlan?.handoff?.name || brief?.name, kind: currentPlan?.handoff?.kind || kind, productType: currentPlan?.handoff?.productType || productType, listing, pins: brief?.pins, priceUsd: brief?.priceUsd, research: currentPlan?.research, handoffName: brief?.name, handoff: currentPlan?.handoff, assistant })}><Text style={styles.secondaryButtonText}>Dosyalar hazırsa yükle →</Text></Pressable>
      </View>
    </View>}
  </>;
}

function ChipGroup({ options, value, onChange, disabled = false }: any) {
  return <View style={styles.chips}>{options.map((option: any) => <Pressable key={option.id} disabled={disabled} style={[styles.chip, value === option.id && styles.chipActive,disabled&&styles.primaryDisabled]} onPress={() => onChange(option.id)}><Text style={[styles.chipText, value === option.id && styles.chipTextActive]}>{option.label}</Text></Pressable>)}</View>;
}

// Sunucu her talimatı, başlığı, etiketi ve açıklamayı telefona göndermeden önce otomatik denetler; küçük hataları
// düzeltir. Sonuç burada görünür; düzeltilemeyen sorun kalırsa paylaşmadan önce sorulur.
function qualityErrors(quality: any): any[] {
  return (quality?.issues || []).filter((issue: any) => issue.severity === "error");
}

function QualityNote({ quality }: any) {
  if (!quality) return null;
  const errors = qualityErrors(quality);
  return <View style={[styles.qualityNote, errors.length ? styles.qualityBad : styles.qualityGood]}>
    <Ionicons name={errors.length ? "alert-circle-outline" : "checkmark-circle-outline"} size={18} color={errors.length ? "#9B2C2C" : "#2F6B4F"} />
    <View style={{ flex: 1 }}>
      <Text style={styles.qualityTitle}>{errors.length ? `Otomatik denetim: ${errors.length} sorun bulundu` : `Metin denetimi: ${quality.checks} kuralda hata bulunmadı`}</Text>
      <Text style={styles.small}>Bu sonuç hazırlanan metin içindir. Üretilecek dosyaların içeriği, görünümü ve işlevi henüz doğrulanmış değildir.</Text>
      {!!quality.fixed?.length && <Text style={styles.small}>Küçük yazım hataları gönderilmeden önce düzeltildi.</Text>}
      {errors.slice(0, 5).map((issue: any, index: number) => <Text key={`${issue.code}-${index}`} style={styles.small}>• {issue.messageTr}</Text>)}
      {!!errors.length && <Text style={styles.small}>Yeniden üretmek (Hazırla'ya tekrar dokunmak) genellikle düzeltir.</Text>}
    </View>
  </View>;
}

function shareChecked(quality: any, message: string, title?: string) {
  const errors = qualityErrors(quality);
  const share = () => { Share.share(title ? { message, title } : { message }); };
  if (!errors.length) return share();
  Alert.alert("Denetimde sorun var", `${errors.length} sorun bulundu: ${errors[0].messageTr} Yeniden üretmeniz önerilir. Yine de göndermek istiyor musunuz?`, [
    { text: "Vazgeç", style: "cancel" },
    { text: "Yine de gönder", onPress: share }
  ]);
}

// Paylaşım ChatGPT/Claude'da her seferinde yeni sohbet açar; parçalar ayrı sohbetlere düşerse ad, palet ve spec kaybolur.
// Tek paket tüm adımları sırayla içerir: bir kez gönderilir, tüm iş aynı sohbette yürür.
function MasterPromptCard({ brief, quality, assistant, trackingWorkspace }: any) {
  const tool = assistant === "claude" ? "Claude" : assistant === "chatgpt" ? "ChatGPT" : "ChatGPT'ye (veya Claude'a)";
  if (!brief?.masterPrompt) return null;
  const steps = (brief.masterPrompt.match(/^- (ADIM|STEP) \d+/gm) || []).length;
  return <View style={[styles.analysisCard, styles.masterCard]}>
    <Text style={styles.cardTitle}>Tek paket: tek sohbette hepsi</Text>
    <Text style={styles.analysisLine}>Parça parça gönderme: her paylaşım yeni sohbet açar ve yeni sohbet önceki ürün adını, paleti ve sayfa planını bilmez. Bu paket ürün dosyası, görseller ve varsa pinler dahil tüm parçaları {steps} sıralı adımda birleştirir.</Text>
    <Text style={styles.analysisLine}>Dil: paketin istek kısmı Türkçedir. Yapay zekâ sizinle Türkçe konuşur ve sizden isteyeceği her işi (ekran görüntüsü yükleme, bir promptu görsel aracında çalıştırma) Türkçe yazar. Ürün, dosyalar, görsellerdeki yazılar ve ilan ise ABD'deki alıcı için Amerikan İngilizcesiyle hazırlanır; vergi, resmî tatil, okul yılı ve iklim gibi eyaletten eyalete değişen konular ürüne sabit bilgi olarak yazılmaz.</Text>
    <Text style={styles.analysisLine}>1. Aşağıdaki düğmeyle bir kez {assistant === "claude" ? "Claude'a" : assistant === "chatgpt" ? "ChatGPT'ye" : tool} gönder; paylaş ekranında {assistant === "claude" ? "Claude" : "ChatGPT"} uygulamasını seç.</Text>
    <Text style={styles.analysisLine}>2. Her adım bitince aynı sohbete "devam" yaz; yeni sohbet açma.</Text>
    <Text style={styles.analysisLine}>3. {assistant === "claude" ? "Claude görselleri kodla vektör çizer; fotoğraf gibi sahnelerin promptunu verir, onları bir görsel aracında üretip aynı sohbete yükle." : "ChatGPT görselleri kendi görsel aracıyla üretir; dosyaları indirme bağlantısıyla verir."}</Text>
    <Text style={styles.small}>{Math.round(brief.masterPrompt.length / 100) / 10} bin karakter. Uygulama uzun metni almazsa paylaş ekranının üstündeki kopyala simgesine dokunup aynı sohbete yapıştır.</Text>
    <QualityNote quality={quality} />
    <Pressable style={[styles.primary, { marginTop: 12, marginBottom: 0 }]} onPress={() => trackingWorkspace?shareProductionPackage(trackingWorkspace).catch((error:Error)=>Alert.alert("Paket açılamadı",error.message)):shareChecked(quality, brief.masterPrompt, `${brief.name} - tek paket`)}><Text style={styles.primaryText}>{assistant === "claude" ? "Tek paketi Claude'a gönder" : assistant === "chatgpt" ? "Tek paketi ChatGPT'ye gönder" : "Tek paketi gönder"}</Text><Ionicons name="paper-plane-outline" size={18} color="white" /></Pressable>
    <Text style={[styles.small, { marginTop: 10 }]}>Aşağıdaki parçalar bu paketin içindekilerdir. Ayrı kullanacaksan hepsini aynı sohbete yapıştır.</Text>
  </View>;
}

function PromptBox({ title, text, shareTitle, quality }: any) {
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>{title}</Text><Pressable style={styles.secondaryButton} onPress={() => shareChecked(quality, text, shareTitle)}><Text style={styles.secondaryButtonText}>Kopyala / gönder</Text></Pressable></View>
    <Text style={styles.promptText} numberOfLines={8}>{text}</Text>
  </View>;
}

function StudioPanel({ online, active, seed, onUpload, onOpenProduct, etsyReady, productionResume }: any) {
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
  const [mode, setMode] = useState<"pattern" | "printable" | "physical">("printable");
  const [printableSeed, setPrintableSeed] = useState<any>();
  const [competition, setCompetition] = useState<any>();
  const [plan, setPlan] = useState<any>();
  const [working, setWorking] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [savedWorkspace, setSavedWorkspace] = useState<PrintableWorkspace>();
  const [workspaceOutdated, setWorkspaceOutdated] = useState(false);
  const [resumeWorkspace, setResumeWorkspace] = useState<PrintableWorkspace>();
  const {rows:trackedWorks,loaded:workspaceLoaded}=useProductionRecords();
  const restoredInitial=useRef(false);
  useEffect(()=>{let mounted=true;AsyncStorage.getItem(PRINTABLE_WORKSPACE_KEY).then(raw=>{if(mounted){const restored=parsePrintableWorkspace(raw);setSavedWorkspace(restored);setWorkspaceOutdated(Boolean(raw&&!restored));}}).catch(()=>undefined);return()=>{mounted=false;};},[]);
  const resumeSaved = (selected?:PrintableWorkspace) => {
    const workspace=selected || savedWorkspace;
    if (!workspace) return;
    setSavedWorkspace(workspace);
    seedRequest.current += 1; setSeeding(false); setInitialized(true); setMode("printable");
    const input = workspace.input;
    setPrintableSeed({ ...input, colors: String(input.colors || "").split(",").filter(Boolean), formats: String(input.formats || "").split(",").filter(Boolean), basis: [] });
    setResumeWorkspace({ ...workspace });
    saveProductionWorkspace(workspace).catch(() => Alert.alert("Çalışma açıldı", "Çalışma bu oturumda açık, ancak telefona yeniden kaydedilemedi."));
  };
  useEffect(()=>{
    if(!workspaceLoaded||!active||restoredInitial.current||seed||productionResume)return;
    restoredInitial.current=true;
    void activeProduction(trackedWorks).then(row=>{if(row)resumeSaved(row.workspace);}).catch(()=>undefined);
  },[workspaceLoaded,active]);
  useEffect(()=>{
    if(!workspaceLoaded||!productionResume)return;
    const row=trackedWorks.find(row=>row.id===productionResume.id);
    if(row){restoredInitial.current=true;resumeSaved(row.workspace);}
  },[productionResume,workspaceLoaded]);
  // Etsy 22 Ekim 2026: yapay zekâ deseni yasak. Desen ilanı yalnız kendi yazılmış, denenmiş ve gerçek fotoğraflı desen içindir.
  const [patternName, setPatternName] = useState("");
  const [ownPattern, setOwnPattern] = useState(false);
  const [patternTested, setPatternTested] = useState(false);
  const [realPhotos, setRealPhotos] = useState(false);
  // Trendden gelindiğinde tüm alanlar sunucunun trend verisinden çıkardığı değerlerle dolar; her çağrı yeni bir kombinasyon getirir.
  // Arama verilmezse (Stüdyo doğrudan açıldığında veya tür seçildiğinde) sunucu o türde en güçlü trendi kendisi seçer.
  // Art arda dokunuşlarda yalnızca en son isteğin yanıtı uygulanır; geç dönen eski yanıt yeni seçimi ezmez.
  const seedRequest = useRef(0);
  const fillFromTrend = async (source: any) => {
    if (!source?.keyword && !source?.studio) return;
    const requestId = ++seedRequest.current;
    setResumeWorkspace(undefined);
    setSeeding(true);
    if (source.studio === "pattern" || source.group === "patterns") { setPlan(undefined); setOwnPattern(false); setPatternTested(false); setRealPhotos(false); setCompetition(undefined); }
    try {
      const filled = await apiJson("/api/patterns/seed", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword: source.keyword, craft: source.craft, group: source.group, kind: source.kind, studio: source.studio, avoidKeyword: source.avoidKeyword }) });
      if (requestId !== seedRequest.current) return;
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
      setCompetition(filled.competition);
      setFromTrend(true);
    } catch (error) {
      if (requestId !== seedRequest.current) return;
      if (source.group === "printables" || source.studio === "printable") {
        setPrintableSeed({ kind: source.kind || "planner", productType: source.productType || "", keyword: source.keyword || "", trendTags: source.trendTags || [], basis: [] });
        setMode("printable");
        Alert.alert("Trend verisi alınamadı", `${errorText(error)}\nAlanları elle tamamlayabilirsiniz.`);
        return;
      }
      setCraft(source.craft || "crochet");
      setProductType(source.productType || "");
      setKeyword(source.keyword || "");
      setTrendTags(source.trendTags || []);
      setFromTrend(false);
      Alert.alert("Trend verisi alınamadı", `${errorText(error)}\nAlanları elle tamamlayabilirsiniz.`);
    } finally { if (requestId === seedRequest.current) setSeeding(false); }
  };
  useEffect(() => () => { seedRequest.current += 1; }, []);
  useEffect(() => {
    if (!seed) return;
    setInitialized(true);
    if (seed.studio === "physical" || ["tesbih", "vintage", "other"].includes(seed.group)) {
      seedRequest.current += 1;
      setSeeding(false);
      setMode("physical");
      return;
    }
    fillFromTrend(seed);
  }, [seed]);
  // Stüdyo ilk kez açıldığında boş kalmasın: seçili modda en güçlü trend otomatik doldurulur.
  useEffect(() => {
    if (!active || !workspaceLoaded || !restoredInitial.current || trackedWorks.some(row=>row.stage!=="published") || initialized || seed || !online) return;
    setInitialized(true);
    fillFromTrend({ studio: mode });
  }, [active, online,workspaceLoaded]);
  const changeMode = (next: "pattern" | "printable" | "physical") => {
    seedRequest.current += 1;
    setSeeding(false);
    setMode(next);
    if (next === "printable" && !printableSeed) fillFromTrend({ studio: "printable" });
    if (next === "pattern" && !fromTrend && !productType) fillFromTrend({ studio: "pattern" });
  };
  // Kendi modelinizle çalışırken el işi türünü değiştirmek girdiklerinizi trend verisiyle ezmez.
  const changeCraft = (next: string) => {
    seedRequest.current += 1; setSeeding(false); setPlan(undefined); setCompetition(undefined); setOwnPattern(false); setPatternTested(false); setRealPhotos(false);
    setCraft(next);
    if (fromTrend || !productType.trim()) fillFromTrend({ studio: "pattern", craft: next });
  };
  const changePatternType = (value: string) => {
    seedRequest.current += 1; setSeeding(false); setProductType(value); setPlan(undefined); setCompetition(undefined);
    setKeyword(""); setTrendTags([]); setTrendFeatures([]); setTrendBasis([]); setFromTrend(false);
    setOwnPattern(false); setPatternTested(false); setRealPhotos(false);
  };
  const useOwnModel = () => {
    seedRequest.current += 1;
    setSeeding(false);
    setFromTrend(false);
    setCompetition(undefined); setPlan(undefined); setOwnPattern(false); setPatternTested(false); setRealPhotos(false);
    setTrendFeatures([]);
    setTrendBasis([]);
    setReferenceNotes("");
    setReferenceColors("");
  };
  const patternInputKey = generationKey({ craft, productType, referenceNotes, referenceRepeatCount, referenceColors, skillLevel, sizeNote, yarnNote, colors, keyword, trendTags, trendFeatures, patternName, ownPattern, patternTested, realPhotos, fromTrend });
  const generate = async () => {
    if (productType.trim().length < 3) return Alert.alert("Ürün türü", "Ürün türünü İngilizce yazın (ör. doily, ballet slippers, tote bag).");
    if (!ownPattern || !patternTested || !realPhotos) return Alert.alert("Etsy kuralı", "Etsy yapay zekâyla yazılmış deseni yasakladı. İlan yalnız kendi yazdığınız, bizzat yapıp denediğiniz ve bitmiş ürününün gerçek fotoğrafı olan desen için hazırlanır. Üç onayı da işaretleyin.");
    setWorking(true);
    try {
      const result = await apiJson("/api/patterns/plan", {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ craft, productType, name: patternName.trim() || undefined, referenceNotes, referenceRepeatCount: referenceRepeatCount ? Number(referenceRepeatCount) : undefined, referenceColors, skillLevel, sizeNote, yarnNote, colors, keyword, trendTags, seed: String(Date.now()), ownPattern, testMade: patternTested, photosAreRenders: !realPhotos, aiAssisted: false, ...(fromTrend ? { referenceSource: "trend", trendFeatures } : {}) })
      });
      setPlan({ ...result, inputKey: patternInputKey });
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setWorking(false); }
  };
  const currentPatternPlan = plan?.inputKey === patternInputKey ? plan : undefined;
  const brief = currentPatternPlan?.brief;
  const listing = currentPatternPlan?.listing;
  return <>
    <Text style={styles.sectionTitle}>{mode === "physical" ? "Elimdeki ürünü sat" : "Yeni ürün fikri"}</Text>
    <ChipGroup options={STUDIO_MODES} value={mode} onChange={changeMode} />
    {workspaceOutdated && !savedWorkspace && <Text style={styles.warningText}>Önceki hazırlama paketi bu sürümün kontrollerinden geçmedi. Aşağıdan ürünü seçip yeniden hazırla; eski paketi üretimde kullanma. Telefona indirdiğin dosyalar silinmedi.</Text>}
    <ProductionWorkList onResume={(row)=>resumeSaved(row.workspace)}/>
    {seeding && <View style={styles.guardrail}><ActivityIndicator color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Etsy trend verisi okunuyor; tüm alanlar otomatik dolduruluyor…</Text></View>}
    <View testID="studio-mode-physical" style={mode === "physical" ? undefined : styles.hidden}>{seed?.studio === "physical" && <Text style={styles.formHint}>Seçilen pazar araması: {seed.keyword}. Kendi ürününüzün gerçek fotoğrafları ve doğruladığınız bilgilerle ilerleyin; rakibin özellikleri ürününüze aktarılmaz.</Text>}<PhotoListingStudio online={online} etsyReady={etsyReady} /></View>
    <View testID="studio-mode-printable" style={mode === "printable" ? undefined : styles.hidden}><PrintableStudio guided online={online} seed={printableSeed} resumeWorkspace={resumeWorkspace} onPrepared={setSavedWorkspace} seeding={seeding} onReseed={() => printableSeed?.keyword && fillFromTrend({ keyword: printableSeed.keyword, kind: printableSeed.kind, studio: "printable" })} onPickKind={(kind: string, avoidKeyword?: string) => fillFromTrend({ studio: "printable", kind, avoidKeyword })} onPickQuery={(keyword: string) => fillFromTrend({ studio: "printable", kind: printableSeed?.kind, keyword })} onOpenProduct={onOpenProduct} onUpload={onUpload} /></View>
    <View testID="studio-mode-pattern" style={mode === "pattern" ? undefined : styles.hidden}>
    <ListingGuide input={{ phase: "studio", ownPattern: true, planReady: Boolean(currentPatternPlan?.quality?.ok) }}
      actionLabel={currentPatternPlan?.quality?.ok ? "Goxi ile kendi desenimi yüklemeye geç" : "Goxi ile kendi desenimin ilanını hazırla"}
      onAction={() => currentPatternPlan?.quality?.ok ? onUpload({ name: brief?.name || patternName.trim() || listing.title.split(",")[0], craft, productType, listing, priceUsd: competition?.launchPriceUsd, ownPattern: true }) : generate()} disabled={!online || working || seeding} />
    <View style={[styles.qualityNote, styles.qualityBad]}>
      <Ionicons name="alert-circle-outline" size={18} color="#9B2C2C" />
      <View style={{ flex: 1 }}>
        <Text style={styles.qualityTitle}>Etsy kuralı (22 Ekim 2026): yapay zekâ deseni yasak</Text>
        <Text style={styles.small}>Örgü, tığ, dikiş, nakış, kanaviçe, punch ve makrome desenini yapay zekâya yazdırıp Etsy'de satmak yasak; ilanda belirtmek de yetmiyor. Bu bölüm yalnız sizin veya mağaza üyenizin yazdığı, bizzat yapıp denediği desen için başlık, etiket ve açıklama hazırlar. İlanda bitmiş ürünün en az bir gerçek, düzenlenmemiş fotoğrafı olmalı. Kapakta en açık gerçek fotoğrafı tercih edin. Trend verisi yalnız ne yapacağınıza karar vermek içindir.</Text>
      </View>
    </View>
    {fromTrend && !seeding && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Trendden otomatik dolduruldu: {keyword}</Text>
      {trendBasis.map((line) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      <Text style={styles.formHint}>Alanları kendi deseninize göre düzeltin, üç onayı işaretleyin ve "Kendi desenim için ilanı hazırla"ya basın.</Text>
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} disabled={!online} onPress={() => fillFromTrend({ keyword, craft, studio: "pattern" })}><Text style={styles.secondaryButtonText}>Başka trend kombinasyonu</Text></Pressable>
        <Pressable style={styles.secondaryButton} disabled={!online} onPress={() => fillFromTrend({ studio: "pattern", craft })}><Text style={styles.secondaryButtonText}>Başka arama seç</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={useOwnModel}><Text style={styles.secondaryButtonText}>Kendi modelimden hazırla</Text></Pressable>
      </View>
    </View>}
    {fromTrend && !seeding && <CompetitionCard competition={competition} />}
    <Text style={styles.fieldLabel}>El işi türü</Text>
    <ChipGroup options={CRAFT_OPTIONS} value={craft} onChange={changeCraft} />
    <Field label="Ürün türü (İngilizce)" value={productType} onChangeText={changePatternType} placeholder="doily, ballet slippers, tote bag" autoCapitalize="none" />
    <Field label={fromTrend ? "Trend özeti (Etsy üst ilanlarından)" : "Seçtiğin modelde neyi beğendin?"} value={referenceNotes} onChangeText={setReferenceNotes} placeholder="8 yeşil yaprak, turuncu küçük çiçekler, beyaz dantel yelpazeler" multiline />
    {!fromTrend && <Field label="Modeldeki tekrar sayısı (varsa)" value={referenceRepeatCount} onChangeText={setReferenceRepeatCount} placeholder="8" keyboardType="number-pad" />}
    <Field label={fromTrend ? "Trendde görülen renkler" : "Modelin renkleri"} value={referenceColors} onChangeText={setReferenceColors} placeholder={fromTrend ? "Trendde renk sinyali yok" : "white, green, orange"} autoCapitalize="none" />
    <Text style={styles.fieldLabel}>Zorluk</Text>
    <ChipGroup options={SKILL_OPTIONS} value={skillLevel} onChange={setSkillLevel} />
    <Field label="Hedef ölçü / beden" value={sizeNote} onChangeText={setSizeNote} placeholder={fromTrend ? "Kendi yapıp denediğiniz desenin gerçek ölçüsünü girin" : "16 in / 41 cm veya EU 36-41"} />
    <Field label="İplik / malzeme" value={yarnNote} onChangeText={setYarnNote} placeholder="Size 10 cotton crochet thread" />
    <Field label="İstediğin renkler (boşsa sistem önerir)" value={colors} onChangeText={setColors} placeholder="sage, honey, cream" autoCapitalize="none" />
    <Field label="Hedef Etsy araması" value={keyword} onChangeText={(value: string) => { setKeyword(value); setCompetition(undefined); setPlan(undefined); }} placeholder="crochet doily pattern" autoCapitalize="none" />
    {!!trendTags.length && <Text style={styles.formHint}>Trendden {trendTags.length} etiket sinyali eklendi.</Text>}
    <Field label="Desenin adı (sizin verdiğiniz)" value={patternName} onChangeText={setPatternName} placeholder="Sunday Market Cardigan" />
    <View style={styles.card}>
      <Toggle label="Deseni ben veya mağaza üyem yazdı (yapay zekâ yazmadı)" value={ownPattern} onChange={setOwnPattern} />
      <Toggle label="Desenle ürünü bizzat yaptık ve denedik" value={patternTested} onChange={setPatternTested} />
      <Toggle label="Bitmiş ürünün gerçek, düzenlenmemiş fotoğrafı var" value={realPhotos} onChange={setRealPhotos} />
    </View>
    <Pressable style={[styles.analyzeButton, (working || seeding || !online) && styles.primaryDisabled]} disabled={working || seeding || !online} onPress={generate}>{working ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "İlanı yeniden hazırla" : "Kendi desenim için ilanı hazırla"}</Text></Pressable>
    {brief && <>
      <View style={styles.analysisCard}>
        <Text style={styles.small}>Sistemin seçtiği desen adı</Text>
        <Text style={styles.studioName}>{brief.name}</Text>
        <Text style={styles.warningTitle}>Modelden farklılaştırma planı</Text>
        {brief.originalityPlan.map((line: string) => <Text style={styles.analysisLine} key={line}>• {line}</Text>)}
      </View>
      <MasterPromptCard brief={brief} quality={currentPatternPlan?.quality} />
      <PromptBox quality={currentPatternPlan?.quality} title="1) PDF desen promptu (Claude / ChatGPT)" text={brief.patternPrompt} shareTitle={`${brief.name} pattern prompt`} />
      <PromptBox quality={currentPatternPlan?.quality} title="2) 3D render promptu" text={brief.renderPrompt} shareTitle={`${brief.name} render prompt`} />
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
      <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Etsy ilanı ({listing.source === "ai" ? "yapay zekâ + kurallar" : "kurallar"})</Text><Text style={[styles.readinessState, listing.checks.ok && styles.connectedText]}>{listing.checks.ok ? "İlan metni kontrolleri geçti" : "Metni kontrol et"}</Text></View>
      <Text style={styles.listingTitle}>{listing.title}</Text>
      <Text style={styles.small}>{listing.checks.titleLength}/140 karakter · {listing.checks.tagCount}/13 etiket</Text>
      <View style={[styles.chips, { marginTop: 8 }]}>{listing.tags.map((tag: string) => <View style={styles.chip} key={tag}><Text style={styles.chipText}>{tag}</Text></View>)}</View>
      {listing.checks.issues.map((issue: string) => <Text style={styles.warningText} key={issue}>• {issue}</Text>)}
      <TurkishGloss title={listing.title} tags={listing.tags} />
      {listing.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} onPress={() => shareChecked(currentPatternPlan?.quality, `${listing.title}\n\n${listing.description}\n\nTags: ${listing.tags.join(", ")}`)}><Text style={styles.secondaryButtonText}>İlan metnini kopyala</Text></Pressable>
        <Pressable style={[styles.secondaryButton, !currentPatternPlan?.quality?.ok && styles.primaryDisabled]} disabled={!currentPatternPlan?.quality?.ok} onPress={() => onUpload({ name: brief?.name || patternName.trim() || listing.title.split(",")[0], craft, productType, listing, priceUsd: competition?.launchPriceUsd, ownPattern: true })}><Text style={styles.secondaryButtonText}>Dosyalar hazırsa yükle →</Text></Pressable>
      </View>
    </View>}
    </View>
  </>;
}

// Etsy ilanına video: 5-15 saniyelik MP4/MOV, en fazla 100 MB. Videolu ilanlar Etsy'de daha çok tıklanır.
function EtsyVideoUpload({ listingId }: { listingId: number }) {
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: true, videoMaxDuration: 15, quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const video = result.assets[0];
    const seconds = (video.duration || 0) / 1000;
    if (seconds && (seconds < 5 || seconds > 15.5)) return Alert.alert("Video süresi", `Etsy 5-15 saniyelik video kabul eder; bu video ${Math.round(seconds)} saniye. Kırpıp tekrar seçin.`);
    if (video.fileSize && video.fileSize > 100 * 1024 * 1024) return Alert.alert("Video çok büyük", "Etsy en fazla 100 MB kabul eder.");
    setState("uploading");
    try {
      const form = new FormData();
      form.append("confirm", "true");
      form.append("video", { uri: video.uri, name: video.fileName || "listing-video.mp4", type: video.mimeType || "video/mp4" } as any);
      const response = await fetch(`${API_URL}/api/etsy/listings/${listingId}/video`, { method: "POST", headers: apiHeaders(), body: form });
      const body = await response.json().catch(() => ({})) as any;
      if (!response.ok) throw new Error(body.error || `Video yüklenemedi (kod ${response.status}).`);
      setState("done");
      Alert.alert("Video Etsy'ye gönderildi", "Etsy videoyu birkaç dakika içinde işler; sonra taslakta Photo & Video bölümünde görünür.");
    } catch (error) { setState("idle"); Alert.alert("Video yüklenemedi", errorText(error)); }
  };
  return <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }, state === "uploading" && styles.primaryDisabled]} disabled={state === "uploading"} onPress={pick}>
    <Text style={styles.secondaryButtonText}>{state === "uploading" ? "Video yükleniyor…" : state === "done" ? "Video gönderildi · değiştir" : "Video ekle (5-15 sn)"}</Text>
  </Pressable>;
}

function ListingGuide({ input, ...actions }: { input: ListingProgressInput } & Pick<ListingMascotProps, "onAction" | "actionLabel" | "disabled" | "onSecondary" | "secondaryLabel">) {
  const guide = listingProgress(input);
  return <ListingMascot {...guide} tasks={listingTasks(input)} {...actions} />;
}

function Toggle({ label, value, onChange }: any) {
  return <Pressable style={styles.readinessRow} onPress={() => onChange(!value)}><Ionicons name={value ? "checkbox" : "square-outline"} size={21} color={value ? "#315B4C" : "#8A948F"} /><Text style={[styles.rowTitle, { flex: 1 }]}>{label}</Text></Pressable>;
}

// Satıştan önceki deneme ürün türüne göre değişir: basılan ürün yazdırılır, program şablonu programında açılır.
function testLabel(kind: string): string {
  if (kind === "slides") return "Dosya PowerPoint ve Google Slides'ta açılıp tıklanarak denendi";
  if (kind === "resume") return "Belge Word ve Google Docs'ta açılıp denendi";
  if (kind === "spreadsheet") return "Tablo Excel ve Google Sheets'te açılıp denendi";
  if (kind === "wallpaper" || kind === "app_icons") return "Telefonda kurulup denendi";
  if (kind === "digital_planner") return "Tablette (GoodNotes / Notability) açılıp bağlantılar denendi";
  return "Test baskısı alındı (satılan her ölçüde)";
}

function testWarning(kind: string): string {
  if (kind === "slides") return "Satıştan önce dosyayı PowerPoint'te ve Google Slides'ta açın; tahtadaki her kareye ve 'Back to board' düğmesine tıklayıp deneyin.";
  if (kind === "resume") return "Satıştan önce belgeyi Word'de ve Google Docs'ta açın; sayfaların taşmadığını ve yazıların düzenlenebildiğini kontrol edin.";
  if (kind === "spreadsheet") return "Satıştan önce tabloyu Excel'de ve Google Sheets'te açın; birkaç sayı girip formüllerin doğru hesapladığını kontrol edin.";
  if (kind === "wallpaper" || kind === "app_icons") return "Satıştan önce bir telefona kurup kesilme ve bulanıklık olmadığını kontrol edin.";
  if (kind === "digital_planner") return "Satıştan önce tablette açıp sekme ve sayfa bağlantılarına dokunarak deneyin.";
  return "Satıştan önce her formattan bir sayfayı %100 ölçekte yazdırıp kenar boşluklarını kontrol edin.";
}

function DigitalUploadForm({ visible, suspended = false, prefill, onClose, onSaved }: any) {
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
  const [ownPattern, setOwnPattern] = useState(false);
  const [files, setFiles] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  // Closing is a pause, not a new upload. Compare content, not parent object identity.
  const uploadSeed = JSON.stringify(prefill ?? null);
  const initializedSeed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!visible || initializedSeed.current === uploadSeed) return;
    initializedSeed.current = uploadSeed;
    setName(prefill?.name || "");
    setCraft(prefill?.craft || "crochet");
    // Boş açılan form dijital ürünle başlar; el işi deseni yalnız desen stüdyosundan (craft ile) gelir.
    const startKind = prefill?.kind || (prefill?.craft ? "pattern" : "planner");
    setKind(startKind);
    setProductType(prefill?.productType || "");
    setTitle(prefill?.listing?.title || "");
    setTags((prefill?.listing?.tags || []).join(", "));
    setDescription(prefill?.listing?.description || "");
    setMaterials(prefill?.listing?.materials || []);
    const prices = uploadPrices(prefill);
    setPriceUsd(prices.usd);
    setPriceTry(prices.try);
    // Desende varsayılan: kendi deseni, gerçek fotoğraf, yapay zekâ yok (Etsy başka türlüsünü kabul etmiyor).
    const pattern = startKind === "pattern";
    setOwnPattern(Boolean(prefill?.ownPattern));
    setPhotosAreRenders(!pattern);
    setAiAssisted(!pattern);
    setTestMade(false);
    setFiles([]);
    setImages([]);
  }, [visible, uploadSeed]);
  // Ürün tipi değişince onaylar o tipin güvenli varsayılanına döner (desende yapay zekâ ve render yok).
  useEffect(() => {
    if (!visible) return;
    setPhotosAreRenders(kind !== "pattern");
    setAiAssisted(kind !== "pattern");
  }, [kind]);
  // Etsy dijital ilana en fazla 5 dosya alır: her format ayrı PDF, fazlası tek ZIP.
  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "application/zip", "application/x-zip-compressed"], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const tooBig = result.assets.filter((asset) => asset.size && asset.size > 20 * 1024 * 1024);
    if (tooBig.length) Alert.alert("Dosya çok büyük", `${tooBig.map((asset) => asset.name).join(", ")}: Etsy dosya başına en fazla 20 MB kabul eder.`);
    const merged = [...files, ...result.assets.filter((asset) => !tooBig.includes(asset))].filter((asset, index, all) => all.findIndex((other) => other.name === asset.name) === index);
    if (merged.length > 5) Alert.alert("En fazla 5 dosya", "Etsy bir dijital ilana en fazla 5 dosya kabul eder. Fazla formatları (ör. Half Letter ve siyah-beyaz) tek bir ZIP dosyasında birleştirin.");
    setFiles(merged.slice(0, 5));
  };
  // Görseller iki yoldan seçilir: galeriden ya da dosyalardan (indirilenler/Drive). Seçilenler eskilerin üstüne eklenir,
  // dosya adına göre doğal sırayla dizilir (1.jpg, 2.jpg … 10.jpg; listing-01 … listing-10) ve en fazla 10 tane tutulur.
  const naturalName = (image: any) => String(image.fileName || image.name || "");
  const mergeImages = (added: any[]) => {
    const all = [...images, ...added].filter((image, index, list) => list.findIndex((other) => (naturalName(other) && naturalName(other) === naturalName(image)) || other.uri === image.uri) === index);
    all.sort((a, b) => naturalName(a).localeCompare(naturalName(b), undefined, { numeric: true, sensitivity: "base" }));
    if (all.length > 10) Alert.alert("En fazla 10 görsel", `Etsy bir ilana 10 görsel alır; ilk 10 tanesi (isim sırasıyla) tutuldu, ${all.length - 10} görsel çıkarıldı.`);
    setImages(all.slice(0, 10));
  };
  const pickImagesFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.85 });
    if (!result.canceled) mergeImages(result.assets);
  };
  const pickImagesFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png"], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const tooBig = result.assets.filter((asset) => asset.size && asset.size > 8 * 1024 * 1024);
    if (tooBig.length) Alert.alert("Görsel çok büyük", `${tooBig.map((asset) => asset.name).join(", ")}: görsel başına en fazla 8 MB.`);
    mergeImages(result.assets.filter((asset) => !tooBig.includes(asset)).map((asset) => ({ uri: asset.uri, fileName: asset.name, mimeType: asset.mimeType || (/\.png$/i.test(asset.name) ? "image/png" : "image/jpeg") })));
  };
  const pickImages = pickImagesFromGallery;
  const save = () => {
    if (!name.trim() || !productType.trim() || !title.trim() || !description.trim()) return Alert.alert("Eksik bilgi", "Ürün adı, ürün türü, başlık ve açıklama gerekli. Önce Stüdyo'da ilanı hazırlayın.");
    if (prefill?.handoffName && !sameProduct(prefill.handoff || { name: prefill.handoffName, kind: prefill.kind, productType: prefill.productType }, { name, kind, productType })) return Alert.alert("Ürün kaydı değişti", "Ürün adı ve türü üretim kaydıyla aynı olmalı. Stüdyo’dan yeni paket hazırlayın.");
    if (!files.length) return Alert.alert("Dosya seçin", "Satılacak dosyaları seçin: PDF veya ZIP (duvar kâğıdı, ikon paketi, tablo, sunum oyunu ve özgeçmiş ZIP içinde gelir); en fazla 5.");
    if (!images.length) return Alert.alert("Görsel seçin", "Ürünün gerçek sayfalarını gösteren en az bir ilan görseli ekleyin.");
    if (!testMade) return Alert.alert("Son kontrol gerekli", testWarning(kind));
    const cleanTags = tags.split(",").map(tag => tag.trim()).filter(Boolean);
    if (title.trim().length > 140 || cleanTags.length !== 13 || cleanTags.some(tag => tag.length > 20) || new Set(cleanTags.map(tag => tag.toLowerCase())).size !== 13) return Alert.alert("İlan bilgileri", "Başlık en fazla 140 karakter, etiketler 13 farklı ifade ve her biri en fazla 20 karakter olmalı.");
    const validPrice = (value: string) => { const amount = Number(value.replace(",", ".")); return Number.isFinite(amount) && amount > 0; };
    if (!validPrice(priceUsd) && !validPrice(priceTry)) return Alert.alert("Fiyat", "Pozitif bir USD veya TL fiyatı girin.");
    if (kind === "pattern" && (!ownPattern || !testMade || photosAreRenders || aiAssisted)) return Alert.alert("Etsy kuralı", "Etsy yapay zekâyla yazılmış deseni yasakladı. Desen yalnız sizin veya mağaza üyenizin yazdığı, bizzat yapıp denediği ve bitmiş ürününün gerçek fotoğrafıyla yüklenebilir.");
    if (prefill?.handoffName && !testMade) return Alert.alert("Son kontrol", "Modelin QA sonuçlarını ve dosyaları kontrol edip test edildi onayını işaretleyin.");
    if (prefill?.handoffName && (tags.split(",").filter(tag => tag.trim()).length !== 13 || tags.split(",").some(tag => tag.trim().length > 20))) return Alert.alert("Etiketleri kontrol edin", "Tam 13 etiket olmalı; her biri en fazla 20 karakter.");
    if (!images.length) return Alert.alert("Görsel ekleyin", kind === "pattern" ? "Bitmiş ürünün en az bir gerçek, düzenlenmemiş fotoğrafını ekleyin." : "En az bir görsel ekleyin; biri PDF sayfalarının düzenlenmemiş önizlemesi olsun (talimattaki C4).");
    Alert.alert("Dosyalar güvenli depoya yüklensin mi?", "Dosyalar herkese açık değildir. Müşteri yalnızca Etsy'de ödeme yaptıktan sonra Etsy üzerinden veya sizin oluşturduğunuz kişiye özel bağlantıyla indirebilir.", [
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
            flags: { testMade, photosAreRenders, aiAssisted, ...(kind === "pattern" ? { ownPattern } : {}) },
            listing: { title: title.trim(), description: description.trim(), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), materials },
            pins: prefill?.pins || [],
            handoffName: prefill?.handoffName,
            handoffId: prefill?.handoff?.id,
            assistant: prefill?.assistant,
            research: prefill?.research ? { keyword: prefill.research.keyword, scannedAt: prefill.research.scannedAt, sampleSize: prefill.research.sampleSize } : undefined
          }));
          const parts: { files: string[]; images: string[] } = { files: [], images: [] };
          const stage = async (asset: any, role: "file" | "image", index: number) => {
            const part = new FormData();
            part.append("confirm", "true"); part.append("role", role);
            const zip = /\.zip$/i.test(asset.name || "") || /zip/.test(asset.mimeType || "");
            await appendLocalFile(part, "asset", asset, asset.name || asset.fileName || `${role}-${index + 1}.${role === "image" ? "jpg" : zip ? "zip" : "pdf"}`, asset.mimeType || (role === "image" ? "image/jpeg" : zip ? "application/zip" : "application/pdf"));
            const result = await apiJson("/api/digital/upload-part", { method: "POST", headers: apiHeaders(), body: part });
            if (!result.id) throw new Error("Dosya yüklemesi doğrulanamadı.");
            return result.id as string;
          };
          for (const [index, file] of files.entries()) parts.files.push(await stage(file, "file", index));
          for (const [index, image] of images.entries()) parts.images.push(await stage(image, "image", index));
          form.append("parts", JSON.stringify(parts));
          const response = await fetch(`${API_URL}/api/digital/products`, { method: "POST", headers: apiHeaders(), body: form });
          const body = await response.json().catch(() => ({})) as any;
          if (!response.ok) throw new Error(body.error || "Yükleme tamamlanamadı.");
          initializedSeed.current = undefined;
          onSaved(body.product);
        } catch (error) { Alert.alert("Yüklenemedi", errorText(error)); }
        finally { setSaving(false); }
      } }
    ]);
  };
  const uploadGuideInput: ListingProgressInput = { phase: "upload", files: files.length, images: images.length, tested: testMade, title, description, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean), priceUsd, priceTry };
  const uploadReady = listingProgress(uploadGuideInput).title === "Kaydetmeye hazır";
  return <Modal visible={visible && !suspended} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><StatusBar barStyle="dark-content" /><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={styles.sectionTitle}>Dijital ürün yükle</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color="#315B4C" /></Pressable></View>
      <ListingGuide input={uploadGuideInput}
        actionLabel={!files.length ? "Goxi ile ürün dosyalarını seç" : !images.length ? "Goxi ile ilan görsellerini seç" : uploadReady ? "Goxi ile dosyaları güvenli depoya yükle" : undefined}
        onAction={!files.length ? pickFiles : !images.length ? pickImages : uploadReady ? save : undefined} disabled={saving} />
      {prefill && <Text style={styles.formHint}>1. Aynı ürünü ChatGPT veya Claude'da tamamlayın. 2. Dosyaları ve ilan görsellerini telefonunuza indirin. Toplu indirme ZIP'ini önce çıkarın. 3. Aşağıdan yalnız bu ürüne ait PDF/ZIP dosyalarını ve görselleri seçin. Başlık, açıklama, etiketler ve önerilen fiyat ürün kaydından gelir.</Text>}
      {!prefill && <Text style={styles.warningText}>Bu form Stüdyo'dan dolu gelir. Önce Etsy → Stüdyo'da ürünü hazırlayın; yapay zekâ dosyaları ve görselleri verince Stüdyo'daki 'Dosyalar hazırsa yükle'ye basın. Başlık, etiket, açıklama ve fiyat kendiliğinden dolar.</Text>}
      <Pressable style={styles.uploadRow} onPress={pickFiles}><Ionicons name="document-text-outline" size={22} color="#315B4C" /><Text style={[styles.rowTitle, { flex: 1 }]}>{files.length ? `${files.length}/5 dosya seçildi · eklemek için dokunun` : "Dosyaları seç: PDF veya ZIP (birden çok seçilebilir, en fazla 5)"}</Text></Pressable>
      {files.map((file) => <View key={file.name} style={styles.fileRow}><Ionicons name={/\.zip$/i.test(file.name || "") ? "archive-outline" : "document-outline"} size={18} color="#56615C" /><Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>{file.name} · {Math.round((file.size || 0) / 1024)} KB</Text><Pressable onPress={() => setFiles(files.filter((item) => item.name !== file.name))}><Ionicons name="close-circle-outline" size={20} color="#B4483A" /></Pressable></View>)}
      {!!files.length && <Text style={styles.formHint}>Hepsi tek seferde Etsy ilanına eklenir. Etsy en fazla 5 dosya alır; fazla formatları tek bir ZIP'te birleştirin.</Text>}
      <Pressable style={styles.uploadRow} onPress={pickImages}><Ionicons name="images-outline" size={22} color="#315B4C" /><Text style={[styles.rowTitle, { flex: 1 }]}>{images.length ? `${images.length} görsel seçildi` : kind === "pattern" ? "Bitmiş ürünün gerçek fotoğrafları (en fazla 10; ilki düzenlenmemiş)" : "İlan görselleri (en fazla 10; biri sayfaların önizlemesi)"}</Text></Pressable>
      {!!images.length && <ScrollView horizontal style={{ marginBottom: 4 }}>{images.map((image, index) => <View key={image.uri}><Image source={{ uri: image.uri }} style={styles.thumb} /><Text style={styles.small}>{index + 1}. {naturalName(image).slice(0, 14)}</Text></View>)}</ScrollView>}
      <Pressable onPress={pickImagesFromFiles} style={{ marginBottom: 6 }}><Text style={styles.linkNote}>Dosyalardan seç (İndirilenler/Drive; adlarına göre 1, 2 … 10 sıralanır) →</Text></Pressable>
      {!!images.length && <Pressable onPress={() => setImages([])} style={{ marginBottom: 12 }}><Text style={styles.linkNote}>{images.length}/10 görsel · hepsini temizle</Text></Pressable>}
      <Field label="Ürün adı" value={name} onChangeText={setName} editable={!prefill?.handoffName} />
      <Text style={styles.fieldLabel}>Ürün tipi</Text>
      {prefill?.handoffName ? <Text style={styles.formHint}>{PRINTABLE_KIND_OPTIONS.find(item => item.id === kind)?.label || kind} · Ürün türünü değiştirmek için Stüdyo’dan yeniden hazırlayın.</Text> : <ChipGroup options={[...PRINTABLE_KIND_OPTIONS, { id: "pattern", label: "El işi deseni (kendi deseniniz)" }]} value={kind} onChange={setKind} />}
      {kind === "pattern" && <><Text style={styles.fieldLabel}>El işi türü</Text><ChipGroup options={CRAFT_OPTIONS} value={craft} onChange={setCraft} /></>}
      <Field label="Ürün türü (İngilizce)" value={productType} onChangeText={setProductType} editable={!prefill?.handoffName} autoCapitalize="none" />
      <Field label="Etsy fiyatı (USD)" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" placeholder="6.50" />
      <Field label="Etsy fiyatı (TL; boş kalırsa USD fiyat güncel kurla TL'ye çevrilir)" value={priceTry} onChangeText={setPriceTry} keyboardType="decimal-pad" placeholder="249" />
      <Field label={`Başlık (${title.length}/140)`} value={title} onChangeText={setTitle} multiline />
      <Field label="Etiketler (virgülle, 13 adet, her biri en fazla 20 karakter)" value={tags} onChangeText={setTags} multiline autoCapitalize="none" />
      <Field label="Açıklama" value={description} onChangeText={setDescription} multiline style={[styles.input, { minHeight: 160, textAlignVertical: "top" }]} />
      <View style={styles.card}>
        {kind === "pattern" && <Toggle label="Deseni ben veya mağaza üyem yazdı (yapay zekâ yazmadı)" value={ownPattern} onChange={setOwnPattern} />}
        <Toggle label={kind === "pattern" ? "Desen bizzat örülerek / yapılarak test edildi" : testLabel(kind)} value={testMade} onChange={setTestMade} />
        {kind === "pattern"
          ? <Toggle label="Fotoğraflar bitmiş ürünün gerçek fotoğrafı" value={!photosAreRenders} onChange={(value: boolean) => setPhotosAreRenders(!value)} />
          : <Toggle label="Görsellerin bir kısmı mockup (sayfalar gerçek)" value={photosAreRenders} onChange={setPhotosAreRenders} />}
        {kind !== "pattern" && <Toggle label="Ürün hazırlanırken yapay zekâ kullanıldı" value={aiAssisted} onChange={setAiAssisted} />}
      </View>
      {kind === "pattern" && <Text style={styles.warningText}>Etsy kuralı: yapay zekâyla yazılmış desen satılamaz. Yalnız kendi yazdığınız, bizzat yapıp denediğiniz ve bitmiş ürününün gerçek fotoğrafı olan deseni yükleyin.</Text>}
      {!testMade && kind !== "pattern" && <Text style={styles.warningText}>{testWarning(kind)}</Text>}
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
      await Share.share({ message: `Merhaba, ${product.name} dosyalarınız hazır: ${grant.url}\nBu bağlantı size özeldir; ${grant.maxDownloads} kez indirilebilir ve ${new Date(grant.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar geçerlidir. İyi örgüler!` });
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

function DigitalPanel({ online, active = true, shopReady, prefill, onPrefillUsed, onPrepare }: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [grantProduct, setGrantProduct] = useState<any>();
  const [details, setDetails] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string>();
  const [fileQa, setFileQa] = useState<Record<string, any>>({});
  // Başarısız ya da vazgeçilen ürün kafa karıştırmasın: uygulamadan silinir; Etsy'deki taslağa dokunulmaz.
  const removeProduct = (product: any) => Alert.alert("Ürün uygulamadan silinsin mi?", `${product.name}: dosyaları ve kaydı uygulamadan silinir.${product.etsy?.listingId ? " Etsy'deki taslak veya ilan silinmez; onu Etsy'de Listings bölümünden siz silersiniz." : ""}`, [
    { text: "Vazgeç", style: "cancel" },
    { text: "Sil", style: "destructive", onPress: async () => {
      setBusy(product.id);
      try { await apiJson(`/api/digital/products/${product.id}/delete`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) }); setProducts((current) => current.filter((item) => item.id !== product.id)); }
      catch (error) { Alert.alert("Silinemedi", errorText(error)); }
      finally { setBusy(undefined); }
    } }
  ]);
  const auditFiles = async (product: any) => {
    setBusy(product.id);
    try { const report = await apiJson(`/api/digital/products/${product.id}/qa`, { headers: apiHeaders() }); setFileQa(current => ({ ...current, [product.id]: report })); }
    catch (error: any) {
      // Denetim sunucuda yarıda kaldıysa satıcı takılı kalmaz: dosyalar yüklemede zaten denetlendi, taslağa devam edilebilir.
      if (!error?.code) setFileQa(current => ({ ...current, [product.id]: { ok: false, unavailable: true, files: [], missingFormats: [], noteTr: "Dosya denetimi bu kez sunucuda tamamlanamadı. Dosyalar yüklenirken format ve yapı denetiminden geçti; Etsy taslağına devam edebilirsiniz. Etsy'de taslağı açıp dosyanın ekli olduğunu kontrol edin." } }));
      Alert.alert("Dosya denetimi alınamadı", `${errorText(error)}${!error?.code ? "\n\nEtsy taslağına yine de devam edebilirsiniz." : ""}`);
    }
    finally { setBusy(undefined); }
  };
  const [publication, setPublication] = useState<Record<string, { state: string; checkedAt: string; url: string }>>({});
  const transferComplete = (product: any) => etsyTransferComplete({ phase: "saved", files: product.files?.length || (product.fileName ? 1 : 0), images: product.images?.length || 0, etsy: product.etsy });
  const verifyPublication = async (product: any) => {
    setBusy(product.id);
    try { const status = await apiJson(`/api/digital/products/${product.id}/etsy-status`, { headers: apiHeaders() }); setPublication(current => ({ ...current, [product.id]: status })); await syncTrackedProduct(product,status).catch(()=>Alert.alert("Yayın durumu alındı", "Telefon takip kaydı güncellenemedi. Uygulamayı kapatmadan depolama sorununu giderip tekrar denetleyin.")); }
    catch (error) { setPublication(current => { const next = { ...current }; delete next[product.id]; return next; }); await syncTrackedProduct(product,undefined,true).catch(()=>undefined); Alert.alert("Yayın durumu doğrulanamadı", errorText(error)); }
    finally { setBusy(undefined); }
  };
  const load = async () => {
    setLoading(true);
    try { const next=(await apiJson("/api/digital/products", { headers: apiHeaders() })).products || [];setProducts(next);await syncTrackedProducts(next).catch(()=>Alert.alert("Ürünler alındı", "Telefon takip kaydı güncellenemedi. Ürünler sunucuda duruyor; depolamayı kontrol edin.")); }
    catch (error) { Alert.alert("Dijital ürünler alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online && active) load(); }, [online, active]);
  useEffect(() => { if (prefill) setFormVisible(true); }, [prefill]);
  const loadDetail = async (id: string) => {
    try { const detail = await apiJson(`/api/digital/products/${id}`, { headers: apiHeaders() }); setDetails((current) => ({ ...current, [id]: detail })); }
    catch (error) { Alert.alert("Bağlantılar alınamadı", errorText(error)); }
  };
  const etsyDraft = (product: any) => {
    if (publication[product.id]?.state === "active") return openUrl(publication[product.id].url, "Etsy ilanı");
    if (!product.images?.length) return product.etsy?.listingId ? openUrl(product.etsy.editUrl, "Etsy ilan görselleri") : Alert.alert("İlan görseli eksik", "Önce Stüdyo’dan son dosyalarla birlikte en az bir ilan görseli yükleyin.");
    if (transferComplete(product)) return openUrl(product.etsy.editUrl, "Etsy taslak ilanı");
    if (!shopReady) return Alert.alert("Etsy mağazası hazır değil", "Mağaza açılıp uygulamada Etsy bağlantısı 'Bağlı' görünene kadar taslak oluşturulamaz.");
    Alert.alert("Etsy'de taslak ilan oluşturulsun mu?", "Başlık, açıklama, etiketler, görseller ve dosyalar Etsy'ye taslak olarak gönderilir. İlan yayına girmez; kontrol edip Etsy'de siz yayınlarsınız. Yayınlarken Etsy ilan ücreti alır.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Taslak oluştur", onPress: async () => {
        setBusy(product.id);
        try {
          const result = await apiJson(`/api/digital/products/${product.id}/etsy-draft`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) });
          await load();
          Alert.alert("Etsy taslağı hazır", `Taslağı açıp açıklamadaki yapay zekâ beyanını, kategoriyi ve fiyatı kontrol ettikten sonra yayınlayın.${result.pinsQueued ? `\n\nPinterest: ${result.pinsQueued} pin planlandı; ilan yayına girince satış linkiyle otomatik atılacak.` : ""}`, [{ text: "Taslağı aç", onPress: () => openUrl(result.editUrl, "Etsy taslak ilanı") }, { text: "Tamam" }]);
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
    <View style={styles.guardrail}><Ionicons name="lock-closed-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Dosyalar herkese açık değildir. Etsy'de dosyayı Etsy yalnızca ödeme yapan alıcıya verir. Shopier ve doğrudan satışlarda her sipariş için sınırlı indirmeli, süreli ve kapatılabilir özel bağlantı oluşturulur.</Text></View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Dijital ürünler</Text><Pressable style={[styles.addButton, !online && styles.primaryDisabled]} disabled={!online} onPress={() => setFormVisible(true)}><Ionicons name="add" size={18} color="white" /><Text style={styles.addButtonText}>Dosya yükle</Text></Pressable></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {!loading && !products.length && <ListingMascot title="Önce ilan paketini hazırlayalım" instruction="Stüdyo’da ürününü seçip ilanı hazırla. ChatGPT/Claude’dan son dosyaları telefonuna indirdikten sonra Stüdyo’daki aynı çalışmada ‘Dosyalarım hazır, yüklemeye geç’e bas; ilan bilgileri birlikte gelir." actionLabel="Stüdyo’da ürün hazırlamaya geç" onAction={onPrepare} />}
    {!loading && !products.length && <Empty icon="document-text-outline" title="Henüz dijital ürün yok" text="Stüdyo'da ilanı hazırlayın; yapay zekânın verdiği dosyaları ve ilan görsellerini buradan yükleyin." />}
    {products.map((product) => <View style={styles.card} key={product.id}>
      <View style={styles.shopierProductTop}>
        {product.images?.[0] ? <Image source={{ uri: product.images[0].url }} style={styles.productImagePhoto} /> : <View style={styles.productImage}><Ionicons name="document-text" size={26} color="#C88B47" /></View>}
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{product.name}</Text><Text style={styles.small}>{product.files?.length > 1 ? `${product.files.length} dosya · ${Math.round(product.files.reduce((sum: number, file: any) => sum + file.size, 0) / 1024)} KB` : `${product.fileName} · ${Math.round(product.fileSize / 1024)} KB`} · {product.images?.length || 0} görsel</Text><Text style={styles.price}>{[product.prices?.usd ? `${product.prices.usd} USD` : "", product.prices?.try ? `${product.prices.try} TL` : ""].filter(Boolean).join(" · ")}</Text></View>
      </View>
      <Text style={styles.small} numberOfLines={2}>{product.listing?.title}</Text>
      <ListingGuide input={{ phase: "saved", files: product.files?.length || (product.fileName ? 1 : 0), images: product.images?.length || 0, etsy: product.etsy, verifiedState: publication[product.id]?.state, qaOk: fileQa[product.id]?.ok }}
        actionLabel={fileQa[product.id]?.ok !== true && !fileQa[product.id]?.unavailable ? "Goxi ile dosyaları denetle" : transferComplete(product) ? "Goxi ile Etsy durumunu doğrula" : product.etsy?.listingId ? "Goxi ile Etsy yüklemesini tamamla" : "Goxi ile Etsy taslağını oluştur"}
        onAction={() => fileQa[product.id]?.ok !== true && !fileQa[product.id]?.unavailable ? auditFiles(product) : transferComplete(product) ? verifyPublication(product) : etsyDraft(product)} disabled={!online || busy === product.id} />
      {publication[product.id] && <Text style={styles.small}>Etsy durumu: {publication[product.id].state === "active" ? "Yayında" : publication[product.id].state === "draft" ? "Taslak" : "Yayında değil"} · {new Date(publication[product.id].checkedAt).toLocaleString("tr-TR")}</Text>}
      {/* "Denendi" yalnız desen için anlamlıdır (Etsy kuralı); hazır dijital üründe uyarı gösterilmez. */}
      {fileQa[product.id] && <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>{fileQa[product.id].ok ? "Dosya yapısı kontrolleri geçti" : fileQa[product.id].unavailable ? "Dosya denetimi tamamlanamadı" : "Dosya denetimi: düzeltme gerekli"}</Text>
        {fileQa[product.id].files.map((row: any) => <Text key={row.name} style={row.ok ? styles.small : styles.warningText}>{row.name}: {row.ok ? `${row.entries} içerik, ${row.checks} yapısal kontrol` : row.error}</Text>)}
        {!!fileQa[product.id].missingFormats.length && <Text style={styles.warningText}>Eksik formatlar: {fileQa[product.id].missingFormats.join(", ")}</Text>}
        <Text style={styles.evidence}>{fileQa[product.id].noteTr}</Text>
      </View>}
      {!!product.craft && !product.flags?.testMade && <Text style={styles.warningText}>• Desen denenmedi</Text>}
      {!!product.etsy?.error && <Text style={styles.warningText}>• Etsy: {product.etsy.error}</Text>}
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} disabled={busy === product.id || !online} onPress={() => auditFiles(product)}><Text style={styles.secondaryButtonText}>Dosya yapısını denetle</Text></Pressable>
        <Pressable style={[styles.secondaryButton, busy === product.id && styles.primaryDisabled]} disabled={busy === product.id} onPress={() => etsyDraft(product)}><Text style={styles.secondaryButtonText}>{transferComplete(product) ? "Etsy ilanını aç" : product.etsy?.listingId ? "Etsy yüklemesini tamamla" : "Etsy taslağı oluştur"}</Text></Pressable>
        {!!product.etsy?.listingId && <Pressable style={[styles.secondaryButton, busy === product.id && styles.primaryDisabled]} disabled={busy === product.id} onPress={() => verifyPublication(product)}><Text style={styles.secondaryButtonText}>Yayın durumunu denetle</Text></Pressable>}
        <Pressable style={styles.secondaryButton} onPress={() => setGrantProduct(product)}><Text style={styles.secondaryButtonText}>Satış bağlantısı</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => loadDetail(product.id)}><Text style={styles.secondaryButtonText}>Bağlantılar</Text></Pressable>
        {!!product.etsy?.listingId && <EtsyVideoUpload listingId={product.etsy.listingId} />}
        <Pressable style={styles.secondaryButton} disabled={busy === product.id} onPress={() => removeProduct(product)}><Text style={[styles.secondaryButtonText, { color: "#B4483A" }]}>Uygulamadan sil</Text></Pressable>
      </View>
      {(details[product.id]?.grants || []).map((grant: any) => <View style={styles.grantRow} key={grant.id}>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{grant.orderRef} · {grant.channel}</Text><Text style={styles.small}>{grant.revoked ? "Kapatıldı" : `${grant.downloads}/${grant.maxDownloads} indirme · ${new Date(grant.expiresAt).toLocaleDateString("tr-TR")} tarihine kadar`}</Text></View>
        {!grant.revoked && <Pressable onPress={() => Share.share({ message: grant.url })}><Ionicons name="share-outline" size={20} color="#315B4C" /></Pressable>}
        {!grant.revoked && <Pressable onPress={() => revoke(grant, product.id)}><Ionicons name="close-circle-outline" size={21} color="#A84A3A" /></Pressable>}
      </View>)}
    </View>)}
    <DigitalUploadForm visible={formVisible} suspended={!active} prefill={prefill} onClose={() => { setFormVisible(false); }} onSaved={async (product:any) => { await syncTrackedProduct(product).catch(()=>Alert.alert("Ürün yüklendi", "Ürün sunucuda kayıtlı, ancak telefon takip kaydı güncellenemedi. Aynı dosyaları tekrar yüklemeyin; Dijital bölümünden mevcut ürüne devam edin."));setFormVisible(false); onPrefillUsed(); await load(); Alert.alert("Yüklendi", "PDF güvenli depoya alındı. Etsy mağazası hazırsa 'Etsy taslağı oluştur' ile ilana dönüştürebilirsiniz."); }} />
    <GrantForm product={grantProduct} onClose={async (created: boolean) => { const id = grantProduct?.id; setGrantProduct(undefined); if (created && id) await loadDetail(id); }} />
  </>;
}

const PIN_STATUS: Record<string, string> = { scheduled: "Zamanlandı", waiting_listing: "Etsy'de yayına girmesi bekleniyor", posted: "Pinlendi", failed: "Hata" };

// Pinterest: Etsy ilanı yayına girince ilanın görseli ve satış linkiyle otomatik pin atılır.
function PinterestPanel({ online }: any) {
  const [status, setStatus] = useState<any>();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [listingUrl, setListingUrl] = useState("");
  const [customLink, setCustomLink] = useState("");
  const [busy, setBusy] = useState<string>();
  const [manual, setManual] = useState<any[]>([]);
  const load = async () => {
    setLoading(true);
    try {
      const [nextStatus, queue, shares] = await Promise.all([apiJson("/api/pinterest/status", { headers: apiHeaders() }), apiJson("/api/pinterest/queue", { headers: apiHeaders() }), apiJson("/api/pinterest/manual", { headers: apiHeaders() }).catch(() => ({ items: [] }))]);
      setStatus(nextStatus);
      setJobs(queue.jobs || []);
      setManual(shares.items || []);
    } catch (error) { Alert.alert("Pinterest durumu alınamadı", errorText(error)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const connect = async () => {
    try {
      const session = await apiJson("/api/pinterest/connect-session", { method: "POST", headers: apiHeaders(true), body: "{}" });
      await openUrl(session.authorizationUrl, "Pinterest bağlantısı");
    } catch (error) { Alert.alert("Bağlantı başlatılamadı", errorText(error)); }
  };
  const toggleAuto = async (value: boolean) => {
    try {
      const result = await apiJson("/api/pinterest/settings", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ auto: value }) });
      setStatus((current: any) => ({ ...current, settings: result.settings }));
    } catch (error) { Alert.alert("Ayar kaydedilemedi", errorText(error)); }
  };
  const queueListing = async () => {
    if (!listingUrl.trim()) return Alert.alert("Etsy ilanı", "Etsy ilan linkini veya ilan numarasını girin.");
    setBusy("queue");
    try {
      const result = await apiJson("/api/pinterest/queue", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, listingUrl: listingUrl.trim(), link: customLink.trim() || undefined }) });
      Alert.alert(result.alreadyQueued ? "Zaten planlı" : "Pinler planlandı", result.alreadyQueued ? "Bu ilan için pinler zaten sırada." : "3 pin 0., 2. ve 5. günlerde atılacak. İlan Etsy'de yayında değilse yayına girmesi beklenir.");
      setListingUrl("");
      setCustomLink("");
      await load();
    } catch (error) { Alert.alert("Planlanamadı", errorText(error)); }
    finally { setBusy(undefined); }
  };
  const runNow = async (job: any) => {
    if (job.status === "posted" || !online || !status?.configured || !status?.connected) return;
    setBusy(job.id);
    try {
      const result = await apiJson(`/api/pinterest/queue/${job.id}/run`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) });
      if (result.skipped) Alert.alert("Gönderilemedi", result.skipped === "not_connected" ? "Önce Pinterest hesabını bağlayın." : "Pinterest veya Etsy anahtarları sunucuda eksik.");
      else Alert.alert(result.status === "posted" ? "Pinlendi" : PIN_STATUS[result.status] || "Durum", result.status === "posted" ? "Pin satış linkiyle oluşturuldu." : result.error || "");
      await load();
    } catch (error) { Alert.alert("Gönderilemedi", errorText(error)); }
    finally { setBusy(undefined); }
  };
  // API onayı olmadan: Pinterest'in pin oluşturma sayfası görsel, link ve açıklamayla açılır; pano seçilip "Kaydet"e basılır.
  const markShared = async (item: any) => {
    setBusy(`shared-${item.jobId}`);
    try {
      await apiJson(`/api/pinterest/queue/${item.jobId}/shared`, { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true }) });
      await load();
    } catch (error) { Alert.alert("Kaydedilemedi", errorText(error)); }
    finally { setBusy(undefined); }
  };
  const dateText = (value: string) => new Date(value).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return <>
    <View style={styles.guardrail}><Ionicons name="logo-pinterest" size={20} color="#B5333D" /><Text style={[styles.guardrailText, { flex: 1 }]}>Otomatik paylaşım açıkken Etsy taslakları için pinler planlanır. Otomatik gönderim için Pinterest bağlantısı ve gerekli API erişimi gerekir. Bağlantı yoksa aşağıdaki elle paylaşım yolunu kullanın.</Text></View>
    {loading && <ActivityIndicator color="#C88B47" />}
    {status && !status.configured && <Text style={styles.shopierBlocker}>Pinterest uygulama anahtarları (PINTEREST_APP_ID ve PINTEREST_APP_SECRET) sunucuya eklenmedi. Adımlar: Kılavuz → Pinterest.</Text>}
    {status && <View style={styles.card}>
      <View style={styles.shopierProductTop}>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Pinterest hesabı</Text><Text style={styles.small}>{status.connected ? `Bağlı${status.username ? ` · @${status.username}` : ""}` : "Bağlı değil"}</Text></View>
        <Pressable style={[styles.secondaryButton, !status.configured && styles.primaryDisabled]} disabled={!status.configured || !online} onPress={connect}><Text style={styles.secondaryButtonText}>{status.connected ? "Yeniden bağla" : "Bağla"}</Text></Pressable>
      </View>
      <Toggle label="Etsy taslağı oluşan her ürünü otomatik pinle (satış linkiyle)" value={status.settings?.auto !== false} onChange={toggleAuto} />
      <Text style={styles.small}>Zamanlandı {status.queue?.scheduled || 0} · Yayın bekleniyor {status.queue?.waiting || 0} · Paylaşıldı / işaretlendi {status.queue?.posted || 0} · Hata {status.queue?.failed || 0}</Text>
      <Text style={styles.warningText}>{status.note}</Text>
      {(!status.configured || !status.connected) && <Text style={styles.warningText}>Otomatik gönderim şu an kullanılamıyor. Kayıtlı tercih açık olsa da bağlantı tamamlanmadan pin gönderilmez.</Text>}
    </View>}
    <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Elle paylaş (API onayı gerekmez)</Text>
      <Text style={styles.small}>Pinterest otomatik pin onayını verene kadar pinleri buradan paylaşın. "Pinterest'te paylaş" dokunuşu pini görseli, satış linki ve açıklamasıyla hazır açar; panoyu seçip "Kaydet"e basın, sonra burada "Paylaştım" deyin. Zamanı gelenler üstte; günde 1-2 pin yeter.</Text>
      {!manual.length && <Text style={styles.evidence}>Paylaşılacak pin yok. Etsy'de yayına giren ürünlerin pinleri burada görünür.</Text>}
      {manual.map((item) => <View style={styles.visualRow} key={item.jobId}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title || `Etsy ilanı #${item.listingId}`}</Text>
        <Text style={styles.small}>Pin {item.pinIndex + 1}/3 · Pano: {item.boardName} · {item.due ? "Zamanı geldi" : `Önerilen: ${dateText(item.dueAt)}`}</Text>
        {!item.ready && <Text style={styles.warningText}>{item.reason}</Text>}
        {item.ready && item.aiAssisted && <Text style={styles.evidence}>Pinterest yapay zekâ etiketi sorarsa "AI modified" seçin.</Text>}
        {item.ready && <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} onPress={() => openUrl(item.shareUrl, "Pinterest'te paylaş")}><Text style={styles.secondaryButtonText}>Pinterest'te paylaş</Text></Pressable>
          <Pressable style={[styles.secondaryButton, busy === `shared-${item.jobId}` && styles.primaryDisabled]} disabled={busy === `shared-${item.jobId}`} onPress={() => markShared(item)}><Text style={styles.secondaryButtonText}>Paylaştım</Text></Pressable>
        </View>}
      </View>)}
    </View>
    <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Mevcut bir Etsy ilanını pinle</Text>
      <Field label="Etsy ilan linki veya numarası" value={listingUrl} onChangeText={setListingUrl} placeholder="https://www.etsy.com/listing/1234567890/..." autoCapitalize="none" />
      <Field label="Farklı satış linki (isteğe bağlı, ör. Shopier)" value={customLink} onChangeText={setCustomLink} placeholder="Boşsa Etsy ilan linki kullanılır" autoCapitalize="none" />
      <Pressable style={[styles.analyzeButton, (busy === "queue" || !online) && styles.primaryDisabled]} disabled={busy === "queue" || !online} onPress={queueListing}>{busy === "queue" ? <ActivityIndicator color="white" /> : <Ionicons name="logo-pinterest" size={18} color="white" />}<Text style={styles.primaryText}>3 pin planla</Text></Pressable>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Pin sırası</Text><Pressable style={styles.secondaryButton} disabled={loading || !online} onPress={load}><Text style={styles.secondaryButtonText}>Yenile</Text></Pressable></View>
    {!loading && !jobs.length && <Empty icon="logo-pinterest" title="Henüz pin yok" text="Stüdyo'da hazırladığınız ürünü Dijital bölümünden Etsy taslağına gönderdiğinizde pinler buraya otomatik eklenir." />}
    {jobs.map((job) => <View style={styles.card} key={job.id}>
      <Text style={styles.cardTitle} numberOfLines={2}>{job.listingTitle || `Etsy ilanı #${job.listingId}`}</Text>
      <Text style={styles.small}>Pin {job.pinIndex + 1}/3 · {job.boardName}{job.link ? " · özel satış linki" : ""}</Text>
      <Text style={[styles.trendVerdict, job.status === "failed" && { color: "#A83232" }]}>{job.manual ? "Paylaştım olarak işaretlendi · Pinterest’ten doğrulanmadı" : PIN_STATUS[job.status] || job.status}{job.status !== "posted" ? ` · ${dateText(job.dueAt)}` : ""}</Text>
      {!!job.pin?.title && <Text style={styles.evidence}>Başlık: {job.pin.title}</Text>}
      {!!job.error && job.status !== "posted" && <Text style={styles.warningText}>{job.error}</Text>}
      <View style={styles.inlineActions}>
        {job.status === "posted"
          ? job.pinUrl ? <Pressable style={styles.secondaryButton} onPress={() => openUrl(job.pinUrl, "Pinterest pini")}><Text style={styles.secondaryButtonText}>Pini aç</Text></Pressable> : <Text style={styles.small}>Bu kayıt tamamlandı; tekrar gönderilmez.</Text>
          : <Pressable style={[styles.secondaryButton, (busy === job.id || !online || !status?.configured || !status?.connected) && styles.primaryDisabled]} disabled={busy === job.id || !online || !status?.configured || !status?.connected} onPress={() => runNow(job)}><Text style={styles.secondaryButtonText}>{busy === job.id ? "Gönderiliyor…" : "Şimdi gönder"}</Text></Pressable>}
        <Pressable style={styles.secondaryButton} onPress={() => openUrl(`https://www.etsy.com/listing/${job.listingId}`, "Etsy ilanı")}><Text style={styles.secondaryButtonText}>Etsy ilanı</Text></Pressable>
      </View>
    </View>)}
  </>;
}

const ETSY_GUIDE: Array<{ id: string; title: string; icon: any; steps: string[] }> = [
  { id: "daily", title: "Her gün 10 dakika", icon: "today-outline", steps: [
    "Uygulama Etsy sekmesiyle açılır. Trend → Dijital ürünler'deki 'İlgi sıralaması'na ve Keşfedilenler'e bakın. Sunucu siz uygulamayı açmasanız da her 30 dakikada bir Etsy'yi tarar.",
    "65 ve üstü puan (Yüksek fırsat) olan aramaları açın. 'Talep zayıf' ve 'Rekabet yoğun' yazanları şimdilik atlayın.",
    "Sezon fırsatları'nda 'Hemen listele' yazan bir dönem varsa önce ona hazırlanın.",
    "Dijital ürün aramasında 'Bu nişte dijital ürün hazırla', desen aramasında 'Bu nişte desen hazırla' düğmesine basın. Elinizdeki fiziksel ürün için Stüdyo → 'Elimdeki ürün (fotoğraf)' bölümünü kullanın; Shopier gerekmez.",
    "Siparişleri ve mesajları Etsy'nin 'Sell on Etsy' uygulamasından takip edin. Mesajlara 24 saat içinde dönmek Star Seller rozetini korur."
  ] },
  { id: "discovery", title: "Otomatik keşif nasıl çalışır?", icon: "sync-circle-outline", steps: [
    "Başlangıç listesi: 58 sabit niş (29 dijital ürün, 17 desen, 6 tesbih, 6 vintage) ve yaklaşan ABD sezonlarının aramaları.",
    "Her taramada Etsy arama örnekleminin etiketleri okunur; son 120 günde açılan ilanlardaki etiketler ayrıca işaretlenir. Bu etiketlerdeki 2+ kelimelik arama ifadeleri 'Keşfedilenler' listesine eklenir. Böylece liste sabit kalıpta kalmaz; araştırılacak yeni adaylarla büyür; gerçek arama hacmi doğrulanmış sayılmaz.",
    "Sunucu her 30 dakikada bir, en uzun süredir taranmamış aramayı tarar (günde 48 tarama). Liste en çok 80 arama tutar; puanı düşenler sona düşer.",
    "Google Trends'in herkese açık bir API'si yoktur. Kartlardaki Google Trends düğmesi ABD eyaletlerini ve 'İlgili sorgular'ı gösterir. Orada gördüğünüz ifadeyi Trend'deki arama kutusuna yazıp taratın; ifade otomatik keşif listesine de girer ve düzenli taranır."
  ] },
  { id: "score", title: "Puanlar ne anlama gelir?", icon: "speedometer-outline", steps: [
    "Puan 0–100 arasıdır: talep (aylık favori) %40, açıklık (rakip ilan sayısı) %25, yeni ilanların başarısı %20, fiyat seviyesi %15.",
    "65+ Yüksek fırsat · 45–64 Denenebilir · 'Talep zayıf' alıcı az demektir · 'Rekabet yoğun' ilan çok demektir.",
    "Etsy satış adedini paylaşmaz. Puan favori ve ilan verisinden yapılan bir tahmindir. Karar vermeden önce kartı açıp rakip ilanlara bakın.",
    "Pahalı fiziksel ürünlerde (gümüş tesbih vb.) favori sayısı doğal olarak düşüktür. Az satış da yüksek kazanç demektir."
  ] },
  { id: "printables", title: "Dijital ürün satışı adım adım (planlayıcı, duvar kâğıdı, ikon paketi…)", icon: "document-attach-outline", steps: [
    "Trend → Dijital ürünler: planlayıcı, dijital planlayıcı, takvim, boyama, duvar sanatı, tarif kartı, tebrik kartı, çıkartma, etiket, bulmaca, parti oyunları, günlük, çocuk etkinlikleri, kâğıt işi, telefon duvar kâğıdı, ikon paketi, bütçe tablosu, sunum oyunu ve özgeçmiş şablonu nişleri puanlanır. 'İlgi sıralaması' alıcı ilgisini çubukla gösterir: talep, ortanca ilan ile öne çıkan çeyreğin aylık favorisinden birlikte hesaplanır. İlgisi yüksek ama puanı düşük nişte rekabet yoğundur; dar bir alt ifadeyle girin.",
    "Bir kartı açıp 'Öne geçmek için ne yapmalı?' önerilerini okuyun, sonra 'Bu nişte dijital ürün hazırla'ya basın.",
    "Stüdyo'yu açtığınızda veya bir ürün türüne bastığınızda sistem o türde en güçlü Etsy aramasını kendisi seçer ve tüm alanları doldurur: ürün, trend özellikleri, renkler (trend rengi yoksa trend stiline uygun palet), formatlar (rakiplerin az sunduğu formatlar eklenir), sayfa sayısı (rakip ortancasının %20 fazlası) ve hedef kitle. 'Başka arama seç' sıradaki güçlü aramayı getirir.",
    "'Rakipleri geçmek için' kartı rakip ortanca fiyatını, önerilen başlangıç ve set fiyatını, format boşluklarını ve geçilecek rakipleri gösterir; önerilen fiyat yükleme formuna otomatik gelir. Siz 'Prompt, görsel ve ilanı hazırla'ya basarsınız.",
    "Stüdyo'da kullanacağınız yapay zekâyı seçin (ChatGPT veya Claude), sonra 'Tek paketi gönder' ile her şeyi bir kez gönderin: dosyalar, sayfa görselleri, 10 reklam görseli ve pin görselleri sıralı adımlarla aynı sohbette yapılır. Her adım bitince aynı sohbete 'devam' yazın. Parçaları ayrı ayrı paylaşmayın; her paylaşım yeni sohbet açar ve yeni sohbet ürün adını, paleti ve sayfa planını bilmez.",
    "Paket Türkçe yazılmıştır: yapay zekâ sizinle Türkçe konuşur ve sizden istediği her işi Türkçe yazar. Ürünü, dosya adlarını, görsellerdeki yazıları ve ilanı ABD'deki alıcı için Amerikan İngilizcesiyle yapar. Takvimde resmî tatil, bütçe tablosunda vergi oranı gibi eyaletten eyalete değişen bilgiler ürüne yazılmaz.",
    "ChatGPT seçiliyse görselleri kendi görsel aracıyla üretir. Claude seçiliyse çizimleri kodla vektör olarak kendisi çizer; fotoğraf gibi sahneler için hazır görsel promptu verir, onu bir görsel aracında çalıştırırsınız.",
    "Dosyalar gelince modelden 'Automated QA' betik çıktısını isteyin: tek satırda FAIL olmamalı (saat AM/PM, kopya sayfa, eksik format, ad, kapak, kenar boşluğu). Uygulama da yüklemede ilanda yazan formatın dosyalarda olmamasını ve aynı dosyanın iki kez yüklenmesini engeller.",
    "Reklam tadında 10 görselin her birinde nerede kullanılacağı (Etsy kapak, galeri, Pinterest, Instagram), ölçüsü ve üstüne yazılacak kısa metin yazar. Yapay zekâ önce yazısız görseli üretir, sonra görsel üstü başlığı kodla kendisi ekler ve yazımı kontrol eder; Canva gerekmez. Fotoğraf gibi sahneleri bir görsel aracında siz ürettiyseniz aynı sohbete yükleyin, başlığı o ekler.",
    "Pinterest pinlerini farklı günlerde paylaşın. Paket fikriyle aynı stilde bir set hazırlayın.",
    "Dijital → tüm dosyaları tek seferde seçin (PDF veya ZIP, en fazla 5; duvar kâğıdı, ikon paketi, tablo, sunum oyunu ve özgeçmiş ZIP içinde gelir) ve görselleri ekleyin → 'Etsy taslağı oluştur'. Dosyaların hepsi ilana otomatik eklenir. Etsy'de yapay zekâ beyanını ve kategoriyi kontrol edip yayınlayın."
  ] },
  { id: "pdf-win", title: "Dijital ürün satışında öne geçmek", icon: "trophy-outline", steps: [
    "Kapak görseli satışın yarısıdır: küçük görünümde okunan 3-5 kelimelik başlık ve sayfa sayısı ya da format rozeti ekleyin.",
    "10 görselin hepsini kullanın. 'Neler var?', 'Ölçü/format' ve 'Nasıl çalışır' görselleri yanlış beklentiyi, iadeyi ve kötü yorumu azaltır.",
    "ABD alıcısı US Letter kullanır: Letter ve A4'ü birlikte sunun. Rakiplerin az sunduğu formatı (A5, düzenlenebilir, tablet) Trend kartındaki boşluk önerisine göre ekleyin.",
    "Aynı stilde ürün ailesi kurun (ör. planlayıcı + takip sayfası + günlük) ve paket satın; tekli ilanların açıklamasında pakete yönlendirin.",
    "Pinterest'i ölçülebilir bir trafik denemesi için açın. Her ürün için Stüdyo'nun hazırladığı 3 pini kullanın; sonucu gerçek ziyaret ve siparişlerle değerlendirin.",
    "Düzenli yeni ürün ekleyin: yeni ilanlar aramada kısa süreli görünürlük kazanır ve mağazanız daha çok aramada yer alır.",
    "Marka, karakter ve ünlü adı kullanmayın; sistem bu kelimeleri ilanlarınızdan otomatik çıkarır. İhlal, ilan kaldırma ve mağaza kapanmasının en sık nedenidir.",
    "Dosyanın içine 'Nasıl kullanılır / yazdırılır' sayfası ve teşekkür sayfası koyun; satıştan sonra kısa bir teşekkür mesajı gönderin. Etsy kuralları gereği yorum karşılığında indirim veya hediye vermeyin."
  ] },
  { id: "pinterest", title: "Pinterest otomatik pin (kurulum ve kullanım)", icon: "logo-pinterest", steps: [
    "pinterest.com/business adresinden ücretsiz bir Pinterest işletme hesabı açın (veya mevcut hesabınızı işletme hesabına çevirin).",
    "developers.pinterest.com → My apps → Connect app ile uygulama oluşturun. Redirect URI olarak şunu ekleyin: https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev/pinterest/oauth/callback",
    "Uygulamanın App ID ve App secret değerlerini Cloudflare → Workers → gxl-akilli-satici-api → Settings → Variables and Secrets bölümüne PINTEREST_APP_ID ve PINTEREST_APP_SECRET adıyla gizli değer olarak ekleyin. Bu değerleri sohbete veya uygulamaya yazmayın.",
    "Uygulamada Etsy → Pinterest → 'Bağla' ile hesabı bağlayın ve 'otomatik pinle' anahtarını açık bırakın.",
    "Yeni Pinterest uygulamaları 'Trial access' ile başlar; bu aşamada pinleri yalnızca siz görürsünüz. Herkese açık pin için developers.pinterest.com'da uygulamanızdan Standard access başvurusu yapın. Başvuruya bağlanma ekranını ve bir pinin oluşturulup panoda göründüğünü gösteren kısa bir ekran kaydı ekleyin; bu uygulamanın Pinterest bölümü bunu göstermek için yeterlidir.",
    "Sonrası otomatiktir: Etsy taslağı oluşan her ürün için 3 pin planlanır; ilan Etsy'de yayına girince pinler ilanın görseli, satış linki, başlığı, açıklaması, anahtar kelimeleri ve hashtag'leriyle 0., 2. ve 5. günlerde atılır. Pinler ürün türüne göre otomatik açılan panolara (ör. 'Printable Planners & Trackers') eklenir.",
    "Pinterest'te ayrı bir etiket alanı yoktur; aramada bulunmayı başlıktaki, açıklamadaki ve alt metindeki anahtar kelimeler ile pano adı sağlar. Etsy etiketlerinden en fazla 5 hashtag açıklamanın sonuna eklenir; marka/telif riski taşıyanlar eklenmez.",
    "Mevcut bir Etsy ilanını da pinleyebilirsiniz: Pinterest bölümüne ilan linkini yapıştırın; isterseniz Shopier gibi farklı bir satış linki girin.",
    "Bağlanamıyorsanız veya onay gelmediyse: developers.pinterest.com → My apps → uygulamanız. Orada erişim düzeyi yazar (Trial / Standard). Trial ise 'Upgrade' ile Standard erişim isteyin. Başvuruda uygulamanın Pinterest'e bağlanmasını ve bir pin oluşturmasını gösteren kısa bir ekran videosu istenir; video bağlanma ekranını göstermezse başvuru çoğunlukla reddedilir. Videoyu telefonun ekran kaydıyla çekebilirsiniz: Bağla → Pinterest izin ekranı → izin ver → Şimdi gönder.",
    "Onay beklerken satış durmaz: Pinterest bölümündeki 'Elle paylaş' listesi her pini görseli, satış linki ve açıklamasıyla hazırlar. 'Pinterest'te paylaş' deyip panoyu seçin, 'Kaydet'e basın, sonra 'Paylaştım' deyin. Bu yol için bağlantı veya onay gerekmez."
  ] },
  { id: "pattern", title: "El işi deseni satışı adım adım", icon: "document-text-outline", steps: [
    "Etsy 22 Ekim 2026'dan beri yapay zekâyla yazılmış deseni (örgü, tığ, dikiş, nakış, kanaviçe, punch, makrome) yasakladı; ilanda belirtmek de yetmiyor. Uygulama artık yapay zekâya desen yazdırmaz.",
    "Desen yalnız sizin veya mağaza üyenizin (ör. ailenizden örgü yapan biri) yazdığı ve bizzat yapıp denediği desen olabilir.",
    "Trend'de bir desen araması açın → 'Bu nişte kendi desenimi listele'. Trend verisi neyin aranıp satıldığını gösterir; deseni ona göre siz tasarlarsınız.",
    "Desen ve ürün hazır olunca Stüdyo → El işi deseni: ürün türünü, ölçüyü ve malzemeyi kendi deseninize göre düzeltin, desenin adını yazın ve üç onayı işaretleyin → 'Kendi desenim için ilanı hazırla'. Başlık, 13 etiket ve açıklama gelir.",
    "Bitmiş ürünün gerçek fotoğraflarını çekin. İlk fotoğraf düzenlenmemiş olsun (Etsy kuralı); render veya yapay zekâ görseli tek başına kullanılmaz.",
    "Dijital → PDF dosyalarını (en fazla 5) ve fotoğrafları seçin → 'Etsy taslağı oluştur'. Taslağı Etsy'de kontrol edip yayınlayın."
  ] },
  { id: "physical", title: "Elimdeki ürünü fotoğrafla satmak (tesbih, vintage, örgü)", icon: "camera-outline", steps: [
    "Etsy → Stüdyo → 'Elimdeki ürün (fotoğraf)'. 'Fotoğraf çek' veya 'Galeriden seç' ile 5–10 fotoğraf ekleyin; kapak yapmak istediğinize dokunun. Shopier'e eklemeniz gerekmez.",
    "'Fotoğraftan otomatik doldur': sistem ürün türünü, İngilizce adını, rengini, öne çıkan özelliklerini ve görünen kusurları bulur; sizin doğrulamanız gerekenleri listeler.",
    "Örgü/tığ işi: kimin ördüğünü, tekniği, bedeni, göğüs genişliği ile boyu, iplik içeriğini (ör. %100 pamuk) ve yıkama şeklini seçin. Ailenizden biri örüyorsa 'mağaza üyesi' seçin ve Etsy'de o kişiyi Shop members bölümüne ekleyin.",
    "Tesbih: kim yaptı, gram, tane sayısı, uzunluk. 925 damgası veya belge yoksa ilanda 'gümüş' yazılmaz. Hazır alınıp yeniden satılan tesbih Etsy'de yasaktır; sistem yayınlamaz.",
    "Vintage: yaklaşık üretim yılı (en az 20 yıl önce), ölçüler ve durum notu. Yıl girilmeden vintage ilan açılmaz.",
    "'Elinize geçecek (TL)' ve 'ABD'ye kargo (TL)' yazın → 'Etsy'de araştır ve ilanı hazırla'. Sistem alıcıların aramalarını tarar; başlık, 13 etiket, İngilizce açıklama ve kesintiler dahil dolar fiyatını hazırlar. Kargo alıcıya ait: fiyata eklenmez; uygulama Etsy kargo profiline yazılacak tutarı söyler (profil yoksa Mağaza hazırlığı → Kargo profili → 'Kargo profilini oluştur').",
    "Başlığı, etiketleri ve fiyatı isterseniz düzeltin → 'Etsy taslağı oluştur' (fotoğraflar bu adımda yüklenir) → isterseniz 'Video ekle (5-15 sn)' → 'Taslağı kontrol et' → 'Etsy'de yayınla'. Yayınlamada Etsy 0,20 USD ilan ücreti keser.",
    "Shopier'de zaten olan ürünler için Shopier sekmesindeki 'Etsy ilanı hazırla' da aynı motoru kullanır."
  ] },
  { id: "delivery", title: "Dosya teslimi ve koruma", icon: "lock-closed-outline", steps: [
    "Etsy satışında dosyayı Etsy teslim eder. Alıcı ödeme yaptıktan sonra dosyayı Etsy'deki 'Purchases' (Satın alımlar) sayfasından indirir. Ödeme yapmayan erişemez.",
    "Shopier veya doğrudan satışta: ödeme gelince Dijital → ürün → 'Satış bağlantısı' ile siparişe özel bir bağlantı oluşturun (varsayılan 3 indirme, 14 gün) ve alıcıya gönderin.",
    "İade olursa veya bağlantının paylaşıldığından şüphelenirseniz bağlantıyı 'Bağlantılar' bölümünden kapatın.",
    "İndirilmiş bir dosyanın kopyalanmasını hiçbir sistem tamamen engelleyemez. Dosyadaki telif altbilgisi ve lisans sayfası caydırıcıdır. Kopyayı görürseniz Etsy'nin fikrî mülkiyet bildirim formunu kullanın."
  ] },
  { id: "rules", title: "Etsy kuralları: dikkat edilecekler", icon: "shield-checkmark-outline", steps: [
    "Hazır alınıp yeniden satılan ürün listelenmez (vintage ve el işi malzemesi hariç).",
    "Başkasının desenini, fotoğrafını veya metnini kopyalamayın. Stüdyo her desen için bir farklılaştırma planı üretir.",
    "Başlıkta başka markaların adını ve abartılı iddiaları kullanmayın, aynı kelimeyi üst üste tekrarlamayın. Sistem başlığın uzunluğunu ve özel karakterlerini Etsy kurallarına göre düzeltir.",
    "Yapay zekâ destekli dijital ürünlerde (planlayıcı, boyama, duvar sanatı, kâğıt kiti, duvar kâğıdı, ikon paketi) açıklamadaki yapay zekâ beyanını silmeyin; Etsy formu sorarsa 'evet' deyin. Yapay zekâyla yazılmış desen, tarif ve talimat kılavuzu ise Etsy'de hiç satılamaz.",
    "Dijital üründe görsellerden biri dosyaların düzenlenmemiş önizlemesi olsun; Etsy alıcının ne alacağını görmek ister.",
    "İlanı uygulama taslak olarak açar; yayına almadan önce siz kontrol edersiniz. Etsy insan kontrolü olmadan açılan ilanı yasaklar.",
    "Fiziksel üründe gerçek ürün fotoğrafı kullanın. Render tek başına alıcıyı yanıltabilir.",
    "Başlıklara eyalet adı doldurmayın. Etsy ilanı tüm ABD'de gösterir; bölge hedeflemesi doğru arama ifadesi ve sezon seçimiyle yapılır."
  ] },
  { id: "categories", title: "Yapay zekâyla satabileceğimiz ürünler", icon: "sparkles-outline", steps: [
    "Etsy, yapay zekâ destekli dijital ürüne izin verir. İki şart var: satıcının gerçek bir yaratıcı payı olmalı ve açıklamada yapay zekâ beyanı yazmalı. Uygulamanın talimatları ve ilanları ikisini de karşılar.",
    "Uygulamada hazır 19 tür var. Her biri Stüdyo → Dijital ürün → türü seçerek ya da Trend'de o türün aramasında 'Bu nişte dijital ürün hazırla' ile başlar:",
    "• Planlayıcı ve dijital (tablet) planlayıcı · • Günlük · • Boyama sayfaları · • Duvar sanatı · • Parti ve düğün oyunları · • Boş tarif kartı ve defteri · • Çocuk etkinlik sayfaları · • Junk journal kiti ve dijital kâğıt",
    "• Yıllık takvim · • Çıkartma (sticker) seti · • Tebrik kartı ve hediye etiketi · • Büyük puntolu bulmaca kitabı · • Kiler ve ev düzeni etiketleri",
    "Telefona yüklenip kullanılan ürünler (basılmaz, kargo yok):",
    "• Telefon duvar kâğıdı: kilit ve ana ekran.",
    "• Telefon ikon ve widget paketi: ana ekranı baştan tasarlar.",
    "• Bütçe / takip tablosu: Excel, Google Sheets ve telefon tablo uygulamalarında çalışır.",
    "• Dijital planlayıcı: tablette ve telefonda not uygulamasıyla açılır.",
    "• Çıkartma setinin PNG dosyaları: dijital planlayıcıya eklenir.",
    "Programda açılıp düzenlenen şablonlar (alıcının zaten kullandığı programda çalışır):",
    "• Bütçe / takip tablosu: Excel ve Google Sheets (.xlsx).",
    "• Sunum oyunu: PowerPoint, Google Slides ve Keynote'ta tıklanabilir bilgi yarışması (.pptx). Televizyona veya projeksiyona yansıtılır.",
    "• Özgeçmiş şablonu: Word, Google Docs ve Pages'te düzenlenen özgeçmiş, ön yazı ve referans sayfası (.docx).",
    "Bu üç türde dosyayı yapay zekâ kodla kurar ve kendisi test eder: formüller, slaytlar arası bağlantılar, sayfaya sığma. Etsy'de satıcının kendi tasarladığı şablon olarak satılır; ilanda program adları yalnız açıklamada geçer, başlık ve etikette marka olmaz.",
    "Kurulan program (APK, .exe, tarayıcı eklentisi) eklenmedi. Etsy'nin kurallarında bunlar için açık bir izin yok. Alıcının telefonu veya bilgisayarı bilinmeyen kaynaktan program kurarken güvenlik uyarısı verir; iade ve kötü yorum riski yüksektir. Fotoğraf filtresi (preset), yazı tipi ve fırça paketi de eklenmedi: yapay zekâ bunları deneyip doğrulayamaz.",
    "Yasak olanlar (yapay zekâyla üretilip satılamaz):",
    "• örgü, tığ, dikiş, nakış, kanaviçe, punch ve makrome desenleri;",
    "• yemek tarifleri ve talimat kılavuzları;",
    "• yapay zekâ prompt paketleri;",
    "• insan kontrolü olmadan açılan ilanlar.",
    "Kendi yazıp denediğiniz desen ise satılabilir (Stüdyo → El işi deseni).",
    "Henüz uygulamada olmayan ama Etsy'de serbest olan türler: Canva ve Notion şablonları ile kişiye özel kart. Canva ve Notion şablonunu bilgisayarda o programın içinde sizin kurmanız gerekir; kişiye özel kart alıcıyla yazışma ister. İsterseniz ekleriz.",
    "Hangi türle başlamalı? Trend sekmesi her türün Etsy'deki talebini ve rekabetini puanlar. Mevsim fırsatları kartı o an en çok aranan türü gösterir. Kasım–aralıkta takvim, Noel kartı ve Noel duvar kâğıdı öne çıkar.",
    "Ürün ChatGPT'yle de Claude'la da üretilir; Stüdyo'da hangisini kullandığınızı seçin, paket ona göre yazılır."
  ] },
  { id: "setup", title: "Mağaza açılışı adım adım", icon: "storefront-outline", steps: [
    "Kimlik, banka, kart ve şifre bilgileri yalnız Etsy'nin kendi sayfasına girilir; uygulamaya, sohbete veya ekran görüntüsüne yazılmaz.",
    "1) etsy.com/sell → 'Get started'. Kendi adınızla, kendi e-postanızla tek bir hesap kullanın.",
    "2) Shop preferences (Mağaza tercihleri): dil English, ülke Türkiye, para birimi USD önerilir (ABD'li alıcı fiyatı olduğu gibi görür; TL seçerseniz uygulamada TL fiyat girin).",
    "3) Shop name (Mağaza adı): GXLMarketStudio. Ad alındığında Durum kartında 'Mağaza kayıtlı · yayında ilan yok' yazar.",
    "4) Stock your shop (İlk ilan): uygulamada ürünü hazırlayıp Dijital → 'Etsy taslağı oluştur' deyin; taslak Etsy'de görünür. Etsy formu ilanı kendisi istiyorsa uygulamadaki 'İlan metnini kopyala' ile başlık, etiket ve açıklamayı yapıştırın.",
    "5) How you'll get paid (Ödeme alma): banka hesabı kimliğinizdeki adla aynı olmalı. Bu adım sizindir.",
    "6) Set up billing (Faturalama): Etsy ücretleri için kart. İlan ücreti ilan başına 0,20 USD; Etsy açılış ücreti isterse ekranda yazar. Bu adım sizindir.",
    "7) Shop security (Güvenlik): iki adımlı doğrulamayı açın. Etsy kimlik doğrulaması isterse kimliğinizi yalnız Etsy'nin ekranında yükleyin.",
    "8) 'Open your shop' (Mağazayı aç). Sonra uygulamada Etsy bağlantısını yenileyin; ilk ilan yayına girince Durum kartında 'Mağaza açık' yazar.",
    "9) Bir kez yapılacak ayarlar: Mağaza hazırlığı listesinde 'Kargo profilini oluştur' ve 'İade politikasını oluştur' (fiziksel ürün için); 'Mağaza vitrini' kartında 'Etsy'ye uygula' (başlık, duyuru, teşekkür mesajı, bölümler). Ustaya yaptırılan ürün için Shop Manager → Settings → Production partners."
  ] },
  { id: "safe", title: "Etsy'den engellenmemek için", icon: "shield-outline", steps: [
    "Tek kişi, tek hesap: ikinci mağaza açmayın, kapatılmış bir hesaba aynı telefondan veya ağdan girmeyin, VPN kullanmayın.",
    "Kimlikteki ad, banka hesabındaki ad ve Etsy hesabındaki ad aynı olsun; adres gerçek olsun. Mağaza açıldıktan hemen sonra banka veya e-posta değiştirmeyin.",
    "Yapay zekâyla yazılmış desen, tarif veya talimat kılavuzu satmayın (Etsy 22 Ekim 2026 kuralı). Yapay zekâ destekli dijital ürünlerde açıklamadaki beyanı silmeyin.",
    "Başlıkta, etikette ve görselde marka ya da karakter adı kullanmayın (Disney, Harry Potter, iPad, GoodNotes, DMC…). Uygulama bunları otomatik çıkarır.",
    "Fiziksel üründe kendi gerçek fotoğrafınızı kullanın, en az biri düzenlenmemiş olsun. Dijital üründe görsellerden biri sayfaların gerçek önizlemesi olsun.",
    "İlana, mesaja veya pakete Shopier, WhatsApp ya da Instagram bağlantısı yazmayın; Etsy alıcıyı dışarı yönlendirmeyi yasaklar.",
    "Yorum, beğeni veya takipçi satın almayın; arkadaşlarınıza yorum yazdırmayın.",
    "İlk hafta az ama özenli ilanla başlayın (ör. 3–5 ilan). Yeni mağazada bir günde onlarca ilan açmak Etsy'nin otomatik incelemesini tetikleyebilir.",
    "Mesajlara 24 saat içinde yanıt verin, fiziksel ürünü söz verilen sürede takip numarasıyla gönderin. Etsy yeni mağazada satış gelirinin bir kısmını bir süre bekletebilir (rezerv); bu normaldir.",
    "Bir uyarı veya ilan kaldırma e-postası gelirse panik yapmayın, hiçbir şeyi silmeyin; e-postayı ve ilanı bana gösterin, birlikte düzeltip itiraz edelim."
  ] },
  { id: "trouble", title: "Sorun giderme", icon: "construct-outline", steps: [
    "Uygulama düzeltmeleri APK kurmadan gelir: 'Güncelleme hazır' sorusu çıkarsa 'Yeniden başlat' deyin. Hangi sürümde olduğunuz Yardım (uzman modda Özet) ekranının en altında yazar; ekran görüntüsü gönderirken o satır görünsün. Beklediğiniz güncelleme gelmediyse aynı yerdeki 'Güncellemeyi denetle' düğmesine basın; sonucu ekranda yazar.",
    "'Etsy mağazası hazır değil': mağaza açılışı bitmemiş ya da yetki yenilenmesi gerekiyor. Aşağıdaki düğmelerle kuruluma devam edin.",
    "'Tarama durdu' veya 'çok fazla istek': Etsy'nin istek sınırına takıldınız. Birkaç dakika sonra tekrar deneyin; otomatik keşif kendi hızında devam eder.",
    "'Yayınlanamadı': ilanda en az bir fotoğraf, bir kargo profili ve fiyat olmalıdır. Taslağı Etsy'de açıp eksik alanı tamamlayın.",
    "Takip numarası gönderilemiyorsa: Siparişler ekranındaki 'Etsy iznini yenile' düğmesine basın; Etsy'de izin ekranını onaylayın. Bu, sipariş kargo bilgisini yazma iznidir ve bir kez yapılır.",
    "Alıcı WhatsApp, e-posta ya da PayPal ile iletişim/ödeme isterse kabul etmeyin; Etsy dışına çıkmak kurala aykırıdır ve dolandırıcılıkların çoğu böyle başlar. Mesaj yardımcısı bu işaretleri kırmızıyla gösterir.",
    "'Keşfedilenler' boş görünüyorsa ilk otomatik taramalar birkaç saat sürer. Hızlandırmak için gruplarda 'Tümünü tara' düğmesine basın.",
    "Üstte 'Bağlantı yok' görünüyorsa sunucuya bağlanılamıyordur. Uygulama bir kez kendisi yeniden dener; olmazsa internet veya VPN bağlantısını kontrol edip 'Yeniden bağlan' düğmesine basın. Kayıtlı anahtar yalnız sunucu onu reddederse yeniden istenir."
  ] }
];

// Mağaza vitrini: başlık, duyuru, satış mesajları ve bölümler API ile Etsy'ye yazılır.
// Logo, afiş ve "Hakkında" bölümü için Etsy API'si yoktur; bunlar Shop Manager'dan yüklenir.
function ShopSettingsCard({ online, shopReady }: any) {
  const [status, setStatus] = useState<any>();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [saleMessage, setSaleMessage] = useState("");
  const [digitalSaleMessage, setDigitalSaleMessage] = useState("");
  const [sections, setSections] = useState("");
  const [audience, setAudience] = useState("");
  const [saving, setSaving] = useState(false);
  // Kitle seçimi tüm metinleri o kitleye göre doldurur; öneri mağazadaki ürünlerden gelir.
  const fill = (preset: any) => {
    setTitle(preset.title);
    setAnnouncement(preset.announcement);
    setSaleMessage(preset.saleMessage);
    setDigitalSaleMessage(preset.digitalSaleMessage);
    setSections(preset.sections.join(", "));
  };
  const load = async () => {
    try {
      const body = await apiJson("/api/etsy/shop-settings", { headers: apiHeaders() });
      setStatus(body);
      setAudience(body.recommended);
      if (!title) fill(body.presets?.[body.recommended] || body.defaults);
    } catch { setStatus({ error: true }); }
  };
  useEffect(() => { if (online && open && !status) load(); }, [online, open]);
  const apply = () => Alert.alert("Etsy mağaza vitrini güncellensin mi?", "Mağaza başlığı, duyuru, satış sonrası mesajlar ve bölümler Etsy'de bu metinlerle değişir.", [
    { text: "Vazgeç", style: "cancel" },
    { text: "Uygula", onPress: async () => {
      setSaving(true);
      try {
        const result = await apiJson("/api/etsy/shop-settings", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, title, announcement, saleMessage, digitalSaleMessage, sections: sections.split(",").map((item) => item.trim()).filter(Boolean) }) });
        Alert.alert("Mağaza güncellendi", `Değişen alanlar: ${result.updated.length}. Yeni bölüm: ${result.sectionsCreated.length}${result.sectionsExisting.length ? `, zaten var: ${result.sectionsExisting.length}` : ""}.`);
      } catch (error) { Alert.alert("Uygulanamadı", errorText(error)); }
      finally { setSaving(false); }
    } }
  ]);
  return <View style={styles.card}>
    <Pressable style={styles.shopierProductTop} onPress={() => setOpen(!open)}>
      <Ionicons name="storefront-outline" size={20} color="#315B4C" />
      <Text style={[styles.cardTitle, { flex: 1 }]}>Mağaza vitrini (başlık, duyuru, mesajlar, bölümler)</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="#68736E" />
    </Pressable>
    {open && <>
      {!shopReady && <Text style={styles.warningText}>Mağaza açılışı tamamlanınca uygulanabilir.</Text>}
      {status?.error && <Pressable style={styles.secondaryButton} disabled={!online} onPress={load}><Text style={styles.secondaryButtonText}>Bilgiler alınamadı · Yeniden dene</Text></Pressable>}
      {!!status?.presets && <>
        <Text style={styles.fieldLabel}>Hedef alıcı kitlesi</Text>
        <ChipGroup options={Object.entries(status.presets).map(([id, preset]: any) => ({ id, label: preset.labelTr }))} value={audience} onChange={(id: string) => { setAudience(id); fill(status.presets[id]); }} />
        <Text style={styles.small}>{status.presets[audience]?.audienceTr}</Text>
        {audience === status.recommended && <Text style={styles.formHint}>Öneri: {status.reasonTr}</Text>}
        {(audience === "faith" || audience === "vintage") && <Text style={styles.warningText}>Bu kitle planlayıcı ve desen alıcılarından farklı. Aynı mağazada karışık vitrin güveni ve satışı düşürür; bu ürünler için ayrı bir Etsy mağazası veya Shopier önerilir.</Text>}
      </>}
      {status?.connected && !status?.canWrite && <View style={{ marginVertical: 8 }}><Text style={styles.warningText}>Mevcut Etsy izni mağaza düzenlemeyi kapsamıyor. Bir kez bağlantıyı yenileyin; Etsy yeni izni (mağaza düzenleme) soracak.</Text><Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={connectEtsy}><Text style={styles.secondaryButtonText}>Etsy iznini yenile</Text></Pressable></View>}
      <Field label={`Mağaza başlığı (${title.length}/55)`} value={title} onChangeText={setTitle} />
      <Field label="Duyuru (mağaza sayfasında görünür)" value={announcement} onChangeText={setAnnouncement} multiline style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]} />
      <Field label="Satış sonrası mesaj" value={saleMessage} onChangeText={setSaleMessage} multiline style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} />
      <Field label="Dijital ürün satış mesajı" value={digitalSaleMessage} onChangeText={setDigitalSaleMessage} multiline style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} />
      <Field label="Bölümler (virgülle, her biri en fazla 24 karakter)" value={sections} onChangeText={setSections} />
      <Text style={styles.formHint}>Logo (500×500), afiş (3360×840) ve "Hakkında" metni için Etsy API'si yok; bunları Etsy'de Shop Manager (Mağaza Yöneticisi) → Settings (Ayarlar) → Info & appearance (Bilgi ve görünüm) bölümünden yükleyin.</Text>
      <Pressable style={[styles.analyzeButton, { marginTop: 12 }, (saving || !online || !status?.canWrite || !shopReady) && styles.primaryDisabled]} disabled={saving || !online || !status?.canWrite || !shopReady} onPress={apply}>{saving ? <ActivityIndicator color="white" /> : <Ionicons name="cloud-upload-outline" size={18} color="white" />}<Text style={styles.primaryText}>Etsy'ye uygula</Text></Pressable>
    </>}
  </View>;
}

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

// Shopier ürünü ve fotoğraftan ürün aynı Etsy motorunu kullanır: arama ifadeleri, tarama, başlık, etiket, açıklama ve fiyat.
async function researchEtsyPlan(base: any, setProgress: (text: string) => void) {
  setProgress("Alıcıların kullandığı arama ifadeleri bulunuyor…");
  const suggestion = await apiJson("/api/products/etsy-keywords", { method: "POST", headers: apiHeaders(true), body: JSON.stringify(base) });
  const payload = { ...base };
  if (!payload.productNounEn && suggestion.signals?.noun && suggestion.signals.noun !== "item") payload.productNounEn = suggestion.signals.noun;
  for (const keyword of suggestion.candidates) {
    setProgress(`Etsy'de araştırılıyor: ${keyword}`);
    try { await apiJson("/api/etsy/trends/scan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ keyword }) }); }
    catch { /* bir arama başarısız olursa diğerleriyle devam edilir */ }
  }
  setProgress("Başlık, etiket, açıklama ve fiyat hazırlanıyor…");
  const result = await apiJson("/api/products/etsy-plan", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ product: payload, keywords: suggestion.candidates }) });
  return { plan: { ...result.plan, quality: result.quality }, payload };
}

function EtsyProductPlanner({ product, etsyReady, onClose }: any) {
  const [origin, setOrigin] = useState("unknown");
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
  const inputKey = generationKey({ product, origin, yearMade, materialVerified, weightGrams, beadCount, lengthCm, shippingTry, productNounEn, usdTryRate, readyToShip });
  const currentPlan = plan?.inputKey === inputKey ? plan : undefined;
  useEffect(() => {
    setOrigin("unknown"); setYearMade(""); setMaterialVerified(false); setBeadCount(""); setLengthCm(""); setShippingTry(""); setProductNounEn(""); setUsdTryRate(""); setReadyToShip(true);
    setPlan(undefined);
    setProgress("");
    const weight = String(product?.title || "").match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gram)\b/i);
    setWeightGrams(weight ? weight[1].replace(",", ".") : "");
  }, [product]);
  const analyze = async () => {
    if (origin === "unknown") return Alert.alert("Üretim bilgisi", "Bu ürünü kim yaptı sorusunu yanıtlayın.");
    const base: any = {
      sourceId: product.id,
      titleTr: product.title,
      descriptionTr: plainText(product.description),
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
      const result = await researchEtsyPlan(base, setProgress);
      setPayload(result.payload);
      setPlan({ ...result.plan, inputKey });
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setProgress(""); }
  };
  return <Modal visible={Boolean(product)} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.formSafe}><StatusBar barStyle="dark-content" /><ScrollView contentContainerStyle={styles.formContent}>
      <View style={styles.formHeader}><Text style={[styles.sectionTitle, { flex: 1 }]}>Etsy ilanı hazırla</Text><Pressable onPress={onClose}><Ionicons name="close" size={26} color="#315B4C" /></Pressable></View>
      {!currentPlan && <ListingMascot step={2} title="Shopier ürününü Etsy için doğrula" instruction="Bu ürünü kim yaptı sorusunu yanıtla. Gerçek malzeme, ölçü, stok ve ABD kargo bilgilerini kontrol et; ardından Etsy araştırmasını başlat." tasks={["Üretim kökenini seç; gerekiyorsa vintage yılını doğrula.", "Paketli ürünün gerçek ABD kargosunu ve ölçülerini gir.", "Hazırlanan ilanı inceledikten sonra Etsy taslağına geç."]} actionLabel="Goxi ile Shopier ürünü için Etsy araştırması" onAction={analyze} disabled={Boolean(progress)} /> }
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
      {currentPlan && <EtsyPlanResult key={currentPlan.inputKey} plan={currentPlan} payload={payload} etsyReady={etsyReady} priceSourceLabel="Shopier fiyatı" photoCount={payload?.imageUrls?.length} />}
    </ScrollView></SafeAreaView>
  </Modal>;
}

// İlan İngilizce kalır (alıcı ABD'de); satıcı ne yazıldığını anlasın diye başlık ve etiketlerin Türkçe karşılığı gösterilir.
function TurkishGloss({ title, tags }: { title: string; tags: string[] }) {
  const [gloss, setGloss] = useState<any>();
  const tagKey = tags.join("|");
  useEffect(() => {
    let alive = true;
    setGloss(undefined);
    if (!title) return;
    apiJson("/api/explain-tr", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ title, tags }) })
      // Beklenmedik yanıt ekranı çökertmez: yalnız başlık ve etiket listesi varsa gösterilir.
      .then((result) => { if (alive && result && typeof result.titleTr === "string" && Array.isArray(result.tags)) setGloss(result); })
      .catch(() => { /* açıklama yalnız yardımcıdır; alınamazsa ilan yine hazırlanır */ });
    return () => { alive = false; };
  }, [title, tagKey]);
  if (!gloss) return null;
  return <View style={styles.analysisCard}>
    <Text style={styles.cardTitle}>Türkçesi (yalnız sizin kontrolünüz için)</Text>
    <Text style={styles.analysisLine}>Başlık: {gloss.titleTr}</Text>
    {gloss.tags.map((row: any) => <Text style={styles.analysisLine} key={row.tag}>• {row.tag} = {row.tr}</Text>)}
    <Text style={styles.formHint}>İlan İngilizce kalır; Etsy alıcıları ağırlıkla ABD'de. Türkçesinde anlamsız bir şey görürseniz İngilizce kelimeyi değiştirin veya silin.</Text>
  </View>;
}

// Planın sonucu, taslak ve yayın: iki akışta da aynı. prepareProduct taslaktan hemen önce çalışır (ör. fotoğrafları yükler).
function EtsyPlanResult({ plan, payload, etsyReady, priceSourceLabel, prepareProduct, photoCount }: any) {
  const [scorecard, setScorecard] = useState<any>();
  const [scoring, setScoring] = useState(false);
  const [title, setTitle] = useState(plan.title);
  const [tags, setTags] = useState(plan.tags.join(", "));
  const [description, setDescription] = useState(plan.description);
  const [chatAssistant, setChatAssistant] = useState<"chatgpt" | "claude">("chatgpt");
  const [chatReply, setChatReply] = useState("");
  const [chatRequest, setChatRequest] = useState("");
  // Türkçe karşılık kutusu planın ya da sohbetten uygulanan son başlık/etiketlerin çevirisini gösterir (her tuşta değil).
  const [gloss, setGlossSource] = useState<{ title: string; tags: string[] }>({ title: plan.title, tags: plan.tags });
  const [priceUsd, setPriceUsd] = useState(plan.pricing ? String(plan.pricing.recommendedUsd) : "");
  const [saving, setSaving] = useState(false);
  const [savingText, setSavingText] = useState("");
  const [draft, setDraft] = useState<any>();
  const [published, setPublished] = useState<any>();
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    setTitle(plan.title);
    setTags(plan.tags.join(", "));
    setDescription(plan.description);
    setChatReply(""); setChatRequest(""); setGlossSource({ title: plan.title, tags: plan.tags });
    setPriceUsd(plan.pricing ? String(plan.pricing.recommendedUsd) : "");
    setDraft(undefined);
    setPublished(undefined);
    rescore(plan.title, plan.tags.join(", "), plan.pricing ? String(plan.pricing.recommendedUsd) : "");
  }, [plan]);
  // İlan karnesi: başlık, etiket, açıklama, fotoğraf ve fiyat sunucuda açık eşiklerle puanlanır.
  // Sohbet asistanına gidecek doğrulanmış bilgiler: yalnız satıcının girdiği ve onayladığı ölçü/malzeme/köken.
  const chatFacts = (() => {
    const product = payload || {};
    return [
      product.material ? `material: ${product.material}${product.materialVerified ? " (verified)" : " (not verified)"}` : "",
      product.beadCount ? `${product.beadCount} beads` : "",
      product.weightGrams ? `weight ${product.weightGrams} g` : "",
      product.lengthCm ? `length ${product.lengthCm} cm` : "",
      product.widthCm ? `width ${product.widthCm} cm` : "",
      product.chestCm ? `chest width ${product.chestCm} cm` : "",
      product.fiber ? `yarn: ${product.fiber}` : "",
      product.origin === "made_by_seller" ? "handmade by the seller in Türkiye" : product.origin === "designed_by_seller" ? "designed by the seller in Türkiye" : "",
      product.yearMade ? `made around ${product.yearMade}` : "",
      ...(product.colors || []).length ? [`colors: ${(product.colors || []).join(", ")}`] : []
    ].filter(Boolean);
  })();
  const shareListingChat = async () => {
    const id = `listing-${Date.now()}`;
    try {
      await Share.share({ message: listingChatPrompt(chatAssistant, { nameTr: payload?.titleTr || "", titleEn: title, tags: tags.split(",").map((tag: string) => tag.trim()).filter(Boolean), primaryKeyword: plan.primaryKeyword, competitorTitles: (plan.competitors || []).map((item: any) => item.title).filter(Boolean), facts: chatFacts, materialVerified: Boolean(payload?.materialVerified) }, id) });
      setChatRequest(id); setChatReply("");
    } catch (error) { Alert.alert("Paylaşılamadı", errorText(error)); }
  };
  const applyListingChat = () => {
    if (!chatRequest) return Alert.alert("Önce talimatı paylaş", "'İlan metni talimatını paylaş' ile talimatı gönder; gelen JSON'u buraya yapıştır.");
    try {
      const imported = parseListingChat(chatReply, chatRequest, Boolean(payload?.materialVerified));
      const nextTags = imported.tags.join(", "), nextDescription = mergeListingAbout(plan.description, imported.aboutEn);
      setTitle(imported.title); setTags(nextTags); setDescription(nextDescription); setGlossSource({ title: imported.title, tags: imported.tags });
      rescore(imported.title, nextTags, priceUsd, nextDescription);
      Alert.alert("Uygulandı", "Başlık, 13 etiket ve tanıtım paragrafı güncellendi. Fiyat, kargo, teslim süresi ve zorunlu açıklama bölümleri uygulamanın hesabıyla kaldı. Karneyi kontrol edip taslağa geç.");
    } catch (error) { Alert.alert("Yanıt uygulanamadı", errorText(error)); }
  };
  const rescore = async (nextTitle = title, nextTags = tags, nextPrice = priceUsd, nextDescription = description): Promise<any> => {
    setScoring(true);
    try {
      const card = await apiJson("/api/listings/scorecard", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({
        title: nextTitle, tags: nextTags.split(",").map((tag: string) => tag.trim()).filter(Boolean), description: nextDescription,
        photoCount: typeof photoCount === "number" ? photoCount : undefined, priceUsd: Number(String(nextPrice).replace(",", ".")) || undefined,
        medianPriceUsd: plan.pricing?.medianUsd, primaryKeyword: plan.primaryKeyword
      }) });
      setScorecard(card);
      return card;
    } catch { setScorecard(undefined); return undefined; }
    finally { setScoring(false); }
  };
  const createDraft = async () => {
    if (!etsyReady) return Alert.alert("Etsy mağazası hazır değil", "Mağaza açılıp Etsy bağlantısı 'Bağlı' görünene kadar taslak oluşturulamaz.");
    if (!(Number(priceUsd.replace(",", ".")) > 0)) return Alert.alert("Fiyat", "Etsy fiyatını (USD) yazın.");
    // Karne, başlık/etiket/fiyattaki son değişikliklerle yeniden hesaplanır; eski puana göre karar verilmez.
    const fresh = await rescore();
    if (fresh && fresh.score < 50) return Alert.alert(`İlan karnesi düşük (${fresh.score}/100)`, "Bu haliyle ilan aramada zor görünür. Karnedeki düzeltmeleri yapmanız önerilir.", [
      { text: "Düzelteyim", style: "cancel" },
      { text: "Yine de devam", onPress: confirmDraft }
    ]);
    confirmDraft();
  };
  const confirmDraft = () => {
    Alert.alert("Etsy'de taslak ilan oluşturulsun mu?", "İlan önce taslak olarak oluşturulur, yayına girmez. Kontrol ettikten sonra buradan veya Etsy'den yayınlayabilirsiniz.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Taslak oluştur", onPress: async () => {
        setSaving(true);
        try {
          const product = prepareProduct ? await prepareProduct(payload, setSavingText) : payload;
          setSavingText("Etsy taslağı oluşturuluyor…");
          const result = await apiJson("/api/products/etsy-draft", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ confirm: true, product, listing: { title, tags: tags.split(",").map((tag: string) => tag.trim()).filter(Boolean), description, materials: plan.materials, priceUsd: Number(priceUsd.replace(",", ".")) } }) });
          setDraft(result);
          Alert.alert(result.alreadyCreated ? "Taslak zaten var" : "Etsy taslağı hazır", [...(result.warnings || []), "Taslağı kontrol ettikten sonra 'Etsy'de yayınla' düğmesine basın.", ...(result.pinsQueued ? [`Pinterest: ${result.pinsQueued} pin planlandı; ilan yayına girince satış linkiyle otomatik atılacak.`] : [])].join("\n"), [{ text: "Taslağı aç", onPress: () => openUrl(result.editUrl, "Etsy taslak ilanı") }, { text: "Tamam" }]);
        } catch (error) { Alert.alert("Taslak oluşturulamadı", errorText(error)); }
        finally { setSaving(false); setSavingText(""); }
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
  const eligibility = plan.eligibility;
  const pricing = plan.pricing;
  const bannerStyle = eligibility.status === "allowed" ? styles.policyAllowed : eligibility.status === "blocked" ? styles.policyBlocked : styles.policyReview;
  return <>
      <ListingMascot step={published?.state === "active" || draft ? 5 : 4} complete={published?.state === "active"}
        title={published?.state === "active" ? "Etsy’de yayında olduğu doğrulandı" : draft ? "Taslağını Etsy’de kontrol et" : eligibility.status !== "allowed" ? "Önce kural kontrolündeki eksikleri düzelt" : "İlanı incele, sonra Etsy taslağına geç"}
        instruction={published?.state === "active" ? "Alıcıya görünen ilanı aç; gerçek fotoğrafları, fiyatı ve kargoyu son kez kontrol et." : draft ? "Taslak henüz yayında ilan değildir. İstersen aşağıdan ‘Video ekle (5-15 sn)’ ile kısa video ekle. Fotoğraf, fiyat, kategori, kargo ve gerekli üretim ortağı bilgilerini Etsy’de kontrol et; ardından aşağıdaki ‘Etsy\'de yayınla’ düğmesini kullan." : "Aşağıdaki başlık, açıklama, 13 etiket, fiyat ve kural kontrolünü gerçek ürününle karşılaştır. İstersen ‘İlan metni talimatını paylaş’ ile ChatGPT/Claude’a metni güçlendirt. Eksik veya yanlış bilgiyi düzelt; uygunsa taslak oluştur."}
        roadmap={["Ürün ve fotoğraflar", "Gerçek bilgiler ve köken", "Fiyat ve kargo", "İlan kontrolü ve taslak", "Etsy kontrolü ve yayın doğrulaması"]}
        actionLabel={published?.state === "active" ? "Goxi ile yayındaki ilanı aç" : draft ? "Goxi ile Etsy taslağını aç" : "Goxi ile fiziksel ürün taslağını hazırla"}
        onAction={() => published?.state === "active" ? openUrl(published.url, "Etsy ilanı") : draft ? openUrl(draft.editUrl, "Etsy taslağı") : createDraft()} disabled={eligibility.status !== "allowed" || saving || publishing || !etsyReady} />
      <MarketStrategyCard strategy={plan.strategy} />
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
        <Text style={styles.analysisLine}>{priceSourceLabel}: {pricing.priceTry} TL ≈ {pricing.targetNetUsd} USD (kur {pricing.usdTryRate})</Text>
        <Text style={styles.analysisLine}>Etsy kesintileri: %{pricing.feePercent} + {pricing.fixedFeesUsd} USD sabit</Text>
        <Text style={styles.analysisLine}>ABD kargosu alıcıya ait: kargo profiline {pricing.buyerShippingTry ? `${pricing.buyerShippingTry} TL (≈${pricing.buyerShippingUsd} USD)` : "kargo ücretinizi"} yazın; alıcı ilan sayfasında ve ödemede görür.</Text>
        <Text style={styles.analysisLine}>Başabaş Etsy fiyatı: {pricing.breakEvenUsd} USD</Text>
        <Text style={styles.analysisLine}>Etsy ortancası: {pricing.medianUsd ?? "—"} USD</Text>
        <Text style={styles.listingTitle}>Önerilen: {pricing.recommendedUsd} USD ≈ {pricing.recommendedTry} TL · elinize ≈ {pricing.netAtRecommendedTry} TL</Text>
        <Text style={styles.warningText}>{pricing.note}</Text>
      </View>}
      <QualityNote quality={plan.quality} />
      <Field label={`Başlık (${title.length}/140)`} value={title} onChangeText={setTitle} multiline />
      <Field label="Etiketler (13 adet)" value={tags} onChangeText={setTags} multiline autoCapitalize="none" />
      <TurkishGloss title={gloss.title} tags={gloss.tags} />
      <Field label="Etsy fiyatı (USD)" value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" />
      <ScorecardView card={scorecard} busy={scoring} onRefresh={() => rescore()} />
      <View style={styles.analysisCard}>
        <View style={styles.shopierProductTop}><Text style={[styles.cardTitle, { flex: 1 }]}>Açıklama (İngilizce)</Text><Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: `${title}\n\n${description}\n\nTags: ${tags}` })}><Text style={styles.secondaryButtonText}>Kopyala</Text></Pressable></View>
        <Text style={styles.promptText} numberOfLines={12}>{description}</Text>
      </View>
      <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>ChatGPT / Claude ile ilan metnini güçlendir (isteğe bağlı)</Text>
        <Text style={styles.formHint}>Plus üyeliğini kullanır. Talimata uygulamanın Etsy rakip verisi eklenir; asistan başlık, 13 etiket ve tanıtım paragrafı yazar. Fotoğrafları sohbete ekle, gelen JSON'u buraya yapıştır. Fiyat, kargo ve teslim süresini uygulama hesaplar; yanıt Etsy kurallarına göre denetlenir.</Text>
        <ChipGroup options={[{ id: "chatgpt", label: "ChatGPT" }, { id: "claude", label: "Claude" }]} value={chatAssistant} onChange={(value: any) => setChatAssistant(value)} />
        <Pressable style={styles.secondaryButton} onPress={shareListingChat}><Text style={styles.secondaryButtonText}>İlan metni talimatını paylaş</Text></Pressable>
        <Field label="Sohbetten gelen ilan JSON'u" value={chatReply} onChangeText={setChatReply} multiline autoCapitalize="none" />
        <Pressable style={styles.secondaryButton} onPress={applyListingChat}><Text style={styles.secondaryButtonText}>İlan metnini uygula</Text></Pressable>
      </View>
      {!!plan.competitors.length && <View style={styles.analysisCard}>
        <Text style={styles.cardTitle}>Öne çıkan rakip ilanlar</Text>
        {plan.competitors.map((item: any, index: number) => <Pressable key={`${item.url}-${index}`} onPress={() => item.url && openUrl(item.url, "Etsy ilanı")}><Text style={styles.linkNote} numberOfLines={2}>{item.priceUsd ? `${item.priceUsd.toFixed(2)} USD · ` : ""}{item.favorites} favori · {item.title}</Text></Pressable>)}
      </View>}
      {plan.warnings.map((warning: string) => <Text style={styles.warningText} key={warning}>• {warning}</Text>)}
      <Pressable style={[styles.analyzeButton, { marginTop: 14 }, (eligibility.status !== "allowed" || saving || Boolean(draft)) && styles.primaryDisabled]} disabled={eligibility.status !== "allowed" || saving || Boolean(draft)} onPress={createDraft}>{saving ? <ActivityIndicator color="white" /> : <Ionicons name="storefront-outline" size={18} color="white" />}<Text style={styles.primaryText}>{eligibility.status === "blocked" ? "Etsy'de yayınlanamaz" : draft ? "Taslak oluşturuldu" : "Etsy taslağı oluştur"}</Text></Pressable>
      {!!savingText && <Text style={styles.formHint}>{savingText}</Text>}
      {draft && <View style={[styles.policyBox, published ? styles.policyAllowed : styles.policyReview, { marginTop: 14 }]}>
        <Text style={styles.policyName}>ETSY İLANI #{draft.listingId}</Text>
        <Text style={styles.policyLabel}>{published ? "Yayında" : "Taslak hazır · henüz yayında değil"}</Text>
        <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 6 }]} onPress={() => published ? openUrl(published.url, "Etsy ilanı") : openUrl(draft.editUrl, "Etsy taslak ilanı")}><Text style={styles.secondaryButtonText}>{published ? "İlanı aç" : "Taslağı kontrol et"}</Text></Pressable>
        {!published && <EtsyVideoUpload listingId={draft.listingId} />}
        {!published && <Pressable style={[styles.analyzeButton, { marginTop: 12 }, publishing && styles.primaryDisabled]} disabled={publishing} onPress={publish}>{publishing ? <ActivityIndicator color="white" /> : <Ionicons name="rocket-outline" size={18} color="white" />}<Text style={styles.primaryText}>Etsy'de yayınla</Text></Pressable>}
      </View>}
  </>;
}

const PHOTO_KINDS = [
  { id: "knitwear", label: "Örgü / tığ işi" },
  { id: "tesbih", label: "Tesbih" },
  { id: "vintage", label: "Vintage" },
  { id: "other", label: "Diğer el yapımı" }
];
const KNIT_MAKER_OPTIONS = [
  { id: "me", label: "Ben ördüm" },
  { id: "member", label: "Ailemden biri ördü (mağaza üyesi)" }
];
const KNIT_CRAFT_OPTIONS = [{ id: "crochet", label: "Tığ işi" }, { id: "knit", label: "Şiş örgü" }];
const AUDIENCE_OPTIONS = [{ id: "women", label: "Kadın" }, { id: "men", label: "Erkek" }, { id: "unisex", label: "Unisex" }];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "One size"].map((id) => ({ id, label: id === "One size" ? "Tek beden" : id }));
const CARE_OPTIONS = [{ id: "hand_wash", label: "Elde, soğuk su" }, { id: "machine_gentle", label: "Makinede hassas" }, { id: "dry_clean", label: "Kuru temizleme" }];
const RISK_LABELS: Record<string, string> = {
  childrens_product: "Bebek/çocuk ürünü gibi görünüyor: ABD çocuk ürünü güvenlik bilgisi olmadan Etsy'ye otomatik konmaz.",
  branded_product: "Marka logosu görünüyor: orijinallik kanıtı olmadan Etsy'ye otomatik konmaz."
};
const MAX_LISTING_PHOTOS = 10;
const CONDITION_OPTIONS = [
  { id: "excellent", label: "Kusursuz" },
  { id: "light_wear", label: "Hafif kullanım izi" },
  { id: "visible_wear", label: "Belirgin aşınma / patina" },
  { id: "repaired", label: "Onarım görmüş" }
];

// "2.500" Türkçede iki bin beş yüz demektir; sunucuya 2500 gitmeli.
function parseAmount(text: string): number | undefined {
  const clean = text.trim().replace(/\s/g, "");
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean) ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(",", ".");
  const value = Number(normalized);
  return value > 0 ? value : undefined;
}

// Analiz için küçük (1024 px), Etsy için büyük (3000 px) kopya; büyük telefon fotoğrafı sunucuyu ve kotayı yormaz.
async function shrinkPhoto(photo: { uri: string; width?: number; height?: number }, longest: number, compress: number, base64 = false) {
  const context = ImageManipulator.manipulate(photo.uri);
  const width = photo.width || 0;
  const height = photo.height || 0;
  if (Math.max(width, height) > longest) context.resize(width >= height ? { width: longest } : { height: longest });
  const image = await context.renderAsync();
  return await image.saveAsync({ compress, format: SaveFormat.JPEG, base64 });
}

// Shopier'e eklemeden: fotoğraf → ürün türü ve ölçüler → Etsy araştırması → başlık, etiket, açıklama, fiyat → taslak → yayın.
// ——— İlan karnesi ———
function ScorecardView({ card, busy, onRefresh }: any) {
  if (!card && !busy) return null;
  const failing = (card?.checks || []).filter((item: any) => !item.ok);
  const passing = (card?.checks || []).length - failing.length;
  const pill = !card ? styles.scoreMid : card.score >= 85 ? styles.scoreHigh : card.score >= 50 ? styles.scoreMid : styles.scoreLow;
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}>
      <Ionicons name="ribbon-outline" size={22} color="#315B4C" />
      <Text style={[styles.cardTitle, { flex: 1 }]}>İlan karnesi{card ? `: ${card.score}/100` : ""}</Text>
      {!!card && <View style={[styles.kindPill, pill]}><Text style={styles.kindText}>{card.grade} · {card.gradeTr}</Text></View>}
    </View>
    {busy && <ActivityIndicator color="#C88B47" />}
    {failing.map((item: any) => <Text style={styles.warningText} key={item.id}>• {item.fixTr}</Text>)}
    {!!card && <Text style={styles.small}>{passing} madde tamam{failing.length ? ` · ${failing.length} düzeltme önerisi` : ""}. Başlık ve etiketi değiştirince karneyi yenileyin.</Text>}
    {!!onRefresh && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }, busy && styles.primaryDisabled]} disabled={busy} onPress={onRefresh}><Text style={styles.secondaryButtonText}>Karneyi yenile</Text></Pressable>}
  </View>;
}

// Mağazadaki yayında ve taslak ilanların karnesi; en düşük puanlı önce.
function ShopListingsScorecard({ online }: any) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [code, setCode] = useState<string>();
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/listings/scorecard", { headers: apiHeaders() })); setError(""); setCode(undefined); }
    catch (err) { setError(errorText(err)); setCode(errorCode(err)); }
    finally { setLoading(false); }
  };
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Ionicons name="ribbon-outline" size={22} color="#315B4C" /><Text style={[styles.cardTitle, { flex: 1 }]}>İlanlarımın karnesi</Text></View>
    <Text style={styles.evidence}>Etsy'deki yayında ve taslak ilanlarınızı başlık, etiket, açıklama ve fotoğraf açısından puanlar; en zayıf ilan en üstte.</Text>
    <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }, (!online || loading) && styles.primaryDisabled]} disabled={!online || loading} onPress={load}><Text style={styles.secondaryButtonText}>{loading ? "Puanlanıyor…" : data ? "Yenile" : "Karneleri göster"}</Text></Pressable>
    {!!error && <Text style={styles.shopierBlocker}>{code === "NOT_CONNECTED" ? "Etsy mağazası açılınca ilanlarınız burada puanlanır." : error}</Text>}
    {code === "AUTH_FAILED" && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={connectEtsy}><Text style={styles.secondaryButtonText}>Etsy bağlantısını yenile</Text></Pressable>}
    {!!data && !data.items.length && <Text style={styles.small}>Etsy'de henüz ilan yok.</Text>}
    {(data?.items || []).map((item: any) => <View key={item.listingId} style={styles.card}>
      <View style={styles.shopierProductTop}>
        <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
        <View style={[styles.kindPill, item.score >= 85 ? styles.scoreHigh : item.score >= 50 ? styles.scoreMid : styles.scoreLow]}><Text style={styles.kindText}>{item.score} · {item.grade}</Text></View>
      </View>
      <Text style={styles.small}>{item.state === "active" ? "Yayında" : "Taslak"}</Text>
      {item.checks.filter((check: any) => !check.ok).slice(0, 3).map((check: any) => <Text style={styles.warningText} key={check.id}>• {check.fixTr}</Text>)}
      <Pressable onPress={() => openUrl(item.editUrl, "Etsy ilan düzenleme")}><Text style={styles.linkNote}>Etsy'de düzenle</Text></Pressable>
    </View>)}
  </View>;
}

// ——— Mağaza hazırlığı ———
// Açılıştan önce hangi adımın bittiğini Etsy'den okur. Kargo profili ve iade politikası uygulamadan oluşturulur;
// ödeme, kimlik ve banka adımlarını yalnız satıcı Etsy'de yapar.
const RETURN_CHOICES = [{ id: "30", label: "30 gün iade ve değişim (önerilen)" }, { id: "14", label: "14 gün" }, { id: "none", label: "İade kabul etmiyorum" }];

function ShopReadinessCard({ online, onSell }: any) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<string>();
  const [postal, setPostal] = useState("");
  const [shipCost, setShipCost] = useState("");
  const [minDays, setMinDays] = useState("7");
  const [maxDays, setMaxDays] = useState("21");
  const [processing, setProcessing] = useState("3");
  const [returns, setReturns] = useState("30");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/readiness", { headers: apiHeaders() })); setError(""); }
    catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const act = (item: any) => {
    if (item.action === "connect" || item.action === "reauth") return connectEtsy();
    if (item.action === "open_url" && item.url) return openUrl(item.url, item.titleTr);
    if (item.action === "create_shipping_profile") return setForm(form === "shipping" ? undefined : "shipping");
    if (item.action === "create_return_policy") return setForm(form === "returns" ? undefined : "returns");
    if (item.action === "sell") return onSell?.();
    if (item.action === "shop_settings") return Alert.alert("Mağaza vitrini", "Bu kartın hemen altındaki 'Mağaza vitrini' kartını açın; başlık, duyuru ve satış mesajları tek dokunuşla Etsy'ye yazılır.");
  };
  const post = async (path: string, body: any, done: string) => {
    setBusy(true);
    try {
      const result = await apiJson(path, { method: "POST", headers: apiHeaders(true), body: JSON.stringify(body) });
      Alert.alert("Tamam", result.alreadyExisted ? "Etsy'de zaten vardı; yenisi açılmadı." : done);
      setForm(undefined);
      await load();
    } catch (err) { Alert.alert("Oluşturulamadı", errorText(err)); }
    finally { setBusy(false); }
  };
  const icon = (state: string) => state === "done" ? "checkmark-circle" : state === "manual" ? "hand-left-outline" : state === "optional" ? "remove-circle-outline" : "ellipse-outline";
  const color = (state: string) => state === "done" ? "#2E8B57" : state === "manual" ? "#8A521F" : state === "optional" ? "#A8B0AB" : "#748079";
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}>
      <Ionicons name="storefront-outline" size={22} color="#315B4C" />
      <Text style={[styles.cardTitle, { flex: 1 }]}>Mağaza hazırlığı{data ? ` · ${data.done}/${data.total}` : ""}</Text>
      <Pressable style={[styles.secondaryButton, (!online || loading) && styles.primaryDisabled]} disabled={!online || loading} onPress={load}><Text style={styles.secondaryButtonText}>{loading ? "…" : "Yenile"}</Text></Pressable>
    </View>
    {!!data && <View style={styles.stepBar}>{data.items.filter((item: any) => item.state !== "manual" && item.state !== "optional").map((item: any) => <View key={item.id} style={[styles.stepDot, item.state === "done" && styles.stepDotActive]} />)}</View>}
    {!!data && data.shopOpen !== undefined && <Text style={[styles.nextAction, { marginBottom: 6 }]}>Mağaza durumu: {data.shopOpen ? "açık (yayında ilan var)" : "yayında ilan yok — alıcılar aramada ürün göremez"}</Text>}
    <Text style={styles.evidence}>Satışa başlamak için gereken adımlar. El simgeli adımları yalnız siz Etsy'de yaparsınız (kimlik, banka, logo); gri çizgili adımlar yalnız fiziksel ürün satarsanız gerekir; diğerlerini uygulama gösterir ya da sizin yerinize yapar.</Text>
    {!!error && <Text style={styles.shopierBlocker}>{error}</Text>}
    {(data?.items || []).map((item: any) => <View key={item.id}>
      <Pressable style={styles.readinessRow} disabled={!item.action || item.state === "done"} onPress={() => act(item)}>
        <Ionicons name={icon(item.state) as any} size={20} color={color(item.state)} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.titleTr}</Text>
          <Text style={styles.small}>{item.detailTr}</Text>
        </View>
        {item.state !== "done" && !!item.action && <Ionicons name="chevron-forward" size={18} color="#748079" />}
      </Pressable>
      {item.id === "shipping" && form === "shipping" && <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>Kargo profili: Türkiye → ABD, kargo alıcıya ait</Text>
        <Text style={styles.small}>Alıcı kargo ücretini ilan sayfasında ve ödemede görür ve öder. Etsy kargo ücretinden de kesinti alır; ilan planındaki "kargo profiline yazın" tutarını kullanın. Teslim süresini kargo firmanıza sorun; PTT ile genelde 1–3 hafta, hızlı kargoyla birkaç gün.</Text>
        <Field label="Alıcının ödeyeceği kargo ücreti (TL, ilk ürün)" value={shipCost} onChangeText={setShipCost} keyboardType="decimal-pad" placeholder="650" />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Teslim en az (iş günü)" value={minDays} onChangeText={setMinDays} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Teslim en çok (iş günü)" value={maxDays} onChangeText={setMaxDays} keyboardType="number-pad" /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Kargoya veriş (en çok gün)" value={processing} onChangeText={setProcessing} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Posta kodunuz (önerilir)" value={postal} onChangeText={setPostal} keyboardType="number-pad" placeholder="34000" /></View>
        </View>
        <Pressable style={[styles.primary, { marginTop: 10, marginBottom: 0 }, (busy || !online) && styles.primaryDisabled]} disabled={busy || !online} onPress={() => (Number(shipCost.replace(",", ".")) > 0 ? undefined : Alert.alert("Kargo ücreti", "Alıcının ödeyeceği kargo ücretini TL olarak girin.")) ?? post("/api/etsy/shipping-profile", { postalCode: postal.trim() || undefined, costTry: Number(shipCost.replace(",", ".")), minDeliveryDays: Number(minDays), maxDeliveryDays: Number(maxDays), maxProcessingDays: Number(processing) }, "Kargo profili Etsy'de oluşturuldu.")}>{busy ? <ActivityIndicator color="white" /> : <Ionicons name="cube" size={18} color="white" />}<Text style={styles.primaryText}>Kargo profilini oluştur</Text></Pressable>
      </View>}
      {item.id === "returns" && form === "returns" && <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>İade politikası</Text>
        <Text style={styles.small}>Alıcı iade kargosunu kendisi öder. İade kabul etmek alıcıya güven verir; kabul etmezseniz Etsy ilanda "iade kabul edilmez" yazar.</Text>
        <ChipGroup options={RETURN_CHOICES} value={returns} onChange={setReturns} />
        <Pressable style={[styles.primary, { marginTop: 10, marginBottom: 0 }, (busy || !online) && styles.primaryDisabled]} disabled={busy || !online} onPress={() => post("/api/etsy/return-policy", returns === "none" ? { acceptsReturns: false } : { acceptsReturns: true, deadlineDays: Number(returns) }, "İade politikası Etsy'de oluşturuldu.")}>{busy ? <ActivityIndicator color="white" /> : <Ionicons name="return-up-back" size={18} color="white" />}<Text style={styles.primaryText}>İade politikasını oluştur</Text></Pressable>
      </View>}
    </View>)}
  </View>;
}

// ——— Etsy siparişleri ———
// En önemli bilgi son kargo tarihi: geç kargo yeni mağazanın puanını düşürür. Takip numarası buradan Etsy'ye
// yazılınca alıcıya Etsy'den bildirim gider.
const SHIPPED_NOTE_EN = "Your order is on its way from Türkiye! You can follow it with the tracking number. Thank you for your purchase!";

function urgencyText(order: any): string {
  if (order.urgency === "late") return `GECİKTİ · ${Math.abs(order.daysLeft ?? 0)} gün`;
  if (order.urgency === "today") return "BUGÜN kargola";
  if (order.urgency === "digital") return "Dijital · kargo yok";
  if (order.urgency === "done") return "Kargoda";
  return typeof order.daysLeft === "number" ? `${order.daysLeft} gün kaldı` : "Kargo bekliyor";
}

function EtsyOrdersPanel({ online, compact }: any) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [code, setCode] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [carriers, setCarriers] = useState<string[]>([]);
  const load = async () => {
    setLoading(true);
    try { setData(await apiJson("/api/etsy/orders", { headers: apiHeaders() })); setError(""); setCode(undefined); }
    catch (err) { setError(errorText(err)); setCode(errorCode(err)); }
    finally { setLoading(false); }
  };
  const loadCarriers = async () => {
    if (carriers.length) return;
    try { setCarriers((await apiJson("/api/etsy/carriers", { headers: apiHeaders() })).carriers || []); } catch { /* elle yazılır */ }
  };
  useEffect(() => { if (online) load(); }, [online]);
  const orders = data?.orders || [];
  const visible = compact ? orders.filter((order: any) => !order.shipped && !order.digitalOnly).slice(0, 3) : orders;
  if (compact && !visible.length) return null;
  const noShop = code === "NOT_CONNECTED";
  return <>
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{compact ? "Gönderilecek Etsy siparişleri" : "Etsy siparişleri"}</Text>
      <Pressable style={[styles.secondaryButton, (!online || loading) && styles.primaryDisabled]} disabled={!online || loading} onPress={load}><Text style={styles.secondaryButtonText}>{loading ? "Yükleniyor…" : "Yenile"}</Text></Pressable>
    </View>
    {!compact && <View style={styles.guardrail}><Ionicons name="information-circle-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Sipariş gelince: ürünü paketleyin, kargoya verin, takip numarasını buradan girin; Etsy alıcıya bildirir. Son kargo tarihini kaçırmayın, geç kargo mağaza puanını düşürür. Siparişten anında haberdar olmak için telefonunuza Etsy'nin "Sell on Etsy" uygulamasını da kurun.</Text></View>}
    {loading && !data && <ActivityIndicator color="#C88B47" />}
    {!!error && (noShop
      ? <Empty icon="storefront-outline" title="Siparişler mağaza açılınca gelir" text="Etsy mağazası açılıp ilk sipariş geldiğinde burada son kargo tarihiyle görünür." />
      : <View><Text style={styles.shopierBlocker}>{error}</Text>{code === "AUTH_FAILED" && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={connectEtsy}><Text style={styles.secondaryButtonText}>Etsy bağlantısını yenile</Text></Pressable>}</View>)}
    {!!data && !compact && <Text style={styles.analysisLine}>Gönderilecek: {data.counts?.toShip ?? 0} · Geciken: {data.counts?.late ?? 0}</Text>}
    {!!data && !orders.length && !compact && <Empty icon="receipt-outline" title="Henüz sipariş yok" text="İlk sipariş gelince burada son kargo tarihiyle görünür." />}
    {visible.map((order: any) => <OrderCard key={order.receiptId} order={order} online={online} canAddTracking={Boolean(data?.canAddTracking)} carriers={carriers} onNeedCarriers={loadCarriers} onUpdated={(next: any) => setData((current: any) => ({ ...current, orders: current.orders.map((row: any) => row.receiptId === next.receiptId ? next : row) }))} />)}
  </>;
}

function OrderCard({ order, online, canAddTracking, carriers, onNeedCarriers, onUpdated }: any) {
  const [open, setOpen] = useState(order.urgency === "late" || order.urgency === "today");
  const [carrier, setCarrier] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState(SHIPPED_NOTE_EN);
  const [sending, setSending] = useState(false);
  const [noteHelp, setNoteHelp] = useState<any>();
  const [translating, setTranslating] = useState(false);
  const pillStyle = order.urgency === "late" || order.urgency === "today" ? styles.scoreLow : order.urgency === "soon" ? styles.scoreMid : styles.scoreHigh;
  const needsShipping = !order.shipped && !order.digitalOnly;
  useEffect(() => { if (open && needsShipping) onNeedCarriers(); }, [open]);
  const send = async () => {
    setSending(true);
    try {
      const result = await apiJson("/api/etsy/orders/tracking", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ receiptId: order.receiptId, trackingCode: code, carrierName: carrier, noteToBuyer: note }) });
      onUpdated(result.order);
      Alert.alert("Gönderildi", "Takip numarası Etsy'ye yazıldı; alıcıya Etsy'den bildirim gitti.");
    } catch (err) { Alert.alert("Takip numarası gönderilemedi", errorText(err)); }
    finally { setSending(false); }
  };
  const translateNote = async () => {
    setTranslating(true);
    try { setNoteHelp(await apiJson("/api/messages/assist", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ text: order.buyerNote, productName: order.items?.[0]?.title }) })); }
    catch (err) { Alert.alert("Çevrilemedi", errorText(err)); }
    finally { setTranslating(false); }
  };
  const created = order.createdAt ? new Date(order.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "";
  const shipBy = order.shipBy ? new Date(order.shipBy).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }) : "";
  return <View style={styles.card}>
    <Pressable style={styles.shopierProductTop} onPress={() => setOpen(!open)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{order.buyerName}{order.countryIso ? ` · ${order.countryIso}` : ""}</Text>
        <Text style={styles.small}>{created ? `${created} · ` : ""}{order.totalText || ""}{order.isGift ? " · hediye" : ""}</Text>
      </View>
      <View style={[styles.kindPill, pillStyle]}><Text style={styles.kindText}>{urgencyText(order)}</Text></View>
    </Pressable>
    {order.items.map((item: any, index: number) => <Text style={styles.analysisLine} key={`${item.listingId}-${index}`}>• {item.quantity} × {item.title}{item.variations.length ? ` (${item.variations.join(", ")})` : ""}</Text>)}
    {!!shipBy && needsShipping && <Text style={styles.nextAction}>Son kargo tarihi: {shipBy}</Text>}
    {open && <>
      {!!order.address && <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>Kargo adresi (kargo fişine aynen yazın)</Text>
        <Text selectable style={styles.evidence}>{order.address}</Text>
        <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={() => Share.share({ message: order.address })}><Text style={styles.secondaryButtonText}>Adresi kopyala / paylaş</Text></Pressable>
      </View>}
      {!!order.giftMessage && <Text style={styles.evidence}>Hediye notu (pakete koyun): {order.giftMessage}</Text>}
      {!!order.buyerNote && <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>Alıcının notu</Text>
        <Text selectable style={styles.evidence}>{order.buyerNote}</Text>
        {!noteHelp && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }, (!online || translating) && styles.primaryDisabled]} disabled={!online || translating} onPress={translateNote}><Text style={styles.secondaryButtonText}>{translating ? "Çevriliyor…" : "Türkçesi ve cevap önerisi"}</Text></Pressable>}
        {!!noteHelp && <MessageResult result={noteHelp} />}
      </View>}
      {order.tracking.map((row: any) => <Text style={styles.analysisLine} key={row.code}>Takip: {row.carrier} · {row.code}</Text>)}
      {needsShipping && (canAddTracking ? <View style={styles.adviceBox}>
        <Text style={styles.rowTitle}>Kargoya verdim</Text>
        {carriers.length ? <ChipGroup options={carriers.map((name: string) => ({ id: name, label: name }))} value={carrier} onChange={setCarrier} />
          : <Field label="Kargo firması" value={carrier} onChangeText={setCarrier} placeholder="PTT, UPS, DHL…" />}
        <Field label="Takip numarası (kargo fişindeki)" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="ör. RR123456789TR" />
        <Field label="Alıcıya not (İngilizce, hazır)" value={note} onChangeText={setNote} multiline />
        <Pressable style={[styles.primary, { marginTop: 10, marginBottom: 0 }, (sending || !online) && styles.primaryDisabled]} disabled={sending || !online} onPress={send}>{sending ? <ActivityIndicator color="white" /> : <Ionicons name="paper-plane" size={18} color="white" />}<Text style={styles.primaryText}>Takip numarasını Etsy'ye gönder</Text></Pressable>
      </View> : <View style={styles.adviceBox}>
        <Text style={styles.evidence}>Takip numarasını uygulamadan göndermek için Etsy iznini bir kez yenilemeniz gerekir (yeni izin: sipariş kargo bilgisi yazma).</Text>
        <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={connectEtsy}><Text style={styles.secondaryButtonText}>Etsy iznini yenile</Text></Pressable>
      </View>)}
    </>}
    <Pressable onPress={() => setOpen(!open)}><Text style={styles.linkNote}>{open ? "Kapat" : "Adres, not ve kargo için dokunun"}</Text></Pressable>
  </View>;
}

// ——— Alıcı mesajı yardımcısı ———
// Etsy mesajlaşmayı programlara açmaz: satıcı mesajı yapıştırır, cevabı kopyalayıp Etsy'ye yapıştırır.
function MessageResult({ result }: any) {
  return <View style={{ marginTop: 10 }}>
    {!!result.noticeTr && <Text style={styles.shopierBlocker}>{result.noticeTr}</Text>}
    {(result.warningsTr || []).map((warning: string) => <Text style={styles.warningText} key={warning}>⚠ {warning}</Text>)}
    {!!result.translationTr && <><Text style={styles.rowTitle}>Türkçesi</Text><Text selectable style={styles.evidence}>{result.translationTr}</Text></>}
    {!!result.intentTr && <Text style={styles.nextAction}>Ne istiyor: {result.intentTr}</Text>}
    {!!result.replyEn && <View style={styles.adviceBox}>
      <Text style={styles.rowTitle}>Önerilen cevap (İngilizce, Etsy'ye yapıştırın)</Text>
      <Text selectable style={styles.evidence}>{result.replyEn}</Text>
      {/\[[^\]]+\]/.test(result.replyEn) && <Text style={styles.warningText}>Köşeli parantezli yerleri ([…]) göndermeden önce doldurun.</Text>}
      <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={() => Share.share({ message: result.replyEn })}><Text style={styles.secondaryButtonText}>Cevabı kopyala / paylaş</Text></Pressable>
      {!!result.replyTr && <Text style={[styles.small, { marginTop: 8 }]}>Türkçe anlamı: {result.replyTr}</Text>}
    </View>}
  </View>;
}

function MessageHelperCard({ online }: any) {
  const [productName,setProductName]=useState("");
  const [noticeRevision,setNoticeRevision]=useState(0);
  const notifyRequest=(path:string,body?:unknown)=>apiJson(path,body===undefined?{headers:apiHeaders()}:{method:"POST",headers:apiHeaders(true),body:JSON.stringify(body)});
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (text.trim().length < 2) return Alert.alert("Mesaj", "Alıcının mesajını kopyalayıp buraya yapıştırın (kutuya uzun basın → Yapıştır).");
    setBusy(true);
    try { setResult(await apiJson("/api/messages/assist", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ text, sellerNoteTr: note,productName }) }));setNoticeRevision(value=>value+1); }
    catch (err) { Alert.alert("Hazırlanamadı", errorText(err)); }
    finally { setBusy(false); }
  };
  return <View style={styles.analysisCard}>
    <View style={styles.shopierProductTop}><Ionicons name="chatbubbles-outline" size={22} color="#315B4C" /><Text style={[styles.cardTitle, { flex: 1 }]}>Alıcı mesajı yardımcısı</Text></View>
    <Text style={styles.evidence}>Etsy'de gelen İngilizce mesajı kopyalayıp buraya yapıştırın. Türkçesini, alıcının ne istediğini ve gönderebileceğiniz İngilizce cevabı hazırlarım. Etsy mesajları uygulamalara kapalı olduğu için cevabı siz kopyalayıp Etsy'ye yapıştırırsınız.</Text>
    <Field label="İlgili ürün (isteğe bağlı)" value={productName} onChangeText={(value:string)=>{setProductName(value);setResult(undefined);}} />
    <Field label="Alıcının mesajı" value={text} onChangeText={(value:string)=>{setText(value);setResult(undefined);}} multiline placeholder="Hi! Is this available in size L?" />
    <Field label="Ne cevap vermek istersiniz? (Türkçe, isteğe bağlı)" value={note} onChangeText={(value:string)=>{setNote(value);setResult(undefined);}} multiline placeholder="ör. L beden yok, M var; göğüs 54 cm" />
    <Pressable style={[styles.primary, { marginTop: 10, marginBottom: 0 }, (busy || !online) && styles.primaryDisabled]} disabled={busy || !online} onPress={run}>{busy ? <ActivityIndicator color="white" /> : <Ionicons name="language" size={18} color="white" />}<Text style={styles.primaryText}>{busy ? "Hazırlanıyor…" : "Türkçesini ve cevabı hazırla"}</Text></Pressable>
    {!!result && <MessageResult result={result} />}
    {!!result?.notification&&<Text style={styles.formHint}>{result.notification.queued?"Size özel bildirim kuyruğuna alındı; kanal sonucunu aşağıdan kontrol edin.":result.notification.reasonTr}</Text>}
    <OwnerNotificationsPanel online={online} request={notifyRequest} revision={noticeRevision}/>
    <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 12 }]} onPress={() => openUrl("https://www.etsy.com/messages", "Etsy mesajları")}><Text style={styles.secondaryButtonText}>Etsy mesajlarını aç</Text></Pressable>
  </View>;
}

// ——— Basit mod ekranları ———

function HomeTile({ icon, title, text, onPress }: any) {
  return <Pressable style={({ pressed }) => [styles.homeTile, pressed && styles.rowPressed]} onPress={onPress} accessibilityRole="button">
    <View style={styles.homeTileIcon}><Ionicons name={icon} size={24} color="white" /></View>
    <View style={{ flex: 1 }}><Text style={styles.homeTileTitle}>{title}</Text><Text style={styles.homeTileText}>{text}</Text></View>
    <Ionicons name="chevron-forward" size={20} color="#748079" />
  </Pressable>;
}

function HomeScreen({ online, channels, setTab, openSell }: any) {
  const etsy = channels?.etsy || {};
  const shopier = channels?.shopier || {};
  const etsyShop = Boolean(etsy.shopReady || etsy.shopId);
  const etsyLine = etsyShop
    ? etsyShopLine(etsy)
    : etsy.authorized || etsy.connected ? "Hesap bağlı · mağaza adı henüz seçilmedi" : "Bağlı değil";
  const shopierLine = shopier.connected ? `Bağlı · ${shopier.productCount ?? 0} ürün` : "Bağlı değil";
  const nextStep = !online
    ? "Önce internete bağlanın; üstteki 'Yeniden bağlan' düğmesine basın."
    : !etsyShopOpen(etsy)
      ? "Etsy'de yayında ilanınız yok. İlk ilanı hazırlayın: 'Ürün sat' ya da uzman mod → Dijital ürünler. Eksik adımlar: Yardım → Mağaza hazırlığı."
      : "İlanlarınızı alıcılara göstermek için 'Müşteri bul' planını hazırlayın.";
  return <>
    <ListingMascot title="Merhaba, ben Goxi" instruction="İlan açarken sana sıradaki işi göstereceğim. Önce ne satacağını seçelim; her aşamada gerçek durumuna göre devam edeceğiz." actionLabel="İlan açmaya başlayalım" onAction={() => openSell("choose")} />
    <Text style={styles.homeHello}>Ne yapmak istiyorsunuz?</Text>
    <HomeTile icon="camera" title="Ürün sat" text="Ürünün fotoğrafını çekin; başlık, açıklama, etiket ve fiyat sizin için hazırlanır." onPress={() => openSell("choose")} />
    <HomeTile icon="receipt" title="Siparişler" text="Gelen Etsy siparişleri, son kargo tarihi ve takip numarası." onPress={() => setTab("Siparişler")} />
    <HomeTile icon="megaphone" title="Müşteri bul" text="Ürününüz için Instagram, WhatsApp ve Etsy'de ne yapılacağı ve reklam bütçesi." onPress={() => setTab("Müşteri")} />
    <HomeTile icon="trending-up" title="Ne satsam?" text="Etsy'de şu an aranan ürünler ve yaklaşan özel günler." onPress={() => openSell("trend")} />
    <HomeTile icon="help-circle" title="Yardım ve adımlar" text="Etsy mağazası nasıl açılır, para nereye gelir, sorun olursa ne yapılır." onPress={() => setTab("Yardım")} />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Durum</Text>
      <Text style={styles.analysisLine}>Etsy: {etsyLine}</Text>
      <Text style={styles.analysisLine}>Shopier: {shopierLine}</Text>
      <Text style={[styles.nextAction, { marginTop: 8 }]}>Sıradaki adım: {nextStep}</Text>
    </View>
  </>;
}

function ChoiceTile({ icon, title, text, onPress }: any) {
  return <Pressable style={({ pressed }) => [styles.homeTile, pressed && styles.rowPressed]} onPress={onPress} accessibilityRole="button">
    <View style={[styles.homeTileIcon, { backgroundColor: "#A86B2E" }]}><Ionicons name={icon} size={22} color="white" /></View>
    <View style={{ flex: 1 }}><Text style={styles.homeTileTitle}>{title}</Text><Text style={styles.homeTileText}>{text}</Text></View>
  </Pressable>;
}

const SELL_BACK: Record<SellRoute, SellRoute> = { choose: "choose", where: "choose", photo: "where", shopier: "where", digital: "choose", trend: "choose" };

function SellScreen({ online, active=true, productionResume, channels, route, setRoute, onStepChange, setTab }: any) {
  const etsy = channels?.etsy || {};
  const etsyReady = Boolean(etsy.shopReady || etsy.shopId);
  const back = route !== "choose" && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginBottom: 12 }]} onPress={() => setRoute(SELL_BACK[route as SellRoute])}><Text style={styles.secondaryButtonText}>{route === "photo" ? "← Ürün seçimine dön" : "← Geri"}</Text></Pressable>;
  // Fotoğraflı ilan her zaman yüklü kalır (yalnız gizlenir): başka ekrana geçmek yarım kalan ilanı silmez.
  // Yeni ürün için sihirbazın sonundaki "Yeni ürüne başla" kullanılır.
  return <>
    <View style={route === "photo" ? undefined : styles.hidden}>{route === "photo" && back}<PhotoListingStudio online={online} etsyReady={etsyReady} wizard onStepChange={onStepChange} /></View>
    {route !== "photo" && <SellRouteContent online={online} active={active} productionResume={productionResume} channels={channels} route={route} setRoute={setRoute} setTab={setTab} back={back} />}
  </>;
}

function SellRouteContent({ online, active=true, productionResume, channels, route, setRoute, setTab, back }: any) {
  if (route === "choose") return <>
    <ListingMascot title="Önce satacağın ürünü seç" instruction="Elindeki fiziksel ürünü fotoğraflarla, dijital ürünü dosyalarla hazırlayacağız. Aşağıdan sana uygun seçeneğe dokun; henüz karar vermediysen fikir bölümünü aç." />
    <Text style={styles.homeHello}>Ne satacaksınız?</Text>
    <ChoiceTile icon="cube-outline" title="Elimdeki bir ürünü" text="Tesbih, vintage eşya, örgü kazak/hırka ya da başka bir ürün. Fotoğrafını çekip satarsınız." onPress={() => setRoute("where")} />
    <ChoiceTile icon="document-text-outline" title="Dijital ürün ya da kendi deseniniz" text="Planlayıcı, boyama sayfası, junk journal kiti gibi indirilebilir dosya ya da kendi yazıp denediğiniz örgü deseni. Kargo yok; bir kez hazırlanır, çok satılır." onPress={() => setRoute("digital")} />
    <ChoiceTile icon="bulb-outline" title="Bilmiyorum, fikir ver" text="Etsy'de şu an aranan ve rakibi az olan ürünleri gösteririm." onPress={() => setRoute("trend")} />
    <ShopListingsScorecard online={online} />
  </>;
  if (route === "where") return <>
    {back}
    <ListingMascot title="Satış kanalını seç" instruction="Etsy için İngilizce ilan ve yurt dışı kargo, Shopier için Türkçe ilan ve yurt içi satış yolunu izle. Aşağıdan istediğin kanala dokun." />
    <Text style={styles.homeHello}>Nerede satılsın?</Text>
    <ChoiceTile icon="globe-outline" title="Etsy (ABD'deki alıcılar)" text="Dolarla satış, yurt dışına kargo. İlan İngilizce hazırlanır; size Türkçesi gösterilir." onPress={() => setRoute("photo")} />
    <ChoiceTile icon="bag-handle-outline" title="Shopier (Türkiye'deki alıcılar)" text="TL ile satış, yurt içi kargo. Instagram ve WhatsApp'tan gelen müşteri için." onPress={() => setRoute("shopier")} />
  </>;
  if (route === "shopier") return <>
    {back}
    <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Shopier'de ürün ekleme</Text>
      <Text style={styles.analysisLine}>1. Shopier uygulamasını ya da shopier.com'u açın → Ürünler → Yeni ürün.</Text>
      <Text style={styles.analysisLine}>2. Fotoğraf, Türkçe ürün adı, açıklama, fiyat (TL), kargo ve stok girin; kaydedin.</Text>
      <Text style={styles.analysisLine}>3. Ürün birkaç dakika içinde bu uygulamada görünür (Shopier bağlıysa).</Text>
      <Text style={styles.analysisLine}>4. Sonra 'Müşteri bul' bölümünde ürünü seçin: Instagram gönderi metni, WhatsApp 'Bana yaz' bağlantısı ve hazır yanıtlar hazırlanır.</Text>
    </View>
    <Pressable style={styles.primary} onPress={() => openUrl("https://www.shopier.com/", "Shopier")}><Text style={styles.primaryText}>Shopier'i aç</Text><Ionicons name="open-outline" size={18} color="white" /></Pressable>
    <Pressable style={styles.secondaryButton} onPress={() => setTab("Müşteri")}><Text style={styles.secondaryButtonText}>Müşteri bul'a geç</Text></Pressable>
  </>;
  return <>
    {back}
    {route === "digital" && <View style={styles.guardrail}><Ionicons name="information-circle-outline" size={20} color="#315B4C" /><Text style={[styles.guardrailText, { flex: 1 }]}>Goxi açık çalışmanı ve sıradaki işi gösterir. Üretimi aynı ChatGPT/Claude sohbetinde sürdür; son dosyaları indirip aynı ilan kaydına yükle. Kendi desenin için yalnız yazıp denediğin dosyaları kullan.</Text></View>}
    <EtsyScreen key={route} online={online} active={active} productionResume={productionResume} channels={channels} initialSection={route === "digital" ? "Stüdyo" : "Trend"} />
  </>;
}

function HelpScreen({ online, channels, onExpert, onSell }: any) {
  const etsy = channels?.etsy || {};
  const shopReady = Boolean(etsy.shopReady || etsy.shopId);
  return <>
    <LiveDeviceCheck />
    <ShopReadinessCard online={online} onSell={onSell} />
    <ShopSettingsCard online={online} shopReady={shopReady} />
    <EtsyGuide shopReady={shopReady} authorized={Boolean(etsy.authorized || etsy.connected)} />
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Uzman mod</Text>
      <Text style={styles.evidence}>Shopier yönetimi, Onaylar, Müşteriler, Pinterest, dijital ürün stüdyosu ve ayrıntılı trend ekranları uzman moddadır. İstediğiniz zaman Özet ekranının altından basit moda dönebilirsiniz.</Text>
      <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 10 }]} onPress={onExpert}><Text style={styles.secondaryButtonText}>Uzman moda geç</Text></Pressable>
    </View>
    <Text style={styles.versionText}>{appVersionText()}</Text>
    <Text style={styles.versionMeta}>{updateChannelText()}</Text>
    <UpdateCheckButton />
  </>;
}

// wizard: basit modda aynı form beş adıma bölünür; her adımda yalnız o konunun alanları görünür ve
// "İleri" eksik bilgiyi söyler. Uzman modda form tek sayfadır.
const WIZARD_STEPS = ["Fotoğraflar", "Ürün bilgisi", "Renk ve özellikler", "Fiyat ve kargo", "Önizleme ve gönder"];
const WIZARD_HINTS = [
  "Ürünün 1–10 gerçek fotoğrafını çekin veya galeriden seçin (5+ önerilir). İsterseniz 'Fotoğraftan otomatik doldur' ile tür ve adı önerdirin; İleri düğmesi kendiliğinden analiz yapmaz.",
  "Ürün türünü, adını ve doğruladığınız bilgileri yazın. Otomatik doldurma veya sohbet analizi öneri getirdiyse kontrol edin; emin olmadığınız bilgiyi yazmayın.",
  "Renkleri ve öne çıkan özellikleri Türkçe yazabilirsiniz; sistem İngilizceye çevirir. Bu adım isteğe bağlıdır.",
  "Satıştan elinize geçmesini istediğiniz tutarı ve ABD'ye kargo ücretini yazın. Etsy kesintileri fiyata eklenir; kargoyu alıcı öder ve ilan sayfasında görür.",
  "Uygulama Etsy'de alıcıların aramalarını tarar; İngilizce başlık, 13 etiket, açıklama ve fiyatı hazırlar. Türkçe karşılığına bakıp Etsy'ye gönderin."
];

function PhotoListingStudio({ online, etsyReady, wizard, onStepChange }: any) {
  const [step, setStep] = useState(1);
  const [sourceId, setSourceId] = useState(() => `photo-${Date.now()}`);
  const [photos, setPhotos] = useState<Array<{ uri: string; width?: number; height?: number }>>([]);
  const uploaded = useRef<Record<string, string>>({});
  const [kind, setKind] = useState("");
  const [origin, setOrigin] = useState("made_by_seller");
  const [maker, setMaker] = useState("me");
  const [craft, setCraft] = useState("");
  const [audience, setAudience] = useState("women");
  const [nameTr, setNameTr] = useState("");
  const [productNounEn, setProductNounEn] = useState("");
  const [material, setMaterial] = useState("");
  const [materialVerified, setMaterialVerified] = useState(false);
  const [size, setSize] = useState("");
  const [chestCm, setChestCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [fiber, setFiber] = useState("");
  const [care, setCare] = useState("hand_wash");
  const [colors, setColors] = useState("");
  const [attributes, setAttributes] = useState("");
  const [weightGrams, setWeightGrams] = useState("");
  const [beadCount, setBeadCount] = useState("");
  const [yearMade, setYearMade] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  const [conditionLevel, setConditionLevel] = useState("");
  const [priceTry, setPriceTry] = useState("");
  const [shippingTry, setShippingTry] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [readyToShip, setReadyToShip] = useState(true);
  const [analysis, setAnalysis] = useState<any>();
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [plan, setPlan] = useState<any>();
  const [payload, setPayload] = useState<any>();
  const [photoAssistant, setPhotoAssistant] = useState("chatgpt");
  const [assistantReply, setAssistantReply] = useState("");
  const [externalRequest, setExternalRequest] = useState<{ id: string; key: string }>();
  const knit = kind === "knitwear";
  const inputKey = generationKey({ sourceId, photos, kind, origin, maker, craft, audience, nameTr, productNounEn, material, materialVerified, size, chestCm, lengthCm, widthCm, fiber, care, colors, attributes, weightGrams, beadCount, yearMade, conditionNote, conditionLevel, priceTry, shippingTry, quantity, readyToShip, riskFlags });
  const liveInputKey = useRef(inputKey); liveInputKey.current = inputKey;
  const currentPlan = plan?.inputKey === inputKey ? plan : undefined;
  const photoKey = generationKey({ sourceId, photos, kind, nameTr });
  const applyAnalysis = (result: any) => {
    setAnalysis(result);
    if (!kind) chooseKind(result.productKind);
    setNameTr((current) => current.trim() || result.nameTr);
    setProductNounEn((current) => current.trim() || result.productNounEn);
    setMaterial((current) => current.trim() || result.materialGuessTr);
    setColors((current) => current.trim() || result.colors.join(", "));
    setAttributes((current) => current.trim() || result.attributesEn.join(", "));
    setConditionNote((current) => current.trim() || result.conditionNotesEn.join(" "));
    if (result.craft !== "none") setCraft(result.craft);
    if (result.audience !== "unknown") setAudience(result.audience);
    setRiskFlags(current => [...new Set([...current, ...result.riskFlags])]);
    setPlan(undefined);
  };
  const sharePhotoPrompt = async () => {
    if (!photos.length) return Alert.alert("Fotoğraf gerekli", "Önce bu ürünün fotoğraflarını seçin.");
    const request = { id: `${sourceId}-${Date.now()}`, key: photoKey };
    try {
      await Share.share({ message: photoAssistantPrompt(kind, nameTr, request.id) });
      setExternalRequest(request); setAssistantReply("");
    } catch (error) { Alert.alert("Paylaşılamadı", errorText(error)); }
  };
  const importPhotoAnalysis = () => {
    if (!externalRequest || externalRequest.key !== photoKey) return Alert.alert("Ürün değişti", "Bu fotoğraflar ve ürün için talimatı yeniden paylaşın. Eski yanıt uygulanamaz.");
    try {
      const result = parsePhotoAssistant(assistantReply, externalRequest.id);
      if (kind && result.productKind !== kind) return Alert.alert("Ürün türü farklı", "Yanıttaki ürün türü seçiminizle uyuşmuyor. Fotoğrafları ve sohbet yanıtını kontrol edin.");
      applyAnalysis(result); setAssistantReply(""); setExternalRequest(undefined);
    } catch (error) { Alert.alert("Yanıt uygulanamadı", errorText(error)); }
  };

  const chooseKind = (next: string) => {
    setKind(next);
    setOrigin(next === "vintage" ? "vintage" : next === "knitwear" ? "made_by_seller" : "unknown");
    setPlan(undefined);
  };
  const addPhotos = async (camera: boolean) => {
    if (photos.length >= MAX_LISTING_PHOTOS) return Alert.alert("En fazla 10 fotoğraf", "Etsy bir ilana en fazla 10 fotoğraf kabul eder.");
    const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(camera ? "Kamera izni gerekli" : "Galeri izni gerekli", "Ürün fotoğrafı için ayarlardan izin verin.");
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_LISTING_PHOTOS - photos.length, quality: 1 });
    if (result.canceled) return;
    setPhotos((current) => [...current, ...result.assets.map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height }))]
      .filter((photo, index, all) => all.findIndex((other) => other.uri === photo.uri) === index)
      .slice(0, MAX_LISTING_PHOTOS));
  };
  const removePhoto = (uri: string) => setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  const makeCover = (uri: string) => setPhotos((current) => [...current.filter((photo) => photo.uri === uri), ...current.filter((photo) => photo.uri !== uri)]);

  const analyze = async () => {
    if (!photos.length) return Alert.alert("Fotoğraf gerekli", "Önce ürünün fotoğrafını çekin veya seçin.");
    const requestedKey = inputKey;
    setAnalyzing(true);
    try {
      const images: string[] = [];
      for (const photo of photos.slice(0, 3)) {
        const small = await shrinkPhoto(photo, 1024, 0.6, true);
        if (small.base64) images.push(`data:image/jpeg;base64,${small.base64}`);
      }
      const { analysis: result } = await apiJson("/api/products/photo-analyze", { method: "POST", headers: apiHeaders(true), body: JSON.stringify({ imageDataUrls: images, kind: kind || undefined, name: nameTr.trim() || undefined }) });
      if (liveInputKey.current !== requestedKey) return;
      applyAnalysis(result);
    } catch (error) { if (liveInputKey.current === requestedKey) Alert.alert("Sunucu analizi kullanılamıyor", `${errorText(error)}\nChatGPT / Claude sohbeti seçeneğini kullanabilir veya alanları elle doldurabilirsiniz.`); }
    finally { setAnalyzing(false); }
  };

  const prepare = async () => {
    if (!photos.length) return Alert.alert("Fotoğraf gerekli", "Etsy ilanı için en az bir fotoğraf ekleyin; 5 ve üzeri önerilir.");
    if (!kind) return Alert.alert("Ürün türü", "Örgü, tesbih, vintage veya diğer seçeneklerinden birini seçin.");
    if (nameTr.trim().length < 3) return Alert.alert("Ürün adı", "Ürünün Türkçe adını yazın; fotoğraf analizi de önerebilir.");
    if (!knit && origin === "unknown") return Alert.alert("Üretim bilgisi", "Bu ürünü kim yaptı sorusunu yanıtlayın. Uygulama ürünü sizin yaptığınızı veya tasarladığınızı varsaymaz.");
    const net = parseAmount(priceTry);
    if (!net) return Alert.alert("Elinize geçecek tutar", "Bu üründen elinize geçmesini istediğiniz tutarı TL olarak yazın. Etsy fiyatı, Etsy kesintileri eklenerek buna göre hesaplanır; kargoyu alıcı ayrıca öder.");
    const list = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);
    const vintage = kind === "vintage" || origin === "vintage";
    const base: any = {
      sourceId,
      titleTr: nameTr.trim(),
      productKind: kind,
      origin: knit ? "made_by_seller" : origin,
      madeByShopMember: knit && maker === "member",
      productNounEn: productNounEn.trim() || undefined,
      material: knit ? undefined : material.trim() || undefined,
      materialVerified: knit ? false : materialVerified,
      craft: knit && craft ? craft : undefined,
      audience: knit ? audience : undefined,
      size: knit && size ? size : undefined,
      chestCm: knit ? parseAmount(chestCm) : undefined,
      lengthCm: parseAmount(lengthCm),
      widthCm: knit ? undefined : parseAmount(widthCm),
      fiber: knit ? fiber.trim() || undefined : undefined,
      care: knit ? care : undefined,
      colors: list(colors),
      attributesEn: list(attributes),
      weightGrams: parseAmount(weightGrams),
      beadCount: kind === "tesbih" ? parseAmount(beadCount) : undefined,
      yearMade: vintage ? Number(yearMade) || undefined : undefined,
      conditionLevel: vintage && conditionLevel ? conditionLevel : undefined,
      conditionNote: vintage ? conditionNote.trim() || undefined : undefined,
      priceTry: net,
      shippingTry: parseAmount(shippingTry),
      quantity: Number(quantity) || 1,
      readyToShip,
      riskFlags,
      imageUrls: []
    };
    setPlan(undefined);
    try {
      const result = await researchEtsyPlan(base, setProgress);
      setPayload(result.payload);
      setPlan({ ...result.plan, inputKey });
    } catch (error) { Alert.alert("Hazırlanamadı", errorText(error)); }
    finally { setProgress(""); }
  };

  // Fotoğraflar yalnız taslak oluşturulurken yüklenir; yeniden denemede yüklenenler tekrar gönderilmez.
  const uploadPhotos = async (current: any, report: (text: string) => void) => {
    const imageUrls: string[] = [];
    for (const [index, photo] of photos.entries()) {
      let url = uploaded.current[photo.uri];
      if (!url) {
        report(`Fotoğraf ${index + 1}/${photos.length} yükleniyor…`);
        const large = await shrinkPhoto(photo, 3000, 0.85);
        const form = new FormData();
        await appendLocalFile(form, "image", large, `photo-${index + 1}.jpg`, "image/jpeg");
        const response = await fetch(`${API_URL}/api/products/photos`, { method: "POST", headers: apiHeaders(), body: form });
        const body = await response.json().catch(() => ({})) as any;
        if (!response.ok) throw new Error(body.error || `${index + 1}. fotoğraf yüklenemedi.`);
        url = String(body.url);
        uploaded.current[photo.uri] = url;
      }
      imageUrls.push(url);
    }
    return { ...current, imageUrls };
  };

  const show = (n: number) => !wizard || step === n;
  const goTo = (n: number) => { setStep(n); onStepChange?.(); };
  const next = async () => {
    if (step === 1) {
      if (!photos.length) return Alert.alert("Fotoğraf gerekli", "Etsy ilanı için en az bir fotoğraf ekleyin; 5 ve üzeri önerilir.");
      // Subscription users can continue without an API analysis. Fields may be entered manually or imported from their chat.
    }
    if (step === 2) {
      if (!kind) return Alert.alert("Ürün türü", "Ürünün türünü seçin: örgü giyim, tesbih, vintage ya da diğer.");
      if (nameTr.trim().length < 3) return Alert.alert("Ürün adı", "Ürünün Türkçe adını yazın (ör. 925 gümüş tesbih).");
      // "Kim yaptı?" sorusu bu adımda yanıtlanır; son adımda geri gönderilmez.
      if (!knit && origin === "unknown") return Alert.alert("Üretim bilgisi", "Bu ürünü kim yaptı sorusunu yanıtlayın. Uygulama ürünü sizin yaptığınızı veya tasarladığınızı varsaymaz.");
      const vintage = kind === "vintage" || origin === "vintage";
      const year = Number(yearMade);
      if (vintage && !(year >= 1800 && year <= new Date().getFullYear() - 20)) return Alert.alert("Üretim yılı", "Vintage ürün en az 20 yıllık olmalı. Yaklaşık üretim yılını yazın (ör. 1975).");
    }
    if (step === 4) {
      if (!parseAmount(priceTry)) return Alert.alert("Elinize geçecek tutar", "Bu üründen elinize geçmesini istediğiniz tutarı TL olarak yazın.");
      if (!parseAmount(shippingTry)) return Alert.alert("ABD'ye kargo ücreti", "Kargo ücretini yazın; alıcının ödeyeceği tutarı (Etsy kesintisi dahil) hesaplayıp kargo profiline yazmanızı söyleyeceğim. Bilmiyorsanız ürünü paketleyip tartın; PTT'ye ya da kargo firmasına ağırlığı söyleyip ABD fiyatını sorun.");
    }
    goTo(Math.min(WIZARD_STEPS.length, step + 1));
  };

  const reset = () => {
    setStep(1);
    setExternalRequest(undefined); setAssistantReply("");
    setSourceId(`photo-${Date.now()}`);
    uploaded.current = {};
    setPhotos([]); setKind(""); setOrigin("made_by_seller"); setMaker("me"); setCraft(""); setAudience("women");
    setNameTr(""); setProductNounEn(""); setMaterial(""); setMaterialVerified(false); setSize(""); setChestCm(""); setLengthCm(""); setWidthCm("");
    setFiber(""); setCare("hand_wash"); setColors(""); setAttributes(""); setWeightGrams(""); setBeadCount(""); setYearMade(""); setConditionNote(""); setConditionLevel("");
    setPriceTry(""); setShippingTry(""); setQuantity("1"); setReadyToShip(true); setAnalysis(undefined); setRiskFlags([]); setPlan(undefined); setPayload(undefined);
  };

  const [showChat, setShowChat] = useState(false);
  const photoGuide = physicalListingProgress({ wizardStep: wizard ? step : undefined, photos: photos.length, kind, name: nameTr, price: parseAmount(priceTry), shipping: parseAmount(shippingTry) });
  return <>
    {!currentPlan && <ListingMascot {...photoGuide}
      roadmap={WIZARD_STEPS} actionLabel={!photos.length ? "Goxi ile galeriden fotoğraf seç" : wizard && step < 5 ? "Goxi ile sonraki adıma geç" : "Goxi ile Etsy araştırmasını başlat"}
      onAction={!photos.length ? () => addPhotos(false) : wizard && step < 5 ? next : photoGuide.step === 5 ? prepare : undefined} disabled={analyzing || Boolean(progress) || (!online && photos.length > 0)} />}
    {wizard && <View style={styles.analysisCard}>
      <View style={styles.stepBar}>{WIZARD_STEPS.map((label, index) => <View key={label} style={[styles.stepDot, index < step && styles.stepDotActive]} />)}</View>
      <Text style={styles.small}>Adım {step}/{WIZARD_STEPS.length}</Text>
      <Text style={styles.cardTitle}>{WIZARD_STEPS[step - 1]}</Text>
      <Text style={styles.analysisLine}>{WIZARD_HINTS[step - 1]}</Text>
    </View>}
    {!wizard && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Elinizdeki ürünü Etsy'de satın</Text>
      <Text style={styles.analysisLine}>Fotoğrafları çekin ve ürün türünü seçin. Bilgileri 'Fotoğraftan otomatik doldur' ile önerdirebilir, ChatGPT / Claude sohbetinden aktarabilir veya elle girebilirsiniz. Uygulama Etsy'de alıcıların aramalarını tarar; başlık, 13 etiket, İngilizce açıklama ve fiyatı hazırlar. Shopier gerekmez.</Text>
    </View>}
    {show(1) && <>
    <Text style={styles.fieldLabel}>Fotoğraflar ({photos.length}/{MAX_LISTING_PHOTOS}) · kapak yapmak için fotoğrafa dokunun</Text>
    {!!photos.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
      {photos.map((photo, index) => <View key={photo.uri} style={styles.photoThumbWrap}>
        <Pressable onPress={() => makeCover(photo.uri)}><Image source={{ uri: photo.uri }} style={styles.photoThumb} /></Pressable>
        {index === 0 && <Text style={styles.photoCover}>Kapak</Text>}
        <Pressable style={styles.photoRemove} onPress={() => removePhoto(photo.uri)}><Ionicons name="close" size={14} color="white" /></Pressable>
      </View>)}
    </ScrollView>}
    <View style={styles.inlineActions}>
      <Pressable style={styles.secondaryButton} onPress={() => addPhotos(true)}><Text style={styles.secondaryButtonText}>Fotoğraf çek</Text></Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => addPhotos(false)}><Text style={styles.secondaryButtonText}>Galeriden seç</Text></Pressable>
    </View>
    <Text style={styles.formHint}>Gün ışığında, sade zeminde çekin: önden, arkadan, doku veya damga yakın planı ve ölçü gösteren bir kare. Ön, arka ve detay fotoğraflarıyla ürünü açıkça gösterin.</Text>
    {photos.length > 0 && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Fotoğrafları güzelleştir (isteğe bağlı)</Text>
      <Text style={styles.formHint}>Talimatı ChatGPT veya Claude'a gönder, fotoğrafları sohbete ekle. Ürün değiştirilmeden ışık, renk, kırpma ve arka plan düzeltilir; Etsy fotoğrafın gerçek ürünü göstermesini ister. Hazır fotoğrafları indirip buradaki eski fotoğrafları silerek yenilerini ekle, sonra devam et.</Text>
      <View style={styles.inlineActions}>
        <Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: photoEnhancePrompt("chatgpt", nameTr) }).catch(() => undefined)}><Text style={styles.secondaryButtonText}>ChatGPT ile güzelleştir</Text></Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => Share.share({ message: photoEnhancePrompt("claude", nameTr) }).catch(() => undefined)}><Text style={styles.secondaryButtonText}>Claude ile güzelleştir</Text></Pressable>
      </View>
      <Pressable onPress={() => setPhotos([])}><Text style={styles.linkNote}>Tüm fotoğrafları kaldır ({photos.length})</Text></Pressable>
    </View>}
    {(!wizard || photos.length > 0) && <Pressable style={[styles.analyzeButton, (analyzing || !online || !photos.length) && styles.primaryDisabled]} disabled={analyzing || !online || !photos.length} onPress={analyze}>{analyzing ? <ActivityIndicator color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}<Text style={styles.primaryText}>{analyzing ? "Fotoğraflar inceleniyor…" : "Fotoğraftan otomatik doldur"}</Text></Pressable>}
    {wizard && photos.length > 0 && <Text style={styles.formHint}>Tür, ad, renk ve malzeme önerilir; hepsini bir sonraki adımda kontrol edersiniz.</Text>}
    {wizard && !showChat && <Pressable onPress={() => setShowChat(true)} style={{ marginBottom: 8 }}><Text style={styles.linkNote}>ChatGPT / Claude sohbetiyle analiz (isteğe bağlı) →</Text></Pressable>}
    {(!wizard || showChat) && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>ChatGPT / Claude sohbetiyle analiz</Text>
      <Text style={styles.formHint}>Plus / ücretli sohbet hesabınızı kendi uygulamasında kullanın. Burada API çağrısı yapılmaz. Talimatı paylaşın, fotoğrafları sohbete ayrıca ekleyin; JSON yanıtını buraya yapıştırın. Hiçbir ilan otomatik yayınlanmaz.</Text>
      <ChipGroup options={[{ id: "chatgpt", label: "ChatGPT" }, { id: "claude", label: "Claude" }]} value={photoAssistant} onChange={setPhotoAssistant} />
      <Pressable style={styles.secondaryButton} onPress={sharePhotoPrompt}><Text style={styles.secondaryButtonText}>{photoAssistant === "claude" ? "Claude için analiz talimatını paylaş" : "ChatGPT için analiz talimatını paylaş"}</Text></Pressable>
      <Field label="Sohbetten gelen analiz JSON'u" value={assistantReply} onChangeText={setAssistantReply} multiline autoCapitalize="none" />
      <Pressable style={styles.secondaryButton} onPress={importPhotoAnalysis}><Text style={styles.secondaryButtonText}>Analiz yanıtını uygula</Text></Pressable>
    </View>}
    {wizard && analyzing && <Text style={styles.formHint}>Yapay zekâ fotoğrafa bakıyor…</Text>}
    </>}
    {show(2) && <>
    {analysis && <View style={styles.analysisCard}>
      <Text style={styles.cardTitle}>Fotoğraftan anlaşılan</Text>
      <Text style={styles.analysisLine}>{analysis.nameTr}{analysis.productNounEn ? ` · ${analysis.productNounEn}` : ""} · %{Math.round(analysis.confidence * 100)} güven</Text>
      {!!analysis.questionsTr.length && <><Text style={styles.warningTitle}>Sizin doğrulamanız gerekenler</Text>{analysis.questionsTr.map((question: string) => <Text style={styles.warningText} key={question}>• {question}</Text>)}</>}
      {!!riskFlags.length && <><Text style={styles.warningTitle}>Etsy kuralı uyarıları</Text>{riskFlags.map((flag) => <Pressable key={flag} style={styles.readinessRow} onPress={() => setRiskFlags((current) => current.filter((item) => item !== flag))}><Ionicons name="warning-outline" size={18} color="#A86B2E" /><Text style={[styles.warningText, { flex: 1 }]}>{RISK_LABELS[flag] || `Etsy'de yasaklı olabilir (${flag}).`} Yanlışsa dokunup kaldırın.</Text></Pressable>)}</>}
      <Text style={styles.formHint}>Malzeme, yaş ve damga fotoğraftan kesin anlaşılamaz; aşağıda siz onaylarsınız.</Text>
    </View>}
    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Ürün türü</Text>
    <ChipGroup options={PHOTO_KINDS} value={kind} onChange={chooseKind} />
    <Field label="Ürün adı (Türkçe)" value={nameTr} onChangeText={setNameTr} placeholder={kind === "tesbih" ? "ör. Arpa kesim püsküllü tesbih" : kind === "vintage" ? "ör. Eski bakır tepsi" : knit ? "ör. Krem tığ işi kazak" : "Ürünün kısa adı"} />
    {!wizard && <Field label="İngilizce ürün adı (boş bırakın, sistem bulur)" value={productNounEn} onChangeText={setProductNounEn} autoCapitalize="none" placeholder={kind === "tesbih" ? "prayer beads" : kind === "vintage" ? "copper tray" : knit ? "crochet sweater" : "Boş bırakabilirsiniz"} />}
    {knit && <>
      <Text style={styles.fieldLabel}>Kim ördü?</Text>
      <ChipGroup options={KNIT_MAKER_OPTIONS} value={maker} onChange={setMaker} />
      {maker === "member" && <Text style={styles.formHint}>Etsy'de o kişiyi mağaza üyesi olarak ekleyin: Shop Manager (Mağaza Yöneticisi) → Settings (Ayarlar) → About your shop (Mağaza hakkında) → Shop members (Mağaza üyeleri). İlan "A member of my shop" (mağazamın bir üyesi yaptı) olarak açılır.</Text>}
      <Text style={styles.fieldLabel}>Teknik</Text>
      <ChipGroup options={KNIT_CRAFT_OPTIONS} value={craft} onChange={setCraft} />
      <Text style={styles.fieldLabel}>Kimin için?</Text>
      <ChipGroup options={AUDIENCE_OPTIONS} value={audience} onChange={setAudience} />
      <Text style={styles.fieldLabel}>Beden</Text>
      <ChipGroup options={SIZE_OPTIONS} value={size} onChange={setSize} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Göğüs genişliği (cm, düz)" value={chestCm} onChangeText={setChestCm} keyboardType="decimal-pad" placeholder="52" /></View>
        <View style={{ flex: 1 }}><Field label="Boy (cm)" value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" placeholder="60" /></View>
      </View>
      <Field label="İplik içeriği" value={fiber} onChangeText={setFiber} placeholder="%100 pamuk veya %50 yün %50 akrilik" />
      <Text style={styles.fieldLabel}>Yıkama</Text>
      <ChipGroup options={CARE_OPTIONS} value={care} onChange={setCare} />
    </>}
    {!!kind && !knit && <>
      {kind !== "vintage" && <><Text style={styles.fieldLabel}>Bu ürünü kim yaptı?</Text><ChipGroup options={ORIGIN_OPTIONS} value={origin} onChange={setOrigin} /></>}
      {(kind === "vintage" || origin === "vintage") && <Field label="Üretim yılı (yaklaşık; en az 20 yıl önce)" value={yearMade} onChangeText={setYearMade} keyboardType="number-pad" placeholder="1985" />}
      <Field label="Malzeme" value={material} onChangeText={setMaterial} placeholder="925 gümüş, bakır, kehribar, kuka…" />
      <Toggle label="Ayar damgası veya malzeme belgesi var (925 vb.)" value={materialVerified} onChange={setMaterialVerified} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="Ağırlık (g)" value={weightGrams} onChangeText={setWeightGrams} keyboardType="decimal-pad" /></View>
        {kind === "tesbih"
          ? <View style={{ flex: 1 }}><Field label="Tane sayısı" value={beadCount} onChangeText={setBeadCount} keyboardType="number-pad" /></View>
          : <View style={{ flex: 1 }}><Field label="En (cm)" value={widthCm} onChangeText={setWidthCm} keyboardType="decimal-pad" /></View>}
        <View style={{ flex: 1 }}><Field label="Uzunluk (cm)" value={lengthCm} onChangeText={setLengthCm} keyboardType="decimal-pad" /></View>
      </View>
      {(kind === "vintage" || origin === "vintage") && <>
        <Text style={styles.fieldLabel}>Ürünün durumu</Text>
        <ChipGroup options={CONDITION_OPTIONS} value={conditionLevel} onChange={setConditionLevel} />
        <Field label="Ek durum notu (isteğe bağlı, yalnız İngilizce; fotoğraf analizi doldurur)" value={conditionNote} onChangeText={setConditionNote} multiline placeholder="Small dent on the rim." />
        <Text style={styles.formHint}>Türkçe not yazarsanız İngilizce açıklamaya girmez; seçtiğiniz durum İngilizce cümleye çevrilir.</Text>
      </>}
    </>}
    </>}
    {show(3) && <>
    <Field label="Renkler (Türkçe yazabilirsiniz, virgülle)" value={colors} onChangeText={setColors} autoCapitalize="none" placeholder="krem, adaçayı yeşili, bordo" />
    <Field label="Öne çıkan özellikler (Türkçe yazabilirsiniz, virgülle)" value={attributes} onChangeText={setAttributes} autoCapitalize="none" placeholder={kind === "tesbih" ? "arpa kesim, püsküllü, telkari" : knit ? "bol kesim, kare motif" : "kabartma, el oyması, çiçek desenli"} />
    <Text style={styles.formHint}>Sistem bunları İngilizceye çevirir. Çeviremediği kelimeyi ilana koymaz ve size söyler; yanlış İngilizce yazılmaz.</Text>
    </>}
    {show(4) && <>
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ flex: 1 }}><Field label="Elinize geçecek (TL)" value={priceTry} onChangeText={setPriceTry} keyboardType="decimal-pad" placeholder="2500" /></View>
      <View style={{ flex: 1 }}><Field label="ABD'ye kargo (TL)" value={shippingTry} onChangeText={setShippingTry} keyboardType="decimal-pad" placeholder="900" /></View>
      <View style={{ width: 70 }}><Field label="Adet" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" /></View>
    </View>
    <Toggle label="Hazır, hemen gönderilebilir" value={readyToShip} onChange={setReadyToShip} />
    {wizard && <Text style={styles.formHint}>Elinize geçecek: Etsy kesintileri düşüldükten sonra size kalacak tutar; Etsy fiyatı buna göre hesaplanır. ABD'ye kargo: paketli ürünü göndermenin size maliyeti (paketli ağırlığı PTT'ye ya da kargo firmasına söyleyip sorun). Kargoyu alıcı öder; fiyata eklenmez, uygulama kargo profiline yazılacak tutarı hesaplar. "Hazır" kapalıysa ürün sipariş gelince yapılır demektir.</Text>}
    </>}
    {show(5) && <>
    <Pressable style={[styles.analyzeButton, { marginTop: 12 }, (Boolean(progress) || !online) && styles.primaryDisabled]} disabled={Boolean(progress) || !online} onPress={prepare}>{progress ? <ActivityIndicator color="white" /> : <Ionicons name="search" size={18} color="white" />}<Text style={styles.primaryText}>{plan ? "Yeniden araştır" : "Etsy'de araştır ve ilanı hazırla"}</Text></Pressable>
    {!!progress && <Text style={styles.formHint}>{progress}</Text>}
    {currentPlan && <EtsyPlanResult key={currentPlan.inputKey} plan={currentPlan} payload={payload} etsyReady={etsyReady} priceSourceLabel="Elinize geçecek tutar" prepareProduct={uploadPhotos} photoCount={photos.length} />}
    </>}
    {wizard && <View style={styles.wizardNav}>
      {step > 1 && <Pressable style={styles.secondaryButton} onPress={() => goTo(step - 1)}><Text style={styles.secondaryButtonText}>← Geri</Text></Pressable>}
      {step < WIZARD_STEPS.length && <Pressable style={[styles.primary, { flex: 1, marginBottom: 0 }, analyzing && styles.primaryDisabled]} disabled={analyzing} onPress={next}>{analyzing ? <ActivityIndicator color="white" /> : null}<Text style={styles.primaryText}>{step === 3 ? "İleri (isteğe bağlı adım)" : "İleri"}</Text><Ionicons name="arrow-forward" size={18} color="white" /></Pressable>}
    </View>}
    {(!wizard || step === WIZARD_STEPS.length) && (plan || photos.length > 0) && <Pressable style={[styles.secondaryButton, { alignSelf: "flex-start", marginTop: 14 }]} onPress={reset}><Text style={styles.secondaryButtonText}>Yeni ürüne başla</Text></Pressable>}
  </>;
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
  versionText: { color: "#8A948F", fontSize: 11, textAlign: "center", marginTop: 18 },
  versionMeta: { color: "#A3ACA7", fontSize: 10, textAlign: "center", marginTop: 3 },
  homeHello: { fontSize: 22, fontWeight: "900", color: "#17221E", marginBottom: 12, marginTop: 4 },
  homeTile: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "white", borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#E7E3D9" },
  homeTileIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#315B4C", alignItems: "center", justifyContent: "center" },
  homeTileTitle: { fontSize: 17, fontWeight: "900", color: "#17221E" },
  homeTileText: { fontSize: 13, color: "#5A655F", lineHeight: 19, marginTop: 3 },
  stepBar: { flexDirection: "row", gap: 6, marginBottom: 8 },
  stepDot: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#E1DDD3" },
  stepDotActive: { backgroundColor: "#C88B47" },
  wizardNav: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  updateCheck: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "center", marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#E7EFEB" },
  updateCheckText: { color: "#315B4C", fontWeight: "800", fontSize: 12 },
  offlineCard: { backgroundColor: "#FFF7EA", borderRadius: 14, padding: 12, marginBottom: 12, gap: 10 },
  offlineText: { color: "#8A521F", fontSize: 13, lineHeight: 19 },
  offlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  offlineButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#FFF0D8", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexGrow: 1 },
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
  hidden: { display: "none" },
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
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4 },
  masterCard: { borderWidth: 2, borderColor: "#315B4C" },
  qualityNote: { flexDirection: "row", gap: 8, borderRadius: 10, padding: 10, marginTop: 10, alignItems: "flex-start" },
  qualityGood: { backgroundColor: "#E8F3EC" },
  qualityBad: { backgroundColor: "#FBEAEA" },
  qualityTitle: { fontWeight: "700", color: "#1F2A24", marginBottom: 2 },
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
  navItem: { flex: 1, flexBasis: 0, minWidth: 0, paddingHorizontal: 2, alignItems: "center", justifyContent: "center", gap: 4 },
  segment: { flexDirection: "row", backgroundColor: "#E7E3D9", borderRadius: 13, padding: 4, marginBottom: 14 },
  photoThumbWrap: { marginRight: 10, position: "relative" },
  photoThumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: "#E7E3D9" },
  photoCover: { position: "absolute", left: 6, bottom: 6, backgroundColor: "#315B4C", color: "white", fontSize: 10, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  photoRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "#17221ECC", alignItems: "center", justifyContent: "center" },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  segmentActive: { backgroundColor: "white" },
  segmentText: { color: "#68736E", fontWeight: "800", fontSize: 11 },
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
  navText: { color: "#748079", fontSize: 9, fontWeight: "600", width: "100%", textAlign: "center", flexShrink: 1 },
  navTextActive: { color: "#A86B2E" }
});
