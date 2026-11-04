# Pinterest otomatik pin

Etsy'de yayına giren her ürün, kendi satış linki, görseli, başlığı, açıklaması, anahtar kelimeleri ve hashtag'leriyle Pinterest'e otomatik pinlenir. Dijital ürünlerde Pinterest en büyük dış trafik kaynağıdır.

## Nasıl çalışır?

1. **Sıraya alma:** Stüdyo'da hazırlanıp **Dijital → Etsy taslağı oluştur** ile Etsy'ye gönderilen her ürün için 3 pin sıraya girer. Shopier'den gelen fiziksel ürünler de aynı şekilde sıraya girer.
2. **Günlere yayma:** Pinler 0., 2. ve 5. günlerde atılır. Aynı linki art arda pinlemek Pinterest'te spam sayılabildiği için yayılır.
   - İlk pin ilan yayına girince gider.
   - 2. ve 5. gün pinleri ABD akşamına zamanlanır: Doğu saatiyle 20:00–21:00, Pasifik saatiyle 17:00–18:00 (Türkiye saatiyle gece 04:00 civarı). Alıcıların çoğu ABD'de olduğu için pin, onların Pinterest'e en çok baktığı saatte yayınlanır.
3. **Kontrol:** Sunucu her 30 dakikada bir sırayı kontrol eder. Bunun için Etsy otopilotunu çalıştıran cron kullanılır, ek ayar gerekmez.
   - İlan Etsy'de henüz yayında değilse 6 saat sonra yeniden bakar.
   - İlan 15 gün içinde yayına girmezse iş "Hata" olarak kapanır.
4. **Pin içeriği:** İlan yayındaysa pin ilanın **canlı Etsy verisinden** kurulur:
   - **Satış linki:** `https://www.etsy.com/listing/<numara>?utm_source=pinterest...` Etsy istatistiklerinde Pinterest trafiği ayrı görünür. Elle eklenen ilanlarda isterseniz farklı bir link (ör. Shopier) verebilirsiniz.
   - **Görsel:** İlanın görsellerinden en dik oranlı olan ilk pinde kullanılır, sonraki pinlerde diğer görseller. Pinterest dikey (2:3) görselleri öne çıkarır; Stüdyo'daki 9. görsel (Pinterest pini) bu yüzden hazırlanır.
   - **Başlık (en fazla 100 karakter):** Stüdyonun hazırladığı pin başlığı. Yoksa Etsy başlığının ilk bölümleri.
   - **Açıklama (en fazla 800 karakter):** Stüdyonun pin açıklaması veya ilan açıklamasının ilk paragrafı, ardından Etsy etiketlerinden anahtar kelimeler ve en fazla 5 hashtag.
   - **Alt metin (en fazla 500 karakter):** Başlık ve anahtar kelimeler.
   - **Yapay zekâ beyanı:** Görseller yapay zekâyla üretilmiş render ise pine Pinterest'in yapay zekâ beyanı (AI_MODIFIED) eklenir.
5. **Pano:** Pin, ürün türüne göre otomatik açılan bir panoya eklenir. Örnekler:
   - Printable Planners & Trackers
   - Printable Coloring Pages
   - Printable Wall Art
   - Crochet Patterns
   - Prayer Beads

**Etiketler hakkında:** Pinterest'te Etsy'deki gibi ayrı bir etiket alanı yoktur. Aramada bulunmayı başlık, açıklama ve alt metindeki anahtar kelimeler ile pano adı sağlar. Hashtag'ler açıklamanın sonuna eklenir. Marka/telif riski taşıyan kelimeler (Disney vb.) hiçbir zaman eklenmez.

## Onay beklerken: elle paylaş (API gerekmez)

Pinterest yeni geliştirici uygulamalarına önce **Trial** erişim verir. Bu erişimle açılan pinleri yalnız hesap sahibi görür. Herkese açık otomatik pin için **Standard** erişim onayı gerekir.

Onay gelene kadar uygulama pinleri yine hazırlar:
1. Etsy → Pinterest → **Elle paylaş** listesini açın. Zamanı gelen pinler üsttedir.
2. **Pinterest'te paylaş** düğmesine basın. Pinterest'in pin oluşturma sayfası; ilanın görseli, satış linki (utm etiketli) ve hazır açıklamayla açılır.
3. Panoyu seçip **Kaydet**'e basın. Yapay zekâ etiketi sorulursa "AI modified" seçin.
4. Uygulamaya dönüp **Paylaştım** deyin. Pin sıradan düşer.

Bu yol için Pinterest bağlantısı, uygulama anahtarı veya onay gerekmez. Günde 1-2 pin yeterlidir.

**Standard erişim başvurusu:**
- developers.pinterest.com → My apps → uygulama. Erişim düzeyi orada yazar.
- Trial ise **Upgrade** ile Standard erişim isteyin.
- Başvuruda uygulamanın Pinterest'e bağlanmasını (OAuth izin ekranı dahil) ve bir pin oluşturmasını gösteren kısa bir ekran videosu istenir. Video izin ekranını göstermezse başvuru çoğunlukla reddedilir.

## Kurulum (bir kez)

1. **Pinterest işletme hesabı:** `pinterest.com/business` adresinden ücretsiz bir işletme hesabı açın veya mevcut hesabınızı işletme hesabına çevirin.
2. **Pinterest uygulaması:** `developers.pinterest.com/apps/connect/` formunu doldurun:
   - **App name:** GXL Market Studio Pin Publisher
   - **App description:** Publishes Pins for GXL Market Studio's own Etsy listings (digital printables and handmade products). Each Pin links to the matching Etsy listing. Used only by the shop owner.
   - **Website / Company website:** `https://www.etsy.com/shop/GXLMarketStudio`
   - **Privacy policy URL:** `https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev/GXLMarketStudio/privacy-policy` (sunucudaki herkese açık sayfa; Pinterest adreste şirket adını arar, şirket adı alanına da `GXLMarketStudio` yazın)
   - **Uygulama amacı:** Pin oluşturma / içerik yayınlama seçeneği. Reklam ve analiz seçenekleri gerekmez.

   Pinterest başvuruyu inceler (Trial access). Onaydan sonra uygulama sayfasında **Redirect URI** olarak şunu ekleyin: `https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev/pinterest/oauth/callback`
3. **Cloudflare gizli değerleri:** Cloudflare → Workers → `gxl-akilli-satici-api` → **Settings → Variables and Secrets** bölümüne şunları **Secret** olarak ekleyin:
   - `PINTEREST_APP_ID`
   - `PINTEREST_APP_SECRET`

   Bu değerleri sohbete, uygulamaya veya GitHub'a yazmayın.
4. **Hesabı bağlama:** Uygulamada **Etsy → Pinterest → Bağla**. Pinterest izin ekranında "Allow" deyin. Erişim anahtarı yalnızca sunucudaki şifreli KV deposunda tutulur.
5. **Otomatik pinleme:** **Otomatik pinle** anahtarını açık bırakın (varsayılan açık).

## Trial access ve Standard access

- **Trial access:** Yeni Pinterest uygulamaları bu seviyeyle başlar. Bu aşamada API ile oluşturulan pinleri **yalnızca siz** görürsünüz.
- **Standard access:** Pinlerin herkese görünmesi için `developers.pinterest.com` → uygulamanız → **Standard access** başvurusu yapın. Pinterest başvuruda kısa bir ekran kaydı ister. Kayıtta şunlar görünmeli:
  1. Uygulamada **Bağla** düğmesi ve Pinterest izin ekranı ("Allow").
  2. **Pinterest** bölümünde bir ilanın **Şimdi gönder** ile pinlenmesi.
  3. Pinin Pinterest'te panoda görünmesi.

Onay gelene kadar sistem pinleri yine oluşturur, ama görünürlük Pinterest'in kararına bağlıdır.

## Uygulamada Pinterest bölümü

- Bağlantı durumu, otomatik pinleme anahtarı ve sıra özeti (zamanlandı / yayın bekleniyor / pinlendi / hata).
- **Mevcut bir Etsy ilanını pinle:** İlan linkini yapıştırın; isterseniz farklı bir satış linki girin. 3 pin planlanır.
- **Pin sırası:** Her pinin durumu ve tarihi; **Şimdi gönder** ve **Pini aç** düğmeleri.

## API uçları

- `GET /api/pinterest/status`: Bağlantı, ayar ve sıra özeti.
- `POST /api/pinterest/connect-session`: Pinterest izin bağlantısı.
- `GET /pinterest/oauth/callback`: Pinterest dönüşü.
- `POST /api/pinterest/settings`: `{ auto: true | false }`
- `GET /api/pinterest/queue`: Pin sırası.
- `POST /api/pinterest/queue`: `{ confirm: true, listingUrl | listingId, link?, boardName? }`
- `POST /api/pinterest/queue/:id/run`: `{ confirm: true }` ile pini hemen gönderir.
- `POST /api/pinterest/disconnect`: `{ confirm: true }`
- Etsy taslak uçlarının yanıtındaki `pinsQueued`, kaç pinin planlandığını gösterir.
