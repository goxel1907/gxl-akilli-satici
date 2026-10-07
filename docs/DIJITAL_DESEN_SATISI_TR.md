# Dijital desen satışı: Trend → Stüdyo → Korumalı PDF

GXL'nin önceliği Etsy'dir; Shopier ve Letgo ikinci plandadır. Bu belge hobi PDF desenlerinin (tığ işi, şiş örgü, nakış, kanaviçe, dikiş, makrome, punch) akışını anlatır. Tesbih, gümüş ve vintage gibi fiziksel ürünler için bkz. [ETSY_URUN_STUDYOSU_TR.md](ETSY_URUN_STUDYOSU_TR.md).

Uygulama **Etsy** sekmesiyle açılır. Sekme dört bölümden oluşur: **Trend**, **Stüdyo**, **Dijital** ve **Kılavuz**. Kılavuz, günlük akışı, satış adımlarını, teslimatı, Etsy kurallarını, mağaza ayarlarını ve sorun gidermeyi uygulamanın içinde anlatır.

## 1. Trend: Etsy'de ne popüler?

**Etsy → Trend** bölümü üç grup halinde 28 nişi Etsy'nin resmî arama API'siyle tarar: **Hobi desenleri** (16), **Tesbih ve gümüş** (6) ve **Vintage** (6). Grup çipine dokunup **Tümünü tara**'ya basınca o gruptaki nişler taranır. Her niş 0–100 arası puan alır:

| Bileşen | Ağırlık | Ne ölçer |
| --- | --- | --- |
| Talep | %40 | Arama sonucunda üst sıradaki 48 ilanın aylık ortanca favori hızı |
| Rekabet | %25 | Aktif ilan sayısı; ilan sayısı azaldıkça puan yükselir |
| Yeni ilan payı | %20 | Üst ilanların ne kadarı son 6 ayda açılmış; yeni mağazanın öne çıkma şansını gösterir |
| Fiyat bandı | %15 | Üst ilanların ortanca USD fiyatı; desenlerde 2–12 USD, tesbih ve vintage ürünlerde 15–250 USD aralığına göre |

Desen nişlerinde dijital ürün payı %30'un altındaysa puan %20 düşürülür; alıcılar o aramada çoğunlukla bitmiş ürün arıyordur. Tesbih ve vintage nişlerinde ise sonuçların yarısından fazlası dijital ürünse puan düşer.

- Etsy satış adedini API ile paylaşmaz. Bu yüzden puan kesin satış verisi değil, bir tahmindir.
- Her nişin kartında üst ilanlarda en çok geçen etiketler ve incelenecek rakip ilanların bağlantıları bulunur.
- Kendi aramanızı da yazıp tarayabilirsiniz (ör. `crochet bag pattern`). Elle taranan arama otomatik keşif listesine de eklenir ve sonra düzenli olarak taranır.
- Sonuçlar 6 saat saklanır. Tarama için yalnızca Etsy API anahtarı gerekir; mağazanın açık olması gerekmez.

Desen kartlarındaki **Bu nişte desen hazırla** düğmesi, nişin anahtar kelimesini ve etiketlerini Stüdyo'ya aktarır. Tesbih ve vintage kartlarında **Üst etiketleri kopyala** düğmesi vardır. Her kartta **ABD'de hangi eyaletlerde aranıyor?** düğmesi o aramanın son 12 aylık Google Trends eyalet haritasını açar.

### Otomatik keşif (Keşfedilenler)

Taranan aramalar 28 sabit nişle sınırlı kalmaz. Sistem alıcıların gerçekten kullandığı yeni arama ifadelerini kendisi bulur:

1. Her taramada üst ilanlardan **son 120 günde açılmış** olanların etiketleri, ilanın aylık favori hızıyla ağırlıklandırılır. Bunlar kartta **Yeni ilanlarda yükselen etiketler** olarak görünür.
2. Bu etiketlerden ve üst ilanların en sık etiketlerinden en az 2 kelimelik, gruba uygun ifadeler seçilir:
   - Desenlerde ifade bir el işi tekniği ya da aranan kelimeyle ortak bir kelime içermelidir. Sonunda "pattern" yoksa eklenir, ör. `pineapple doily` → `pineapple doily pattern`.
   - Tesbihte ifade tesbih/dua/İslami hediye kelimelerinden birini içermelidir.
   - Genel ifadeler (`digital download`, `gift for her` vb.) alınmaz.
3. Yeni ifadeler **Trend → Keşfedilenler** listesine eklenir (en çok 80 ifade, puana göre sıralı).
4. **Otopilot:** Cloudflare her 30 dakikada bir Worker'ı tetikler. Her çalışmada sabit nişler, yaklaşan sezon aramaları ve keşfedilen ifadeler arasından en uzun süredir taranmamış olan taranır. Ücretsiz planın istek başına 10 ms işlemci sınırı nedeniyle her çalışmada tek arama taranır; bu da günde 48 tarama eder. Uygulamanın açık olması gerekmez.

Keşfedilenler kartında otopilotun son çalışma zamanı, son taranan arama ve varsa son hata görünür. Henüz puanlanmamış bir ifadeye dokunulunca o ifade hemen taranır.

Google Trends'in herkese açık bir API'si yoktur ve sunucudan yapılan istekleri engeller. Bu yüzden sistem ilgili aramaları Etsy'nin kendi verisinden çıkarır. Google Trends'teki "İlgili sorgular"da gördüğünüz bir ifadeyi Trend'deki arama kutusuna yazarsanız o ifade de takibe alınır.

### Sezon fırsatları

**Trend → Sezon fırsatları** önümüzdeki 6 ayda ABD'de gelen alışveriş dönemlerini listeler: Cadılar Bayramı, Şükran Günü, Hanuka, Noel, Sevgililer Günü, Ramazan, Ramazan Bayramı, Aziz Patrick Günü, Paskalya, Anneler Günü, Kurban Bayramı, Babalar Günü, 4 Temmuz ve sonbahar.

- Her dönemde kalan gün ve iki son listeleme tarihi gösterilir:
  - Fiziksel ürün: alışverişin başladığı tarih ve ABD'ye kargo süresine göre.
  - Desen: alıcının ürünü örmesi için ek 3 hafta.
- Aciliyet etiketi: **Hemen listele**, **Bu ay hazırla** veya **Planla**.
- **Bu sezonu tara**, o döneme ait arama ifadelerini (ör. `christmas crochet pattern`, `eid gift for men`, `vintage christmas ornaments`) Etsy'de puanlar ve en güçlü aramayı öne çıkarır.
- Kartlardaki Google Trends bağlantısı son 5 yılı açar; hem sezon zirvesinin hangi aylarda olduğu hem de eyalet haritası görünür.
- Ramazan ve bayram tarihleri ay gözlemine göre bir gün kayabilir.

### ABD'de eyalet bazında hedefleme

- Etsy, başlığa yazılan eyalet adına göre o eyaletteki alıcıya öncelik vermez. Ürünle ilgisi olmayan eyalet adı alakasız anahtar kelime sayılır ve sıralamaya zarar verebilir.
- Eyalet adı yalnızca ürün gerçekten o eyaletle ilgiliyse başlığa girer, ör. `Texas Bluebonnet Crochet Doily Pattern`.
- Google Trends eyalet haritası şu işlere yarar:
  1. İlginin yoğun olduğu eyalete özel tema tasarlamak (o eyaletin çiçeği, sembolü, renkleri).
  2. Pinterest ve Instagram reklamlarında eyalet hedeflemek. Etsy reklamları konum hedeflemesi sunmaz.
  3. Mevsimi yakalamak: zaman grafiği, ör. `christmas doily` aramasının hangi aylarda yükseldiğini gösterir; ilan o dönemden 4–6 hafta önce açılır.
- Tesbih ve vintage gibi fiziksel ürünlerde ABD'li alıcılar ücretsiz kargo filtresini sık kullanır. Kargoyu fiyata dahil edip "free shipping" sunmak görünürlüğe yardımcı olur.
- Vintage ilanlarında Etsy en az 20 yıllık olma şartı arar; üretim yılını gösteren fotoğraf veya belge saklanmalıdır. Tesbihlerde "Who made it?" cevabı Etsy yaratıcılık standartlarına uymalıdır.

## 2. Stüdyo: prompt ve ilan

Formu doldurun: el işi türü, ürün türü (İngilizce), seçtiğiniz modelde neyi beğendiğiniz, modeldeki tekrar sayısı ve renkler. Sistem şunları üretir:

1. **Desen adı:** Sistem kendisi seçer. Beğenmezseniz "Yeni isimle yeniden hazırla" düğmesine basın.
2. **Farklılaştırma planı:** Tasarımın referans modelden açıkça farklı olması için kurallar üretir. Bunlar tekrar sayısı, motif şekli, kenar tekniği ve renk paletinin değişmesi; referansın yazısının, fotoğrafının ve şemasının kullanılmamasıdır.
3. **PDF desen promptu:** Claude veya ChatGPT için hazırlanır. Model üç aşamada çalışır: tasarım tablosu, sayı ve geometri denetimi, son PDF. Prompt şunları zorunlu kılar: her sıranın sonunda ilmek sayısı, şema, malzeme ve metraj, sorun giderme, hızlı başvuru sayfası, lisans sayfası ve her sayfada telif altbilgisi. Giyilebilir ürünlerde en az 3 beden istenir.
4. **3D render promptu:** PDF'in sonunda çıkan "Design spec" JSON'u bu prompta yapıştırılır. Böylece render, desendeki motif sayısı ve renklerle birebir aynı olur.
5. **Etsy fotoğraf planı** (10 görsel) ve satış öncesi **kalite kapısı.**
6. **Etsy ilanı:** Başlık (en fazla 140 karakter, ana arama ifadesi başta), her biri en fazla 20 karakter olan 13 etiket ve açıklama. Açıklamada "dijital ürün" uyarısı, render ve yapay zekâ bildirimi ile telif metni bulunur. Etsy'nin karakter kuralları otomatik uygulanır. Sunucuda Gemini anahtarı varsa başlık ve etiketler yapay zekâyla iyileştirilir, sonra yine kurallardan geçirilir.

Prompt kutularındaki **Kopyala / gönder** düğmesi Android paylaşım menüsünü açar. Metni doğrudan Claude veya ChatGPT uygulamasına gönderebilirsiniz.

## 3. Dijital: PDF yükleme ve korumalı teslim

1. **PDF yükle:** PDF'i (en fazla 20 MB) ve render ya da ürün fotoğraflarını (en fazla 10) seçin. Fiyatı ve "test edildi / render / yapay zekâ" işaretlerini girin.
2. Dosya Cloudflare'deki özel depoya kaydedilir ve herkese açık bir adresi yoktur.
3. **Etsy taslağı oluştur:** Başlık, açıklama, etiketler, görseller ve PDF Etsy'ye *taslak* dijital ilan olarak gönderilir. İlan kendiliğinden yayına girmez. Etsy'de taslağı açıp yapay zekâ kutusunu, kategoriyi ve fiyatı kontrol ettikten sonra yayınlarsınız. Etsy, PDF'i yalnızca ödeme yapan alıcıya verir.
4. **Satış bağlantısı** (Shopier veya doğrudan satış): Ödeme geldikten sonra sipariş numarasıyla kişiye özel bir bağlantı oluşturun. Varsayılan sınır 3 indirme ve 14 gündür. Bağlantı paylaşım menüsüyle alıcıya gönderilir. İade olursa **Bağlantılar** bölümünden kapatılır.

### Koruma neyi sağlar, neyi sağlamaz

- **Ödemesiz erişim yok.** PDF'in açık bir adresi yoktur. Etsy'de dosyayı Etsy teslim eder; diğer kanallarda yalnızca sizin oluşturduğunuz bağlantı çalışır.
- **Bağlantı paylaşımı sınırlı.** Her bağlantı tek siparişe aittir; indirme sayısı ve süresi sınırlıdır ve kapatılabilir. Bağlantı başkasıyla paylaşılırsa kalan indirme hakkı hızla biter.
- **İndirilmiş dosyanın kopyalanmasını hiçbir sistem tamamen engelleyemez.** Caydırıcı önlemler şunlardır: her sayfadaki telif altbilgisi, lisans sayfası ve Etsy'nin fikrî mülkiyet bildirim formu.
- Her sayfaya alıcının adını veya sipariş numarasını basan görünür filigran, Cloudflare ücretsiz planının istek başına 10 ms işlemci sınırında güvenilir çalışmaz. Aylık 5 USD'lik ücretli Workers planına geçilirse eklenebilir.

## Öne çıkmak için

Etsy'de en çok satan desen mağazalarında ortak olan uygulamalar:

- Desen satıştan önce en az bir kez örülür. Etsy'deki kötü yorumların ana nedeni, çalışmayan veya fotoğrafla uyuşmayan yapay zekâ desenleridir.
- Kapak görseli gerçek ürün fotoğrafıdır; render yalnızca ek görsel olur ve üzerinde "Digital render" yazar.
- İlana 5–15 saniyelik ürün videosu eklenir.
- Her sıranın sonunda ilmek sayısı, şema, bol fotoğraflı adımlar ve giyilebilirlerde çoklu beden bulunur.
- Mağaza tek bir alana odaklanır (ör. dantel ve ev dekoru); düzenli olarak yeni ilan eklenir.
- Mesajlara hızlı cevap verilir; Etsy'nin Star Seller ölçütleri buna bakar.
- Kendi desenlerinizden 2–3'lü setler hazırlanabilir. Başkalarının desenlerinden oluşan "binlerce desen" paketleri genellikle izinsiz kopyadır; bunlardan uzak durun.

## Kurallar

- Etsy'nin ocak 2026'da güncellenen politikasına göre, yapay zekâ kullanıldıysa ilan formundaki kutu işaretlenmeli ve açıklamada belirtilmelidir. Sistem açıklamaya bildirimi otomatik ekler; kutuyu Etsy'de taslağı yayınlarken siz işaretlersiniz.
- Başkasının videosundan veya fotoğrafından alınmış kareler PDF'te kullanılmaz.
- Başkasının desen metni çevrilip veya yeniden yazılıp satılmaz.

## Sunucu ayarları

| Ayar | Nerede | Ne için |
| --- | --- | --- |
| `ETSY_API_KEY`, `ETSY_SHARED_SECRET` | Cloudflare Worker sırları | Trend tarama ve Etsy bağlantısı |
| Etsy uygulaması geri dönüş adresi | Etsy geliştirici paneli | `https://gxl-akilli-satici-api.gxl-marketstudio.workers.dev/etsy/oauth/callback` |
| `ETSY_OAUTH` KV | `wrangler.jsonc` (mevcut) | PDF'ler, görseller, bağlantılar ve trend önbelleği |
| `APP_ACCESS_TOKEN` | Cloudflare Worker sırrı | Yükleme ve bağlantı oluşturma |
| `GEMINI_API_KEY` (isteğe bağlı) | Cloudflare Worker sırrı | Başlık ve etiketlerin yapay zekâyla iyileştirilmesi |

Ücretsiz KV kotası 1 GB depolama ve günde 1.000 yazmadır. Otopilot her çalışmada en çok 3 yazma yapar, yani günde yaklaşık 144 yazma harcar. 3 MB'lık PDF'lerle yaklaşık 300 desen saklanabilir; her indirme 1 yazma harcar.

### API uçları

- `GET /api/etsy/trends`: niş listesi ve önbellekteki puanlar
- `POST /api/etsy/trends/scan`: `{ nicheId }` veya `{ keyword }` ile tek bir niş ya da arama taraması. İsteğe bağlı `group` (patterns/tesbih/vintage/other) puanlama grubunu belirler. `track: true` aramayı otomatik keşif listesine ekler. Yanıttaki `discovered` alanı bu taramadan çıkan yeni ifadeleri verir.
- `GET /api/etsy/discoveries`: otopilot durumu ve keşfedilen arama ifadeleri
- Cron (`*/30 * * * *`, `wrangler.jsonc`): her çalışmada tek bir arama tarayan otopilot
- `POST /api/patterns/plan`: desen adı, farklılaştırma planı, PDF ve render promptları, fotoğraf planı ve Etsy ilanı
- `GET/POST /api/digital/products`: dijital ürün listesi ve multipart PDF yükleme (`confirm: true`)
- `POST /api/digital/products/:id/etsy-draft`: Etsy'de taslak dijital ilan, görseller ve PDF (`confirm: true`)
- `POST /api/digital/products/:id/grants`: siparişe özel indirme bağlantısı (`confirm: true`)
- `POST /api/digital/grants/:id/revoke`: bağlantıyı kapatma (`confirm: true`)
- `GET /d/:id`: alıcının indirme sayfası; `GET /d/:id/file` PDF'i indirir
