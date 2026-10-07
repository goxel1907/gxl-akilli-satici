# Etsy mağaza açılış kontrol listesi

Durum (7 Ekim 2026): Etsy hesabı oluşturuldu ve GXL uygulaması Etsy hesap iznini alabiliyor. Uygulama "Etsy hesap izni tamamlandı; mağaza kurulumu bekliyor" durumunda. Sıradaki iş, `https://www.etsy.com/sell` sihirbazını bitirip mağazayı açmak.

Kurulum ücreti ve "Mağazayı aç" onayı yalnızca hesap sahibi tarafından yapılır. Kimlik, IBAN, kart veya şifre bilgileri sohbete, GitHub'a ya da uygulamaya yazılmaz.

**Mağazanın yönü:** Etsy mağazası, kadınların hobilerine yönelik dijital PDF desenleri satar. Tesbihler Shopier'de ayrı satılır. Desen üretimi ve yükleme akışı `docs/DIJITAL_DESEN_SATISI_TR.md` dosyasında anlatılıyor.

## Başlamadan önce tek karar: Ürünü kim yaptı?

Dijital desenlerde cevap basittir: Deseni siz tasarladıysanız `I did` seçilir. Yapay zekâ desteği kullandıysanız ilan formundaki yapay zekâ kutusu işaretlenir ve açıklamada belirtilir; sistem açıklamaya bu bildirimi otomatik ekler. Başkasının deseni, videosu veya fotoğrafı kullanılarak hazırlanmış PDF Etsy'de satılamaz.

Fiziksel ürünlerde (ör. tesbih) "Who made it?" cevabı Etsy yaratıcılık standartlarına bağlıdır; uygulamadaki politika kilidi de aynı kuralı uygular:

| Durum | Etsy'deki cevap | Etsy'de satılabilir mi? |
| --- | --- | --- |
| Tesbihi siz veya ekibiniz yaptı | `I did` / `A member of my shop` | Evet |
| Tasarım sizin, bir atölye üretti | `Another company or person` + üretim ortağı (production partner) bilgisi | Evet, üretim ortağı ilanda açıklanırsa |
| Hazır alınıp yeniden satılıyor, 20 yıldan yeni | — | Hayır. Shopier'de kalmalı |
| 20 yıldan eski | `Another company or person` + `Vintage` | Evet, yaş kanıtıyla |

İlk ilan olarak test edilmiş bir dijital desen önerilir. Dijital ilanda kargo profili gerekmez, bu yüzden sihirbaz daha kısa sürer.

## 1. Mağaza tercihleri (Shop preferences)

- **Shop language:** `English`. Bu dil sonradan değiştirilemeyebilir; ilk seferde doğru seçin.
- **Shop country:** `Turkey`.
- **Shop currency:** Banka hesabınız TL ise `Turkish Lira (TRY)`. Ödeme hesabınızın para birimi listeleme para biriminden farklıysa Etsy %2,5 döviz çevirme ücreti keser. Alıcılar fiyatı yine kendi para biriminde görür. Para birimi sonradan ayarlardan değiştirilebilir.
- "Satış yapmak tam zamanlı işim mi?" sorusu yalnızca istatistik içindir; dürüst cevap verin.

## 2. Mağaza adı (Shop name)

Kurallar: 4–20 karakter, boşluk, Türkçe karakter ve özel işaret kullanılamaz. Alınmışsa sıradakini deneyin:

1. `GXLPatternStudio`
2. `GXLStitchStudio`
3. `GXLCraftPatterns`
4. `GXLMarketStudio`

## 3. İlk ilan (Stock your shop)

Sihirbaz devam etmek için en az bir ilan ister. İlk ilanı dijital desen olarak açmak için:

1. GXL uygulamasında **Etsy → Stüdyo** bölümünde ilanı hazırlayın. **İlan metnini kopyala** düğmesi başlığı, açıklamayı ve 13 etiketi verir.
2. Etsy formunda şu seçimleri yapın: `Type: Digital files`, `Who made it? I did`, `What is it? A supply or tool to make things`, `When was it made? 2020 - 2026`.
3. Category kutusuna ürünün desen kategorisini yazın (ör. `crochet patterns`) ve Etsy'nin önerisini seçin.
4. Yapay zekâ kullandıysanız ilgili kutuyu işaretleyin.
5. Görsellere gerçek ürün fotoğrafını koyun; render kullanıyorsanız üzerinde "Digital render" yazsın. PDF'i "Digital files" bölümüne yükleyin.

Mağaza açıldıktan sonraki desenler, uygulamadaki **Etsy taslağı oluştur** düğmesiyle otomatik taslak olarak gönderilir.

## 4. Ödeme alma (How you'll get paid)

- Türkiye'de Etsy Payments zorunludur. Alıcı kartla veya PayPal ile öder, para Türkiye'deki banka hesabınıza yatar.
- Satıcı türü: Şirketiniz yoksa `Individual / sole proprietor`.
- Etsy'nin istediği kimlik, adres ve banka (IBAN) bilgilerini doğrudan Etsy formuna girin. Hesap sahibi adı kimlikteki adla aynı olmalıdır.
- Yeni mağazalarda ilk ödemeler bekletilebilir veya ek kimlik doğrulaması istenebilir. Bu normaldir.

## 5. Faturalandırma (Set up billing)

- İlan ücreti ve varsa tek seferlik kurulum ücreti bu karttan çekilir. Ücret Etsy'nin ilk açılış ekranında gösterilir ve iade edilmez.
- Türk kartlarında en sık hata: Banka uygulamasından **internet alışverişi** ve **yurt dışı alışveriş** izinlerini açın. Sanal kart da kullanılabilir.

## 6. Mağaza güvenliği

İki adımlı doğrulamayı (2FA) bir doğrulama uygulamasıyla açın ve yedek kodları güvenli bir yerde saklayın.

## 7. Mağazayı aç

Ekranda gösterilen kurulum ücretini kontrol edin ve **Open your shop** düğmesine yalnızca kendiniz basın.

## 8. Açıldıktan sonra GXL uygulamasında

1. **Kanallar → Etsy** satırını yenileyin. Durum `Bağlı · <MağazaAdı>` olmalıdır.
2. Durum `Etsy hesabı henüz bağlanmadı` diyorsa Etsy satırına dokunup izni yeniden verin.
3. Mağaza adı görünüyorsa **Etsy → Dijital** bölümünde yüklenen desenler için **Etsy taslağı oluştur** düğmesi çalışır.
4. Shopier ürünlerinde **Etsy ilanı hazırla → Etsy taslağı oluştur → Etsy'de yayınla** akışı açılır.
5. Günlük kullanım, kurallar ve sorun giderme uygulamada **Etsy → Kılavuz** bölümündedir.

## Ek: Tesbih Etsy'de satılacaksa

Tesbih ve gümüş ürünler Etsy'de **Shopier → Etsy ilanı hazırla** akışıyla listelenir (bkz. [ETSY_URUN_STUDYOSU_TR.md](ETSY_URUN_STUDYOSU_TR.md)). Yukarıdaki "Ürünü kim yaptı?" tablosu geçerlidir. Aşağıdaki taslak `GXL-GMS-024` (24 g, ay-yıldızlı, oksitli) içindir. Köşeli parantezli alanları ürünü ölçerek doldurun. Doğrulanmamış bilgiyi silin, tahminle doldurmayın.

**Fotoğraflar:** Uygulamadaki `gxl-24g-1/2/3` fotoğrafları. Bunlara ek olarak 925 damgasının yakın çekimi ve elde ya da cetvel yanında boyut gösteren bir kare ekleyin. Etsy kare küçük resim kullanır; ürünü ortalayın.

**About this listing**

- Who made it? → Yukarıdaki tabloya göre
- What is it? → `A finished product`
- When was it made? → Üretim yılınız (ör. `2020 - 2026`)
- Category → Kutuya `prayer beads` yazıp Etsy'nin önerdiği kategoriyi seçin

**Title** (en fazla 140 karakter)

```
925 Sterling Silver Tesbih, 24 g Oxidized Prayer Beads with Crescent and Star, Turkish Misbaha Gift for Him
```

**Description**

```
Oxidized 925 sterling silver tesbih (prayer beads) with a crescent and star detail.

Details
- Material: 925 sterling silver (stamped)
- Weight: 24 g
- Number of beads: [fill in]
- Total length: [fill in] cm / [fill in] in
- Bead size: [fill in] mm
- Quantity available: 1 — the piece you receive is the one in the photos

The oxidized finish darkens the recesses on purpose to bring out the detail work.

Care
Silver naturally tarnishes over time. Wipe with a soft silver polishing cloth and store in a dry pouch. Do not use liquid dip cleaners; they remove the intentional oxidized finish.

Shipping
Ships from Turkey with a tracking number. Message us before ordering if you need extra photos or measurements.
```

**Tags** (13 adet, her biri en fazla 20 karakter)

```
silver prayer beads, 925 silver tesbih, sterling tasbih, misbaha, turkish tesbih, islamic gift, muslim gift for him, oxidized silver, crescent and star, worry beads, dhikr beads, eid gift, ramadan gift
```

**Materials:** `sterling silver`

**Price:** Bunu siz belirleyin. Dijital desenler için uygulamadaki trend kartı, üst ilanların ortanca fiyatını gösterir. Türkiye satıcıları için Etsy kesintileri yaklaşık olarak şöyledir: işlem ücreti %6,5, ödeme işleme ücreti %6,5 + 14 TL, düzenleyici işletim ücreti %2,27 ve ilan başına 0,20 USD. Toplam kesinti %15–18 bandına çıkar. Fiyatı belirlemeden önce güncel oranları `https://www.etsy.com/legal/fees/` sayfasından teyit edin.

**Quantity:** `1`

**SKU:** `GXL-GMS-024`

**Shipping profile**

- Origin: Türkiye, posta kodunuz
- Processing time: Ürün elinizdeyse `1-3 business days`. Elinizde değilse gerçek hazırlama süresini yazın.
- Kargo firması ve ücreti: Gerçek PTT veya kargo firması fiyatını girin. Gümüş ürün için takip numaralı gönderi seçin.

**Return policy:** Ne kabul edeceğinizi bilinçli seçin. İade kabul ediyorsanız süreyi ve kargoyu kimin ödeyeceğini belirtin.

Kaynaklar: Etsy ücret ve kural sayfaları (`https://www.etsy.com/legal/fees/`, `https://www.etsy.com/legal/creativity/`, `https://www.etsy.com/legal/prohibited/`). Türkiye ücret oranları üçüncü taraf özetlerinden alınmıştır ve fiyatlamadan önce Etsy'nin kendi sayfasında teyit edilmelidir.
