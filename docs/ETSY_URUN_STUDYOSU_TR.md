# Fiziksel ürünler için otomatik Etsy ilanı

Tesbih, gümüş, vintage, örgü/tığ işi ve benzeri fiziksel ürünlerde Etsy ilanını sistem hazırlar. İki giriş yolu var, ikisi de aynı motoru kullanır:

- **Fotoğraftan (Shopier gerekmez):** Etsy → Stüdyo → **Elimdeki ürün (fotoğraf)**.
- **Shopier ürününden:** Shopier sekmesindeki ürün kartında **Etsy ilanı hazırla**.

## Fotoğraftan ilan

1. **Fotoğraflar:** Kamera veya galeriden en fazla 10 fotoğraf. İlk fotoğraf kapaktır; başka bir fotoğrafa dokununca kapak olur.
2. **Fotoğraf analizi** (`POST /api/products/photo-analyze`): En fazla 3 fotoğraf telefonda 1024 piksele küçültülüp Gemini'ye gider. Sonuç:
   - ürün türü (tesbih, vintage, örgü, diğer), Türkçe ad, alıcının aradığı İngilizce ad;
   - tığ/şiş, kimin için (kadın/erkek/unisex), renkler, görünen özellikler, görünen kusurlar;
   - satıcının doğrulaması gereken sorular.

   Model gümüş, altın, damga, marka ve yaş iddiasında bulunmaz; bunları satıcı onaylar. Bebek/çocuk ürünü ya da marka logosu görünürse uyarı çıkar. Uyarı yanlışsa satıcı kaldırabilir. Gemini anahtarı yoksa analiz atlanır, alanlar elle doldurulur.
3. **Türe göre form:**
   - **Örgü:** kim ördü (ben / mağaza üyesi), teknik, beden, düz göğüs genişliği, boy, iplik içeriği, yıkama.
   - **Tesbih:** kim yaptı, damga, gram, tane sayısı, uzunluk.
   - **Vintage:** yaklaşık üretim yılı, ölçüler, İngilizce durum notu.
   - **Hepsinde:** elinize geçecek TL, ABD kargosu (TL), adet.
4. **Etsy araştırması ve plan:** Aşağıdaki "Sistemin yaptıkları" adımları uygulanır.
5. **Taslak:** Fotoğraflar ancak bu adımda 3000 piksele küçültülüp tek tek yüklenir (`POST /api/products/photos`). Uygulamanın kendi deposuna (KV veya R2) kaydedilir ve Etsy taslağına aktarılır. Aynı ürün için ikinci kez taslak açılmaz.

**Örgü ürünlerinde:**

- **Başlık:** "Crochet Sweater, Cream Cotton Oversized Sweater, Size M, Handmade in Türkiye, Gift for Her" düzenindedir.
- **Açıklama:** beden, cm/inç ölçüler, İngilizceye çevrilmiş iplik içeriği ve yıkama talimatı yer alır.
- **Etsy kategorisi:** seçilen kitlenin dalından seçilir (kadın/erkek giyimi). Çocuk dalları, ürün açıkça çocuk için değilse seçilmez.
- **Renk ve madde ayrımı:** "altın sarısı" ve "gümüş gri" gibi renk adları değerli maden iddiası sayılmaz.

## Senin girdiğin bilgiler

- **Kim yaptı?** Seçenekler: ben/atölyem yaptı, tasarım benim ve ustaya yaptırdım, vintage (20+ yıl, yaklaşık üretim yılıyla), hazır aldım ve yeniden satıyorum.
- Ayar damgası veya malzeme belgesi var mı?
- Ağırlık, tane sayısı, uzunluk (isteğe bağlı).
- ABD'ye kargo ücreti (TL).
- İsteğe bağlı: İngilizce ürün adı ve dolar kuru. Boş bırakılırsa sistem kendisi bulur.

## Sistemin yaptıkları

1. **Arama ifadesi:** Türkçe başlıktan Amerikalı alıcının kullandığı ifadeleri çıkarır, ör. `sterling silver prayer beads`, `silver tasbih`, `silver misbaha`. Gemini anahtarı varsa yapay zekâ ek öneriler getirir.
2. **Etsy araştırması:** Her ifadeyi Etsy'nin resmî aramasında tarar. Puanı en yüksek ve en az 50 ilanı olan ifadeyi seçip başlığın başına koyar.
3. **Etiket ve metin:** Üst ilanlarda en çok kullanılan ve ürünle ilgili etiketlerden 13 etiket seçer. Etsy kurallarına uyan başlığı ve İngilizce açıklamayı yazar. Açıklamada inç/ons karşılıkları, kargo bilgisi ve gerekiyorsa üretim ortağı bildirimi bulunur.
4. **Fiyat:** Elinize geçmesini istediğiniz TL tutarını (Shopier'den gelen üründe Shopier fiyatını) güncel kurla dolara çevirir. Etsy Türkiye kesintilerini ekler: işlem %6,5, ödeme işleme %6,5 + 14 TL, düzenleyici ücret %2,27, mağaza para birimi TL değilse %2,5 döviz çevirme ve 0,20 USD ilan ücreti. ABD kargosunu fiyata dahil eder (alıcıya ücretsiz kargo). Bu hesapla, o TL tutarını eksiksiz bırakan başabaş fiyatı bulur ve Etsy ortancasıyla karşılaştırır.
   - Başabaş fiyat ortancanın %85'inden düşükse önerilen fiyat ortancanın %85'i olur.
   - Ortancanın %30 fazlasından yüksekse uyarı verir.
5. **Rakipler:** Seçilen ifadede öne çıkan rakip ilanları bağlantılarıyla gösterir.
6. **Etsy kural kapısı:**
   - Hazır alınıp yeniden satılan, 20 yıldan yeni ürün **Etsy'de yayınlanmaz**; düğme kilitlenir ve ürün Shopier'de kalır.
   - Tasarım senin, üretim ustanınsa Etsy'de üretim ortağıyla listelenir.
   - Vintage ürün, üretim yılına göre doğru dönemle listelenir.
   - 925/altın iddiasında ayar damgası veya belge yoksa taslak oluşturulmaz.
7. **Taslak:** Etsy'de taslak fiziksel ilan açar ve fotoğrafları (Shopier'den ya da uygulamanın kendi deposundan) yükler. Mağazadaki kargo profilini, hazırlık süresi profilini ve gerekiyorsa üretim ortağını kullanır. İlan bu aşamada yayına girmez.
8. **Yayınlama:** Taslak oluşunca planlayıcıda **Taslağı kontrol et** ve **Etsy'de yayınla** düğmeleri çıkar. Yayınla'ya basıp onaylayınca ilan Etsy'de aktif olur (`POST /api/products/etsy-publish`, `confirm: true`). Etsy her yayında 0,20 USD ilan ücreti keser. Bu yüzden düğme tek dokunuşluk bir onay ister. Fotoğrafı olmayan ya da kargo profili eksik ilanı Etsy yayınlamaz; hata mesajıyla birlikte taslağı açma seçeneği gösterilir.

## Etsy'de bir kez yapılacak ayarlar

- **Kargo profili:** Shop Manager → Settings → Shipping settings. ABD için ücretsiz kargo seçilir; kargo bedeli fiyata dahil edildi.
- **Üretim ortağı:** Ustaya yaptırılan ürünler için Shop Manager → Settings → Production partners bölümünden usta veya atölye eklenir.
- **Mağaza üyesi:** Ürünü ailenizden biri yapıyorsa Shop Manager → Settings → About your shop → Shop members bölümünden eklenir. İlan "A member of my shop" olarak açılır.

Kesinti oranları üçüncü taraf özetlerinden alınmıştır; fiyatlamadan önce `https://www.etsy.com/legal/fees/` sayfasından teyit edin. Oranlar `apps/worker/src/product-studio.ts` içindeki `ETSY_TR_FEES` sabitindedir.
