# Kadınlara yönelik PDF ürünleri: trend, öneri, prompt ve reklam görselleri

Etsy kanalı yalnızca tığ işi desen satmaz. Kadınların en çok satın aldığı dijital PDF türlerini tarar, puanlar, nasıl öne geçileceğini söyler ve ürünü hazırlamak için gereken her şeyi üretir:
- PDF promptu
- sayfa görselleri
- reklam tadında kullanım görselleri
- Pinterest pinleri
- paket fikri
- Etsy ilanı

## 1. Hangi PDF ne kadar ilgi çekiyor?

**Trend → PDF ürünleri** grubu (uygulamada ilk grup) şu türlerde 19 nişi Etsy'nin resmî aramasıyla puanlar:

| Tür | Örnek nişler |
| --- | --- |
| Planlayıcı | printable planner, budget planner, meal planner, habit tracker, cleaning schedule, wedding planner |
| Dijital planlayıcı | digital planner (tablet, hyperlinked PDF) |
| Boyama | adult coloring pages, coloring pages for kids |
| Duvar sanatı | printable wall art |
| Tarif | recipe card printable |
| Parti / oyun | bridal shower games, baby shower games |
| Günlük | self care journal, reading journal |
| Çocuk etkinlik | kids activity pages, homeschool printables |
| Kâğıt işi | junk journal kit, digital paper pack |

Hobi desenleri grubuna da kapitone (quilt) deseni eklendi.

- **İlgi sıralaması:** Taranan nişleri, üst ilanların aylık favori hızına (alıcı ilgisi) göre çubuklarla sıralar. Yanında fırsat puanı görünür. Önce ilgisi yüksek ve puanı 45 üstü olan nişlere girin.
- **Otomatik tarama:** Otopilot bu nişleri de her 30 dakikada bir sırayla tarar, böylece tablo kendiliğinden dolar. PDF aramalarından yeni ifadeler de keşfedilir.
- **Sezon takvimi:** PDF aramaları eklendi (Christmas printables, Easter coloring pages vb.). Üç yeni dönem var:
  - Yeni yıl planlama sezonu (Ocak)
  - Düğün sezonu (Mayıs)
  - Okula dönüş (Ağustos)

## 2. "Ne yaparsam öne geçerim?" önerileri

Her tarama, kendi verisinden öneri üretir. Öneriler trend kartında **Öne geçmek için ne yapmalı?** başlığı altında, önem sırasına göre görünür:

| Öneri | Ne zaman çıkar |
| --- | --- |
| Marka / telif riski | Rakiplerde Disney, Harry Potter, Taylor Swift gibi korunan isimler geçiyorsa |
| Hemen gir | Puan 65 ve üstündeyse |
| Dar ifadeyle gir | Talep yüksek ama rakip çoksa; yükselen alt ifadeleri önerir |
| Yeni mağazaya açık niş / eski ilanlar hâkim | Üst ilanların ne kadarının son 6 ayda açıldığına göre |
| Yükselen özellikleri ilk sen kullan | Son 4 ayda açılıp hızla favori toplayan ilanların etiketleri |
| Bu formatlar artık standart | Rakiplerin yarısından fazlasının sunduğu formatlar (ör. US Letter, A4) |
| Boşluk: … | O türde önemli olup rakiplerin %25'inden azının sunduğu format (A5, düzenlenebilir, tablet, çoklu çerçeve ölçüsü, 12x12 vb.) |
| Paketler satıyor / paket boşluğu | Üst ilanlarda set/bundle oranına göre |
| Daha fazla değer ver | Rakiplerin ortanca sayfa sayısı ve %20 fazlası |
| Fiyat stratejisi | Ortanca fiyat ve yeni mağaza için başlangıç fiyatı |

Kartta ayrıca rakiplerin format kapsamı (ör. "US Letter %17 · A5 %17 · Paket/set %17 · Ortanca 35 sayfa") gösterilir.

**Marka/telif koruması:** Korunan isimler trend etiketlerinde görünse bile otomatik doldurmaya, başlığa, etiketlere ve keşif listesine girmez. Etsy'de ilan kaldırma ve mağaza kapanmasının en sık nedeni budur. Liste `apps/worker/src/ip-guard.ts` içindedir.

## 3. Trendden otomatik doldurma

**Trende gitmeden de çalışır:** Stüdyo'yu açtığınızda, "PDF ürünü / El işi deseni" seçimini değiştirdiğinizde veya bir PDF türüne ya da el işi türüne bastığınızda, sistem o türde önbellekteki en yüksek puanlı aramayı (sabit nişler ve keşfedilen aramalar arasından) kendisi seçer ve alanları doldurur. Son seçilen aramalar atlanır; **Başka arama seç** sıradaki güçlü aramayı getirir.

**Rakipleri geçmek için** kartı:
- **Fiyat:** Rakip ortanca fiyatı; ilk yorumlara kadar %12 altı başlangıç fiyatı (.49/.99 biten) ve set fiyatı (yaklaşık 2,3 katı). Önerilen fiyat yükleme formuna otomatik gelir.
- **İçerik:** Rakiplerin ortanca sayfa sayısı ve bizim sayfa sayımız.
- **Format boşlukları:** Rakiplerin %25'inden azının sunduğu formatlar ürüne otomatik eklenir. Rakiplerin yarısından fazlasının sunduğu "mutlaka olacak" formatlar ayrıca listelenir.
- **Diğer:** Paket boşluğu veya set fırsatı, yükselen özellikler, yeni ilan payı, telif riski.
- **Geçilecek rakipler:** İlk 3 rakip ilan.

Bu plan PDF promptuna da "To outsell the top listings: …" olarak eklenir.

**Renkler:** Trendde renk yoksa trendin stil özelliğine uygun palet seçilir (ör. dark academia → burgundy, forest green, gold; botanical → sage green, terracotta, cream).

**Hedef kitle:** Etiket ve başlıklarda geçen alıcı grubundan (ör. crafters, teachers, busy moms) otomatik doldurulur.

### Trend kartından

PDF kartında **Bu nişte PDF hazırla**'ya basınca Stüdyo **PDF ürünü** modunda açılır ve şu alanları trend verisinden doldurur:
- PDF türü ve ürün (ör. `coloring pages for kids` → `kids coloring pages`, tür: boyama)
- Trend özellikleri: her seferinde o arama için kullanılmamış bir kombinasyon
- Renkler
- Formatlar: türün standart formatları ve rakiplerde geçen ek formatlar
- Sayfa sayısı: rakiplerin ortancasının yaklaşık %20 fazlası; veri yoksa türün tipik değeri

Size kalan tek şey **Prompt, görsel ve ilanı hazırla** düğmesine basmaktır.

## 4. Stüdyonun ürettikleri

1. **Ürün adı:** Trendden bir kelime ile her seferinde yeni türetilen bir sözcükten oluşur. Daha önce verilen adlar tekrar kullanılmaz.
2. **PDF promptu (Claude / ChatGPT):** Türe özel içerik ve baskı kurallarını içerir:
   - **Planlayıcı:** Tarihsiz, Pazartesi ve Pazar başlangıçlı, yazıcı dostu siyah-beyaz sürüm, ciltleme payı.
   - **Dijital planlayıcı:** Tıklanabilir sekmeler, açık/koyu tema, uygulamalara aktarma rehberi.
   - **Boyama:** Kapalı çizgili siyah çizim, tek yüz baskı, renk deneme sayfası.
   - **Duvar sanatı:** Her eser için tüm çerçeveleri karşılayan beş oran dosyası ve ölçü rehberi.
   - **Tarif:** 4x6 ve 5x7 kesim işaretli kartlar, defter sayfaları, ölçü çevirme tablosu.
   - **Parti:** Cevap anahtarlı oyunlar, uyumlu tabela ve etiketler.
   - **Günlük:** En az 40 özgün soru.
   - **Çocuk:** Yaş aralığı, cevap anahtarı, başarı sertifikası.
   - **Kâğıt işi:** 300 dpi, kesintisiz desenler, ephemera.

   Her promptta ayrıca şunlar bulunur:
   - güvenli kenar boşluğu
   - "Nasıl yazdırılır" sayfası
   - teşekkür sayfası
   - lisans sayfası
   - ticari kullanıma uygun fontlar
   - CSS `@page` ile tam ölçülü PDF
   - mockup'ların yapılacağı "Product spec" JSON'u
3. **Sayfa görseli promptları:** Boyama, duvar sanatı ve dijital kâğıt için sayfa başına görsel promptu. Motifler trend özelliklerinden ve etiketlerden gelir.
4. **Reklam tadında 10 görsel:** Her görselde nerede kullanılacağı, ölçüsü ve görsel üstüne yazılacak kısa metin vardır:

   | # | Görsel | Nerede kullanılır | Ölçü |
   | --- | --- | --- | --- |
   | 1 | Kapak | Etsy arama sonucu küçük görseli | 4:3 · 3000x2250 |
   | 2 | Kullanım sahnesi | Etsy galerisi | 4:3 |
   | 3 | Yakın çekim kalite detayı | Etsy galerisi | 4:3 |
   | 4 | Neler var? kolajı | Etsy galerisi | 4:3 |
   | 5 | Ölçü / format kartı | Etsy galerisi | 4:3 |
   | 6 | İkinci kullanım sahnesi | Etsy galerisi | 4:3 |
   | 7 | Renk seçenekleri | Etsy galerisi | 4:3 |
   | 8 | Nasıl çalışır (3 adım) | Etsy galerisi | 4:3 |
   | 9 | Pinterest pini | Pinterest | 2:3 · 1000x1500 |
   | 10 | Instagram / Facebook reklamı | Akış ve hikâye | 1:1 · 1080x1080 (9:16 hikâye) |

   - **Kullanım sahneleri ürüne göre seçilir.** Örneğin bütçe planlayıcı hesap makinesi ve fişlerle masada; yemek planlayıcı buzdolabında; duvar sanatı kanepenin üstünde çerçevede; parti oyunu süslü masada.
   - **Promptlar görselde yazı istemez.** Görsel modelleri yazıyı bozar; görsel üstü yazıyı Canva ile ekleyin.
   - **Gerçek sayfaları referans verin.** Görselleri üretirken bitmiş PDF sayfalarını referans görsel olarak yükleyin; mockup gerçek ürünü göstermelidir.
   - **El işi desenleri de aynı seti alır.** Desen stüdyosunda bitmiş ürün kullanım sahneleri (giyilmiş hırka, pazarda çanta vb.) üretilir.
5. **Pinterest pinleri:** Üç pin. Başlıklar sabit sloganlardan değil, o aramanın alıcı ifadelerinden ve ürünün trend özelliklerinden kurulur. Ürün yüklenince bu metinler saklanır; Etsy ilanı yayına girince satış linkiyle otomatik pinlenir (bkz. [PINTEREST_TR.md](PINTEREST_TR.md)).
6. **Paket fikri:** Trend etiketlerindeki tamamlayıcı ürünlerden bir set ve set fiyatı önerisi.
7. **Kalite kapısı:** Letter ve A4'te %100 test baskısı, yazım denetimi, font lisansı, marka kontrolü ve Etsy dosya sınırları (en fazla 5 dosya, her biri 20 MB).
8. **Etsy ilanı:**
   - Başlık alıcının arama ifadesiyle başlar, ürün adı ve trend ifadeleriyle devam eder, formatlarla biter.
   - 13 etiket önce trendden, sonra ürünün formatları ve renklerinden gelir.
   - Açıklamada "fiziksel ürün gönderilmez" uyarısı, içerik, nasıl çalışır, render ve yapay zekâ bildirimi ile lisans bulunur.

## 5. Yükleme ve Etsy

**Dijital → PDF yükle** formunda "Ürün tipi" olarak PDF türü seçilir. Stüdyodan gelindiğinde tür otomatik seçilidir. Etsy taslağı açılırken her tür için uygun Etsy kategorisi aranır (planlayıcı → Calendars & Planners, duvar sanatı → Digital Prints, parti → Party Games vb.). Kategori bulunamazsa Etsy'de seçmeniz istenir.

## API uçları

- `POST /api/patterns/seed`: Arama bir PDF ürünüyse `studio: "printable"`, `kind`, `formats` ve `pageCount` döner.
- `POST /api/printables/plan`: `{ kind, productType, keyword?, referenceNotes?, trendFeatures?, trendTags?, colors?, formats?, pageCount?, audience? }` ile brif (PDF promptu, görsel promptları, reklam görselleri, pinler, paket, kalite kapısı) ve Etsy ilanı döner.
- `POST /api/etsy/trends/scan` yanıtındaki yeni alanlar:
  - `signals`: formatlar, paket oranı, ortanca sayfa, marka riskleri
  - `advice`: öneriler
  - `kind`: PDF türü
