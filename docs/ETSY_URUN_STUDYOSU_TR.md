# Fiziksel ürünler için otomatik Etsy ilanı

Tesbih, gümüş, vintage ve benzeri fiziksel ürünlerde Etsy ilanını sistem hazırlar. Uygulamada **Shopier** sekmesindeki ürün kartında **Etsy ilanı hazırla** düğmesine basılır.

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
4. **Fiyat:** Shopier TL fiyatını güncel kurla dolara çevirir. Etsy Türkiye kesintilerini ekler: işlem %6,5, ödeme işleme %6,5 + 14 TL, düzenleyici ücret %2,27, mağaza para birimi TL değilse %2,5 döviz çevirme ve 0,20 USD ilan ücreti. ABD kargosunu fiyata dahil eder (alıcıya ücretsiz kargo). Bu hesapla, Shopier fiyatını eksiksiz bırakan başabaş fiyatı bulur ve Etsy ortancasıyla karşılaştırır.
   - Başabaş fiyat ortancanın %85'inden düşükse önerilen fiyat ortancanın %85'i olur.
   - Ortancanın %30 fazlasından yüksekse uyarı verir.
5. **Rakipler:** Seçilen ifadede öne çıkan rakip ilanları bağlantılarıyla gösterir.
6. **Etsy kural kapısı:**
   - Hazır alınıp yeniden satılan, 20 yıldan yeni ürün **Etsy'de yayınlanmaz**; düğme kilitlenir ve ürün Shopier'de kalır.
   - Tasarım senin, üretim ustanınsa Etsy'de üretim ortağıyla listelenir.
   - Vintage ürün, üretim yılına göre doğru dönemle listelenir.
   - 925/altın iddiasında ayar damgası veya belge yoksa taslak oluşturulmaz.
7. **Taslak:** Etsy'de taslak fiziksel ilan açar ve Shopier fotoğraflarını yükler. Mağazadaki kargo profilini, hazırlık süresi profilini ve gerekiyorsa üretim ortağını kullanır. İlan yayına girmez; Etsy'de kontrol edip sen yayınlarsın.

## Etsy'de bir kez yapılacak ayarlar

- **Kargo profili:** Shop Manager → Settings → Shipping settings. ABD için ücretsiz kargo seçilir; kargo bedeli fiyata dahil edildi.
- **Üretim ortağı:** Ustaya yaptırılan ürünler için Shop Manager → Settings → Production partners bölümünden usta veya atölye eklenir.

Kesinti oranları üçüncü taraf özetlerinden alınmıştır; fiyatlamadan önce `https://www.etsy.com/legal/fees/` sayfasından teyit edin. Oranlar `apps/worker/src/product-studio.ts` içindeki `ETSY_TR_FEES` sabitindedir.
