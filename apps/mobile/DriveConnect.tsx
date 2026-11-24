import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

// Google Drive köprüsü: yapay zekânın dosyaları Drive'daki "GXL" klasörüne girer, sunucu oradan çeker.
// Google bu izni 7 günde bir yeniden onaylatır: kart kalan günü gösterir, süre yaklaşınca uyarır ve
// Google Takvim'e haftalık hatırlatma ekler (telefon bildirimini takvim verir).
type Request = (path: string, init?: RequestInit) => Promise<any>;
export interface DriveStatus { configured: boolean; connected: boolean; expired: boolean; daysLeft?: number; renewBy?: string; redirectUri?: string; folder: string; missingTr: string[] }

const pad = (value: number) => String(value).padStart(2, "0");
const calendarStamp = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
// Yenileme gününden bir gün önce, sabah 10:00 (Türkiye) haftalık tekrar eden hatırlatma.
export function driveReminderUrl(renewBy: string): string {
  const day = new Date(Date.parse(renewBy) - 86_400_000);
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 7, 0));
  const end = new Date(start.getTime() + 15 * 60_000);
  const query = new URLSearchParams({ action: "TEMPLATE", text: "GXL: Google Drive bağlantısını yenile", details: "GXL uygulamasını aç → Etsy → Dijital ürün yükle → Google Drive kartı → 'Drive'ı yeniden bağla'. Yaklaşık 20 saniye sürer.", dates: `${calendarStamp(start)}/${calendarStamp(end)}`, recur: "RRULE:FREQ=WEEKLY" });
  return `https://calendar.google.com/calendar/render?${query}`;
}

export function driveNeedsAttention(status?: DriveStatus): boolean {
  return Boolean(status?.configured && (status.expired || status.connected && (status.daysLeft ?? 7) <= 1));
}

export function useDriveStatus(request: Request, enabled = true) {
  const [status, setStatus] = useState<DriveStatus>();
  const refresh = useCallback(() => { if (enabled) request("/api/drive/status").then(setStatus).catch(() => undefined); }, [request, enabled]);
  useEffect(() => {
    refresh();
    // Google sayfasından uygulamaya dönünce durum yenilenir.
    const subscription = AppState.addEventListener?.("change", (state: string) => { if (state === "active") refresh(); });
    return () => subscription?.remove?.();
  }, [refresh]);
  return { status, refresh };
}

// Uygulamanın üstünde görünen kısa uyarı: yalnız yenileme yaklaştığında veya süresi dolduğunda.
export function DriveReminder({ request, onOpen }: { request: Request; onOpen: (url: string) => void }) {
  const { status } = useDriveStatus(request);
  const [busy, setBusy] = useState(false);
  if (!driveNeedsAttention(status)) return null;
  const reconnect = async () => { setBusy(true); try { const { url } = await request("/api/drive/connect", { method: "POST" }); onOpen(url); } catch { /* kart ayrıntıyı gösterir */ } finally { setBusy(false); } };
  return <View style={s.banner} testID="drive-reminder">
    <Text style={s.bannerText}>{status!.expired ? "Google Drive bağlantısının haftalık onayı doldu." : "Google Drive bağlantısı yarın yenilenmeli."} Drive'dan ürün alabilmek için yenile (yaklaşık 20 saniye).</Text>
    <Pressable accessibilityRole="button" style={s.bannerButton} disabled={busy} onPress={reconnect}><Text style={s.bannerButtonText}>{busy ? "Açılıyor…" : "Drive'ı yeniden bağla"}</Text></Pressable>
  </View>;
}

export function DriveCard({ request, onOpen }: { request: Request; onOpen: (url: string) => void }) {
  const { status, refresh } = useDriveStatus(request);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guide, setGuide] = useState(false);
  const connect = async () => {
    setBusy(true); setError("");
    try { const { url } = await request("/api/drive/connect", { method: "POST" }); onOpen(url); }
    catch (connectError) { setError(String((connectError as Error)?.message || connectError)); }
    finally { setBusy(false); refresh(); }
  };
  if (!status) return <View style={s.card}><Text style={s.title}>Google Drive</Text><ActivityIndicator color="#C88B47" /></View>;
  const attention = driveNeedsAttention(status);
  return <View style={[s.card, attention && s.cardWarn]} testID="drive-card">
    <Text style={s.title}>Google Drive (telefon yüklemez)</Text>
    {!status.configured && <>
      <Text style={s.line}>Kurulum bir kez yapılır (ücretsiz, yaklaşık 10 dakika). Sonra yapay zekânın dosyalarını Drive'daki "{status.folder}" klasörüne kaydedersin; sunucu dosyaları Drive'dan kendisi alır.</Text>
      <Pressable accessibilityRole="button" onPress={() => setGuide(!guide)}><Text style={s.link}>{guide ? "Kurulum adımlarını gizle ▲" : "Kurulum adımlarını göster ▼"}</Text></Pressable>
      {guide && <View style={{ gap: 6 }}>
        {[
          "Bilgisayardan console.cloud.google.com adresini aç, kendi Gmail hesabınla gir. Üstten 'Proje seç → Yeni proje', adı: GXL.",
          "Soldaki menü: 'APIs & Services → Library'. 'Google Drive API'yi ara, aç ve 'Enable'a bas.",
          "'APIs & Services → OAuth consent screen': User type 'External'. Uygulama adı: GXL, e-posta: kendi Gmail'in. 'Test users' bölümüne kendi Gmail adresini ekle ve kaydet.",
          `'APIs & Services → Credentials → Create credentials → OAuth client ID'. Tür: 'Web application'. 'Authorized redirect URIs' bölümüne şunu aynen ekle: ${status.redirectUri || "(uygulama gösterir)"}`,
          "Çıkan 'Client ID' ve 'Client secret' değerlerini kopyala. Bunları sohbete, mesaja veya not uygulamasına YAZMA.",
          "dash.cloudflare.com → Workers & Pages → gxl-akilli-satici-api → Settings → Variables and Secrets → Add. Tür 'Secret' seç; adı GOOGLE_CLIENT_ID olan birini ve adı GOOGLE_CLIENT_SECRET olan birini ekle, kaydet (Deploy).",
          `Google Drive'da "Yeni → Klasör" ile "${status.folder}" adlı klasör oluştur.`,
          "Bu karta dön: 'Drive'ı bağla'ya bas, Google ekranında kendi hesabını seç. 'Google bu uygulamayı doğrulamadı' uyarısında 'Devam'a bas (uygulama senin; bu normal) ve Drive iznini onayla."
        ].map((step, index) => <Text key={step} style={s.line}>{index + 1}. {step}</Text>)}
        <Pressable accessibilityRole="button" style={s.secondary} onPress={() => onOpen("https://console.cloud.google.com/")}><Text style={s.secondaryText}>Google Cloud'u aç</Text></Pressable>
        <Pressable accessibilityRole="button" style={s.secondary} onPress={() => onOpen("https://dash.cloudflare.com/")}><Text style={s.secondaryText}>Cloudflare'i aç</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={refresh}><Text style={s.link}>Ekledim, yeniden kontrol et</Text></Pressable>
      </View>}
    </>}
    {status.configured && <>
      <Text style={attention ? s.warn : s.line}>{status.connected ? `Bağlı. Haftalık onayın yenilenmesine ${status.daysLeft} gün var.` : status.expired ? "Haftalık onayın süresi doldu; yeniden bağla." : "Henüz bağlı değil."} Klasör: Drive'da "{status.folder}".</Text>
      <Pressable accessibilityRole="button" style={[s.primary, busy && s.disabled]} disabled={busy} onPress={connect}><Text style={s.primaryText}>{busy ? "Açılıyor…" : status.connected ? "Drive'ı yeniden bağla (7 günü yenile)" : status.expired ? "Drive'ı yeniden bağla" : "Drive'ı bağla"}</Text></Pressable>
      {status.connected && !!status.renewBy && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => onOpen(driveReminderUrl(status.renewBy!))}><Text style={s.secondaryText}>Google Takvim'e haftalık hatırlatma ekle</Text></Pressable>}
      <Text style={s.small}>Yapay zekâdan aldığın satış dosyalarını (ZIP/PDF) ve ilan görsellerini Drive'daki "{status.folder}" klasörüne kaydet: ChatGPT/Gemini indirme ekranında "Drive'a kaydet"i seç. Sunucu Drive'da hiçbir şeyi silmez veya değiştirmez.</Text>
    </>}
    {!!error && <Text style={s.warn}>{error}</Text>}
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#E2DCCB", gap: 8 },
  cardWarn: { borderColor: "#E9A27A", backgroundColor: "#FFF7F1" },
  title: { fontSize: 16, fontWeight: "800", color: "#1F2A24" },
  line: { fontSize: 13, color: "#26302B", lineHeight: 19 },
  small: { fontSize: 12, color: "#5C6660" },
  warn: { fontSize: 13, color: "#9A3412", fontWeight: "600" },
  link: { color: "#315B4C", fontWeight: "700", paddingVertical: 4 },
  primary: { backgroundColor: "#315B4C", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontWeight: "700" },
  secondary: { borderWidth: 1, borderColor: "#315B4C", borderRadius: 12, paddingVertical: 9, alignItems: "center" },
  secondaryText: { color: "#315B4C", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  banner: { backgroundColor: "#FDE7D8", borderRadius: 12, padding: 12, margin: 12, gap: 8 },
  bannerText: { color: "#7C2D12", fontSize: 13, fontWeight: "600" },
  bannerButton: { backgroundColor: "#9A3412", borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  bannerButtonText: { color: "#FFFFFF", fontWeight: "700" }
});
