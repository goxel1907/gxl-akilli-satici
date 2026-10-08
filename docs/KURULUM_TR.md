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
2. Yalnız kendi mağazanız için Personal Access Token (PAT) üretin; token değerini yalnızca Cloudflare Worker sırrı `SHOPIER_ACCESS_TOKEN` olarak kaydedin.
3. Mobil uygulama ile sunucu arasındaki yazma işlemleri için güçlü bir `APP_ACCESS_TOKEN` oluşturun; aynı değer APK derlemesinde `EXPO_PUBLIC_GXL_APP_TOKEN` olarak kullanılmalıdır.
4. Worker üzerindeki `POST /webhooks/shopier` adresini Shopier'de `product.created`, `product.updated`, `order.created`, `order.addressUpdated`, `order.fulfilled`, `refund.requested` ve `refund.updated` olaylarına abone edin.
5. Shopier'in webhook oluştururken yalnızca ilk yanıtta verdiği webhook token değerini `SHOPIER_WEBHOOK_TOKEN` sırrı olarak kaydedin. Eski kurulumlarla uyumluluk için `SHOPIER_WEBHOOK_SECRET` adı da kabul edilir.
6. Cloudflare R2'de `gxl-product-media` kovasını oluşturup Worker'a `PRODUCT_MEDIA` adıyla bağlayın. Bu depo, telefondan seçilen Shopier ürün fotoğraflarını herkese açık fakat tahmin edilemez bağlantılarla sunar.
6. Uygulamadaki **Shopier** sekmesini yenileyin. Ürün okuma, sipariş okuma, ürün oluşturma/güncelleme ve imzalı bildirim satırlarının tamamı **Hazır** görünmelidir.

Shopier üretim uçları:

- `GET /api/shopier/center`: canlı ürünler, kişisel veriden arındırılmış 30 günlük sipariş özeti, yetenek ve eksik listesi.
- `GET /api/shopier/products`: canlı ürün kataloğu.
- `POST /api/shopier/products`: yeni canlı ürün; `APP_ACCESS_TOKEN` ve gövdede `confirm: true` zorunludur.
- `POST /api/shopier/media`: telefondan seçilen JPG/PNG/BMP ürün görselini R2'ye yükler; `APP_ACCESS_TOKEN` ve gövdede `confirm: true` zorunludur.
- `PUT /api/shopier/products/:id`: fiyat, stok ve ilan alanı güncellemesi; `APP_ACCESS_TOKEN` ve `confirm: true` zorunludur.
- `GET /api/shopier/orders`: kişisel veri içermeyen son 30 günlük sipariş özeti.
- `POST /webhooks/shopier`: ham gövde üzerinden HMAC-SHA256 imzası, zaman damgası ve tekrar eden webhook kimliği kontrolü.

Ürün silme özellikle uygulamaya açılmamıştır. Shopier ürün oluşturma API'si 1-5 adet herkese açık HTTPS görsel URL'si istediği için telefonun yerel galeri adresi doğrudan yayınlanamaz; önce güvenli medya deposuna yüklenmiş `jpg`, `jpeg`, `png` veya `bmp` bağlantısı kullanılmalıdır.

Shopier bu sistemde ödeme/sipariş hedefidir; ajan ödeme kartı verisi almaz.

### Kanal önceliği

1. **Etsy önceliklidir.** Uygulama Etsy sekmesiyle açılır. Trend tarama, otomatik keşif ve desen stüdyosu mağaza açılmadan çalışır. Mağaza kurulumu ödeme düğmesine kadar hazırlanır; nihai kurulum ücreti ve mağaza açma işlemi yalnızca hesap sahibi tarafından yapılır. Adım adım liste ve ilk ilan taslağı: `docs/ETSY_MAGAZA_ACILISI_TR.md`; kopyala-yapıştır mağaza metinleri: `docs/ETSY_MAGAZA_METINLERI.md`.
2. Etsy mağazası hobi PDF desenleri (`docs/DIJITAL_DESEN_SATISI_TR.md`), tesbih ve gümüş ürünler ve vintage ürünler (`docs/ETSY_URUN_STUDYOSU_TR.md`) satar. Mağaza açılıp Etsy OAuth bağlandıktan sonra uygulama ilanları taslak olarak gönderir; fiziksel ürünler tek onayla uygulamadan yayınlanır.
3. **Otomatik keşif:** `wrangler.jsonc` içindeki `triggers.crons` (`*/30 * * * *`) Workers Builds ile birlikte yayınlanır; ek ayar gerekmez. Cloudflare panelinde Worker → Settings → Trigger Events altında görünür. Ücretsiz planda çalışır.
4. **Pinterest otomatik pin:** Cloudflare'a `PINTEREST_APP_ID` ve `PINTEREST_APP_SECRET` gizli değerleri eklenip uygulamadan hesap bağlanınca, Etsy'de yayına giren ürünler satış linkiyle otomatik pinlenir. Adımlar ve Standard access başvurusu: `docs/PINTEREST_TR.md`.
5. Shopier ikinci kanal olarak canlı satış merkezi görevini sürdürür.
6. Letgo ücretli ilan nedeniyle beklemede kalır; Meta/WhatsApp/Instagram sonraki aşamadır.

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

Başlangıçta ücretsiz Gemini katmanı için Cloudflare Worker sırrı olarak `GEMINI_API_KEY` ve `GEMINI_MODEL=gemini-2.5-flash-lite` tanımlanır. İstenirse daha sonra `OPENAI_API_KEY` ile OpenAI sağlayıcısına geçilebilir. Hiçbir sağlayıcı anahtarı APK içine konmaz. Anahtar yoksa kural tabanlı demo ajanı devrededir. Model sadece seçilmiş katalog kayıtlarını görür; stok, fiyat veya ürün özelliği uydurmasına izin verilmez.

Fotoğraf analizinde ayrıca `OPENAI_VISION_MODEL=gpt-5.6` kullanılır. Fotoğraf Base64 olarak güvenli sunucuya gönderilir; API anahtarı APK içine konmaz. Anahtar yoksa uygulama görsel analiz yaptığını iddia etmez ve açık yapılandırma hatası gösterir.

### Ürün güvenlik kilidi

- Etsy: yasaklı ürün politikası ile yaratıcılık standartları birlikte kontrol edilir. Ticari yeniden satış, 20+ yıllık vintage veya diğer uygun Etsy üretim/kaynak koşulları doğrulanmadan açılmaz.
- Letgo: cep çakısı ve kamp bıçağı dahil açıkça yasaklanan ürünler `blocked` olur.
- Shopier: açık yasak eşleşmeleri engellenir; mevzuat veya belge gerektiren ürünler `review` olur.
- Marka, orijinallik, üretim yılı, kıymetli maden ayarı ve çocuk ürünü güvenliği fotoğraftan kesinleştirilmez; kanıt istenir.
- Politika özeti 12 Ağustos 2026 tarihinde kontrol edilmiştir. Kurallar değişebileceği için canlıya geçişte resmî bağlantılar yeniden kontrol edilmelidir.

Resmî kaynaklar:

- Etsy: `https://www.etsy.com/legal/prohibited/` ve `https://www.etsy.com/legal/creativity/`
- Letgo: `https://help.letgo.com/hc/tr/articles/30006899092754-EK-2-Yasakl%C4%B1-%C3%9Cr%C3%BCnler-Listesi`
- Shopier: `https://www.shopier.com/` altındaki Listeleme Kuralları ve Yasaklı Ürünler metinleri

### Potansiyel müşteri motoru

Motor; gelen mesaj, ürün favorisi, mağaza takibi, reklam formu, yorum, hikâye yanıtı, sepet, sipariş ve e-posta izni sinyallerini güncellik ve ürün eşleşmesine göre puanlar. Sıcak müşteriyi bulabilir; fakat izinsiz kullanıcıya ilk mesaj taslağı dahi oluşturmaz. Başarı için Meta/WhatsApp webhook'ları, Shopier sipariş sinyalleri ve izin kayıtları canlı sunucuya bağlanmalıdır.

## 7. Android yapılandırması

`apps/mobile` altında `.env` oluşturun:

```bash
EXPO_PUBLIC_API_URL=https://ALAN-ADINIZ
EXPO_PUBLIC_GXL_APP_TOKEN=SUNUCUDAKI_APP_ACCESS_TOKEN_ILE_AYNI
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
