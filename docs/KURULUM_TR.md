# Canlı kurulum rehberi

## 1. Ön koşullar

- İşletme adı, logo ve iletişim bilgileri
- Düzenlenmiş ürün fotoğrafları/videoları
- Her ürün için SKU, ad, açıklama, fiyat, stok, kategori ve satış bağlantısı
- Alan adı ve HTTPS sunucu
- KVKK aydınlatma metni, açık rıza kaydı ve iletişimden çıkma yöntemi

Bu pakette GXL markası, iki Letgo ilanı ve Shopier satış bağlantısı örnek değil gerçek bağlantı olarak tanımlanmıştır. Fiyat alanları kullanıcı tarafından doğrulanana kadar ajan fiyat uydurmaz ve müşteriyi satış sayfasına yönlendirir.

## 2. Shopier

1. Shopier satıcı hesabında geliştirici modunu açın.
2. Kendi işletmeniz için listelenmeyen uygulama oluşturun.
3. İstemci bilgilerini yalnızca sunucudaki `.env` dosyasına girin.
4. Sipariş ve ürün webhook adreslerini `https://ALAN-ADINIZ/webhooks/shopier` olarak tanımlayın.
5. Ürün kayıtlarındaki `shopierUrl` alanlarını gerçek ürün sayfalarıyla değiştirin.

Shopier bu sistemde ödeme/sipariş hedefidir; ajan ödeme kartı verisi almaz.

## 3. Letgo

Letgo bağlantıları ürünlerde `letgoUrl` alanında saklanır. Doğrulanmış resmî satıcı mesajlaşma API'si olmadığı sürece ajan Letgo hesabına otomatik giriş yapmaz veya mesaj göndermez. Uygulama görüşmeyi kaydeder ve sizi Letgo uygulamasına yönlendirir.

## 4. WhatsApp Business

1. Meta Business hesabı ve işletme doğrulaması tamamlanır.
2. WhatsApp Business Platform numarası eklenir.
3. Webhook: `https://ALAN-ADINIZ/webhooks/meta`
4. `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN` ve `WHATSAPP_PHONE_NUMBER_ID` sunucuda tanımlanır.
5. İlk işletme mesajları için onaylı mesaj şablonları ve müşteri izin kaydı kullanılır.

## 5. Instagram/Facebook

Profesyonel Instagram hesabını Facebook Sayfasına bağlayın ve Meta uygulamasına gerekli mesajlaşma izinlerini ekleyin. Webhook yine `/webhooks/meta` adresidir. Erişim anahtarlarını Android uygulamasına koymayın.

## 6. Yapay zekâ ajanı

Sunucuya `OPENAI_API_KEY` verildiğinde yapılandırılmış Responses API çıktısı kullanılır. Anahtar yoksa kural tabanlı demo ajanı devrededir. Model sadece seçilmiş katalog kayıtlarını görür; stok, fiyat veya ürün özelliği uydurmasına izin verilmez.

## 7. Android yapılandırması

`apps/mobile` altında `.env` oluşturun:

```bash
EXPO_PUBLIC_API_URL=https://ALAN-ADINIZ
```

Yerel Android emülatöründe varsayılan `http://10.0.2.2:8787` adresi çalışır. Fiziksel telefonda bilgisayarın yerel IP adresini kullanın.

## 8. Canlıya geçmeden önce

- Webhook imzalarını ham istek gövdesi üzerinden doğrulayın.
- PostgreSQL, şifreli nesne depolama ve günlük yedekleme ekleyin.
- Yönetici girişi, çok faktörlü doğrulama ve rol bazlı yetki ekleyin.
- Mesaj hız sınırı, tekrar deneme kuyruğu ve hata alarmı kurun.
- KVKK saklama/silme sürelerini yapılandırın.
- Gerçek ürünlerle 20 senaryo testi ve insan devralma testi yapın.
- Çakı ürünlerinde yaş, teslimat ve yürürlükteki mevzuat kontrolünü hukuk danışmanıyla doğrulayın.

## 9. Bilgisayarsız APK kurulumu

Proje `preview` adlı APK derleme profiliyle hazırdır. Derleme Expo hesabında bulut üzerinden yapılır; Android Studio veya kullanıcının bilgisayarı gerekmez. Derleme hesabına giriş ve uygulama imzalama anahtarı oluşturma kullanıcı kontrolünde tamamlanmalıdır. Hesap şifresi, doğrulama kodu veya erişim anahtarı sohbet içinde paylaşılmamalıdır.

Expo sahibi `goxel34`, proje kimliği `59b0b7f2-67d8-4c15-b106-772d936f422c` olarak uygulama yapılandırmasına bağlanmıştır.

APK tamamlandığında Xiaomi 15T Pro üzerinde:

1. Derleme indirme bağlantısını Chrome'da açın.
2. APK'yı indirin.
3. HyperOS isterse yalnızca Chrome için “Bu kaynaktan uygulama yükle” iznini geçici olarak açın.
4. `GXL Akıllı Satıcı` uygulamasını yükleyin.
5. Kurulumdan sonra bilinmeyen kaynak iznini tekrar kapatın.
